import logging
import threading
import time

import requests

log = logging.getLogger('maps.ntfy')

# Standalone copy of the idea in smart-socket-waker/waker/ntfy.py (each service has its own config).
# Alerts are rare, so a plain POST with a timeout is enough.


class Ntfy:
    def __init__(self, cfg):
        self.base_url = cfg.get('ntfy', 'base_url', fallback=None)
        self.token = cfg.get('ntfy', 'token', fallback=None)
        self.suffix = cfg.get('ntfy', 'topic_suffix', fallback='')
        self._last = {}
        self._lock = threading.Lock()

    def send(self, key, message, topic='servererrors', title='bbqweer.eu', priority='high', tags='warning',
             dedupe_s=3600):
        if not self.base_url:
            log.error('ntfy not configured, alert not sent: %s', message)
            return
        with self._lock:
            last = self._last.get(key)
            if last and time.time() - last < dedupe_s:
                return
            self._last[key] = time.time()
        headers = {'Title': title, 'Priority': priority, 'Tags': tags}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        try:
            requests.post(f'{self.base_url}/{topic}{self.suffix}', data=message.encode('utf-8'),
                          headers=headers, timeout=5)
            log.info('ntfy sent: %s', message)
        except Exception as e:  # an alert that cannot be sent must never stop the sync
            log.error('ntfy failed: %s', e)
            with self._lock:
                self._last.pop(key, None)
