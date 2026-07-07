@tool
extends EditorPlugin

const PixelBrainPaintDock = preload("res://addons/scholomance_godot_bridge/editor/pixelbrain_paint_dock.gd")

var pixelbrain_importer: EditorImportPlugin
var wand_importer: EditorImportPlugin
var divwand_importer: EditorImportPlugin
var qbit_world_importer: EditorImportPlugin
var frame_timeline_importer: EditorImportPlugin
var pixelbrain_paint_dock: Control = null

func _enter_tree() -> void:
	_register_importers()
	if _is_paint_dock_enabled():
		pixelbrain_paint_dock = PixelBrainPaintDock.new()
		add_control_to_dock(DOCK_SLOT_RIGHT_UL, pixelbrain_paint_dock)

func _exit_tree() -> void:
	if pixelbrain_paint_dock != null:
		remove_control_from_docks(pixelbrain_paint_dock)
		pixelbrain_paint_dock.queue_free()
		pixelbrain_paint_dock = null
	_unregister_importers()

func _is_paint_dock_enabled() -> bool:
	var key := "scholomance/pixelbrain/enable_paint_dock"
	if not ProjectSettings.has_setting(key):
		ProjectSettings.set_setting(key, false)
	return bool(ProjectSettings.get_setting(key))

func _register_importers() -> void:
	pixelbrain_importer = preload("res://addons/scholomance_godot_bridge/importers/pixelbrain_importer.gd").new()
	wand_importer = preload("res://addons/scholomance_godot_bridge/importers/wand_importer.gd").new()
	divwand_importer = preload("res://addons/scholomance_godot_bridge/importers/divwand_importer.gd").new()
	qbit_world_importer = preload("res://addons/scholomance_godot_bridge/importers/qbit_world_importer.gd").new()
	frame_timeline_importer = preload("res://addons/scholomance_godot_bridge/importers/frame_timeline_importer.gd").new()

	add_import_plugin(pixelbrain_importer)
	add_import_plugin(wand_importer)
	add_import_plugin(divwand_importer)
	add_import_plugin(qbit_world_importer)
	add_import_plugin(frame_timeline_importer)

func _unregister_importers() -> void:
	if frame_timeline_importer != null:
		remove_import_plugin(frame_timeline_importer)
	if qbit_world_importer != null:
		remove_import_plugin(qbit_world_importer)
	if divwand_importer != null:
		remove_import_plugin(divwand_importer)
	if wand_importer != null:
		remove_import_plugin(wand_importer)
	if pixelbrain_importer != null:
		remove_import_plugin(pixelbrain_importer)

	frame_timeline_importer = null
	qbit_world_importer = null
	divwand_importer = null
	wand_importer = null
	pixelbrain_importer = null
