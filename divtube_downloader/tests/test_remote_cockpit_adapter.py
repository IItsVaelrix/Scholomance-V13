import json

from tui.remote.event_hub import RemoteEventHub
from tui.services.remote_cockpit_adapter import RemoteCockpitAdapter, sanitize_remote_text


class Tools:
    tools = [
        {"type":"function", "function":{"name":"read_file", "parameters":{}}},
        {"type":"function", "function":{"name":"run_command", "parameters":{}}},
    ]


class FakePrompt:
    def __init__(self):
        self.tools = Tools()
        self.calls = []

    def prompt(self, text, callback, **kwargs):
        self.calls.append((text, kwargs))
        self.callback = callback
        self.finished = kwargs["on_finished"]


def events(hub):
    return [json.loads(item) for item in hub.backlog()]


def test_adapter_is_device_scoped_single_flight_and_releases_on_terminal():
    prompt = FakePrompt()
    hub = RemoteEventHub("pc-1")
    adapter = RemoteCockpitAdapter(prompt, hub)

    assert adapter.submit_chat("phone-a", "r-1", "hello") is True
    assert adapter.submit_chat("phone-a", "r-2", "again") is False
    assert prompt.calls[0][1]["agent_id"] == "remote:phone-a:main"
    assert [item["function"]["name"] for item in prompt.calls[0][1]["tools"]] == ["read_file"]
    prompt.callback("[bold]Hello[/] /home/deck/secret")
    prompt.finished(True, "complete")
    assert adapter.submit_chat("phone-a", "r-3", "next") is True
    emitted = events(hub)
    assert any(event["type"] == "chat.message" and "/home/deck" not in event["payload"]["text"] for event in emitted)
    assert any(event["type"] == "chat.message" and event["payload"]["terminal"] is True for event in emitted)
    assert any(event["type"] == "chat.activity" and event["payload"]["state"] == "idle" for event in emitted)


def test_sanitizer_removes_markup_controls_and_absolute_paths():
    text = sanitize_remote_text("[red]bad[/]\x00 /etc/passwd C:\\Users\\name\\secret")
    assert text == "bad [local path] [local path]"
