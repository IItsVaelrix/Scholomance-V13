"""Compact accessible status and terminal QR rendering for the companion."""

from __future__ import annotations

import qrcode
from textual.widgets import Static


_LABELS = {
    "disabled": "Remote companion: Disabled",
    "offline": "Remote companion: Offline",
    "listening": "Remote companion: Listening for paired devices",
    "paired": "Remote companion: Connected",
}


class RemoteCompanionStatus(Static):
    def __init__(self, state: str = "disabled", **kwargs):
        super().__init__(_LABELS.get(state, _LABELS["offline"]), id="remote-companion-status", **kwargs)
        self.remote_state = state

    @staticmethod
    def status_text(state: str) -> str:
        return _LABELS.get(state, _LABELS["offline"])

    def set_state(self, state: str) -> None:
        self.remote_state = state
        self.update(self.status_text(state))


def pairing_qr_text(uri: str, expiry: str) -> str:
    qr = qrcode.QRCode(border=1)
    qr.add_data(uri)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    lines = []
    for row_index in range(0, len(matrix), 2):
        top = matrix[row_index]
        bottom = matrix[row_index + 1] if row_index + 1 < len(matrix) else [False] * len(top)
        line = "".join("█" if a and b else "▀" if a else "▄" if b else " " for a, b in zip(top, bottom))
        lines.append(line)
    return "\n".join(lines) + f"\nExpires in {expiry}"
