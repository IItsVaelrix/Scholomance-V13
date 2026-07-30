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


def hex_to_linear(hex_color):
    """
    Convert sRGB hex to scene-linear RGB.
    Under EXACT policy, the transfer function is recorded in COLOR_LAW.
    IEC 61966-2-1 transfer function.
    """
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0

    def to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (to_linear(r), to_linear(g), to_linear(b))


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
            # Canonical path: dequantize from wire int32
            ch = wire_palette["channels"][role]
            scale = wire_palette.get("scale", 1e6)
            linear = dequantize_color(ch["linear"], scale)
            rgb_node.outputs[0].default_value = (linear[0], linear[1], linear[2], 1.0)
        else:
            # Fallback: derive from local hex constants
            palette = get_palette(school)
            linear = hex_to_linear(palette[role])
            rgb_node.outputs[0].default_value = (linear[0], linear[1], linear[2], 1.0)

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


def apply_palette_to_material(material, school, wire_palette=None):
    """
    Apply a school palette to a material's shader node tree.
    Creates the palette node group and connects it to the material output.

    Returns the created node group.
    """
    if not material.use_nodes:
        material.use_nodes = True

    tree = material.node_tree
    node_group = create_palette_node_group(school, wire_palette)

    # Add a group node referencing our palette
    group_node = tree.nodes.new("ShaderNodeGroup")
    group_node.node_tree = node_group
    group_node.location = (-200, 0)

    return node_group
