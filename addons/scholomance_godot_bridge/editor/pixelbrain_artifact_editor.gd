@tool
extends RefCounted

const PIXELBRAIN_KIND := "scholomance.pixelbrain.godot.v1"

static func paint_pixel(artifact: Dictionary, x: int, y: int, color_text: String) -> Dictionary:
	var next := artifact.duplicate(true)
	var canvas: Dictionary = next.get("canvas", {})
	var width := int(canvas.get("width", 160))
	var height := int(canvas.get("height", 144))
	if x < 0 or y < 0 or x >= width or y >= height:
		return next
	if not Color.html_is_valid(color_text):
		color_text = "#FFFFFF"

	var coords: Array = []
	for coord in next.get("coordinates", []):
		if typeof(coord) != TYPE_DICTIONARY:
			continue
		var cx := int(coord.get("snappedX", coord.get("x", 0)))
		var cy := int(coord.get("snappedY", coord.get("y", 0)))
		if cx == x and cy == y:
			continue
		coords.append(coord)

	coords.append({
		"x": x,
		"y": y,
		"snappedX": x,
		"snappedY": y,
		"color": color_text,
	})
	next["coordinates"] = sort_coordinates(coords)
	next["bytecodeStatus"] = "stale-godot-edit"
	return next

static func erase_pixel(artifact: Dictionary, x: int, y: int) -> Dictionary:
	var next := artifact.duplicate(true)
	var coords: Array = []
	for coord in next.get("coordinates", []):
		if typeof(coord) != TYPE_DICTIONARY:
			continue
		var cx := int(coord.get("snappedX", coord.get("x", 0)))
		var cy := int(coord.get("snappedY", coord.get("y", 0)))
		if cx != x or cy != y:
			coords.append(coord)
	next["coordinates"] = sort_coordinates(coords)
	next["bytecodeStatus"] = "stale-godot-edit"
	return next

static func sort_coordinates(coords: Array) -> Array:
	var sorted := coords.duplicate(true)
	sorted.sort_custom(func(a, b):
		var ay := int(a.get("snappedY", a.get("y", 0)))
		var by_ := int(b.get("snappedY", b.get("y", 0)))
		if ay != by_:
			return ay < by_
		var ax := int(a.get("snappedX", a.get("x", 0)))
		var bx := int(b.get("snappedX", b.get("x", 0)))
		return ax < bx
	)
	return sorted
