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


def setup_rigid_body_world(scene, steps_per_second=60, solver_iterations=10):
    """
    Configure the rigid body world for deterministic simulation.
    Fixed timestep, fixed solver iterations.
    """
    rb_world = scene.rigidbody_world
    if rb_world is None:
        bpy.ops.rigidbody.world_add()
        rb_world = scene.rigidbody_world

    rb_world.steps_per_second = steps_per_second
    rb_world.solver_iterations = solver_iterations
    rb_world.use_split_impulse = True

    return rb_world


def verify_scene_determinism(scene, frame_start=1, frame_end=10):
    """
    Verify that the rigid body simulation is deterministic by checking
    that the cube's z-position is the same across two runs.

    Returns (positions_run1, positions_run2, match).
    """
    cube = bpy.data.objects.get("PB_FallingCube")
    if cube is None:
        raise ValueError("PB_FallingCube not found in scene")

    # Run 1
    scene.frame_set(frame_start)
    positions_1 = []
    for f in range(frame_start, frame_end + 1):
        scene.frame_set(f)
        positions_1.append(round(cube.location.z, 6))

    # Run 2 (reset and replay)
    scene.frame_set(frame_start)
    positions_2 = []
    for f in range(frame_start, frame_end + 1):
        scene.frame_set(f)
        positions_2.append(round(cube.location.z, 6))

    match = positions_1 == positions_2
    return positions_1, positions_2, match


def get_cube_z_at_frame(scene, frame):
    """Get the cube's z-position at a specific frame (warm path)."""
    cube = bpy.data.objects.get("PB_FallingCube")
    if cube is None:
        raise ValueError("PB_FallingCube not found in scene")
    scene.frame_set(frame)
    return cube.location.z
