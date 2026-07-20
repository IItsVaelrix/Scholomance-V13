from textual.widgets import TextArea
from textual.binding import Binding
from textual.message import Message

from tui.ui.widgets.resize_handle import CommandResizeHandle


class CommandSubmitted(Message):
    """Emitted when the user presses Enter in the command area."""
    def __init__(self, value: str) -> None:
        self.value = value
        super().__init__()


class CommandArea(TextArea):
    BINDINGS = [
        Binding("enter", "submit", "Submit", show=False, priority=True),
        Binding("shift+enter", "expand", "Expand", show=False, priority=True),
        Binding("ctrl+up", "grow", "Taller", show=False, priority=True),
        Binding("ctrl+down", "shrink", "Shorter", show=False, priority=True),
        Binding("escape", "blur_input", "Unfocus", show=False),
    ]

    def __init__(self, placeholder: str = "", id: str | None = None) -> None:
        super().__init__(id=id)
        # Note: TextArea currently doesn't natively support a placeholder string in the same way as Input,
        # but we can set the initial text or just leave it empty.
        self.show_line_numbers = False
        self._is_expanded = False

    def _resize_handle(self) -> CommandResizeHandle | None:
        try:
            return self.app.query_one("#command-resize", CommandResizeHandle)
        except Exception:
            return None

    def _nudge_height(self, delta: int) -> None:
        handle = self._resize_handle()
        if handle is None:
            return
        current = self.size.height if self.size.height > 0 else 10
        handle.set_target_height(current + delta)

    def action_submit(self) -> None:
        val = self.text.strip()
        if val:
            self.post_message(CommandSubmitted(val))
        self.text = ""
        # Contract back after submitting
        self.remove_class("expanded")
        self._is_expanded = False

    def action_expand(self) -> None:
        self.insert("\n")
        if not self._is_expanded:
            self.add_class("expanded")
            self._is_expanded = True
            # Give multiline room without requiring a mouse drag.
            self._nudge_height(4)

    def action_grow(self) -> None:
        self._nudge_height(1)

    def action_shrink(self) -> None:
        self._nudge_height(-1)

    def action_blur_input(self) -> None:
        self.app.set_focus(None)
