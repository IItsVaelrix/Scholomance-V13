extends Node3D

const TorchScene := preload("res://scripts/Torch.gd")
const VolumeAMP := preload("res://scripts/VolumeAMP.gd")
const InventoryClass := preload("res://scripts/Inventory.gd")
const PixelBrainItemBuilder := preload("res://scripts/PixelBrainItemBuilder.gd")
const VoxelModelBuilder := preload("res://scripts/VoxelModelBuilder.gd")

const WORLD_PATH := "res://assets/voidmetal-cave.qworld"
const SCHOLAR_PATH := "res://assets/void-scholar-blue.packet.json"
const PICKAXE_ARTIFACT_PATH := "res://assets/items/voidmetal_pickaxe_sculpt.pbrain"
const SCHOLAR_ART_PATH: String = "res://assets/void-scholar.svg"
# Blue/black voxel scholar render + rig (see scratch/scholar-cells.mjs).
const SCHOLAR_VOXEL_SIZE := 0.028
const SCHOLAR_GROUND_Y := -0.80
# The model's "front" (hood opening / eyes) faces the +X+Z diagonal; rotate it so
# that diagonal aligns with the movement heading. Calibrated against the renderer.
const SCHOLAR_FRONT_YAW_OFFSET := -PI / 4.0
# Idle/walk sway loop period (s). Matches the 16-frame @12fps authoring loop.
const SCHOLAR_ANIM_PERIOD := 16.0 / 12.0
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
# Ore photonic diffusion: emissive materials, and the minimum connected-cluster
# size that earns a real OmniLight. Below this, ore stays emissive-only (it still
# glows + rides SSIL/fog, but casts no light). T=4 chosen from the world's actual
# cluster distribution — see the ore-lights white paper / cluster analysis.
const ORE_MATERIALS := [3, 4, 5]
const ORE_LIGHT_MIN_CLUSTER := 4
const MINING_ANIM_SPEED := 5.5
const FLOAT_ITEM_DURATION := 0.55
const INVENTORY_COLUMNS := 6
const INVENTORY_ROWS := 4
const INVENTORY_SLOT_COUNT := INVENTORY_COLUMNS * INVENTORY_ROWS
const ITEM_DEFS := {
	"voidmetal_ore": {"name": "Voidmetal", "icon": "voidmetal", "rarity": "Entropic"},
	"torch": {"name": "Torch", "icon": "torch", "rarity": "Common"},
	"stick": {"name": "Stick", "icon": "stick", "rarity": "Common"},
	"voidmetal_sword": {"name": "Voidmetal Sword", "icon": "sword", "rarity": "Rare"},
}
const RECIPE_SWORD := {
	"id": "voidmetal_sword",
	"name": "Voidmetal Sword",
	"inputs": {"voidmetal_ore": 2, "stick": 1},
	"output": "voidmetal_sword",
	"output_count": 1,
}
const FACE_ALIAS := {"east": "side", "west": "side", "north": "side", "south": "side"}
const STARTER_ITEMS := {
	"torch": 3,
	"stick": 2,
}

var _world: Dictionary = {}
var _occupied := {}
# Integer-keyed mirrors (Vector3i keys) for the hot meshing path, where string
# keys/splits dominated rebuild time. _occ maps cell -> material_id.
var _occ := {}
var _block_ids := {}
var _block_ids_v := {}
var _walkable := {}
var _mineables := {}
var _materials := {}
var _block_registry: Dictionary = {}
var _block_atlas_slots := {}
var _terrain_chunks := {}
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
# Third-person orbit camera: yaw/pitch around the scholar, driven by left-drag.
var _cam_yaw := 0.0
var _cam_pitch := 0.5
var _orbit_drag := false
# Heading the avatar is currently turned to (radians); follows movement.
var _avatar_facing := 0.0
# Scholar rig: animatable part pivots and the looping sway phase.
var _rig_body: Node3D
var _rig_arm_r: Node3D
var _rig_arm_l: Node3D
var _rig_leg_r: Node3D
var _rig_leg_l: Node3D
var _rig_body_base := Vector3.ZERO
var _rig_phase := 0.0
var _moving := false
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
var _ore_lights_root: Node3D
var _mining_anim_t := -1.0
var _float_items: Array = []
var _debug_tick_counter := 0
var _simulate_walk := false
var _simulate_walk_start_pos: Vector3
var _simulate_walk_tick := 0
var _dirty_chunks: Array[String] = []
# Threaded chunk remesh ("two-sided kitchen"): the main thread hands a worker a
# self-contained snapshot, the worker builds the mesh, the main thread swaps it
# in once WorkerThreadPool reports the task done. One task in flight at a time.
var _mesh_task_id := -1
var _mesh_task_chunk := ""
var _mesh_task_mesh: ArrayMesh = null
var _mesh_task_snapshot: Dictionary = {}

