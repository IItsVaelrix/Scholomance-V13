import asyncio
import json

import pytest
from aiohttp import ClientSession, TCPConnector

from tui.remote.config import RemoteCompanionConfig
from tui.remote.event_hub import RemoteEventHub
from tui.remote.gateway import RemoteGateway
from tui.remote.pairing import PairingStore
from tui.remote.protocol import ProtocolError
from tui.services.tool_service import ToolService


def config(mode="status_only", enabled=True):
    return RemoteCompanionConfig(enabled=enabled, lan_enabled=False, mode=mode)


def test_disabled_gateway_starts_no_site(tmp_path):
    asyncio.run(_disabled_gateway_starts_no_site(tmp_path))


async def _disabled_gateway_starts_no_site(tmp_path):
    gateway = RemoteGateway(config(enabled=False), PairingStore(tmp_path / "pair"), RemoteEventHub("pc-1"), tmp_path)
    assert await gateway.start() is None
    assert gateway.bound_port is None


def test_gateway_binds_a_fixed_port_when_one_is_requested(tmp_path):
    asyncio.run(_gateway_binds_a_fixed_port(tmp_path))


async def _gateway_binds_a_fixed_port(tmp_path):
    """Default behavior (port=0) binds an OS-assigned ephemeral port, which
    changes every restart — some networks (router/AP firewall rules,
    client-isolation configs) appear to treat that high ephemeral range
    differently from an ordinary fixed port. RemoteGateway must actually
    bind the requested port, not just accept it as a constructor arg."""
    import socket as socket_module
    probe = socket_module.socket(socket_module.AF_INET, socket_module.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    free_port = probe.getsockname()[1]
    probe.close()

    gateway = RemoteGateway(
        config(), PairingStore(tmp_path / "pair"), RemoteEventHub("pc-1"), tmp_path, port=free_port,
    )
    try:
        bound = await gateway.start()
        assert bound == free_port
        assert gateway.bound_port == free_port
    finally:
        await gateway.stop()


def test_pair_auth_status_and_snapshot_first_websocket(tmp_path):
    asyncio.run(_pair_auth_status_and_snapshot_first_websocket(tmp_path))


async def _pair_auth_status_and_snapshot_first_websocket(tmp_path):
    store = PairingStore(tmp_path / "pair")
    hub = RemoteEventHub("pc-1")
    gateway = RemoteGateway(config(), store, hub, tmp_path / "tls", port=0)
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        connector = TCPConnector(ssl=False)
        async with ClientSession(connector=connector) as client:
            response = await client.post(gateway.base_url + "/v1/pair", json={"offerToken": offer.token, "deviceLabel": "Pixel"})
            assert response.status == 200
            paired = await response.json()
            assert offer.token not in json.dumps(paired)
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}
            status = await client.get(gateway.base_url + "/v1/status", headers=headers)
            assert status.status == 200
            assert (await status.json())["type"] == "status.snapshot"
            socket = await client.ws_connect(gateway.base_url + "/v1/events", headers=headers)
            first = await socket.receive_json()
            assert first["type"] == "status.snapshot"
            live = json.loads(hub.publish("chat.activity", {"state": "thinking"}))
            second = await socket.receive_json()
            assert first["seq"] < second["seq"] == live["seq"]
            await socket.close()
            denied = await client.get(gateway.base_url + "/v1/status")
            assert denied.status == 401
    finally:
        await gateway.stop()


def test_mode_gates_requests_and_body_limit(tmp_path):
    asyncio.run(_mode_gates_requests_and_body_limit(tmp_path))


