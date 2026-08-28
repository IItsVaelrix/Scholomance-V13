"""AdaptiveToolRecommender: static ToolRecommender + real usage history.

Wraps the existing (static, no-memory) ToolRecommender and boosts its
ranking using ToolUsageHistory's "what actually got used for similar past
tasks" signal. Day-one behavior (empty history) must be identical to what's
already shipped — the boost only changes anything once real usage data
exists — so most tests here use a tiny fake static recommender to pin exact
before/after ranks, plus one end-to-end test with the real components.
"""
import os
import tempfile
import unittest

from tui.services.adaptive_tool_recommender import AdaptiveToolRecommender
from tui.services.tool_recommender import ToolRecommender
from tui.services.tool_usage_history import ToolUsageHistory


class _FakeStaticRecommender:
    """Fixed, hand-authored scores — isolates AdaptiveToolRecommender's own
    boosting/re-sort logic from the real n-gram algorithm's behavior."""

    def __init__(self, scores):
        # scores: dict tool_name -> composite score
        self._scores = scores

    def recommend(self, task, top_k=5):
        ranked = [
            {"tool": name, "score": score, "semantic_score": 0.0,
             "domain_score": 0.0, "reason": "fake"}
            for name, score in self._scores.items()
        ]
        ranked.sort(key=lambda r: (-r["score"], r["tool"]))
        return ranked[:top_k]


class _FakeHistory:
    def __init__(self, counts=None, raises=False):
        self._counts = counts or {}
        self._raises = raises

    def similar_task_tool_counts(self, task_text):
        if self._raises:
            raise RuntimeError("history backend unavailable")
        return dict(self._counts)

    def record(self, task_text, tools_used):
        if self._raises:
            raise RuntimeError("history backend unavailable")
        self.recorded = (task_text, list(tools_used))


class TestNoHistoryMatchesStaticRanking(unittest.TestCase):
    def test_none_history_returns_same_top_k_as_static(self):
        static = _FakeStaticRecommender({"a": 0.9, "b": 0.5, "c": 0.1})
        adaptive = AdaptiveToolRecommender(static_recommender=static, history=None)
        result = adaptive.recommend("do something", top_k=2)
        self.assertEqual([r["tool"] for r in result], ["a", "b"])

    def test_empty_history_counts_returns_same_top_k_as_static(self):
        static = _FakeStaticRecommender({"a": 0.9, "b": 0.5, "c": 0.1})
        adaptive = AdaptiveToolRecommender(static_recommender=static, history=_FakeHistory(counts={}))
        result = adaptive.recommend("do something", top_k=2)
        self.assertEqual([r["tool"] for r in result], ["a", "b"])


class TestHistoryBoostsRanking(unittest.TestCase):
    def test_historical_usage_can_promote_a_lower_scored_tool(self):
        # "c" static-scores below "b" by less than BOOST_WEIGHT and has
        # strong real-usage history for similar past tasks — should climb
        # into the top-2, past "b". The boost is bounded (see
        # test_boost_never_exceeds_the_configured_weight below), so this gap
        # is deliberately small enough for BOOST_WEIGHT to close.
        static = _FakeStaticRecommender({"a": 0.9, "b": 0.6, "c": 0.2})
        history = _FakeHistory(counts={"c": 10.0})
        adaptive = AdaptiveToolRecommender(static_recommender=static, history=history)
        result = adaptive.recommend("do something", top_k=2)
        self.assertIn("c", [r["tool"] for r in result])

    def test_boost_never_exceeds_the_configured_weight(self):
        # Even overwhelming history can't make a 0-static-score tool outrank
        # everything by more than BOOST_WEIGHT's worth of score.
        static = _FakeStaticRecommender({"a": 1.0, "b": 0.0})
        history = _FakeHistory(counts={"b": 999.0})
        adaptive = AdaptiveToolRecommender(static_recommender=static, history=history)
        result = adaptive.recommend("do something", top_k=2)
        scored = {r["tool"]: r["score"] for r in result}
        self.assertLessEqual(scored["b"], AdaptiveToolRecommender.BOOST_WEIGHT + 1e-9)


