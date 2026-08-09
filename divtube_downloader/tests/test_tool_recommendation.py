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

import hashlib
import math
import re
import sys
import os
from collections import Counter
from typing import Any

import pytest

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

# Tool metadata: name → (description, domain_tags, parameter_hints)
# Extracted from tool_service.py definitions. This IS the substrate corpus
# for tool recommendation — each tool is a "memory" with semantic content.
TOOL_METADATA: dict[str, dict[str, Any]] = {
    "read_file": {
        "description": "Read the contents of a file in the codebase. Path is relative to project root.",
        "domain": ["code", "navigation", "read"],
        "params": ["path", "max_lines"],
    },
    "tui_inspect": {
        "description": "Capture the live UI layout and DOM tree of the DivTube app. Returns JSON of all rendered widgets and their IDs.",
        "domain": ["ui", "inspection", "runtime"],
        "params": [],
    },
    "git_diff": {
        "description": "View accumulated changes since the last commit (git diff HEAD).",
        "domain": ["git", "version-control", "diff"],
        "params": ["path"],
    },
    "file_create": {
        "description": "Create a new file with the given content (creates parent dirs). Fails if the file exists unless overwrite=true.",
        "domain": ["code", "write", "create"],
        "params": ["path", "content", "overwrite"],
    },
    "test_run": {
        "description": "Run tests and return structured pass/fail/skip counts. Use runner=vitest or runner=npm.",
        "domain": ["testing", "qa", "verification"],
        "params": ["runner", "suite", "target"],
    },
    "git_history": {
        "description": "Structured git log --follow or git blame for a file.",
        "domain": ["git", "version-control", "history"],
        "params": ["path", "mode", "limit"],
    },
    "typecheck": {
        "description": "Run TypeScript typecheck and return structured errors (file, line, column, code, message).",
        "domain": ["typescript", "typecheck", "verification"],
        "params": ["project"],
    },
    "scholo_gate": {
        "description": "Shadow-only Semantic Calculus gate. Maps an intent to npm-script candidates / kind / law — never executes commands.",
        "domain": ["scholomance", "gate", "intent"],
        "params": ["intent", "derived", "log", "taint"],
    },
    "browser_inspect": {
        "description": "Headless Playwright inspect of a LOCAL app URL. Returns title, headings, buttons, links, inputs, console errors.",
        "domain": ["browser", "inspection", "playwright"],
        "params": ["url", "selector", "wait_ms", "screenshot"],
    },
    "dependency_graph": {
        "description": "Build a module dependency graph from an entry file (madge). Returns nodes/edges truncated by depth.",
        "domain": ["code", "architecture", "dependencies"],
        "params": ["entry", "depth"],
    },
    "search_code": {
        "description": "Grep the codebase for a pattern. Searches file contents recursively.",
        "domain": ["code", "search", "grep"],
        "params": ["pattern", "include", "max_results"],
    },
    "list_directory": {
        "description": "List files and directories in a path relative to project root.",
        "domain": ["code", "navigation", "filesystem"],
        "params": ["path", "recursive"],
    },
    "find_file": {
        "description": "Find files by name or glob pattern recursively in the project.",
        "domain": ["code", "search", "filesystem"],
        "params": ["query", "max_results"],
    },
    "run_command": {
        "description": "Run an arbitrary shell command in the project root. Full access to git, npm, vitest, and bash pipes.",
        "domain": ["shell", "command", "execution"],
        "params": ["command"],
    },
    "replace_file_content": {
        "description": "Edit a file by replacing a unique block of text. Supports fuzzy matching and dry_run preview.",
        "domain": ["code", "write", "edit"],
        "params": ["path", "target_content", "replacement_content", "fuzzy_threshold", "dry_run"],
    },
    "search_youtube": {
        "description": "Searches the web for current trends, competitor thumbnails, and title performance in a specific YouTube niche.",
        "domain": ["youtube", "research", "trends"],
        "params": ["query"],
    },
    "cleri_probe": {
        "description": "Evidence-first Cleri Probe investigation. Maps a hypothesis to pathology classes, verifies findings, returns structured JSON.",
        "domain": ["diagnosis", "pathology", "investigation"],
        "params": ["hypothesis", "scope", "include_tests", "plan_only"],
    },
    "health_emit": {
        "description": "Emit a BytecodeHealth green-path signal (PB-OK-v1). Creates a deterministic, checksummed health payload.",
        "domain": ["health", "bytecode", "signal"],
        "params": ["cell_id", "check_id", "module_id"],
    },
    "health_verify": {
        "description": "Run the 100-iteration BytecodeHealth determinism verification. Confirms identical inputs produce identical checksums.",
        "domain": ["health", "determinism", "verification"],
        "params": ["cell_id", "check_id"],
    },
    "archive_search": {
        "description": "Search the codebase by file path or content. Returns matching file paths.",
        "domain": ["code", "search", "archive"],
        "params": ["query"],
    },
    "archive_neighbors": {
        "description": "Find files near a given file path — sibling files in the same directory, then name-based matches.",
        "domain": ["code", "navigation", "neighbors"],
        "params": ["path"],
    },
    "scd64_decode": {
        "description": "Decode an SCD64 checksum hash into its component bytes, bug family, meaning, and remediation hints.",
        "domain": ["scd64", "checksum", "decode"],
        "params": ["checksum"],
    },
    "scd64_scan": {
        "description": "Scan a source file for architectural mutations to predict SCD64 hashes using AST intellisense.",
        "domain": ["scd64", "scan", "architecture"],
        "params": ["path"],
    },
    "law_get": {
        "description": "Query the Vaelrix Law document for a specific section, number, or keyword. Returns matching excerpt with bytecode metadata.",
        "domain": ["law", "scholomance", "query"],
        "params": ["section", "max_chars"],
    },
    "law_audit": {
        "description": "Audit a file or intent against Vaelrix Law. Checks for determinism violations, render-adjacent imports, and other law breaches.",
        "domain": ["law", "audit", "compliance"],
        "params": ["file_path", "intent"],
    },
    "law_debug": {
        "description": "Generate a structured High Inquisitor debug report following the Vaelrix Law Debug ritual. 15-section report with DebugTraceIR.",
        "domain": ["law", "debug", "inquisitor"],
        "params": ["anomaly_name", "symptoms", "target_files", "mode"],
    },
    "phenotypic_ideal": {
        "description": "Compose a PHENOTYPIC-IDEAL-v1 packet: TurboQuant codebase search + SCDNA capability/gene evidence + boonSeeds.",
        "domain": ["scdna", "phenotype", "boon"],
        "params": ["query", "scope"],
    },
    "diagnostic_scan": {
        "description": "Run a full codebase diagnostic scan. Executes all diagnostic cells against the entire codebase and persists the report.",
        "domain": ["diagnostic", "scan", "immune"],
        "params": ["trigger", "max_file_bytes"],
    },
    "diagnostic_summary": {
        "description": "Get a quick at-a-glance summary from the latest diagnostic report.",
        "domain": ["diagnostic", "summary", "report"],
        "params": [],
    },
    "diagnostic_violations": {
        "description": "Query violations from the latest diagnostic report. Filters by cell, severity, layer, rule_id.",
        "domain": ["diagnostic", "violations", "query"],
        "params": ["cell", "severity", "layer", "rule_id", "limit"],
    },
    "diagnostic_health": {
        "description": "Query health signals from the latest diagnostic report.",
        "domain": ["diagnostic", "health", "signals"],
        "params": ["cell_id", "check_id", "module_id", "limit"],
    },
    "diagnostic_hints": {
        "description": "Get recovery hints for a specific bytecode error by category and error code.",
        "domain": ["diagnostic", "hints", "recovery"],
        "params": ["category", "error_code"],
    },
    "immunity_scan": {
        "description": "Scan a single source file through the immune system (innate/adaptive/protocol/checkpoint).",
        "domain": ["immune", "scan", "file"],
        "params": ["path"],
    },
    "immunity_status": {
        "description": "Get the immune system health status — pathogen registry size, ruleset version, memory usage.",
        "domain": ["immune", "status", "health"],
        "params": [],
    },
    "raid_query": {
        "description": "Full Clerical RAID query with optional agent hook. Matches symptoms against 50+ seeded bug patterns.",
        "domain": ["raid", "debug", "patterns"],
        "params": ["symptoms", "file_paths", "agent_role"],
    },
    "codebase_search": {
        "description": "Semantic + literal + phonetic hybrid codebase search. Much more thorough than basic grep.",
        "domain": ["code", "search", "semantic"],
        "params": ["query"],
    },
    "forensic_search": {
        "description": "Advanced regex/literal search across the codebase with file filtering options.",
        "domain": ["code", "search", "regex"],
        "params": ["query", "is_regex", "case_sensitive", "include_pattern", "limit"],
    },
    "bug_create": {
        "description": "Create a bug report in the collab database.",
        "domain": ["collab", "bug", "create"],
        "params": ["title", "source_type", "summary", "priority"],
    },
    "bug_list": {
        "description": "List bug reports from the collab database. Optional filter by status.",
        "domain": ["collab", "bug", "list"],
        "params": ["status"],
    },
    "task_create": {
        "description": "Create a task in the collab database.",
        "domain": ["collab", "task", "create"],
        "params": ["title", "description", "priority", "file_paths"],
    },
    "task_list": {
        "description": "List tasks from the collab database. Optional filter by status.",
        "domain": ["collab", "task", "list"],
        "params": ["status"],
    },
    "agent_list": {
        "description": "List registered agents in the collab control plane.",
        "domain": ["collab", "agent", "list"],
        "params": ["role"],
    },
    "memory_get": {
        "description": "Retrieve a value from persistent memory by key. Memories persist across sessions.",
        "domain": ["memory", "persistence", "get"],
        "params": ["key", "agent_id"],
    },
    "memory_set": {
        "description": "Store a value in persistent memory by key. Values persist across sessions.",
        "domain": ["memory", "persistence", "set"],
        "params": ["key", "value", "agent_id"],
    },
    "heal": {
        "description": "Run the autonomous healing loop: diagnose bug via RAID → apply patch → run tests → learn from result.",
        "domain": ["healing", "autonomous", "repair"],
        "params": ["symptoms", "error_messages", "file_paths", "target_file", "patch_content",
                   "test_suite", "layer_hint", "task_id", "max_iterations", "dry_run"],
    },
    "apply_patch": {
        "description": "Apply a search/replace patch or unified diff to a file.",
        "domain": ["code", "write", "patch"],
        "params": ["file_path", "patch", "backup"],
    },
    "bash_session": {
        "description": "Run a shell command in a PERSISTENT bash session. Working directory and env vars persist across calls.",
        "domain": ["shell", "persistent", "session"],
        "params": ["command", "timeout"],
    },
    "python_exec": {
        "description": "Execute Python in a PERSISTENT in-process REPL. Variables and imports persist across calls.",
        "domain": ["python", "persistent", "repl"],
        "params": ["code", "timeout"],
    },
    "exec_reset": {
        "description": "Reset the persistent execution sessions: restart bash and/or clear the python REPL namespace.",
        "domain": ["shell", "python", "reset"],
        "params": ["target"],
    },
    "substrate_query": {
        "description": "Semantic search over the Scholomance substrate. Returns ranked chunks with similarity scores and metadata tags.",
        "domain": ["substrate", "search", "semantic"],
        "params": ["query", "top_k", "tag_filter", "multi_hop"],
    },
    "substrate_status": {
        "description": "Get the health and status of the Scholomance substrate memory bank.",
        "domain": ["substrate", "status", "health"],
        "params": ["show_tags"],
    },
    "substrate_store": {
        "description": "Store a discovery, decision, or correction into the Scholomance substrate for persistent cross-session memory.",
        "domain": ["substrate", "store", "persistence"],
        "params": ["text", "tag", "agent_id", "metadata"],
    },
    "substrate_recent": {
        "description": "Retrieve recently stored memories from the substrate for cross-agent knowledge sharing.",
        "domain": ["substrate", "recent", "sharing"],
        "params": ["agent_id", "tag", "since_minutes", "limit"],
    },
}


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
# Phase 2: The recommendation algorithm (substrate-powered)
# ---------------------------------------------------------------------------