async def _mode_gates_requests_and_body_limit(tmp_path):
    store = PairingStore(tmp_path / "pair")
    gateway = RemoteGateway(config("status_only"), store, RemoteEventHub("pc-1"), tmp_path / "tls", port=0)
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        async with ClientSession(connector=TCPConnector(ssl=False)) as client:
            paired = await (await client.post(gateway.base_url + "/v1/pair", json={"offerToken": offer.token, "deviceLabel": "Pixel"})).json()
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}
            socket = await client.ws_connect(gateway.base_url + "/v1/events", headers=headers)
            await socket.receive_json()
            await socket.send_str(json.dumps({"protocolVersion":"divtube-remote-v1","type":"chat.turn.request","requestId":"r-1","payload":{"text":"hello","conversation":"main"}}))
            error = await socket.receive_json()
            assert error["type"] == "error"
            assert error["payload"]["code"] == "mode_forbidden"
            await socket.close()
            too_large = await client.post(gateway.base_url + "/v1/pair", data=b"x" * 32769, headers={"Content-Type": "application/json"})
            assert too_large.status == 413
    finally:
        await gateway.stop()


def test_per_device_chat_and_download_rate_limits(tmp_path):
    gateway = RemoteGateway(config("downloads_confirmed"), PairingStore(tmp_path / "pair"), RemoteEventHub("pc-1"), tmp_path / "tls", clock=lambda: 100.0)
    for _ in range(30):
        gateway._enforce_rate_limit("phone-a", "chat.turn.request")
    with pytest.raises(ProtocolError, match="rate limit"):
        gateway._enforce_rate_limit("phone-a", "chat.turn.request")
    for _ in range(6):
        gateway._enforce_rate_limit("phone-b", "download.request")
    with pytest.raises(ProtocolError, match="rate limit"):
        gateway._enforce_rate_limit("phone-b", "download.request")


# ── End-to-end chat dispatch ────────────────────────────────────────────
# The event hub is thoroughly tested in isolation and pairing/auth are
# tested here, but nothing covered a chat.turn.request travelling the whole
# way: websocket -> gateway -> RemoteCockpitAdapter -> chat.activity back
# out. That gap is why a chat turn that never starts produced no reply and
# no "working" indicator, with no error anywhere to explain it.

def test_chat_turn_request_reaches_the_adapter_and_reports_activity(tmp_path):
    asyncio.run(_chat_turn_reaches_adapter(tmp_path))


async def _chat_turn_reaches_adapter(tmp_path):
    from tui.services.remote_cockpit_adapter import RemoteCockpitAdapter
    from tui.services.tool_service import ToolService

    class StubPromptService:
        """Stands in for the real provider call, but keeps the real tool
        catalogue so the remote tool filter runs exactly as in production."""
        def __init__(self):
            self.tools = ToolService.__new__(ToolService)
            self.tools.tools = _catalog()
            self.calls = []

        def prompt(self, text, callback, *, agent_id, tools, on_finished, **_kwargs):
            self.calls.append({"text": text, "agent_id": agent_id, "tools": tools})
            callback("looking at the code")
            on_finished(True, "done")

    prompt_service = StubPromptService()
    store = PairingStore(tmp_path / "pair")
    hub = RemoteEventHub("pc-1")
    adapter = RemoteCockpitAdapter(prompt_service, hub, download_queue=None)
    gateway = RemoteGateway(
        config(mode="downloads_confirmed"), store, hub, tmp_path / "tls",
        port=0, dispatcher=adapter.dispatch,
    )
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        async with ClientSession(connector=TCPConnector(ssl=False)) as client:
            paired = await (await client.post(
                gateway.base_url + "/v1/pair",
                json={"offerToken": offer.token, "deviceLabel": "Pixel"},
            )).json()
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}
            socket = await client.ws_connect(gateway.base_url + "/v1/events", headers=headers)
            assert (await socket.receive_json())["type"] == "status.snapshot"

            await socket.send_json({
                "protocolVersion": "divtube-remote-v1",
                "type": "chat.turn.request",
                "requestId": "req-1",
                "payload": {"text": "how does pairing work?", "conversation": "main"},
            })

            seen = []
            for _ in range(4):
                event = await asyncio.wait_for(socket.receive_json(), timeout=5)
                seen.append(event)
                if event["type"] == "chat.activity" and event["payload"].get("state") == "idle":
                    break
            await socket.close()

        types = [event["type"] for event in seen]
        assert "chat.activity" in types, f"no activity event reached the client: {seen}"
        assert seen[0]["payload"].get("state") == "thinking", seen[0]
        assert "chat.message" in types, f"no assistant message reached the client: {seen}"
        assert prompt_service.calls, "the adapter never called the prompt service"
        # The remote turn must carry the reduced tool set, not the full one.
        remote_tool_names = {t["function"]["name"] for t in prompt_service.calls[0]["tools"]}
        assert "run_command" not in remote_tool_names
        assert "read_file" in remote_tool_names
    finally:
        await gateway.stop()


