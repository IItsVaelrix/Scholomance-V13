import hashlib
import json
import os
import time
from collections import OrderedDict

# ──────────────────────────────────────────────
# CLI GATE KEEPER — Prevents tool-spam & redundancy
# ──────────────────────────────────────────────
# Two gates:
#   1. COOLDOWN_GATE — minimum seconds between same tool type
#   2. REDUNDANCY_GATE — blocks re-reading a file you already have, and
#      blocks re-asking the query/lens tools the exact same question
#
# Usage in execute_tool:
#   from core.gate_keeper import gate
#   verdict = gate.check(tool_name, kwargs)
#   if verdict.is_blocked:
#       return verdict.message
#
# For AI: always call `gate.think_before(tool_name, kwargs)` first.
# ──────────────────────────────────────────────

# ── Constants ──────────────────────────────────
COOLDOWN_SECONDS = {
    "read_file":          3.0,   # 3s between file reads
    "search_code":        5.0,   # 5s between searches
    "forensic_search":    5.0,
    "codebase_search":    5.0,
    "find_file":          3.0,
    "list_directory":     2.0,
    "git_diff":           2.0,
    "run_command":        2.0,
    "replace_file_content": 1.0,
    "tui_inspect":        3.0,
    "archive_search":     3.0,
    "archive_neighbors":  3.0,
    "law_get":            2.0,
    "law_audit":          3.0,
    "law_debug":          3.0,
    "diagnostic_scan":    10.0,
    "diagnostic_summary": 3.0,
    "diagnostic_violations": 3.0,
    "diagnostic_health":  3.0,
    "diagnostic_hints":   2.0,
    "immunity_scan":      3.0,
    "immunity_status":    3.0,
    "raid_query":         3.0,
    "cleri_scan":         3.0,
    "cleri_stats":        5.0,
    "cleri_probe":        3.0,
    "health_emit":        2.0,
    "health_verify":      5.0,
    "scd64_decode":       2.0,
    "scd64_scan":         3.0,
    "search_youtube":     10.0,
    "bug_create":         2.0,
    "bug_list":           3.0,
    "task_create":        2.0,
    "task_list":          3.0,
    "agent_list":         3.0,
    "memory_get":         1.0,
    "memory_set":         1.0,
    "heal":               15.0,
    "apply_patch":        1.0,
    "phenotypic_ideal":   10.0,
}

DEFAULT_COOLDOWN = 2.0
MAX_RECENT_FILES = 5

# Read-only query/lens tools: asking the exact same question twice teaches
# nothing new, so a repeat within REDUNDANCY_WINDOW_SECONDS is blocked.
# Deliberately excludes mutating/exec tools (run_command, replace_file_content,
# test_run, ...) — repeating those with identical arguments is often
# intentional (re-run the tests after a fix), so only their flat cooldown
# applies, never a redundancy block.
REDUNDANCY_TOOLS = frozenset({
    "read_file", "microscope", "telescope", "atlas", "evaluate",
    "search_code", "list_directory", "find_file",
})
REDUNDANCY_WINDOW_SECONDS = 30.0
MAX_RECENT_CALLS = 20


