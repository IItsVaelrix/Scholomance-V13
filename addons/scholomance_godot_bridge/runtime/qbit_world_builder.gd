@tool
extends Node

func build_qbit_world_scene(artifact: Dictionary) -> PackedScene:
	var root := Node2D.new()
	root.name = "QbitWorldArtifact"
	root.set_meta("scholomance_kind", artifact.get("kind", ""))
	root.set_meta("scholomance_version", artifact.get("version", 0))
	root.set_meta("school_weights", artifact.get("schoolWeights", {}))
	root.set_meta("qbit_params", artifact.get("params", {}))
	root.set_meta("qbit_telemetry", artifact.get("telemetry", {}))
	root.set_meta("pixelbrain_asset", artifact.get("pixelBrainAsset", {}))
	root.set_meta("wand_proposal", artifact.get("wandProposal", {}))
	root.set_meta("divwand_node", artifact.get("divWandNode", {}))

	for face in artifact.get("faces", []):
		if typeof(face) != TYPE_DICTIONARY:
			push_warning("Scholomance Godot Bridge: skipped non-object QBIT face.")
			continue
		var face_node := _build_face_polygon(face)
		root.add_child(face_node)
		face_node.owner = root

	var scene := PackedScene.new()
	var result := scene.pack(root)
	root.free()
	if result != OK:
		push_warning("Scholomance Godot Bridge: failed to pack QBIT world scene.")
	return scene

func _build_face_polygon(face: Dictionary) -> Polygon2D:
	var node := Polygon2D.new()
	node.name = _safe_node_name(str(face.get("id", "qbit_face")))
	node.polygon = _points_to_packed_vector2(face.get("polygon", []))
	node.color = _parse_color(str(face.get("fill", "#64748b")))
	node.set_meta("qbit_face_id", face.get("id", ""))
	node.set_meta("qbit_face_type", face.get("type", ""))
	node.set_meta("qbit_material_id", face.get("materialId", 0))
	node.set_meta("qbit_voxel", face.get("voxel", {}))
	node.set_meta("qbit_resource", face.get("resource", {}))
	node.set_meta("qbit_sort_key", face.get("sortKey", 0))
	node.z_index = 0
	return node

func _points_to_packed_vector2(points: Variant) -> PackedVector2Array:
	var packed := PackedVector2Array()
	if typeof(points) != TYPE_ARRAY:
		return packed
	for point in points:
		if typeof(point) != TYPE_DICTIONARY:
			continue
		var point_data: Dictionary = point
		packed.append(Vector2(float(point_data.get("x", 0.0)), float(point_data.get("y", 0.0))))
	return packed

func _parse_color(value: String) -> Color:
	if Color.html_is_valid(value):
		return Color.html(value)
	push_warning("Scholomance Godot Bridge: invalid QBIT face color '%s'; using #64748b." % value)
	return Color.html("#64748b")

func _safe_node_name(value: String) -> String:
	var out := value.replace(":", "_").replace(".", "_").replace("/", "_")
	if out.is_empty():
		return "qbit_face"
	return out
