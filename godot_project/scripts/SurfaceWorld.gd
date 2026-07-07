extends Node3D

const TorchScene := preload("res://scripts/Torch.gd")
const VolumeAMP := preload("res://scripts/VolumeAMP.gd")
const InventoryClass := preload("res://scripts/Inventory.gd")
const PixelBrainItemBuilder := preload("res://scripts/PixelBrainItemBuilder.gd")
const VoxelModelBuilder := preload("res://scripts/VoxelModelBuilder.gd")

const WORLD_PATH := "res://assets/surface-world.qworld"
const SCHOLAR_PATH := "res://assets/void-scholar-voxel.packet.json"
const PICKAXE_ARTIFACT_PATH := "res://assets/items/voidmetal_pickaxe_sculpt.pbrain"
const BLOCK_REGISTRY_PATH := "res://assets/blocks/block-registry.json"
const PLAYER_SPEED := 5.4
const MOUSE_SENSITIVITY := 0.0025
const GRAVITY := 18.0
const JUMP_VELOCITY := 6.0
const THIRD_PERSON_DISTANCE := 5.2
const THIRD_PERSON_HEIGHT := 2.4
const FLOOR_COLLISION_THICKNESS := 0.18
const PLAYER_SPAWN_CLEARANCE := 1.08
const DEFAULT_CHUNK_SIZE_X := 12
const DEFAULT_CHUNK_SIZE_Z := 12
const DEFAULT_ACTIVE_CHUNK_RADIUS := 1
const TERRAIN_ATLAS_TILE_SIZE := 32
const VOXEL_LIGHT_RADIUS := 9.0
const VOXEL_LIGHT_BOUNCE_RADIUS := 3.5
const VOXEL_LIGHT_AMBIENT := 0.58
const VOXEL_LIGHT_DIRECT := 0.48
const VOXEL_LIGHT_BOUNCE := 0.32
const GREEDY_FACE_SPECS := {
	"top": {"u": "x", "v": "z"},
	"bottom": {"u": "x", "v": "z"},
	"east": {"u": "z", "v": "y"},
	"west": {"u": "z", "v": "y"},
	"north": {"u": "x", "v": "y"},
	"south": {"u": "x", "v": "y"},
}
const FACE_ATLAS_ROWS := {
	"top": 0,
	"east": 1,
	"west": 1,
	"north": 1,
	"south": 1,
	"bottom": 2,
}
const INVENTORY_MANIFEST_PATH := "res://assets/inventory/inventory-assets.manifest.json"
const PICKAXE_REST_POS := Vector3(0.38, -0.40, -0.64)
const PICKAXE_REST_ROT := Vector3(14.0, -16.0, 8.0)
const MINING_ANIM_SPEED := 5.5
const FLOAT_ITEM_DURATION := 0.55
const INVENTORY_COLUMNS := 6
const INVENTORY_ROWS := 4
const INVENTORY_SLOT_COUNT := INVENTORY_COLUMNS * INVENTORY_ROWS
const ITEM_DEFS := {
	"grimwood_shard": {"name": "Grimwood", "icon": "stick", "rarity": "Common"},
	"torch": {"name": "Torch", "icon": "torch", "rarity": "Common"},
	"stick": {"name": "Stick", "icon": "stick", "rarity": "Common"},
	"grimwood_torch": {"name": "Grimwood Torch", "icon": "torch", "rarity": "Common"},
}
const RECIPE_SWORD := {
	"id": "grimwood_torch",
	"name": "Grimwood Torch",
	"inputs": {"grimwood_shard": 1, "stick": 1},
	"output": "grimwood_torch",
	"output_count": 2,
}
const FACE_ALIAS := {"east": "side", "west": "side", "north": "side", "south": "side"}
const MINING_DURATION := {
	1: 0.55,   # grimstone / voidstone — hard, fast (void-infused pickaxe resonates)
	2: 1.8,    # peat / damp earth — soft, slow to cut through
	3: 1.8,    # ash-grass / loam — fibrous, slow
	4: 0.9,    # grimwood — medium
	5: 0.55,   # ruins brick — brittle, fast
}
const MINING_SWING_SPEED := 3.6
const STARTER_ITEMS := {
	"torch": 2,
	"stick": 3,
	"grimwood_shard": 1,
}

var _world: Dictionary = {}
var _occupied := {}
var _block_ids := {}
var _walkable := {}
var _mineables := {}
var _materials := {}
var _block_registry: Dictionary = {}
var _block_atlas_slots := {}
var _terrain_chunks := {}
var _voxel_light_cache := {}
var _emissive_voxels: Array[Dictionary] = []
var _terrain_root: Node3D
var _terrain_atlas_material: StandardMaterial3D
var _terrain_atlas_columns := 1
var _terrain_atlas_rows := 1
var _chunk_size_x := DEFAULT_CHUNK_SIZE_X
var _chunk_size_z := DEFAULT_CHUNK_SIZE_Z
var _active_chunk_radius := DEFAULT_ACTIVE_CHUNK_RADIUS
var _inventory_assets: Dictionary = {}
var _inv: Node
var _inventory_open := false
var _third_person := false
var _yaw := 0.0
var _pitch := 0.0
var _player: CharacterBody3D
var _camera: Camera3D
var _avatar_root: Node3D
var _hud_label: Label
var _inventory_layer: CanvasLayer
var _inventory_root: Control
var _inventory_slots: Array = []
var _placed_torches := {}
var _sword_mesh: MeshInstance3D
var _pickaxe_mesh: Node3D
var _mining_anim_t := -1.0
var _mining_target: Dictionary = {}
var _mining_swing_t := 0.0
var _float_items: Array = []
var _debug_tick_counter := 0
var _simulate_walk := false
var _simulate_walk_start_pos: Vector3
var _simulate_walk_tick := 0
var _dirty_chunks: Array[String] = []

func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_world = _load_json(WORLD_PATH)
	if _world.is_empty():
		push_error("SurfaceWorld: failed to load %s" % WORLD_PATH)
		return

	_inv = InventoryClass.new()
	add_child(_inv)
	_build_lookup_tables()
	_load_inventory_assets()
	_build_terrain()
	_build_player()
	_build_lighting()
	_build_hud()
	_build_inventory_ui()
	_give_starter_items()
	_update_camera_mode()
	_spawn_pickaxe_in_hand()

	if "--simulate-walk" in OS.get_cmdline_user_args():
		_simulate_walk = true
		print("simulate-walk mode: forcing +X velocity for 60 frames")

func _physics_process(delta: float) -> void:
	if _dirty_chunks.size() > 0:
		var chunk_key: String = _dirty_chunks.pop_front()
		_rebuild_chunk_mesh(chunk_key)

	if _player == null:
		return

	var input := Vector2.ZERO
	if Input.is_key_pressed(KEY_W):
		input.y += 1.0
	if Input.is_key_pressed(KEY_S):
		input.y -= 1.0
	if Input.is_key_pressed(KEY_D):
		input.x += 1.0
	if Input.is_key_pressed(KEY_A):
		input.x -= 1.0

	if _debug_tick_counter < 5 and "--physics-trace" in OS.get_cmdline_user_args():
		print("[physics tick %d] t=%.2f input=%s pos=%s on_floor=%s vel=%s" % [
			_debug_tick_counter,
			Time.get_ticks_msec() / 1000.0,
			str(input),
			str(_player.global_position),
			str(_player.is_on_floor()),
			str(_player.velocity),
		])
		_debug_tick_counter += 1

	var basis := Basis(Vector3.UP, _yaw)
	var forward := -basis.z
	var right := basis.x
	var direction := (forward * input.y + right * input.x).normalized()
	_player.velocity.x = direction.x * PLAYER_SPEED
	_player.velocity.z = direction.z * PLAYER_SPEED

	if not _player.is_on_floor():
		_player.velocity.y -= GRAVITY * delta
	elif Input.is_key_pressed(KEY_SPACE):
		_player.velocity.y = JUMP_VELOCITY

	_player.move_and_slide()
	_update_chunk_visibility()
	_update_camera_transform()
	_update_hud()
	_tick_pickaxe_anim(delta)
	_tick_float_items(delta)

	if _simulate_walk:
		_simulate_walk_tick += 1
		if _simulate_walk_tick == 1:
			_simulate_walk_start_pos = _player.global_position
		_player.velocity.x = 5.4
		_player.velocity.z = 0.0
		_player.move_and_slide()
		if _simulate_walk_tick >= 60:
			var end_pos: Vector3 = _player.global_position
			var dx: float = end_pos.x - _simulate_walk_start_pos.x
			print("simulate-walk: start=%s end=%s dx=%.3f" % [str(_simulate_walk_start_pos), str(end_pos), dx])
			if absf(dx) > 1.0:
				print("simulate-walk: PASS — player moved horizontally")
			else:
				print("simulate-walk: FAIL — player did not move")
			get_tree().quit()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif event.keycode == KEY_C and event.alt_pressed:
			_third_person = not _third_person
			_update_camera_mode()
		elif event.keycode == KEY_I:
			_inventory_open = not _inventory_open
			_update_inventory_ui()
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if _inventory_open else Input.MOUSE_MODE_CAPTURED
		elif event.keycode == KEY_T:
			_place_torch_at_feet()
		elif event.keycode == KEY_K:
			_craft_recipe(RECIPE_SWORD)
		elif event.keycode == KEY_E:
			_mine_nearest_grimwood()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_RIGHT and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			_raycast_mine_block()
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_yaw -= event.relative.x * MOUSE_SENSITIVITY
		_pitch = clamp(_pitch - event.relative.y * MOUSE_SENSITIVITY, -1.25, 1.15)

