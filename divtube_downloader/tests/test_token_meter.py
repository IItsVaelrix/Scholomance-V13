import os
import tempfile
import unittest

from tui.services import token_meter as tm


class TokenMeterTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig = tm._state_path
        tm._state_path = lambda: os.path.join(self.tmp.name, "meter.json")
        os.environ.pop("AETHER_BUDGET_USD", None)

    def tearDown(self):
        tm._state_path = self._orig
        self.tmp.cleanup()


class TestRecording(TokenMeterTestBase):
    def test_records_tokens_and_estimates_cost(self):
        m = tm.TokenMeterService()
        m.set_budget(20.0)
        m.record("grok-4.3", {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000})
        s = m.snapshot()
        self.assertEqual(s["tokens"], 2_000_000)
        self.assertEqual(s["calls"], 1)
        # grok-4.3 -> (5,15) per Mtok => 1M*5 + 1M*15 = 20.0
        self.assertAlmostEqual(s["cost"], 20.0, places=4)
        self.assertAlmostEqual(s["remaining"], 0.0, places=4)
        self.assertAlmostEqual(s["ratio"], 0.0, places=4)

    def test_ignores_empty_or_missing_usage(self):
        m = tm.TokenMeterService()
        m.record("grok-4.3", None)
        m.record("grok-4.3", {})
        m.record("grok-4.3", {"prompt_tokens": 0, "completion_tokens": 0})
        self.assertEqual(m.snapshot()["calls"], 0)

    def test_unknown_model_uses_default_price(self):
        m = tm.TokenMeterService()
        m.record("some-mystery-model", {"prompt_tokens": 1_000_000, "completion_tokens": 0})
        # default (1,3) => 1M input * 1 = 1.0
        self.assertAlmostEqual(m.snapshot()["cost"], 1.0, places=4)

    def test_longest_prefix_wins(self):
        # 'grok-build' must beat the shorter 'grok' prefix.
        self.assertEqual(tm._price_for("grok-build-0.1"), (3.0, 9.0))
        self.assertEqual(tm._price_for("grok-4.3"), (5.0, 15.0))


class TestCachedTokens(TokenMeterTestBase):
    def test_cached_tokens_discounted_at_explicit_cache_rate(self):
        m = tm.TokenMeterService()
        # 1M prompt tokens, 400K of them cache hits. grok-4.3 in-rate is $5/Mtok.
        # 600K uncached * $5 + 400K cached * $5 * 0.1 (explicit-cache multiplier) = $3.20
        m.record("grok-4.3", {
            "prompt_tokens": 1_000_000,
            "completion_tokens": 0,
            "prompt_tokens_details": {"cached_tokens": 400_000},
        })
        s = m.snapshot()
        self.assertEqual(s["cached_tokens"], 400_000)
        self.assertAlmostEqual(s["cache_hit_rate"], 0.4, places=6)
        self.assertAlmostEqual(s["cost"], 3.20, places=4)

    def test_missing_prompt_tokens_details_matches_pre_cache_behavior(self):
        # No prompt_tokens_details at all — same shape every call has sent until now.
        # Must cost exactly what the old (pre-cache-aware) formula produced.
        m = tm.TokenMeterService()
        m.record("grok-4.3", {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000})
        s = m.snapshot()
        self.assertEqual(s["cached_tokens"], 0)
        self.assertEqual(s["cache_hit_rate"], 0.0)
        self.assertAlmostEqual(s["cost"], 20.0, places=4)

    def test_non_dict_prompt_tokens_details_does_not_raise(self):
        m = tm.TokenMeterService()
        m.record("grok-4.3", {
            "prompt_tokens": 10, "completion_tokens": 0,
            "prompt_tokens_details": "not-a-dict",
        })
        self.assertEqual(m.snapshot()["cached_tokens"], 0)

    def test_cached_tokens_persist_across_instances(self):
        m1 = tm.TokenMeterService()
        m1.record("grok-4.3", {
            "prompt_tokens": 100, "completion_tokens": 0,
            "prompt_tokens_details": {"cached_tokens": 30},
        })
        m2 = tm.TokenMeterService()
        self.assertEqual(m2.snapshot()["cached_tokens"], 30)


class TestBudgetAndPersistence(TokenMeterTestBase):
    def test_ratio_clamped_and_avg_cost(self):
        m = tm.TokenMeterService()
        m.set_budget(10.0)
        m.record("grok-4.3", {"prompt_tokens": 4_000_000, "completion_tokens": 0})  # $20 > $10
        s = m.snapshot()
        self.assertEqual(s["remaining"], 0.0)
        self.assertEqual(s["ratio"], 0.0)  # clamped, not negative
        self.assertGreater(s["avg_cost"], 0.0)

    def test_reset_zeroes_spend_keeps_budget(self):
        m = tm.TokenMeterService()
        m.set_budget(15.0)
        m.record("grok-4.3", {"prompt_tokens": 1_000_000, "completion_tokens": 0})
        m.reset_spend()
        s = m.snapshot()
        self.assertEqual(s["cost"], 0.0)
        self.assertEqual(s["calls"], 0)
        self.assertEqual(s["budget"], 15.0)

    def test_persists_across_instances(self):
        m1 = tm.TokenMeterService()
        m1.set_budget(12.0)
        m1.record("grok-4.3", {"prompt_tokens": 500_000, "completion_tokens": 0})
        m2 = tm.TokenMeterService()  # fresh load from same state file
        s = m2.snapshot()
        self.assertEqual(s["budget"], 12.0)
        self.assertEqual(s["tokens"], 500_000)
        self.assertEqual(s["calls"], 1)

    def test_on_update_callback_fires(self):
        m = tm.TokenMeterService()
        hits = []
        m.on_update = lambda: hits.append(1)
        m.record("grok-4.3", {"prompt_tokens": 10, "completion_tokens": 10})
        m.set_budget(5.0)
        self.assertEqual(len(hits), 2)

    def test_callback_exception_is_swallowed(self):
        m = tm.TokenMeterService()
        def boom():
            raise RuntimeError("ui gone")
        m.on_update = boom
        # must not propagate
        m.record("grok-4.3", {"prompt_tokens": 10, "completion_tokens": 10})


if __name__ == "__main__":
    unittest.main()
