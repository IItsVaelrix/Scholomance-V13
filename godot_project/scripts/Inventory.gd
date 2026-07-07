extends Node
class_name Inventory

signal changed(id: String, count: int)

const ITEMS := {
	"voidmetal_ore": {"label": "Voidmetal", "color": Color(0.65, 0.95, 1.0)},
	"torch": {"label": "Torch", "color": Color(1.0, 0.78, 0.42)},
	"stick": {"label": "Stick", "color": Color(0.78, 0.62, 0.42)},
	"voidmetal_sword": {"label": "Voidmetal Sword", "color": Color(0.72, 0.92, 1.0)},
}

var _counts: Dictionary = {}

func reset() -> void:
	_counts.clear()

func add(id: String, n: int) -> int:
	if n <= 0 or not ITEMS.has(id):
		return 0
	_counts[id] = int(_counts.get(id, 0)) + n
	changed.emit(id, _counts[id])
	return _counts[id]

func take(id: String, n: int) -> int:
	if n <= 0 or not has(id, n):
		return 0
	_counts[id] = int(_counts.get(id, 0)) - n
	if _counts[id] <= 0:
		_counts.erase(id)
		changed.emit(id, 0)
	else:
		changed.emit(id, _counts[id])
	return _counts.get(id, 0)

func has(id: String, n: int = 1) -> bool:
	return int(_counts.get(id, 0)) >= n

func count(id: String) -> int:
	return int(_counts.get(id, 0))

func entries() -> Array:
	var out := []
	for id in ITEMS.keys():
		if _counts.has(id):
			out.append({"id": id, "label": ITEMS[id].label, "color": ITEMS[id].color, "count": _counts[id]})
	return out