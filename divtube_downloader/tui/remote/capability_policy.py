"""Explicit capability law for the remote agent profile."""

from enum import Enum
from typing import Any


class RemoteCapabilityProfile(str, Enum):
    REMOTE_READ_ONLY = "remote_read_only"
    REMOTE_DOWNLOAD_CONFIRM = "remote_download_confirm"


REMOTE_READ_ONLY_TOOLS = frozenset({
    "read_file",
    "find_symbol",
    "list_project_tree",
    "read_import_graph",
})


def filter_remote_tools(all_tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tool in all_tools:
        if not isinstance(tool, dict) or not isinstance(tool.get("function"), dict):
            raise ValueError("Every tool must contain a function object.")
        name = tool["function"].get("name")
        if not isinstance(name, str) or not name:
            raise ValueError("Every tool must contain a function name.")
        if name in seen:
            raise ValueError(f"duplicate remote tool name: {name}")
        seen.add(name)
        if name in REMOTE_READ_ONLY_TOOLS:
            selected.append(tool)
    return sorted(selected, key=lambda tool: tool["function"]["name"])
