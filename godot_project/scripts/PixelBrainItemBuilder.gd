extends RefCounted

const VoxelModelBuilder := preload("res://scripts/VoxelModelBuilder.gd")

const ARTIFACT_KIND := "scholomance.pixelbrain.godot.v1"

# Loads a PixelBrain item artifact and builds it as a Node3D. PB-VOXEL-ITEM
# packets (true 3D — authored sculpts or the structural-energy lift) render
# through the shared voxel renderer; the flat-extrude path is retired for items
# and kept only as a fallback for the legacy 2D coordinate artifact (PDR
# SCHOL-ENC-PDR-STRUCT-ENERGY-LIFT-v1.0).
static func build_extruded_item(path: String, options: Dictionary = {}) -> Node3D:
	var artifact := _load_artifact(path)
	if artifact.is_empty():
		var empty := Node3D.new()
		empty.name = str(options.get("name", "PixelBrainItem"))
		_add_fallback(empty)
		return empty
	if _is_voxel_packet(artifact):
		return _build_voxel_item(artifact, options)
	return _build_extruded_legacy(artifact, path, options)

# A true-3D voxel packet carries a `voxels` array (PB-VOXEL-*), unlike the legacy
# 2D `coordinates` artifact.
static func _is_voxel_packet(artifact: Dictionary) -> bool:
	if not artifact.has("voxels"):
		return false
	return artifact.get("voxels") is Array

static func _build_voxel_item(packet: Dictionary, options: Dictionary) -> Node3D:
	var cs := float(options.get("cell_size", 0.016))
	var dims: Dictionary = packet.get("dimensions", {})
	var w := float(dims.get("width", 0.0))
	var h := float(dims.get("height", 0.0))
	var d := float(dims.get("depth", 0.0))
	# Authored model-space packets are y-up; lifted (image-space) packets are y-down.
	var flip_y := str(packet.get("space", "image")) != "model"
	var origin := Vector3(-w, -h, -d) * 0.5 * cs
	var root := VoxelModelBuilder.build_node(packet, {
		"cell_size": cs,
		"flip_y": flip_y,
		"default_block": "item",
		"origin": origin,
	})
	root.name = str(options.get("name", "PixelBrainItem"))
	if root.get_child_count() == 0:
		_add_fallback(root)
	var root_scale: Variant = options.get("scale", Vector3.ONE)
	if root_scale is Vector3:
		root.scale = root_scale
	return root

