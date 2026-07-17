extends RefCounted
class_name CombatMath

static func clamp_between(value: int, min_val: int, max_val: int) -> int:
    return max(min_val, min(max_val, value))

static func manhattan_distance(x1: int, y1: int, x2: int, y2: int) -> int:
    return abs(x2 - x1) + abs(y2 - y1)
