"""Radar frames from the KNMI Open Data API (HDF5), kept as integer grids in MongoDB (collection radar_grids).

Three sets, all on the same 765 x 700 grid of 1 km (stereographic, the same grid for all three):

    precip   radar_forecast 2.0         the +0 frame (the observation) of every 5-minute run, mm per 5 minutes exactly as the file has
                                        it (uint16, steps of 0.01 mm, nothing rounded or clipped)
    echotop  radar_echotopheight_5min   height of the top of the echo in km, the codes as the file has them (0.1 km)
    hail     radar_hail_warning_5min    probability of hail in %, the codes as the file has them (0.4 %)

Two jobs, one thread (radar_loop):
    live pass   every check_seconds: lists the files of the last hours, fetches the ones that are new or changed at the source.
    back-fill   fills the keep window, newest day first. echotop and hail from the daily tar archives (one request a day, the
                archive of a day exists from 01:15 UTC the next day), precip file by file. A day is marked done in radar_grid_days once
                it can no longer grow, so a restart does not look at it again.
Everything is an upsert keyed on (set, ts), and a frame that is stored and unchanged is not written again. All calls to the API
go through one budget (max_requests_per_hour, the key is shared with HARMONIE and, on the dev PC, with production); the live
pass may use all of it, the back-fill leaves `reserve` calls for it.
"""
import io
import logging
import re
import tarfile
import threading
import time
import zlib
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import h5py
import numpy as np
from bson import Binary

from . import quota
from .sources.base import http_get

log = logging.getLogger('maps.radar')

API = 'https://api.dataplatform.knmi.nl/open-data/v1/datasets'
STEP = timedelta(minutes=5)
SHAPE = (765, 700)
LIVE_HOURS = 6                      # the live pass looks at this many hours back; older gaps are the back-fill's job
RECENT_RECHECK_S = 3600             # today and yesterday are looked at again this often (they are still growing)
CHUNK = 12                          # files per batch in the back-fill, so the live pass is never kept waiting for long

SETS = {
    'precip': {'dataset': 'radar_forecast', 'version': '2.0', 'prefix': 'RAD_NL25_RAC_FM_', 'tar': None, 'units': 'mm/5min'},
    'echotop': {'dataset': 'radar_echotopheight_5min', 'version': '1.0', 'prefix': 'RAD_NL25_ETH_NA_',
                'tar': ('radar_tar_echotopheight_5min', 'TARETH'), 'units': 'km'},
    'hail': {'dataset': 'radar_hail_warning_5min', 'version': '1.0', 'prefix': 'RAD_NL25_HAW_NA_',
             'tar': ('radar_tar_hail_warning_5min', 'TARHAW'), 'units': 'percent'},
}
FILE_TS = re.compile(r'_(\d{12})\.h5$')


class Stopping(Exception):
    """The service is shutting down."""


def stamp(ts):
    return ts.strftime('%Y%m%d%H%M')


def parse_modified(text):
    """'2026-10-30T07:47:05+00:00' -> naive UTC datetime (None if there is none)."""
    if not text:
        return None
    return datetime.fromisoformat(text).astimezone(timezone.utc).replace(tzinfo=None)


class QuotaExceeded(Exception):
    """The API quota is used up (our own budget, or the API said so: HTTP 403 'Quota exceeded' / 429). `wait` = seconds until
    it is worth trying again."""

    def __init__(self, message, wait):
        super().__init__(message)
        self.wait = wait


