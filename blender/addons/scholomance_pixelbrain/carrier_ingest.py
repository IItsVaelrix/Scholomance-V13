"""
Consumer side of PB-CARRIER-v1.

WHAT THIS VERIFIES, STATED PLAINLY: identity, not integrity.

The consumer compares the carrier's root against a value delivered by an
independent path, using string equality, and never computes a hash. That bounds
what it can catch:

    substituted carrier ............. detected (root != expected)
    edited `root` ................... detected (root != expected)
    edited frame, root left alone ... NOT detected
    edited frame + updated root ..... detected (root != expected)

Catching an edited frame would mean recomputing its checksum, which is hashing,
which the consumer may not do. Integrity is verified producer-side by
carrier.js:verifyCarrier. This module does not pretend to a check it lacks --
that pretence is exactly how this bridge ended up with a receipt describing the
factory startup cube and a seal compared against itself.

The expected root must arrive from somewhere other than the carrier. Reading it
off `carrier["root"]` and comparing it to itself passes for every input,
including a carrier that was swapped in transit.
"""

CARRIER_CONTRACT = "PB-CARRIER-v1"


class CarrierRootMismatch(Exception):
    """The carrier is not the one this consumer was told to expect."""


class CarrierFrameMissing(Exception):
    """A frame was requested that the producer did not send."""


def verify_carrier_root(carrier, expected_root):
    """
    Verify the carrier's identity by string equality. Returns True or raises.

    An empty expected root is refused rather than compared. Without that guard
    an unsealed carrier satisfies the check by '' == '' -- the comparison still
    runs, still passes, and admits exactly what the root exists to keep out.
    """
    if not expected_root:
        raise CarrierRootMismatch(
            "refusing to verify against an empty expected root — an unsealed "
            "carrier cannot be admitted by string equality"
        )

    contract = carrier.get("contract") if isinstance(carrier, dict) else None
    if contract != CARRIER_CONTRACT:
        raise CarrierRootMismatch(
            f"expected {CARRIER_CONTRACT}, got {contract!r}"
        )

    actual = carrier.get("root", "")
    if not actual:
        raise CarrierRootMismatch("carrier carries no root — it is unsealed")

    if actual != expected_root:
        raise CarrierRootMismatch(
            f"carrier root {actual!r} does not match the expected {expected_root!r}"
        )

    return True


def select_frame(carrier, frame_id):
    """
    Read one frame off the carrier.

    Law 1: this is SELECTION, not negotiation. The producer decided what shipped;
    the consumer chooses which of those to read and cannot ask for more. Nothing
    here mutates the carrier.
    """
    frames = carrier.get("frames", {})
    if frame_id not in frames:
        available = ", ".join(sorted(frames)) or "(none)"
        raise CarrierFrameMissing(
            f"no frame {frame_id!r} on this carrier. Available: {available}. "
            "The consumer selects from what was sent; it cannot request more."
        )
    return frames[frame_id]


def manifest_kinds(carrier):
    """List the frame kinds aboard, in the producer's manifest order."""
    return [entry["kind"] for entry in carrier.get("manifest", [])]