func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_world = _load_json(WORLD_PATH)
	if _world.is_empty():
		push_error("VoidmetalCaveWorld: failed to load %s" % WORLD_PATH)
		return

	_inv = InventoryClass.new()
	add_child(_inv)
	_build_lookup_tables()
	_load_inventory_assets()
	_build_terrain()
	_build_player()
	_build_lighting()
	_build_ore_lights()
	_build_hud()
	_build_inventory_ui()
	_give_starter_items()
	_update_camera_mode()
	_spawn_pickaxe_in_hand()

	if "--simulate-walk" in OS.get_cmdline_user_args():
		_simulate_walk = true
		print("simulate-walk mode: forcing +X velocity for 60 frames")

func _physics_process(delta: float) -> void:
	_process_chunk_mesh_jobs()

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

	# In third person, movement is relative to the orbiting camera; in first
	# person it is relative to where the player is looking.
	var look_yaw := _cam_yaw if _third_person else _yaw
	var basis := Basis(Vector3.UP, look_yaw)
	var forward := -basis.z
	var right := basis.x
	var direction := (forward * input.y + right * input.x).normalized()
	_player.velocity.x = direction.x * PLAYER_SPEED
	_player.velocity.z = direction.z * PLAYER_SPEED

	# Turn the third-person avatar to face the direction it is moving. The model's
	# front is its +X+Z diagonal, so SCHOLAR_FRONT_YAW_OFFSET rotates that face
	# onto the movement vector (otherwise it walks sideways / faces the camera).
	_moving = direction.length() > 0.01
	if _third_person and _moving:
		_avatar_facing = atan2(direction.x, direction.z) + SCHOLAR_FRONT_YAW_OFFSET

	if not _player.is_on_floor():
		_player.velocity.y -= GRAVITY * delta
	elif Input.is_key_pressed(KEY_SPACE):
		_player.velocity.y = JUMP_VELOCITY

	_player.move_and_slide()
	_update_chunk_visibility()
	_update_camera_transform()
	_update_hud()
	_tick_pickaxe_anim(delta)
	_tick_scholar_rig(delta)
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
		elif event.keycode == KEY_C:
			# Plain C (with or without Alt). Requiring Alt+C is fragile: some
			# keyboards can't report that pair (matrix ghosting) and right-Alt
			# (AltGr) does not set alt_pressed, so the combo silently no-ops.
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
			_mine_nearest_voidmetal()
	elif event is InputEventMouseButton:
		if _third_person:
			# Middle-drag orbits the camera; left-click stays bound to mining.
			if event.button_index == MOUSE_BUTTON_MIDDLE:
				_orbit_drag = event.pressed
			elif event.pressed and (event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT):
				_raycast_mine_block()
		elif event.pressed:
			if event.button_index == MOUSE_BUTTON_RIGHT and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
				_raycast_mine_block()
			else:
				Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventMouseMotion:
		if _third_person:
			if _orbit_drag:
				_cam_yaw -= event.relative.x * MOUSE_SENSITIVITY
				_cam_pitch = clamp(_cam_pitch + event.relative.y * MOUSE_SENSITIVITY, -0.2, 1.35)
		elif Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
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
		var cell := Vector3i(int(solid.x), int(solid.y), int(solid.z))
		var key := _key(solid.x, solid.y, solid.z)
		var material_id: int = int(solid.materialId)
		var bid := str(solid.get("blockId", _resolve_block_id(material_id, cell.x, cell.y, cell.z)))
		_occupied[key] = material_id
		_occ[cell] = material_id
		_block_ids[key] = bid
		_block_ids_v[cell] = bid

	for cell in _world.get("gameplay", {}).get("walkable", []):
		_walkable[_key(cell.x, cell.y, cell.z)] = true

	for node in _world.get("gameplay", {}).get("mineables", []):
		var voxel: Dictionary = node.get("voxel", {})
		_mineables[_key(voxel.x, voxel.y, voxel.z)] = node

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
		push_warning("VoidmetalCaveWorld: failed to load block registry %s; using procedural atlas fallback." % registry_path)
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
		block_ids = ["voidstone_smooth", "basalt_slab", "voidmetal_ore_large", "cyan_crystal_growth", "path_rune_floor"]
	for index in range(block_ids.size()):
		_block_atlas_slots[str(block_ids[index])] = index
	_terrain_atlas_columns = max(1, block_ids.size())
	_terrain_atlas_rows = 3

