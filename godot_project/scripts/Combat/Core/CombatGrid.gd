extends RefCounted
class_name CombatGrid

static func is_in_bounds(x: int, y: int, grid_width: int, grid_height: int) -> bool:
    return x >= 0 and x < grid_width and y >= 0 and y < grid_height

static func is_occupied(x: int, y: int, grid: Array) -> bool:
    if y < 0 or y >= grid.size(): return true
    var row: Array = grid[y]
    if x < 0 or x >= row.size(): return true

    var cell: Dictionary = row[x]
    if cell.get("blocked", false): return true
    if cell.get("occupantId", null) != null: return true
    return false
