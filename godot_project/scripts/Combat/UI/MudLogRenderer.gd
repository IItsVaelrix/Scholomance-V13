extends RefCounted
class_name MudLogRenderer

static func render_event(event: Dictionary) -> String:
	var prefix = event.get("prefix", "SYS")
	var text = event.get("text", "")
	var color = CombatThemeTokens.COMBAT_MUTED.to_html()

	if prefix == "DMG":
		color = CombatThemeTokens.COMBAT_DANGER.to_html()
	elif prefix == "CAST":
		color = CombatThemeTokens.COMBAT_ACCENT.to_html()

	return "[color=#" + color + "]" + prefix + "[/color] " + text
