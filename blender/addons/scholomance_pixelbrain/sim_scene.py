"""
Simulation scene creation for the chained receipt E2E.

Creates a minimal rigid body scene: a cube falling onto a plane.
Frames are stepped in order (warm path). Cold-starting any frame
returns the un-simulated state — this is the pathology the chained
receipt protocol exists to catch.

The consumer never computes a hash and never mints a receipt.
It creates the scene, steps frames, renders, dumps pixels, and
emits raw claims. All hashing is JS-side.
"""

import bpy
import math


def clear_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Remove orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)


def create_rigid_body_scene():
    """
    Create a minimal rigid body scene:
    - A plane at z=0 (passive rigid body)
    - A cube at z=3 (active rigid body, will fall)

    Returns (plane_obj, cube_obj).
    """
    clear_scene()

    # Ground plane
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    plane = bpy.context.active_object
    plane.name = "PB_GroundPlane"
    bpy.ops.rigidbody.object_add()
    plane.rigid_body.type = 'PASSIVE'
    plane.rigid_body.friction = 0.5
    plane.rigid_body.restitution = 0.1

    # Falling cube
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 3))
    cube = bpy.context.active_object
    cube.name = "PB_FallingCube"
    bpy.ops.rigidbody.object_add()
    cube.rigid_body.type = 'ACTIVE'
    cube.rigid_body.mass = 1.0
    cube.rigid_body.friction = 0.5
    cube.rigid_body.restitution = 0.3

    # Camera
    bpy.ops.object.camera_add(location=(8, -8, 6))
    camera = bpy.context.active_object
    camera.name = "PB_Camera"
    camera.rotation_euler = (math.radians(65), 0, math.radians(45))
    bpy.context.scene.camera = camera

    # Light
    bpy.ops.object.light_add(type='SUN', location=(5, 5, 10))
    light = bpy.context.active_object
    light.name = "PB_SunLight"
    light.data.energy = 3.0

    return plane, cube


# Rigid body step budget. DECLARED, not translated.
#
# This used to pass steps_per_second=60 to an RNA property Blender removed in
# 2.91. The replacement is substeps_per_frame, which is NOT the same quantity:
# steps_per_second = substeps_per_frame x fps. Translating 60 steps/sec at the
# scene's 24 fps gives 2.5 substeps/frame -- not an integer, and worse, it makes
# the simulation's determinism a function of the frame rate.
#
# A fixed substep count is what determinism needs, so the budget is declared
# directly and the fps coupling dropped. 10 is Blender's own default.
SUBSTEPS_PER_FRAME = 10
SOLVER_ITERATIONS = 10


def setup_rigid_body_world(scene, substeps_per_frame=SUBSTEPS_PER_FRAME,
                           solver_iterations=SOLVER_ITERATIONS):
    """
    Configure the rigid body world for deterministic simulation.
    Fixed substep count, fixed solver iterations.
    """
    rb_world = scene.rigidbody_world
    if rb_world is None:
        bpy.ops.rigidbody.world_add()
        rb_world = scene.rigidbody_world

    # Fail loudly on the next rename rather than silently simulating with
    # whatever defaults happen to be in place. The previous rename cost four
    # red tests and an E2E that reported a missing file instead of the cause.
    if not hasattr(rb_world, "substeps_per_frame"):
        raise AttributeError(
            "RigidBodyWorld has no 'substeps_per_frame' on this Blender build "
            f"({bpy.app.version_string}). The rigid body step budget cannot be "
            "declared, so the simulation would run at an undeclared timestep."
        )

    rb_world.substeps_per_frame = substeps_per_frame
    rb_world.solver_iterations = solver_iterations
    rb_world.use_split_impulse = True

    return rb_world


def simulated_z(obj):
    """
    Read an object's z from the EVALUATED depsgraph.

    obj.location is the authored transform and the rigid body solver never
    writes back to it: the falling cube reads 3.0 at every frame, forever.
    Every function here previously read obj.location.z, which made
    verify_scene_determinism compare the constant 3.0 against the constant 3.0
    and report the simulation deterministic. It could not have failed for any
    simulation, including one that was not running.
    """
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return obj.evaluated_get(depsgraph).matrix_world.translation.z


def _require_cube():
    cube = bpy.data.objects.get("PB_FallingCube")
    if cube is None:
        raise ValueError("PB_FallingCube not found in scene")
    return cube


def step_to_frame(scene, frame, frame_start=1):
    """
    Advance to `frame` by stepping every frame from `frame_start` (warm path).

    Rigid body state is accumulated, not evaluated on demand. Jumping straight
    to frame 30 returns the UN-SIMULATED state -- measured: warm stepping gives
    z = 3.000, 2.861, 2.306, 0.529, 0.500 across frames 1, 5, 10, 20, 30, while
    jumping gives 3.000 at every one of them. That difference is the pathology
    the chained receipt protocol exists to catch, so it is reproduced here
    deliberately rather than hidden behind a seek.
    """
    for f in range(frame_start, frame + 1):
        scene.frame_set(f)


def verify_scene_determinism(scene, frame_start=1, frame_end=10):
    """
    Verify that the rigid body simulation is deterministic by checking
    that the cube's z-position is the same across two warm runs.

    Returns (positions_run1, positions_run2, match).
    """
    cube = _require_cube()

    runs = []
    for _ in range(2):
        scene.frame_set(frame_start)
        positions = []
        for f in range(frame_start, frame_end + 1):
            scene.frame_set(f)
            positions.append(round(simulated_z(cube), 6))
        runs.append(positions)

    positions_1, positions_2 = runs
    match = positions_1 == positions_2
    return positions_1, positions_2, match


def get_cube_z_at_frame(scene, frame, warm=True):
    """
    Get the cube's simulated z at a frame.

    warm=True steps every frame from the scene start, which is the only way to
    get a simulated result. warm=False seeks directly and returns the
    un-simulated state on purpose -- the cold/warm divergence is a measurement
    this module exists to expose, not an accident to paper over.
    """
    cube = _require_cube()
    if warm:
        step_to_frame(scene, frame, frame_start=scene.frame_start)
    else:
        scene.frame_set(frame)
    return simulated_z(cube)
