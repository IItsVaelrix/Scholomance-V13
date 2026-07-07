extends RefCounted
class_name CombatHydrator

static func hydrate(state: Dictionary, snapshot: Dictionary) -> void:
	state["activeTurnSide"] = snapshot.get("turn", "player")
	state["turnCount"] = snapshot.get("round", 1)
	state["rngState"] = snapshot.get("rngState", "0")

	var grid_data = snapshot.get("grid", {})
	var blocked = grid_data.get("blocked", [])
	var cols = int(grid_data.get("cols", 8))
	var rows = int(grid_data.get("rows", 8))

	state["gridWidth"] = cols
	state["gridHeight"] = rows

	var grid_arr = []
	for r in range(rows):
		var row_arr = []
		for c in range(cols):
			row_arr.append({"occupantId": null, "blocked": false})
		grid_arr.append(row_arr)

	for b in blocked:
		grid_arr[int(b.get("row", 0))][int(b.get("col", 0))]["blocked"] = true

	state["grid"] = grid_arr

	var entities = []
	for u in snapshot.get("units", []):
		entities.append({
			"id": u.get("id", ""),
			"hp": int(u.get("hp", 0)),
			"mp": int(u.get("mp", 0)),
			"movesRemaining": int(u.get("ap", 0)),
			"position": {"x": int(u.get("col", 0)), "y": int(u.get("row", 0))},
			"statusEffects": u.get("statuses", [])
		})
		grid_arr[int(u.get("row", 0))][int(u.get("col", 0))]["occupantId"] = u.get("id", "")

	state["entities"] = entities
