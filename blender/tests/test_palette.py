"""
Tests for the school palette node group — full bpy implementation.

Run via: ~/opt/blender/blender -b --factory-startup --python blender/tests/test_palette.py

The consumer never computes a hash. These tests verify that the node group
is created correctly and that values match the wire's quantized integers.
"""

import sys
import os
import traceback

# Add addon to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))

import bpy
from scholomance_pixelbrain import palette as palette_mod
from scholomance_pixelbrain.palette import (
    SCHOOL_PALETTE,
    dequantize_color,
    get_palette,
    create_palette_node_group,
)


def _wire_palette(channels):
    """
    A wire palette in the shape palette-wire.js:paletteToWire emits.
    Values are int32 at UNIT scale; the consumer only divides.
    """
    return {
        "school": "TEST",
        "colorPolicy": "EXACT",
        "transferFunction": "sRGB-IEC-61966-2-1",
        "scale": 1000000,
        "channels": {
            role: {"hex": "#000000", "srgb": triple, "linear": triple}
            for role, triple in channels.items()
        },
    }

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        print(f"  FAIL: {name} — {detail}")


print("[test_palette] Starting palette tests...")

# --- the consumer owns no transfer function ---
print("[test_palette] consumer computes nothing:")
check(
    "hex_to_linear is deleted",
    not hasattr(palette_mod, "hex_to_linear"),
    "the consumer must not compute a transfer function; color-law.js owns it "
    "and the wire carries the result",
)
check(
    "apply_palette_to_material is deleted",
    not hasattr(palette_mod, "apply_palette_to_material"),
    "it built a node group and linked it to nothing, so three different "
    "schools rendered byte-identical pixels",
)

# --- dequantize_color ---
print("[test_palette] dequantize_color:")
result = dequantize_color((500000, 250000, 1000000), 1e6)
check("dequantize (500000, 250000, 1000000) @ 1e6",
      abs(result[0] - 0.5) < 1e-6 and abs(result[1] - 0.25) < 1e-6 and abs(result[2] - 1.0) < 1e-6,
      f"got {result}")

# --- get_palette ---
print("[test_palette] get_palette:")
p = get_palette("SONIC")
check("SONIC palette exists", p is not None and "primary" in p)
p_default = get_palette("NONEXISTENT")
check("unknown school falls back to default", p_default == SCHOOL_PALETTE["default"])

# --- create_palette_node_group: structure ---
# Previously exercised a no-wire "fallback path" that derived colour from local
# hex constants via hex_to_linear. That path is gone: the consumer applies
# declared values or refuses. The structural assertions still hold, so they now
# run against a supplied wire palette.
print("[test_palette] create_palette_node_group (structure):")
ng = create_palette_node_group("SONIC", _wire_palette({
    "primary": [201556, 42311, 846873],
    "accent": [421291, 285901, 908375],
    "glow": [201556, 42311, 846873],
}))
check("node group created", ng is not None)
check("node group name", ng.name == "PB_Palette_SONIC", f"got {ng.name}")
check("node group is ShaderNodeTree", ng.bl_idname == "ShaderNodeTree", f"got {ng.bl_idname}")

# Check that RGB nodes exist
rgb_nodes = [n for n in ng.nodes if n.bl_idname == "ShaderNodeRGB"]
check("3 RGB nodes created", len(rgb_nodes) == 3, f"got {len(rgb_nodes)}")

# Check that a Value node exists for glow_strength
value_nodes = [n for n in ng.nodes if n.bl_idname == "ShaderNodeValue"]
check("1 Value node for glow_strength", len(value_nodes) == 1, f"got {len(value_nodes)}")

# Check output sockets
if hasattr(ng, "interface"):
    output_items = [item for item in ng.interface.items_tree if hasattr(item, "in_out") and item.in_out == "OUTPUT"]
    check("4 output sockets", len(output_items) == 4, f"got {len(output_items)}")
else:
    check("4 output sockets (legacy)", len(ng.outputs) == 4, f"got {len(ng.outputs)}")

