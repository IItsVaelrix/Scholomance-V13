"""
Falsifier 2: under EXACT policy at PHOTONIC = 0, the rendered pixel beneath a
coordinate equals that coordinate's authored hex byte-exactly.

This check has a demonstrated failure mode, which is why it is worth having:
measured on Blender 5.2.0, it returns 6/6 at samples=1, 1/6 at samples=16, and
0/6 at samples=64 with a Gaussian filter. With one sample per pixel there is
nothing to average, so the pixel filter only chooses where that sample lands.
samples=1 is therefore part of the EXACT contract, not a render preference.

Run via: ./scripts/blender-test.sh blender/tests/test_color_roundtrip.py
"""
import os
import sys
import tempfile

import numpy as np
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


WORK = tempfile.mkdtemp(prefix="pb-roundtrip-")
W = H = 64

SPECIMENS = [
    (16, 16, 0xDCB430),
    (32, 16, 0x4051B5),
    (48, 16, 0xFFFFFF),
    (16, 48, 0x000000),
    (32, 48, 0x7C3AED),
    (48, 48, 0x06B6D4),
]


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c):
    if c <= 0.0:
        return 0.0
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def _wire():
    """Specimens at pixel centres, with linear colour quantized as the wire does."""
    n = len(SPECIMENS)
    linear = []
    for (_x, _y, hexint) in SPECIMENS:
        for shift in (16, 8, 0):
            chan = ((hexint >> shift) & 0xFF) / 255.0
            linear.append(int(round(_srgb_to_linear(chan) * 1e6)))
    return {
        "wireVersion": 1,
        "packetId": "ROUNDTRIP-1",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": W, "height": H, "gridSize": 1},
        "coordinateCount": n,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        "positions": {
            "x": [s[0] for s in SPECIMENS],
            "y": [s[1] for s in SPECIMENS],
            "z": [0] * n,
        },
        "colors": {
            "color": [s[2] for s in SPECIMENS],
            "preSquareColor": [s[2] for s in SPECIMENS],
            "linear": linear,
        },
        "energy": {str(i): [0] * n for i in range(8)},
        "sourceChecksum": "ROUNDTRIP",
        "absentId": -1,
    }


def _render(samples):
    for obj in list(bpy.data.objects):
        if obj.type not in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    obj = ingest_wire(_wire())
    prepare_render_scene(obj, scene=scene, canvas={"width": W, "height": H})
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.film_transparent = True
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=0, samples=samples, threads=8, policy="EXACT")
    path = dump_pixels_f32(os.path.join(WORK, f"rt_{samples}"))
    return np.fromfile(path, dtype=np.float32).reshape(H, W, 4)


def _render_unpinned(samples):
    """
    Deliberately renders under SYNTHESIZED so the sample count is honoured.
    Used only to prove the falsifier below is capable of failing.
    """
    for obj in list(bpy.data.objects):
        if obj.type not in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    obj = ingest_wire(_wire())
    prepare_render_scene(obj, scene=scene, canvas={"width": W, "height": H})
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.film_transparent = True
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(
        scene, seed=0, samples=samples, threads=8, policy="SYNTHESIZED"
    )
    path = dump_pixels_f32(os.path.join(WORK, f"rt_unpinned_{samples}"))
    return np.fromfile(path, dtype=np.float32).reshape(H, W, 4)


def _exact_count(arr, report=False):
    """
    Count specimens whose rendered pixel equals the authored hex byte-exactly.

    An opaque pixel is REQUIRED. Film is transparent black, so an empty pixel
    reads as a perfect match for #000000 and a completely blank render would
    score 1/6 — the black specimen matching nothing at all. Requiring alpha == 1
    is what stops the absence of a render counting as a correct one.
    """
    hits = 0
    for (x, y, hexint) in SPECIMENS:
        px = arr[y, x]
        opaque = float(px[3]) == 1.0
        got = tuple(int(round(_linear_to_srgb(float(c)) * 255.0)) for c in px[:3])
        want = tuple((hexint >> s) & 0xFF for s in (16, 8, 0))
        ok = opaque and got == want
        if ok:
            hits += 1
        if report:
            print(
                f"    #{hexint:06X} @({x},{y}) alpha={float(px[3]):.4f} "
                f"got=#{got[0]:02X}{got[1]:02X}{got[2]:02X} "
                f"{'EXACT' if ok else 'MISMATCH'}"
            )
    return hits


def t_every_specimen_round_trips_byte_exactly():
    arr = _render(samples=1)
    hits = _exact_count(arr, report=True)
    assert hits == len(SPECIMENS), (
        f"only {hits}/{len(SPECIMENS)} specimens round-tripped; "
        "colour is not reaching pixels unchanged"
    )


def t_the_check_can_fail():
    # Guards against a vacuous falsifier. If 64 samples ALSO passes, the check is
    # not measuring what it claims and must not be trusted.
    hits = _exact_count(_render_unpinned(samples=64))
    assert hits < len(SPECIMENS), (
        "64 samples round-tripped byte-exactly too -- this falsifier is vacuous"
    )


def t_exact_policy_forces_single_sample():
    scene = bpy.context.scene
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=0, samples=64, threads=8, policy="EXACT")
    assert scene.cycles.samples == 1, (
        f"EXACT policy honoured a caller's samples={scene.cycles.samples}; "
        "the sample count is a contract term, not a preference"
    )


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