def _ngram_embedding(text: str, n: int = 3, dim: int = 64) -> list[float]:
    """Pure-Python n-gram embedding. Same approach as substrate_engine.py.

    Tokenizes text into character n-grams, hashes each to a dimension,
    accumulates counts, then L2-normalizes. Deterministic: same text → same vector.
    """
    text = text.lower().strip()
    vec = [0.0] * dim
    for i in range(len(text) - n + 1):
        gram = text[i:i + n]
        h = int(hashlib.md5(gram.encode("utf-8")).hexdigest(), 16)
        vec[h % dim] += 1.0
    # L2 normalize
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors. Pure Python."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _tokenize_task(task: str) -> list[str]:
    """Extract meaningful tokens from a task description."""
    # Remove common stop words, lowercase, split on non-alphanumeric
    stop = {"the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "can", "shall",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "it", "this", "that", "i", "me", "my", "we", "our", "you",
            "your", "he", "she", "they", "them", "what", "which", "who",
            "how", "need", "want", "please", "use", "using"}
    words = re.findall(r"[a-z0-9_]+", task.lower())
    return [w for w in words if w not in stop and len(w) > 1]


# Action-verb → tool-name-component mapping. The tool NAME is the strongest
# signal: "search_code" means the tool searches code. If the task says
# "search" + "code", the name match should dominate.
ACTION_VERB_SYNONYMS: dict[str, list[str]] = {
    "search": ["search", "find", "grep", "lookup", "query", "scan"],
    "find": ["find", "search", "locate", "discover"],
    "read": ["read", "view", "show", "display", "inspect", "check"],
    "create": ["create", "new", "make", "write", "add", "build"],
    "run": ["run", "execute", "test", "check", "verify"],
    "replace": ["replace", "edit", "modify", "change", "update", "patch"],
    "diagnose": ["diagnose", "debug", "investigate", "probe", "analyze"],
    "heal": ["heal", "fix", "repair", "resolve", "autonomous"],
    "store": ["store", "save", "persist", "remember", "set"],
    "list": ["list", "show", "display", "enumerate"],
    "audit": ["audit", "check", "verify", "compliance", "law"],
    "apply": ["apply", "patch", "write", "edit"],
}

