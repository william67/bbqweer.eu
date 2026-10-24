import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

log = logging.getLogger('maps.source')

UA = {'User-Agent': 'bbqweer.eu weather-maps sync (https://bbqweer.eu)'}


def http_get(url, headers=None, stream=False, tries=4, timeout=120):
    """GET with a few retries (network errors, 429 and 5xx). Other 4xx are returned to the caller."""
    last = None
    for attempt in range(tries):
        try:
            r = requests.get(url, headers={**UA, **(headers or {})}, stream=stream, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                last = f'HTTP {r.status_code}'
                r.close()
            else:
                return r
        except requests.RequestException as e:
            last = repr(e)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'GET {url} failed: {last}')


def head_ok(url):
    try:
        return requests.head(url, headers=UA, timeout=30, allow_redirects=True).status_code == 200
    except requests.RequestException:
        return False


def iter_tasks(tasks, workers):
    """Run the download tasks in parallel and yield (step, param, message, mult, add) as they finish.
    tasks: list of (step, param, func, mult, add); func() returns the bytes of one GRIB message, or None when
    that field legitimately does not exist (accumulated precipitation at step 0). A failure ends the run."""
    ex = ThreadPoolExecutor(workers)
    try:
        futs = {ex.submit(t[2]): t for t in tasks}
        for f in as_completed(futs):
            step, param, _func, mult, add = futs[f]
            msg = f.result()
            if msg is not None:
                yield step, param, msg, mult, add
    finally:
        ex.shutdown(wait=False, cancel_futures=True)


def only_params(tasks, only, steps=None):
    """tasks as in iter_tasks; keeps the ones of the given parameter names and forecast steps (None = all)."""
    return [t for t in tasks if (only is None or t[1] in only) and (steps is None or t[0] in steps)]


class Source:
    """A model run source. latest_run() returns the newest COMPLETE run (naive UTC datetime) or None;
    messages(run) yields (step, param, grib_message_bytes, mult, add) where the value in the file becomes
    value * mult + add (hPa, degrees C, mm). grids maps a grid id to the stride that is applied to the native grid."""
    model = ''
    grids = {}
    use_box = True

    def latest_run(self):
        raise NotImplementedError

    def param_names(self):
        """Our parameter names this source delivers (a stored run that lacks one is filled up by the sync)."""
        raise NotImplementedError

    def messages(self, run, only=None, steps=None):
        """only: a set of parameter names to fetch, steps: a set of forecast steps (None = all of them)."""
        raise NotImplementedError
