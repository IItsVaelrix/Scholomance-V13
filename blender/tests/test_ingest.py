"""
Test attribute-first ingest.
Run via: ./scripts/blender-test.sh blender/tests/test_ingest.py
"""
import sys
import bpy

from scholomance_pixelbrain.ingest import ingest_wire, find_by_packet_id, PACKET_ID_KEY

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
    "packetId": "TEST-INGEST",
    "kind": "test",
    "colorPolicy": "EXACT",
    "canvas": {"width": 64, "height": 112, "gridSize": 1},
    "coordinateCount": 3,
    "scales": {"pb_emphasis": 1000000, "pb_is_rim": 1, "pb_part_id": 1},
    "intern": {"partId": {"blade": 0, "guard": 1}},
    "attributes": {
        "pb_emphasis": [142857, 200000, 300000],
        "pb_is_rim": [1, 0, 1],
        "pb_part_id": [0, 1, 0],
    },
    "positions": {"x": [10, 20, 30], "y": [5, 10, 15], "z": [0, 0, 0]},
    "colors": {"color": [14464048, 14464048, 14464048],
               "preSquareColor": [13938487, 13938487, 13938487]},
    "energy": {str(i): [0, 0, 0] for i in range(8)},
    "sourceChecksum": "AABBCCDD",
    "absentId": -1,
}


def t_creates_object_with_correct_vertex_count():
    obj = ingest_wire(MINIMAL_WIRE)
    assert len(obj.data.vertices) == 3, f"expected 3 verts, got {len(obj.data.vertices)}"

def test_vertex_positions_match_wire():
    obj = ingest_wire(MINIMAL_WIRE)
    v0 = obj.data.vertices[0].co
    assert abs(v0[0] - 10.0) < 0.001, f"x mismatch: {v0[0]}"
    assert abs(v0[1] - 5.0) < 0.001, f"y mismatch: {v0[1]}"

def t_has_named_attributes():
    obj = ingest_wire(MINIMAL_WIRE)
    attr_names = [a.name for a in obj.data.attributes]
    assert "pb_emphasis" in attr_names, f"missing pb_emphasis in {attr_names}"
    assert "pb_is_rim" in attr_names
    assert "pb_part_id" in attr_names

def t_attribute_values_are_correct():
    obj = ingest_wire(MINIMAL_WIRE)
    attr = obj.data.attributes["pb_emphasis"]
    values = [0] * 3
    attr.data.foreach_get("value", values)
    assert values[0] == 142857, f"expected 142857, got {values[0]}"
    assert values[2] == 300000, f"expected 300000, got {values[2]}"

def t_custom_properties_set():
    obj = ingest_wire(MINIMAL_WIRE)
    assert obj.get(PACKET_ID_KEY) == "TEST-INGEST"
    assert obj.get("pb_source_checksum") == "AABBCCDD"
    assert obj.get("pb_color_policy") == "EXACT"

def t_find_by_packet_id():
    ingest_wire(MINIMAL_WIRE)
    found = find_by_packet_id("TEST-INGEST")
    assert found is not None, "should find object by packet id"
    assert find_by_packet_id("NONEXISTENT") is None


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
