extends SceneTree

# Regression test for the mining/lighting volume desync:
# Mining an emissive ore must also remove it from the emissive light-source
# volume, otherwise the mined cell keeps glowing as if the block were still
# there (visible "repopulation" wherever two materials meet).

const VoidmetalCaveWorld = preload("res://scripts/VoidmetalCaveWorld.gd")
const SurfaceWorld = preload("res://scripts/SurfaceWorld.gd")

func _init() -> void:
	var passed := true
	passed = _test_prunes_mined_emissive_voxel(VoidmetalCaveWorld, "VoidmetalCaveWorld") and passed
	passed = _test_keeps_other_emissive_voxels(VoidmetalCaveWorld, "VoidmetalCaveWorld") and passed
	passed = _test_prunes_mined_emissive_voxel(SurfaceWorld, "SurfaceWorld") and passed
	passed = _test_keeps_other_emissive_voxels(SurfaceWorld, "SurfaceWorld") and passed
	for ws in [[VoidmetalCaveWorld, "VoidmetalCaveWorld"], [SurfaceWorld, "SurfaceWorld"]]:
		passed = _test_remesh_keys_interior_cell(ws[0], ws[1]) and passed
		passed = _test_remesh_keys_x_edge_cell(ws[0], ws[1]) and passed
		passed = _test_remesh_keys_corner_cell(ws[0], ws[1]) and passed
	if passed:
		print("All MiningDesyncTests passed.")
		quit(0)
	else:
		print("MiningDesyncTests FAILED.")
		quit(1)

func _test_prunes_mined_emissive_voxel(world_script: Variant, label: String) -> bool:
	var emissive: Array[Dictionary] = [
		{ "position": Vector3(5.5, 3.5, 7.5), "color": Color(0.4, 0.3, 1.0), "material_id": 3 },
	]
	world_script.prune_emissive_at(emissive, 5, 3, 7)
	if emissive.size() != 0:
		push_error("[%s] expected mined emissive source removed, got %d" % [label, emissive.size()])
		return false
	return true

func _test_keeps_other_emissive_voxels(world_script: Variant, label: String) -> bool:
	var emissive: Array[Dictionary] = [
		{ "position": Vector3(5.5, 3.5, 7.5), "color": Color(0.4, 0.3, 1.0), "material_id": 3 },
		{ "position": Vector3(10.5, 1.5, 2.5), "color": Color(0.6, 0.9, 1.0), "material_id": 4 },
	]
	world_script.prune_emissive_at(emissive, 5, 3, 7)
	if emissive.size() != 1:
		push_error("[%s] expected 1 emissive source remaining, got %d" % [label, emissive.size()])
		return false
	if int(floor(emissive[0].position.x)) != 10:
		push_error("[%s] wrong emissive voxel survived prune" % label)
		return false
	return true

# Mining a cell in the interior of a 12x12 chunk only affects that chunk:
# every horizontal neighbor maps to the same chunk key.
func _test_remesh_keys_interior_cell(world_script: Variant, label: String) -> bool:
	var keys: Array = world_script.chunk_keys_for_remesh(5, 5, 12, 12)
	if keys.size() != 1 or not keys.has("0,0"):
		push_error("[%s] interior cell expected ['0,0'], got %s" % [label, str(keys)])
		return false
	return true

# Mining on a chunk's x-edge must also remesh the neighbor chunk across the seam,
# otherwise that chunk keeps a culled wall -> see-through gap.
func _test_remesh_keys_x_edge_cell(world_script: Variant, label: String) -> bool:
	var keys: Array = world_script.chunk_keys_for_remesh(0, 5, 12, 12)
	if keys.size() != 2 or not keys.has("0,0") or not keys.has("-1,0"):
		push_error("[%s] x-edge cell expected {'0,0','-1,0'}, got %s" % [label, str(keys)])
		return false
	return true

# A corner cell touches two seams (x and z), but never the diagonal chunk,
# since a mined cell only exposes its 6 face-neighbors.
func _test_remesh_keys_corner_cell(world_script: Variant, label: String) -> bool:
	var keys: Array = world_script.chunk_keys_for_remesh(0, 0, 12, 12)
	if keys.size() != 3 or not keys.has("0,0") or not keys.has("-1,0") or not keys.has("0,-1"):
		push_error("[%s] corner cell expected {'0,0','-1,0','0,-1'}, got %s" % [label, str(keys)])
		return false
	return true