class Budget:
    """Keeps this service inside the quota of the Open Data API key. The key is shared (HARMONIE here, production when this
    runs on the dev PC, other tests), so our own count of calls is not enough: the API tells in every answer how many calls
    are left in the window (X-Ratelimit-Remaining / -Reset) and the back-fill stops while that is at or below `reserve` (the live
    pass while it is at or below `live_floor`, so the key is never emptied completely). A second process on the same key (the dev PC
    filling more days) sets `reserve` high, e.g. 700: it then only uses what the production service leaves over and waits by itself
    while production is back-filling.
    Own limit: at most `limit` calls an hour, the back-fill `own_reserve` less (by default the same number as `reserve`; a second process
    without a live pass sets `own_reserve = 0`, so `reserve` is only the number that has to be left over in the API window). When the quota is used up the API answers HTTP 403
    'Quota exceeded' and everything waits until the window resets. `block`: wait for a free slot (manual runs) instead of
    raising QuotaExceeded (the thread has to get back to its live pass)."""

    def __init__(self, limit, reserve, stop, live_floor=25, own_reserve=None):
        self.limit, self.reserve, self.stop, self.live_floor = limit, reserve, stop, live_floor
        self.own_reserve = reserve if own_reserve is None else own_reserve       # of OUR hourly limit, what the back-fill leaves to the live pass
        self.times = deque()
        self.lock = threading.Lock()
        self.remaining = None
        self.reset = None
        self.blocked_until = 0.0
        self.block = False

    def observe(self, r):
        """Called with every answer of the API."""
        quota.update(r.headers)
        rem, rst = r.headers.get('X-Ratelimit-Remaining'), r.headers.get('X-Ratelimit-Reset')
        if rem is not None:
            self.remaining = int(rem)
        if rst:
            self.reset = float(rst)
        if r.status_code == 429 or (r.status_code == 403 and 'quota' in r.text.lower()):
            now = time.time()
            self.blocked_until = self.reset if self.reset and self.reset > now else now + 900
            raise QuotaExceeded(f'Open Data API quota exceeded (HTTP {r.status_code}), resets in {self.blocked_until - now:.0f} s',
                                self.blocked_until - now)

    def acquire(self, live):
        allowed = self.limit if live else max(1, self.limit - self.own_reserve)
        while True:
            with self.lock:
                now = time.time()
                while self.times and now - self.times[0] > 3600:
                    self.times.popleft()
                if now < self.blocked_until:
                    wait, why = self.blocked_until - now, 'the API quota is used up'
                elif live and self.remaining is not None and self.reset and now < self.reset and self.remaining <= self.live_floor:
                    wait, why = self.reset - now, f'only {self.remaining} calls left in the API window, the last ones are kept for the other users of the key'
                elif not live and self.remaining is not None and self.reset and now < self.reset and self.remaining <= self.reserve:
                    wait, why = self.reset - now, f'{self.remaining} calls left in the API window, kept for the live pass'
                elif len(self.times) >= allowed:
                    wait, why = self.times[0] + 3600 - now, f'{allowed} calls an hour used'
                else:
                    self.times.append(now)
                    return
            if not self.block:
                raise QuotaExceeded(f'no API calls available: {why}', wait)
            if self.stop.wait(min(60.0, max(1.0, wait))):
                raise Stopping()


