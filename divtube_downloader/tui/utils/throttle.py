import threading
import time
from collections import deque


class ApiThrottle:
    """Simple fixed-spacing throttle: guarantees at least ``min_interval``
    seconds between successive ``wait()`` returns."""

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


class RateLimiter:
    """Dual-constraint limiter honouring both a requests-per-second and a
    tokens-per-minute ceiling, each scaled by a safety ``margin``.

    - RPS is enforced by minimum spacing between requests (``1 / effective_rps``).
    - TPM is enforced by a sliding 60-second window of recorded token usage:
      ``wait()`` blocks until the trailing-60s token sum has room under the
      effective limit.

    ``wait()`` is called *before* a request; ``record(tokens)`` is called
    *after* the response, once the real ``usage`` is known — so the token
    window reflects actual consumption rather than a guess. Both methods are
    thread-safe; the global limiter is shared across worker threads.
    """

    _WINDOW = 60.0  # seconds

    def __init__(self, rps, tpm, margin=0.9):
        self.effective_rps = rps * margin
        self.effective_tpm = tpm * margin
        self.min_interval = 1.0 / self.effective_rps if self.effective_rps > 0 else 0.0
        self._lock = threading.Lock()
        self._last_call = 0.0
        self._tok_events = deque()  # (monotonic_ts, tokens)

    def _prune(self, now):
        cutoff = now - self._WINDOW
        while self._tok_events and self._tok_events[0][0] < cutoff:
            self._tok_events.popleft()

    def wait(self):
        with self._lock:
            while True:
                now = time.monotonic()
                self._prune(now)

                sleep_for = 0.0

                # ── RPS: enforce minimum spacing between requests ──────────
                gap = self.min_interval - (now - self._last_call)
                if gap > 0:
                    sleep_for = max(sleep_for, gap)

                # ── TPM: if the trailing-60s tokens are at the ceiling, wait
                #    until the oldest token event ages out of the window ─────
                if self._tok_events:
                    tok_sum = sum(t for _, t in self._tok_events)
                    if tok_sum >= self.effective_tpm:
                        age_out = self._WINDOW - (now - self._tok_events[0][0])
                        sleep_for = max(sleep_for, age_out)

                if sleep_for <= 0:
                    break
                time.sleep(sleep_for)

            self._last_call = time.monotonic()

    def record(self, tokens):
        """Fold one response's total token usage into the TPM window."""
        try:
            tokens = int(tokens)
        except (TypeError, ValueError):
            return
        if tokens <= 0:
            return
        with self._lock:
            self._tok_events.append((time.monotonic(), tokens))


# Grok limits: 37 req/s, 10M tokens/min — run at 90% to leave headroom for
# clock skew and bursts so we don't trip hard 429s right at the edge.
llm_throttle = RateLimiter(rps=37, tpm=10_000_000, margin=0.9)
yt_throttle = ApiThrottle(1.5)
gradle_throttle = ApiThrottle(2.0)
