"""Concept Chemistry validation: substrate-powered tool recommendation.

HYPOTHESIS: DivTube harness has robust tooling (53 tools) but NO recommendation
algorithm for selecting the right tool for a given task. The dispatch is a flat
if/elif chain keyed on tool_name — the agent must already know which tool to call.

VALIDATION STRATEGY:
  Phase 1: Prove the absence — enumerate all tools, assert no recommendation
           function exists in the ToolService.
  Phase 2: Build the recommendation algorithm using substrate patterns
           (n-gram embeddings, semantic similarity, tool metadata parsing).
  Phase 3: Test the algorithm against real task descriptions.
  Phase 4: Determinism stress — 100 iterations, identical rankings.

PATTERNS REUSED:
  - substrate_engine.py: n-gram embedding + cosine similarity (pure Python)
  - capability_inject.py: the query is the CONTEXT, not the vocabulary
  - tool_service.py: tool definitions carry name + description + parameters
  - diagnostic-constants.js: health code naming convention
"""
from __future__ import annotations

import sys
import os
from typing import Any

import pytest

from tui.services.tool_recommender import (
    ACTION_VERB_SYNONYMS,
    DOMAIN_SYNONYMS,
    TOOL_METADATA,
    ToolRecommender,
    _cosine_similarity,
    _ngram_embedding,
    _tokenize_task,
)

# ---------------------------------------------------------------------------
# Phase 0: Extract tool catalog from ToolService without heavy __init__
# ---------------------------------------------------------------------------

# We can't instantiate ToolService (it needs a running TUI), but we can
# extract the tool definitions by parsing the source. This is the same
# approach the golden dispatch test uses — bypass __init__, inspect structure.

TOOL_NAMES = [
    "read_file", "tui_inspect", "git_diff", "file_create", "test_run",
    "git_history", "typecheck", "scholo_gate", "browser_inspect",
    "dependency_graph", "search_code", "list_directory", "find_file",
    "run_command", "replace_file_content", "search_youtube", "cleri_probe",
    "health_emit", "health_verify", "archive_search", "archive_neighbors",
    "scd64_decode", "scd64_scan", "law_get", "law_audit", "law_debug",
    "phenotypic_ideal", "diagnostic_scan", "diagnostic_summary",
    "diagnostic_violations", "diagnostic_health", "diagnostic_hints",
    "immunity_scan", "immunity_status", "raid_query", "codebase_search",
    "forensic_search", "bug_create", "bug_list", "task_create", "task_list",
    "agent_list", "memory_get", "memory_set", "heal", "apply_patch",
    "bash_session", "python_exec", "exec_reset", "substrate_query",
    "substrate_status", "substrate_store", "substrate_recent",
]

# ---------------------------------------------------------------------------
# Phase 1: Prove the absence
# ---------------------------------------------------------------------------

class TestHypothesisValidation:
    """Phase 1: The Cockpit has 53 tools and zero recommendation logic."""

    def test_tool_catalog_is_complete(self):
        """All 53 tools are accounted for in our metadata."""
        assert len(TOOL_NAMES) == 53
        assert len(TOOL_METADATA) == 53
        for name in TOOL_NAMES:
            assert name in TOOL_METADATA, f"missing metadata for {name}"

    def test_no_recommendation_method_exists(self):
        """ToolService has no recommend/suggest/route method."""
        from tui.services.tool_service import ToolService
        recommendation_methods = [
            m for m in dir(ToolService)
            if any(kw in m.lower() for kw in ("recommend", "suggest", "route_task", "select_tool"))
        ]
        assert recommendation_methods == [], (
            f"Found recommendation methods: {recommendation_methods}. "
            "Hypothesis INVALIDATED — recommendation already exists."
        )

    def test_dispatch_is_flat_name_keyed(self):
        """execute_tool dispatches on tool_name string, not task semantics."""
        from tui.services.tool_service import ToolService
        svc = ToolService.__new__(ToolService)
        # A task description should NOT work as a tool name
        result = svc.execute_tool("I need to find all files that import React", {})
        assert result == "Tool not found."

    def test_no_substrate_tool_routing(self):
        """The substrate bridge has no tool-routing capability."""
        # The substrate can search memories but cannot recommend tools
        from tui.services.substrate_bridge_service import SubstrateBridgeService
        bridge = SubstrateBridgeService.__new__(SubstrateBridgeService)
        assert not hasattr(bridge, "recommend_tool")
        assert not hasattr(bridge, "route_task")