class TestGracefulDegradation(unittest.TestCase):
    def test_history_failure_falls_back_to_static_ranking(self):
        static = _FakeStaticRecommender({"a": 0.9, "b": 0.5})
        adaptive = AdaptiveToolRecommender(static_recommender=static, history=_FakeHistory(raises=True))
        result = adaptive.recommend("do something", top_k=2)
        self.assertEqual([r["tool"] for r in result], ["a", "b"])

    def test_record_usage_swallows_history_errors(self):
        adaptive = AdaptiveToolRecommender(
            static_recommender=_FakeStaticRecommender({}), history=_FakeHistory(raises=True)
        )
        # Must not raise.
        adaptive.record_usage("do something", ["a"])

    def test_record_usage_with_no_history_is_a_noop(self):
        adaptive = AdaptiveToolRecommender(static_recommender=_FakeStaticRecommender({}), history=None)
        adaptive.record_usage("do something", ["a"])  # must not raise

    def test_history_read_failure_is_logged_not_silent(self):
        """A broken history backend must not crash recommend() (already
        covered above), but it also must not vanish without a trace — a
        caller with no idea the fallback is degraded can't investigate it."""
        adaptive = AdaptiveToolRecommender(
            static_recommender=_FakeStaticRecommender({"a": 0.9}), history=_FakeHistory(raises=True)
        )
        with self.assertLogs("tui.services.adaptive_tool_recommender", level="WARNING") as cm:
            adaptive.recommend("do something", top_k=1)
        self.assertTrue(any("history" in msg.lower() for msg in cm.output))

    def test_record_usage_failure_is_logged_not_silent(self):
        adaptive = AdaptiveToolRecommender(
            static_recommender=_FakeStaticRecommender({}), history=_FakeHistory(raises=True)
        )
        with self.assertLogs("tui.services.adaptive_tool_recommender", level="WARNING") as cm:
            adaptive.record_usage("do something", ["a"])
        self.assertTrue(any("history" in msg.lower() for msg in cm.output))


class TestDeterminism(unittest.TestCase):
    def test_same_task_and_history_state_gives_same_ranking(self):
        static = _FakeStaticRecommender({"a": 0.9, "b": 0.5, "c": 0.3})
        history = _FakeHistory(counts={"c": 4.0})
        adaptive = AdaptiveToolRecommender(static_recommender=static, history=history)
        first = adaptive.recommend("do something", top_k=3)
        second = adaptive.recommend("do something", top_k=3)
        self.assertEqual([r["tool"] for r in first], [r["tool"] for r in second])


class TestRecordUsageDelegation(unittest.TestCase):
    def test_record_usage_forwards_to_history(self):
        history = _FakeHistory()
        adaptive = AdaptiveToolRecommender(static_recommender=_FakeStaticRecommender({}), history=history)
        adaptive.record_usage("fix the bug", ["read_file", "replace_file_content"])
        self.assertEqual(history.recorded[0], "fix the bug")
        self.assertEqual(sorted(history.recorded[1]), ["read_file", "replace_file_content"])


class TestEndToEndWithRealComponents(unittest.TestCase):
    """One integration test with the real ToolRecommender + a real (temp-file)
    ToolUsageHistory, proving the pieces actually fit together — not just the
    fakes above."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "usage.db")

    def tearDown(self):
        self.tmp.cleanup()

    def test_repeated_real_usage_of_a_niche_tool_promotes_it(self):
        history = ToolUsageHistory(self.db_path)
        adaptive = AdaptiveToolRecommender(static_recommender=ToolRecommender(), history=history)

        task = "audit this file against Vaelrix Law"
        before = [r["tool"] for r in adaptive.recommend(task, top_k=5)]
        self.assertIn("law_audit", before)  # already strong on name match alone

        # Now teach it that a much more niche, low-name-match tool also gets
        # used for this exact kind of request.
        for _ in range(5):
            adaptive.record_usage(task, ["law_debug"])

        after = adaptive.recommend("check compliance against the law", top_k=5)
        after_names = [r["tool"] for r in after]
        self.assertIn("law_debug", after_names)


if __name__ == "__main__":
    unittest.main()
