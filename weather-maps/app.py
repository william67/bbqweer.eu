"""weather-maps: keeps the newest runs of ECMWF, ICON-EU, GFS and HARMONIE as grids in MongoDB for the weather chart
page (docs/weather-charts.md). Every check_seconds it asks each source for its newest complete run; a run that is not
stored yet is downloaded (only the fields we need), written as one document per step and parameter, and only then added
to the complete runs (the newest keep_runs are kept). A stored run that lacks a parameter the source delivers now (a
parameter was added to the code) is filled up with just that parameter.

    python app.py                      run forever (the container)
    python app.py --once               one round, then exit (tests)
    python app.py --sources ecmwf,gfs  only these sources
    python app.py --once --sources icon-eu --runs 2026102303,2026102306   fetch exactly these runs (tests, back-filling)
    python app.py --once --runs 2026102306 --params gust                  add only these parameters to stored runs
"""
import argparse
import logging
import signal
import sys
import threading
import time
from datetime import datetime

from maps import config as cfgmod
from maps import grid
from maps.db import TaskStatus
from maps.ntfy import Ntfy
from maps.sources.ecmwf import Ecmwf
from maps.sources.gfs import Gfs
from maps.sources.harmonie import Harmonie
from maps.sources.icon_eu import IconEu
from maps.store import Store

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s', stream=sys.stdout)
log = logging.getLogger('maps')

# precip accumulates since the run start; gust: ECMWF the maximum since the previous output step, ICON-EU and HARMONIE the
# maximum of the last hour, GFS the gust at that step; prate (GFS and ECMWF only) is the precipitation rate at that step: the
# totals of those two are packed too coarsely (GFS steps of 0.0625 mm, ECMWF 0.12 mm), so an hourly difference is blocky
UNITS = {'msl': 'hPa', 't2m': '°C', 'u10': 'm/s', 'v10': 'm/s', 'precip': 'mm', 'gust': 'm/s', 'prate': 'mm/h', 'ptype': 'klasse', 'snow': 'mm'}
FILL_RETRY_S = 6 * 3600                  # a run that cannot be filled up (gone from the source) is tried again after this


def build_sources(cfg, names):
    workers = int(cfgmod.get(cfg, 'maps', 'workers', '4'))
    out = []
    for n in names:
        if n == 'ecmwf':
            out.append(Ecmwf(workers))
        elif n == 'icon-eu':
            out.append(IconEu(workers))
        elif n == 'gfs':
            out.append(Gfs(workers))
        elif n == 'harmonie':
            key = cfgmod.get(cfg, 'knmi', 'open_data_key')
            if not key:
                log.error('harmonie needs [knmi] open_data_key, source skipped')
                continue
            out.append(Harmonie(key, int(cfgmod.get(cfg, 'maps', 'harmonie_run_every_hours', '3'))))
        else:
            log.error('unknown source %s', n)
    # [maps] skip_grids drops grids (light set: 0.125,0.029)
    skip = {g.strip() for g in cfgmod.get(cfg, 'maps', 'skip_grids', '').split(',') if g.strip()}
    for s in out:
        s.grids = {g: st for g, st in s.grids.items() if g not in skip}
    return out


def write_run(src, store, box, keep, run, only=None, steps=None):
    """Download the fields of a run (only the parameters in `only` and the forecast steps in `steps`, None = all), store
    them and add them to the run in weather_grid_runs (merged with what that run has already). Returns (fields, steps,
    seconds)."""
    t0 = time.time()
    done_steps, params, n = set(), set(), 0
    for step, param, msg, mult, add in src.messages(run, only, steps):
        lats, lons, vals = msg if isinstance(msg, tuple) else grid.read_field(msg)     # HARMONIE delivers the gust ready made
        vals = vals * mult + add
        for grid_id, stride in src.grids.items():
            la, lo, v = grid.cut(lats, lons, vals, box if src.use_box else None, stride)
            store.put({'model': src.model, 'grid': grid_id, 'run': run, 'step': step, 'param': param,
                       'units': UNITS[param], **grid.pack(la, lo, v)})
        done_steps.add(step)
        params.add(param)
        n += 1
        if n % 50 == 0:
            log.info('%s: %d fields stored (%.0f s)', src.model, n, time.time() - t0)
    if not done_steps:
        raise RuntimeError('the run delivered no fields')
    meta = {'fetchedAt': datetime.utcnow(), 'seconds': round(time.time() - t0, 1), 'fields': n}
    for grid_id in src.grids:
        store.finish_run(src.model, grid_id, run, done_steps, params, meta, keep)
    return n, len(done_steps), time.time() - t0


