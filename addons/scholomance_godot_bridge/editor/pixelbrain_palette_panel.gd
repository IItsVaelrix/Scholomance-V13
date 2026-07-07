@tool
extends HBoxContainer

signal color_selected(color_text: String)

var _swatches: Array[Button] = []

func load_palette(palettes: Array) -> void:
	for child in get_children():
		child.queue_free()
	_swatches.clear()
	for entry in palettes:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var hex := str(entry.get("hex", "#FFFFFF"))
		if not Color.html_is_valid(hex):
			continue
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(24, 24)
		btn.self_modulate = Color.html(hex)
		btn.pressed.connect(func(): color_selected.emit(hex))
		add_child(btn)
		_swatches.append(btn)
