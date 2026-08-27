"""MobileCodingAdapter._task_tools: cut the mobile observe catalog the same
way PromptService._select_tools already cuts the desktop catalog.

Root cause (DIVTUBE_MOBILE_CODING_AGENT.md's "Lens Methodology" section
exists because of this): the mobile task always got the FULL 36-tool
observe catalog, unfiltered by relevance, on every task — bypassing the
AdaptiveToolRecommender built for desktop entirely. A model choosing among
law_get/raid_query/substrate_query/phenotypic_ideal/diagnostic_* sitting
undifferentiated next to telescope/microscope/atlas has no signal about
which of 37 tools is for this job. This reuses the SAME shared recommender
PromptService already lazily builds (self._prompt_service._get_adaptive_
recommender()) rather than constructing a second, disconnected one — so
usage learned from either surface benefits both.
"""
import unittest

from tui.remote.action_journal import ActionJournal
from tui.remote.coding_event_hub import CodingEventHub
from tui.services.mobile_coding_adapter import MobileCodingAdapter


def _fake_tool(name):
    return {
        "type": "function",
        "function": {"name": name, "description": f"does {name}", "parameters": {"type": "object", "properties": {}}},
    }


class _FakeRecommender:
    def __init__(self, ranked_names):
        self._ranked_names = ranked_names
        self.calls = []

    def recommend(self, task_text, top_k=5):
        self.calls.append((task_text, top_k))
        return [{"tool": name, "score": 1.0} for name in self._ranked_names[:top_k]]


class _FakePromptService:
    def __init__(self, names, recommender):
        self.tools = _FakeToolService(names)
        self._recommender = recommender

    def _get_adaptive_recommender(self):
        return self._recommender


class _FakeToolService:
    def __init__(self, names):
        self.tools = [_fake_tool(n) for n in names]


# A representative slice of real OBSERVE-class tools (per coding_policy._OBSERVE)
# plus a couple of PROPOSE/UNAVAILABLE ones that must never appear regardless
# of what the (fake) recommender ranks highly.
CATALOG_NAMES = [
    "read_file", "telescope", "microscope", "atlas", "list_directory", "find_file",
    "search_code", "law_get", "law_audit", "raid_query", "substrate_query",
    "phenotypic_ideal", "diagnostic_summary", "codebase_search",
    "replace_file_content",  # PROPOSE-class — must never be offered to mobile
    "run_command",           # UNAVAILABLE-class — must never be offered to mobile
]


class TestMobileTaskToolsSelection(unittest.TestCase):
    def _adapter(self, recommender):
        prompt_service = _FakePromptService(CATALOG_NAMES, recommender)
        return MobileCodingAdapter(
            "/tmp", ActionJournal("/tmp/journal-mobile-task-tools-test"), CodingEventHub("pc-1"),
            prompt_service=prompt_service,
        )

    def test_core_lens_tools_always_present_regardless_of_task(self):
        adapter = self._adapter(_FakeRecommender([]))
        names = {t["function"]["name"] for t in adapter._task_tools("fix a typo in the README")}
        for core in ("read_file", "telescope", "microscope", "atlas", "list_directory", "find_file", "search_code"):
            self.assertIn(core, names)

    def test_patch_schema_always_appended(self):
        adapter = self._adapter(_FakeRecommender([]))
        names = {t["function"]["name"] for t in adapter._task_tools("anything")}
        self.assertIn("mobile_propose_patch", names)

    def test_recommended_observe_tool_is_pulled_in(self):
        adapter = self._adapter(_FakeRecommender(["law_audit"]))
        names = {t["function"]["name"] for t in adapter._task_tools("check compliance")}
        self.assertIn("law_audit", names)

    def test_non_observe_tools_never_appear_even_if_recommender_ranks_them(self):
        # A misbehaving/fake recommender ranking a write or exec-class tool
        # must not smuggle it into the mobile catalog — capability_policy's
        # fail-closed classification is authoritative, not the recommender.
        adapter = self._adapter(_FakeRecommender(["replace_file_content", "run_command", "law_audit"]))
        names = {t["function"]["name"] for t in adapter._task_tools("edit something")}
        self.assertNotIn("replace_file_content", names)
        self.assertNotIn("run_command", names)
        self.assertIn("law_audit", names)  # the one legitimately-OBSERVE recommendation still gets through

    def test_selection_is_smaller_than_the_full_observe_catalog(self):
        adapter = self._adapter(_FakeRecommender([]))
        result = adapter._task_tools("fix a typo in the README")
        observe_count = sum(1 for n in CATALOG_NAMES if n not in ("replace_file_content", "run_command"))
        self.assertLess(len(result) - 1, observe_count)  # -1 for the always-appended patch schema

    def test_recommender_is_queried_with_the_actual_task_text(self):
        recommender = _FakeRecommender(["law_audit"])
        adapter = self._adapter(recommender)
        adapter._task_tools("audit this against the law")
        self.assertEqual(recommender.calls[0][0], "audit this against the law")


if __name__ == "__main__":
    unittest.main()