func _build_terrain() -> void:
	_terrain_chunks.clear()
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
		chunk_data.solid_cells.append(Vector3i(x, y, z))

	for chunk_key in _terrain_chunks.keys():
		var chunk_data: Dictionary = _terrain_chunks[chunk_key]
		_build_greedy_chunk_mesh(chunk_data.surface_tool, chunk_data.solid_cells, _occ, _block_ids_v)

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
			"solid_cells": [],
			"floor_keys": [],
			"node": null,
			"static_body": null,
			"floor_body": null,
		}
	return _terrain_chunks[chunk_key]

# Pure: builds geometry into `st` from a self-contained snapshot (cells + occ +
# block_ids). Reads no mutable instance state, so it is safe to run on a worker
# thread. _resolve_block_id/_atlas_uvs touch only load-time-immutable data.
func _build_greedy_chunk_mesh(st: SurfaceTool, cells: Array, occ: Dictionary, block_ids: Dictionary) -> void:
	var groups: Dictionary = {}
	for cell in cells:
		var x: int = cell.x
		var y: int = cell.y
		var z: int = cell.z
		var material_id: int = int(occ.get(cell, 1))
		var block_id: String = str(block_ids.get(cell, _resolve_block_id(material_id, x, y, z)))
		for face in _exposed_faces(occ, x, y, z):
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
		_emit_greedy_group(st, groups[group_key])

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
	# Lighting is handled by the GPU (environment SSIL/SSAO + scene lights). The
	# terrain material does not use vertex colors as albedo, so per-vertex CPU
	# lighting here was discarded by the renderer — flat white, no compute.
	var c := Color.WHITE
	_add_triangle(st, verts[0], verts[1], verts[2], normal, uvs[0], uvs[1], uvs[2], c, c, c)
	_add_triangle(st, verts[0], verts[2], verts[3], normal, uvs[0], uvs[2], uvs[3], c, c, c)

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

# Builds the third-person avatar from the blue/black void-scholar voxel packet
# (scratch/scholar-cells.mjs export). Each animatable part (body / armR / armL) is
# its own pivot Node3D holding per-material MultiMesh cubes, so the GDScript rig
# (_tick_scholar_rig) can swing the arms and bob the body — the live 3D equivalent
# of the authored keyframes. The staff is dropped; the right hand holds the pickaxe.
func _build_scholar_avatar() -> Node3D:
	var packet_data := _load_json(SCHOLAR_PATH)
	if packet_data.is_empty():
		push_error("Scholar voxel packet failed to load: %s" % SCHOLAR_PATH)
		return Node3D.new()

	var vs := SCHOLAR_VOXEL_SIZE
	var pivots: Dictionary = packet_data.get("pivots", {})

	# Center the column on the body pivot (x,z) and stand the feet on the ground.
	var body_piv: Dictionary = pivots.get("body", {"x": 0, "y": 0, "z": 0})
	var off := Vector3(-float(body_piv.x) * vs, SCHOLAR_GROUND_Y, -float(body_piv.z) * vs)

	# Geometry comes from the shared voxel renderer; this function keeps only the
	# scholar-specific rig wiring below (PDR Risk #2: one renderer, not a copy).
	var built := VoxelModelBuilder.build(packet_data, {
		"cell_size": vs,
		"origin": off,
		"default_block": "body",
		"fallback_pivot": Vector3(float(body_piv.x), float(body_piv.y), float(body_piv.z)),
	})
	var root: Node3D = built["root"]
	var pivot_nodes: Dictionary = built["pivots"]

	_rig_body = pivot_nodes.get("body")
	_rig_arm_r = pivot_nodes.get("armR")
	_rig_arm_l = pivot_nodes.get("armL")
	_rig_leg_r = pivot_nodes.get("legR")
	_rig_leg_l = pivot_nodes.get("legL")
	if _rig_body:
		_rig_body_base = _rig_body.position

	# The pickaxe is parented to the right arm so it swings with the sleeve. Hand
	# voxels sit ~18 cells below the shoulder pivot; place the grip there.
	if _rig_arm_r:
		var held := _build_pickaxe_node()
		held.name = "AvatarPickaxe"
		held.scale = Vector3(0.30, 0.30, 0.30)
		held.position = Vector3(0.02, -0.52, 0.10)
		held.rotation_degrees = Vector3(14.0, -38.0, 70.0)
		_rig_arm_r.add_child(held)

	return root

