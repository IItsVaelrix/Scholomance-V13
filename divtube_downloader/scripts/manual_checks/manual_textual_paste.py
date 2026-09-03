"""Manual probe: does pasting a path into the command Input rewrite it to /magic?

Not a pytest test -- it opens a blocking terminal UI. Run from anywhere:

    python scripts/manual_checks/manual_textual_paste.py

Was `test_paste.py`. The class is deliberately *not* named `Test*`: pytest's
`python_classes = Test*` collects any imported `Test`-prefixed class, which is
the same trap that took out `AgentToolResult` and `TestRunPanel`.
"""
import os

from textual.app import App
from textual.widgets import Input


class PasteProbeApp(App):
    def compose(self):
        yield Input(id="probe")

    def on_input_changed(self, event: Input.Changed):
        text = event.value.strip(" '\n\r\"")
        if os.path.exists(text) and os.path.isfile(text):
            event.input.value = f"/magic {text}"
            event.input.action_end()


if __name__ == "__main__":
    PasteProbeApp().run()
