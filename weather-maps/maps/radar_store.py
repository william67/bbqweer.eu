import logging
from datetime import timedelta

from pymongo import ASCENDING, ReplaceOne

log = logging.getLogger('maps.radar_store')

# Two collections next to the weather grids (same database, same MongoDB):
#
#   radar_grids      one document per set (precip, echotop, hail) and 5-minute time (`ts`, naive UTC), unique on (set, ts). The
#                 grid (765 rows x 700 columns, 1 km) as uint8 codes, zlib-compressed; value = code * scale + offset, the codes in
#                 `nodata` have no value. `src` and `srcModified` (the file name and the lastModified of the KNMI Open Data file)
#                 tell whether a stored frame is still what the source has: a frame is only written when it is new or the source
#                 file changed, so running the same round twice writes nothing.
#   radar_forecast   the forecast of the NEWEST run of the precipitation set (the file holds the observation and 24 forecast steps of 5 minutes):
#                 one document per step (1..24), unique on (set, step), replaced by every new run; `run` = the time of the run, `ts` = the valid
#                 time (run + step x 5 minutes), same fields as radar_grids. Older runs are not kept (the WMS does not keep them either).
#   radar_grid_days  one document per set and day (_id "<set>/<yyyymmdd>"): the day was fetched completely (every file the source
#                 has for it), so the back-fill does not look at it again. Only written for days that can no longer grow.


class RadarStore:
    def __init__(self, db):
        self.frames = db['radar_grids']
        self.days = db['radar_grid_days']
        self.forecast = db['radar_forecast']
        self.forecast.create_index([('set', ASCENDING), ('step', ASCENDING)], unique=True, name='set_step')
        self.frames.create_index([('set', ASCENDING), ('ts', ASCENDING)], unique=True, name='set_ts')
        self.frames.create_index([('ts', ASCENDING)], name='ts')

    def stored(self, set_name, start, end):
        """{ts: srcModified} of the frames of a set in [start, end)."""
        cur = self.frames.find({'set': set_name, 'ts': {'$gte': start, '$lt': end}}, {'ts': 1, 'srcModified': 1})
        return {d['ts']: d.get('srcModified') for d in cur}

    def upsert_many(self, docs):
        """Insert or replace frames (keyed on set and ts). Returns the number written."""
        if not docs:
            return 0
        ops = [ReplaceOne({'set': d['set'], 'ts': d['ts']}, d, upsert=True) for d in docs]
        self.frames.bulk_write(ops, ordered=False)
        return len(docs)

    def replace_forecast(self, docs):
        """The forecast of a new run replaces the old one (same steps are overwritten, steps the new run does not have are removed)."""
        if not docs:
            return 0
        self.forecast.bulk_write([ReplaceOne({'set': d['set'], 'step': d['step']}, d, upsert=True) for d in docs], ordered=False)
        self.forecast.delete_many({'set': docs[0]['set'], 'step': {'$nin': [d['step'] for d in docs]}})
        return len(docs)

    def newest(self, set_name):
        d = self.frames.find_one({'set': set_name}, {'ts': 1}, sort=[('ts', -1)])
        return d['ts'] if d else None

    def day_done(self, set_name, day):
        return self.days.find_one({'_id': f'{set_name}/{day:%Y%m%d}'}, {'_id': 1}) is not None

    def mark_day(self, set_name, day, n_frames, via, now):
        self.days.replace_one({'_id': f'{set_name}/{day:%Y%m%d}'},
                              {'_id': f'{set_name}/{day:%Y%m%d}', 'set': set_name, 'day': day, 'frames': n_frames, 'via': via, 'doneAt': now},
                              upsert=True)

    def prune(self, cutoff):
        """Delete what is older than `cutoff` (the keep window). Returns the number of frames removed."""
        n = self.frames.delete_many({'ts': {'$lt': cutoff}}).deleted_count
        self.days.delete_many({'day': {'$lt': cutoff - timedelta(days=1)}})
        if n:
            log.info('radar: %d frames older than %s removed', n, cutoff.strftime('%Y-%m-%d %H:%M'))
        return n
