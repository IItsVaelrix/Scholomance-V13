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


def t_creates_object_with_correct_point_count():
    obj = ingest_wire(MINIMAL_WIRE)
    points = obj.data.attributes["position"].data
    assert len(points) == 3, f"expected 3 points, got {len(points)}"

# NOTE: this was named test_* while the collector below only picks up t_*, so it
# never ran. Renamed to t_* — a test that cannot execute cannot fail.
def t_point_positions_match_wire():
    obj = ingest_wire(MINIMAL_WIRE)
    p0 = obj.data.attributes["position"].data[0].vector
    # X crosses unchanged.
    assert abs(p0[0] - 10.0) < 0.001, f"x mismatch: {p0[0]}"
    # Y changes handedness: screen y-down -> world y-up, so wire y=5 on a
    # 112-high canvas lands at world y = 112 - 1 - 5 = 106. This assertion read
    # `p0[1] == 5.0` while ingest landed the packet's y directly, and that was
    # the whole bug: the test agreed with the code and both were wrong, because
    # neither of them knew the two spaces disagree about which way is up.
    assert abs(p0[1] - 106.0) < 0.001, f"y mismatch: {p0[1]}"

def t_points_carry_a_radius():
    obj = ingest_wire(MINIMAL_WIRE)
    attrs = obj.data.attributes
    assert "radius" in attrs, "point cloud has no radius — it renders to nothing"
    radii = [0.0] * 3
    attrs["radius"].data.foreach_get("value", radii)
    assert all(r > 0.0 for r in radii), f"radius must be positive, got {radii}"

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


def _albedo_wire():
    """A two-point wire carrying declared linear colour for 0xDCB430."""
    return {
        "wireVersion": 1,
        "packetId": "ALBEDO-1",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": 8, "height": 8, "gridSize": 1},
        "coordinateCount": 2,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        "positions": {"x": [0, 1], "y": [0, 1], "z": [0, 0]},
        "colors": {
            "color": [0xDCB430, 0xDCB430],
            "preSquareColor": [0xDCB430, 0xDCB430],
            "linear": [715693, 456411, 29557, 715693, 456411, 29557],
        },
        "energy": {str(i): [0, 0] for i in range(8)},
        "sourceChecksum": "DEADBEEF",
        "absentId": -1,
    }


def t_albedo_attribute_is_float_color_on_point():
    obj = ingest_wire(_albedo_wire())
    attrs = obj.data.attributes
    assert "pb_albedo" in attrs, "pb_albedo attribute missing"
    assert attrs["pb_albedo"].data_type == "FLOAT_COLOR", attrs["pb_albedo"].data_type
    assert attrs["pb_albedo"].domain == "POINT", attrs["pb_albedo"].domain


def t_albedo_dequantizes_at_the_declared_scale():
    obj = ingest_wire(_albedo_wire())
    c = obj.data.attributes["pb_albedo"].data[0]
    # 715693 / 1e6 -- the linear value of 0xDC, carried as int32 by the wire.
    assert abs(c.color[0] - 0.715693) < 1e-6, c.color[0]
    assert abs(c.color[3] - 1.0) < 1e-6, "alpha must be opaque"


def t_packed_hex_still_crosses_for_provenance():
    obj = ingest_wire(_albedo_wire())
    assert "pb_color_color" in obj.data.attributes



def _orient_wire():
    """
    Asymmetric on purpose: one point at the TOP of the canvas (screen y=0) and
    one at the BOTTOM (screen y=height-1). A symmetric fixture cannot detect a
    vertical flip, which is how this survived every existing test.
    """
    return {
        "wireVersion": 1,
        "packetId": "ORIENT-1",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": 8, "height": 16, "gridSize": 1},
        "coordinateCount": 2,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        # screen-space: y=0 is the TOP row, y=15 is the BOTTOM row
        "positions": {"x": [4, 4], "y": [0, 15], "z": [0, 0]},
        "colors": {
            "color": [0xFFFFFF, 0x000000],
            "preSquareColor": [0xFFFFFF, 0x000000],
            "linear": [1000000, 1000000, 1000000, 0, 0, 0],
        },
        "energy": {str(i): [0, 0] for i in range(8)},
        "sourceChecksum": "ORIENT",
        "absentId": -1,
    }


def t_screen_y_down_becomes_world_y_up():
    """
    The packet is a Godot export: screen space, y increases DOWNWARD. Blender
    world space has +Y UP. Landing the packet's y directly as world y renders
    every asset vertically mirrored -- and a mirrored render hashes perfectly
    and reproduces forever, so no receipt-based check can see it.

    Screen y=0 (top of canvas) must land at the HIGHEST world y.
    """
    obj = ingest_wire(_orient_wire())
    pos = obj.data.attributes["position"].data
    top_of_canvas = pos[0].vector[1]     # screen y = 0
    bottom_of_canvas = pos[1].vector[1]  # screen y = 15
    assert top_of_canvas > bottom_of_canvas, (
        f"screen y=0 landed at world y={top_of_canvas} and screen y=15 at "
        f"world y={bottom_of_canvas}: the asset is upside down"
    )


def t_the_flip_spans_the_declared_canvas_height():
    # height 16 -> screen y 0 maps to world 15, screen y 15 maps to world 0.
    obj = ingest_wire(_orient_wire())
    pos = obj.data.attributes["position"].data
    assert abs(pos[0].vector[1] - 15.0) < 1e-6, pos[0].vector[1]
    assert abs(pos[1].vector[1] - 0.0) < 1e-6, pos[1].vector[1]


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
