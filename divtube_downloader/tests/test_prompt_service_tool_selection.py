"""PromptService._select_tools: cut the per-turn tool-schema tax.

Context: the cockpit agent loop (PromptService.prompt) resends the FULL tool
catalog (57 schemas, ~8k tokens measured via json.dumps) on every one of up
to MAX_TURNS=500 tool round-trips for a single user message, because
_select_tools(tools=None) always returned self.tools.tools unfiltered. This
is the dominant term in the "token burning" / "reloading every tool
exponentially" complaint: the schema tax is paid again on every turn, on
top of the ever-growing message history.

These tests drive _select_tools toward a stable core set (the handful of
tools nearly every task needs — file/code nav, edit, run, the lens trio)
plus the AdaptiveToolRecommender's guesses for the specific task, computed
once per user message and held fixed for that whole run (both for the
schema-size win and so the array stays byte-identical turn to turn, which
provider prompt caching requires — see gate_keeper reactivation notes).

Bypasses PromptService.__init__ (which spins up a full ToolService + reads
history off disk) via __new__, matching the __new__-bypass pattern already
used in test_tool_recommendation.py's dispatch test — _select_tools and
_record_tool_usage only touch self.tools.tools and the lazily-built
recommender, nothing else on the instance. Because __init__ never runs,
these instances have no self._tool_usage_history attribute, so the lazily
built AdaptiveToolRecommender always gets history=None (see
_get_adaptive_recommender) — no test here ever writes a real db file.
"""
import json
import unittest

from tui.services.prompt_service import PromptService


def _fake_tool(name, description="does a thing"):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": {}},
        },
    }


class _FakeToolService:
    def __init__(self, names):
        self.tools = [_fake_tool(n) for n in names]


REAL_CATALOG_NAMES = [
    "read_file", "search_code", "list_directory", "find_file", "run_command",
    "replace_file_content", "git_diff", "test_run", "telescope", "microscope",
    "atlas", "evaluate",
    "law_get", "law_audit", "law_debug", "scd64_decode", "scd64_scan",
    "diagnostic_scan", "diagnostic_summary", "immunity_scan", "immunity_status",
    "raid_query", "bug_create", "bug_list", "task_create", "task_list",
    "memory_get", "memory_set", "heal", "apply_patch", "search_youtube",
    "codebase_search", "forensic_search", "typecheck", "browser_inspect",
    "dependency_graph", "git_history", "file_create", "archive_search",
    "archive_neighbors", "tui_inspect", "scholo_gate",
]


def _make_service(names=REAL_CATALOG_NAMES):
    svc = PromptService.__new__(PromptService)
    svc.tools = _FakeToolService(names)
    return svc


class TestExplicitToolsPassthrough(unittest.TestCase):
    def test_explicit_tools_list_bypasses_selection_entirely(self):
        svc = _make_service()
        explicit = [_fake_tool("only_this_one")]
        result = svc._select_tools(explicit, task_text="anything at all")
        self.assertEqual([t["function"]["name"] for t in result], ["only_this_one"])


class TestNoTaskTextFallsBackToFullCatalog(unittest.TestCase):
    def test_none_tools_and_no_task_text_returns_everything(self):
        svc = _make_service()
        result = svc._select_tools(None, task_text=None)
        self.assertEqual(len(result), len(REAL_CATALOG_NAMES))


class TestCoreAndRecommendedSelection(unittest.TestCase):
    def setUp(self):
        self.svc = _make_service()

    def test_core_tools_always_present_regardless_of_task(self):
        result = self.svc._select_tools(None, task_text="what's the weather like")
        names = {t["function"]["name"] for t in result}
        for core_name in ("read_file", "search_code", "list_directory", "find_file",
                          "run_command", "replace_file_content", "git_diff", "test_run",
                          "telescope", "microscope", "atlas", "evaluate"):
            self.assertIn(core_name, names)

    def test_selection_is_smaller_than_full_catalog(self):
        result = self.svc._select_tools(None, task_text="run the tests")
        self.assertLess(len(result), len(REAL_CATALOG_NAMES))

    def test_relevant_non_core_tool_gets_pulled_in(self):
        result = self.svc._select_tools(None, task_text="audit this file against Vaelrix Law")
        names = {t["function"]["name"] for t in result}
        self.assertIn("law_audit", names)

    def test_selection_is_deterministic(self):
        first = self.svc._select_tools(None, task_text="diagnose why the combat system is crashing")
        second = self.svc._select_tools(None, task_text="diagnose why the combat system is crashing")
        self.assertEqual(
            [t["function"]["name"] for t in first],
            [t["function"]["name"] for t in second],
        )

    def test_never_returns_empty_even_for_gibberish_task(self):
        result = self.svc._select_tools(None, task_text="xyzzy plugh frobnicate")
        self.assertGreater(len(result), 0)


