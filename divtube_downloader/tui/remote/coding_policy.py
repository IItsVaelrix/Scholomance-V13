"""Fail-closed mobile capability inventory for the DivTube Cockpit.

The Android companion must never infer permission from a tool description or
from ``is_coding_action``.  This module is the one explicit mapping from the
desktop registry to the remotely advertised disposition.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable


class PolicyError(ValueError):
    """Raised when the desktop registry and mobile manifest cannot agree."""


class CapabilityClass(str, Enum):
    OBSERVE = "observe"
    PROPOSE = "propose"
    APPLY = "apply"
    EXECUTE = "execute"
    EXTERNAL = "external"
    UNAVAILABLE = "unavailable"


class Availability(str, Enum):
    AVAILABLE = "available"
    APPROVAL_REQUIRED = "approval_required"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class CapabilityEntry:
    name: str
    capability_class: CapabilityClass
    availability: Availability
    reason: str | None = None


_OBSERVE = frozenset({
    "read_file", "tui_inspect", "git_diff", "git_history", "dependency_graph",
    "telescope", "microscope", "atlas", "search_code", "list_directory",
    "find_file", "search_youtube", "health_verify", "archive_search",
    "archive_neighbors", "scd64_decode", "scd64_scan", "law_get", "law_audit",
    "law_debug", "phenotypic_ideal", "diagnostic_summary", "diagnostic_violations",
    "diagnostic_health", "diagnostic_hints", "immunity_status", "codebase_search",
    "forensic_search", "bug_list", "task_list", "agent_list", "memory_get",
    "substrate_query", "substrate_status", "substrate_recent", "raid_query",
})
_APPLY = frozenset({"file_create", "replace_file_content", "bug_create", "task_create", "memory_set", "apply_patch", "substrate_store"})
_EXECUTE = frozenset({"test_run", "typecheck", "scholo_gate", "health_emit", "diagnostic_scan", "immunity_scan"})
_EXTERNAL = frozenset({"browser_inspect"})
_UNAVAILABLE = frozenset({"run_command", "bash_session", "python_exec", "exec_reset", "evaluate", "heal", "cleri_probe"})


def build_manifest(tools: Iterable[dict[str, Any]]) -> dict[str, CapabilityEntry]:
    """Return one explicit, fail-closed mobile entry for each desktop tool."""
    manifest: dict[str, CapabilityEntry] = {}
    for tool in tools:
        name = _tool_name(tool)
        if name in manifest:
            raise PolicyError(f"duplicate desktop tool name: {name}")
        manifest[name] = _entry(name)
    return manifest


def audit_manifest(tools: Iterable[dict[str, Any]], manifest: dict[str, CapabilityEntry]) -> None:
    """Reject missing, extra, or mismatched entries before claiming parity."""
    expected = set(build_manifest(tools))
    actual = set(manifest)
    if expected != actual:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise PolicyError(f"manifest parity mismatch: missing={missing}, extra={extra}")
    for name, entry in manifest.items():
        if not isinstance(entry, CapabilityEntry) or entry.name != name:
            raise PolicyError(f"manifest parity invalid entry: {name}")


def _entry(name: str) -> CapabilityEntry:
    if name in _OBSERVE:
        return CapabilityEntry(name, CapabilityClass.OBSERVE, Availability.AVAILABLE)
    if name in _APPLY:
        return CapabilityEntry(name, CapabilityClass.APPLY, Availability.APPROVAL_REQUIRED)
    if name in _EXECUTE:
        return CapabilityEntry(name, CapabilityClass.EXECUTE, Availability.APPROVAL_REQUIRED)
    if name in _EXTERNAL:
        return CapabilityEntry(name, CapabilityClass.EXTERNAL, Availability.APPROVAL_REQUIRED)
    if name in _UNAVAILABLE:
        return CapabilityEntry(name, CapabilityClass.UNAVAILABLE, Availability.UNAVAILABLE, "high_risk_adapter_missing")
    return CapabilityEntry(name, CapabilityClass.UNAVAILABLE, Availability.UNAVAILABLE, "unclassified_capability")


def _tool_name(tool: dict[str, Any]) -> str:
    if not isinstance(tool, dict) or not isinstance(tool.get("function"), dict):
        raise PolicyError("desktop tool must contain a function object")
    name = tool["function"].get("name")
    if not isinstance(name, str) or not name:
        raise PolicyError("desktop tool must contain a non-empty function name")
    return name
