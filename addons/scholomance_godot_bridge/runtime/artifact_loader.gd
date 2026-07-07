@tool
extends RefCounted

const PIXELBRAIN_KIND := "scholomance.pixelbrain.godot.v1"
const WAND_KIND := "scholomance.wand.godot.v1"
const DIVWAND_KIND := "scholomance.divwand.godot.v1"
const QBIT_WORLD_KIND := "scholomance.qbitworld.godot.v1"
const SUPPORTED_VERSION := 1

static func load_json_file(source_file: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(source_file)
	if text.is_empty():
		push_warning("Scholomance Godot Bridge: empty artifact file: %s" % source_file)
		return {}

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Scholomance Godot Bridge: artifact is not a JSON object: %s" % source_file)
		return {}

	return parsed

static func is_kind(artifact: Dictionary, expected_kind: String) -> bool:
	var actual_kind := str(artifact.get("kind", ""))
	if actual_kind != expected_kind:
		push_warning("Scholomance Godot Bridge: importer expected kind %s but received %s." % [expected_kind, actual_kind])
		return false
	return true

static func validate_supported_fields(context: String, data: Dictionary, supported: Array[String], strict_validation: bool) -> bool:
	var ok := true
	for key in data.keys():
		if not supported.has(str(key)):
			ok = _report("Scholomance Godot Bridge: %s field '%s' is unsupported." % [context, str(key)], strict_validation) and ok
	return ok

static func warn_unsupported_fields(context: String, data: Dictionary, supported: Array[String]) -> void:
	validate_supported_fields(context, data, supported, false)

static func validate_common_artifact(artifact: Dictionary, expected_kind: String, strict_validation: bool) -> bool:
	var ok := true
	if artifact.is_empty():
		return _report("Scholomance Godot Bridge: artifact is empty.", strict_validation)

	var actual_kind := str(artifact.get("kind", ""))
	if actual_kind != expected_kind:
		ok = _report("Scholomance Godot Bridge: importer expected kind %s but received %s." % [expected_kind, actual_kind], strict_validation) and ok

	if not artifact.has("version"):
		ok = _report("Scholomance Godot Bridge: artifact is missing version.", strict_validation) and ok
	elif int(artifact.get("version", 0)) != SUPPORTED_VERSION:
		ok = _report("Scholomance Godot Bridge: unsupported artifact version %s." % str(artifact.get("version")), strict_validation) and ok

	return ok

static func validate_pixelbrain_artifact(artifact: Dictionary, strict_validation: bool) -> bool:
	var ok := validate_common_artifact(artifact, PIXELBRAIN_KIND, strict_validation)
	ok = validate_supported_fields("PixelBrain artifact", artifact, ["kind", "version", "canvas", "palettes", "coordinates", "formula", "bytecode", "bytecodeStatus"], strict_validation) and ok

	var canvas: Variant = artifact.get("canvas")
	if typeof(canvas) != TYPE_DICTIONARY:
		return _report("Scholomance Godot Bridge: PixelBrain canvas must be an object.", strict_validation) and ok
	var canvas_data: Dictionary = canvas

	for field in ["width", "height", "gridSize"]:
		if not canvas_data.has(field) or not _is_number(canvas_data.get(field)) or float(canvas_data.get(field)) <= 0.0:
			ok = _report("Scholomance Godot Bridge: PixelBrain canvas.%s must be a positive number." % field, strict_validation) and ok

	var width := int(canvas_data.get("width", 0))
	var height := int(canvas_data.get("height", 0))
	var coordinates: Variant = artifact.get("coordinates", [])
	if typeof(coordinates) != TYPE_ARRAY:
		return _report("Scholomance Godot Bridge: PixelBrain coordinates must be an array.", strict_validation) and ok
	var coordinate_list: Array = coordinates

	for coord in coordinate_list:
		if typeof(coord) != TYPE_DICTIONARY:
			ok = _report("Scholomance Godot Bridge: PixelBrain coordinate must be an object.", strict_validation) and ok
			continue
		var coord_data: Dictionary = coord
		var x_value: Variant = coord_data.get("snappedX", coord_data.get("x"))
		var y_value: Variant = coord_data.get("snappedY", coord_data.get("y"))
		if not _is_number(x_value) or not _is_number(y_value):
			ok = _report("Scholomance Godot Bridge: PixelBrain coordinate requires numeric x/y or snappedX/snappedY.", strict_validation) and ok
			continue
		var x := int(x_value)
		var y := int(y_value)
		if x < 0 or x >= width or y < 0 or y >= height:
			ok = _report("Scholomance Godot Bridge: PixelBrain coordinate (%d, %d) exceeds canvas bounds." % [x, y], strict_validation) and ok

	return ok

static func validate_wand_artifact(artifact: Dictionary, supported_formula_types: Array[String], strict_validation: bool) -> bool:
	var ok := validate_common_artifact(artifact, WAND_KIND, strict_validation)
	ok = validate_supported_fields("Wand artifact", artifact, ["kind", "version", "valid", "validation", "proposal"], strict_validation) and ok

	var proposal: Variant = artifact.get("proposal")
	if typeof(proposal) != TYPE_DICTIONARY:
		return _report("Scholomance Godot Bridge: Wand proposal must be an object.", strict_validation) and ok
	var proposal_data: Dictionary = proposal

	var proposed_formula: Variant = proposal_data.get("proposedFormula", proposal_data)
	if typeof(proposed_formula) != TYPE_DICTIONARY:
		return _report("Scholomance Godot Bridge: Wand proposedFormula must be an object.", strict_validation) and ok
	var proposed_formula_data: Dictionary = proposed_formula

	var formula: Variant = proposed_formula_data.get("formula", {})
	if typeof(formula) != TYPE_DICTIONARY:
		return _report("Scholomance Godot Bridge: Wand formula must be an object.", strict_validation) and ok
	var formula_data: Dictionary = formula

	var formula_type := str(formula_data.get("type", "unknown"))
	if not supported_formula_types.has(formula_type):
		ok = _report("Scholomance Godot Bridge: unsupported Wand formula '%s'." % formula_type, strict_validation) and ok

	return ok

static func validate_divwand_artifact(artifact: Dictionary, supported_roles: Array[String], supported_node_fields: Array[String], supported_layout_fields: Array[String], supported_style_fields: Array[String], strict_validation: bool) -> bool:
	var ok := validate_common_artifact(artifact, DIVWAND_KIND, strict_validation)
	ok = validate_supported_fields("DivWand artifact", artifact, ["kind", "version", "valid", "validation", "proposal"], strict_validation) and ok

	var proposal: Variant = artifact.get("proposal")
	if typeof(proposal) != TYPE_DICTIONARY:
		return _report("Scholomance Godot Bridge: DivWand proposal must be an object.", strict_validation) and ok
	var proposal_data: Dictionary = proposal

	var layout: Variant = proposal_data.get("proposedLayout", proposal_data)
	if typeof(layout) != TYPE_DICTIONARY:
		return _report("Scholomance Godot Bridge: DivWand proposed layout must be an object.", strict_validation) and ok
	var layout_data: Dictionary = layout

	return _validate_divwand_node(layout_data, supported_roles, supported_node_fields, supported_layout_fields, supported_style_fields, strict_validation) and ok

static func validate_qbit_world_artifact(artifact: Dictionary, strict_validation: bool) -> bool:
	var ok := validate_common_artifact(artifact, QBIT_WORLD_KIND, strict_validation)
	ok = validate_supported_fields("QBIT world artifact", artifact, ["kind", "version", "schoolWeights", "params", "telemetry", "faces", "pixelBrainAsset", "wandProposal", "divWandNode"], strict_validation) and ok

	var faces: Variant = artifact.get("faces", [])
	if typeof(faces) != TYPE_ARRAY:
		return _report("Scholomance Godot Bridge: QBIT world faces must be an array.", strict_validation) and ok

	for face in faces:
		if typeof(face) != TYPE_DICTIONARY:
			ok = _report("Scholomance Godot Bridge: QBIT world face must be an object.", strict_validation) and ok
			continue
		var face_data: Dictionary = face
		var polygon: Variant = face_data.get("polygon", [])
		if typeof(polygon) != TYPE_ARRAY or polygon.size() < 3:
			ok = _report("Scholomance Godot Bridge: QBIT world face polygon must contain at least 3 points.", strict_validation) and ok
			continue
		for point in polygon:
			if typeof(point) != TYPE_DICTIONARY:
				ok = _report("Scholomance Godot Bridge: QBIT world polygon point must be an object.", strict_validation) and ok
				continue
			var point_data: Dictionary = point
			if not _is_number(point_data.get("x")) or not _is_number(point_data.get("y")):
				ok = _report("Scholomance Godot Bridge: QBIT world polygon points require numeric x/y.", strict_validation) and ok

	return ok

static func _validate_divwand_node(node: Dictionary, supported_roles: Array[String], supported_node_fields: Array[String], supported_layout_fields: Array[String], supported_style_fields: Array[String], strict_validation: bool) -> bool:
	var ok := validate_supported_fields("DivWand node", node, supported_node_fields, strict_validation)
	var role := str(node.get("role", "container"))
	if not supported_roles.has(role):
		ok = _report("Scholomance Godot Bridge: unsupported DivWand role '%s'." % role, strict_validation) and ok

	if node.has("layout"):
		if typeof(node.get("layout")) != TYPE_DICTIONARY:
			ok = _report("Scholomance Godot Bridge: DivWand layout must be an object.", strict_validation) and ok
		else:
			ok = validate_supported_fields("DivWand layout", node.get("layout"), supported_layout_fields, strict_validation) and ok

	if node.has("style"):
		if typeof(node.get("style")) != TYPE_DICTIONARY:
			ok = _report("Scholomance Godot Bridge: DivWand style must be an object.", strict_validation) and ok
		else:
			ok = validate_supported_fields("DivWand style", node.get("style"), supported_style_fields, strict_validation) and ok

	var children: Variant = node.get("children", [])
	if typeof(children) != TYPE_ARRAY:
		return _report("Scholomance Godot Bridge: DivWand children must be an array.", strict_validation) and ok
	var child_list: Array = children

	for child in child_list:
		if typeof(child) != TYPE_DICTIONARY:
			ok = _report("Scholomance Godot Bridge: DivWand child must be an object.", strict_validation) and ok
			continue
		var child_data: Dictionary = child
		ok = _validate_divwand_node(child_data, supported_roles, supported_node_fields, supported_layout_fields, supported_style_fields, strict_validation) and ok

	return ok

static func _is_number(value: Variant) -> bool:
	return typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT

static func _report(message: String, strict_validation: bool) -> bool:
	if strict_validation:
		push_error(message)
	else:
		push_warning(message)
	return not strict_validation