func _load_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}

func _build_lookup_tables() -> void:
	_load_chunk_settings()
	_load_block_registry()

	for solid in _world.get("gameplay", {}).get("collisionSolids", []):
		var key := _key(solid.x, solid.y, solid.z)
		var material_id: int = int(solid.materialId)
		_occupied[key] = material_id
		_block_ids[key] = str(solid.get("blockId", _resolve_block_id(material_id, int(solid.x), int(solid.y), int(solid.z))))

	for cell in _world.get("gameplay", {}).get("walkable", []):
		_walkable[_key(cell.x, cell.y, cell.z)] = true

	for node in _world.get("gameplay", {}).get("mineables", []):
		var voxel: Dictionary = node.get("voxel", {})
		_mineables[_key(voxel.x, voxel.y, voxel.z)] = node

	_build_emissive_voxel_index()

	_materials = {
		1: _make_material(Color(0.07, 0.06, 0.12), Color.BLACK),
		2: _make_material(Color(0.16, 0.13, 0.21), Color.BLACK),
		3: _make_material(Color(0.46, 0.39, 1.0), Color(0.18, 0.13, 0.72)),
		4: _make_material(Color(0.65, 0.95, 1.0), Color(0.2, 0.88, 1.0)),
		5: _make_material(Color(0.12, 0.78, 0.86), Color(0.06, 0.62, 0.7)),
	}

func _load_inventory_assets() -> void:
	var manifest := _load_json(INVENTORY_MANIFEST_PATH)
	_inventory_assets = manifest.get("assets", {})

func _load_block_registry() -> void:
	var registry_path := str(_world.get("blockRegistry", {}).get("path", BLOCK_REGISTRY_PATH))
	_block_registry = _load_json(registry_path)
	if _block_registry.is_empty():
		push_warning("SurfaceWorld: failed to load block registry %s; using procedural atlas fallback." % registry_path)
		_block_registry = {
			"tileSize": TERRAIN_ATLAS_TILE_SIZE,
			"defaultBlockId": "voidstone_smooth",
			"blocks": {},
		}
	_build_block_atlas_slots()

func _build_block_atlas_slots() -> void:
	_block_atlas_slots.clear()
	var blocks: Dictionary = _block_registry.get("blocks", {})
	var block_ids := blocks.keys()
	block_ids.sort()
	if block_ids.is_empty():
		block_ids = ["grimstone_block", "grimstone_mossy", "peat_damp", "peat_dry", "ash_grass", "grimwood_log", "ruins_brick"]
	for index in range(block_ids.size()):
		_block_atlas_slots[str(block_ids[index])] = index
	_terrain_atlas_columns = max(1, block_ids.size())
	_terrain_atlas_rows = 3

func _build_terrain() -> void:
	_terrain_chunks.clear()
	_voxel_light_cache.clear()
	_terrain_atlas_material = _build_terrain_atlas_material()
	_terrain_root = Node3D.new()
	_terrain_root.name = "GeneratedTerrain"
	add_child(_terrain_root)

	for key in _occupied.keys():
		var parts: PackedStringArray = String(key).split(",")
		var x: int = int(parts[0])
		var y: int = int(parts[1])
		var z: int = int(parts[2])
		var material_id: int = _occupied[key]
		var chunk_key: String = _chunk_key_for_cell(x, z)
		var chunk_data: Dictionary = _terrain_chunk_data(chunk_key, x, z)
		chunk_data.solid_keys.append(key)

	for chunk_key in _terrain_chunks.keys():
		var chunk_data: Dictionary = _terrain_chunks[chunk_key]
		_build_greedy_chunk_mesh(chunk_data)

	for key in _walkable.keys():
		var parts: PackedStringArray = String(key).split(",")
		var x: int = int(parts[0])
		var z: int = int(parts[2])
		var chunk_key: String = _chunk_key_for_cell(x, z)
		var chunk_data: Dictionary = _terrain_chunk_data(chunk_key, x, z)
		chunk_data.floor_keys.append(key)

	for chunk_key in _terrain_chunks.keys():
		var chunk_data: Dictionary = _terrain_chunks[chunk_key]
		var chunk_node: Node3D = Node3D.new()
		chunk_node.name = "Chunk_%s" % str(chunk_key)
		chunk_node.set_meta("chunk_x", int(chunk_data.chunk_x))
		chunk_node.set_meta("chunk_z", int(chunk_data.chunk_z))
		_terrain_root.add_child(chunk_node)
		chunk_data.node = chunk_node

		var st: SurfaceTool = chunk_data.surface_tool
		st.generate_normals()
		var mesh: ArrayMesh = st.commit()
		if mesh != null:
			var mesh_instance: MeshInstance3D = MeshInstance3D.new()
			mesh_instance.name = "AtlasTerrain"
			mesh_instance.mesh = mesh
			mesh_instance.material_override = _terrain_atlas_material
			chunk_node.add_child(mesh_instance)

		var static_body: StaticBody3D = StaticBody3D.new()
		static_body.name = "TerrainCollision_%s" % str(chunk_key)
		VolumeAMP.apply_solid_volume(static_body, chunk_data.solid_keys)
		chunk_node.add_child(static_body)
		chunk_data.static_body = static_body

		var floor_body: StaticBody3D = StaticBody3D.new()
		floor_body.name = "WalkableFloorCollision_%s" % str(chunk_key)
		VolumeAMP.apply_walkable_floor_volume(floor_body, chunk_data.floor_keys, FLOOR_COLLISION_THICKNESS)
		chunk_node.add_child(floor_body)
		chunk_data.floor_body = floor_body

		_update_chunk_visibility()

func _load_chunk_settings() -> void:
	var chunk_info: Dictionary = _world.get("chunks", {})
	var chunk_size: Dictionary = chunk_info.get("size", {})
	_chunk_size_x = max(1, int(chunk_size.get("x", DEFAULT_CHUNK_SIZE_X)))
	_chunk_size_z = max(1, int(chunk_size.get("z", DEFAULT_CHUNK_SIZE_Z)))
	_active_chunk_radius = max(0, int(chunk_info.get("activeRadius", DEFAULT_ACTIVE_CHUNK_RADIUS)))

# Remove the emissive light source at a mined cell so the volume stays in sync
# with occupancy. Without this, a mined ore keeps glowing and reads as if the
# block were still there. Static + array-in so it is unit-testable.
static func prune_emissive_at(emissive: Array, x: int, y: int, z: int) -> void:
	for i in range(emissive.size() - 1, -1, -1):
		var pos: Vector3 = emissive[i].get("position", Vector3.ZERO)
		if int(floor(pos.x)) == x and int(floor(pos.y)) == y and int(floor(pos.z)) == z:
			emissive.remove_at(i)