# Drives the scholar's sway loop: body bob/sway about the feet and opposite-phase
# arm swings about the shoulders. Amplitudes lift while walking and settle to a
# subtle idle when standing. Only runs in third person (the avatar is hidden in FP).
func _tick_scholar_rig(delta: float) -> void:
	if _rig_body == null or not _third_person:
		return
	if _moving:
		_rig_phase = fmod(_rig_phase + delta * TAU / SCHOLAR_ANIM_PERIOD, TAU)
		var s := sin(_rig_phase)
		_rig_body.position = _rig_body_base + Vector3(0.0, 1.2 * SCHOLAR_VOXEL_SIZE * s, 0.0)
		_rig_body.rotation.y = deg_to_rad(3.0 * s)
		# Arms and the opposite legs swing in phase (right arm with left leg).
		if _rig_arm_r:
			_rig_arm_r.rotation.x = deg_to_rad(20.0 * s)
		if _rig_arm_l:
			_rig_arm_l.rotation.x = deg_to_rad(-20.0 * s)
		if _rig_leg_r:
			_rig_leg_r.rotation.x = deg_to_rad(-18.0 * s)
		if _rig_leg_l:
			_rig_leg_l.rotation.x = deg_to_rad(18.0 * s)
	else:
		# Standing still: ease every part back to its rest pose and hold there.
		var k := clampf(delta * 9.0, 0.0, 1.0)
		_rig_phase = 0.0
		_rig_body.position = _rig_body.position.lerp(_rig_body_base, k)
		_rig_body.rotation.y = lerp_angle(_rig_body.rotation.y, 0.0, k)
		for part in [_rig_arm_r, _rig_arm_l, _rig_leg_r, _rig_leg_l]:
			if part:
				part.rotation.x = lerp_angle(part.rotation.x, 0.0, k)

func _build_lighting() -> void:
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.01, 0.012, 0.028)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.18, 0.20, 0.32)
	env.ambient_light_energy = 0.65
	env.ssao_enabled = true
	env.ssao_radius = 1.2
	env.ssao_intensity = 2.8
	env.ssao_power = 1.6
	env.ssao_detail = 0.5
	env.ssil_enabled = true
	env.ssil_radius = 3.0
	env.ssil_intensity = 1.2
	env.fog_enabled = true
	env.fog_light_color = Color(0.12, 0.30, 0.38)
	env.fog_light_energy = 0.42
	env.fog_density = 0.018
	env.fog_sky_affect = 0.2
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.045
	env.volumetric_fog_albedo = Color(0.22, 0.42, 0.52)
	env.volumetric_fog_emission = Color(0.02, 0.08, 0.12)
	env.volumetric_fog_emission_energy = 0.35
	env.volumetric_fog_length = 42.0
	env.volumetric_fog_gi_inject = 0.55
	environment.environment = env
	add_child(environment)

	var directional := DirectionalLight3D.new()
	directional.name = "TopLeftKeyLight"
	directional.light_energy = 0.75
	directional.light_volumetric_fog_energy = 0.45
	directional.rotation_degrees = Vector3(-48, -36, 0)
	add_child(directional)

