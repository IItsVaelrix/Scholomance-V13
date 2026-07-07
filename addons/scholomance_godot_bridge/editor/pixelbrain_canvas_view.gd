@tool
extends Control

signal paint_requested(x: int, y: int, color_text: String)
signal erase_requested(x: int, y: int)

var artifact: Dictionary = {}
var active_color := "#FFFFFF"
var tool_mode := "paint"
var zoom := 8

func _draw() -> void:
	var canvas: Dictionary = artifact.get("canvas", {})
	var width := int(canvas.get("width", 160))
	var height := int(canvas.get("height", 144))
	draw_rect(Rect2(Vector2.ZERO, Vector2(width * zoom, height * zoom)), Color(0, 0, 0, 0.2), true)
	for coord in artifact.get("coordinates", []):
		if typeof(coord) != TYPE_DICTIONARY:
			continue
		var x := int(coord.get("snappedX", coord.get("x", 0)))
		var y := int(coord.get("snappedY", coord.get("y", 0)))
		var color_text := str(coord.get("color", "#FFFFFF"))
		var color := Color.html(color_text) if Color.html_is_valid(color_text) else Color.WHITE
		draw_rect(Rect2(Vector2(x * zoom, y * zoom), Vector2(zoom, zoom)), color, true)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		var x := int(event.position.x / zoom)
		var y := int(event.position.y / zoom)
		if tool_mode == "erase":
			erase_requested.emit(x, y)
		else:
			paint_requested.emit(x, y, active_color)
