@tool
extends RefCounted

static func stringify(value: Variant) -> String:
	match typeof(value):
		TYPE_DICTIONARY:
			var dict := value as Dictionary
			var keys = dict.keys()
			keys.sort()
			var parts: Array[String] = []
			for key in keys:
				parts.append(JSON.stringify(str(key)) + ":" + stringify(value[key]))
			return "{" + ",".join(parts) + "}"
		TYPE_ARRAY:
			var parts: Array[String] = []
			for item in value:
				parts.append(stringify(item))
			return "[" + ",".join(parts) + "]"
		_:
			return JSON.stringify(value)
