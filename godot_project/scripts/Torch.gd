extends Node3D
class_name Torch

const LIGHT_COLOR := Color(1.0, 0.72, 0.34)
const RANGE := 7.5
const ENERGY := 1.9

func _ready() -> void:
	var light := OmniLight3D.new()
	light.light_color = LIGHT_COLOR
	light.light_energy = ENERGY
	light.omni_range = RANGE
	add_child(light)

	var flame := MeshInstance3D.new()
	var flame_mesh := CylinderMesh.new()
	flame_mesh.top_radius = 0.06
	flame_mesh.bottom_radius = 0.10
	flame_mesh.height = 0.22
	flame.mesh = flame_mesh
	var flame_mat := StandardMaterial3D.new()
	flame_mat.albedo_color = Color(1.0, 0.78, 0.32)
	flame_mat.emission_enabled = true
	flame_mat.emission = LIGHT_COLOR
	flame_mat.emission_energy_multiplier = 2.4
	flame.material_override = flame_mat
	flame.position = Vector3(0, 0.55, 0)
	add_child(flame)

	var stick := MeshInstance3D.new()
	var stick_mesh := CylinderMesh.new()
	stick_mesh.top_radius = 0.05
	stick_mesh.bottom_radius = 0.05
	stick_mesh.height = 0.45
	stick.mesh = stick_mesh
	var stick_mat := StandardMaterial3D.new()
	stick_mat.albedo_color = Color(0.36, 0.24, 0.16)
	stick.material_override = stick_mat
	stick.position = Vector3(0, 0.18, 0)
	add_child(stick)