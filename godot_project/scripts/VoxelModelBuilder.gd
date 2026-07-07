extends RefCounted
## Shared voxel-packet → MultiMesh renderer.
##
## Renders any PB-VOXEL-* packet — the hand-authored scholar (PB-VOXEL-CHAR) and
## the foundry/sculpt items (PB-VOXEL-ITEM) — as per-block pivot Node3Ds holding
## per-material MultiMesh cubes. Extracted from the bespoke scholar builder so the
## two content types share one renderer (PDR SCHOL-ENC-PDR-STRUCT-ENERGY-LIFT-v1.0,
## Risk #2: generalise, don't copy).
##
## Packet shape: { dimensions:{width,height,depth}, materials:{ "<id>":{colorHint,
## energy?, roughness?, metallic?} }, voxels:[{x,y,z,materialId, block?, energy?}],
## pivots?:{ "<block>":{x,y,z} } }
##
## opts:
##   cell_size      voxel edge length in metres (default 1.0)
##   flip_y         true for image-space packets (y-down); false for model-space (default false)
##   default_block  block name for voxels with no `block` tag (default "body")
##   origin         world translation applied to the whole model (Vector3, default 0)
##   fallback_pivot grid pivot for blocks absent from `pivots` (Vector3, default 0)
##   cast_shadow    whether instances cast shadows (default true)

const EMISSION_SCALE := 2.5

## Returns { "root": Node3D, "pivots": { block_name: Node3D } }.
static func build(packet: Dictionary, opts := {}) -> Dictionary:
	var root := Node3D.new()
	var pivots_out := {}

	var voxels_v: Variant = packet.get("voxels", [])
	if not (voxels_v is Array) or (voxels_v as Array).is_empty():
		return {"root": root, "pivots": pivots_out}
	var voxels: Array = voxels_v
	var mats: Dictionary = packet.get("materials", {})
	var dims: Dictionary = packet.get("dimensions", {})
	var height := int(dims.get("height", 0))
	var pivots: Dictionary = packet.get("pivots", {})

	var cs := float(opts.get("cell_size", 1.0))
	var flip_y := bool(opts.get("flip_y", false))
	var default_block := str(opts.get("default_block", "body"))
	var origin: Vector3 = opts.get("origin", Vector3.ZERO)
	var fallback_pivot: Vector3 = opts.get("fallback_pivot", Vector3.ZERO)
	var cast_shadow := bool(opts.get("cast_shadow", true))

	var half := Vector3(cs, cs, cs) * 0.5
	var box := BoxMesh.new()
	box.size = Vector3(cs, cs, cs)

	# Bucket: block -> key -> { mid, glow, energy, cells }. Splitting glowing
	# voxels into their own bucket lets a partly-glowing material (item runes)
	# share one MultiMesh per emission state.
	var blocks := {}
	for vox in voxels:
		var blk := str(vox.get("block", default_block))
		var mid := int(vox.get("materialId", 1))
		var v_energy := float(vox.get("energy", 0.0))
		var m_data: Dictionary = mats.get(str(mid), {})
		var m_energy := float(m_data.get("energy", 0.0))
		var glow: bool = v_energy > 0.0 or m_energy > 0.0
		var key := str(mid) + ("|g" if glow else "")
		if not blocks.has(blk):
			blocks[blk] = {}
		var bucket: Dictionary = blocks[blk]
		if not bucket.has(key):
			bucket[key] = {"mid": mid, "glow": glow, "energy": 0.0, "cells": []}
		var entry: Dictionary = bucket[key]
		entry.cells.append(vox)
		var e: float = max(v_energy, m_energy)
		if e > float(entry.energy):
			entry.energy = e

	for blk in blocks.keys():
		var pg_data: Variant = pivots.get(blk, null)
		var pivot_grid := fallback_pivot
		if pg_data is Dictionary:
			pivot_grid = Vector3(float(pg_data.get("x", 0)), float(pg_data.get("y", 0)), float(pg_data.get("z", 0)))
		var pp := _model_pos(pivot_grid, flip_y, height)

		var pivot_node := Node3D.new()
		pivot_node.name = "rig_" + blk
		pivot_node.position = pp * cs + origin

		for key in blocks[blk].keys():
			var entry: Dictionary = blocks[blk][key]
			var cells: Array = entry.cells
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = box
			mm.instance_count = cells.size()
			for i in range(cells.size()):
				var v = cells[i]
				var mp := _model_pos(Vector3(float(v.x), float(v.y), float(v.z)), flip_y, height)
				mm.set_instance_transform(i, Transform3D(Basis(), (mp - pp) * cs + half))

			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = mm
			if cast_shadow:
				mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			else:
				mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mmi.custom_aabb = AABB(Vector3(-2, -2, -2), Vector3(4, 4, 4))
			mmi.material_override = _make_material(mats.get(str(entry.mid), {}), bool(entry.glow), float(entry.energy))
			pivot_node.add_child(mmi)

		root.add_child(pivot_node)
		pivots_out[blk] = pivot_node

	return {"root": root, "pivots": pivots_out}

## Convenience: just the root Node3D.
static func build_node(packet: Dictionary, opts := {}) -> Node3D:
	return build(packet, opts).root

static func _model_pos(grid: Vector3, flip_y: bool, height: int) -> Vector3:
	if flip_y and height > 0:
		return Vector3(grid.x, float(height - 1) - grid.y, grid.z)
	return grid

static func _make_material(m_data: Dictionary, glow: bool, energy: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(str(m_data.get("colorHint", "#ffffff")))
	mat.roughness = float(m_data.get("roughness", 0.8))
	mat.metallic = float(m_data.get("metallic", 0.0))
	if glow and energy > 0.0:
		mat.emission_enabled = true
		mat.emission = mat.albedo_color
		mat.emission_energy_multiplier = energy * EMISSION_SCALE
	return mat