# --- create_palette_node_group (with wire data) ---
print("[test_palette] create_palette_node_group (wire path):")
wire_palette = {
    "school": "ALCHEMY",
    "colorPolicy": "EXACT",
    "transferFunction": "sRGB-IEC-61966-2-1",
    "scale": 1e6,
    "channels": {
        "primary": {"hex": "#f59e0b", "srgb": [961419, 619576, 43137], "linear": [913099, 318548, 14412]},
        "accent": {"hex": "#fcd34d", "srgb": [988235, 827451, 301961], "linear": [973445, 644480, 74214]},
        "glow": {"hex": "#f59e0b", "srgb": [961419, 619576, 43137], "linear": [913099, 318548, 14412]},
    },
}
ng2 = create_palette_node_group("ALCHEMY", wire_palette)
check("wire-path node group created", ng2 is not None)
check("wire-path node group name", ng2.name == "PB_Palette_ALCHEMY", f"got {ng2.name}")

# Verify the primary RGB node got dequantized wire values
rgb_nodes2 = [n for n in ng2.nodes if n.bl_idname == "ShaderNodeRGB" and n.label == "primary"]
if rgb_nodes2:
    val = rgb_nodes2[0].outputs[0].default_value
    expected_r = 913099 / 1e6
    check("primary R from wire", abs(val[0] - expected_r) < 0.01,
          f"got {val[0]}, expected ~{expected_r}")
else:
    check("primary RGB node found", False, "no primary RGB node")

# --- Idempotent re-creation ---
print("[test_palette] idempotent re-creation:")
ng3 = create_palette_node_group("SONIC", _wire_palette({
    "primary": [201556, 42311, 846873],
    "accent": [421291, 285901, 908375],
    "glow": [201556, 42311, 846873],
}))
check("re-creation does not collide-rename", ng3.name == "PB_Palette_SONIC", f"got {ng3.name}")
sonic_groups = [g for g in bpy.data.node_groups if g.name.startswith("PB_Palette_SONIC")]
check("exactly one SONIC group", len(sonic_groups) == 1, f"got {len(sonic_groups)}")

# --- the palette CROSSES correctly ---
#
# This replaces three assertions that checked a node had been ADDED to a
# material, never that it was LINKED. They were green while three schools
# rendered byte-identical pixels. The claim below is the one the palette can
# actually support: the values that crossed are the values applied.
print("[test_palette] palette crossing:")

WIRE_A = _wire_palette({
    "primary": [500000, 250000, 1000000],
    "accent": [100000, 200000, 300000],
    "glow": [900000, 800000, 700000],
})
WIRE_B = _wire_palette({
    "primary": [111111, 222222, 333333],
    "accent": [444444, 555555, 666666],
    "glow": [777777, 888888, 999999],
})


def _rgb_values(node_group):
    """Read back the RGB node values the group was built with, by label."""
    return {
        n.label: tuple(round(v, 6) for v in n.outputs[0].default_value[:3])
        for n in node_group.nodes
        if n.bl_idname == "ShaderNodeRGB"
    }


ng_a = create_palette_node_group("SCHOOL_A", WIRE_A)
vals_a = _rgb_values(ng_a)
check(
    "node group values equal the wire's declared linear values",
    vals_a["primary"] == (0.5, 0.25, 1.0),
    f"got {vals_a.get('primary')}",
)

ng_b = create_palette_node_group("SCHOOL_B", WIRE_B)
vals_b = _rgb_values(ng_b)
check(
    "two different palettes produce two different node groups",
    vals_a["primary"] != vals_b["primary"]
    and vals_a["accent"] != vals_b["accent"]
    and vals_a["glow"] != vals_b["glow"],
    f"A={vals_a} B={vals_b}",
)

# The consumer cannot invent values the wire did not carry.
refused = False
try:
    create_palette_node_group("SCHOOL_C", None)
except ValueError:
    refused = True
check(
    "a palette with no wire values is refused, not derived",
    refused,
    "create_palette_node_group fell back to deriving colour consumer-side",
)

# --- Summary ---
print(f"\n[test_palette] Results: {passed} passed, {failed} failed")
if failed > 0:
    sys.exit(1)
else:
    print("[test_palette] All palette tests passed.")
    sys.exit(0)
