"""
Consumer-side carrier handling.

The consumer verifies IDENTITY, not INTEGRITY. It compares the carrier's root
against a value delivered by an independent path, by string equality, and never
computes a hash. It therefore CANNOT detect a frame edited while the root is
left alone -- that is a consequence of law 2, and it is verified JS-side in
carrier.test.js where hashing is allowed.

Run via: ./scripts/blender-test.sh blender/tests/test_carrier_ingest.py
"""
import os
import sys

from scholomance_pixelbrain.carrier_ingest import (
    verify_carrier_root,
    select_frame,
    manifest_kinds,
    CarrierRootMismatch,
    CarrierFrameMissing,
)

FAILURES = []


def check(name, fn):
    try:
        fn()
        print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name)
        print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name)
        print(f"  ERROR {name}: {type(e).__name__}: {e}")


# Sealed producer-side; these values came off carrier.js. The consumer treats
# them as opaque strings and never recomputes them.
CARRIER = {
    "contract": "PB-CARRIER-v1",
    "manifest": [
        {"kind": "render", "frameId": "render-0",
         "schema": "pixelbrain.render.v1", "checksum": "AAAA1111"},
        {"kind": "temporal", "frameId": "temporal-0",
         "schema": "PB-TEMPORAL-FRAME-v1", "checksum": "BBBB2222"},
    ],
    "root": "CCCC3333DDDD4444",
    "frames": {
        "render-0": {"packetId": "r1", "coordinateCount": 2},
        "temporal-0": {"contract": "PB-TEMPORAL-FRAME-v1", "frame": 1},
    },
    "seal": "EEEE5555FFFF6666",
}

EXPECTED_ROOT = "CCCC3333DDDD4444"


def t_accepts_the_carrier_it_was_told_to_expect():
    assert verify_carrier_root(CARRIER, EXPECTED_ROOT) is True


def t_refuses_a_carrier_whose_root_differs():
    refused = False
    try:
        verify_carrier_root(CARRIER, "0000000000000000")
    except CarrierRootMismatch:
        refused = True
    assert refused, "a substituted carrier was accepted"


def t_refuses_an_empty_expected_root():
    # The '' == '' trap. Without this, an unsealed carrier satisfies the check:
    # the comparison still runs, still passes, and admits exactly what the root
    # exists to keep out. Same defect the packet seal already carries a guard for.
    refused = False
    try:
        verify_carrier_root(CARRIER, "")
    except CarrierRootMismatch:
        refused = True
    assert refused, "an empty expected root was accepted"


def t_refuses_a_carrier_with_no_root():
    refused = False
    try:
        verify_carrier_root({"contract": "PB-CARRIER-v1", "manifest": [], "frames": {}},
                            EXPECTED_ROOT)
    except CarrierRootMismatch:
        refused = True
    assert refused, "a carrier with no root was accepted"


def t_refuses_a_packet_that_is_not_a_carrier():
    refused = False
    try:
        verify_carrier_root({"contract": "pixelbrain.render.v1", "root": EXPECTED_ROOT},
                            EXPECTED_ROOT)
    except CarrierRootMismatch:
        refused = True
    assert refused, "a render packet was accepted as a carrier"


def t_selects_a_frame_the_producer_sent():
    frame = select_frame(CARRIER, "temporal-0")
    assert frame["contract"] == "PB-TEMPORAL-FRAME-v1", frame


def t_refuses_a_frame_the_producer_did_not_send():
    # Law 1: the consumer selects from what was sent. It cannot request more,
    # and asking for something absent is an error rather than a negotiation.
    refused = False
    try:
        select_frame(CARRIER, "construction-0")
    except CarrierFrameMissing:
        refused = True
    assert refused, "a frame the producer never sent was returned"


def t_selection_does_not_mutate_the_carrier():
    import copy
    before = copy.deepcopy(CARRIER)
    select_frame(CARRIER, "render-0")
    select_frame(CARRIER, "temporal-0")
    assert CARRIER == before, "selecting changed the carrier"


def t_manifest_kinds_reports_what_is_aboard():
    assert manifest_kinds(CARRIER) == ["render", "temporal"]


# Falsifier 11's exemption, declared rather than silently grepped around.
#
# The law is that no consumer-computed digest may enter a RECEIPT or a
# VERIFICATION DECISION -- otherwise the receipt is self-attested and the seal
# compares the packet to itself. classify.py hashes two in-process states to
# test them for equality and returns "CONSERVATIVE" or "PATH_DEPENDENT". That
# result is a classification, never a receipt slot and never a seal comparison.
#
# Narrowing the check is only legitimate because the exemption is checked too:
# t_the_hash_exemption_stays_off_the_receipt_path asserts classify.py imports
# nothing from the receipt or packet path, so its digests cannot drift into one.
HASH_EXEMPT = {"classify.py"}

HASH_NEEDLES = ("hashlib", "sha256(", "md5(", ".digest()", ".hexdigest()")


def _addon_dir():
    return os.path.dirname(
        sys.modules["scholomance_pixelbrain.carrier_ingest"].__file__
    )


def t_the_receipt_path_computes_no_hash():
    addon_dir = _addon_dir()
    offenders = []
    for name in sorted(os.listdir(addon_dir)):
        if not name.endswith(".py") or name in HASH_EXEMPT:
            continue
        text = open(os.path.join(addon_dir, name)).read()
        for needle in HASH_NEEDLES:
            if needle in text:
                offenders.append(f"{name}:{needle}")
    assert not offenders, f"consumer computes a hash on the receipt path: {offenders}"


def t_the_hash_exemption_stays_off_the_receipt_path():
    # An exemption that is never re-checked is how a narrowed law quietly
    # becomes no law. If classify.py ever reaches for the receipt, packet or
    # claim modules, its hashing stops being harmless and this fails.
    addon_dir = _addon_dir()
    forbidden = ("render_claim", "sim_claim", "packet", "carrier_ingest")
    for name in sorted(HASH_EXEMPT):
        path = os.path.join(addon_dir, name)
        if not os.path.exists(path):
            continue
        text = open(path).read()
        for module in forbidden:
            assert f"import {module}" not in text and f"from scholomance_pixelbrain.{module}" not in text, (
                f"{name} is hash-exempt but imports {module} — its digests can "
                "now reach a receipt, so the exemption no longer holds"
            )


def t_the_exemption_list_is_not_a_blanket():
    # Guards the guard. If HASH_EXEMPT ever grew to cover the modules that
    # actually mint claims, falsifier 11 would pass by construction.
    for name in ("render_claim.py", "sim_claim.py", "packet.py", "carrier_ingest.py"):
        assert name not in HASH_EXEMPT, f"{name} must never be hash-exempt"


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
