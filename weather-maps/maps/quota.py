import threading
import time
from datetime import datetime, timezone

# The KNMI Open Data API tells in every answer how many calls are left in the window (X-Ratelimit-Remaining / -Reset). The key is
# shared by HARMONIE, the radar thread and, on the dev PC, by tests and production, so the last value seen is kept here and
# shown in the status message of the services, and an alert goes out when it gets low.

_lock = threading.Lock()
_state = {'remaining': None, 'reset': None, 'seen': 0.0}


def update(headers):
    """Called with the headers of every answer of the API."""
    rem = headers.get('X-Ratelimit-Remaining')
    if rem is None:
        return
    with _lock:
        _state['remaining'] = int(rem)
        _state['seen'] = time.time()
        rst = headers.get('X-Ratelimit-Reset')
        if rst:
            _state['reset'] = float(rst)


def remaining():
    with _lock:
        return _state['remaining']


def text():
    """'KNMI quota 812 left at 13:07 UTC' (the value at the moment of the last call), or '' when nothing was seen yet."""
    with _lock:
        if _state['remaining'] is None:
            return ''
        at = datetime.fromtimestamp(_state['seen'], timezone.utc).strftime('%H:%M')
        return f"KNMI quota {_state['remaining']} left at {at} UTC"


def warn(ntfy, threshold=100):
    """One alert per hour (the ntfy dedupe) while fewer than `threshold` calls are left."""
    rem = remaining()
    if rem is not None and rem < threshold:
        ntfy.send('knmi-quota', f'weather-maps: only {rem} KNMI Open Data API calls left in this window (the key is shared by HARMONIE, the radar and tests)',
                  priority='default')
