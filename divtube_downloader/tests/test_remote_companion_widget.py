import ipaddress
import socket
from unittest import mock

import qrcode

from tui.remote.net import lan_ipv4
from tui.ui.app import _compact_fingerprint, _pairing_host
from tui.ui.widgets.remote_companion_status import RemoteCompanionStatus, pairing_qr_text


def test_widget_status_text_is_descriptive_without_color():
    widget = RemoteCompanionStatus()
    assert "Disabled" in widget.status_text("disabled")
    assert "Offline" in widget.status_text("offline")
    assert "Connected" in widget.status_text("paired")
    assert widget.id == "remote-companion-status"


def test_pairing_qr_has_expiry_and_no_control_characters():
    rendered = pairing_qr_text("divtube://pair?offer=opaque", "10 minutes")
    assert "Expires in 10 minutes" in rendered
    assert all(character == "\n" or ord(character) >= 0x20 for character in rendered)


def test_lan_ipv4_returns_a_real_routable_address():
    """This is the standard connect()-a-UDP-socket-and-read-getsockname()
    idiom for local LAN IP discovery — no packet is ever sent, it only
    makes the kernel pick a source address for the route. Requires this
    test environment to have a network route at all; if that's ever not
    true here, _lan_ipv4 must degrade to None (asserted separately)."""
    ip = lan_ipv4()
    assert ip is not None
    assert not ipaddress.ip_address(ip).is_loopback


def test_lan_ipv4_returns_none_on_socket_failure():
    with mock.patch("tui.remote.net.socket.socket") as mock_socket_cls:
        mock_socket_cls.return_value.__enter__.side_effect = OSError("no route")
        assert lan_ipv4() is None


def test_pairing_host_uses_lan_ipv4_directly_not_a_hostname():
    """A hostname requires DNS/mDNS resolution to succeed AND resolve to a
    reachable address family — two independent ways to fail that a plain
    IP literal doesn't have. See _pairing_host's docstring for the full
    history of why a hostname-based approach broke twice: once because
    Android's resolver needs a .local suffix, and again because avahi's
    .local record includes an IPv6 address the gateway never listens on."""
    host = _pairing_host(lan_enabled=True)
    assert not ipaddress.ip_address(host).is_loopback  # raises ValueError if not a plain IP at all


def test_pairing_host_falls_back_to_local_suffix_when_ip_discovery_fails():
    with mock.patch("tui.ui.app.lan_ipv4", return_value=None):
        assert _pairing_host(lan_enabled=True) == f"{socket.gethostname()}.local"


def test_pairing_host_stays_loopback_when_lan_disabled():
    assert _pairing_host(lan_enabled=False) == "127.0.0.1"


def test_compact_fingerprint_strips_colons():
    fp = "AE:AC:1E:0A:59:44:11:10:3D:0F:7E:ED:25:93:95:76:15:04:7E:23:B9:EE:B5:A7:F6:20:33:22:53:9B:C3:69"
    compact = _compact_fingerprint(fp)
    assert ":" not in compact
    assert compact == "AEAC1E0A594411103D0F7EED2593957615047E23B9EEB5A7F6203322539BC369"
    # This is the exact transform PinnedCockpitClient.kt's fingerprintBytes()
    # already applies (`fingerprint.replace(":", "")`) before turning the
    # value into bytes — so the already-installed Android app decodes this
    # exactly the same as the colon-having form, no rebuild required.
    assert compact == fp.replace(":", "")


def test_compact_fingerprint_is_idempotent_on_a_bare_hex_string():
    already_bare = "aeac1e0a594411103d0f7eed2593957615047e23b9eeb5a7f6203322539bc369"
    assert _compact_fingerprint(already_bare) == already_bare


def test_pairing_qr_shrinks_meaningfully_with_a_realistic_uri():
    """Regression guard for the actual bug report: a real pairing URI (long
    host, full SHA-256 fingerprint, base64url offer token, protocol marker)
    used to render a 63-character-wide QR — wider than most terminal/TUI
    panels can show without horizontal scrolling, which crops the code and
    makes it unscannable on a phone even though pairing itself is sound.
    Both levers (compact fingerprint + lower error-correction, since this
    is read off a screen, not a damage-prone printed sticker) must keep the
    rendered width comfortably under that threshold for a realistic offer
    shape, not just a short test fixture."""
    raw_fingerprint = ":".join(f"{b:02X}" for b in range(32))  # a real SHA-256 has 32 bytes
    uri = "divtube://pair?" + "&".join([
        "host=steamdeck.local",
        "port=33715",
        f"fingerprint={_compact_fingerprint(raw_fingerprint)}",
        "offer=OzjkiyFMt7Hk7ICwsPEJGiE69TjyNvxxN2_wQx-7J6o",
        "protocol=divtube-remote-v1",
    ])
    rendered = pairing_qr_text(uri, "10 minutes")
    qr_lines = [line for line in rendered.split("\n") if line and not line.startswith("Expires")]
    width = max(len(line) for line in qr_lines)
    assert width <= 55, f"QR rendered {width} chars wide — regressed back toward the unscannable range"


def test_pairing_qr_uses_low_error_correction_for_screen_display():
    qr = qrcode.QRCode(border=1, error_correction=qrcode.constants.ERROR_CORRECT_L)
    qr.add_data("divtube://pair?offer=opaque")
    qr.make(fit=True)
    # pairing_qr_text must match this error-correction choice, not the
    # library's default (M) — confirmed by comparing rendered width against
    # the same payload run through the actual function.
    from_function = pairing_qr_text("divtube://pair?offer=opaque", "10 minutes")
    function_width = max(len(line) for line in from_function.split("\n") if line and "Expires" not in line)
    assert function_width == len(qr.get_matrix()[0])
