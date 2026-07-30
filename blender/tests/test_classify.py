"""
Test cold/warm path-dependence classifier.
Run via: ./scripts/blender-test.sh blender/tests/test_classify.py
"""
import sys
import bpy

from scholomance_pixelbrain.classify import classify_feature, ClassifyError

FAILURES = []

def check(name, fn):
    try:
        fn()
        print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name)
        print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name)
        print(f"  ERROR {name}: {type(e).__name__}: {e}")


def t_keyframes_are_conservative():
    """Keyframe interpolation is a pure function of frame — no path dependence."""
    def setup():
        # Clear scene
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete()
        bpy.ops.mesh.primitive_cube_add()
        cube = bpy.context.active_object
        cube.name = "TestCube"
        cube.location = (0, 0, 0)
        cube.keyframe_insert("location", frame=1)
        cube.location = (0, 0, 5)
        cube.keyframe_insert("location", frame=48)

    def evaluate():
        dg = bpy.context.evaluated_depsgraph_get()
        obj = bpy.data.objects["TestCube"]
        m = obj.evaluated_get(dg).matrix_world
        return [c for row in m for c in row]

    result = classify_feature(setup, evaluate, warmup_frames=24)
    assert result == "CONSERVATIVE", f"expected CONSERVATIVE, got {result}"


def t_empty_evaluation_is_refused():
    """An empty evaluation must raise, never report CONSERVATIVE."""
    try:
        classify_feature(lambda: None, lambda: [])
        assert False, "should have raised ClassifyError"
    except ClassifyError:
        pass


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
