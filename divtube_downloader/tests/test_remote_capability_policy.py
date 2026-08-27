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
    # Deliberately NOT synthesising absent allow-list entries into the
    # catalogue. The previous version of this test did, which made a
    # three-quarters-broken allow-list look correct — the filter's shape
    # was asserted while the deployed tool set was one tool. The allow-list
    # existing in the real catalogue is now its own test below.
    catalog.append(tool("future_unknown"))
    selected = filter_remote_tools(catalog)
    assert [item["function"]["name"] for item in selected] == sorted(REMOTE_READ_ONLY_TOOLS)
    assert set(REMOTE_READ_ONLY_TOOLS) == {
        "read_file", "search_code", "list_directory", "find_file",
        "telescope", "microscope", "atlas", "dependency_graph", "git_diff",
    }


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


# ── Regression: the allow-list must name tools that actually exist ──────
# The original allow-list contained find_symbol, list_project_tree and
# read_import_graph — none of which exist in ToolService. The remote agent
# therefore received exactly ONE tool (read_file) out of 57 and could not
# search, list a directory, or navigate at all. The pre-existing test above
# hid this by SYNTHESISING the missing tools into the catalogue before
# filtering, so it asserted the filter's shape rather than the deployed
# behaviour. These tests read the real catalogue and nothing else.

def _real_catalog(monkeypatch):
    monkeypatch.setattr(ToolService, "_init_persistence", lambda _self: None)
    return ToolService().tools


def test_every_allow_listed_tool_exists_in_the_real_catalog(monkeypatch):
    present = {item["function"]["name"] for item in _real_catalog(monkeypatch)}
    missing = sorted(set(REMOTE_READ_ONLY_TOOLS) - present)
    assert not missing, f"allow-list names tools that do not exist in ToolService: {missing}"


def test_remote_agent_actually_receives_a_useful_tool_set(monkeypatch):
    """A single tool is not a working agent. This asserts the deployed
    outcome, not the filter's mechanics."""
    selected = filter_remote_tools(_real_catalog(monkeypatch))
    names = {item["function"]["name"] for item in selected}
    assert len(names) >= 6, f"remote agent only got {len(names)} tool(s): {sorted(names)}"
    for essential in ("read_file", "search_code", "list_directory"):
        assert essential in names, f"{essential} missing from the remote tool set"


def test_no_allow_listed_tool_exposes_an_execution_parameter(monkeypatch):
    """microscope reaches code_eval through its `eval`/`args` parameters.
    Handing that schema to a read-only remote profile would turn a reading
    tool into an execution path, which is the exact boundary the remote
    profile exists to hold."""
    forbidden = {"eval", "args"}
    for item in filter_remote_tools(_real_catalog(monkeypatch)):
        params = set(((item.get("function") or {}).get("parameters") or {}).get("properties", {}))
        leaked = params & forbidden
        assert not leaked, f"{item['function']['name']} exposes execution parameter(s) {sorted(leaked)}"


def test_stripping_does_not_mutate_the_shared_desktop_catalog(monkeypatch):
    """The same tool dicts back the desktop cockpit, which must keep full
    capability — the remote profile gets a copy, never a lobotomised original."""
    catalog = _real_catalog(monkeypatch)
    before = {
        item["function"]["name"]: set((item["function"].get("parameters") or {}).get("properties", {}))
        for item in catalog
    }
    filter_remote_tools(catalog)
    after = {
        item["function"]["name"]: set((item["function"].get("parameters") or {}).get("properties", {}))
        for item in catalog
    }
    assert before == after
    assert "eval" in after["microscope"], "desktop microscope lost its eval capability"


def test_remote_microscope_cannot_smuggle_eval_into_execution(monkeypatch):
    """The end-to-end property the schema stripping exists to guarantee:
    even if the model asks for eval=True, the argument never reaches the
    tool, so code_eval is never invoked from a remote turn."""
    from tui.services.prompt_service import PromptService

    remote_tools = filter_remote_tools(_real_catalog(monkeypatch))
    received = {}

    class FakeTools:
        def execute_tool(self, name, arguments, callback):
            received.update(arguments)
            return "ok"

    service = PromptService.__new__(PromptService)
    service.tools = FakeTools()
    service._execute_selected_tool(
        "microscope",
        {"path": "a.py", "symbol": "f", "eval": True, "args": ["danger"]},
        lambda _m: None,
        remote_tools,
    )
    assert "eval" not in received, "eval reached the tool despite being stripped from the schema"
    assert "args" not in received
    assert received == {"path": "a.py", "symbol": "f"}


def test_desktop_profile_still_receives_eval(monkeypatch):
    """Control: the same guard must not disarm the desktop cockpit, which
    advertises microscope's full schema and legitimately uses eval."""
    from tui.services.prompt_service import PromptService

    full_tools = _real_catalog(monkeypatch)
    received = {}

    class FakeTools:
        def execute_tool(self, name, arguments, callback):
            received.update(arguments)
            return "ok"

    service = PromptService.__new__(PromptService)
    service.tools = FakeTools()
    service._execute_selected_tool(
        "microscope", {"path": "a.py", "symbol": "f", "eval": True}, lambda _m: None, full_tools
    )
    assert received.get("eval") is True
