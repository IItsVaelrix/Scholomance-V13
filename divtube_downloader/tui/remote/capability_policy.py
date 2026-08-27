"""Explicit capability law for the remote agent profile."""

from enum import Enum
from typing import Any


class RemoteCapabilityProfile(str, Enum):
    REMOTE_READ_ONLY = "remote_read_only"
    REMOTE_DOWNLOAD_CONFIRM = "remote_download_confirm"


REMOTE_READ_ONLY_TOOLS = frozenset({
    "read_file",
    "search_code",
    "list_directory",
    "find_file",
    "telescope",
    "microscope",
    "atlas",
    "dependency_graph",
    "git_diff",
})

# Parameters that turn an otherwise read-only tool into an execution path.
# microscope reads code, but its `eval`/`args` parameters hand the target to
# code_eval and RUN it. The remote profile is read-only, so those parameters
# are stripped from the schema the remote agent is shown (it cannot ask for
# what it cannot see) and rejected server-side if one ever arrives anyway —
# a tool is only as safe as its narrowest advertised surface.
FORBIDDEN_REMOTE_PARAMETERS = frozenset({"eval", "args"})


def _strip_execution_parameters(tool: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of `tool` with execution-capable parameters removed.

    Copies rather than mutates: the same tool dict is shared with the
    desktop cockpit, which must keep its full capability.
    """
    function = tool["function"]
    parameters = function.get("parameters") or {}
    properties = parameters.get("properties") or {}
    leaked = set(properties) & FORBIDDEN_REMOTE_PARAMETERS
    if not leaked:
        return tool

    safe_properties = {k: v for k, v in properties.items() if k not in FORBIDDEN_REMOTE_PARAMETERS}
    safe_required = [r for r in parameters.get("required", []) if r not in FORBIDDEN_REMOTE_PARAMETERS]
    safe_parameters = {**parameters, "properties": safe_properties}
    if "required" in parameters:
        safe_parameters["required"] = safe_required
    return {**tool, "function": {**function, "parameters": safe_parameters}}


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
            selected.append(_strip_execution_parameters(tool))
    return sorted(selected, key=lambda tool: tool["function"]["name"])
