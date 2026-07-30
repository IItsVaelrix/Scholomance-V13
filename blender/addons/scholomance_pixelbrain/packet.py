"""
Wire packet decode and seal verification.

The consumer never computes a hash and never mints a receipt.
It decodes, verifies the seal by string equality, and reports raw strings.

Error taxonomy:
  WireDecodeError   — malformed wire JSON
  SealMismatchError — sourceChecksum does not match expected
  NullWireError     — null found in wire (None on RNA raises TypeError)
"""

import json


class WireDecodeError(Exception):
    """Malformed wire JSON."""
    pass


class SealMismatchError(Exception):
    """sourceChecksum does not match expected."""
    pass


class NullWireError(Exception):
    """Null found in wire. None on an RNA property raises TypeError."""
    pass


def decode_wire(raw):
    """
    Decode a wire packet from a JSON string or dict.
    Validates structure and checks for nulls.
    Returns the decoded dict.
    """
    if isinstance(raw, str):
        try:
            wire = json.loads(raw)
        except json.JSONDecodeError as e:
            raise WireDecodeError(f"invalid JSON: {e}") from e
    elif isinstance(raw, dict):
        wire = raw
    else:
        raise WireDecodeError(f"expected str or dict, got {type(raw).__name__}")

    # Required fields
    for field in ("wireVersion", "packetId", "colorPolicy", "coordinateCount",
                  "sourceChecksum", "positions", "attributes"):
        if field not in wire:
            raise WireDecodeError(f"missing required field: {field}")

    if wire["wireVersion"] != 1:
        raise WireDecodeError(f"unsupported wireVersion: {wire['wireVersion']}")

    if wire["colorPolicy"] not in ("EXACT", "SYNTHESIZED"):
        raise WireDecodeError(f"invalid colorPolicy: {wire['colorPolicy']}")

    # Null check — None on an RNA property raises TypeError
    _assert_no_nulls(wire, "$")

    return wire


def verify_seal(wire, expected_checksum):
    """
    Verify the seal by string equality. The consumer never computes a hash.
    """
    actual = wire.get("sourceChecksum", "")
    if actual != expected_checksum:
        raise SealMismatchError(
            f"seal mismatch: expected {expected_checksum!r}, got {actual!r}"
        )
    return True


def _assert_no_nulls(value, path="$"):
    """Recursively check for None values."""
    if value is None:
        raise NullWireError(f"null found at {path} — None on an RNA property raises TypeError")
    if isinstance(value, dict):
        for k, v in value.items():
            _assert_no_nulls(v, f"{path}.{k}")
    elif isinstance(value, (list, tuple)):
        for i, v in enumerate(value):
            _assert_no_nulls(v, f"{path}[{i}]")
