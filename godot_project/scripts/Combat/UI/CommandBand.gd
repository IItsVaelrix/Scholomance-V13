extends HFlowContainer
class_name CommandBand

signal action_selected(action_name: String)

func _ready() -> void:
	# Stub initialization
	pass

func set_actions(actions: Array) -> void:
	for child in get_children():
		child.queue_free()

	for action in actions:
		var btn = Button.new()
		btn.text = "[" + action + "]"
		btn.pressed.connect(func(): action_selected.emit(action))
		add_child(btn)
