import logging
import re
import tarfile
import tempfile
from datetime import datetime

import eccodes as ec
import numpy as np

from maps import grid
from .base import Source, http_get

log = logging.getLogger('maps.harmonie')

API = 'https://api.dataplatform.knmi.nl/open-data/v1/datasets/harmonie_arome_cy43_p1/versions/1.0/files'

# GRIB1 local parameters: (indicatorOfParameter, typeOfLevel, level) -> (our name, mult, add)
PARAMS = {
    (1, 'heightAboveSea', 0): ('msl', 0.01, 0.0),            # Pa -> hPa
    (11, 'heightAboveGround', 2): ('t2m', 1.0, -273.15),     # K -> degrees C
    (33, 'heightAboveGround', 10): ('u10', 1.0, 0.0),
    (34, 'heightAboveGround', 10): ('v10', 1.0, 0.0),
    (61, 'heightAboveGround', 0): ('precip', 1.0, 0.0),      # kg/m2 = mm accumulated since the start of the run
    (184, 'heightAboveGround', 0): ('snow', 1.0, 0.0),       # the snow part of that (kg/m2 of water, the 'cumulative sum' record; the plain 184 is the instant value)
}
GUST_U, GUST_V = 162, 163              # the 10 m gust as u and v components (the maximum of the last hour), m/s
STEPS = list(range(0, 61))             # every forecast hour


class Harmonie(Source):
    """KNMI HARMONIE-AROME Cy43 P1 (Netherlands and surroundings, 390 x 390 points of 0.029 degrees). One tar of about
    900 MB per hourly run, holding 61 GRIB1 files (one per forecast hour); read as a stream so the tar never lands on
    disk, all hourly steps are used. Stored on the native grid and with every 2nd point."""
    model = 'harmonie'
    grids = {'0.029': 1, '0.058': 2}
    use_box = False

    def __init__(self, key, every_hours=3):
        self.key = key
        self.every_hours = every_hours

    def latest_run(self):
        r = http_get(API + '?maxKeys=48&orderBy=created&sorting=desc', headers={'Authorization': self.key}, timeout=60)
        if r.status_code != 200:
            raise RuntimeError(f'KNMI file list: HTTP {r.status_code}')
        files = r.json().get('files', [])
        for f in files:
            m = re.match(r'HARM43_V1_P1_(\d{10})\.tar$', f['filename'])
            if m:
                run = datetime.strptime(m.group(1), '%Y%m%d%H')
                if run.hour % self.every_hours == 0:
                    return run
        return None

    def param_names(self):
        return [v[0] for v in PARAMS.values()] + ['gust']

    def messages(self, run, only=None, steps=None):
        filename = f'HARM43_V1_P1_{run.strftime("%Y%m%d%H")}.tar'
        meta = http_get(f'{API}/{filename}/url', headers={'Authorization': self.key}, timeout=60)
        if meta.status_code != 200:
            raise RuntimeError(f'KNMI download url: HTTP {meta.status_code}')
        with http_get(meta.json()['temporaryDownloadUrl'], stream=True, timeout=300) as resp, \
                tarfile.open(fileobj=resp.raw, mode='r|') as tf:
            for member in tf:
                step = int(member.name.rsplit('_', 2)[-2][:3])             # HA43_N20_202610230500_02400_GB -> 24
                if step not in STEPS or (steps is not None and step not in steps):
                    continue
                data = tf.extractfile(member).read()
                with tempfile.NamedTemporaryFile() as tmp:
                    tmp.write(data)
                    tmp.flush()
                    comps = {}
                    with open(tmp.name, 'rb') as f:
                        while True:
                            gid = ec.codes_grib_new_from_file(f)
                            if gid is None:
                                break
                            try:
                                key = (ec.codes_get(gid, 'indicatorOfParameter'), ec.codes_get(gid, 'typeOfLevel'), ec.codes_get(gid, 'level'))
                                hit = PARAMS.get(key)
                                if hit and (only is None or hit[0] in only) and (hit[0] not in ('precip', 'snow') or ec.codes_get(gid, 'stepRange').startswith('0-')):
                                    yield step, hit[0], ec.codes_get_message(gid), hit[1], hit[2]
                                elif key[1:] == ('heightAboveGround', 10) and key[0] in (GUST_U, GUST_V) and (only is None or 'gust' in only):
                                    comps[key[0]] = grid.read_field(ec.codes_get_message(gid))
                            finally:
                                ec.codes_release(gid)
                    if GUST_U in comps and GUST_V in comps:           # the gust speed from its two components
                        lats, lons, u = comps[GUST_U]
                        yield step, 'gust', (lats, lons, np.hypot(u, comps[GUST_V][2])), 1.0, 0.0
