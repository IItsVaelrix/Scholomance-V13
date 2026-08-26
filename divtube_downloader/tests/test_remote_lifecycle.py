import asyncio

from tui.remote.config import RemoteCompanionConfig
from tui.remote.event_hub import RemoteEventHub
from tui.remote.gateway import RemoteGateway
from tui.remote.pairing import PairingStore


def test_disabled_lifecycle_constructs_and_starts_no_listener(tmp_path):
    config = RemoteCompanionConfig.from_env({})
    gateway = RemoteGateway(config, PairingStore(tmp_path / "pair"), RemoteEventHub("pc-1"), tmp_path / "tls")
    asyncio.run(gateway.start())
    assert gateway.runner is None
    asyncio.run(gateway.stop())
