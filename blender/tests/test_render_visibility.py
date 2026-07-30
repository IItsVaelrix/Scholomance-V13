"""
The falsifier the bridge was missing: pixels must depend on the asset.

A REPRODUCED verdict only means something if a DIFFERENT asset would have
produced a different receipt. Without that, "two renders agree" is a statement
about Blender's determinism, not about the crossing.

Run via: ./scripts/blender-test.sh blender/tests/test_render_visibility.py
"""
import os
import sys
import tempfile

import bpy

from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import (
    apply_color_policy,
    configure_deterministic_render,
    dump_pixels_f32,
)
from scholomance_pixelbrain.scene import prepare_render_scene

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


WORK = tempfile.mkdtemp(prefix="pb-visibility-")


def _wire(packet_id, count, xs, ys, color):
    """Build a minimal wire packet with explicit geometry."""
    return {
        "wireVersion": 1,
        "packetId": packet_id,
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": 64, "height": 64, "gridSize": 1},
        "coordinateCount": count,
        "scales": {"pb_emphasis": 1000000},
        "intern": {},
        "attributes": {"pb_emphasis": [1000000] * count},
        "positions": {"x": xs, "y": ys, "z": [0] * count},
        "colors": {"color": [color] * count, "preSquareColor": [color] * count},
        "energy": {str(i): [0] * count for i in range(8)},
        "sourceChecksum": "DEADBEEF",
        "absentId": -1,
    }


# Asset A: a dense 8x8 block in the lower-left quadrant.
WIRE_A = _wire(
    "VIS-A",
    64,
    [x for x in range(8) for _ in range(8)],
    [y for _ in range(8) for y in range(8)],
    0xFFD166,
)

# Asset B: a sparse diagonal across the whole canvas. Structurally unrelated
# to A — different count, different extent, different colour.
WIRE_B = _wire(
    "VIS-B",
    4,
    [0, 20, 40, 60],
    [0, 20, 40, 60],
    0x4051B5,
)


def _reset_scene():
    """
    Remove all renderable content so each render starts from the same known
    state. The camera and light survive — without them there is nothing to
    render from or by, and the test would error instead of measuring.
    """
    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for pc in list(getattr(bpy.data, "pointclouds", [])):
        if pc.users == 0:
            bpy.data.pointclouds.remove(pc)


def _render(wire, tag):
    """Ingest a wire into a fresh scene and return the raw pixel bytes."""
    _reset_scene()
    scene = bpy.context.scene
    if wire is not None:
        obj = ingest_wire(wire)
        prepare_render_scene(obj, scene=scene)
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=7, samples=16, threads=8)
    path = dump_pixels_f32(os.path.join(WORK, tag))
    with open(path, "rb") as f:
        return f.read()


def t_different_assets_produce_different_pixels():
    a = _render(WIRE_A, "asset_a")
    b = _render(WIRE_B, "asset_b")
    assert a != b, (
        "two structurally different assets rendered to byte-identical pixels — "
        "the receipt does not depend on the asset"
    )


def t_ingested_asset_differs_from_empty_scene():
    empty = _render(None, "empty")
    a = _render(WIRE_A, "asset_a2")
    assert a != empty, (
        "an ingested asset rendered identically to an empty scene — "
        "the geometry is invisible to the renderer"
    )


def t_same_wire_reproduces_identical_pixels():
    first = _render(WIRE_A, "repro1")
    second = _render(WIRE_A, "repro2")
    assert first == second, "same asset rendered twice to different pixels"


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