class Radar:
    def __init__(self, key, store, stop, keep_days=30, max_per_hour=600, reserve=150, workers=2,
                 sets=None, from_day=None, live=True, live_floor=25, own_reserve=None):
        self.key = key
        self.live = live                                 # False: back-fill only (a second process on the shared key)
        self.store = store
        self.stop = stop
        self.workers = max(1, workers)
        self.sets = [s for s in (sets or SETS) if s in SETS]
        self.budget = Budget(max_per_hour, reserve, stop, live_floor, own_reserve)
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        if from_day:                                     # a manual back-fill further back widens the keep window
            keep_days = max(keep_days, (today - from_day).days + 1)
        self.keep_days = keep_days
        self.first_day = from_day                        # a manual back-fill starts the window here instead of keep_days back
        self.done = set()                              # (set, day) that were completed in an earlier round
        for d in store.days.find({}, {'set': 1, 'day': 1}):
            self.done.add((d['set'], d['day']))
        self.recent = {}                                 # (set, day) -> time of the last look at today / yesterday
        self.last_prune = 0.0

    # ---- API ---------------------------------------------------------------------------------------------------------

    def _get(self, url, live):
        self.budget.acquire(live)
        try:
            r = http_get(url, headers={'Authorization': self.key}, timeout=60)
        except RuntimeError as e:                        # http_get gave up on repeated 429s
            if '429' in str(e):
                self.budget.blocked_until = time.time() + 900
                raise QuotaExceeded('Open Data API: HTTP 429 again and again', 900)
            raise
        self.budget.observe(r)
        return r

    def _list(self, set_name, start, end, live):
        """{ts: (file name, lastModified)} of the files of a set with start <= ts < end."""
        cfg = SETS[set_name]
        base = f"{API}/{cfg['dataset']}/versions/{cfg['version']}/files"
        after = cfg['prefix'] + stamp(start)
        out = {}
        while True:
            r = self._get(f'{base}?{urlencode({"maxKeys": 1000, "startAfterFilename": after})}', live)
            if r.status_code != 200:
                raise RuntimeError(f'{cfg["dataset"]} file list: HTTP {r.status_code}')
            j = r.json()
            files = j.get('files', [])
            for f in files:
                m = FILE_TS.search(f['filename'])
                if not m or not f['filename'].startswith(cfg['prefix']):
                    continue
                ts = datetime.strptime(m.group(1), '%Y%m%d%H%M')
                if ts >= end:
                    return out
                out[ts] = (f['filename'], parse_modified(f.get('lastModified')))
            if not j.get('isTruncated') or not files:
                return out
            after = files[-1]['filename']

    def _download(self, dataset, version, filename, live):
        """The bytes of one file, through the temporary download URL (None when the file does not exist)."""
        r = self._get(f'{API}/{dataset}/versions/{version}/files/{filename}/url', live)
        if r.status_code == 404:
            return None
        if r.status_code != 200:
            raise RuntimeError(f'{dataset} download url of {filename}: HTTP {r.status_code}')
        d = http_get(r.json()['temporaryDownloadUrl'], timeout=300)
        if d.status_code != 200:
            raise RuntimeError(f'{dataset} download of {filename}: HTTP {d.status_code}')
        return d.content

    # ---- conversion --------------------------------------------------------------------------------------------------

    def encode(self, set_name, blob):
        """HDF5 bytes -> (codes as little-endian uint16 (precip) or uint8, scale, offset, nodata codes)."""
        with h5py.File(io.BytesIO(blob), 'r') as h:
            a = h['image1/image_data'][...]
            cal = h['image1/calibration'].attrs.get('calibration_formulas')
        if a.shape != SHAPE:
            raise ValueError(f'unexpected grid {a.shape}, expected {SHAPE}')
        if set_name == 'precip':
            return a.astype('<u2'), 0.01, 0.0, [65534, 65535]      # 0.01 mm per 5 minutes per unit; 65534 missing, 65535 outside the image
        text = cal.decode() if isinstance(cal, bytes) else str(cal)
        m = re.search(r'=\s*([-+0-9.eE]+)\s*\*\s*PV\s*\+\s*([-+0-9.eE]+)', text)
        if not m:
            raise ValueError(f'calibration not understood: {text!r}')
        return a.astype(np.uint8), float(m.group(1)), float(m.group(2)), [0, 255]

    def make_doc(self, set_name, ts, src, modified, blob):
        codes, scale, offset, nodata = self.encode(set_name, blob)
        doc = {'set': set_name, 'ts': ts, 'src': src, 'srcModified': modified, 'fetchedAt': datetime.utcnow(),
               'rows': SHAPE[0], 'cols': SHAPE[1], 'dtype': codes.dtype.name, 'enc': 'zlib', 'scale': scale, 'offset': offset,
               'nodata': nodata, 'units': SETS[set_name]['units'], 'data': Binary(zlib.compress(codes.tobytes(), 6))}
        return doc

    def make_forecast_docs(self, run_ts, blob):
        """The forecast steps of a precipitation file (image2 ... image25 = +5 ... +120 minutes; image1 is the observation)."""
        docs, now = [], datetime.utcnow()
        with h5py.File(io.BytesIO(blob), 'r') as h:
            n_images = int(np.asarray(h['overview'].attrs.get('number_image_groups', [1])).ravel()[0])
            for step in range(1, n_images):
                a = h[f'image{step + 1}/image_data'][...]
                if a.shape != SHAPE:
                    continue
                docs.append({'set': 'precip', 'run': run_ts, 'step': step, 'ts': run_ts + STEP * step, 'fetchedAt': now,
                             'rows': SHAPE[0], 'cols': SHAPE[1], 'dtype': 'uint16', 'enc': 'zlib', 'scale': 0.01, 'offset': 0.0,
                             'nodata': [65534, 65535], 'units': SETS['precip']['units'],
                             'data': Binary(zlib.compress(a.astype('<u2').tobytes(), 6))})
        return docs

    # ---- fetching ----------------------------------------------------------------------------------------------------

    def _fetch_files(self, set_name, todo, live):
        """todo: [(ts, file name, lastModified)]. Fetches and upserts them. Returns (written, failed)."""
        cfg = SETS[set_name]
        # the same file also holds the forecast: keep it for the newest run of the live pass (no extra call to the API)
        forecast_ts = max(i[0] for i in todo) if live and set_name == 'precip' and todo else None

        def one(item):
            ts, fn, modified = item
            blob = self._download(cfg['dataset'], cfg['version'], fn, live)
            if blob is None:
                raise RuntimeError(f'{fn} is listed but cannot be downloaded')
            fc = None
            if ts == forecast_ts:
                try:
                    fc = self.make_forecast_docs(ts, blob)
                except Exception as e:                       # the observation must not be lost over the forecast
                    log.warning('radar precip forecast of %s: %s', ts.strftime('%Y-%m-%d %H:%M'), e)
            return self.make_doc(set_name, ts, fn, modified, blob), fc

        docs, forecast, failed = [], None, 0
        with ThreadPoolExecutor(self.workers) as ex:
            for item, fut in [(i, ex.submit(one, i)) for i in todo]:
                try:
                    doc, fc = fut.result()
                    docs.append(doc)
                    if fc:
                        forecast = fc
                except (Stopping, QuotaExceeded):
                    raise
                except Exception as e:
                    failed += 1
                    log.warning('radar %s %s: %s', set_name, item[0].strftime('%Y-%m-%d %H:%M'), e)
        written = self.store.upsert_many(docs)
        if forecast:
            self.store.replace_forecast(forecast)
        return written, failed

    @staticmethod
    def _needs_fetch(listed, stored):
        """New at the source, or changed there since we stored it (a frame that came from a tar has no srcModified and
        is never refetched on a date alone)."""
        out = []
        for ts, (fn, modified) in sorted(listed.items()):
            if ts not in stored:
                out.append((ts, fn, modified))
            elif stored[ts] is not None and modified is not None and modified > stored[ts]:
                out.append((ts, fn, modified))
        return out

    def live_pass(self):
        """The last LIVE_HOURS of every set. Returns a short text."""
        if not self.live:
            return 'off'
        now = datetime.utcnow()
        start = (now - timedelta(hours=LIVE_HOURS)).replace(second=0, microsecond=0)
        start -= timedelta(minutes=start.minute % 5)
        end = now + STEP
        parts = []
        for s in self.sets:
            listed = self._list(s, start, end, True)
            todo = self._needs_fetch(listed, self.store.stored(s, start, end))
            written, failed = self._fetch_files(s, todo, True) if todo else (0, 0)
            parts.append(f'{s} +{written}' + (f' ({failed} failed)' if failed else ''))
            if failed:
                raise RuntimeError(f'live pass: {s}: {failed} of {len(todo)} files failed')
        return ', '.join(parts)

    # ---- back-fill ---------------------------------------------------------------------------------------------------

    def _day_files(self, set_name, day, deadline):
        """Per-file path for one day. Returns (written, complete)."""
        end = day + timedelta(days=1)
        listed = self._list(set_name, day, end, False)
        todo = self._needs_fetch(listed, self.store.stored(set_name, day, end))
        written = 0
        for i in range(0, len(todo), CHUNK):
            if deadline and time.time() > deadline:
                return written, False
            w, failed = self._fetch_files(set_name, todo[i:i + CHUNK], False)
            written += w
            if failed:
                raise RuntimeError(f'{set_name} {day:%Y-%m-%d}: {failed} files failed')
        return written, True

    def _day_tar(self, set_name, day):
        """The daily tar archive of a day. Returns the number of frames written, or None when the archive does not exist."""
        dataset, code = SETS[set_name]['tar']
        name = f'RAD25_OPER_R___{code}__L2__{day:%Y%m%d}T000000_{day + timedelta(days=1):%Y%m%d}T000000_0001.tar'
        blob = self._download(dataset, '1.0', name, False)
        if blob is None:
            return None
        end = day + timedelta(days=1)
        stored = self.store.stored(set_name, day, end)
        docs, written = [], 0
        with tarfile.open(fileobj=io.BytesIO(blob), mode='r:') as tf:
            for member in tf:
                m = FILE_TS.search(member.name)
                if not m or not member.isfile():
                    continue
                ts = datetime.strptime(m.group(1), '%Y%m%d%H%M')
                if ts in stored:
                    continue
                docs.append(self.make_doc(set_name, ts, member.name, None, tf.extractfile(member).read()))
                if len(docs) >= 50:
                    written += self.store.upsert_many(docs)
                    docs = []
        return written + self.store.upsert_many(docs)

    def backfill_step(self, deadline=None):
        """Does the next piece of back-fill work. Returns a text, or None when the whole keep window is complete."""
        now = datetime.utcnow()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        first = self.first_day or today - timedelta(days=self.keep_days)
        day = today
        while day >= first:
            for s in self.sets:
                if (s, day) in self.done:
                    continue
                recent = now < day + timedelta(days=1, hours=2)      # the day can still grow, its tar archive (01:15) is not there yet
                if recent and time.time() - self.recent.get((s, day), 0) < RECENT_RECHECK_S:
                    continue
                via, written, complete = 'files', 0, True
                if not recent and SETS[s]['tar']:
                    n = self._day_tar(s, day)
                    if n is not None:
                        via, written = 'tar', n
                if via == 'files':
                    written, complete = self._day_files(s, day, deadline)
                if recent:
                    if complete:
                        self.recent[(s, day)] = time.time()
                elif complete:
                    self.store.mark_day(s, day, self.store.frames.count_documents({'set': s, 'ts': {'$gte': day, '$lt': day + timedelta(days=1)}}),
                                        via, datetime.utcnow())
                    self.done.add((s, day))
                return f'{s} {day:%Y-%m-%d} {via} +{written}' + ('' if complete else ' (to be continued)')
            day -= timedelta(days=1)
        return None

    def prune_if_due(self):
        if time.time() - self.last_prune < 3600:
            return
        self.last_prune = time.time()
        self.store.prune(self.cutoff())

    def cutoff(self):
        """Frames before this (UTC midnight, keep_days back) are removed: the same start as the back-fill window."""
        return datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=self.keep_days)

    def run_once(self):
        """One live pass, then the whole back-fill (tests and manual back-fills)."""
        self.budget.block = True                         # a manual run waits for a free slot, but stops when the API says no
        try:
            parts = [self.live_pass()]
            while not self.stop.is_set():
                text = self.backfill_step()
                if text is None:
                    break
                log.info('radar back-fill: %s', text)
        except QuotaExceeded as e:
            return f'radar stopped: {e}; run it again later, what is stored stays'
        self.store.prune(self.cutoff())
        return 'radar: ' + ', '.join(parts)


