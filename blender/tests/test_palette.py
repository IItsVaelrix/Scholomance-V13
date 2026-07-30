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
from scholomance_pixelbrain.palette import (
    SCHOOL_PALETTE,
    hex_to_linear,
    dequantize_color,
    get_palette,
    create_palette_node_group,
    apply_palette_to_material,
)

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

# --- hex_to_linear ---
print("[test_palette] hex_to_linear:")
r, g, b = hex_to_linear("#ffffff")
check("white → (1,1,1)", abs(r - 1.0) < 1e-5 and abs(g - 1.0) < 1e-5 and abs(b - 1.0) < 1e-5,
      f"got ({r},{g},{b})")

r, g, b = hex_to_linear("#000000")
check("black → (0,0,0)", abs(r) < 1e-10 and abs(g) < 1e-10 and abs(b) < 1e-10,
      f"got ({r},{g},{b})")

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

# --- create_palette_node_group (no wire — fallback path) ---
print("[test_palette] create_palette_node_group (fallback):")
ng = create_palette_node_group("SONIC")
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
ng3 = create_palette_node_group("SONIC")
check("re-creation does not collide-rename", ng3.name == "PB_Palette_SONIC", f"got {ng3.name}")
sonic_groups = [g for g in bpy.data.node_groups if g.name.startswith("PB_Palette_SONIC")]
check("exactly one SONIC group", len(sonic_groups) == 1, f"got {len(sonic_groups)}")

# --- apply_palette_to_material ---
print("[test_palette] apply_palette_to_material:")
mat = bpy.data.materials.new("test_palette_mat")
ng4 = apply_palette_to_material(mat, "VOID")
check("material palette applied", ng4 is not None)
check("material has nodes", mat.use_nodes)
group_nodes = [n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeGroup"]
check("group node added to material", len(group_nodes) >= 1, f"got {len(group_nodes)}")

# --- Summary ---
print(f"\n[test_palette] Results: {passed} passed, {failed} failed")
if failed > 0:
    sys.exit(1)
else:
    print("[test_palette] All palette tests passed.")
    sys.exit(0)
