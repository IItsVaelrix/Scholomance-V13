extends Node2D

const ArtifactLoader = preload("res://addons/scholomance_godot_bridge/runtime/artifact_loader.gd")
const QbitWorldBuilder = preload("res://addons/scholomance_godot_bridge/runtime/qbit_world_builder.gd")

@export var qbit_world_path := "res://assets/qbit-world.qworld"

var _world_root: Node2D = null

func _ready() -> void:
	var artifact := ArtifactLoader.load_json_file(qbit_world_path)
	if artifact.is_empty():
		push_error("QbitWorldScene: failed to load %s" % qbit_world_path)
		return

	var builder := QbitWorldBuilder.new()
	var packed_scene := builder.build_qbit_world_scene(artifact)
	builder.free()
	_world_root = packed_scene.instantiate()
	add_child(_world_root)
	_frame_world()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var hit := _pick_face(get_global_mouse_position())
		if hit != null:
			var resource: Variant = hit.get_meta("qbit_resource", {})
			print("QBIT harvest target: %s" % JSON.stringify(resource))

func _pick_face(world_pos: Vector2) -> Polygon2D:
	if _world_root == null:
		return null

	var faces := _world_root.get_children()
	for i in range(faces.size() - 1, -1, -1):
		var face := faces[i]
		if face is Polygon2D and Geometry2D.is_point_in_polygon(world_pos, face.polygon):
			return face
	return null

func _frame_world() -> void:
	var camera := get_node_or_null("Camera2D")
	if camera == null or _world_root == null:
		return

	var bounds := Rect2()
	var initialized := false
	for child in _world_root.get_children():
		if not child is Polygon2D:
			continue
		for point in child.polygon:
			if not initialized:
				bounds = Rect2(point, Vector2.ZERO)
				initialized = true
			else:
				bounds = bounds.expand(point)

	if not initialized:
		return

	camera.position = bounds.get_center()
	var viewport_size := get_viewport_rect().size
	var zoom_x: float = viewport_size.x / max(bounds.size.x + 96.0, 1.0)
	var zoom_y: float = viewport_size.y / max(bounds.size.y + 96.0, 1.0)
	var zoom_value: float = clamp(min(zoom_x, zoom_y), 0.35, 2.0)
	camera.zoom = Vector2(zoom_value, zoom_value)
