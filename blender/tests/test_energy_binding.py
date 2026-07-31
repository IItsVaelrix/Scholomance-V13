"""
Falsifier 5: a PHOTONIC-energised asset must not render identically to the same
asset with PHOTONIC = 0.

Only PHOTONIC has a declared binding (grade FA, Emission Strength, linear
transfer). The other seven energy types cross as raw attributes and MUST NOT be
wired -- SCR-017 forbids implicit bindings, and a binding invented to fill out
the table is indistinguishable from one that was measured.

Run via: ./scripts/blender-test.sh blender/tests/test_energy_binding.py
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


WORK = tempfile.mkdtemp(prefix="pb-energy-")
W = H = 32
N = 4
POSITIONS = {"x": [8, 12, 16, 20], "y": [16, 16, 16, 16], "z": [0, 0, 0, 0]}
# 0x808080 -- a mid grey, so a strength change moves it in both directions.
LINEAR = [216030, 216030, 216030] * N

PHOTONIC_INDEX = "1"
THERMAL_INDEX = "3"


def _wire(photonic_q, energy_index=PHOTONIC_INDEX):
    energy = {str(i): [0] * N for i in range(8)}
    energy[energy_index] = [photonic_q] * N
    return {
        "wireVersion": 1,
        "packetId": f"ENERGY-{energy_index}-{photonic_q}",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": W, "height": H, "gridSize": 1},
        "coordinateCount": N,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        "positions": POSITIONS,
        "colors": {
            "color": [0x808080] * N,
            "preSquareColor": [0x808080] * N,
            "linear": LINEAR,
        },
        "energy": energy,
        "sourceChecksum": "ENERGY",
        "absentId": -1,
    }


def _render(wire, tag):
    for obj in list(bpy.data.objects):
        if obj.type not in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    obj = ingest_wire(wire)
    prepare_render_scene(obj, scene=scene, canvas={"width": W, "height": H})
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.film_transparent = True
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=0, samples=1, threads=8, policy="EXACT")
    path = dump_pixels_f32(os.path.join(WORK, tag))
    return np.fromfile(path, dtype=np.float32).reshape(H, W, 4)


def t_photonic_attribute_lands_as_float():
    obj = ingest_wire(_wire(500000))
    attrs = obj.data.attributes
    assert "pb_photonic" in attrs, "pb_photonic attribute missing"
    assert attrs["pb_photonic"].data_type == "FLOAT", attrs["pb_photonic"].data_type
    assert abs(attrs["pb_photonic"].data[0].value - 0.5) < 1e-6


def t_photonic_energy_changes_pixels():
    dark = _render(_wire(0), "photonic_0")
    bright = _render(_wire(1000000), "photonic_1")
    assert not np.array_equal(dark, bright), (
        "PHOTONIC 0.0 and 1.0 rendered identical pixels -- "
        "the declared binding does not reach the shader"
    )


# The wire is screen space (y down); ingest flips it into Blender world space
# and the dump is that buffer bottom-up, so screen y lands at row H-1-y.
PROBE_ROW = H - 1 - POSITIONS["y"][0]
PROBE_COL = POSITIONS["x"][0]


def t_photonic_scales_emission_upward():
    lo = _render(_wire(250000), "photonic_lo")
    hi = _render(_wire(1000000), "photonic_hi")
    assert hi[PROBE_ROW, PROBE_COL][0] > lo[PROBE_ROW, PROBE_COL][0], (
        f"higher PHOTONIC did not brighten the pixel: "
        f"{hi[PROBE_ROW, PROBE_COL][0]} <= {lo[PROBE_ROW, PROBE_COL][0]}"
    )


def t_zero_photonic_preserves_the_colour_law():
    # The EXACT round-trip is declared to hold at PHOTONIC = 0 (spec 2.3). If
    # the binding shifted the baseline, colour would stop round-tripping for
    # every asset that carries no energy at all.
    arr = _render(_wire(0), "photonic_zero_law")
    px = arr[PROBE_ROW, PROBE_COL]
    assert abs(float(px[0]) - 0.216030) < 1e-5, (
        f"zero-energy pixel is {px[0]}, not the authored 0.216030 -- "
        "the energy binding moved the baseline"
    )


def t_undeclared_energy_types_do_not_reach_pixels():
    # SCR-017. THERMAL (index 3) has no declared binding. If changing it moves a
    # pixel, something wired it implicitly and the registry is now a fiction.
    a = _render(_wire(0, energy_index=THERMAL_INDEX), "thermal_0")
    b = _render(_wire(1000000, energy_index=THERMAL_INDEX), "thermal_1")
    assert np.array_equal(a, b), (
        "THERMAL energy changed the render, but it has no declared binding"
    )


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
