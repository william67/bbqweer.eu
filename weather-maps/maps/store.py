import logging
from datetime import timedelta

from pymongo import MongoClient, ASCENDING

log = logging.getLogger('maps.store')

# Two collections in the weathermaps database of the bbqweer.eu MongoDB (docs/weather-charts.md):
#
#   weather_grids      one document per model, grid, run, forecast step and parameter (40-250 KB each: the grid as
#                      uint16 between min and max, byte-shuffled and zlib-compressed), unique on that key. The runs are
#                      stored apart from each other; the newest keep_runs runs of a model are kept.
#   weather_grid_runs  one document per model and grid (_id "<model>/<grid>"): the complete runs (newest first, each with
#                      its steps and parameters) and a timeline that merges them: for every valid time the newest run
#                      that still covers it (the short ICON-EU and ECMWF runs for the first hours, an older long run
#                      for the rest). run, steps, params and meta at the top level describe the newest run. The pages
#                      read this document first, so they never see a run that is still being written.


def build_timeline(runs):
    """runs: complete runs, newest first, each {'run': datetime, 'steps': [hours]}. The newest run is used for its whole
    range, from its start to its last step; an older run only adds the valid times after the end of the runs before
    it (so a short ICON-EU run for the first 48 h, then the older long run). Whole stretches come from one run: picking
    the newest run per hour would flip between two runs wherever one of them has fewer steps.
    Returns [{'valid', 'run', 'step'}] sorted by valid time."""
    newest = runs[0]['run']
    chosen = {}
    covered = None
    for r in runs:
        end = r['run'] + timedelta(hours=max(r['steps']))
        for step in r['steps']:
            valid = r['run'] + timedelta(hours=step)
            if valid >= newest and (covered is None or valid > covered):
                chosen[valid] = (r['run'], step)
        covered = end if covered is None else max(covered, end)
    return [{'valid': v, 'run': run, 'step': step} for v, (run, step) in sorted(chosen.items())]


class Store:
    def __init__(self, cfg):
        host = cfg.get('mongodb', 'host')
        port = int(cfg.get('mongodb', 'port', fallback='27017'))
        self.client = MongoClient(host, port, serverSelectionTimeoutMS=10000)
        self.db = self.client[cfg.get('mongodb', 'database', fallback='weathermaps')]
        self.grids = self.db['weather_grids']
        self.runs = self.db['weather_grid_runs']
        self.grids.create_index([('model', ASCENDING), ('grid', ASCENDING), ('run', ASCENDING),
                                 ('step', ASCENDING), ('param', ASCENDING)], unique=True, name='model_grid_run_step_param')

    def put(self, doc):
        key = {k: doc[k] for k in ('model', 'grid', 'run', 'step', 'param')}
        self.grids.replace_one(key, doc, upsert=True)

    @staticmethod
    def _runs_of(d):
        """The complete runs of a weather_grid_runs document; a document of the first version (one run at the top
        level, no list) counts as a list of one."""
        if not d:
            return []
        if d.get('runs'):
            return list(d['runs'])
        if d.get('run'):
            return [{'run': d['run'], 'steps': d.get('steps', []), 'params': d.get('params', []), 'meta': d.get('meta', {})}]
        return []

    def has_run(self, model, grid, run):
        d = self.runs.find_one({'_id': f'{model}/{grid}'})
        return any(r['run'] == run for r in self._runs_of(d))

    def runs_of(self, model, grid):
        """The complete runs of a model and grid, newest first."""
        return self._runs_of(self.runs.find_one({'_id': f'{model}/{grid}'}))

    def finish_run(self, model, grid, run, steps, params, meta=None, keep=4):
        """Add `run` to the complete runs, keep the newest `keep`, rebuild the timeline and delete the documents of the
        runs that dropped out."""
        _id = f'{model}/{grid}'
        runs = list(self._runs_of(self.runs.find_one({'_id': _id})))
        prev = next((r for r in runs if r['run'] == run), None)
        runs = [r for r in runs if r['run'] != run]
        if prev:                                       # a run that is stored already gets more parameters or steps: merge
            steps = set(prev['steps']) | set(steps)
            params = set(prev['params']) | set(params)
        runs.append({'run': run, 'steps': sorted(steps), 'params': sorted(params), 'meta': meta or (prev['meta'] if prev else {})})
        runs.sort(key=lambda r: r['run'], reverse=True)
        runs = runs[:keep]
        newest = runs[0]
        self.runs.replace_one({'_id': _id}, {
            '_id': _id, 'model': model, 'grid': grid,
            'run': newest['run'], 'steps': newest['steps'], 'params': newest['params'], 'meta': newest['meta'],
            'runs': runs, 'timeline': build_timeline(runs),
        }, upsert=True)
        removed = self.grids.delete_many({'model': model, 'grid': grid, 'run': {'$nin': [r['run'] for r in runs]}}).deleted_count
        log.info('%s/%s: run %s stored, %d runs kept (%s), %d old documents removed', model, grid, run.strftime('%Y-%m-%d %H'),
                 len(runs), ' '.join(r['run'].strftime('%d%H') for r in runs), removed)
