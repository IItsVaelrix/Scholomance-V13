extends RichTextLabel
class_name MudLog

func append_log(bbcode: String) -> void:
	append_text(bbcode + "\n")