# Distinct chunk keys whose mesh must be rebuilt when (x, z) is mined: the cell's
# own chunk plus any neighbor chunk across a seam. A mined cell exposes only its
# 6 face-neighbors, so only the 4 horizontal axis-neighbors can land in another
# chunk (vertical neighbors always share the (x,z) chunk).
static func chunk_keys_for_remesh(x: int, z: int, csx: int, csz: int) -> Array:
	var keys: Array = []
	for c in [[x, z], [x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]:
		var ck := "%d,%d" % [int(floor(float(c[0]) / float(csx))), int(floor(float(c[1]) / float(csz)))]
		if not keys.has(ck):
			keys.append(ck)
	return keys

func _build_emissive_voxel_index() -> void:
	_emissive_voxels.clear()
	for key in _occupied.keys():
		var material_id: int = int(_occupied[key])
		var emission: Color = _material_emission_color(material_id)
		if emission == Color.BLACK:
			continue
		var parts: PackedStringArray = String(key).split(",")
		_emissive_voxels.append({
			"position": Vector3(float(parts[0]) + 0.5, float(parts[1]) + 0.5, float(parts[2]) + 0.5),
			"color": emission,
			"material_id": material_id,
		})

func _terrain_chunk_data(chunk_key: String, x: int, z: int) -> Dictionary:
	if not _terrain_chunks.has(chunk_key):
		var chunk_x: int = int(floor(float(x) / float(_chunk_size_x)))
		var chunk_z: int = int(floor(float(z) / float(_chunk_size_z)))
		var st: SurfaceTool = SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		_terrain_chunks[chunk_key] = {
			"chunk_x": chunk_x,
			"chunk_z": chunk_z,
			"surface_tool": st,
			"solid_keys": [],
			"floor_keys": [],
			"node": null,
			"static_body": null,
			"floor_body": null,
		}
	return _terrain_chunks[chunk_key]

func _build_greedy_chunk_mesh(chunk_data: Dictionary) -> void:
	var groups: Dictionary = {}
	for solid_key in chunk_data.solid_keys:
		var parts: PackedStringArray = String(solid_key).split(",")
		var x: int = int(parts[0])
		var y: int = int(parts[1])
		var z: int = int(parts[2])
		var material_id: int = int(_occupied[solid_key])
		var block_id: String = str(_block_ids.get(solid_key, _resolve_block_id(material_id, x, y, z)))
		for face in _exposed_faces(x, y, z):
			var axes: Dictionary = GREEDY_FACE_SPECS[face]
			var plane: int = _face_plane(face, x, y, z)
			var u: int = _axis_value(str(axes.u), x, y, z)
			var v: int = _axis_value(str(axes.v), x, y, z)
			var group_key: String = "%s:%s:%d" % [face, block_id, plane]
			if not groups.has(group_key):
				groups[group_key] = {
					"face": face,
					"material_id": material_id,
					"block_id": block_id,
					"plane": plane,
					"cells": {},
					"min_u": u,
					"max_u": u,
					"min_v": v,
					"max_v": v,
				}
			var group: Dictionary = groups[group_key]
			group.cells[Vector2i(u, v)] = true
			group.min_u = min(int(group.min_u), u)
			group.max_u = max(int(group.max_u), u)
			group.min_v = min(int(group.min_v), v)
			group.max_v = max(int(group.max_v), v)

	for group_key in groups.keys():
		_emit_greedy_group(chunk_data.surface_tool, groups[group_key])

func _emit_greedy_group(st: SurfaceTool, group: Dictionary) -> void:
	var visited: Dictionary = {}
	var cells: Dictionary = group.cells
	var face: String = str(group.face)
	var material_id: int = int(group.material_id)
	var block_id: String = str(group.block_id)
	var plane: int = int(group.plane)
	for v in range(int(group.min_v), int(group.max_v) + 1):
		for u in range(int(group.min_u), int(group.max_u) + 1):
			var start_key := Vector2i(u, v)
			if visited.has(start_key) or not cells.has(start_key):
				continue

			var width := 1
			while cells.has(Vector2i(u + width, v)) and not visited.has(Vector2i(u + width, v)):
				width += 1

			var height := 1
			var can_grow := true
			while can_grow:
				for scan_u in range(u, u + width):
					var scan_key := Vector2i(scan_u, v + height)
					if not cells.has(scan_key) or visited.has(scan_key):
						can_grow = false
						break
				if can_grow:
					height += 1

			for mark_v in range(v, v + height):
				for mark_u in range(u, u + width):
					visited[Vector2i(mark_u, mark_v)] = true

			_add_merged_face(st, face, material_id, block_id, plane, u, v, width, height)

func _add_merged_face(st: SurfaceTool, face: String, material_id: int, block_id: String, plane: int, u: int, v: int, width: int, height: int) -> void:
	var verts: Array[Vector3] = _merged_face_vertices(face, plane, u, v, width, height)
	var normal: Vector3 = _face_normal(face)
	var uvs: Array[Vector2] = _atlas_uvs(block_id, face)
	var colors: Array[Color] = [
		_voxel_light_at(verts[0], normal, material_id),
		_voxel_light_at(verts[1], normal, material_id),
		_voxel_light_at(verts[2], normal, material_id),
		_voxel_light_at(verts[3], normal, material_id),
	]
	_add_triangle(st, verts[0], verts[1], verts[2], normal, uvs[0], uvs[1], uvs[2], colors[0], colors[1], colors[2])
	_add_triangle(st, verts[0], verts[2], verts[3], normal, uvs[0], uvs[2], uvs[3], colors[0], colors[2], colors[3])

func _merged_face_vertices(face: String, plane: int, u: int, v: int, width: int, height: int) -> Array[Vector3]:
	match face:
		"top":
			return [
				Vector3(float(u), float(plane + 1), float(v + height)),
				Vector3(float(u + width), float(plane + 1), float(v + height)),
				Vector3(float(u + width), float(plane + 1), float(v)),
				Vector3(float(u), float(plane + 1), float(v)),
			]
		"bottom":
			return [
				Vector3(float(u), float(plane), float(v)),
				Vector3(float(u + width), float(plane), float(v)),
				Vector3(float(u + width), float(plane), float(v + height)),
				Vector3(float(u), float(plane), float(v + height)),
			]
		"east":
			return [
				Vector3(float(plane + 1), float(v), float(u)),
				Vector3(float(plane + 1), float(v + height), float(u)),
				Vector3(float(plane + 1), float(v + height), float(u + width)),
				Vector3(float(plane + 1), float(v), float(u + width)),
			]
		"west":
			return [
				Vector3(float(plane), float(v), float(u + width)),
				Vector3(float(plane), float(v + height), float(u + width)),
				Vector3(float(plane), float(v + height), float(u)),
				Vector3(float(plane), float(v), float(u)),
			]
		"south":
			return [
				Vector3(float(u + width), float(v), float(plane + 1)),
				Vector3(float(u + width), float(v + height), float(plane + 1)),
				Vector3(float(u), float(v + height), float(plane + 1)),
				Vector3(float(u), float(v), float(plane + 1)),
			]
		_:
			return [
				Vector3(float(u), float(v), float(plane)),
				Vector3(float(u), float(v + height), float(plane)),
				Vector3(float(u + width), float(v + height), float(plane)),
				Vector3(float(u + width), float(v), float(plane)),
			]

func _face_normal(face: String) -> Vector3:
	match face:
		"east":
			return Vector3.RIGHT
		"west":
			return Vector3.LEFT
		"top":
			return Vector3.UP
		"bottom":
			return Vector3.DOWN
		"south":
			return Vector3.BACK
		_:
			return Vector3.FORWARD

func _face_plane(face: String, x: int, y: int, z: int) -> int:
	match face:
		"top", "bottom":
			return y
		"east", "west":
			return x
		_:
			return z

func _axis_value(axis: String, x: int, y: int, z: int) -> int:
	match axis:
		"x":
			return x
		"y":
			return y
		_:
			return z

func _build_player() -> void:
	var spawn: Dictionary = _world.get("playerSpawn", {"x": 5, "y": 2, "z": 8, "facing": "east"})
	_player = CharacterBody3D.new()
	_player.name = "VoidScholarPlayer"
	var spawn_x := int(spawn.get("x", 5))
	var spawn_z := int(spawn.get("z", 8))
	var floor_y := _walkable_top_y_at(spawn_x, spawn_z)
	if floor_y < 0.0:
		floor_y = float(spawn.get("y", 2))
	_player.position = Vector3(float(spawn_x) + 0.5, floor_y + PLAYER_SPAWN_CLEARANCE, float(spawn_z) + 0.5)
	_yaw = _angle_for_facing(str(spawn.get("facing", "east")))
	add_child(_player)

	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.34
	capsule.height = 1.65
	shape.shape = capsule
	_player.add_child(shape)

	_camera = Camera3D.new()
	_camera.name = "PlayerCamera"
	_camera.current = true
	_camera.fov = 72.0
	_player.add_child(_camera)

	_avatar_root = _build_scholar_avatar()
	_avatar_root.name = "VoidScholarAvatar"
	_player.add_child(_avatar_root)

func _build_scholar_avatar() -> Node3D:
	var packet_data := _load_json(SCHOLAR_PATH)
	if packet_data.is_empty():
		push_error("Scholar packet is empty or failed to load: %s" % SCHOLAR_PATH)
		return Node3D.new()

	# One shared voxel renderer for scholar and items (PDR Risk #2: don't copy).
	var vs := 0.05
	var dim: Dictionary = packet_data.get("dimensions", {"width": 18, "height": 34, "depth": 10})
	var origin := Vector3(-float(dim.width) * vs / 2.0, -0.825, -float(dim.depth) * vs / 2.0)
	return VoxelModelBuilder.build_node(packet_data, {
		"cell_size": vs,
		"origin": origin,
		"default_block": "body",
	})

func _build_lighting() -> void:
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.22, 0.16, 0.32)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.42, 0.36, 0.56)
	env.ambient_light_energy = 1.6
	env.ssao_enabled = true
	env.ssao_radius = 1.4
	env.ssao_intensity = 3.2
	env.ssao_power = 1.8
	env.ssao_detail = 0.6
	env.ssil_enabled = true
	env.ssil_radius = 4.0
	env.ssil_intensity = 1.4
	env.fog_enabled = true
	env.fog_light_color = Color(0.38, 0.28, 0.48)
	env.fog_light_energy = 0.55
	env.fog_density = 0.012
	env.fog_sky_affect = 0.6
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.028
	env.volumetric_fog_albedo = Color(0.42, 0.32, 0.58)
	env.volumetric_fog_emission = Color(0.08, 0.04, 0.14)
	env.volumetric_fog_emission_energy = 0.22
	env.volumetric_fog_length = 80.0
	env.volumetric_fog_gi_inject = 0.4
	environment.environment = env
	add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.name = "DuskSun"
	sun.light_color = Color(1.0, 0.82, 0.58)
	sun.light_energy = 1.2
	sun.light_volumetric_fog_energy = 0.7
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-52, 38, 0)
	add_child(sun)

	var fill := DirectionalLight3D.new()
	fill.name = "SkyFill"
	fill.light_color = Color(0.56, 0.48, 0.78)
	fill.light_energy = 0.85
	fill.rotation_degrees = Vector3(-38, -145, 0)
	add_child(fill)

	var bounce := DirectionalLight3D.new()
	bounce.name = "GroundBounce"
	bounce.light_color = Color(0.38, 0.32, 0.28)
	bounce.light_energy = 0.35
	bounce.rotation_degrees = Vector3(28, 0, 0)
	add_child(bounce)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HudLayer"
	add_child(layer)
	_hud_label = Label.new()
	_hud_label.position = Vector2(18, 18)
	_hud_label.add_theme_color_override("font_color", Color(0.82, 0.95, 1.0))
	_hud_label.add_theme_font_size_override("font_size", 18)
	layer.add_child(_hud_label)
	_update_hud()

