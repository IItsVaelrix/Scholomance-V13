"""
The temporal frame's reader. Without one, PB-TEMPORAL-FRAME-v1 is a format
nothing consumes -- the declared-but-unimplemented pathology this bridge exists
to remove.

Run via: ./scripts/blender-test.sh blender/tests/test_temporal_ingest.py
"""
import sys

import bpy

from scholomance_pixelbrain.temporal_ingest import (
    ingest_temporal_frame,
    find_temporal_frame,
    FRAME_KEY,
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


FRAME_WIRE = {
    "contract": "PB-TEMPORAL-FRAME-v1",
    "frame": 3,
    "time": 0.125,
    "projectionChecksum": "ABCD1234",
    "vertexCount": 3,
    "positions": {"x": [1, 4, 6], "y": [3, 5, 7]},
    "partIds": ["arm", "leg"],
    "partIndex": [0, 0, 1],
    "energyBindings": {"PHOTONIC": 0.5},
    "wireVersion": "1.0.0",
}


def t_creates_a_point_per_vertex():
    obj = ingest_temporal_frame(FRAME_WIRE)
    assert len(obj.data.attributes["position"].data) == 3


def t_positions_match_the_wire():
    obj = ingest_temporal_frame(FRAME_WIRE)
    p = obj.data.attributes["position"].data[1].vector
    assert abs(p[0] - 4.0) < 1e-6, p[0]
    assert abs(p[1] - 5.0) < 1e-6, p[1]


def t_part_index_lands_as_int():
    obj = ingest_temporal_frame(FRAME_WIRE)
    attr = obj.data.attributes["pb_part_index"]
    assert attr.data_type == "INT", attr.data_type
    assert [d.value for d in attr.data] == [0, 0, 1]


def t_frame_identity_is_carried_not_computed():
    obj = ingest_temporal_frame(FRAME_WIRE)
    assert obj[FRAME_KEY] == 3
    assert obj["pb_projection_checksum"] == "ABCD1234"


def t_refuses_a_packet_that_is_not_a_temporal_frame():
    refused = False
    try:
        ingest_temporal_frame({"contract": "pixelbrain.render.v1", "vertexCount": 0})
    except ValueError:
        refused = True
    assert refused, "a render packet was accepted as a temporal frame"


def t_refuses_a_packet_with_no_contract_at_all():
    # An unlabelled dict must not be admitted by defaulting. That is how a
    # render packet ends up ingested as animation state.
    refused = False
    try:
        ingest_temporal_frame({"vertexCount": 0})
    except ValueError:
        refused = True
    assert refused, "a packet with no contract was accepted"


def t_findable_by_frame_number():
    ingest_temporal_frame(FRAME_WIRE)
    assert find_temporal_frame(3) is not None
    assert find_temporal_frame(999) is None


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
