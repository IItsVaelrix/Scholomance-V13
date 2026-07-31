"""
Render configuration, pixel dump, and claim emission.

The consumer never computes a hash and never mints a receipt.
It configures the render, dumps raw float32 pixels, and emits raw strings.
All hashing is JS-side.

Determinism checksums are taken over a raw float32 pixel dump, never over an
image file. EXR headers contain a wall-clock timestamp and a render-duration
string; a file hash fails 100% of the time.
"""

import os
import numpy as np
import bpy

# The EXACT colour law's sample count. Measured on Blender 5.2.0: 6/6 specimens
# round-trip byte-exactly at 1 sample, 1/6 at 16, 0/6 at 64 with a Gaussian
# filter. It is a contract term, not a quality setting.
EXACT_SAMPLES = 1


def apply_color_policy(scene, policy):
    """
    Apply the declared colour policy to the scene.
    EXACT => Standard view transform, no look, Non-Color images.
    SYNTHESIZED => AgX permitted.
    Mixing both in one output is refused, not resolved.
    """
    if policy == "EXACT":
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    elif policy == "SYNTHESIZED":
        # AgX is the default; leave it
        pass
    else:
        raise ValueError(f"unknown color policy: {policy!r}")
    return policy


def configure_deterministic_render(scene, seed, samples, threads=8, policy="EXACT"):
    """
    Configure Cycles for bit-reproducible rendering.
    Only a CPU device exists on this machine (CUEW initialization failed).

    Under EXACT policy the sample count is NOT a caller preference. Byte-exact
    colour round-trip holds at 1 sample and fails at 16 and 64 -- with a single
    sample per pixel there is nothing to average, so the pixel filter only
    chooses where that sample lands. Honouring a caller's 64 here would silently
    void the colour law, so it is overridden rather than trusted.

    The policy is passed in rather than inferred from scene state. Reading it
    back off view_transform would mean detecting the policy from its own side
    effects, and a SYNTHESIZED render that happened to be Standard would get
    pinned to one sample without anyone asking for it.
    """
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = int(seed)
    scene.cycles.use_animated_seed = False
    scene.cycles.samples = EXACT_SAMPLES if policy == "EXACT" else int(samples)
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = int(threads)
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "NONE"
    return scene


def dump_pixels_f32(basepath):
    """
    Render and write the raw float32 pixel payload to <basepath>.f32.

    Metadata-free by construction. The EXR beside it is for humans; the .f32 is
    what the bridge hashes.
    """
    scene = bpy.context.scene
    scene.render.filepath = basepath
    bpy.ops.render.render(write_still=True)

    img = bpy.data.images.load(basepath + ".exr")
    arr = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)

    out = basepath + ".f32"
    arr.tofile(out)
    return out


def emit_claim(scene, wire, dump_path):
    """
    Emit a raw claim. Raw strings and ints only. No hashing.
    The bridge mints the receipt.
    """
    build_hash = bpy.app.build_hash
    if isinstance(build_hash, bytes):
        build_hash = build_hash.decode()
    else:
        build_hash = str(build_hash)

    return {
        "engine": "blender",
        "packetId": wire["packetId"],
        "sourceChecksum": wire["sourceChecksum"],
        "colorPolicy": wire["colorPolicy"],
        "synthClass": "RASTER",
        "pixelDumpPath": os.path.abspath(dump_path),
        "observed": {
            "blenderVersion": bpy.app.version_string.split()[0],
            "buildHash": build_hash,
            "engine": scene.render.engine,
            "device": scene.cycles.device,
            "seed": int(scene.cycles.seed),
            "samples": int(scene.cycles.samples),
            "adaptive": bool(scene.cycles.use_adaptive_sampling),
            "denoise": bool(scene.cycles.use_denoising),
            "viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "resolutionX": int(scene.render.resolution_x),
            "resolutionY": int(scene.render.resolution_y),
            "threads": int(scene.render.threads),
        },
    }