class TestAdaptiveRecommenderWiring(unittest.TestCase):
    """_select_tools and _record_tool_usage share one lazily-built
    AdaptiveToolRecommender (self._tool_recommender) rather than each
    building their own — otherwise usage recorded via one would never be
    visible to the other's recommend() calls within the same instance."""

    def test_select_tools_and_record_tool_usage_share_one_recommender_instance(self):
        svc = _make_service()
        svc._select_tools(None, task_text="run the tests")
        recommender_after_select = svc._tool_recommender
        svc._record_tool_usage("run the tests", ["test_run"])
        self.assertIs(svc._tool_recommender, recommender_after_select)

    def test_record_tool_usage_with_no_history_attribute_does_not_raise(self):
        svc = _make_service()
        # No self._tool_usage_history (as if __init__ never ran) — must
        # degrade to a no-op, not attempt a real file write.
        svc._record_tool_usage("fix the bug", ["read_file", "replace_file_content"])

    def test_record_tool_usage_forwards_to_a_real_history_when_attached(self):
        svc = _make_service()

        class _FakeHistory:
            def __init__(self):
                self.calls = []

            def record(self, task_text, tools_used):
                self.calls.append((task_text, sorted(tools_used)))

            def similar_task_tool_counts(self, task_text):
                return {}

        svc._tool_usage_history = _FakeHistory()
        svc._record_tool_usage("fix the bug", ["replace_file_content", "read_file"])
        self.assertEqual(svc._tool_usage_history.calls, [("fix the bug", ["read_file", "replace_file_content"])])

    def test_select_tools_recommender_failure_is_logged_not_silent(self):
        svc = _make_service()

        class _ExplodingRecommender:
            def recommend(self, *a, **k):
                raise RuntimeError("simulated: recommender exploded")

        svc._tool_recommender = _ExplodingRecommender()
        with self.assertLogs("tui.services.prompt_service", level="WARNING") as cm:
            result = svc._select_tools(None, task_text="fix the bug")
        # Still degrades to the full catalog — that fail-open behavior is
        # unchanged — but the degradation must be visible somewhere.
        self.assertEqual(len(result), len(REAL_CATALOG_NAMES))
        self.assertTrue(any("recommend" in msg.lower() for msg in cm.output))

    def test_record_tool_usage_failure_is_logged_not_silent(self):
        svc = _make_service()

        class _ExplodingHistory:
            def record(self, *a, **k):
                raise RuntimeError("simulated: history write failed")

            def similar_task_tool_counts(self, *a, **k):
                return {}

        svc._tool_usage_history = _ExplodingHistory()
        with self.assertLogs("tui.services.adaptive_tool_recommender", level="WARNING") as cm:
            svc._record_tool_usage("fix the bug", ["read_file"])
        self.assertTrue(any("history" in msg.lower() for msg in cm.output))

    def test_record_tool_usage_ignores_empty_inputs(self):
        svc = _make_service()

        class _ExplodingHistory:
            def record(self, *a, **k):
                raise AssertionError("record() should not be called for empty input")

            def similar_task_tool_counts(self, task_text):
                return {}

        svc._tool_usage_history = _ExplodingHistory()
        svc._record_tool_usage("", ["read_file"])
        svc._record_tool_usage("fix the bug", [])
        svc._record_tool_usage(None, None)


if __name__ == "__main__":
    unittest.main()