def _args_key(tool_name: str, kwargs: dict) -> str:
    """Canonical, key-order-independent identity for one call's arguments.

    Deliberately duplicated rather than imported from
    tui.services.episode_store.args_hash_for (same purpose, same
    json.dumps(sort_keys=True) approach): every existing import between
    these two packages runs services -> core (tool_service.py imports
    gate_keeper), never the reverse, and this five-line stdlib-only
    function isn't worth inverting that layering for.
    """
    payload = json.dumps(
        {"tool": tool_name, "args": kwargs or {}},
        sort_keys=True, separators=(",", ":"), default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


class Verdict:
    """Result of a gate check."""
    def __init__(self, allowed: bool, reason: str = "", message: str = ""):
        self.allowed = allowed
        self.is_blocked = not allowed
        self.reason = reason
        self.message = message

    def __bool__(self):
        return self.allowed

    def __repr__(self):
        if self.allowed:
            return "<Verdict: ALLOW>"
        return f"<Verdict: BLOCKED — {self.reason}>"


class GateKeeper:
    """Three-gate system to prevent tool spam and redundant operations."""

    # Every caller that never passes agent_id (existing /release, think_before,
    # older direct check() calls) collapses into this one shared bucket —
    # exactly the single implicit namespace that existed before agent
    # scoping, so behavior for anyone not updated is unchanged.
    DEFAULT_AGENT_ID = "default"

    def __init__(self):
        self._last_calls: dict[tuple[str, str], float] = {}
        self._recent_files: OrderedDict[tuple[str, str], float] = OrderedDict()
        self._recent_calls: OrderedDict[tuple[str, str, str], float] = OrderedDict()
        self._consecutive_calls: dict[tuple[str, str], int] = {}
        self._total_checks = 0
        self._total_blocks = 0
        self._blocks_by_reason: dict[str, int] = {}

    # ── Public API ─────────────────────────────

    def check(self, tool_name: str, kwargs: dict | None = None, agent_id: str = DEFAULT_AGENT_ID) -> Verdict:
        """Run cooldown + redundancy gates. Returns Verdict — if blocked, do NOT execute.

        agent_id scopes ALL state below to the caller: the cockpit can run
        more than one agent concurrently in this one process (the desktop
        driver, a paired-phone chat session, a mobile coding-partner task),
        and without this an unrelated agent's tool call could spuriously
        block another's — reproduced live: a mobile task's list_directory
        call got COOLDOWN-blocked purely because the desktop had called the
        same tool moments earlier, a completely different conversation.
        """
        self._total_checks += 1

        # 1. COOLDOWN GATE — rate limit per tool, per agent
        cooldown = COOLDOWN_SECONDS.get(tool_name, DEFAULT_COOLDOWN)
        now = time.time()
        last_key = (agent_id, tool_name)
        last = self._last_calls.get(last_key, 0.0)
        elapsed = now - last

        if elapsed < cooldown:
            remaining = round(cooldown - elapsed, 1)
            self._record_block("COOLDOWN")
            return Verdict(
                allowed=False,
                reason="COOLDOWN",
                message=(
                    f"⛔ GATE [COOLDOWN] — '{tool_name}' called {elapsed:.1f}s ago "
                    f"(need {cooldown}s). Wait {remaining}s or use a different approach "
                    f"instead of hitting the same tool."
                )
            )

        # 2. REDUNDANCY GATE — file re-read detection, per agent
        if tool_name == "read_file" and kwargs:
            raw_path = kwargs.get("path", "")
            resolved = self._resolve_path(raw_path)
            file_key = (agent_id, resolved) if resolved else None
            if file_key and file_key in self._recent_files:
                age = now - self._recent_files[file_key]
                if age < 30.0:
                    self._record_block("REDUNDANCY")
                    return Verdict(
                        allowed=False,
                        reason="REDUNDANCY",
                        message=(
                            f"⛔ GATE [REDUNDANCY] — '{raw_path}' was read {age:.0f}s ago. "
                            f"You already have this content. Think: what new information "
                            f"are you expecting that you don't already have?"
                        )
                    )

        # 2b. GENERIC REDUNDANCY GATE — same agent, same tool, same args, recent
        if tool_name in REDUNDANCY_TOOLS and tool_name != "read_file":
            call_key = (agent_id, tool_name, _args_key(tool_name, kwargs))
            if call_key in self._recent_calls:
                age = now - self._recent_calls[call_key]
                if age < REDUNDANCY_WINDOW_SECONDS:
                    self._record_block("REDUNDANCY")
                    return Verdict(
                        allowed=False,
                        reason="REDUNDANCY",
                        message=(
                            f"⛔ GATE [REDUNDANCY] — '{tool_name}' called with the same "
                            f"arguments {age:.0f}s ago. You already have this result. "
                            f"Think: what new information are you expecting that you "
                            f"don't already have?"
                        )
                    )

        # 3. CONSECUTIVE CALL WARNING, per agent
        consecutive_key = (agent_id, tool_name)
        if consecutive_key in self._consecutive_calls:
            self._consecutive_calls[consecutive_key] += 1
            count = self._consecutive_calls[consecutive_key]
            if count >= 3:
                self._log_warning(
                    f"⚠ THINK GATE — '{tool_name}' called {count} times consecutively "
                    f"by agent '{agent_id}'. Are you iterating toward something or spinning?"
                )
        else:
            self._consecutive_calls[consecutive_key] = 1

        # Record the call
        self._last_calls[last_key] = now

        # Track file reads
        if tool_name == "read_file" and kwargs:
            raw_path = kwargs.get("path", "")
            resolved = self._resolve_path(raw_path)
            if resolved:
                file_key = (agent_id, resolved)
                self._recent_files[file_key] = now
                self._recent_files.move_to_end(file_key)
                while len(self._recent_files) > MAX_RECENT_FILES:
                    self._recent_files.popitem(last=False)

        # Track query/lens calls (generic redundancy)
        if tool_name in REDUNDANCY_TOOLS and tool_name != "read_file":
            call_key = (agent_id, tool_name, _args_key(tool_name, kwargs))
            self._recent_calls[call_key] = now
            self._recent_calls.move_to_end(call_key)
            while len(self._recent_calls) > MAX_RECENT_CALLS:
                self._recent_calls.popitem(last=False)

        return Verdict(allowed=True)

    def think_before(self, tool_name: str, kwargs: dict | None = None) -> str:
        """Call this BEFORE invoking any tool. Returns a reflection prompt."""
        verdict = self.check(tool_name, kwargs)
        if verdict.is_blocked:
            return verdict.message
        hints = {
            "read_file": "📖 Reading a file — do you already have this data from a recent read?",
            "search_code": "🔍 Searching — narrow your pattern to avoid huge result sets.",
            "list_directory": "📂 Listing — you may already know this structure.",
            "find_file": "🔎 Finding — try to guess the path by convention first.",
            "run_command": "⚡ Running a command — is this necessary or can you infer from context?",
            "git_diff": "📊 Diffing — commit first so diff is clean.",
        }
        hint = hints.get(tool_name, "")
        if hint:
            return f"⏳ {hint}"
        return ""

    def status(self) -> dict:
        """Return gate state for diagnostics. Keys are formatted as
        'agent_id::tool_name' strings (not raw tuples) so this stays safe
        to json.dumps and readable in a log line."""
        now = time.time()
        file_list = []
        for (agent_id, path), ts in self._recent_files.items():
            file_list.append({"agent_id": agent_id, "path": path, "age_s": round(now - ts, 1)})
        return {
            "checks": self._total_checks,
            "blocks": self._total_blocks,
            "blocks_by_reason": dict(self._blocks_by_reason),
            "cooldowns": {f"{agent_id}::{tool_name}": round(now - v, 1)
                          for (agent_id, tool_name), v in self._last_calls.items()},
            "recent_files": file_list,
            "consecutive": {f"{agent_id}::{tool_name}": count
                            for (agent_id, tool_name), count in self._consecutive_calls.items()},
        }

    def reset(self):
        """Clear all gate state."""
        self._last_calls.clear()
        self._recent_files.clear()
        self._recent_calls.clear()
        self._consecutive_calls.clear()
        self._total_checks = 0
        self._total_blocks = 0
        self._blocks_by_reason.clear()

    # ── Internals ──────────────────────────────

    def _record_block(self, reason: str) -> None:
        self._total_blocks += 1
        self._blocks_by_reason[reason] = self._blocks_by_reason.get(reason, 0) + 1

    def _resolve_path(self, raw_path: str) -> str | None:
        here = os.path.dirname(os.path.abspath(__file__))
        root = here
        for _ in range(6):
            parent = os.path.dirname(root)
            if parent == root:
                break
            root = parent
            if any(os.path.exists(os.path.join(root, m)) for m in (".git", "package.json", "pyproject.toml")):
                break
        joined = os.path.normpath(os.path.join(root, raw_path))
        if not joined.startswith(root):
            return None
        return joined if os.path.isfile(joined) else None

    def _log_warning(self, msg: str):
        print(f"[GATE] {msg}")


# ── Module-level singleton ────────────────────
gate = GateKeeper()


# ── Convenience ───────────────────────────────
def think_before(tool_name: str, **kwargs) -> str:
    return gate.think_before(tool_name, kwargs or None)

def status() -> dict:
    return gate.status()
