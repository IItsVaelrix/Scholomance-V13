import pytest

from tui.services.prompt_service import PromptService, RemoteToolPolicyError


def tool(name):
    return {"type": "function", "function": {"name": name, "parameters": {}}}


class FakeTools:
    def __init__(self):
        self.tools = [tool("read_file"), tool("run_command")]
        self.calls = []

    def execute_tool(self, name, arguments, callback, agent_id=None):
        self.calls.append((name, arguments))
        return "ok"


def service():
    value = PromptService.__new__(PromptService)
    value.tools = FakeTools()
    return value


def test_desktop_default_selects_all_tools_and_explicit_list_is_exact():
    value = service()
    assert [t["function"]["name"] for t in value._select_tools(None)] == ["read_file", "run_command"]
    assert [t["function"]["name"] for t in value._select_tools([tool("read_file")])] == ["read_file"]


def test_unadvertised_tool_execution_is_rejected_before_tool_service():
    value = service()
    with pytest.raises(RemoteToolPolicyError, match="not advertised"):
        value._execute_selected_tool("run_command", {}, lambda _m: None, [tool("read_file")])
    assert value.tools.calls == []
    assert value._execute_selected_tool("read_file", {"path": "README.md"}, lambda _m: None, [tool("read_file")]) == "ok"
