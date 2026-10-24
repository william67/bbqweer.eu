import threading
from datetime import datetime, timedelta

from .base import Source, http_get, head_ok, iter_tasks, only_params

BASE = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'

# (variable, level text in the .idx) -> (our name, mult, add)
PARAMS = {
    ('PRMSL', 'mean sea level'): ('msl', 0.01, 0.0),
    ('UGRD', '10 m above ground'): ('u10', 1.0, 0.0),
    ('VGRD', '10 m above ground'): ('v10', 1.0, 0.0),
    ('TMP', '2 m above ground'): ('t2m', 1.0, -273.15),
    ('APCP', 'surface'): ('precip', 1.0, 0.0),       # kg/m2 = mm, accumulated since the start of the run
    ('GUST', 'surface'): ('gust', 1.0, 0.0),         # m/s, the gust at that step (not a maximum over the interval)
    ('PRATE', 'surface'): ('prate', 3600.0, 0.0),    # kg/m2/s -> mm/h, the rate at that step; ~20x finer than a difference of two APCP totals
}
LAST_STEP = 384


class Gfs(Source):
    """NOAA GFS 0.25 degrees from the AWS open data bucket (kept for months). The files are 500+ MB per step, so
    only the five fields are fetched with range requests from the .idx. Every step GFS has: hourly to +120 h, then
    3-hourly to +384 h (209 steps)."""
    model = 'gfs'
    grids = {'0.25': 1}

    def __init__(self, workers=4):
        self.workers = workers
        self._idx = {}
        self._lock = threading.Lock()

    @staticmethod
    def steps():
        return list(range(0, 121)) + list(range(123, LAST_STEP + 1, 3))

    @staticmethod
    def _stem(run, step):
        d, hh = run.strftime('%Y%m%d'), run.strftime('%H')
        return f'{BASE}/gfs.{d}/{hh}/atmos/gfs.t{hh}z.pgrb2.0p25.f{step:03d}'

    def latest_run(self):
        now = datetime.utcnow()
        days = [now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=n) for n in (0, 1)]
        runs = sorted((d + timedelta(hours=h) for d in days for h in (0, 6, 12, 18)), reverse=True)
        for run in runs:
            if run > now:
                continue
            if head_ok(self._stem(run, LAST_STEP) + '.idx'):                # the files appear step by step, the last one last
                return run
        return None

    def _records(self, run, step):
        with self._lock:
            if (run, step) in self._idx:
                return self._idx[(run, step)]
        lines = [l for l in http_get(self._stem(run, step) + '.idx').text.splitlines() if l.strip()]
        recs = []
        for i, line in enumerate(lines):
            p = line.split(':')
            if len(p) < 6 or (i + 1 < len(lines) and len(lines[i + 1].split(':')) < 6):
                raise RuntimeError(f'GFS idx of step {step} is incomplete (the run is still being uploaded)')
            end = int(lines[i + 1].split(':')[1]) - 1 if i + 1 < len(lines) else None
            recs.append({'var': p[3], 'level': p[4], 'fcst': p[5], 'start': int(p[1]), 'end': end})
        with self._lock:
            self._idx[(run, step)] = recs
        return recs

    def _field(self, run, step, var, level):
        for r in self._records(run, step):
            if r['var'] == var and r['level'] == level:
                if var == 'APCP' and not r['fcst'].startswith('0-'):       # several APCP records: take the 0-N hour accumulation
                    continue
                if var == 'PRATE' and 'ave' in r['fcst']:                  # two PRATE records: the rate at the step, not the 4-6 hour average
                    continue
                rng = f"bytes={r['start']}-{r['end']}" if r['end'] else f"bytes={r['start']}-"
                resp = http_get(self._stem(run, step), headers={'Range': rng})
                if resp.status_code not in (200, 206):
                    raise RuntimeError(f'GFS {var} step {step}: HTTP {resp.status_code}')
                return resp.content
        if var in ('APCP', 'GUST', 'PRATE') and step == 0:
            return None
        raise RuntimeError(f'GFS {var} {level} not in the idx of step {step}')

    def param_names(self):
        return [v[0] for v in PARAMS.values()]

    def messages(self, run, only=None, steps=None):
        tasks = [(step, name, (lambda s=step, v=var, l=lev: self._field(run, s, v, l)), mult, add)
                 for step in self.steps() for (var, lev), (name, mult, add) in PARAMS.items()]
        yield from iter_tasks(only_params(tasks, only, steps), self.workers)