def _catalog():
    import types as _types
    service = ToolService.__new__(ToolService)
    ToolService.__init__.__wrapped__(service) if hasattr(ToolService.__init__, "__wrapped__") else None
    return _REAL_CATALOG


try:
    _svc = ToolService.__new__(ToolService)
    _svc._init_persistence = lambda: None
    ToolService.__init__(_svc)
    _REAL_CATALOG = _svc.tools
except Exception:  # pragma: no cover - catalogue construction must not break collection
    _REAL_CATALOG = []


def test_events_published_from_a_worker_thread_still_reach_the_client(tmp_path):
    """Production fidelity: PromptService.prompt() runs the turn on a daemon
    thread (prompt_service.py), so the adapter's callback/on_finished — and
    therefore event_hub.publish — execute OFF the event loop. asyncio.Queue
    is not thread-safe: put_nowait from a foreign thread appends the item but
    cannot wake the coroutine awaiting queue.get(), so events can sit
    undelivered. The stubbed test above missed this by calling back
    synchronously on the loop thread, which is exactly the fixture blind spot
    that lets a broken transport pass a green suite."""
    asyncio.run(_events_from_worker_thread(tmp_path))


async def _events_from_worker_thread(tmp_path):
    import threading

    from tui.services.remote_cockpit_adapter import RemoteCockpitAdapter

    class ThreadedPromptService:
        def __init__(self):
            self.tools = ToolService.__new__(ToolService)
            self.tools.tools = _REAL_CATALOG
            self.done = threading.Event()

        def prompt(self, text, callback, *, agent_id, tools, on_finished, **_kwargs):
            def run():
                callback("reading the file")
                on_finished(True, "done")
                self.done.set()
            threading.Thread(target=run, daemon=True).start()

    prompt_service = ThreadedPromptService()
    store = PairingStore(tmp_path / "pair")
    hub = RemoteEventHub("pc-1")
    adapter = RemoteCockpitAdapter(prompt_service, hub, download_queue=None)
    gateway = RemoteGateway(
        config(mode="downloads_confirmed"), store, hub, tmp_path / "tls",
        port=0, dispatcher=adapter.dispatch,
    )
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        async with ClientSession(connector=TCPConnector(ssl=False)) as client:
            paired = await (await client.post(
                gateway.base_url + "/v1/pair",
                json={"offerToken": offer.token, "deviceLabel": "Pixel"},
            )).json()
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}
            socket = await client.ws_connect(gateway.base_url + "/v1/events", headers=headers)
            await socket.receive_json()  # snapshot

            await socket.send_json({
                "protocolVersion": "divtube-remote-v1",
                "type": "chat.turn.request",
                "requestId": "req-thread",
                "payload": {"text": "hello", "conversation": "main"},
            })

            seen = []
            try:
                for _ in range(4):
                    seen.append(await asyncio.wait_for(socket.receive_json(), timeout=5))
            except asyncio.TimeoutError:
                pass
            await socket.close()

        types = [e["type"] for e in seen]
        assert "chat.message" in types, (
            "assistant output published from the worker thread never reached the "
            f"client; only got {types}"
        )
        assert any(
            e["type"] == "chat.activity" and e["payload"].get("state") == "idle" for e in seen
        ), f"turn never reported completion; got {types}"
    finally:
        await gateway.stop()


