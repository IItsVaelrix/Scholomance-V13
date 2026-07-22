import os
import time
from collections import OrderedDict

# ──────────────────────────────────────────────
# CLI GATE KEEPER — DISABLED
# ──────────────────────────────────────────────
# Previously enforced cooldown / redundancy / think gates.
# Now always allows; kept for /release diagnostics and API compatibility.
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

    def __init__(self):
        self._last_calls: dict[str, float] = {}
        self._recent_files: OrderedDict[str, float] = OrderedDict()
        self._consecutive_calls: dict[str, int] = {}
        self._total_checks = 0
        self._total_blocks = 0

    # ── Public API ─────────────────────────────

    def check(self, tool_name: str, kwargs: dict | None = None) -> Verdict:
        """Gate disabled — always allow tool execution."""
        self._total_checks += 1
        # Record call for /release diagnostics only; never block.
        now = time.time()
        self._last_calls[tool_name] = now
        if tool_name in self._consecutive_calls:
            self._consecutive_calls[tool_name] += 1
        else:
            self._consecutive_calls[tool_name] = 1
        if tool_name == "read_file" and kwargs:
            raw_path = kwargs.get("path", "")
            resolved = self._resolve_path(raw_path)
            if resolved:
                self._recent_files[resolved] = now
                self._recent_files.move_to_end(resolved)
                while len(self._recent_files) > MAX_RECENT_FILES:
                    self._recent_files.popitem(last=False)
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
        """Return gate state for diagnostics."""
        now = time.time()
        file_list = []
        for path, ts in self._recent_files.items():
            file_list.append({"path": path, "age_s": round(now - ts, 1)})
        return {
            "checks": self._total_checks,
            "blocks": self._total_blocks,
            "cooldowns": {k: round(now - v, 1) for k, v in self._last_calls.items()},
            "recent_files": file_list,
            "consecutive": dict(self._consecutive_calls),
        }

    def reset(self):
        """Clear all gate state."""
        self._last_calls.clear()
        self._recent_files.clear()
        self._consecutive_calls.clear()
        self._total_checks = 0
        self._total_blocks = 0

    # ── Internals ──────────────────────────────

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