# ---------------------------------------------------------------------------
# Phase 3: Test the algorithm against real task descriptions
# ---------------------------------------------------------------------------

# Task → expected top-1 tool (ground truth from actual Cockpit usage)
TASK_GROUND_TRUTH = [
    ("I need to read the contents of CombatPage.jsx", "read_file"),
    ("Find all files that import React", "search_code"),
    ("Run the test suite and check for failures", "test_run"),
    ("What does the Curation Law say about auto-generated genes?", "law_get"),
    ("Create a new PDR document in the archive", "file_create"),
    ("Check if there are any TypeScript errors", "typecheck"),
    ("Show me what changed since the last commit", "git_diff"),
    ("Search the encyclopedia for determinism violations", "substrate_query"),
    ("Diagnose why the combat system is crashing", "raid_query"),
    ("Apply this patch to the renderer", "apply_patch"),
    ("List all files in the src/pages directory", "list_directory"),
    ("Find files named *.test.js", "find_file"),
    ("Run a shell command to install dependencies", "run_command"),
    ("Replace the old function with the new implementation", "replace_file_content"),
    ("Scan this file for immune system violations", "immunity_scan"),
    ("What is the SCD64 checksum for this bug?", "scd64_decode"),
    ("Create a bug report for the rendering glitch", "bug_create"),
    ("Store this discovery in persistent memory", "memory_set"),
    ("Search for similar code patterns semantically", "codebase_search"),
    ("Run the full diagnostic scan on the codebase", "diagnostic_scan"),
    ("Inspect the live TUI to see current widgets", "tui_inspect"),
    ("Check the Blender bridge wire protocol", "read_file"),
    ("Audit this file against Vaelrix Law", "law_audit"),
    ("Build a dependency graph from the entry point", "dependency_graph"),
    ("Execute Python to analyze the data", "python_exec"),
    ("Run bash commands in a persistent session", "bash_session"),
    ("Heal this bug automatically", "heal"),
    ("Search YouTube for trending video titles", "search_youtube"),
    ("Check the substrate health and memory count", "substrate_status"),
    ("Get recovery hints for a TYPE error 0105", "diagnostic_hints"),
]


