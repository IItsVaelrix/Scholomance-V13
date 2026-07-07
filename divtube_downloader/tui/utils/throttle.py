import threading
import time

class ApiThrottle:
    def __init__(self, min_interval=1.75):
        self.min_interval = min_interval
        self._lock = threading.Lock()
        self._last_call = 0.0

    def wait(self):
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_call
            if elapsed < self.min_interval:
                time.sleep(self.min_interval - elapsed)
            self._last_call = time.monotonic()

llm_throttle = ApiThrottle(3.5)
yt_throttle = ApiThrottle(1.5)
gradle_throttle = ApiThrottle(2.0)