func _build_inventory_ui() -> void:
	_inventory_layer = CanvasLayer.new()
	_inventory_layer.name = "InventoryLayer"
	_inventory_layer.layer = 20
	add_child(_inventory_layer)

	_inventory_root = Control.new()
	_inventory_root.name = "InventoryRoot"
	_inventory_root.visible = false
	_inventory_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_inventory_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_inventory_layer.add_child(_inventory_root)

	var dim := ColorRect.new()
	dim.name = "InventoryDim"
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.0, 0.0, 0.0, 0.46)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_inventory_root.add_child(dim)

	var panel := TextureRect.new()
	panel.name = "InventoryPanel"
	panel.texture = _texture_from_asset("panel")
	panel.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	panel.stretch_mode = TextureRect.STRETCH_SCALE
	panel.custom_minimum_size = Vector2(640, 420)
	panel.position = Vector2(480, 118)
	panel.size = Vector2(640, 420)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_inventory_root.add_child(panel)

	var title := Label.new()
	title.name = "InventoryTitle"
	title.text = "SCHOLoMANCE FIELD INVENTORY"
	title.position = Vector2(526, 145)
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.86, 0.95, 1.0))
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_inventory_root.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "PixelBrain Foundry / DivWand / Wand / Photonic Bridge"
	subtitle.position = Vector2(526, 175)
	subtitle.add_theme_font_size_override("font_size", 13)
	subtitle.add_theme_color_override("font_color", Color(0.56, 0.82, 0.9))
	subtitle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_inventory_root.add_child(subtitle)

	_inventory_slots.clear()
	var slot_texture := _texture_from_asset("slot")
	for index in range(INVENTORY_SLOT_COUNT):
		var col := index % INVENTORY_COLUMNS
		var row := index / INVENTORY_COLUMNS
		var slot_root := Control.new()
		slot_root.name = "Slot_%02d" % index
		slot_root.position = Vector2(526 + col * 88, 220 + row * 78)
		slot_root.size = Vector2(72, 72)

		var slot_frame := TextureRect.new()
		slot_frame.texture = slot_texture
		slot_frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		slot_frame.stretch_mode = TextureRect.STRETCH_SCALE
		slot_frame.size = Vector2(72, 72)
		slot_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot_root.add_child(slot_frame)

		var icon := TextureRect.new()
		icon.name = "Icon"
		icon.position = Vector2(8, 8)
		icon.size = Vector2(56, 56)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot_root.add_child(icon)

		var count := Label.new()
		count.name = "Count"
		count.position = Vector2(40, 48)
		count.size = Vector2(28, 20)
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		count.add_theme_font_size_override("font_size", 16)
		count.add_theme_color_override("font_color", Color(0.95, 0.82, 0.48))
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot_root.add_child(count)

		_inventory_root.add_child(slot_root)
		_inventory_slots.append({ "root": slot_root, "icon": icon, "count": count })

	var footer := Label.new()
	footer.name = "InventoryFooter"
	footer.text = "I close  |  E harvest nearby grimwood  |  Alt+C inspect gear"
	footer.position = Vector2(526, 494)
	footer.add_theme_font_size_override("font_size", 13)
	footer.add_theme_color_override("font_color", Color(0.68, 0.72, 0.84))
	footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_inventory_root.add_child(footer)
	_update_inventory_ui()

func _update_camera_mode() -> void:
	if _avatar_root:
		_avatar_root.visible = _third_person
	# The held pickaxe is a first-person viewmodel parented to the camera; hide
	# it in third person so it does not float over the scene alongside the avatar.
	if _pickaxe_mesh:
		_pickaxe_mesh.visible = not _third_person
	_update_camera_transform()
	_update_hud()

func _update_camera_transform() -> void:
	if _camera == null:
		return
	if _third_person:
		var back := Vector3(sin(_yaw), 0.0, cos(_yaw)) * THIRD_PERSON_DISTANCE
		_camera.position = Vector3(0.0, THIRD_PERSON_HEIGHT, 0.0) + back
		_camera.rotation = Vector3(-0.25, 0.0, 0.0)
		_camera.look_at(_player.global_position + Vector3(0, 0.9, 0), Vector3.UP)
		if _avatar_root:
			_avatar_root.rotation.y = PI
	else:
		_camera.position = Vector3(0.0, 0.72, 0.0)
		_camera.rotation = Vector3(_pitch, 0.0, 0.0)
	_player.rotation.y = _yaw

func _update_hud() -> void:
	if _hud_label == null:
		return
	var mode := "THIRD PERSON" if _third_person else "FIRST PERSON"
	var grimwood_nodes := _mineables.size()
	var grimwood_carried: int = _inv.count("grimwood_shard")
	var torch_carried: int = _inv.count("torch")
	var stick_carried: int = _inv.count("stick")
	var craftable_carried: int = _inv.count("grimwood_torch")
	var torches_placed := _placed_torches.size()
	var near_grimwood := _nearest_grimwood_distance() <= 3.2
	var prompt := "[E] Harvest grimwood" if near_grimwood else ""
	if torch_carried > 0:
		prompt += "   [T] Place torch"
	if grimwood_carried >= 1 and stick_carried >= 1 and craftable_carried == 0:
		prompt += "   [K] Craft torch"
	_hud_label.text = "%s\nWASD move  Mouse look  Alt+C camera  I inventory  E harvest  T torch  K craft  Esc cursor\nGrimwood nodes: %d | Wood %d | Torch %d | Stick %d | Crafted %d | Torches placed: %d\n%s" % [
		mode,
		grimwood_nodes,
		grimwood_carried,
		torch_carried,
		stick_carried,
		craftable_carried,
		torches_placed,
		prompt,
	]