func _build_ore_lights() -> void:
	if _ore_lights_root == null or not is_instance_valid(_ore_lights_root):
		_ore_lights_root = Node3D.new()
		_ore_lights_root.name = "OreClusterLights"
		add_child(_ore_lights_root)

	for child in _ore_lights_root.get_children():
		_ore_lights_root.remove_child(child)
		child.queue_free()

	var clusters := _ore_light_clusters()
	var spawned := 0
	for cluster in clusters:
		if int(cluster.get("size", 0)) < ORE_LIGHT_MIN_CLUSTER:
			continue
		_spawn_ore_cluster_light(cluster, spawned)
		spawned += 1

	if "--ore-light-trace" in OS.get_cmdline_user_args():
		print("Ore lights: T=%d spawned=%d scanned_clusters=%d" % [ORE_LIGHT_MIN_CLUSTER, spawned, clusters.size()])

func _ore_light_clusters() -> Array:
	var visited := {}
	var clusters: Array = []

	for raw_cell in _occ.keys():
		var start_cell: Vector3i = raw_cell
		if visited.has(start_cell):
			continue

		var material_id := int(_occ.get(start_cell, 0))
		if not ORE_MATERIALS.has(material_id):
			continue

		var stack: Array[Vector3i] = [start_cell]
		var cells: Array[Vector3i] = []
		var center_sum := Vector3.ZERO
		var photonic_mass := 0.0
		visited[start_cell] = true

		while not stack.is_empty():
			var cell: Vector3i = stack.pop_back()
			cells.append(cell)
			center_sum += Vector3(float(cell.x) + 0.5, float(cell.y) + 0.5, float(cell.z) + 0.5)
			photonic_mass += _ore_photonic_weight(material_id)

			for neighbor in _ore_neighbors(cell):
				if visited.has(neighbor):
					continue
				if int(_occ.get(neighbor, -1)) != material_id:
					continue
				visited[neighbor] = true
				stack.append(neighbor)

		var size := cells.size()
		if size > 0:
			clusters.append({
				"material_id": material_id,
				"size": size,
				"center": center_sum / float(size),
				"photonic_mass": photonic_mass,
			})

	return clusters

func _ore_neighbors(cell: Vector3i) -> Array[Vector3i]:
	return [
		cell + Vector3i(1, 0, 0),
		cell + Vector3i(-1, 0, 0),
		cell + Vector3i(0, 1, 0),
		cell + Vector3i(0, -1, 0),
		cell + Vector3i(0, 0, 1),
		cell + Vector3i(0, 0, -1),
	]

func _spawn_ore_cluster_light(cluster: Dictionary, index: int) -> void:
	var material_id := int(cluster.get("material_id", 3))
	var size := int(cluster.get("size", 1))
	var center: Vector3 = cluster.get("center", Vector3.ZERO)
	var photonic_mass := float(cluster.get("photonic_mass", float(size)))

	var light := OmniLight3D.new()
	light.name = "OreClusterLight_%02d_m%d_s%d" % [index, material_id, size]
	light.light_color = _ore_light_color(material_id)
	light.light_energy = clampf(0.55 + pow(photonic_mass, 0.72) * 0.42, 1.0, 4.8)
	light.light_volumetric_fog_energy = light.light_energy * 0.55
	light.omni_range = clampf(3.4 + sqrt(photonic_mass) * 1.25, 5.0, 11.0)
	light.shadow_enabled = false
	light.position = center + Vector3(0.0, 0.18, 0.0)
	_ore_lights_root.add_child(light)

func _ore_photonic_weight(material_id: int) -> float:
	match material_id:
		3:
			return 1.0
		4:
			return 0.65
		5:
			return 0.35
		_:
			return 0.0

func _ore_light_color(material_id: int) -> Color:
	match material_id:
		3:
			return Color(0.50, 0.24, 1.0)
		4:
			return Color(0.52, 0.92, 1.0)
		5:
			return Color(0.16, 0.78, 0.86)
		_:
			return Color(0.50, 0.24, 1.0)

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
	footer.text = "I close  |  E mine nearby voidmetal  |  C toggle camera"
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
	if _third_person:
		# Seed the orbit behind the player and free the cursor so it can be
		# dragged. First person recaptures the cursor for mouse-look.
		_cam_yaw = _yaw
		# Start with the scholar's back to the camera (front -Z points away).
		_avatar_facing = _cam_yaw
		_orbit_drag = false
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif not _inventory_open:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_update_camera_transform()
	_update_hud()

