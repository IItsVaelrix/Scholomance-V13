"""ToolUsageHistory: the real-usage ledger the adaptive recommender learns from.

Own small sqlite file (matches MemoryService/divtube_memory.db), NOT
scholomance_collab.sqlite — episode_store.py's own docstring is explicit that
schema authority for that database stays with the JS migration list and
Python must never invent tables there. This is a separate, Python-owned
concern: "for a task description like X, which tools actually got used."

Similarity reuses tool_recommender's n-gram embedding/cosine (no second
similarity metric to maintain), which keeps this fast enough to run
synchronously per message — the whole point of not going through the ~4s-cold
substrate for this (see AdaptiveToolRecommender's design conversation).
"""
import os
import tempfile
import unittest

from tui.services.tool_usage_history import ToolUsageHistory


class _TempDbCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "tool_usage_history.db")

    def tearDown(self):
        self.tmp.cleanup()


class TestRecordAndRecall(_TempDbCase):
    def test_similar_task_recalls_the_tool_that_was_used(self):
        history = ToolUsageHistory(self.db_path)
        history.record("run the tests and show me failures", ["test_run"])
        counts = history.similar_task_tool_counts("run the test suite")
        self.assertIn("test_run", counts)
        self.assertGreater(counts["test_run"], 0)

    def test_dissimilar_task_is_not_recalled(self):
        history = ToolUsageHistory(self.db_path)
        history.record("run the tests and show me failures", ["test_run"])
        counts = history.similar_task_tool_counts("audit this file against Vaelrix Law")
        self.assertNotIn("test_run", counts)

    def test_empty_history_returns_empty_counts(self):
        history = ToolUsageHistory(self.db_path)
        counts = history.similar_task_tool_counts("anything at all")
        self.assertEqual(dict(counts), {})

    def test_repeated_similar_usage_accumulates_more_weight_than_once(self):
        history = ToolUsageHistory(self.db_path)
        history.record("audit this file against Vaelrix Law", ["law_audit"])
        once = history.similar_task_tool_counts("audit this against the law")["law_audit"]

        history2 = ToolUsageHistory(self.db_path)
        history2.record("audit this file against Vaelrix Law", ["law_audit"])
        history2.record("check this file complies with Vaelrix Law", ["law_audit"])
        history2.record("verify this file against Vaelrix Law", ["law_audit"])
        thrice = history2.similar_task_tool_counts("audit this against the law")["law_audit"]

        self.assertGreater(thrice, once)


class TestRecordEdgeCases(_TempDbCase):
    def test_empty_task_text_is_not_recorded(self):
        history = ToolUsageHistory(self.db_path)
        history.record("", ["read_file"])
        history.record(None, ["read_file"])
        counts = history.similar_task_tool_counts("read_file")
        self.assertEqual(dict(counts), {})

    def test_empty_tools_used_is_not_recorded(self):
        history = ToolUsageHistory(self.db_path)
        history.record("do something", [])
        history.record("do something", None)
        counts = history.similar_task_tool_counts("do something")
        self.assertEqual(dict(counts), {})

    def test_duplicate_tool_names_in_one_call_dedupe(self):
        history = ToolUsageHistory(self.db_path)
        history.record("read the combat file twice", ["read_file", "read_file", "read_file"])
        counts = history.similar_task_tool_counts("read the combat file")
        # One occurrence contributing weight, not three stacked from one turn.
        self.assertLessEqual(counts["read_file"], 1.0001)


_DISTINCT_TASKS = [
    "read the combat page component",
    "audit the renderer against vaelrix law",
    "run the visualiser test suite",
    "search the codebase for react imports",
    "diagnose the crashing immune scan",
    "create a new pdr document archive",
    "build a dependency graph from the entry",
    "list files in the pages directory",
    "apply a patch to the phoneme engine",
    "store a discovery in persistent memory",
    "check the substrate health status",
    "decode this scd64 checksum hash",
    "heal the bug in the combat system",
    "scan the file for immunity violations",
    "inspect the live tui widget tree",
    "typecheck the typescript source tree",
    "browse the local playwright endpoint",
    "grep the repository for a pattern",
    "diff the working tree since head",
    "recover the deleted rig file asset",
    "generate the beatmap json payload",
    "install the missing python dependency",
    "rename the deprecated helper function",
    "profile the rendering frame budget",
    "archive the old encyclopedia entry",
]


class TestPruning(_TempDbCase):
    def test_row_count_is_bounded(self):
        history = ToolUsageHistory(self.db_path, max_rows=10)
        for task in _DISTINCT_TASKS:
            history.record(task, ["read_file"])
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            (row_count,) = conn.execute("SELECT COUNT(*) FROM tool_usage").fetchone()
        self.assertEqual(row_count, 10)

    def test_pruning_keeps_the_most_recent_rows(self):
        history = ToolUsageHistory(self.db_path, max_rows=3)
        tagged = [(task, [f"tool_for_{i}"]) for i, task in enumerate(_DISTINCT_TASKS[:5])]
        for task, tools in tagged:
            history.record(task, tools)
        oldest_task, oldest_tool = tagged[0][0], tagged[0][1][0]
        newest_task, newest_tool = tagged[-1][0], tagged[-1][1][0]
        counts_old = history.similar_task_tool_counts(oldest_task)
        counts_new = history.similar_task_tool_counts(newest_task)
        self.assertNotIn(oldest_tool, counts_old)
        self.assertIn(newest_tool, counts_new)


if __name__ == "__main__":
    unittest.main()
