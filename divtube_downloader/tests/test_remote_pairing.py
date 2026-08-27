import json
import stat

import pytest

from tui.remote.config import RemoteCompanionConfig
from tui.remote.pairing import PairingError, PairingStore


class Clock:
    def __init__(self, value=1_700_000_000.0):
        self.value = value

    def __call__(self):
        return self.value


def token_source(*tokens):
    values = iter(tokens)
    return lambda _size: next(values)


def test_remote_config_defaults_to_no_listener():
    config = RemoteCompanionConfig.from_env({})

    assert config.enabled is False
    assert config.lan_enabled is False
    assert config.mode == "off"
    assert config.listener_enabled is False
    assert config.bind_host is None
    assert config.port == 0


def test_remote_config_port_defaults_to_ephemeral_when_unset():
    config = RemoteCompanionConfig.from_env({})
    assert config.port == 0


def test_remote_config_port_can_be_pinned():
    config = RemoteCompanionConfig.from_env({"DIVTUBE_REMOTE_COMPANION_PORT": "8766"})
    assert config.port == 8766


@pytest.mark.parametrize("value", ["not-a-number", "-1", "0", ""])
def test_remote_config_port_fails_closed_to_ephemeral_on_invalid_input(value):
    config = RemoteCompanionConfig.from_env({"DIVTUBE_REMOTE_COMPANION_PORT": value})
    assert config.port == 0


def test_lan_flag_is_inert_until_feature_is_explicitly_enabled():
    config = RemoteCompanionConfig.from_env({"DIVTUBE_REMOTE_COMPANION_LAN_ENABLED": "true"})

    assert config.lan_enabled is True
    assert config.listener_enabled is False
    assert config.bind_host is None


@pytest.mark.parametrize("mode", ["future", "", "downloads", "STATUS_ONLY"])
def test_unknown_remote_mode_fails_closed(mode):
    config = RemoteCompanionConfig.from_env({
        "DIVTUBE_REMOTE_COMPANION_ENABLED": "true",
        "DIVTUBE_REMOTE_COMPANION_LAN_ENABLED": "true",
        "DIVTUBE_REMOTE_COMPANION_MODE": mode,
    })

    assert config.mode == "off"
    assert config.listener_enabled is False


def test_enabled_remote_mode_binds_loopback_unless_lan_is_also_enabled():
    loopback = RemoteCompanionConfig.from_env({
        "DIVTUBE_REMOTE_COMPANION_ENABLED": "true",
        "DIVTUBE_REMOTE_COMPANION_MODE": "status_only",
    })
    lan = RemoteCompanionConfig.from_env({
        "DIVTUBE_REMOTE_COMPANION_ENABLED": "true",
        "DIVTUBE_REMOTE_COMPANION_LAN_ENABLED": "true",
        "DIVTUBE_REMOTE_COMPANION_MODE": "status_only",
    })

    assert (loopback.listener_enabled, loopback.bind_host) == (True, "127.0.0.1")
    assert (lan.listener_enabled, lan.bind_host) == (True, "0.0.0.0")


def test_pairing_offer_expires_after_ten_minutes_and_cannot_be_redeemed(tmp_path):
    clock = Clock()
    store = PairingStore(tmp_path, now=clock, token_factory=token_source("offer-token"))
    offer = store.create_offer("127.0.0.1", 8443, "AB:CD")

    assert offer.expires_at == 1_700_000_600.0
    clock.value = offer.expires_at
    with pytest.raises(PairingError, match="expired"):
        store.redeem(offer.token, "Pixel")


def test_pairing_offer_is_single_use_and_persists_hashes_not_tokens(tmp_path):
    clock = Clock()
    store = PairingStore(
        tmp_path,
        now=clock,
        token_factory=token_source("offer-raw-token", "device-raw-token"),
        random_bytes=lambda size: b"x" * size,
    )
    offer = store.create_offer("127.0.0.1", 8443, "AB:CD")
    credentials = store.redeem(offer.token, "Pixel")

    assert credentials.device_id
    assert credentials.token == "device-raw-token"
    with pytest.raises(PairingError, match="used"):
        store.redeem(offer.token, "Pixel again")

    state_path = tmp_path / "pairings.json"
    saved = state_path.read_text(encoding="utf-8")
    state = json.loads(saved)
    assert "offer-raw-token" not in saved
    assert "device-raw-token" not in saved
    assert state["offers"]
    assert state["devices"]
    assert state["offers"][0]["tokenHash"]["algorithm"] == "scrypt"
    assert state["devices"][0]["tokenHash"]["algorithm"] == "scrypt"
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600


def test_paired_credential_authenticates_then_revocation_denies_it(tmp_path):
    store = PairingStore(tmp_path, token_factory=token_source("offer", "credential"))
    offer = store.create_offer("127.0.0.1", 8443, "AB:CD")
    credentials = store.redeem(offer.token, "Pixel")

    assert store.authenticate(credentials.device_id, credentials.token) is True
    assert store.revoke(credentials.device_id) is True
    assert store.authenticate(credentials.device_id, credentials.token) is False


def test_five_failed_authentications_rate_limit_the_paired_device(tmp_path):
    clock = Clock()
    store = PairingStore(tmp_path, now=clock, token_factory=token_source("offer", "credential"))
    credentials = store.redeem(store.create_offer("127.0.0.1", 8443, "AB:CD").token, "Pixel")

    for _ in range(5):
        assert store.authenticate(credentials.device_id, "not-the-token") is False
    assert store.authenticate(credentials.device_id, credentials.token) is False

    clock.value += 61
    assert store.authenticate(credentials.device_id, credentials.token) is True


@pytest.mark.parametrize("corrupt", [
    lambda state: state.update(offers=["not-a-record"]),
    lambda state: state["offers"][0].pop("host"),
    lambda state: state["offers"][0].update(unexpected=True),
    lambda state: state["offers"][0].update(port="8443"),
    lambda state: state["offers"][0].update(certificateFingerprint="not-hex"),
    lambda state: state["offers"][0].update(certificateFingerprint="AB::CD"),
    lambda state: state["offers"][0].update(expiresAt="soon"),
    lambda state: state["offers"][0].update(used=1),
    lambda state: state["offers"][0].update(tokenHash={"algorithm": "scrypt", "salt": "!!!", "digest": "x"}),
    lambda state: state.update(devices=["not-a-record"]),
    lambda state: state["devices"][0].pop("deviceId"),
    lambda state: state["devices"][0].update(unexpected=True),
    lambda state: state["devices"][0].update(label=[]),
    lambda state: state["devices"][0].update(revoked=0),
    lambda state: state["devices"][0].update(failureTimes=["never"]),
    lambda state: state["devices"][0].update(tokenHash={"algorithm": "pbkdf2", "salt": "x", "digest": "x"}),
])
def test_corrupt_persisted_pairing_records_always_raise_pairing_error(tmp_path, corrupt):
    store = PairingStore(tmp_path, token_factory=token_source("offer", "credential"))
    credentials = store.redeem(store.create_offer("127.0.0.1", 8443, "AB:CD").token, "Pixel")
    state = json.loads(store.state_path.read_text(encoding="utf-8"))
    corrupt(state)
    store.state_path.write_text(json.dumps(state), encoding="utf-8")

    with pytest.raises(PairingError):
        store.authenticate(credentials.device_id, credentials.token)