func _update_camera_transform() -> void:
	if _camera == null:
		return
	# The physics body itself never yaws. Look/orientation is carried by the
	# camera (first person) or the avatar (third person) so the two modes have
	# independent camera behaviour and the camera is not welded to the body.
	_player.rotation.y = 0.0
	if _third_person:
		# Orbit camera: positioned on a sphere around the scholar's chest using
		# the left-drag yaw/pitch, always looking back at him. Swing all the way
		# round to see his face. Camera is parented to the (unrotated) body, so
		# the local offset is also the world offset.
		var pivot := Vector3(0.0, 0.9, 0.0)
		var cp := cos(_cam_pitch)
		var offset := Vector3(sin(_cam_yaw) * cp, sin(_cam_pitch), cos(_cam_yaw) * cp) * THIRD_PERSON_DISTANCE
		_camera.position = pivot + offset
		_camera.look_at(_player.global_position + pivot, Vector3.UP)
		if _avatar_root:
			_avatar_root.rotation.y = _avatar_facing
	else:
		# First person: the camera carries the full yaw + pitch look.
		_camera.position = Vector3(0.0, 0.72, 0.0)
		_camera.rotation = Vector3(_pitch, _yaw, 0.0)

func _update_hud() -> void:
	if _hud_label == null:
		return
	var mode := "THIRD PERSON" if _third_person else "FIRST PERSON"
	var voidmetal_nodes := _mineables.size()
	var voidmetal_carried: int = _inv.count("voidmetal_ore")
	var torch_carried: int = _inv.count("torch")
	var stick_carried: int = _inv.count("stick")
	var sword_carried: int = _inv.count("voidmetal_sword")
	var torches_placed := _placed_torches.size()
	var near_voidmetal := _nearest_voidmetal_distance() <= 3.2
	var prompt := "[E] Mine voidmetal" if near_voidmetal else ""
	if torch_carried > 0:
		prompt += "   [T] Place torch"
	if voidmetal_carried >= 2 and stick_carried >= 1 and sword_carried == 0:
		prompt += "   [K] Craft sword"
	_hud_label.text = "%s\nWASD move  Mouse look  C camera (MMB-drag orbit)  I inventory  E mine  T torch  K craft  Esc cursor\nVoidmetal nodes: %d | Voidmetal %d | Torch %d | Stick %d | Sword %d | Torches placed: %d\n%s" % [
		mode,
		voidmetal_nodes,
		voidmetal_carried,
		torch_carried,
		stick_carried,
		sword_carried,
		torches_placed,
		prompt,
	]

func _nearest_voidmetal_distance() -> float:
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

func _mine_nearest_voidmetal() -> void:
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
		print("Mined voidmetal: %s" % JSON.stringify(_mineables[best_key]))
		var parts_m := best_key.split(",")
		_mine_block_at(int(parts_m[0]), int(parts_m[1]), int(parts_m[2]))

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
	if str(recipe.get("output", "")) == "voidmetal_sword":
		_spawn_sword_in_hand()
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

func _exposed_faces(occ: Dictionary, x: int, y: int, z: int) -> Array:
	# Integer-keyed neighbour tests against the supplied occupancy snapshot.
	var faces := []
	if not occ.has(Vector3i(x + 1, y, z)):
		faces.append("east")
	if not occ.has(Vector3i(x - 1, y, z)):
		faces.append("west")
	if not occ.has(Vector3i(x, y + 1, z)):
		faces.append("top")
	if not occ.has(Vector3i(x, y - 1, z)):
		faces.append("bottom")
	if not occ.has(Vector3i(x, y, z + 1)):
		faces.append("south")
	if not occ.has(Vector3i(x, y, z - 1)):
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
	var c := Color.WHITE
	_add_triangle(st, verts[0], verts[1], verts[2], normal, uvs[0], uvs[1], uvs[2], c, c, c)
	_add_triangle(st, verts[0], verts[2], verts[3], normal, uvs[0], uvs[2], uvs[3], c, c, c)

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
		push_warning("VoidmetalCaveWorld: block face texture failed to load: %s" % path)
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
			if material_id == 3 and ((px + py) % 11 == 0 or abs(px - py) % 17 == 0):
				color = color.lerp(Color(0.78, 0.62, 1.0, 1.0), 0.38)
			elif material_id == 4 and (px % 9 == 0 or py % 13 == 0):
				color = color.lerp(Color(0.75, 1.0, 1.0, 1.0), 0.42)
			elif material_id == 5 and ((px * 3 + py * 5) % 19 < 2):
				color = color.lerp(Color(0.23, 0.92, 1.0, 1.0), 0.46)
			image.set_pixel(origin.x + px, origin.y + py, color)

