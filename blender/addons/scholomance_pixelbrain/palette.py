"""
School palette as a reusable shader node group — full bpy implementation.

Hex values in SCHOOL_PALETTE are sRGB display values; shader inputs are
scene-linear. Under EXACT policy the authored hex must survive byte-exact, so
the conversion applied is recorded in the COLOR_LAW slot rather than assumed.

The node group exposes three RGB outputs (primary, accent, glow) and one
Factor output (glow strength). All colour values are set from the wire's
quantized int32 arrays, dequantized at the declared scale. The addon never
computes a hash — it applies values and reports what it applied.
"""

import bpy

SCHOOL_PALETTE = {
    "SONIC":   {"primary": "#7c3aed", "accent": "#a78bfa", "glow": "#7c3aed"},
    "PSYCHIC": {"primary": "#06b6d4", "accent": "#67e8f9", "glow": "#06b6d4"},
    "ALCHEMY": {"primary": "#f59e0b", "accent": "#fcd34d", "glow": "#f59e0b"},
    "WILL":    {"primary": "#ef4444", "accent": "#fca5a5", "glow": "#ef4444"},
    "VOID":    {"primary": "#6366f1", "accent": "#a5b4fc", "glow": "#6366f1"},
    "default": {"primary": "#9ca3af", "accent": "#d1d5db", "glow": "#9ca3af"},
}


def dequantize_color(int_triple, scale):
    """
    Dequantize an int32 [r, g, b] triple at the declared scale.
    The integer IS the value; the float is derived.
    """
    return tuple(v / scale for v in int_triple)


def get_palette(school):
    """Get the palette for a school, falling back to default."""
    return SCHOOL_PALETTE.get(school, SCHOOL_PALETTE["default"])


def create_palette_node_group(school, wire_palette=None):
    """
    Create a shader node group for a school palette.

    If wire_palette is provided (from palette-wire.js), values are taken from
    the quantized int32 arrays and dequantized at the declared scale. This is
    the canonical path: the integer is truth, the float is derived.

    If wire_palette is None, values are derived from the local SCHOOL_PALETTE
    hex constants via hex_to_linear. This is the fallback for standalone use.

    Returns the created node group datablock.
    """
    group_name = f"PB_Palette_{school}"

    # Remove existing group with this name to avoid collide-rename
    existing = bpy.data.node_groups.get(group_name)
    if existing is not None:
        bpy.data.node_groups.remove(existing)

    node_group = bpy.data.node_groups.new(group_name, "ShaderNodeTree")

    # Create output sockets via Group Output node
    output_node = node_group.nodes.new("NodeGroupOutput")
    output_node.location = (400, 0)

    # Create three RGB nodes for primary, accent, glow
    roles = ["primary", "accent", "glow"]
    rgb_nodes = {}

    for i, role in enumerate(roles):
        rgb_node = node_group.nodes.new("ShaderNodeRGB")
        rgb_node.label = role
        rgb_node.location = (0, -i * 200)

        if wire_palette and role in wire_palette.get("channels", {}):
            # The only path. The integer is truth, the float is derived.
            ch = wire_palette["channels"][role]
            scale = wire_palette.get("scale", 1e6)
            linear = dequantize_color(ch["linear"], scale)
            rgb_node.outputs[0].default_value = (linear[0], linear[1], linear[2], 1.0)
        else:
            raise ValueError(
                f"no wire palette channel for role {role!r}. The consumer cannot "
                "derive one: the sRGB transfer function lives in color-law.js and "
                "its result must arrive on the wire."
            )

        rgb_nodes[role] = rgb_node

    # Create a Value node for glow strength (default 1.0)
    glow_strength = node_group.nodes.new("ShaderNodeValue")
    glow_strength.label = "glow_strength"
    glow_strength.location = (0, -600)
    glow_strength.outputs[0].default_value = 1.0

    # Define the group interface sockets
    # Blender 4.0+ uses node_group.interface
    if hasattr(node_group, "interface"):
        for role in roles:
            node_group.interface.new_socket(
                name=role,
                in_out="OUTPUT",
                socket_type="NodeSocketColor",
            )
        node_group.interface.new_socket(
            name="glow_strength",
            in_out="OUTPUT",
            socket_type="NodeSocketFloat",
        )
    else:
        # Fallback for older API: use outputs directly
        for role in roles:
            node_group.outputs.new("NodeSocketColor", role)
        node_group.outputs.new("NodeSocketFloat", "glow_strength")

    # Link RGB nodes to group output
    for i, role in enumerate(roles):
        node_group.links.new(rgb_nodes[role].outputs[0], output_node.inputs[i])
    node_group.links.new(glow_strength.outputs[0], output_node.inputs[3])

    return node_group


"""
apply_palette_to_material was deleted here, deliberately.

It created the palette node group, added a ShaderNodeGroup referencing it, and
returned -- linking nothing to the material output. The group was inert. Worse,
scene.prepare_render_scene assigns materials[0] = pb_emission, so even a linked
palette material would have been clobbered before the render.

Measured 2026-07-30: the same claymore under ALCHEMY, VOID and WILL produced the
byte-identical pixel hash A4B6E16C and the identical SCD64 receipt, while
test_palette asserted "group node added to material" -- that a node was ADDED,
never that it was LINKED. Nineteen assertions were green over a path that
reached nothing.

It is not repaired, because there is nothing to repair it INTO. pb_albedo now
drives Emission.Color per coordinate, so a per-asset school accent has no
declared binding saying what it should modulate. Inventing one would be the
SCR-017 violation this bridge refuses for the seven unbound energy types.
Giving the palette a route to pixels is an art-direction decision with a
declared grade and evidence attached, and belongs in its own design.

The palette still crosses, and create_palette_node_group still verifies that.
"""
