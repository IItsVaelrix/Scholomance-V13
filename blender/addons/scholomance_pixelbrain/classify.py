"""
Cold/warm path-dependence classifier — the admission gate for any Blender
feature entering the suite.

An endpoint checksum is valid exactly when the process is conservative. Measured
on 2026-07-30 with Blender 5.2.0 LTS:

  motion blur       cold == warm  -> CONSERVATIVE
  geometry nodes    cold == warm  -> CONSERVATIVE (pure DAG)
  rigid body        cold != warm  -> PATH_DEPENDENT

Cold-starting a simulated frame returns the UN-SIMULATED state and Blender
reports nothing wrong, so a distributed render of simulated content is silently
incorrect. PATH_DEPENDENT features require the chained receipt.

Classification is mechanical, not a maintained list. The cold/warm test IS the
classifier. No Blender feature enters the suite until it has passed the
cold/warm classifier and had its class recorded.
"""

import hashlib
import bpy


class ClassifyError(Exception):
    """Classification failure — never silently pass."""
    pass


def classify_feature(setup_fn, evaluate_fn, warmup_frames=24):
    """
    Classify a Blender feature as CONSERVATIVE or PATH_DEPENDENT.

    setup_fn: callable that sets up the feature in the scene
    evaluate_fn: callable that returns a list of floats representing the
                 evaluated state (e.g. matrix elements)

    Cold: evaluate frame N directly after setup
    Warm: step frames 1..N, then evaluate frame N

    If cold == warm: CONSERVATIVE (endpoint checksum valid)
    If cold != warm: PATH_DEPENDENT (chained receipt required)
    """
    # Setup
    setup_fn()

    # Cold evaluation: jump directly to target frame
    scene = bpy.context.scene
    scene.frame_set(warmup_frames)
    cold_state = evaluate_fn()

    if not cold_state:
        raise ClassifyError("empty evaluation — refusing to classify nothing as CONSERVATIVE")

    cold_hash = hashlib.sha256(repr(cold_state).encode()).hexdigest()

    # Reset scene to frame 1 for warm evaluation
    scene.frame_set(1)

    # Warm evaluation: step through frames 1..N
    for f in range(1, warmup_frames + 1):
        scene.frame_set(f)
    warm_state = evaluate_fn()

    if not warm_state:
        raise ClassifyError("empty warm evaluation")

    warm_hash = hashlib.sha256(repr(warm_state).encode()).hexdigest()

    if cold_hash == warm_hash:
        return "CONSERVATIVE"
    else:
        return "PATH_DEPENDENT"