func _atlas_base_color(material_id: int) -> Color:
	match material_id:
		1:
			return Color(0.10, 0.09, 0.15)
		2:
			return Color(0.22, 0.19, 0.28)
		3:
			return Color(0.45, 0.32, 0.95)
		4:
			return Color(0.42, 0.86, 0.96)
		5:
			return Color(0.10, 0.72, 0.82)
		_:
			return Color(0.30, 0.34, 0.42)

func _block_weight(blocks: Dictionary, block_id: String) -> float:
	return float(blocks.get(block_id, {}).get("rules", {}).get("weight", 0.0))

func _resolve_block_id(material_id: int, x: int, y: int, z: int) -> String:
	var blocks: Dictionary = _block_registry.get("blocks", {})
	var h := _cell_hash(x, y, z)
	match material_id:
		3:
			if blocks.has("voidmetal_ore_large") and h > 0.38:
				return "voidmetal_ore_large"
			return "voidmetal_ore_small" if blocks.has("voidmetal_ore_small") else "voidmetal_ore_large"
		4:
			if blocks.has("cyan_crystal_growth") and h > 0.42:
				return "cyan_crystal_growth"
			return "cyan_crystal_embedded" if blocks.has("cyan_crystal_embedded") else "cyan_crystal_growth"
		5:
			return "path_rune_floor"
		2:
			var slab_w := _block_weight(blocks, "basalt_slab")
			if h >= slab_w and blocks.has("basalt_fractured"):
				return "basalt_fractured"
			return "basalt_slab"
		_:
			var smooth_w := _block_weight(blocks, "voidstone_smooth")
			var cracked_w := _block_weight(blocks, "voidstone_cracked")
			if h >= smooth_w + cracked_w and blocks.has("voidstone_edge_dark"):
				return "voidstone_edge_dark"
			if h >= smooth_w and blocks.has("voidstone_cracked"):
				return "voidstone_cracked"
			return str(_block_registry.get("defaultBlockId", "voidstone_smooth"))

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

# Builds the voidmetal pickaxe as a self-contained Node3D with no positioning or
# parenting applied. Used for both the first-person viewmodel and the third-person
# avatar's held copy. The geometry is the true-3D authored sculpt
# (scratch/pickaxe-cells.mjs → PB-VOXEL-ITEM), rendered through the same voxel
# renderer as the scholar — real depth and a genuine eye hole, not an extruded slab.
func _build_pickaxe_node() -> Node3D:
	return PixelBrainItemBuilder.build_extruded_item(PICKAXE_ARTIFACT_PATH, {
		"cell_size": 0.011,
		"name": "VoidmetalPickaxe",
	})

func _tick_pickaxe_anim(delta: float) -> void:
	if _mining_anim_t < 0.0 or _pickaxe_mesh == null:
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
			_mine_block_at(vx, vy, vz)

func _mine_block_at(vx: int, vy: int, vz: int) -> void:
	var key := _key(vx, vy, vz)
	var mat_id: int = int(_occupied.get(key, 1))
	var yield_count := 1
	if _mineables.has(key):
		var mineable_node: Dictionary = _mineables[key]
		yield_count = int(mineable_node.get("yield", 1))
	_occupied.erase(key)
	_occ.erase(Vector3i(vx, vy, vz))
	_block_ids_v.erase(Vector3i(vx, vy, vz))
	_block_ids.erase(key)
	_mineables.erase(key)

	var chunk_key := _chunk_key_for_cell(vx, vz)
	_remove_block_collider(chunk_key, vx, vy, vz)
	for remesh_key in chunk_keys_for_remesh(vx, vz, _chunk_size_x, _chunk_size_z):
		if not _dirty_chunks.has(remesh_key):
			_dirty_chunks.append(remesh_key)

	_spawn_float_item(Vector3(vx, vy, vz), mat_id)
	_mining_anim_t = 0.0
	if mat_id == 3:
		_inv.add("voidmetal_ore", yield_count)
		_update_inventory_ui()
		_update_hud()
	if ORE_MATERIALS.has(mat_id):
		_build_ore_lights()
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
	var solid_cells: Array = chunk_data.get("solid_cells", [])
	solid_cells.erase(Vector3i(x, y, z))

