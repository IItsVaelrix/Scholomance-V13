extends SceneTree

const CombatEngine = preload("res://scripts/Combat/Core/CombatEngine.gd")
const CombatCanonicalizer = preload("res://scripts/Combat/Core/CombatCanonicalizer.gd")
const CombatHydrator = preload("res://scripts/Combat/Core/CombatHydrator.gd")

var log_file: FileAccess

func _init() -> void:
    var scenarios := [
        "golden-combat-sequence-1-basic-loop.json",
        "golden-combat-sequence-2-status-effects.json",
        "golden-combat-sequence-3-pathing-blockers.json"
    ]

    log_file = FileAccess.open("res://debug.txt", FileAccess.WRITE)
    log_file.store_line("Starting tests...")

    var all_passed = true
    for scenario in scenarios:
        var passed = _run_scenario(scenario)
        if not passed:
            all_passed = false

    if all_passed:
        log_file.store_line("All GoldenCombatTests passed.")
        print("All GoldenCombatTests passed.")
        quit(0)
    else:
        log_file.store_line("One or more GoldenCombatTests failed.")
        print("One or more GoldenCombatTests failed.")
        quit(1)

func _run_scenario(scenario_filename: String) -> bool:
    log_file.store_line("Running scenario: " + scenario_filename)
    var base_path = ProjectSettings.globalize_path("res://")
    var path = base_path + "../tests/qa/fixtures/" + scenario_filename
    var text := FileAccess.get_file_as_string(path)

    if text.is_empty():
        log_file.store_line("Missing golden fixture: " + path)
        push_error("Missing golden fixture: %s" % path)
        return false

    var golden = JSON.parse_string(text)

    if typeof(golden) != TYPE_DICTIONARY:
        log_file.store_line("Invalid golden JSON: " + path)
        push_error("Invalid golden JSON: %s" % path)
        return false

    var engine = CombatEngine.new()
    var state = {}

    var snap_0 = golden["snapshots"][0]
    CombatHydrator.hydrate(state, snap_0)

    var canon_0 = CombatCanonicalizer.canonicalize(state, 0)
    if not _assert_equal(canon_0, snap_0, "snapshot 0"):
        return false

    var commands: Array = golden["commands"]

    for index in commands.size():
        state = engine.apply_resolved_action(state, commands[index])

        var canon_i = CombatCanonicalizer.canonicalize(state, index + 1)
        var snap_i = golden["snapshots"][index + 1]
        if not _assert_equal(canon_i, snap_i, "snapshot %d" % (index + 1)):
            return false

    log_file.store_line("  -> Passed")
    return true

func _fix_numbers(v: Variant) -> Variant:
    if typeof(v) == TYPE_FLOAT:
        if v == float(int(v)):
            return int(v)
    elif typeof(v) == TYPE_DICTIONARY:
        var d = {}
        for k in v:
            d[k] = _fix_numbers(v[k])
        return d
    elif typeof(v) == TYPE_ARRAY:
        var a = []
        for x in v:
            a.append(_fix_numbers(x))
        return a
    return v

func _assert_equal(actual, expected, label: String) -> bool:
    var actual_fixed = _fix_numbers(actual)
    var expected_fixed = _fix_numbers(expected)
    var actual_json := JSON.stringify(actual_fixed)
    var expected_json := JSON.stringify(expected_fixed)

    if actual_json != expected_json:
        log_file.store_line("Golden mismatch at " + label)
        log_file.store_line("Expected: " + expected_json)
        log_file.store_line("Actual:   " + actual_json)
        return false
    return true
