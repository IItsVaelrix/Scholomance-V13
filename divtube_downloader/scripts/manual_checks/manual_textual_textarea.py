"""Manual probe: render a TextArea and eyeball its behaviour.

Not a pytest test -- it opens a blocking terminal UI. Run from anywhere:

    python scripts/manual_checks/manual_textual_textarea.py

Was `tests_textarea.py`. Two corrections: the class was `TestApp` (a `Test*`
name pytest would try to collect from any module that imported it), and the
script built `app = TestApp()` and then stopped -- it constructed the app and
never ran it, so it printed nothing and exited 0.
"""
from textual.app import App
from textual.widgets import TextArea


class TextareaProbeApp(App):
    def compose(self):
        yield TextArea("Hello")


if __name__ == "__main__":
    TextareaProbeApp().run()