func _nearest_grimwood_distance() -> float:
	if _player == null:
		return 999.0
	var best := 999.0
	for key in _mineables.keys():
		var parts := String(key).split(",")
		var pos := Vector3(float(parts[0]) + 0.5, float(parts[1]) + 0.5, float(parts[2]) + 0.5)
		var d := _player.global_position.distance_to(pos)
		if d < best:
			best = d
	return best

func _update_inventory_ui() -> void:
	if _inventory_root == null:
		return
	_inventory_root.visible = _inventory_open
	var items := _inventory_items_for_slots()
	for index in range(_inventory_slots.size()):
		var slot: Dictionary = _inventory_slots[index]
		var icon: TextureRect = slot.icon
		var count: Label = slot.count
		if index < items.size():
			var item: Dictionary = items[index]
			icon.texture = _texture_from_asset(str(item.get("icon", "empty")))
			count.text = str(item.get("count", 0))
		else:
			icon.texture = _texture_from_asset("empty")
			count.text = ""

func _mine_nearest_grimwood() -> void:
	if _player == null:
		return
	var best_key := ""
	var best_distance := 999.0
	for key in _mineables.keys():
		var parts := String(key).split(",")
		var pos := Vector3(float(parts[0]) + 0.5, float(parts[1]) + 0.5, float(parts[2]) + 0.5)
		var distance := _player.global_position.distance_to(pos)
		if distance < best_distance:
			best_key = key
			best_distance = distance
	if best_key != "" and best_distance <= 3.2:
		var node: Dictionary = _mineables[best_key]
		var parts_m := best_key.split(",")
		_spawn_float_item(Vector3(float(parts_m[0]), float(parts_m[1]), float(parts_m[2])), 4)
		_inv.add("grimwood_shard", int(node.get("yield", 1)))
		_mineables.erase(best_key)
		_mining_anim_t = 0.0
		_update_inventory_ui()
		_update_hud()

func _place_torch_at_feet() -> void:
	if _player == null:
		return
	if not _inv.has("torch"):
		print("Torch: none in inventory.")
		return
	var cell_x := int(floor(_player.global_position.x))
	var cell_z := int(floor(_player.global_position.z))
	var floor_y := _walkable_top_y_at(cell_x, cell_z)
	if floor_y < 0.0:
		print("Torch: no walkable floor under player.")
		return
	var torch_key := _key(cell_x, int(floor(floor_y)), cell_z)
	if _placed_torches.has(torch_key):
		print("Torch: already placed here.")
		return
	_inv.take("torch", 1)
	var torch := TorchScene.new()
	torch.position = Vector3(float(cell_x) + 0.5, floor_y, float(cell_z) + 0.5)
	add_child(torch)
	_placed_torches[torch_key] = torch
	print("Torch placed at %s" % torch_key)
	_update_inventory_ui()
	_update_hud()

func _walkable_top_y_at(x: int, z: int) -> float:
	for y in range(20, -1, -1):
		if _walkable.has(_key(x, y, z)):
			return float(y)
	return -1.0

func _craft_recipe(recipe: Dictionary) -> void:
	var inputs: Dictionary = recipe.get("inputs", {})
	for item_id in inputs.keys():
		if not _inv.has(item_id, int(inputs[item_id])):
			print("Craft failed: need %dx %s (have %d)" % [int(inputs[item_id]), item_id, _inv.count(item_id)])
			return
	for item_id in inputs.keys():
		_inv.take(item_id, int(inputs[item_id]))
	_inv.add(str(recipe.get("output", "unknown")), int(recipe.get("output_count", 1)))
	print("Crafted: %s" % str(recipe.get("name", recipe.get("output", "?"))))
	if str(recipe.get("output", "")) == "grimwood_torch":
		pass
	_update_inventory_ui()
	_update_hud()

func _spawn_sword_in_hand() -> void:
	if _sword_mesh != null and is_instance_valid(_sword_mesh):
		return
	if _camera == null:
		return
	_sword_mesh = MeshInstance3D.new()
	_sword_mesh.name = "HeldVoidmetalSword"
	var blade := BoxMesh.new()
	blade.size = Vector3(0.05, 0.78, 0.14)
	_sword_mesh.mesh = blade
	var blade_mat := StandardMaterial3D.new()
	blade_mat.albedo_color = Color(0.66, 0.95, 1.0)
	blade_mat.emission_enabled = true
	blade_mat.emission = Color(0.42, 0.9, 1.0)
	blade_mat.emission_energy_multiplier = 0.7
	blade_mat.metallic = 0.4
	blade_mat.roughness = 0.35
	_sword_mesh.material_override = blade_mat
	_sword_mesh.position = Vector3(0.28, -0.32, -0.55)
	_sword_mesh.rotation_degrees = Vector3(18.0, -12.0, 0.0)
	_camera.add_child(_sword_mesh)

	var guard := MeshInstance3D.new()
	var guard_mesh := BoxMesh.new()
	guard_mesh.size = Vector3(0.22, 0.04, 0.06)
	guard.mesh = guard_mesh
	var guard_mat := StandardMaterial3D.new()
	guard_mat.albedo_color = Color(0.78, 0.65, 0.32)
	guard_mat.metallic = 0.85
	guard_mat.roughness = 0.4
	guard.material_override = guard_mat
	guard.position = Vector3(0.0, 0.32, 0.0)
	_sword_mesh.add_child(guard)

	var grip := MeshInstance3D.new()
	var grip_mesh := BoxMesh.new()
	grip_mesh.size = Vector3(0.06, 0.22, 0.06)
	grip.mesh = grip_mesh
	var grip_mat := StandardMaterial3D.new()
	grip_mat.albedo_color = Color(0.18, 0.10, 0.06)
	grip.material_override = grip_mat
	grip.position = Vector3(0.0, 0.46, 0.0)
	_sword_mesh.add_child(grip)

func _give_starter_items() -> void:
	for item_id in STARTER_ITEMS.keys():
		_inv.add(item_id, int(STARTER_ITEMS[item_id]))
	print("Starter inventory: %s" % JSON.stringify(_inv.entries()))
	_update_inventory_ui()
	_update_hud()

func _inventory_items_for_slots() -> Array:
	var items := []
	for entry in _inv.entries():
		var def: Dictionary = ITEM_DEFS.get(str(entry.get("id", "")), {})
		items.append({
			"id": entry.get("id", ""),
			"name": def.get("name", str(entry.get("id", "")).capitalize()),
			"icon": def.get("icon", "empty"),
			"count": entry.get("count", 0),
		})
	return items

func _texture_from_asset(asset_key: String) -> Texture2D:
	var asset: Dictionary = _inventory_assets.get(asset_key, {})
	var path := str(asset.get("png", ""))
	if path == "":
		return null
	var image := Image.new()
	var err := image.load(path)
	if err != OK:
		push_warning("Inventory texture failed to load: %s" % path)
		return null
	return ImageTexture.create_from_image(image)

func _exposed_faces(x: int, y: int, z: int) -> Array:
	var faces := []
	if not _occupied.has(_key(x + 1, y, z)):
		faces.append("east")
	if not _occupied.has(_key(x - 1, y, z)):
		faces.append("west")
	if not _occupied.has(_key(x, y + 1, z)):
		faces.append("top")
	if not _occupied.has(_key(x, y - 1, z)):
		faces.append("bottom")
	if not _occupied.has(_key(x, y, z + 1)):
		faces.append("south")
	if not _occupied.has(_key(x, y, z - 1)):
		faces.append("north")
	return faces

func _model_exposed_faces(occupied: Dictionary, x: int, y: int, z: int) -> Array:
	var faces := []
	if not occupied.has(_key(x + 1, y, z)):
		faces.append("east")
	if not occupied.has(_key(x - 1, y, z)):
		faces.append("west")
	if not occupied.has(_key(x, y + 1, z)):
		faces.append("top")
	if not occupied.has(_key(x, y - 1, z)):
		faces.append("bottom")
	if not occupied.has(_key(x, y, z + 1)):
		faces.append("south")
	if not occupied.has(_key(x, y, z - 1)):
		faces.append("north")
	return faces

