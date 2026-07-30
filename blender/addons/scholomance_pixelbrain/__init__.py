"""
Scholomance PixelBrain — Blender addon.

Blender is the Synthesis Engine: authority over light, motion, and volume,
nothing else. PixelBrain remains the single producer of asset truth.

This addon decodes wire packets, verifies the seal by string equality,
applies to bpy, and emits raw claims. It NEVER computes a hash and NEVER
mints a receipt. All hashing is JS-side.
"""

bl_info = {
    "name": "Scholomance PixelBrain",
    "author": "Scholomance",
    "version": (1, 0, 0),
    "blender": (5, 2, 0),
    "location": "Properties > Scene",
    "description": "Ingest PixelBrain .pbrain assets as native attribute fields",
    "category": "Import-Export",
}

from . import packet, ingest, palette, render_claim, classify  # noqa: F401


def register():
    """Addon registration. Slice 1: no operators, no panels — headless only."""
    pass


def unregister():
    """Addon unregistration."""
    pass


if __name__ == "__main__":
    register()
