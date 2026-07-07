@tool
extends EditorImportPlugin

const ArtifactLoader = preload("res://addons/scholomance_godot_bridge/runtime/artifact_loader.gd")
const WandBuilder = preload("res://addons/scholomance_godot_bridge/runtime/wand_builder.gd")

func _get_importer_name() -> String:
	return "scholomance.wand.godot"

func _get_visible_name() -> String:
	return "Scholomance Wand Artifact"

func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["wand"])

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

func _import(source_file: String, save_path: String, _options: Dictionary, _platform_variants: Array[String], _gen_files: Array[String]) -> Error:
	var artifact := ArtifactLoader.load_json_file(source_file)
	var strict_validation := bool(_options.get("strict_validation", false))
	if not ArtifactLoader.is_kind(artifact, ArtifactLoader.WAND_KIND):
		if strict_validation:
			return ERR_INVALID_DATA
		return OK

	if not ArtifactLoader.validate_wand_artifact(artifact, WandBuilder.SUPPORTED_FORMULA_TYPES, strict_validation):
		return ERR_INVALID_DATA

	var builder := WandBuilder.new()
	var scene := builder.build_wand_scene(artifact)
	return ResourceSaver.save(scene, "%s.%s" % [save_path, _get_save_extension()])
