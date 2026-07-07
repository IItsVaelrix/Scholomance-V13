@tool
extends Node

const SUPPORTED_FORMULA_TYPES: Array[String] = [
	"parametric_curve",
	"grid_projection",
	"fibonacci",
	"fractal_iter",
	"composite",
	"vectorized_text",
]

func build_wand_scene(artifact: Dictionary) -> PackedScene:
	var root := Node2D.new()
	root.name = "WandArtifact"
	root.set_meta("scholomance_kind", artifact.get("kind", ""))
	root.set_meta("scholomance_version", artifact.get("version", 0))
	root.set_meta("scholomance_valid", artifact.get("valid", false))

	var proposal: Dictionary = artifact.get("proposal", {})
	root.set_meta("scholomance_proposal", proposal.duplicate(true))

	var proposed_formula: Dictionary = proposal.get("proposedFormula", proposal)
	var formula: Dictionary = proposed_formula.get("formula", {})
	var formula_type := str(formula.get("type", "unknown"))

	if not SUPPORTED_FORMULA_TYPES.has(formula_type):
		push_warning("Scholomance Godot Bridge: unsupported Wand formula '%s'; imported as metadata-only scene." % formula_type)
	else:
		push_warning("Scholomance Godot Bridge: Wand formula '%s' imports as metadata in Phase 3; live evaluation is not implemented." % formula_type)

	var marker := Marker2D.new()
	marker.name = "FormulaOrigin"
	marker.set_meta("scholomance_role", proposed_formula.get("role", ""))
	marker.set_meta("scholomance_formula_type", formula_type)
	root.add_child(marker)
	marker.owner = root

	var scene := PackedScene.new()
	var result := scene.pack(root)
	if result != OK:
		push_warning("Scholomance Godot Bridge: failed to pack Wand scene.")
	return scene