func _add_cube_face(st: SurfaceTool, x: int, y: int, z: int, face: String, material_id: int = 1) -> void:
	var p: Vector3 = Vector3(float(x), float(y), float(z))
	var verts: Array[Vector3] = []
	var normal: Vector3 = Vector3.UP
	match face:
		"east":
			normal = Vector3.RIGHT
			verts = [p + Vector3(1, 0, 0), p + Vector3(1, 1, 0), p + Vector3(1, 1, 1), p + Vector3(1, 0, 1)]
		"west":
			normal = Vector3.LEFT
			verts = [p + Vector3(0, 0, 1), p + Vector3(0, 1, 1), p + Vector3(0, 1, 0), p + Vector3(0, 0, 0)]
		"top":
			normal = Vector3.UP
			verts = [p + Vector3(0, 1, 1), p + Vector3(1, 1, 1), p + Vector3(1, 1, 0), p + Vector3(0, 1, 0)]
		"bottom":
			normal = Vector3.DOWN
			verts = [p + Vector3(0, 0, 0), p + Vector3(1, 0, 0), p + Vector3(1, 0, 1), p + Vector3(0, 0, 1)]
		"south":
			normal = Vector3.BACK
			verts = [p + Vector3(1, 0, 1), p + Vector3(1, 1, 1), p + Vector3(0, 1, 1), p + Vector3(0, 0, 1)]
		"north":
			normal = Vector3.FORWARD
			verts = [p + Vector3(0, 0, 0), p + Vector3(0, 1, 0), p + Vector3(1, 1, 0), p + Vector3(1, 0, 0)]

	var block_id := _resolve_block_id(material_id, x, y, z)
	var uvs: Array[Vector2] = _atlas_uvs(block_id, face)
	var colors: Array[Color] = [
		_voxel_light_at(verts[0], normal, material_id),
		_voxel_light_at(verts[1], normal, material_id),
		_voxel_light_at(verts[2], normal, material_id),
		_voxel_light_at(verts[3], normal, material_id),
	]
	_add_triangle(st, verts[0], verts[1], verts[2], normal, uvs[0], uvs[1], uvs[2], colors[0], colors[1], colors[2])
	_add_triangle(st, verts[0], verts[2], verts[3], normal, uvs[0], uvs[2], uvs[3], colors[0], colors[2], colors[3])

func _add_triangle(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, normal: Vector3, uv_a: Vector2, uv_b: Vector2, uv_c: Vector2, color_a: Color, color_b: Color, color_c: Color) -> void:
	st.set_normal(normal)
	st.set_uv(uv_a)
	st.set_color(color_a)
	st.add_vertex(a)
	st.set_normal(normal)
	st.set_uv(uv_b)
	st.set_color(color_b)
	st.add_vertex(b)
	st.set_normal(normal)
	st.set_uv(uv_c)
	st.set_color(color_c)
	st.add_vertex(c)

func _build_terrain_atlas_material() -> StandardMaterial3D:
	var image: Image = Image.create(TERRAIN_ATLAS_TILE_SIZE * _terrain_atlas_columns, TERRAIN_ATLAS_TILE_SIZE * _terrain_atlas_rows, false, Image.FORMAT_RGBA8)
	for block_id in _block_atlas_slots.keys():
		var column: int = int(_block_atlas_slots[block_id])
		_blit_block_face_tile(image, str(block_id), "top", column, 0)
		_blit_block_face_tile(image, str(block_id), "side", column, 1)
		_blit_block_face_tile(image, str(block_id), "bottom", column, 2)
	var texture: ImageTexture = ImageTexture.create_from_image(image)
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.albedo_texture = texture
	material.roughness = 0.72
	material.metallic = 0.0
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	return material

func _blit_block_face_tile(atlas: Image, block_id: String, face_key: String, column: int, row: int) -> void:
	var tile := _load_block_face_image(block_id, face_key)
	var origin := Vector2i(column * TERRAIN_ATLAS_TILE_SIZE, row * TERRAIN_ATLAS_TILE_SIZE)
	if tile == null:
		_paint_fallback_block_tile(atlas, block_id, row, origin)
		return
	if tile.get_width() != TERRAIN_ATLAS_TILE_SIZE or tile.get_height() != TERRAIN_ATLAS_TILE_SIZE:
		tile.resize(TERRAIN_ATLAS_TILE_SIZE, TERRAIN_ATLAS_TILE_SIZE, Image.INTERPOLATE_NEAREST)
	atlas.blit_rect(tile, Rect2i(Vector2i.ZERO, Vector2i(TERRAIN_ATLAS_TILE_SIZE, TERRAIN_ATLAS_TILE_SIZE)), origin)

func _load_block_face_image(block_id: String, face_key: String) -> Image:
	var resolved := str(FACE_ALIAS.get(face_key, face_key))
	var blocks: Dictionary = _block_registry.get("blocks", {})
	var block: Dictionary = blocks.get(block_id, {})
	var faces: Dictionary = block.get("faces", {})
	var path := str(faces.get(resolved, ""))
	if path == "":
		return null
	var image := Image.new()
	var err := image.load(path)
	if err != OK:
		push_warning("SurfaceWorld: block face texture failed to load: %s" % path)
		return null
	return image

func _paint_fallback_block_tile(image: Image, block_id: String, face_row: int, origin: Vector2i) -> void:
	var material_id := _block_material_id(block_id)
	var base: Color = _atlas_base_color(material_id)
	var face_shades: Array[float] = [1.18, 0.82, 0.52]
	var face_shade: float = face_shades[clamp(face_row, 0, face_shades.size() - 1)]
	for py in range(TERRAIN_ATLAS_TILE_SIZE):
		for px in range(TERRAIN_ATLAS_TILE_SIZE):
			var grain: float = _atlas_grain(material_id, face_row + block_id.length(), px, py)
			var edge: float = 0.08 if px == 0 or py == 0 or px == TERRAIN_ATLAS_TILE_SIZE - 1 or py == TERRAIN_ATLAS_TILE_SIZE - 1 else 0.0
			var shade: float = clamp(face_shade + grain - edge, 0.18, 1.35)
			var color: Color = Color(
				clamp(base.r * shade, 0.0, 1.0),
				clamp(base.g * shade, 0.0, 1.0),
				clamp(base.b * shade, 0.0, 1.0),
				1.0
			)
			if material_id == 3 and (py % 6 == 0 or (px + py % 2 * 8) % 16 == 0):
				color = color.lerp(Color(0.28, 0.38, 0.22, 1.0), 0.32)
			elif material_id == 4 and (px % 4 == 0 or (px + py) % 7 == 0):
				color = color.lerp(Color(0.22, 0.16, 0.10, 1.0), 0.44)
			elif material_id == 5 and ((px + py) % 9 < 1 or py % 5 == 0):
				color = color.lerp(Color(0.58, 0.52, 0.68, 1.0), 0.38)
			image.set_pixel(origin.x + px, origin.y + py, color)

func _atlas_base_color(material_id: int) -> Color:
	match material_id:
		1:
			return Color(0.18, 0.17, 0.20)
		2:
			return Color(0.22, 0.16, 0.11)
		3:
			return Color(0.16, 0.22, 0.12)
		4:
			return Color(0.14, 0.10, 0.07)
		5:
			return Color(0.28, 0.26, 0.32)
		_:
			return Color(0.20, 0.18, 0.22)

func _block_weight(blocks: Dictionary, block_id: String) -> float:
	return float(blocks.get(block_id, {}).get("rules", {}).get("weight", 0.0))

func _resolve_block_id(material_id: int, x: int, y: int, z: int) -> String:
	var blocks: Dictionary = _block_registry.get("blocks", {})
	var h := _cell_hash(x, y, z)
	match material_id:
		4:
			return "grimwood_log"
		5:
			return "ruins_brick"
		3:
			return "ash_grass"
		2:
			if h > 0.52 and blocks.has("peat_dry"):
				return "peat_dry"
			return "peat_damp" if blocks.has("peat_damp") else "peat_dry"
		_:
			if h > 0.68 and blocks.has("grimstone_mossy"):
				return "grimstone_mossy"
			return "grimstone_block" if blocks.has("grimstone_block") else "grimstone_mossy"

func _block_material_id(block_id: String) -> int:
	var blocks: Dictionary = _block_registry.get("blocks", {})
	var block: Dictionary = blocks.get(block_id, {})
	return int(block.get("materialId", 1))