def radar_loop(radar, stop, check_s, alert_after, ntfy, status=None):
    """The thread that keeps the radar sets current: a live pass every check_s, the back-fill in the time between. `status` is the
    server-tasks row (radar-maps-sync): three writes per cycle, never one per frame. Nothing in here may stop the other sources of
    the container: every failure is caught and logged, and the loop goes on."""
    fails = 0
    resume_at = 0.0                                      # the back-fill waits until then (quota); the live pass never does
    log.info('radar: %s, keep %d days, live pass every %d s, at most %d API calls an hour', radar.sets, radar.keep_days,
             check_s, radar.budget.limit)
    while not stop.is_set():
        due = time.time() + check_s
        n = len(radar.sets)
        live, back = '', ''
        try:
            if status:
                status.start(n)
            try:
                live = radar.live_pass()
                fails = 0
                log.info('radar live: %s', live)
            except Stopping:
                break
            except QuotaExceeded as e:
                fails += 1
                live = f'quota: {e}'
                log.warning('radar live pass: %s (%d in a row)', e, fails)
                if fails >= alert_after:
                    ntfy.send('weather-maps-radar', f'weather-maps radar: live pass failed {fails} rounds in a row: {e}')
            except Exception as e:
                fails += 1
                live = f'ERROR {e}'
                log.exception('radar live pass failed (%d in a row)', fails)
                if fails >= alert_after:
                    ntfy.send('weather-maps-radar', f'weather-maps radar: live pass failed {fails} rounds in a row: {e}')
            if status:
                status.progress(n, n, f'live: {live}')
            stopping = False
            while not stop.is_set() and time.time() < due:
                if time.time() < resume_at:
                    back = back or f'paused for {resume_at - time.time():.0f} s'
                    break
                try:
                    text = radar.backfill_step(deadline=due)
                except Stopping:
                    stopping = True
                    break
                except QuotaExceeded as e:               # quota or own budget used up: the live pass goes on, the back-fill waits
                    log.info('radar back-fill paused: %s', e)
                    back, resume_at = f'paused ({e})', time.time() + min(max(e.wait, 60), 900)
                    break
                except Exception as e:                   # a missing file or a failed download: try again later
                    log.warning('radar back-fill: %s', e)
                    back, resume_at = f'ERROR {e}', time.time() + 300
                    break
                if text is None:
                    back = 'complete'
                    break
                back = text
                log.info('radar back-fill: %s', text)
            if stopping:
                break
            radar.prune_if_due()
            quota.warn(ntfy)
            if status:
                parts = [f'live: {live}'] + ([f'back-fill: {back}'] if back else []) + ([quota.text()] if quota.text() else [])
                status.finish('error' if fails >= alert_after else 'success', ' | '.join(parts))
        except Exception:                                # a bug or a MongoDB hiccup in this cycle: log it, try again next cycle
            log.exception('radar cycle failed')
        stop.wait(max(due - time.time(), 0))
    if status:
        status.stopped()
