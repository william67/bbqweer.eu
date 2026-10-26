import bz2
import re
from datetime import datetime

from maps import grid
from .base import Source, http_get, iter_tasks, only_params

BASE = 'https://opendata.dwd.de/weather/nwp/icon-eu/grib'

# folder -> (file name part, our name, mult, add)
PARAMS = {
    'pmsl': ('PMSL', 'msl', 0.01, 0.0),
    'u_10m': ('U_10M', 'u10', 1.0, 0.0),
    'v_10m': ('V_10M', 'v10', 1.0, 0.0),
    't_2m': ('T_2M', 't2m', 1.0, -273.15),
    'tot_prec': ('TOT_PREC', 'precip', 1.0, 0.0),    # kg/m2 = mm, accumulated since the start of the run
    'vmax_10m': ('VMAX_10M', 'gust', 1.0, 0.0),      # m/s, the maximum 10 m gust of the last hour
}
# the snow that fell since the start of the run (water, mm): the grid-scale and the convective part, added up in _snow()
SNOW = (('snow_gsp', 'SNOW_GSP'), ('snow_con', 'SNOW_CON'))
NAME = re.compile(r'icon-eu_europe_regular-lat-lon_single-level_(\d{10})_(\d{3})_PMSL\.grib2\.bz2')


class IconEu(Source):
    """DWD ICON-EU on its regular lat-lon grid of 0.0625 degrees, one bz2 file per field and step. A run every 3 hours:
    00, 06, 12 and 18 UTC go to +120 h (hourly to +78 h, then 3-hourly), the runs in between only to +48 h. All steps
    that DWD has are stored. DWD keeps only the newest run per hour. Stored twice: every 4th point (0.25 degrees, like
    the other models) and every 2nd point (0.125 degrees)."""
    model = 'icon-eu'
    grids = {'0.25': 4, '0.125': 2}

    def __init__(self, workers=4):
        self.workers = workers
        self._steps = {}

    @staticmethod
    def _last_step(run):
        return 120 if run.hour % 6 == 0 else 48

    def _listing(self, hh):
        """{run: sorted steps} of the runs in the folder of one hour (DWD keeps one run per folder)."""
        html = http_get(f'{BASE}/{hh:02d}/pmsl/').text
        out = {}
        for m in NAME.finditer(html):
            out.setdefault(datetime.strptime(m.group(1), '%Y%m%d%H'), set()).add(int(m.group(2)))
        return {run: sorted(s) for run, s in out.items()}

    def latest_run(self):
        best = None
        for hh in range(0, 24, 3):
            for run, steps in self._listing(hh).items():
                if self._last_step(run) in steps:                      # complete: the last step of that run is there
                    self._steps[run] = steps
                    if best is None or run > best:
                        best = run
        return best

    def steps(self, run):
        if run not in self._steps:
            steps = self._listing(run.hour).get(run)
            if not steps:
                raise RuntimeError(f'ICON-EU run {run:%Y%m%d%H} is not (any more) on the server')
            self._steps[run] = steps
        return self._steps[run]

    def _field(self, run, step, folder, part):
        stamp = run.strftime('%Y%m%d%H')
        url = f'{BASE}/{run.strftime("%H")}/{folder}/icon-eu_europe_regular-lat-lon_single-level_{stamp}_{step:03d}_{part}.grib2.bz2'
        r = http_get(url)
        if r.status_code == 404 and folder in ('tot_prec', 'vmax_10m') and step == 0:
            return None
        if r.status_code != 200:
            raise RuntimeError(f'ICON-EU {part} step {step}: HTTP {r.status_code}')
        return bz2.decompress(r.content)

    def _snow(self, run, step):
        """SNOW_GSP + SNOW_CON as (lats, lons, mm of water accumulated since the start of the run)."""
        total = None
        for folder, part in SNOW:
            lats, lons, v = grid.read_field(self._field(run, step, folder, part))
            total = v if total is None else total + v
        return lats, lons, total

    def param_names(self):
        return [v[1] for v in PARAMS.values()] + ['snow']

    def messages(self, run, only=None, steps=None):
        tasks = [(step, name, (lambda s=step, f=folder, p=part: self._field(run, s, f, p)), mult, add)
                 for step in self.steps(run) for folder, (part, name, mult, add) in PARAMS.items()]
        tasks += [(step, 'snow', (lambda s=step: self._snow(run, s)), 1.0, 0.0) for step in self.steps(run)]
        yield from iter_tasks(only_params(tasks, only, steps), self.workers)
