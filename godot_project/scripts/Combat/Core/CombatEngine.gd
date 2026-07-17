extends RefCounted
class_name CombatEngine

const CombatRng = preload("res://scripts/Combat/Core/CombatRng.gd")
const CombatGrid = preload("res://scripts/Combat/Core/CombatGrid.gd")

# Note: We do not fully initialize entities and grid here yet as that
# would require duplicating the logic from JS. We rely on the JS
# harness to set up the grid and initial units. The JS golden harness
# starts from an initialized state. However, the user provided a
# skeleton for create_initial_state, so we implement the skeleton.
func create_initial_state(seed: String) -> Dictionary:
    return {
        "seed": seed,
        "round": 1,
        "turn": "player",
        "rngState": String.num_int64(CombatRng.stable_hash(seed)),
        "units": [],
        "grid": {
            "cols": 8,
            "rows": 8,
            "blocked": [],
        },
    }

func apply_resolved_action(state: Dictionary, action: Dictionary) -> Dictionary:
    var next_state := state.duplicate(true)

    var command_str: String = action.get("command", "")
    var parts = command_str.split(" ")
    var action_kind = parts[0] if parts.size() > 0 else ""

    if action_kind == "MOVE":
        return _apply_move(next_state, action, parts)
    elif action_kind == "CHANNEL":
        return _apply_channel(next_state, action)
    elif action_kind == "CAST" or action_kind == "COUNTER":
        return _apply_resolved_spell(next_state, action)
    elif action_kind == "END_TURN":
        return _advance_turn(next_state)
    else:
        next_state["lastError"] = {
            "category": "COMBAT",
            "code": "UNKNOWN_ACTION",
        }
        return next_state

func _find_entity(state: Dictionary, entity_id: String) -> Dictionary:
    for e in state.get("entities", []):
        if e.get("id", "") == entity_id:
            return e
    return {}

func _apply_move(state: Dictionary, action: Dictionary, parts: PackedStringArray) -> Dictionary:
    if parts.size() < 3: return state

    var dx = parts[1].to_int()
    var dy = parts[2].to_int()

    var actor_id = action.get("actorId", "")
    var actor = _find_entity(state, actor_id)
    if actor.is_empty(): return state

    var grid_width = state.get("gridWidth", 8)
    var grid_height = state.get("gridHeight", 8)

    var pos = actor.get("position", {"x": 0, "y": 0})
    var next_x = pos["x"] + dx
    var next_y = pos["y"] + dy

    if CombatGrid.is_in_bounds(next_x, next_y, grid_width, grid_height):
        var grid: Array = state.get("grid", [])
        # Clear old cell
        if grid.size() > pos["y"] and grid[pos["y"]].size() > pos["x"]:
            grid[pos["y"]][pos["x"]]["occupantId"] = null

        # Set new cell
        actor["position"]["x"] = next_x
        actor["position"]["y"] = next_y

        if grid.size() > next_y and grid[next_y].size() > next_x:
            grid[next_y][next_x]["occupantId"] = actor_id

        actor["movesRemaining"] = actor.get("movesRemaining", 1) - 1

    return state

func _apply_channel(state: Dictionary, action: Dictionary) -> Dictionary:
    var actor = _find_entity(state, action.get("actorId", ""))
    if not actor.is_empty():
        actor["mp"] = min(actor.get("maxMp", 100), actor.get("mp", 0) + 20)
        return _advance_turn(state)
    return state

func _apply_resolved_spell(state: Dictionary, action: Dictionary) -> Dictionary:
    var spell = action.get("resolvedSpell", {})
    if spell.is_empty():
        return _advance_turn(state)

    var effects: Array = spell.get("effects", [])
    for eff in effects:
        var kind = eff.get("kind", "")
        if kind == "HEAL":
            var target = _find_entity(state, action.get("actorId", ""))
            if not target.is_empty():
                target["hp"] = min(target.get("maxHp", 1000), target.get("hp", 0) + eff.get("amount", 0))
        elif kind == "DAMAGE":
            # For simplistic harness purposes, damage affects the opponent
            var target_id = "opponent" if action.get("actorId", "") == "player" else "player"
            var target = _find_entity(state, target_id)
            if not target.is_empty():
                target["hp"] = max(0, target.get("hp", 0) - eff.get("amount", 0))
        elif kind == "STATUS":
            # Just push the status
            var target_id = "opponent" if action.get("actorId", "") == "player" else "player"
            var target = _find_entity(state, target_id)
            if not target.is_empty():
                var st_list: Array = target.get("statusEffects", [])
                st_list.append({
                    "id": eff.get("type", "unknown"),
                    "type": eff.get("type", "unknown"),
                    "magnitude": eff.get("magnitude", 0.0),
                    "turnsRemaining": eff.get("duration", 1)
                })

    var cost = spell.get("cost", {})
    if cost.has("mp"):
        var actor = _find_entity(state, action.get("actorId", ""))
        if not actor.is_empty():
            actor["mp"] = max(0, actor.get("mp", 0) - cost.get("mp", 0))

    return _advance_turn(state)

func _advance_turn(state: Dictionary) -> Dictionary:
    state["turnCount"] = state.get("turnCount", 1) + 1
    var current_side = state.get("activeTurnSide", "player")
    var next_side = "opponent" if current_side == "player" else "player"
    state["activeTurnSide"] = next_side

    for e in state.get("entities", []):
        if e.get("id", "") == next_side:
            e["movesRemaining"] = e.get("maxMovesPerTurn", 1)
            e["statusEffects"] = tick_status_effects(e.get("statusEffects", []))

    return state

func tick_status_effects(status_effects: Array) -> Array:
    var kept := []
    for st in status_effects:
        var rem = st.get("turnsRemaining", 0) - 1
        if rem > 0:
            st["turnsRemaining"] = rem
            st["tier"] = st.get("tier", 1)
            st["turns"] = st.get("turns", st.get("turnsRemaining", 0) + 1)
            kept.append(st)
    return kept
