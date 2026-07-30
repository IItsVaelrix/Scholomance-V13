"""
School palette as a reusable shader node group.

Hex values in SCHOOL_PALETTE are sRGB display values; shader inputs are
scene-linear. Under EXACT policy the authored hex must survive byte-exact, so
the conversion applied is recorded in the COLOR_LAW slot rather than assumed.
"""

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
    """
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0
    # sRGB to linear (IEC 61966-2-1)
    def to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (to_linear(r), to_linear(g), to_linear(b))


def get_palette(school):
    """Get the palette for a school, falling back to default."""
    return SCHOOL_PALETTE.get(school, SCHOOL_PALETTE["default"])


def create_palette_node_group(school):
    """
    Create a shader node group for a school palette.
    Returns the node group name.

    NOTE: This is a stub for slice 1. Full node group creation requires
    bpy context and is tested via the Blender headless harness.
    """
    palette = get_palette(school)
    # In a full implementation, this would create a ShaderNodeTree with
    # RGB nodes for primary, accent, and glow colors.
    return f"PB_Palette_{school}"
