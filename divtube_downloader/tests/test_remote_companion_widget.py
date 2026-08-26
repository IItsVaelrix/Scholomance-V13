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
