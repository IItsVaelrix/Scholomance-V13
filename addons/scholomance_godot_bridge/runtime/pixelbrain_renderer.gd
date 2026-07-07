@tool
extends Node

func render_pixelbrain_texture(artifact: Dictionary) -> ImageTexture:
	var canvas: Dictionary = artifact.get("canvas", {})
	var width := max(1, int(canvas.get("width", 160)))
	var height := max(1, int(canvas.get("height", 144)))
	var image := Image.create(width, height, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))

	for coord in artifact.get("coordinates", []):
		if typeof(coord) != TYPE_DICTIONARY:
			push_warning("Scholomance Godot Bridge: skipped non-object PixelBrain coordinate.")
			continue

		var x := int(coord.get("snappedX", coord.get("x", 0)))
		var y := int(coord.get("snappedY", coord.get("y", 0)))
		var color_text := str(coord.get("color", "#FFFFFF"))
		if not Color.html_is_valid(color_text):
			push_warning("Scholomance Godot Bridge: invalid PixelBrain color '%s'; using #FFFFFF." % color_text)
			color_text = "#FFFFFF"
		var color := Color.html(color_text)

		if x >= 0 and x < width and y >= 0 and y < height:
			image.set_pixel(x, y, color)
		else:
			push_warning("Scholomance Godot Bridge: skipped out-of-bounds PixelBrain coordinate (%d, %d)." % [x, y])

	return ImageTexture.create_from_image(image)

func build_pixelbrain_scene(artifact: Dictionary) -> PackedScene:
	var root := Node2D.new()
	root.name = "PixelBrainArtifact"
	root.set_meta("scholomance_kind", artifact.get("kind", ""))
	root.set_meta("scholomance_version", artifact.get("version", 0))
	root.set_meta("scholomance_bytecode", artifact.get("bytecode", ""))

	var sprite := Sprite2D.new()
	sprite.name = "PixelBrainTexture"
	sprite.texture = render_pixelbrain_texture(artifact)
	sprite.centered = false
	root.add_child(sprite)
	sprite.owner = root

	var scene := PackedScene.new()
	var result := scene.pack(root)
	if result != OK:
		push_warning("Scholomance Godot Bridge: failed to pack PixelBrain scene.")
	return scene
