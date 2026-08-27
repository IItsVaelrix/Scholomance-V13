"""Local network address discovery shared by the companion gateway.

Lives in `tui/remote/` rather than the UI layer because both the pairing
URI (which tells a phone where to connect) and the TLS certificate's
SubjectAltName (which decides whether that phone will accept the
connection once it arrives) must agree on the same address. Two
independent notions of "our LAN address" is exactly how a client ends up
connecting to an address the certificate was never issued for.
"""

from __future__ import annotations

import socket


def lan_ipv4() -> str | None:
    """Best-effort discovery of this machine's outbound LAN IPv4 address.

    Opens a UDP socket toward a public address and reads back the source
    address the kernel selected for that route. `connect()` on a UDP socket
    sends no packet — it only makes the kernel pick a local source address —
    so this has no network side effect and works offline as long as a route
    exists. Deliberately avoids hostname/mDNS resolution and `ip addr`
    parsing, both of which have their own failure modes.

    Returns None when no route can be selected; every caller must treat
    that as "no LAN address known" rather than substituting a guess.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.settimeout(0.5)
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return None