func _cell_hash(x: int, y: int, z: int) -> float:
	var hash := int((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ 0xB10C)
	hash = abs(hash % 10000)
	return float(hash) / 10000.0

func _atlas_grain(material_id: int, face_row: int, px: int, py: int) -> float:
	var hash: int = int((px * 73856093) ^ (py * 19349663) ^ (material_id * 83492791) ^ (face_row * 265443576))
	hash = abs(hash % 1000)
	return (float(hash) / 1000.0 - 0.5) * 0.14

func _atlas_uvs(block_id: String, face: String) -> Array[Vector2]:
	var material_column: int = int(_block_atlas_slots.get(block_id, _block_atlas_slots.get(str(_block_registry.get("defaultBlockId", "voidstone_smooth")), 0)))
	var face_row: int = int(FACE_ATLAS_ROWS.get(face, 0))
	var atlas_w: float = float(TERRAIN_ATLAS_TILE_SIZE * _terrain_atlas_columns)
	var atlas_h: float = float(TERRAIN_ATLAS_TILE_SIZE * _terrain_atlas_rows)
	var inset: float = 0.5
	var u0: float = (float(material_column * TERRAIN_ATLAS_TILE_SIZE) + inset) / atlas_w
	var v0: float = (float(face_row * TERRAIN_ATLAS_TILE_SIZE) + inset) / atlas_h
	var u1: float = (float((material_column + 1) * TERRAIN_ATLAS_TILE_SIZE) - inset) / atlas_w
	var v1: float = (float((face_row + 1) * TERRAIN_ATLAS_TILE_SIZE) - inset) / atlas_h
	return [Vector2(u0, v1), Vector2(u0, v0), Vector2(u1, v0), Vector2(u1, v1)]

func _voxel_light_at(vertex: Vector3, normal: Vector3, material_id: int) -> Color:
	var key: String = "%d,%d,%d:%d,%d,%d:%d" % [
		int(round(vertex.x * 4.0)),
		int(round(vertex.y * 4.0)),
		int(round(vertex.z * 4.0)),
		int(round(normal.x)),
		int(round(normal.y)),
		int(round(normal.z)),
		material_id,
	]
	if _voxel_light_cache.has(key):
		return _voxel_light_cache[key]

	var sample_pos: Vector3 = vertex + normal * 0.08
	var ao: float = _ambient_occlusion_at(sample_pos, normal)
	var light: Color = Color(VOXEL_LIGHT_AMBIENT, VOXEL_LIGHT_AMBIENT, VOXEL_LIGHT_AMBIENT, 1.0)
	light = light + _direct_voxel_light(sample_pos, normal)
	light = light + _bounce_voxel_light(sample_pos, normal, material_id)
	light.r = clamp(light.r * ao, 0.08, 1.45)
	light.g = clamp(light.g * ao, 0.08, 1.45)
	light.b = clamp(light.b * ao, 0.08, 1.45)
	_voxel_light_cache[key] = light
	return light

func _ambient_occlusion_at(sample_pos: Vector3, normal: Vector3) -> float:
	var blocked := 0
	var probes: Array[Vector3] = [
		normal + Vector3.RIGHT,
		normal + Vector3.LEFT,
		normal + Vector3.FORWARD,
		normal + Vector3.BACK,
		normal + Vector3.UP,
	]
	for probe in probes:
		var probe_pos: Vector3 = sample_pos + probe.normalized() * 0.62
		if _occupied.has(_key(int(floor(probe_pos.x)), int(floor(probe_pos.y)), int(floor(probe_pos.z)))):
			blocked += 1
	return clamp(1.0 - float(blocked) * 0.105, 0.42, 1.0)

func _direct_voxel_light(sample_pos: Vector3, normal: Vector3) -> Color:
	var light: Color = Color.BLACK
	for source in _emissive_voxels:
		var source_pos: Vector3 = source.position
		var to_source: Vector3 = source_pos - sample_pos
		var distance: float = to_source.length()
		if distance <= 0.01 or distance > VOXEL_LIGHT_RADIUS:
			continue
		var direction: Vector3 = to_source / distance
		var facing: float = clamp(normal.dot(direction), 0.0, 1.0)
		if facing <= 0.0:
			continue
		if _is_voxel_occluded(sample_pos, source_pos):
			continue
		var attenuation: float = pow(1.0 - distance / VOXEL_LIGHT_RADIUS, 2.0)
		var source_color: Color = source.color
		light += source_color * (attenuation * facing * VOXEL_LIGHT_DIRECT)
	return light

func _bounce_voxel_light(sample_pos: Vector3, normal: Vector3, material_id: int) -> Color:
	var bounce: Color = Color.BLACK
	var directions: Array[Vector3] = [
		(normal + Vector3.RIGHT * 0.45).normalized(),
		(normal + Vector3.LEFT * 0.45).normalized(),
		(normal + Vector3.FORWARD * 0.45).normalized(),
		(normal + Vector3.BACK * 0.45).normalized(),
		normal.normalized(),
	]
	for direction in directions:
		var hit: Dictionary = _trace_voxel_cone(sample_pos + normal * 0.12, direction, VOXEL_LIGHT_BOUNCE_RADIUS)
		if hit.is_empty():
			continue
		var hit_material_id: int = int(hit.get("material_id", material_id))
		var hit_distance: float = float(hit.get("distance", VOXEL_LIGHT_BOUNCE_RADIUS))
		var tint: Color = _atlas_base_color(hit_material_id)
		var attenuation: float = pow(1.0 - hit_distance / VOXEL_LIGHT_BOUNCE_RADIUS, 2.0)
		bounce += tint * (attenuation * VOXEL_LIGHT_BOUNCE / float(directions.size()))
	return bounce

func _trace_voxel_cone(origin: Vector3, direction: Vector3, max_distance: float) -> Dictionary:
	var step_size := 0.7
	var distance := step_size
	while distance <= max_distance:
		var cone_radius: float = max(0.35, distance * 0.28)
		var center: Vector3 = origin + direction * distance
		var offsets: Array[Vector3] = [
			Vector3.ZERO,
			Vector3(cone_radius, 0, 0),
			Vector3(-cone_radius, 0, 0),
			Vector3(0, cone_radius, 0),
			Vector3(0, 0, cone_radius),
			Vector3(0, 0, -cone_radius),
		]
		for offset in offsets:
			var p: Vector3 = center + offset
			var key: String = _key(int(floor(p.x)), int(floor(p.y)), int(floor(p.z)))
			if _occupied.has(key):
				return {
					"material_id": int(_occupied[key]),
					"distance": distance,
				}
		distance += step_size
	return {}

func _is_voxel_occluded(from_pos: Vector3, to_pos: Vector3) -> bool:
	var delta: Vector3 = to_pos - from_pos
	var distance: float = delta.length()
	if distance <= 0.01:
		return false
	var direction: Vector3 = delta / distance
	var step_size := 0.85
	var traveled := step_size
	while traveled < distance - 0.8:
		var p: Vector3 = from_pos + direction * traveled
		if _occupied.has(_key(int(floor(p.x)), int(floor(p.y)), int(floor(p.z)))):
			return true
		traveled += step_size
	return false

func _material_emission_color(material_id: int) -> Color:
	match material_id:
		3:
			return Color(0.35, 0.16, 1.0)
		4:
			return Color(0.32, 0.95, 1.0)
		5:
			return Color(0.12, 0.76, 0.92)
		_:
			return Color.BLACK

func _update_chunk_visibility() -> void:
	if _terrain_chunks.is_empty():
		return
	var player_chunk_x: int = 0
	var player_chunk_z: int = 0
	if _player != null:
		player_chunk_x = int(floor(_player.global_position.x / float(_chunk_size_x)))
		player_chunk_z = int(floor(_player.global_position.z / float(_chunk_size_z)))
	for chunk_key in _terrain_chunks.keys():
		var chunk_data: Dictionary = _terrain_chunks[chunk_key]
		var distance: int = max(abs(int(chunk_data.chunk_x) - player_chunk_x), abs(int(chunk_data.chunk_z) - player_chunk_z))
		var active: bool = distance <= _active_chunk_radius
		var node: Node3D = chunk_data.node
		if node != null:
			node.visible = active
		var static_body: StaticBody3D = chunk_data.static_body
		if static_body != null:
			static_body.collision_layer = 1 if active else 0
			static_body.collision_mask = 1 if active else 0
		var floor_body: StaticBody3D = chunk_data.floor_body
		if floor_body != null:
			floor_body.collision_layer = 1 if active else 0
			floor_body.collision_mask = 1 if active else 0

func _make_material(albedo: Color, emission: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = albedo
	material.roughness = 0.86
	if emission != Color.BLACK:
		material.emission_enabled = true
		material.emission = emission
		material.emission_energy_multiplier = 0.8
	return material

func _angle_for_facing(facing: String) -> float:
	match facing:
		"north":
			return PI
		"south":
			return 0.0
		"west":
			return -PI / 2.0
		_:
			return PI / 2.0

func _key(x: int, y: int, z: int) -> String:
	return "%d,%d,%d" % [x, y, z]

func _chunk_key_for_cell(x: int, z: int) -> String:
	var chunk_x := int(floor(float(x) / float(_chunk_size_x)))
	var chunk_z := int(floor(float(z) / float(_chunk_size_z)))
	return "%d,%d" % [chunk_x, chunk_z]

func _spawn_pickaxe_in_hand() -> void:
	if _pickaxe_mesh != null and is_instance_valid(_pickaxe_mesh):
		return
	if _camera == null:
		return
	_pickaxe_mesh = _build_pickaxe_node()
	_pickaxe_mesh.name = "HeldPickaxe"
	_pickaxe_mesh.position = PICKAXE_REST_POS
	_pickaxe_mesh.rotation_degrees = PICKAXE_REST_ROT
	_camera.add_child(_pickaxe_mesh)

func _build_pickaxe_node() -> Node3D:
	return PixelBrainItemBuilder.build_extruded_item(PICKAXE_ARTIFACT_PATH, {
		"cell_size": 0.011,
		"name": "VoidmetalPickaxe"
	})

func _tick_pickaxe_anim(delta: float) -> void:
	if _pickaxe_mesh == null:
		return

	if not _mining_target.is_empty():
		var duration: float = MINING_DURATION.get(_mining_target.material_id, 0.9)
		_mining_target.progress += delta / duration

		_mining_swing_t += delta * MINING_SWING_SPEED
		var swing: float = abs(sin(_mining_swing_t * PI))
		_pickaxe_mesh.rotation_degrees = Vector3(
			PICKAXE_REST_ROT.x - swing * 58.0,
			PICKAXE_REST_ROT.y,
			PICKAXE_REST_ROT.z
		)
		_pickaxe_mesh.position = Vector3(
			PICKAXE_REST_POS.x,
			PICKAXE_REST_POS.y + swing * 0.06,
			PICKAXE_REST_POS.z - swing * 0.14
		)

		if _mining_target.progress >= 1.0:
			_complete_mining()
		return

	if _mining_anim_t < 0.0:
		return
	_mining_anim_t += delta * MINING_ANIM_SPEED
	var t := _mining_anim_t
	var swing := sin(clamp(t, 0.0, 1.0) * PI)
	_pickaxe_mesh.rotation_degrees = Vector3(
		PICKAXE_REST_ROT.x - swing * 58.0,
		PICKAXE_REST_ROT.y,
		PICKAXE_REST_ROT.z
	)
	_pickaxe_mesh.position = Vector3(
		PICKAXE_REST_POS.x,
		PICKAXE_REST_POS.y + swing * 0.06,
		PICKAXE_REST_POS.z - swing * 0.14
	)
	if t >= 2.0:
		_mining_anim_t = -1.0
		_pickaxe_mesh.rotation_degrees = PICKAXE_REST_ROT
		_pickaxe_mesh.position = PICKAXE_REST_POS

func _spawn_float_item(vox_pos: Vector3, material_id: int) -> void:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.30, 0.30, 0.30)
	node.mesh = mesh
	var mat := StandardMaterial3D.new()
	var base := _atlas_base_color(material_id)
	mat.albedo_color = base
	mat.emission_enabled = true
	mat.emission = base
	mat.emission_energy_multiplier = 1.4
	node.material_override = mat
	add_child(node)
	node.global_position = vox_pos + Vector3(0.5, 0.7, 0.5)
	_float_items.append({"node": node, "t": 0.0, "start": node.global_position})

func _tick_float_items(delta: float) -> void:
	var done := []
	for item in _float_items:
		if not is_instance_valid(item.node):
			done.append(item)
			continue
		item.t += delta / FLOAT_ITEM_DURATION
		var t: float = clamp(float(item.t), 0.0, 1.0)
		var start: Vector3 = item.start
		var target: Vector3 = _camera.global_position if _camera != null else start
		var arc: Vector3 = start + Vector3(0.0, 0.5, 0.0)
		var p: Vector3 = start.lerp(arc, t).lerp(arc.lerp(target, t), t)
		item.node.global_position = p
		var s := 1.0 - smoothstep(0.55, 1.0, t)
		item.node.scale = Vector3(s, s, s)
		if float(item.t) >= 1.0:
			done.append(item)
	for item in done:
		if is_instance_valid(item.node):
			item.node.queue_free()
		_float_items.erase(item)

func _raycast_mine_block() -> void:
	if _camera == null:
		return
	var space_state := get_world_3d().direct_space_state
	var origin := _camera.global_position
	var end := origin - _camera.global_transform.basis.z * 10.0
	var query := PhysicsRayQueryParameters3D.create(origin, end)
	var result := space_state.intersect_ray(query)
	if result:
		# Offset slightly backwards along the normal to ensure we are inside the target voxel
		var hit_pos: Vector3 = result.position - result.normal * 0.05
		var vx := int(floor(hit_pos.x))
		var vy := int(floor(hit_pos.y))
		var vz := int(floor(hit_pos.z))
		var key := _key(vx, vy, vz)
		if _occupied.has(key):
			_start_mining(vx, vy, vz)

func _start_mining(vx: int, vy: int, vz: int) -> void:
	var key := _key(vx, vy, vz)
	var mat_id: int = int(_occupied.get(key, 1))
	_mining_target = {
		"x": vx, "y": vy, "z": vz,
		"material_id": mat_id,
		"progress": 0.0,
		"chunk_key": _chunk_key_for_cell(vx, vz),
	}
	_mining_swing_t = 0.0

func _complete_mining() -> void:
	var vx: int = _mining_target.x
	var vy: int = _mining_target.y
	var vz: int = _mining_target.z
	_mining_target.clear()
	_mining_swing_t = 0.0
	_mine_block_at(vx, vy, vz)
	_mining_anim_t = 0.0

func _mine_block_at(vx: int, vy: int, vz: int) -> void:
	var key := _key(vx, vy, vz)
	var mat_id: int = int(_occupied.get(key, 1))
	_occupied.erase(key)
	_block_ids.erase(key)
	prune_emissive_at(_emissive_voxels, vx, vy, vz)

	var chunk_key := _chunk_key_for_cell(vx, vz)
	_remove_block_collider(chunk_key, vx, vy, vz)
	for remesh_key in chunk_keys_for_remesh(vx, vz, _chunk_size_x, _chunk_size_z):
		if not _dirty_chunks.has(remesh_key):
			_dirty_chunks.append(remesh_key)

	_spawn_float_item(Vector3(vx, vy, vz), mat_id)
	if mat_id == 4:
		_inv.add("grimwood_shard", 1)
		_update_inventory_ui()
		_update_hud()
	print("Mined block at: %s" % _key(vx, vy, vz))

func _remove_block_collider(chunk_key: String, x: int, y: int, z: int) -> void:
	var chunk_data: Dictionary = _terrain_chunks.get(chunk_key, {})
	var static_body: StaticBody3D = chunk_data.get("static_body")
	if static_body == null:
		return
	var target := Vector3i(x, y, z)
	for child in static_body.get_children():
		if child.has_meta("volume_amp_cell") and child.get_meta("volume_amp_cell") == target:
			child.queue_free()
			break
	var solid_key := _key(x, y, z)
	var solid_keys: Array = chunk_data.get("solid_keys", [])
	solid_keys.erase(solid_key)

func _rebuild_chunk_mesh(chunk_key: String) -> void:
	var chunk_data: Dictionary = _terrain_chunks.get(chunk_key, {})
	if chunk_data.is_empty():
		return
	var chunk_node: Node3D = chunk_data.get("node")
	if chunk_node == null:
		return
	for child in chunk_node.get_children():
		if child is MeshInstance3D:
			child.queue_free()
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	chunk_data["surface_tool"] = st
	_build_greedy_chunk_mesh(chunk_data)
	st.generate_normals()
	var mesh: ArrayMesh = st.commit()
	if mesh != null:
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.name = "AtlasTerrain"
		mesh_instance.mesh = mesh
		mesh_instance.material_override = _terrain_atlas_material
		chunk_node.add_child(mesh_instance)
