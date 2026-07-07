extends Node2D
class_name BattleArena

@onready var grid_layer = $GridLayer
@onready var unit_layer = $UnitLayer
@onready var spell_layer = $SpellLayer
@onready var backdrop = $ShaderBackdrop

# Free-roam MMORPG style: Continuous world space, real-time movement.
# The arena is now the dominant "view" — large immersive PixelBrain world.
# No more turn-based grid clicks for movement. Use direct controls (WASD or mouse).
# Grid can be faded/optional tactical overlay. World is continuous for free roam.

var player_speed := 180.0  # pixels per second — tune for feel
var player_position := Vector2(24, 24)  # Start in "center" of arena (will sync with store)
var is_moving := false

@onready var camera = $Camera2D

var store: CombatStateStore
var bridge: CombatBridge

func setup(p_store: CombatStateStore, p_bridge: CombatBridge) -> void:
	store = p_store
	bridge = p_bridge

	if grid_layer:
		grid_layer._store = store
		store.state_updated.connect(grid_layer.queue_redraw)

	if unit_layer:
		unit_layer._store = store
		store.state_updated.connect(unit_layer._on_state_updated)

func _ready() -> void:
	# For pure free-roam MMORPG view, hide or fade the grid (tactical overlay only when wanted).
	if grid_layer:
		grid_layer.visible = false  # Pure immersive dungeon view. Set true only if you want faint tactical overlay.

	# Crystal animation
	var crystal = get_node_or_null("PulsingCrystal")
	if crystal:
		var tween = create_tween()
		tween.set_loops()
		tween.tween_property(crystal, "scale", Vector2(1.2, 1.2), 1.0)
		tween.tween_property(crystal, "scale", Vector2(0.8, 0.8), 1.0)

func _process(delta: float) -> void:
	# Real-time free-roam movement — this is the core of ditching turn-by-turn.
	# WASD for direct control (classic MMO feel). Mouse click-to-move can be added.
	var input_dir := Vector2.ZERO

	if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W):
		input_dir.y -= 1
	if Input.is_action_pressed("ui_down") or Input.is_key_pressed(KEY_S):
		input_dir.y += 1
	if Input.is_action_pressed("ui_left") or Input.is_key_pressed(KEY_A):
		input_dir.x -= 1
	if Input.is_action_pressed("ui_right") or Input.is_key_pressed(KEY_D):
		input_dir.x += 1

	if input_dir != Vector2.ZERO:
		input_dir = input_dir.normalized()
		player_position += input_dir * player_speed * delta
		is_moving = true

		# Prediction visual update (handled by _process and state sync)
		# Send intent to bridge for server/simulation.
		if bridge:
			# For now, send a movement intent (adapt your packet format).
			bridge.send_command("MOVE %.1f %.1f" % [player_position.x, player_position.y], "FreeRoam")
	else:
		is_moving = false

	# Camera follow for immersive MMORPG view (player always centered).
	if camera:
		camera.position = player_position

# Legacy grid click can be repurposed for targeting spells/AoE in free-roam,
# or removed. For pure free-roam, movement is direct.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		# In free-roam: Use for ability targeting or set move target.
		# For now, log — we'll wire real-time targeting next.
		var world_pos = _screen_to_world(event.position)
		print("Free-roam click target at world pos: ", world_pos)
		# Example: If an ability is selected in hotbar (Phaser), cast at this pos.
		# bridge.send_ability_target(world_pos)

func _screen_to_world(screen_pos: Vector2) -> Vector2:
	# Simple conversion. Update based on your iso/ortho projection in renderers.
	# For the large view, this will map mouse to the expansive arena space.
	return screen_pos / 32.0  # Rough scale; refine with actual renderer constants

func update_arena(state: Dictionary) -> void:
	# For free-roam, this will receive live state patches (positions, health, etc.)
	# instead of turn-based. Sync player_position if authoritative update comes in.
	if state.has("player_position"):
		player_position = Vector2(state.player_position.x, state.player_position.y)

	# Dispatch to sub-renderers (they should now handle continuous positions)
	pass

# Future: Add camera follow for the player in the large MMORPG view.
# func _add_player_camera():
#     var cam = Camera2D.new()
#     cam.position_smoothing_enabled = true
#     add_child(cam)
#     # Make it follow the player unit.
