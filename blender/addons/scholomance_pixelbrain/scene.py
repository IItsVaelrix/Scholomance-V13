"""
Render scene preparation.

The bridge previously rendered whatever --factory-startup happened to provide:
a default cube, a camera aimed at the origin, and a light. The ingested asset
sat outside the frame and contributed nothing, so every pixel receipt was a
statement about the startup cube. Preparing the scene is therefore not a
convenience — it is the step that makes the receipt about the asset.

Everything here is derived from the packet. No wall clock, no randomness, no
user preferences: the same wire must produce the same scene on any machine.
"""

import bpy

# Framing margin around the asset bounds. Declared so two runs frame identically
# rather than depending on whatever the camera happened to be pointing at.
FRAME_MARGIN = 1.15

# Ortho camera sits above the lattice looking down -Z. PixelBrain coordinates
# are canvas coordinates, so an orthographic top-down view is the projection
# that preserves them; a perspective camera would make the receipt depend on
# distance as well as content.
CAMERA_HEIGHT = 100.0

EMISSION_MATERIAL = "pb_emission"
EMISSION_STRENGTH = 1.0


def _asset_bounds(obj):
    """
    Axis-aligned XY bounds of a point cloud, read from the position attribute.
    Returns (min_x, min_y, max_x, max_y).
    """
    data = obj.data
    count = len(data.attributes["position"].data)
    if count == 0:
        return (0.0, 0.0, 0.0, 0.0)

    flat = [0.0] * (count * 3)
    data.attributes["position"].data.foreach_get("vector", flat)

    xs = flat[0::3]
    ys = flat[1::3]
    return (min(xs), min(ys), max(xs), max(ys))


def ensure_emission_material(pc):
    """
    Attach a deterministic emission material so the render does not depend on a
    light rig. Idempotent: the material is created once and reused, because a
    second bpy.data.materials.new() would collide-rename silently.
    """
    mat = bpy.data.materials.get(EMISSION_MATERIAL)
    if mat is None:
        mat = bpy.data.materials.new(EMISSION_MATERIAL)
        mat.use_nodes = True
        tree = mat.node_tree
        tree.nodes.clear()
        emission = tree.nodes.new("ShaderNodeEmission")
        emission.inputs["Strength"].default_value = EMISSION_STRENGTH
        output = tree.nodes.new("ShaderNodeOutputMaterial")
        tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])

    if len(pc.materials) == 0:
        pc.materials.append(mat)
    else:
        pc.materials[0] = mat
    return mat


def clear_non_asset_renderables(keep):
    """
    Remove every renderable object except the asset. The factory-startup cube is
    the specific hazard: it is asset-independent, so leaving it in frame lets a
    receipt agree with itself while describing nothing.
    """
    removed = 0
    for obj in list(bpy.data.objects):
        if obj is keep:
            continue
        if obj.type in {"CAMERA", "LIGHT"}:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1
    return removed


def ensure_camera(scene):
    """Return the scene camera, creating one if the scene has none."""
    cam = scene.camera
    if cam is None:
        cam_data = bpy.data.cameras.new("pb_camera")
        cam = bpy.data.objects.new("pb_camera", cam_data)
        scene.collection.objects.link(cam)
        scene.camera = cam
    return cam


def frame_camera_on(obj, scene=None, margin=FRAME_MARGIN):
    """
    Point an orthographic camera straight down at the asset's XY bounds.
    The ortho scale is derived from the bounds, so the asset fills the frame
    the same way regardless of where in the canvas it sits.
    """
    scene = scene or bpy.context.scene
    min_x, min_y, max_x, max_y = _asset_bounds(obj)

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    extent = max(max_x - min_x, max_y - min_y)
    # A single-point asset has zero extent; fall back to one unit so the
    # ortho scale stays positive and the point remains visible.
    if extent <= 0.0:
        extent = 1.0

    cam = ensure_camera(scene)
    cam.data.type = "ORTHO"
    # Pad by the point radius so points on the boundary are not clipped in half.
    cam.data.ortho_scale = (extent + 2.0 * _radius_of(obj)) * margin
    cam.location = (center_x, center_y, CAMERA_HEIGHT)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    return cam


def _radius_of(obj):
    """Read the first point radius, or 0.0 when the cloud declares none."""
    attrs = obj.data.attributes
    if "radius" not in attrs or len(attrs["radius"].data) == 0:
        return 0.0
    return float(attrs["radius"].data[0].value)


def prepare_render_scene(obj, scene=None, margin=FRAME_MARGIN):
    """
    Make the scene describe the asset and nothing else.

    Removes non-asset renderables, attaches the emission material, and frames an
    orthographic camera on the asset bounds. Returns the camera.
    """
    scene = scene or bpy.context.scene
    clear_non_asset_renderables(keep=obj)
    ensure_emission_material(obj.data)
    return frame_camera_on(obj, scene=scene, margin=margin)
