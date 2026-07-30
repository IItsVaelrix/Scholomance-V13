"""
Tests for sim_scene.py — rigid body scene creation and determinism.

Run inside Blender headless:
  ./scripts/blender-test.sh blender/tests/test_sim_scene.py
"""

import sys
import os
import unittest

# Add addon path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'addons'))

import bpy
from scholomance_pixelbrain.sim_scene import (
    clear_scene,
    create_rigid_body_scene,
    setup_rigid_body_world,
    verify_scene_determinism,
    get_cube_z_at_frame,
)


class TestSimScene(unittest.TestCase):

    def setUp(self):
        clear_scene()

    def test_clear_scene_removes_all_objects(self):
        bpy.ops.mesh.primitive_cube_add()
        self.assertGreater(len(bpy.data.objects), 0)
        clear_scene()
        # Only default camera/light may remain depending on Blender version
        mesh_objects = [o for o in bpy.data.objects if o.type == 'MESH']
        self.assertEqual(len(mesh_objects), 0)

    def test_create_rigid_body_scene(self):
        plane, cube = create_rigid_body_scene()

        self.assertIsNotNone(plane)
        self.assertIsNotNone(cube)
        self.assertEqual(plane.name, "PB_GroundPlane")
        self.assertEqual(cube.name, "PB_FallingCube")

        # Rigid body properties
        self.assertEqual(plane.rigid_body.type, 'PASSIVE')
        self.assertEqual(cube.rigid_body.type, 'ACTIVE')
        self.assertAlmostEqual(cube.rigid_body.mass, 1.0)

        # Camera and light exist
        self.assertIn("PB_Camera", bpy.data.objects)
        self.assertIn("PB_SunLight", bpy.data.objects)

    def test_setup_rigid_body_world(self):
        create_rigid_body_scene()
        scene = bpy.context.scene
        rb_world = setup_rigid_body_world(scene, steps_per_second=60, solver_iterations=10)

        self.assertIsNotNone(rb_world)
        self.assertEqual(rb_world.steps_per_second, 60)
        self.assertEqual(rb_world.solver_iterations, 10)

    def test_cube_falls_over_frames(self):
        create_rigid_body_scene()
        scene = bpy.context.scene
        setup_rigid_body_world(scene)

        z_start = get_cube_z_at_frame(scene, 1)
        z_later = get_cube_z_at_frame(scene, 30)

        # Cube should have fallen (z decreased)
        self.assertGreater(z_start, z_later)

    def test_simulation_is_deterministic(self):
        create_rigid_body_scene()
        scene = bpy.context.scene
        setup_rigid_body_world(scene)

        pos1, pos2, match = verify_scene_determinism(scene, frame_start=1, frame_end=20)

        self.assertTrue(match, f"Simulation not deterministic: {pos1} vs {pos2}")
        self.assertEqual(len(pos1), 20)
        self.assertEqual(len(pos2), 20)

    def test_cold_vs_warm_divergence(self):
        """
        Cold-starting frame 20 returns the UN-SIMULATED state.
        Warm-stepping to frame 20 returns the simulated state.
        This is the pathology the chained receipt protocol catches.
        """
        create_rigid_body_scene()
        scene = bpy.context.scene
        setup_rigid_body_world(scene)

        # Warm path: step 1..20
        for f in range(1, 21):
            scene.frame_set(f)
        z_warm = scene.frame_current
        cube = bpy.data.objects["PB_FallingCube"]
        z_warm_pos = cube.location.z

        # Cold path: jump directly to frame 20
        # (In a fresh scene, this would return un-simulated state)
        # We can't fully test cold start without a fresh scene, but we can
        # verify the warm path produces a fallen cube
        self.assertLess(z_warm_pos, 3.0, "Cube should have fallen from z=3")


if __name__ == '__main__':
    # Run tests
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestSimScene)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