static func _build_extruded_legacy(artifact: Dictionary, path: String, options: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = str(options.get("name", "PixelBrainItem"))

	if str(artifact.get("kind", "")) != ARTIFACT_KIND:
		push_error("PixelBrainItemBuilder: unsupported artifact kind at " + path)
		_add_fallback(root)
		return root

	var canvas: Dictionary = artifact.get("canvas", {})
	var width := float(canvas.get("width", 64.0))
	var height := float(canvas.get("height", 64.0))
	var cell_size := float(options.get("cell_size", 0.016))
	var depth := float(options.get("depth", 0.052))
	var coordinates_value: Variant = artifact.get("coordinates", [])
	if not (coordinates_value is Array):
		push_error("PixelBrainItemBuilder: artifact coordinates must be an array at " + path)
		_add_fallback(root)
		return root
	var coordinates: Array = coordinates_value
	if coordinates.is_empty():
		push_error("PixelBrainItemBuilder: artifact has no coordinates at " + path)
		_add_fallback(root)
		return root

	var buckets := {}
	for coord in coordinates:
		if not (coord is Dictionary):
			continue
		var part_id := str(coord.get("partId", coord.get("part", "item")))
		var color_hex := str(coord.get("color", "#ffffff")).to_upper()
		var key := part_id + "|" + color_hex
		if not buckets.has(key):
			buckets[key] = {"part_id": part_id, "color": color_hex, "cells": []}
		buckets[key].cells.append(coord)

	var keys := buckets.keys()
	keys.sort()
	for key in keys:
		var bucket: Dictionary = buckets[key]
		var cells: Array = bucket.get("cells", [])
		if cells.is_empty():
			continue
		var part_id := str(bucket.get("part_id", "item"))
		var box_mesh := BoxMesh.new()
		box_mesh.size = Vector3(cell_size, cell_size, _depth_for_part(part_id, depth))

		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = box_mesh
		mm.instance_count = cells.size()

		var z_offset := _z_offset_for_part(part_id, depth)
		for i in range(cells.size()):
			var cell: Dictionary = cells[i]
			var x := float(cell.get("x", cell.get("snappedX", 0.0)))
			var y := float(cell.get("y", cell.get("snappedY", 0.0)))
			var z := float(cell.get("z", 0.0))
			var px := (x - width * 0.5 + 0.5) * cell_size
			var py := (height * 0.5 - y - 0.5) * cell_size
			var pz := z * depth + z_offset
			mm.set_instance_transform(i, Transform3D(Basis(), Vector3(px, py, pz)))

		var mmi := MultiMeshInstance3D.new()
		mmi.name = "pb_" + part_id + "_" + str(bucket.get("color", "#ffffff")).replace("#", "")
		mmi.multimesh = mm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		mmi.custom_aabb = AABB(Vector3(-2, -2, -2), Vector3(4, 4, 4))
		mmi.material_override = _material_for_part(part_id, str(bucket.get("color", "#ffffff")))
		root.add_child(mmi)

	var root_scale: Variant = options.get("scale", Vector3.ONE)
	if root_scale is Vector3:
		root.scale = root_scale
	return root

static func _load_artifact(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("PixelBrainItemBuilder: could not open artifact " + path)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("PixelBrainItemBuilder: invalid JSON artifact " + path)
		return {}
	return parsed

static func _depth_for_part(part_id: String, base_depth: float) -> float:
	var lower := part_id.to_lower()
	if lower.find("inlay") >= 0 or lower.find("wrap") >= 0:
		return base_depth * 0.42
	if lower.find("handle") >= 0:
		return base_depth * 0.72
	if lower.find("collar") >= 0:
		return base_depth * 1.18
	return base_depth

static func _z_offset_for_part(part_id: String, base_depth: float) -> float:
	var lower := part_id.to_lower()
	if lower.find("inlay") >= 0:
		return base_depth * 0.58
	if lower.find("wrap") >= 0:
		return base_depth * 0.44
	if lower.find("collar") >= 0:
		return base_depth * 0.18
	if lower.find("handle") >= 0:
		return -base_depth * 0.08
	return 0.0

static func _material_for_part(part_id: String, color_hex: String) -> StandardMaterial3D:
	var lower := part_id.to_lower()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(color_hex)
	mat.roughness = 0.58
	if lower.find("head") >= 0 or lower.find("collar") >= 0:
		mat.metallic = 0.88
		mat.roughness = 0.24
	if lower.find("handle") >= 0:
		mat.metallic = 0.0
		mat.roughness = 0.86
	if lower.find("wrap") >= 0:
		mat.metallic = 0.78
		mat.roughness = 0.32
	if lower.find("inlay") >= 0 or lower.find("rune") >= 0:
		mat.metallic = 0.35
		mat.roughness = 0.18
		mat.emission_enabled = true
		mat.emission = mat.albedo_color
		mat.emission_energy_multiplier = 1.65
	return mat

static func _add_fallback(root: Node3D) -> void:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.16, 0.16, 0.04)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.85, 0.18, 0.72)
	mat.emission_enabled = true
	mat.emission = mat.albedo_color
	mat.emission_energy_multiplier = 0.7
	var fallback := MeshInstance3D.new()
	fallback.name = "PixelBrainItemFallback"
	fallback.mesh = mesh
	fallback.material_override = mat
	root.add_child(fallback)
