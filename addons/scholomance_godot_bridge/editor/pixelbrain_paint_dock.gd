@tool
extends VBoxContainer

const ArtifactLoader = preload("res://addons/scholomance_godot_bridge/runtime/artifact_loader.gd")
const ArtifactEditor = preload("res://addons/scholomance_godot_bridge/editor/pixelbrain_artifact_editor.gd")
const StableJson = preload("res://addons/scholomance_godot_bridge/editor/pixelbrain_stable_json.gd")
const CanvasView = preload("res://addons/scholomance_godot_bridge/editor/pixelbrain_canvas_view.gd")
const PalettePanel = preload("res://addons/scholomance_godot_bridge/editor/pixelbrain_palette_panel.gd")

var artifact: Dictionary = {
	"kind": "scholomance.pixelbrain.godot.v1",
	"version": 1,
	"canvas": { "width": 160, "height": 144, "gridSize": 1 },
	"palettes": [],
	"coordinates": [],
	"formula": null,
	"bytecode": "",
}
var source_path := ""
var use_strict_validation := false
var canvas_view: Control
var palette_panel: Control

func _ready() -> void:
	name = "PixelBrain Paint"

	palette_panel = PalettePanel.new()
	palette_panel.color_selected.connect(_on_color_selected)
	add_child(palette_panel)

	canvas_view = CanvasView.new()
	canvas_view.artifact = artifact
	canvas_view.paint_requested.connect(_on_paint_requested)
	canvas_view.erase_requested.connect(_on_erase_requested)
	canvas_view.custom_minimum_size = Vector2(320, 288)
	add_child(canvas_view)

	var toolbar := HBoxContainer.new()
	add_child(toolbar)

	var load_btn := Button.new()
	load_btn.text = "Open .pbrain"
	load_btn.pressed.connect(_show_load_dialog)
	toolbar.add_child(load_btn)

	var save_btn := Button.new()
	save_btn.text = "Save"
	save_btn.pressed.connect(_show_save_dialog)
	toolbar.add_child(save_btn)

	var erase_btn := Button.new()
	erase_btn.text = "Erase"
	erase_btn.pressed.connect(func(): canvas_view.tool_mode = "erase")
	toolbar.add_child(erase_btn)

	var paint_btn := Button.new()
	paint_btn.text = "Paint"
	paint_btn.pressed.connect(func(): canvas_view.tool_mode = "paint")
	toolbar.add_child(paint_btn)

	var strict_check := CheckButton.new()
	strict_check.text = "Strict"
	strict_check.tooltip_text = "Reject invalid artifacts on save (recommended)"
	strict_check.button_pressed = use_strict_validation
	strict_check.toggled.connect(func(on): use_strict_validation = on)
	toolbar.add_child(strict_check)

func _on_paint_requested(x: int, y: int, color_text: String) -> void:
	artifact = ArtifactEditor.paint_pixel(artifact, x, y, color_text)
	canvas_view.artifact = artifact
	canvas_view.queue_redraw()

func _on_erase_requested(x: int, y: int) -> void:
	artifact = ArtifactEditor.erase_pixel(artifact, x, y)
	canvas_view.artifact = artifact
	canvas_view.queue_redraw()

func _on_color_selected(color_text: String) -> void:
	canvas_view.active_color = color_text
	canvas_view.tool_mode = "paint"

func load_from_path(path: String) -> Error:
	var loaded := ArtifactLoader.load_json_file(path)
	if not ArtifactLoader.validate_pixelbrain_artifact(loaded, false):
		push_warning("PixelBrainPaintDock: invalid artifact at %s — loaded in shadow mode" % path)
	artifact = loaded
	source_path = path
	canvas_view.artifact = artifact
	canvas_view.queue_redraw()
	var palettes: Array = artifact.get("palettes", [])
	palette_panel.load_palette(palettes)
	return OK

func save_to_path(path: String, strict: bool = false) -> Error:
	if not ArtifactLoader.validate_pixelbrain_artifact(artifact, strict):
		return ERR_INVALID_DATA
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(StableJson.stringify(artifact) + "\n")
	return OK

func save_and_reimport(path: String) -> Error:
	var result := save_to_path(path, use_strict_validation)
	if result != OK:
		return result
	if Engine.is_editor_hint():
		EditorInterface.get_resource_filesystem().scan()
	return OK

func _show_load_dialog() -> void:
	var dialog := EditorFileDialog.new()
	dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_FILE
	dialog.add_filter("*.pbrain", "PixelBrain Artifact")
	dialog.file_selected.connect(func(path): load_from_path(path))
	add_child(dialog)
	dialog.popup_centered_ratio(0.6)

func _show_save_dialog() -> void:
	if source_path != "":
		save_and_reimport(source_path)
		return
	var dialog := EditorFileDialog.new()
	dialog.file_mode = EditorFileDialog.FILE_MODE_SAVE_FILE
	dialog.add_filter("*.pbrain", "PixelBrain Artifact")
	dialog.file_selected.connect(func(path): save_and_reimport(path))
	add_child(dialog)
	dialog.popup_centered_ratio(0.6)