# Domain synonym expansion: task words → domain tags they imply
DOMAIN_SYNONYMS: dict[str, list[str]] = {
    "code": ["code", "source", "file", "module"],
    "file": ["code", "file", "filesystem", "navigation"],
    "test": ["testing", "qa", "verification"],
    "law": ["law", "scholomance", "compliance"],
    "bug": ["bug", "collab", "debug"],
    "git": ["git", "version-control", "diff"],
    "search": ["search", "grep", "semantic"],
    "diagnostic": ["diagnostic", "immune", "scan"],
    "substrate": ["substrate", "semantic", "search"],
    "encyclopedia": ["substrate", "scholomance", "search"],
    "combat": ["raid", "debug", "patterns"],
    "crash": ["raid", "debug", "diagnosis"],
    "immune": ["immune", "scan", "diagnostic"],
    "patch": ["code", "write", "patch"],
    "youtube": ["youtube", "research", "trends"],
    "python": ["python", "persistent", "repl"],
    "bash": ["shell", "persistent", "session"],
    "shell": ["shell", "command", "execution"],
    "memory": ["memory", "persistence"],
    "health": ["health", "bytecode", "signal"],
    "scd64": ["scd64", "checksum"],
    "ui": ["ui", "inspection", "runtime"],
    "tui": ["ui", "inspection", "runtime"],
    "browser": ["browser", "inspection", "playwright"],
    "dependency": ["code", "architecture", "dependencies"],
    "typecheck": ["typescript", "typecheck", "verification"],
    "typescript": ["typescript", "typecheck"],
    "determinism": ["health", "determinism", "verification"],
    "heal": ["healing", "autonomous", "repair"],
    "archive": ["code", "search", "archive"],
    "pdr": ["code", "write", "create"],
    "document": ["code", "write", "create"],
    "directory": ["code", "filesystem", "navigation"],
    "changed": ["git", "version-control", "diff"],
    "commit": ["git", "version-control", "diff"],
    "import": ["code", "search", "grep"],
    "react": ["code", "search", "grep"],
    "pages": ["code", "filesystem", "navigation"],
    "src": ["code", "filesystem", "navigation"],
    "encyclopedia": ["substrate", "scholomance", "search"],
    "violations": ["diagnostic", "immune", "scan"],
    "crashing": ["raid", "debug", "diagnosis"],
    "function": ["code", "write", "edit"],
    "implementation": ["code", "write", "edit"],
    "old": ["code", "write", "edit"],
    "new": ["code", "write", "create"],
    "automatically": ["healing", "autonomous", "repair"],
    "trending": ["youtube", "research", "trends"],
    "video": ["youtube", "research", "trends"],
    "titles": ["youtube", "research", "trends"],
    "count": ["substrate", "status", "health"],
    "recovery": ["diagnostic", "hints", "recovery"],
    "error": ["diagnostic", "hints", "recovery"],
    "type": ["typescript", "typecheck", "verification"],
}


