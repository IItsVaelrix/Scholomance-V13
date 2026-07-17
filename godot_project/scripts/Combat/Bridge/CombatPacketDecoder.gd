extends Node
class_name CombatPacketDecoder

func decode(packet_str: String) -> Dictionary:
	var json = JSON.new()
	var error = json.parse(packet_str)
	if error == OK:
		var data = json.data
		if typeof(data) == TYPE_DICTIONARY:
			return data
	return {}
