"""
PixelBrain .pbrain asset checksum — verifier.

The image-trace tracer stamps each PixelBrainAssetPacket with:

    "checksum": {
        "algorithm": "FNV-1a-32",
        "scope": "canonical JSON excluding this checksum object",
        "value": "<UPPER_HEX8>"
    }

The "canonical JSON" form is Python-compact: the top-level ``checksum`` key is
removed and the remaining packet is serialized with
``json.dumps(obj, separators=(",", ":"))`` (no indent, file key order). The
FNV-1a-32 (offset basis 2166136261, prime 16777619) of that UTF-8 string,
formatted as upper-case 8-hex, is the checksum value.

NOTE: this verification MUST run on a numeric-type-preserving reader. JSON
floats such as ``64.0`` serialize back as ``64.0`` in Python but as ``64`` in
JavaScript (and ``JSON.parse`` already discards the distinction), so a JS
verifier cannot reproduce the byte stream. Verify .pbrain checksums here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def fnv1a32(text: str) -> str:
    """FNV-1a-32 of a string, as upper-case zero-padded 8-hex."""
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return format(h, "08X")


def canonical_pbrain_json(packet: dict[str, Any]) -> str:
    """Canonical serialization the tracer checksums: packet minus checksum, compact."""
    body = {k: v for k, v in packet.items() if k != "checksum"}
    return json.dumps(body, separators=(",", ":"))


def compute_pbrain_checksum(packet: dict[str, Any]) -> str:
    """Recompute the FNV-1a-32 checksum value for a packet."""
    return fnv1a32(canonical_pbrain_json(packet))


def verify_pbrain_checksum(packet: dict[str, Any]) -> tuple[bool, str, str]:
    """
    Verify a packet's stamped checksum.

    Returns (ok, expected, recomputed).
    """
    expected = str((packet.get("checksum") or {}).get("value", ""))
    recomputed = compute_pbrain_checksum(packet)
    return recomputed == expected, expected, recomputed


def verify_pbrain_file(path: str | Path) -> tuple[bool, str, str]:
    """Load a .pbrain file (preserving numeric literal types) and verify it."""
    packet = json.loads(Path(path).read_text(encoding="utf-8"))
    return verify_pbrain_checksum(packet)


if __name__ == "__main__":
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else None
    if not target:
        print("usage: python -m vaelrix_forcefield.pixelbrain.pbrain_checksum <file.pbrain>")
        raise SystemExit(2)

    ok, expected, recomputed = verify_pbrain_file(target)
    status = "OK" if ok else "MISMATCH"
    print(f"{status} expected={expected} recomputed={recomputed} file={target}")
    raise SystemExit(0 if ok else 1)
