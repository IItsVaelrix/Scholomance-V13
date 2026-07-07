extends RefCounted
class_name CombatRng

# Stable hash mimicking the JS implementation:
# function stableHash(value) {
#   const text = String(value || '');
#   let hash = 5381;
#   for (let index = 0; index < text.length; index += 1) {
#     hash = ((hash << 5) + hash) + text.charCodeAt(index);
#     hash |= 0;
#   }
#   return Math.abs(hash);
# }
static func stable_hash(value: String) -> int:
    var text = value
    var hash_val: int = 5381
    for i in range(text.length()):
        var char_code = text.unicode_at(i)
        # In GDScript, bitwise operations on int are 64-bit, but we need 32-bit truncation
        # Equivalent to JS: hash = ((hash << 5) + hash) + char_code; hash |= 0;
        hash_val = ((hash_val << 5) + hash_val) + char_code
        # Force 32-bit signed integer truncation
        hash_val = hash_val & 0xFFFFFFFF
        if hash_val > 0x7FFFFFFF:
            hash_val -= 0x100000000

    return abs(hash_val)

static func create_seeded_random(seed_str: String) -> Callable:
    var state: int = (abs(stable_hash(seed_str)) % 2147483646) + 1

    var generator = func() -> float:
        state = (state * 16807) % 2147483647
        return float(state - 1) / 2147483646.0

    return generator
