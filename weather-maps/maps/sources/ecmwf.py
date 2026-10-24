import json
import threading
from datetime import datetime, timedelta

from .base import Source, http_get, head_ok, iter_tasks, only_params

BASE = 'https://data.ecmwf.int/forecasts'

# ECMWF short name -> (our name, mult, add)
PARAMS = {
    'msl': ('msl', 0.01, 0.0),          # Pa -> hPa
    '10u': ('u10', 1.0, 0.0),           # m/s
    '10v': ('v10', 1.0, 0.0),
    '2t': ('t2m', 1.0, -273.15),        # K -> degrees C
    'tp': ('precip', 1000.0, 0.0),      # m accumulated since the start of the run -> mm
    'tprate': ('prate', 3600.0, 0.0),   # kg/m2/s -> mm/h, the rate at that step; finer than a difference of two tp totals (0.12 mm steps)
    '10fg': ('gust', 1.0, 0.0),        # m/s, the maximum 10 m gust since the previous output step (3 h, 6 h after +144 h);
                                        # steps 93-144 carry it as 10fg3 (the maximum of the last 3 hours), see _field()
}


class Ecmwf(Source):
    """ECMWF open data, IFS HRES 0.25 degrees, global files cut to the Europe box. Only the five fields are read, with
    HTTP range requests from the byte offsets in the .index file (one whole step file is about 100 MB)."""
    model = 'ecmwf'
    grids = {'0.25': 1}

    def __init__(self, workers=4):
        self.workers = workers
        self._idx = {}
        self._lock = threading.Lock()

    @staticmethod
    def steps(run):
        s = list(range(0, 145, 3))
        if run.hour in (0, 12):                 # the 00z and 12z runs go on to 360 h every 6 h, 06z and 18z stop at 144 h
            s += list(range(150, 361, 6))
        return s

    @staticmethod
    def _stem(run, step):
        d, hh = run.strftime('%Y%m%d'), run.strftime('%H')
        return f'{BASE}/{d}/{hh}z/ifs/0p25/oper/{d}{hh}0000-{step}h-oper-fc'

    def latest_run(self):
        now = datetime.utcnow()
        days = [now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=n) for n in (0, 1)]
        runs = sorted((d + timedelta(hours=h) for d in days for h in (0, 6, 12, 18)), reverse=True)
        for run in runs:
            if run > now:
                continue
            if head_ok(self._stem(run, self.steps(run)[-1]) + '.index'):   # the whole run is uploaded at once
                return run
        return None

    def _index(self, run, step):
        with self._lock:
            if (run, step) in self._idx:
                return self._idx[(run, step)]
        text = http_get(self._stem(run, step) + '.index').text
        idx = [json.loads(line) for line in text.splitlines() if line.strip()]
        with self._lock:
            self._idx[(run, step)] = idx
        return idx

    def _field(self, run, step, short):
        want = '10fg3' if short == '10fg' and 90 < step <= 144 else short     # the gust is called 10fg3 for steps 93-144
        for e in self._index(run, step):
            if e.get('param') == want and e.get('levtype') == 'sfc':
                rng = f"bytes={e['_offset']}-{e['_offset'] + e['_length'] - 1}"
                r = http_get(self._stem(run, step) + '.grib2', headers={'Range': rng})
                if r.status_code not in (200, 206):
                    raise RuntimeError(f'ECMWF {short} step {step}: HTTP {r.status_code}')
                return r.content
        if short in ('tp', 'tprate', '10fg') and step == 0:   # accumulated precipitation and the gust since the previous step do not exist at step 0
            return None
        raise RuntimeError(f'ECMWF {short} not in the index of step {step}')

    def param_names(self):
        return [v[0] for v in PARAMS.values()]

    def messages(self, run, only=None, steps=None):
        tasks = [(step, PARAMS[short][0], (lambda s=step, k=short: self._field(run, s, k)), PARAMS[short][1], PARAMS[short][2])
                 for step in self.steps(run) for short in PARAMS]
        yield from iter_tasks(only_params(tasks, only, steps), self.workers)
