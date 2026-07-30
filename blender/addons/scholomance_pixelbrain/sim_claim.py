"""
Simulation claim emission — per-frame claims for PATH_DEPENDENT renders.

Simulation caches (rigid body, cloth, fluid) are PATH_DEPENDENT: cold-starting
frame N returns the UN-SIMULATED state and Blender reports nothing wrong.
A distributed render of simulated content is silently incorrect.

The chained receipt makes frame N unsealable without N-1. This module emits
per-frame claims with the frame index and synth class set to SIMULATED.
The JS side builds the digest chain and mints chained receipts.

The consumer never computes a hash and never mints a receipt.
It configures the render, steps frames in order, dumps raw float32 pixels,
and emits raw strings. All hashing is JS-side.
"""

import os
import json
import numpy as np
import bpy

from . render_claim import configure_deterministic_render, apply_color_policy


def step_and_render_frame(scene, frame_index, base_dir, wire, seed=7, samples=64, threads=8):
    """
    Step to a specific frame (in order), render, and dump pixels.

    IMPORTANT: Frames MUST be stepped in order (1, 2, 3, ...). Cold-starting
    a frame returns the un-simulated state. This function assumes the caller
    is iterating frames sequentially.

    Returns (dump_path, claim_dict).
    """
    # Step to the frame — this is the warm path
    scene.frame_set(frame_index)

    # Configure render settings
    configure_deterministic_render(scene, seed=seed, samples=samples, threads=threads)

    # Render
    render_path = os.path.join(base_dir, f"frame_{frame_index:04d}")
    scene.render.filepath = render_path
    bpy.ops.render.render(write_still=True)

    # Dump raw float32 pixels — metadata-free by construction
    img = bpy.data.images.load(render_path + ".exr")
    arr = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)

    dump_path = render_path + ".f32"
    arr.tofile(dump_path)

    # Emit raw claim — no hashing
    claim = emit_sim_claim(scene, wire, dump_path, frame_index)

    return dump_path, claim


def emit_sim_claim(scene, wire, dump_path, frame_index):
    """
    Emit a raw claim for a simulated frame.
    synthClass is SIMULATED. frameIndex is explicit.
    Raw strings and ints only. No hashing.
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
        "synthClass": "SIMULATED",
        "frameIndex": int(frame_index),
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
            "frameIndex": int(frame_index),
        },
    }


def render_frame_range(scene, wire, base_dir, frame_start, frame_end,
                       seed=7, samples=64, threads=8):
    """
    Render a contiguous frame range in order, emitting per-frame claims.

    Frames are stepped sequentially (warm path). This is the ONLY correct
    way to render simulated content. Cold-starting any frame is refused
    by the JS-side chain verifier.

    Returns a list of (dump_path, claim) tuples.
    """
    apply_color_policy(scene, wire["colorPolicy"])

    results = []
    for frame in range(frame_start, frame_end + 1):
        dump_path, claim = step_and_render_frame(
            scene, frame, base_dir, wire,
            seed=seed, samples=samples, threads=threads,
        )
        results.append((dump_path, claim))

    # Write all claims to a manifest
    manifest_path = os.path.join(base_dir, "sim_manifest.json")
    manifest = {
        "packetId": wire["packetId"],
        "sourceChecksum": wire["sourceChecksum"],
        "synthClass": "SIMULATED",
        "frameStart": frame_start,
        "frameEnd": frame_end,
        "frameCount": frame_end - frame_start + 1,
        "claims": [claim for _, claim in results],
    }
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    return results
