"""AdaptiveToolRecommender: static ToolRecommender scores + real usage history.

The static ToolRecommender (n-gram/domain heuristic) has no memory — the
same task text always scores the same way, whether or not that guess ever
turned out right in practice. This wraps it with ToolUsageHistory's "what
tools actually got used for similar past tasks" signal as a bounded boost,
re-sorts, and returns the top-K.

With no history (or a history with nothing similar on record), this is
byte-for-byte the same tool SET as the plain ToolRecommender — the boost is
additive and zero when there's nothing to boost with, so day-one behavior
(before any usage accumulates) doesn't change from what's already shipped.
"""
import logging

from tui.services.tool_recommender import ToolRecommender

logger = logging.getLogger(__name__)


class AdaptiveToolRecommender:
    # Cap on how much the historical-usage boost can move a score. Bounded
    # (not unbounded) so overwhelming history for one task-shape can't let a
    # tool with zero static relevance outrank one with strong relevance by
    # more than this much — it's a re-rank signal, not a veto.
    BOOST_WEIGHT = 0.5

    def __init__(self, static_recommender=None, history=None):
        self._static = static_recommender or ToolRecommender()
        self._history = history

    # Ask the static recommender for far more than any real tool catalog
    # holds, so we always get its FULL ranked pool to boost from — a lower-
    # scored tool can't be promoted past the leaders if it was already
    # truncated away before boosting runs. Deliberately not derived from the
    # collaborator's internals (e.g. a private tool-count attribute): any
    # static_recommender need only implement recommend(task, top_k), a fake
    # included.
    _FULL_POOL_REQUEST = 1000

    def recommend(self, task_text, top_k=5):
        """Full-catalog ranked list from the static recommender, boosted by
        real usage history for similar past tasks, then truncated to top_k."""
        ranked = self._static.recommend(task_text, top_k=max(self._FULL_POOL_REQUEST, top_k))

        history_counts = self._safe_history_counts(task_text)
        if history_counts:
            max_weight = max(history_counts.values())
            if max_weight > 0:
                for entry in ranked:
                    boost = history_counts.get(entry["tool"], 0.0) / max_weight
                    entry["score"] = round(entry["score"] + self.BOOST_WEIGHT * boost, 6)
                ranked.sort(key=lambda r: (-r["score"], r["tool"]))

        return ranked[:top_k]

    def record_usage(self, task_text, tools_used):
        """Log which tools actually got used for this task, for future
        recommend() calls to learn from. Never raises — a broken history
        backend must not break the turn that's recording it — but the
        failure is logged, not silently dropped: a caller with no signal
        that recording is broken has no way to notice usage data has
        stopped accumulating."""
        if self._history is None:
            return
        try:
            self._history.record(task_text, tools_used)
        except Exception:
            logger.warning("tool usage history record() failed, usage not recorded", exc_info=True)

    def _safe_history_counts(self, task_text):
        if self._history is None:
            return {}
        try:
            return dict(self._history.similar_task_tool_counts(task_text))
        except Exception:
            logger.warning("tool usage history lookup failed, falling back to static ranking", exc_info=True)
            return {}