# Head chef: collect a finished mesh and swap it in, then hand the next dirty
# chunk to the worker. One task in flight, so reads/writes of the shared job
# slots are ordered by WorkerThreadPool's completion barrier — no locks needed.
func _process_chunk_mesh_jobs() -> void:
	if _mesh_task_id != -1 and WorkerThreadPool.is_task_completed(_mesh_task_id):
		WorkerThreadPool.wait_for_task_completion(_mesh_task_id)
		var done_chunk := _mesh_task_chunk
		var mesh := _mesh_task_mesh
		_mesh_task_id = -1
		_mesh_task_chunk = ""
		_mesh_task_mesh = null
		_mesh_task_snapshot = {}
		# If the chunk was mined again while building, the result is stale — skip
		# it and let the queued rebuild produce the current geometry.
		if not _dirty_chunks.has(done_chunk):
			_apply_chunk_mesh(done_chunk, mesh)
	if _mesh_task_id == -1 and _dirty_chunks.size() > 0:
		_dispatch_chunk_mesh(_dirty_chunks.pop_front())

# Photocopy the chunk's inputs onto a self-contained tray and slide it to the
# worker. occ is duplicated (neighbour culling); block ids are gathered for just
# this chunk's cells (cheap) rather than copying the whole world map.
func _dispatch_chunk_mesh(chunk_key: String) -> void:
	var chunk_data: Dictionary = _terrain_chunks.get(chunk_key, {})
	if chunk_data.is_empty() or chunk_data.get("node") == null:
		return
	var cells: Array = (chunk_data.solid_cells as Array).duplicate()
	var bids := {}
	# Bounded occupancy: this chunk's cells plus their occupied face-neighbours —
	# all that face-culling needs. Far cheaper than copying the whole world map.
	var occ_snap := {}
	for c in cells:
		bids[c] = _block_ids_v.get(c, "")
		occ_snap[c] = true
		for n in [Vector3i(c.x + 1, c.y, c.z), Vector3i(c.x - 1, c.y, c.z), Vector3i(c.x, c.y + 1, c.z), Vector3i(c.x, c.y - 1, c.z), Vector3i(c.x, c.y, c.z + 1), Vector3i(c.x, c.y, c.z - 1)]:
			if _occ.has(n):
				occ_snap[n] = true
	_mesh_task_snapshot = {"cells": cells, "occ": occ_snap, "block_ids": bids}
	_mesh_task_chunk = chunk_key
	_mesh_task_mesh = null
	_mesh_task_id = WorkerThreadPool.add_task(_threaded_chunk_build)

# Sous chef (worker thread): builds the mesh purely from the snapshot tray. Reads
# no mutable instance state; result goes in the out-slot for the head chef.
func _threaded_chunk_build() -> void:
	var snap: Dictionary = _mesh_task_snapshot
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_build_greedy_chunk_mesh(st, snap.cells, snap.occ, snap.block_ids)
	st.generate_normals()
	_mesh_task_mesh = st.commit()

# Main-thread mesh swap (scene-tree touch only happens here). Reuses the existing
# MeshInstance instead of reallocating a node.
func _apply_chunk_mesh(chunk_key: String, mesh: ArrayMesh) -> void:
	var chunk_data: Dictionary = _terrain_chunks.get(chunk_key, {})
	if chunk_data.is_empty():
		return
	var chunk_node: Node3D = chunk_data.get("node")
	if chunk_node == null:
		return
	var mesh_instance: MeshInstance3D = chunk_node.get_node_or_null("AtlasTerrain")
	if mesh != null:
		if mesh_instance == null:
			mesh_instance = MeshInstance3D.new()
			mesh_instance.name = "AtlasTerrain"
			mesh_instance.material_override = _terrain_atlas_material
			chunk_node.add_child(mesh_instance)
		mesh_instance.mesh = mesh
	elif mesh_instance != null:
		mesh_instance.mesh = null
