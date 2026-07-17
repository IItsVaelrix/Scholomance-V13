@tool
extends Node2D

var _timeline: Dictionary = {}
var _nodes_by_id: Dictionary = {}
var _play_timer: Timer = null

const PLACEHOLDER_SIZE := 28.0

func load_timeline_file(path: String) -> bool:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_warning("FrameTimelineRunner: could not read file: %s" % path)
		return false

	var parsed: Variant = JSON.parse_string(text.strip_edges())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("FrameTimelineRunner: file is not a JSON object: %s" % path)
		return false

	var data: Dictionary = parsed
	if int(data.get("schemaVersion", 0)) != 1:
		push_warning("FrameTimelineRunner: unsupported schemaVersion in %s" % path)
		return false

	_timeline = data
	return true

func apply_frame(frame_number: int) -> void:
	var packets: Array = _timeline.get("frames", [])
	for raw in packets:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var packet: Dictionary = raw
		if int(packet.get("frame", -1)) != frame_number:
			continue
		_apply_packet(packet)
		return
	push_warning("FrameTimelineRunner: no packet found for frame %d" % frame_number)

func play(fps: int = 60) -> void:
	var packets: Array = _timeline.get("frames", [])
	if packets.is_empty():
		return

	var index := 0
	_play_timer = Timer.new()
	_play_timer.wait_time = 1.0 / float(fps)
	_play_timer.one_shot = false
	add_child(_play_timer)

	_play_timer.timeout.connect(func():
		if index >= packets.size():
			_play_timer.stop()
			return
		var packet: Dictionary = packets[index]
		_apply_packet(packet)
		index += 1
	)
	_play_timer.start()

func _apply_packet(packet: Dictionary) -> void:
	for raw in packet.get("create", []):
		if typeof(raw) == TYPE_DICTIONARY:
			_apply_create(raw)
	for raw in packet.get("update", []):
		if typeof(raw) == TYPE_DICTIONARY:
			_apply_update(raw)
	for raw in packet.get("destroy", []):
		if typeof(raw) == TYPE_DICTIONARY:
			_apply_destroy(raw)

func _apply_create(instruction: Dictionary) -> void:
	var id := str(instruction.get("id", ""))
	if id.is_empty():
		push_warning("FrameTimelineRunner: create instruction missing id")
		return
	if _nodes_by_id.has(id):
		push_warning("FrameTimelineRunner: create reuses existing id: %s" % id)
		return

	var type := str(instruction.get("type", "Node2D"))
	var props: Dictionary = instruction.get("props", {}) if typeof(instruction.get("props", {})) == TYPE_DICTIONARY else {}
	var node := _make_placeholder_node(type, id, props)
	_apply_transform(node, instruction.get("transform", {}))
	add_child(node)
	_nodes_by_id[id] = node

func _apply_update(instruction: Dictionary) -> void:
	var id := str(instruction.get("id", ""))
	if not _nodes_by_id.has(id):
		push_warning("FrameTimelineRunner: update targets unknown id: %s" % id)
		return

	var node: Node2D = _nodes_by_id[id]
	var transform: Variant = instruction.get("transform")
	if typeof(transform) == TYPE_DICTIONARY:
		_apply_transform_partial(node, transform)

func _apply_destroy(instruction: Dictionary) -> void:
	var id := str(instruction.get("id", ""))
	if not _nodes_by_id.has(id):
		push_warning("FrameTimelineRunner: destroy targets unknown id: %s" % id)
		return

	var node: Node2D = _nodes_by_id[id]
	# Use immediate free so a same-packet create with the same ID doesn't collide
	# TODO: guard against create+destroy ordering within a single packet if needed
	node.free()
	_nodes_by_id.erase(id)

func _make_placeholder_node(type: String, id: String, _props: Dictionary) -> Node2D:
	var container := Node2D.new()
	container.name = id

	if type == "TileMap":
		var bg := ColorRect.new()
		bg.size = Vector2(1920, 1080)
		bg.position = Vector2.ZERO
		bg.color = Color("#111118")
		container.add_child(bg)
		return container

	var rect := ColorRect.new()
	rect.size = Vector2(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
	rect.position = Vector2(-PLACEHOLDER_SIZE / 2.0, -PLACEHOLDER_SIZE / 2.0)
	rect.color = _id_to_color(id)
	container.add_child(rect)
	return container

func _id_to_color(id: String) -> Color:
	if id.begins_with("fissure_"):
		return Color("#00E5FF")
	if id.begins_with("amethyst_"):
		return Color("#7B2FBE")
	if id.begins_with("pillar_"):
		return Color("#0D0D1A")
	if id.begins_with("singularity_"):
		return Color.WHITE
	if id.begins_with("void_shard_"):
		return Color(0.0, 0.898, 1.0, 0.6)
	return Color("#444444")

func _apply_transform(node: Node2D, transform: Dictionary) -> void:
	node.position = Vector2(float(transform.get("x", 0.0)), float(transform.get("y", 0.0)))
	node.rotation = float(transform.get("rotation", 0.0))
	node.scale = Vector2(float(transform.get("scaleX", 1.0)), float(transform.get("scaleY", 1.0)))
	node.z_index = int(transform.get("zIndex", 0))

func _apply_transform_partial(node: Node2D, transform: Dictionary) -> void:
	if transform.has("x"):
		node.position.x = float(transform.get("x"))
	if transform.has("y"):
		node.position.y = float(transform.get("y"))
	if transform.has("rotation"):
		node.rotation = float(transform.get("rotation"))
	if transform.has("scaleX"):
		node.scale.x = float(transform.get("scaleX"))
	if transform.has("scaleY"):
		node.scale.y = float(transform.get("scaleY"))
	if transform.has("zIndex"):
		node.z_index = int(transform.get("zIndex"))
