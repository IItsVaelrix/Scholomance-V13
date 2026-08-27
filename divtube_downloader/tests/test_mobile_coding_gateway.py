import asyncio
import json

from aiohttp import ClientSession, TCPConnector

from tui.remote.coding_event_hub import CodingEventHub
from tui.remote.config import RemoteCompanionConfig
from tui.remote.event_hub import RemoteEventHub
from tui.remote.gateway import RemoteGateway
from tui.remote.pairing import PairingStore


def test_v2_coding_socket_requires_coding_partner_mode_and_gets_a_v2_snapshot(tmp_path):
    """Routing a V2 client through the V1 event stream would silently corrupt its state."""
    asyncio.run(_v2_socket_isolated_from_v1(tmp_path))


async def _v2_socket_isolated_from_v1(tmp_path):
    config = RemoteCompanionConfig(enabled=True, lan_enabled=False, mode="coding_partner")
    store = PairingStore(tmp_path / "pair")
    coding_hub = CodingEventHub("pc-1")
    coding_hub.set_snapshot({"tasks": []})
    seen = []

    def dispatch(device_id, envelope):
        seen.append((device_id, envelope.message_type))

    gateway = RemoteGateway(
        config, store, RemoteEventHub("pc-1"), tmp_path / "tls", port=0,
        coding_event_hub=coding_hub, coding_dispatcher=dispatch,
    )
    await gateway.start()
    try:
        offer = store.create_offer("127.0.0.1", gateway.bound_port, gateway.tls_identity.fingerprint)
        async with ClientSession(connector=TCPConnector(ssl=False)) as client:
            paired = await (await client.post(gateway.base_url + "/v1/pair", json={"offerToken": offer.token, "deviceLabel": "Pixel"})).json()
            headers = {"Authorization": "Bearer " + paired["bearerToken"]}
            socket = await client.ws_connect(gateway.base_url + "/v1/events?protocol=divtube-remote-v2", headers=headers)
            snapshot = await socket.receive_json()
            assert snapshot["protocolVersion"] == "divtube-remote-v2"
            assert snapshot["type"] == "task.snapshot"
            await socket.send_json({"protocolVersion": "divtube-remote-v2", "type": "task.create", "requestId": "req-1", "payload": {"text": "inspect note"}})
            await asyncio.sleep(0.1)
            assert seen == [(paired["deviceId"], "task.create")]
            await socket.close()
    finally:
        await gateway.stop()