def test_status_snapshot_reports_real_cockpit_state_and_jobs(tmp_path):
    """A reconnecting phone is told what is actually happening.

    Both snapshot call sites hardcoded cockpit={"state":"idle"} and
    active_jobs=[], so a device that reconnected mid-download saw zero jobs
    until the next progress event happened to fire — the PDR's acceptance
    criterion (snapshot carries agent state and summarized job progress) was
    being met only by client-side event accumulation, which a fresh
    reconnect does not have. RemoteDownloadQueue.snapshot() already returns
    the real list; nothing called it.
    """
    asyncio.run(_status_snapshot_reports_real_state(tmp_path))


async def _status_snapshot_reports_real_state(tmp_path):
    live_jobs = [{"jobId": "job-1", "mediaType": "video", "percent": 42, "state": "downloading"}]
    store = PairingStore(tmp_path / "pair")
    hub = RemoteEventHub("pc-1")
    gateway = RemoteGateway(
        config(), store, hub, tmp_path / "tls", port=0,
        snapshot_provider=lambda: ({"state": "downloading"}, live_jobs),
    )
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        async with ClientSession(connector=TCPConnector(ssl=False)) as client:
            paired = await (await client.post(
                gateway.base_url + "/v1/pair",
                json={"offerToken": offer.token, "deviceLabel": "Pixel"},
            )).json()
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}

            http_snapshot = await (await client.get(gateway.base_url + "/v1/status", headers=headers)).json()
            assert http_snapshot["payload"]["cockpit"]["state"] == "downloading", http_snapshot
            assert http_snapshot["payload"]["activeJobs"] == live_jobs, http_snapshot

            socket = await client.ws_connect(gateway.base_url + "/v1/events", headers=headers)
            first = await socket.receive_json()
            assert first["payload"]["activeJobs"] == live_jobs, first
            await socket.close()
    finally:
        await gateway.stop()


def test_snapshot_provider_failure_degrades_to_idle(tmp_path):
    """The snapshot must never be the thing that breaks a reconnect."""
    asyncio.run(_snapshot_provider_failure_degrades(tmp_path))


async def _snapshot_provider_failure_degrades(tmp_path):
    def broken():
        raise RuntimeError("queue exploded")

    store = PairingStore(tmp_path / "pair")
    gateway = RemoteGateway(
        config(), store, RemoteEventHub("pc-1"), tmp_path / "tls", port=0,
        snapshot_provider=broken,
    )
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        async with ClientSession(connector=TCPConnector(ssl=False)) as client:
            paired = await (await client.post(
                gateway.base_url + "/v1/pair",
                json={"offerToken": offer.token, "deviceLabel": "Pixel"},
            )).json()
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}
            snapshot = await (await client.get(gateway.base_url + "/v1/status", headers=headers)).json()
            assert snapshot["payload"]["cockpit"]["state"] == "idle"
            assert snapshot["payload"]["activeJobs"] == []
    finally:
        await gateway.stop()


def test_snapshot_provider_failure_is_marked_degraded_not_indistinguishable_from_real_idle():
    """A phone receiving {"state": "idle"} must be able to tell 'the host
    really is idle' apart from 'the host's status is unreachable' — a real
    host-side error masked as normal idle state is exactly the failure mode
    a reconnecting client has no other way to detect."""
    import unittest as _unittest

    def broken():
        raise RuntimeError("queue exploded")

    gateway = RemoteGateway(
        config(), None, RemoteEventHub("pc-1"), "/tmp/unused-tls-dir",
        snapshot_provider=broken,
    )
    case = _unittest.TestCase()
    with case.assertLogs("tui.remote.gateway", level="WARNING") as cm:
        cockpit, active_jobs = gateway._current_snapshot()
    assert cockpit["state"] == "idle"
    assert cockpit.get("degraded") is True
    assert active_jobs == []
    assert any("snapshot" in msg.lower() for msg in cm.output)