def sync_source(src, store, box, keep, run=None):
    """Returns a short status text. Raises on a failure; a run only counts as stored when the whole run was written.
    run=None: the newest complete run of the source, if it is not stored yet."""
    if run is None:
        run = src.latest_run()
        if run is None:
            return 'no complete run found'
    if store.has_run(src.model, next(iter(src.grids)), run):
        return f'run {run:%Y%m%d%H} is stored'
    log.info('%s: run %s is not stored yet, downloading', src.model, f'{run:%Y%m%d%H}')
    n, n_steps, secs = write_run(src, store, box, keep, run)
    return f'run {run:%Y%m%d%H} stored: {n} fields, {n_steps} steps in {secs:.0f} s'


def fill_gaps(src, store, box, keep, failed, only=None, runs=None):
    """Stored runs that lack parameters the source delivers now get just those parameters (upsert: the documents are
    keyed on model, grid, run, step and parameter, so nothing else is touched). `only` limits it to these parameters,
    `runs` to these runs. A run that cannot be filled up (it is gone from the source) is skipped for FILL_RETRY_S.
    Returns a status text or ''."""
    wanted = set(only) if only else set(src.param_names())
    done = []
    for r in store.runs_of(src.model, next(iter(src.grids))):
        if runs and r['run'] not in runs:
            continue
        missing = wanted - set(r['params'])
        key = (src.model, r['run'])
        if not missing or time.time() - failed.get(key, 0) < FILL_RETRY_S:
            continue
        log.info('%s: run %s lacks %s, filling up', src.model, f"{r['run']:%Y%m%d%H}", sorted(missing))
        try:
            n, _steps, secs = write_run(src, store, box, keep, r['run'], missing, set(r['steps']))     # only the steps the run has
            done.append(f"run {r['run']:%d%H} +{'/'.join(sorted(missing))} ({n} fields, {secs:.0f} s)")
            failed.pop(key, None)
        except Exception as e:                       # an old run may be gone from the source: not an error of the sync
            failed[key] = time.time()
            log.warning('%s: run %s cannot be filled up: %s', src.model, f"{r['run']:%Y%m%d%H}", e)
    return 'filled ' + ', '.join(done) if done else ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--once', action='store_true')
    ap.add_argument('--sources')
    ap.add_argument('--config', default='config.ini')
    ap.add_argument('--runs', help='comma separated runs (yyyymmddhh) to fetch instead of the newest one')
    ap.add_argument('--params', help='comma separated parameters to add to stored runs (only these are fetched)')
    args = ap.parse_args()

    cfg = cfgmod.load(args.config)
    store = Store(cfg)
    status = TaskStatus(cfg)
    ntfy = Ntfy(cfg)
    names = [s.strip() for s in (args.sources or cfgmod.get(cfg, 'maps', 'sources', 'ecmwf,icon-eu,gfs,harmonie')).split(',') if s.strip()]
    sources = build_sources(cfg, names)
    box = cfgmod.box(cfg)
    check_s = int(cfgmod.get(cfg, 'maps', 'check_seconds', '600'))
    alert_after = int(cfgmod.get(cfg, 'maps', 'alert_after_failures', '3'))
    keep = int(cfgmod.get(cfg, 'maps', 'keep_runs', '4'))
    forced = [datetime.strptime(r.strip(), '%Y%m%d%H') for r in args.runs.split(',')] if args.runs else [None]
    only = {p.strip() for p in args.params.split(',') if p.strip()} if args.params else None
    failures = {s.model: 0 for s in sources}
    fill_failed = {}
    stop = threading.Event()

    def shutdown(signum, _frame):
        log.info('signal %s received, stopping after the current step', signum)
        stop.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    log.info('sources: %s, box %s, keep %d runs per model, check every %d s', [s.model for s in sources], box, keep, check_s)

    while not stop.is_set():
        parts, ok, done = [], 0, 0
        status.start(len(sources))                   # one status entry per round, like the other tasks
        for src in sources:
            if stop.is_set():
                break
            try:
                if only:                                         # manual: add these parameters to the stored (given) runs
                    text = fill_gaps(src, store, box, keep, {}, only, set(r for r in forced if r)) or 'nothing to add'
                else:
                    text = ' / '.join(sync_source(src, store, box, keep, r) for r in forced)
                    filled = fill_gaps(src, store, box, keep, fill_failed)       # parameters that were added to the code
                    text = f'{text} | {filled}' if filled else text
                failures[src.model] = 0
                ok += 1
            except Exception as e:
                failures[src.model] += 1
                text = f'ERROR {e}'
                log.exception('%s failed (%d in a row)', src.model, failures[src.model])
                status.error()
                if failures[src.model] >= alert_after:
                    ntfy.send(f'weather-maps-{src.model}', f'weather-maps-sync: {src.model} failed {failures[src.model]} rounds in a row: {e}')
            parts.append(f'{src.model}: {text}')
            log.info('%s: %s', src.model, text)
            done += 1
            status.progress(done, len(sources), ' | '.join(parts))
        if stop.is_set() and done < len(sources):
            status.stopped()
            break
        status.finish('success' if ok == len(sources) else 'error', ' | '.join(parts))
        if args.once:
            break
        stop.wait(check_s)


if __name__ == '__main__':
    main()
