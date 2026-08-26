import pytest

from tui.remote.capability_policy import (
    REMOTE_READ_ONLY_TOOLS,
    RemoteCapabilityProfile,
    filter_remote_tools,
)

CURRENT_TOOL_NAMES = (
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
)


def tool(name, *, is_coding_action=False):
    item = {"type": "function", "function": {"name": name, "description": name, "parameters": {}}}
    if is_coding_action:
        item["is_coding_action"] = True
    return item


def test_remote_profile_and_exact_positive_allow_list():
    assert RemoteCapabilityProfile.REMOTE_READ_ONLY.value == "remote_read_only"
    assert RemoteCapabilityProfile.REMOTE_DOWNLOAD_CONFIRM.value == "remote_download_confirm"
    catalog = [tool(name) for name in CURRENT_TOOL_NAMES]
    catalog.extend(tool(name) for name in REMOTE_READ_ONLY_TOOLS - {"read_file"})
    catalog.append(tool("future_unknown"))
    selected = filter_remote_tools(catalog)
    assert [item["function"]["name"] for item in selected] == sorted(REMOTE_READ_ONLY_TOOLS)
    assert set(REMOTE_READ_ONLY_TOOLS) == {"read_file", "find_symbol", "list_project_tree", "read_import_graph"}


def test_unsafe_tools_absent_even_when_marked_non_coding():
    selected = filter_remote_tools([
        tool("run_command"), tool("bash_session"), tool("python_exec"),
        tool("replace_file_content"), tool("future_unknown"),
    ])
    assert selected == []


def test_duplicate_names_are_rejected():
    with pytest.raises(ValueError, match="duplicate"):
        filter_remote_tools([tool("read_file"), tool("read_file")])


def test_malformed_tool_entries_are_rejected():
    with pytest.raises(ValueError):
        filter_remote_tools([{}])
