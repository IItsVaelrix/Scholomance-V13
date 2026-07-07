@tool
extends EditorImportPlugin

const FrameTimelineRunner = preload("res://addons/scholomance_godot_bridge/runtime/frame_timeline_runner.gd")

func _get_importer_name() -> String:
	return "scholomance.frame_timeline.godot"

func _get_visible_name() -> String:
	return "Scholomance Frame Timeline"

func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["framepkt"])

func _get_save_extension() -> String:
	return "tscn"

func _get_resource_type() -> String:
	return "PackedScene"

func _get_preset_count() -> int:
	return 2

func _get_preset_name(preset_index: int) -> String:
	if preset_index == 1:
		return "Strict Validation"
	return "Shadow Mode"

func _get_import_options(_path: String, preset_index: int) -> Array[Dictionary]:
	return [
		{
			"name": "strict_validation",
			"default_value": preset_index == 1,
		},
	]

func _get_option_visibility(_path: String, _option_name: StringName, _options: Dictionary) -> bool:
	return true

func _get_priority() -> float:
	return 1.0

func _get_import_order() -> int:
	return 0

func _import(source_file: String, save_path: String, options: Dictionary, _platform_variants: Array[String], _gen_files: Array[String]) -> Error:
	var strict_validation := bool(options.get("strict_validation", false))

	var runner := FrameTimelineRunner.new()
	var ok := runner.load_timeline_file(source_file)
	if not ok:
		if strict_validation:
			return ERR_INVALID_DATA
		push_warning("Scholomance Godot Bridge: FrameTimeline import failed in shadow mode for %s" % source_file)

	runner.apply_frame(0)
	runner.name = "VoidArenaFrameTimeline"

	var root := Node2D.new()
	root.name = "FrameTimelineArtifact"
	root.add_child(runner)
	runner.owner = root

	# Q3 fix: recursively assign owner so PackedScene.pack() includes all descendants
	_set_owner_recursive(runner, root)

	var scene := PackedScene.new()
	var result := scene.pack(root)
	if result != OK:
		push_warning("Scholomance Godot Bridge: failed to pack FrameTimeline scene.")
		return ERR_CANT_CREATE

	return ResourceSaver.save(scene, "%s.%s" % [save_path, _get_save_extension()])

func _set_owner_recursive(node: Node, owner: Node) -> void:
	for child in node.get_children():
		child.owner = owner
		_set_owner_recursive(child, owner)
