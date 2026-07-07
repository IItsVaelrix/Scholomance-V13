extends Node2D
class_name ArenaUnitRenderer

const TILE_W := 64.0
const TILE_H := 32.0
const ORIGIN_X := 400.0
const ORIGIN_Y := 100.0

var _store: CombatStateStore
var _unit_sprites := {}
var _target_positions := {}

func _process(delta: float) -> void:
    for id in _unit_sprites:
        if _target_positions.has(id):
            var sprite = _unit_sprites[id]
            sprite.position = sprite.position.lerp(_target_positions[id], 15.0 * delta)



func _on_state_updated() -> void:
    if not _store: return

    var current_ids = []

    for unit in _store.units:
        var id = unit.get("id", "unknown")
        current_ids.append(id)

        var pos = unit.get("position", {"x": 0, "y": 0})

        # Free-roam direct 1:1 world coordinates.
        var target_pos = Vector2(pos.x, pos.y)
        _target_positions[id] = target_pos

        if not _unit_sprites.has(id):
            var sprite = _create_unit_sprite(unit)
            add_child(sprite)
            sprite.position = target_pos
            _unit_sprites[id] = sprite

    # Cleanup dead units
    var to_remove = []
    for id in _unit_sprites.keys():
        if id not in current_ids:
            _unit_sprites[id].queue_free()
            to_remove.append(id)

    for id in to_remove:
        _unit_sprites.erase(id)
        _target_positions.erase(id)

func _create_unit_sprite(unit_data: Dictionary) -> Sprite2D:
    var sprite = Sprite2D.new()

    if unit_data.get("id") == "player":
        # Use the generated Icy Holy Fire Chestplate asset (from scripts/generate-new-void-chestplate.mjs with icy-holy-fire)
        # In practice: copy output/foundry/icy-holy-fire-chestplate/icy-holy-fire-chestplate.png to a res://assets/ path
        # or load dynamically. For demo, use a bright texture representing the chestplate.
        # To fully use PixelBrain: parse the .json packet and draw coords, or use the .png as sprite.
        var chestplate_texture = load("res://assets/icy_holy_fire_chestplate.png")  # Assume copied from output
        if chestplate_texture:
            sprite.texture = chestplate_texture
            sprite.scale = Vector2(0.6, 0.6)  # Scale for arena
            sprite.offset = Vector2(0, -chestplate_texture.get_height() / 2.0)
        else:
            # Fallback colored for player (icy blue theme)
            var poly = Polygon2D.new()
            poly.polygon = PackedVector2Array([Vector2(-24, -64), Vector2(24, -64), Vector2(24, 0), Vector2(-24, 0)])
            poly.color = Color(0.3, 0.6, 0.9, 1.0)  # Icy blue
            sprite.add_child(poly)
    else:
        # Enemy or other: use red or load other generated asset
        var poly = Polygon2D.new()
        poly.polygon = PackedVector2Array([Vector2(-20, -40), Vector2(20, -40), Vector2(20, 0), Vector2(-20, 0)])
        poly.color = Color(0.9, 0.2, 0.2, 1.0)
        sprite.add_child(poly)

    # Add speech bubble label (for real-time chat/effects in free-roam)
    var label = Label.new()
    label.name = "SpeechBubble"
    label.text = ""
    label.visible = false
    label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    label.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
    label.position = Vector2(-100, -110)
    label.size = Vector2(200, 50)
    label.add_theme_color_override("font_color", Color(1, 1, 1, 1))
    label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 1))
    label.add_theme_constant_override("outline_size", 4)
    sprite.add_child(label)

    return sprite

func show_speech_bubble(unit_id: String, phrase: String, duration: float = 3.0) -> void:
    if not _unit_sprites.has(unit_id): return
    var sprite = _unit_sprites[unit_id]
    var label = sprite.get_node_or_null("SpeechBubble")
    if label:
        label.text = phrase
        label.visible = true

        # Kill any existing timer on this label
        for child in label.get_children():
            if child is Timer:
                child.queue_free()

        var timer = Timer.new()
        timer.wait_time = duration
        timer.one_shot = true
        timer.timeout.connect(func(): label.visible = false)
        label.add_child(timer)
        timer.start()
