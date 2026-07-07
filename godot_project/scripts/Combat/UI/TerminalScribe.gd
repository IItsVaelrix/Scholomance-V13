extends LineEdit

signal command_submitted(command_text: String, source: String)

func _ready() -> void:
    text_submitted.connect(_on_text_submitted)

func _on_text_submitted(new_text: String) -> void:
    var clean_text = new_text.strip_edges()
    if clean_text.is_empty():
        return

    command_submitted.emit(clean_text, name)

    # Clear input on submit
    text = ""
