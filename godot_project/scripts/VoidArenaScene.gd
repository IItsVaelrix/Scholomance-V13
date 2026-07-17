extends Node2D

const FrameTimelineRunner = preload("res://addons/scholomance_godot_bridge/runtime/frame_timeline_runner.gd")

var _runner

func _ready() -> void:
	_runner = FrameTimelineRunner.new()
	add_child(_runner)

	var loaded: bool = _runner.load_timeline_file("res://assets/void_arena.framepkt")
	if not loaded:
		push_error("VoidArenaScene: failed to load void_arena.framepkt")
		return

	_runner.apply_frame(0)

func _input(event: InputEvent) -> void:
	# Press Space to play the full resting scene animation
	if event is InputEventKey and event.pressed and event.keycode == KEY_SPACE:
		_runner.play(60)
