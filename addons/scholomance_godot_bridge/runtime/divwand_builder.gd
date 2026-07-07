@tool
extends Node

const SUPPORTED_NODE_FIELDS: Array[String] = ["id", "type", "role", "layout", "style", "props", "children"]
const SUPPORTED_LAYOUT_FIELDS: Array[String] = ["width", "height", "padding", "margin", "gap", "flexDirection", "alignItems", "justifyContent"]
const SUPPORTED_STYLE_FIELDS: Array[String] = ["variant", "borderRadius", "opacity"]
const SUPPORTED_ROLES: Array[String] = ["button", "text", "badge", "wrapper", "container", "card", "header", "content", "footer", "row", "glow-container"]

func build_control_tree(layout_node: Dictionary) -> Control:
	_warn_unsupported_fields("DivWand node", layout_node, SUPPORTED_NODE_FIELDS)
	_warn_unsupported_fields("DivWand layout", layout_node.get("layout", {}), SUPPORTED_LAYOUT_FIELDS)
	_warn_unsupported_fields("DivWand style", layout_node.get("style", {}), SUPPORTED_STYLE_FIELDS)

	var role := str(layout_node.get("role", "container"))
	var node: Control

	match role:
		"button":
			var button := Button.new()
			button.text = str(layout_node.get("props", {}).get("text", ""))
			node = button
		"text":
			var label := Label.new()
			var props: Dictionary = layout_node.get("props", {})
			label.text = str(props.get("title", props.get("text", "")))
			node = label
		"badge":
			var badge := Label.new()
			badge.text = str(layout_node.get("props", {}).get("text", ""))
			node = badge
		"wrapper", "container", "card", "header", "content", "footer", "row", "glow-container":
			node = PanelContainer.new()
		_:
			push_warning("Scholomance Godot Bridge: unsupported DivWand role '%s'; using PanelContainer fallback." % role)
			node = PanelContainer.new()

	node.name = str(layout_node.get("id", role))
	node.set_meta("scholomance_role", role)
	_apply_layout(node, layout_node.get("layout", {}))
	_apply_style_metadata(node, layout_node.get("style", {}))

	for child in layout_node.get("children", []):
		if typeof(child) != TYPE_DICTIONARY:
			push_warning("Scholomance Godot Bridge: skipped non-object DivWand child.")
			continue
		var child_node := build_control_tree(child)
		node.add_child(child_node)

	return node

func build_divwand_scene(artifact: Dictionary) -> PackedScene:
	var proposal: Dictionary = artifact.get("proposal", {})
	var layout: Dictionary = proposal.get("proposedLayout", proposal)
	var root := build_control_tree(layout)
	root.name = "DivWandArtifact"
	root.set_meta("scholomance_kind", artifact.get("kind", ""))
	root.set_meta("scholomance_version", artifact.get("version", 0))

	_assign_owner(root, root)

	var scene := PackedScene.new()
	var result := scene.pack(root)
	if result != OK:
		push_warning("Scholomance Godot Bridge: failed to pack DivWand scene.")
	return scene

func _apply_layout(node: Control, layout: Dictionary) -> void:
	var width := _number_or_zero(layout.get("width", 0.0))
	var height := _number_or_zero(layout.get("height", 0.0))
	if width > 0.0 or height > 0.0:
		node.custom_minimum_size = Vector2(width, height)

	if layout.has("padding") or layout.has("gap") or layout.has("flexDirection"):
		node.set_meta("scholomance_layout", layout.duplicate(true))

func _apply_style_metadata(node: Control, style: Dictionary) -> void:
	if not style.is_empty():
		node.set_meta("scholomance_style", style.duplicate(true))

func _assign_owner(node: Node, owner_node: Node) -> void:
	for child in node.get_children():
		child.owner = owner_node
		_assign_owner(child, owner_node)

func _warn_unsupported_fields(context: String, data: Variant, supported: Array[String]) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	for key in data.keys():
		if not supported.has(str(key)):
			push_warning("Scholomance Godot Bridge: %s field '%s' is unsupported in shadow mode." % [context, str(key)])

func _number_or_zero(value: Variant) -> float:
	if typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT:
		return float(value)
	return 0.0