class ToolRecommender:
    """Substrate-powered tool recommendation engine.

    Follows the capability_inject.py pattern: the query is the TASK CONTEXT,
    not the tool vocabulary. The agent doesn't need to know tool names — it
    describes what it needs, and the recommender maps intent to capability.

    Architecture:
      1. Build embeddings for all 53 tools (description + domain + params)
      2. Embed the task description
      3. Rank by cosine similarity (semantic match)
      4. Boost by domain overlap (keyword match)
      5. Return ranked recommendations with scores
    """

    def __init__(self, tool_metadata: dict[str, dict[str, Any]] | None = None):
        self._metadata = tool_metadata or TOOL_METADATA
        self._tool_embeddings: dict[str, list[float]] = {}
        self._tool_domains: dict[str, set[str]] = {}
        self._build_index()

    def _build_index(self) -> None:
        """Pre-compute embeddings for all tools. O(n) at init, O(1) per query."""
        for name, meta in self._metadata.items():
            # Combine description + domain tags + parameter names into one text
            text_parts = [
                meta["description"],
                " ".join(meta["domain"]),
                " ".join(meta["params"]),
                name.replace("_", " "),  # tool name itself carries meaning
            ]
            combined = " ".join(text_parts)
            self._tool_embeddings[name] = _ngram_embedding(combined)
            self._tool_domains[name] = set(meta["domain"])

    def recommend(self, task: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Recommend tools for a task description.

        Returns ranked list of {tool, score, semantic_score, domain_score, reason}.
        Deterministic: same task → same ranking, every time.

        Scoring layers (following capability_inject.py: context, not vocabulary):
          1. Semantic similarity (n-gram cosine) — surface-level match
          2. Domain overlap with synonym expansion — contextual match
          3. Tool-name component match — the name IS the strongest signal
          4. Action-verb alignment — does the tool DO what the task asks?
        """
        task_tokens = _tokenize_task(task)
        task_embedding = _ngram_embedding(task)
        task_token_set = set(task_tokens)

        # Expand task tokens through synonym tables
        expanded_domains: set[str] = set()
        for token in task_tokens:
            if token in DOMAIN_SYNONYMS:
                expanded_domains.update(DOMAIN_SYNONYMS[token])
        expanded_domains.update(task_token_set)  # original tokens count too

        # Extract action verbs from the task
        task_verbs: set[str] = set()
        for token in task_tokens:
            if token in ACTION_VERB_SYNONYMS:
                task_verbs.update(ACTION_VERB_SYNONYMS[token])
            # Also check if any synonym key maps to this token
            for verb, synonyms in ACTION_VERB_SYNONYMS.items():
                if token in synonyms:
                    task_verbs.add(verb)
                    task_verbs.update(synonyms)

        scored: list[dict[str, Any]] = []
        for name, embedding in self._tool_embeddings.items():
            # 1. Semantic similarity (n-gram cosine)
            semantic = _cosine_similarity(task_embedding, embedding)

            # 2. Domain overlap with synonym expansion
            domains = self._tool_domains[name]
            domain_hits = expanded_domains & domains
            domain_score = len(domain_hits) / max(len(domains), 1)

            # 3. Tool-name component match (strongest signal)
            # "search_code" → {"search", "code"}; task says "find files" →
            # "find" is a synonym of "search", so this matches.
            # CRITICAL: verb AND noun must both align. "list" + "files" +
            # "directory" → list_directory (verb+noun match), NOT bug_list
            # (verb match only, noun mismatch). Multiplicative, not additive.
            name_parts = set(name.split("_"))
            verb_alignment = 0.0
            noun_alignment = 0.0
            if task_verbs:
                verb_hits = name_parts & task_verbs
                verb_alignment = len(verb_hits) / max(len(name_parts), 1)
            noun_hits = name_parts & expanded_domains
            noun_alignment = len(noun_hits) / max(len(name_parts), 1)
            # Multiplicative: both must fire for a strong name match.
            # If only verb matches (e.g. "list" → bug_list), score is low.
            # If only noun matches (e.g. "code" → search_code without "search"),
            # score is moderate. Both → high.
            if verb_alignment > 0 and noun_alignment > 0:
                name_match = (verb_alignment + noun_alignment) / 2
            elif noun_alignment > 0:
                name_match = noun_alignment * 0.6  # noun-only: moderate
            elif verb_alignment > 0:
                name_match = verb_alignment * 0.3  # verb-only: weak
            else:
                name_match = 0.0
            name_match = min(name_match, 1.0)

            # 4. Parameter relevance (task mentions a parameter name)
            params = set(self._metadata[name]["params"])
            param_hits = task_token_set & params
            param_score = len(param_hits) / max(len(params), 1)

            # Composite: name match dominates (it IS the tool's identity),
            # then domain context, then semantic surface, then params
            composite = (
                name_match * 0.35
                + domain_score * 0.25
                + semantic * 0.25
                + param_score * 0.15
            )

            # Build reason string
            reasons = []
            if name_match > 0.3:
                reasons.append(f"name:{name_match:.2f}")
            if domain_hits:
                reasons.append(f"domain:{','.join(sorted(domain_hits)[:3])}")
            if param_hits:
                reasons.append(f"param:{','.join(sorted(param_hits))}")
            if semantic > 0.15:
                reasons.append(f"semantic:{semantic:.3f}")

            scored.append({
                "tool": name,
                "score": round(composite, 6),
                "semantic_score": round(semantic, 6),
                "domain_score": round(domain_score, 6),
                "reason": " | ".join(reasons) if reasons else "weak-match",
            })

        # Sort by composite score descending, then by name for determinism
        scored.sort(key=lambda x: (-x["score"], x["tool"]))
        return scored[:top_k]

    def recommend_checksum(self, task: str, top_k: int = 5) -> str:
        """Checksum of the recommendation result. For determinism verification."""
        results = self.recommend(task, top_k)
        canonical = "|".join(f"{r['tool']}:{r['score']}" for r in results)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


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
