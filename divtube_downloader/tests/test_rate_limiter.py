"""Unit tests for the dual-constraint RateLimiter (Grok: 37 RPS / 10M TPM).

A fake monotonic clock drives time so the sliding-window logic is exercised
deterministically without real ``time.sleep`` calls.
"""

import unittest

from tui.utils import throttle
from tui.utils.throttle import RateLimiter


class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def monotonic(self):
        return self.t

    def sleep(self, dt):
        # Honour the limiter's requested wait by advancing the fake clock.
        if dt > 0:
            self.t += dt


class TestRateLimiter(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self._orig_mono = throttle.time.monotonic
        self._orig_sleep = throttle.time.sleep
        throttle.time.monotonic = self.clock.monotonic
        throttle.time.sleep = self.clock.sleep

    def tearDown(self):
        throttle.time.monotonic = self._orig_mono
        throttle.time.sleep = self._orig_sleep

    def test_margin_math(self):
        rl = RateLimiter(rps=37, tpm=10_000_000, margin=0.9)
        self.assertAlmostEqual(rl.effective_rps, 33.3)
        self.assertAlmostEqual(rl.effective_tpm, 9_000_000)
        self.assertAlmostEqual(rl.min_interval, 1.0 / 33.3, places=6)

    def test_rps_spacing_enforced(self):
        rl = RateLimiter(rps=37, tpm=10_000_000, margin=0.9)
        rl.wait()
        t0 = self.clock.t
        rl.wait()  # back-to-back: must advance by >= min_interval
        self.assertGreaterEqual(self.clock.t - t0, rl.min_interval - 1e-9)

    def test_tpm_window_blocks_then_releases(self):
        rl = RateLimiter(rps=37, tpm=10_000_000, margin=0.9)
        rl.wait()
        # Record tokens at the effective ceiling -> next wait must block until
        # that event ages out of the 60s window.
        rl.record(rl.effective_tpm)
        recorded_at = self.clock.t
        rl.wait()
        self.assertGreaterEqual(self.clock.t - recorded_at, 60.0 - 1e-6)

    def test_record_ignores_garbage(self):
        rl = RateLimiter(rps=37, tpm=10_000_000, margin=0.9)
        rl.record(None)
        rl.record("not-a-number")
        rl.record(-5)
        self.assertEqual(len(rl._tok_events), 0)

    def test_tokens_age_out_of_window(self):
        rl = RateLimiter(rps=37, tpm=10_000_000, margin=0.9)
        rl.record(rl.effective_tpm)
        self.clock.t += 61.0  # advance past the window
        rl._prune(self.clock.monotonic())
        self.assertEqual(len(rl._tok_events), 0)


if __name__ == "__main__":
    unittest.main()
