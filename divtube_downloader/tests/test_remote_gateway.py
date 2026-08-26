import asyncio
import json

import pytest
from aiohttp import ClientSession, TCPConnector

from tui.remote.config import RemoteCompanionConfig
from tui.remote.event_hub import RemoteEventHub
from tui.remote.gateway import RemoteGateway
from tui.remote.pairing import PairingStore
from tui.remote.protocol import ProtocolError


def config(mode="status_only", enabled=True):
    return RemoteCompanionConfig(enabled=enabled, lan_enabled=False, mode=mode)


def test_disabled_gateway_starts_no_site(tmp_path):
    asyncio.run(_disabled_gateway_starts_no_site(tmp_path))


async def _disabled_gateway_starts_no_site(tmp_path):
    gateway = RemoteGateway(config(enabled=False), PairingStore(tmp_path / "pair"), RemoteEventHub("pc-1"), tmp_path)
    assert await gateway.start() is None
    assert gateway.bound_port is None


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