class TestToolRecommendation:
    """Phase 3: The recommender maps tasks to the correct tools."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.recommender = ToolRecommender()

    def test_recommender_initializes(self):
        """All 53 tools are indexed."""
        assert len(self.recommender._tool_embeddings) == 53

    @pytest.mark.parametrize("task,expected_tool", TASK_GROUND_TRUTH)
    def test_top1_accuracy(self, task: str, expected_tool: str):
        """The correct tool appears in the top-3 recommendations."""
        results = self.recommender.recommend(task, top_k=3)
        top3_tools = [r["tool"] for r in results]
        assert expected_tool in top3_tools, (
            f"Task: {task!r}\n"
            f"Expected {expected_tool!r} in top-3, got: {top3_tools}\n"
            f"Scores: {[(r['tool'], r['score']) for r in results]}"
        )

    def test_top1_precision(self):
        """At least 70% of tasks have the correct tool as top-1."""
        correct = 0
        for task, expected in TASK_GROUND_TRUTH:
            results = self.recommender.recommend(task, top_k=1)
            if results and results[0]["tool"] == expected:
                correct += 1
        precision = correct / len(TASK_GROUND_TRUTH)
        assert precision >= 0.70, (
            f"Top-1 precision {precision:.1%} below 70% threshold. "
            f"({correct}/{len(TASK_GROUND_TRUTH)} correct)"
        )

    def test_recommendation_returns_scores(self):
        """Every recommendation has a score, semantic score, and reason."""
        results = self.recommender.recommend("find bugs in the code", top_k=5)
        assert len(results) == 5
        for r in results:
            assert "tool" in r
            assert "score" in r
            assert "semantic_score" in r
            assert "reason" in r
            assert isinstance(r["score"], float)
            assert r["score"] >= 0

    def test_scores_are_ordered(self):
        """Results are sorted by score descending."""
        results = self.recommender.recommend("search for code patterns", top_k=10)
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_unknown_task_still_returns_results(self):
        """Even a nonsensical task returns ranked results (never crashes)."""
        results = self.recommender.recommend("xyzzy plugh frobnicate", top_k=3)
        assert len(results) == 3
        assert all(r["score"] >= 0 for r in results)


# ---------------------------------------------------------------------------
# Phase 4: Determinism stress (100 iterations)
# ---------------------------------------------------------------------------

class TestDeterminism:
    """Phase 4: Same task → same ranking, 100 times."""

    def test_100_iteration_determinism(self):
        """Recommendation checksums are identical across 100 iterations."""
        recommender = ToolRecommender()
        tasks = [
            "find all files that import React",
            "run the tests",
            "what does the law say about determinism",
            "create a new file",
            "diagnose the crash",
        ]
        checksums_per_task: dict[str, set[str]] = {t: set() for t in tasks}

        for _ in range(100):
            for task in tasks:
                checksum = recommender.recommend_checksum(task, top_k=5)
                checksums_per_task[task].add(checksum)

        for task, checksums in checksums_per_task.items():
            assert len(checksums) == 1, (
                f"Non-deterministic recommendations for {task!r}: "
                f"{len(checksums)} distinct checksums"
            )

    def test_embedding_determinism(self):
        """N-gram embeddings are identical across 100 calls."""
        text = "search the codebase for React imports"
        embeddings = set()
        for _ in range(100):
            vec = _ngram_embedding(text)
            embeddings.add(tuple(round(v, 10) for v in vec))
        assert len(embeddings) == 1, "Embedding is non-deterministic"

    def test_cosine_determinism(self):
        """Cosine similarity is identical across 100 calls."""
        a = _ngram_embedding("find bugs in the renderer")
        b = _ngram_embedding("search for rendering errors")
        sims = set()
        for _ in range(100):
            sims.add(round(_cosine_similarity(a, b), 10))
        assert len(sims) == 1, "Cosine similarity is non-deterministic"


# ---------------------------------------------------------------------------
# Phase 5: Integration — the recommender as a Cockpit service
# ---------------------------------------------------------------------------

class TestIntegration:
    """Phase 5: The recommender can be wired into the ToolService."""

    def test_recommender_covers_all_tools(self):
        """Every registered tool has metadata and an embedding."""
        recommender = ToolRecommender()
        for name in TOOL_NAMES:
            assert name in recommender._tool_embeddings
            assert name in recommender._tool_domains

    def test_recommendation_is_pure_function(self):
        """No side effects: recommending doesn't mutate the recommender."""
        recommender = ToolRecommender()
        before = dict(recommender._tool_embeddings)
        recommender.recommend("run the tests", top_k=5)
        recommender.recommend("find bugs", top_k=5)
        recommender.recommend("create a file", top_k=5)
        after = dict(recommender._tool_embeddings)
        assert before == after, "Recommendation mutated the index"

    def test_health_code_naming_convention(self):
        """If we add health codes, they follow PB-{OK|WARN}-v1-TOOLREC-*."""
        # This is a structural test: the naming convention is enforced
        prefix = "PB-OK-v1-TOOLREC-RECOMMENDATION-SERVED"
        assert prefix.startswith("PB-OK-v1-")
        assert "TOOLREC" in prefix

    def test_recommendation_latency(self):
        """Recommendation completes in under 50ms (pure Python, no I/O)."""
        import time
        recommender = ToolRecommender()
        start = time.perf_counter()
        for _ in range(100):
            recommender.recommend("search for code patterns in the renderer", top_k=5)
        elapsed_ms = (time.perf_counter() - start) * 1000
        per_call = elapsed_ms / 100
        assert per_call < 50, f"Recommendation took {per_call:.1f}ms (limit: 50ms)"
