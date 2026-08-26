import pytest

from tui.remote.capability_policy import (
    REMOTE_READ_ONLY_TOOLS,
    RemoteCapabilityProfile,
    filter_remote_tools,
)
from tui.services.tool_service import ToolService


def tool(name, *, is_coding_action=False):
    item = {"type": "function", "function": {"name": name, "description": name, "parameters": {}}}
    if is_coding_action:
        item["is_coding_action"] = True
    return item


def test_remote_profile_and_exact_positive_allow_list(monkeypatch):
    assert RemoteCapabilityProfile.REMOTE_READ_ONLY.value == "remote_read_only"
    assert RemoteCapabilityProfile.REMOTE_DOWNLOAD_CONFIRM.value == "remote_download_confirm"
    monkeypatch.setattr(ToolService, "_init_persistence", lambda _self: None)
    catalog = ToolService().tools
    present_names = {item["function"]["name"] for item in catalog}
    catalog.extend(tool(name) for name in REMOTE_READ_ONLY_TOOLS - present_names)
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
