"""
Test packet decode and seal verification.
Run via: ./scripts/blender-test.sh blender/tests/test_packet.py
"""
import sys
import json

# Addon path is injected by blender-test.sh
from scholomance_pixelbrain.packet import (
    decode_wire, verify_seal,
    WireDecodeError, SealMismatchError, NullWireError,
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


MINIMAL_WIRE = {
    "wireVersion": 1,
    "packetId": "TEST",
    "kind": "test",
    "colorPolicy": "EXACT",
    "canvas": {"width": 64, "height": 112, "gridSize": 1},
    "coordinateCount": 2,
    "scales": {"pb_emphasis": 1000000},
    "intern": {"partId": {"blade": 0}},
    "attributes": {"pb_emphasis": [142857, 142857]},
    "positions": {"x": [30, 31], "y": [8, 8], "z": [0, 0]},
    "colors": {"color": [14464048, 14464048], "preSquareColor": [13938487, 13938487]},
    "energy": {"0": [0, 0], "1": [0, 0], "2": [184699, 184699], "3": [0, 0],
               "4": [0, 0], "5": [0, 0], "6": [0, 0], "7": [0, 0]},
    "sourceChecksum": "6DB23A1A",
    "absentId": -1,
}


def t_decode_valid_wire():
    w = decode_wire(MINIMAL_WIRE)
    assert w["packetId"] == "TEST"
    assert w["coordinateCount"] == 2

def t_decode_from_json_string():
    w = decode_wire(json.dumps(MINIMAL_WIRE))
    assert w["packetId"] == "TEST"

def t_reject_bad_version():
    bad = dict(MINIMAL_WIRE, wireVersion=99)
    try:
        decode_wire(bad)
        assert False, "should have raised"
    except WireDecodeError:
        pass

def t_reject_bad_policy():
    bad = dict(MINIMAL_WIRE, colorPolicy="PRETTY")
    try:
        decode_wire(bad)
        assert False, "should have raised"
    except WireDecodeError:
        pass

def t_reject_missing_field():
    bad = {k: v for k, v in MINIMAL_WIRE.items() if k != "positions"}
    try:
        decode_wire(bad)
        assert False, "should have raised"
    except WireDecodeError:
        pass

def t_reject_null_in_wire():
    bad = dict(MINIMAL_WIRE)
    bad["attributes"] = {"pb_emphasis": [142857, None]}
    try:
        decode_wire(bad)
        assert False, "should have raised"
    except NullWireError:
        pass

def t_verify_seal_pass():
    assert verify_seal(MINIMAL_WIRE, "6DB23A1A") is True

def t_verify_seal_fail():
    try:
        verify_seal(MINIMAL_WIRE, "DEADBEEF")
        assert False, "should have raised"
    except SealMismatchError:
        pass


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
