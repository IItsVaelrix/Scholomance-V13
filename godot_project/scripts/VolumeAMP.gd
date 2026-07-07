class_name VolumeAMP
extends RefCounted

## VolumeAMP: Solid Voxel Volume Generator
## Converts voxel occupancy into physical block volume. Rendering may use
## culled or greedy-merged surfaces, but gameplay collision keeps every
## occupied cell as an authoritative solid 1x1x1 body.

static func apply_solid_volume(parent: CollisionObject3D, voxel_keys: Array) -> void:
	for key in voxel_keys:
		var coords: Vector3i = _parse_key(str(key))
		add_solid_cell(parent, coords.x, coords.y, coords.z)

static func apply_walkable_floor_volume(parent: CollisionObject3D, voxel_keys: Array, thickness: float) -> void:
	for key in voxel_keys:
		var coords: Vector3i = _parse_key(str(key))
		add_floor_cell(parent, coords.x, coords.y, coords.z, thickness)

static func add_solid_cell(parent: CollisionObject3D, x: int, y: int, z: int) -> void:
	var collision_shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.0, 1.0, 1.0)
	collision_shape.shape = box
	collision_shape.position = Vector3(float(x) + 0.5, float(y) + 0.5, float(z) + 0.5)
	collision_shape.set_meta("volume_amp_kind", "solid_voxel")
	collision_shape.set_meta("volume_amp_cell", Vector3i(x, y, z))
	parent.add_child(collision_shape)

static func add_floor_cell(parent: CollisionObject3D, x: int, y: int, z: int, thickness: float) -> void:
	var collision_shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.0, max(thickness, 0.01), 1.0)
	collision_shape.shape = box
	collision_shape.position = Vector3(float(x) + 0.5, float(y) - max(thickness, 0.01) * 0.5, float(z) + 0.5)
	collision_shape.set_meta("volume_amp_kind", "walkable_floor")
	collision_shape.set_meta("volume_amp_cell", Vector3i(x, y, z))
	parent.add_child(collision_shape)

static func _parse_key(key: String) -> Vector3i:
	var parts: PackedStringArray = key.split(",")
	if parts.size() < 3:
		return Vector3i.ZERO
	return Vector3i(int(parts[0]), int(parts[1]), int(parts[2]))
