extends RefCounted
class_name CombatCanonicalizer

static func canonicalize(state: Dictionary, step: int) -> Dictionary:
    var snapshot := {}
    snapshot["step"] = step
    snapshot["round"] = state.get("turnCount", 1)
    snapshot["turn"] = state.get("activeTurnSide", "player")
    snapshot["rngState"] = String(state.get("rngState", "0"))

    var units: Array = state.get("entities", [])
    var out_units := []

    for u in units:
        var out_u := {
            "id": u.get("id", ""),
            "hp": int(u.get("hp", 0)),
            "mp": int(u.get("mp", 0)),
            "ap": int(u.get("movesRemaining", 0)),
            "col": int(u.get("position", {}).get("x", 0)),
            "row": int(u.get("position", {}).get("y", 0)),
            "statuses": []
        }

        var statuses: Array = u.get("statusEffects", [])
        var out_statuses := []
        for s in statuses:
            out_statuses.append(s.duplicate(true))

        out_statuses.sort_custom(func(a, b): return a.get("id", "").nocasecmp_to(b.get("id", "")) < 0)
        out_u["statuses"] = out_statuses
        out_units.append(out_u)

    out_units.sort_custom(func(a, b): return a.get("id", "").nocasecmp_to(b.get("id", "")) < 0)
    snapshot["units"] = out_units

    var grid := {
        "cols": int(state.get("gridWidth", 8)),
        "rows": int(state.get("gridHeight", 8)),
        "blocked": []
    }

    var state_grid: Array = state.get("grid", [])
    var blocked := []
    for r in range(state_grid.size()):
        var row_arr: Array = state_grid[r]
        for c in range(row_arr.size()):
            var cell: Dictionary = row_arr[c]
            if cell.get("blocked", false):
                blocked.append({"row": r, "col": c})

    grid["blocked"] = blocked
    snapshot["grid"] = grid

    return snapshot
