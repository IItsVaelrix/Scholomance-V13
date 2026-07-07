extends Control
class_name CombatPage

# Pure host for the full-screen VOID dungeon arena (free-roam MMORPG view).
# Godot renders ONLY the immersive world (the new shader dungeon + pillars + units in real-time).
# This takes the ENTIRE screen as the game view.
# Phaser (UI layer) is a transparent overlay on top drawing the full MMO HUD
# (bottom hotbar with cooldowns, top player/target frames, minimap, compact log, cast bar, etc.).
# Use the VOID palette (purple/crimson/obsidian/indigo/silver) to theme the Phaser HUD.

@onready var battle_arena = $MarginContainer/BattleArena/SubViewport/BattleArenaRoot

var bridge: CombatBridge
var store: CombatStateStore

func _ready() -> void:
	bridge = CombatBridge.new()
	add_child(bridge)

	store = CombatStateStore.new()
	add_child(store)

	bridge.state_patch_received.connect(store.apply_patch)
	bridge.init_received.connect(_on_init_received)
	bridge.action_received.connect(_on_action_received)

	# Wire live renderers for free-roam (continuous positions, no turns).
	if battle_arena:
		battle_arena.setup(store, bridge)

	# Phaser will drive inputs (hotbar abilities, movement intents) via the bridge.
	# Godot sends live state updates (player pos for minimap, unit health, cooldowns, events).

func _on_init_received(packet: Dictionary) -> void:
	store.apply_init(packet)

func _on_action_received(action: Dictionary) -> void:
	store.apply_action(action)

	# Real-time feedback (e.g. speech bubbles on casts).
	if action.has("command") and action.command.begins_with("CAST "):
		var actor_id = action.get("actorId", "unknown")
		var resolved_spell = action.get("resolvedSpell", {})
		if resolved_spell and resolved_spell.has("intent"):
			var phrase = resolved_spell.get("intent", "...")
			if battle_arena and battle_arena.unit_layer and battle_arena.unit_layer.has_method("show_speech_bubble"):
				battle_arena.unit_layer.show_speech_bubble(actor_id, phrase.to_upper())
