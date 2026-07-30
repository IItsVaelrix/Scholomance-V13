"""
Tests for simulation claim emission — per-frame claims for PATH_DEPENDENT renders.

Run via: ~/opt/blender/blender -b --factory-startup --python blender/tests/test_sim_claim.py

These tests verify the claim structure without actually rendering (no Cycles
invocation). The render path is tested by the E2E script.
"""

import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))

import bpy
from scholomance_pixelbrain.sim_claim import emit_sim_claim

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


print("[test_sim_claim] Starting simulation claim tests...")

# Minimal wire for testing
wire = {
    "wireVersion": 1,
    "packetId": "test-sim-packet",
    "sourceChecksum": "DEADBEEF",
    "colorPolicy": "EXACT",
    "coordinateCount": 1,
}

scene = bpy.context.scene

# --- emit_sim_claim structure ---
print("[test_sim_claim] emit_sim_claim structure:")
claim = emit_sim_claim(scene, wire, "/tmp/test_dump.f32", frame_index=5)

check("engine is blender", claim["engine"] == "blender")
check("packetId matches wire", claim["packetId"] == "test-sim-packet")
check("sourceChecksum matches wire", claim["sourceChecksum"] == "DEADBEEF")
check("synthClass is SIMULATED", claim["synthClass"] == "SIMULATED",
      f"got {claim.get('synthClass')}")
check("frameIndex is 5", claim["frameIndex"] == 5, f"got {claim.get('frameIndex')}")
check("pixelDumpPath is absolute", os.path.isabs(claim["pixelDumpPath"]))

# --- observed fields ---
print("[test_sim_claim] observed fields:")
obs = claim["observed"]
check("blenderVersion present", len(obs["blenderVersion"]) > 0)
check("buildHash present", len(obs["buildHash"]) > 0)
check("engine present", obs["engine"] in ("CYCLES", "BLENDER_EEVEE", "BLENDER_WORKBENCH"))
check("device present", obs["device"] in ("CPU", "GPU"))
check("seed is int", isinstance(obs["seed"], int))
check("samples is int", isinstance(obs["samples"], int))
check("frameIndex in observed", obs["frameIndex"] == 5, f"got {obs.get('frameIndex')}")
check("resolutionX is int", isinstance(obs["resolutionX"], int))
check("resolutionY is int", isinstance(obs["resolutionY"], int))

# --- JSON serializable ---
print("[test_sim_claim] JSON serializable:")
try:
    serialized = json.dumps(claim)
    check("claim serializes to JSON", True)
    roundtrip = json.loads(serialized)
    check("roundtrip preserves synthClass", roundtrip["synthClass"] == "SIMULATED")
    check("roundtrip preserves frameIndex", roundtrip["frameIndex"] == 5)
except Exception as e:
    check("claim serializes to JSON", False, str(e))

# --- No nulls ---
print("[test_sim_claim] no nulls:")
def has_null(obj, path="$"):
    if obj is None:
        return path
    if isinstance(obj, dict):
        for k, v in obj.items():
            result = has_null(v, f"{path}.{k}")
            if result:
                return result
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            result = has_null(v, f"{path}[{i}]")
            if result:
                return result
    return None

null_path = has_null(claim)
check("no nulls in claim", null_path is None, f"null at {null_path}")

# --- Frame 0 claim ---
print("[test_sim_claim] frame 0 claim:")
claim0 = emit_sim_claim(scene, wire, "/tmp/frame0.f32", frame_index=0)
check("frame 0 synthClass is SIMULATED", claim0["synthClass"] == "SIMULATED")
check("frame 0 frameIndex is 0", claim0["frameIndex"] == 0)

# --- Summary ---
print(f"\n[test_sim_claim] Results: {passed} passed, {failed} failed")
if failed > 0:
    sys.exit(1)
else:
    print("[test_sim_claim] All simulation claim tests passed.")
    sys.exit(0)
