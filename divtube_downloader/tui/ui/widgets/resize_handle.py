"""Drag handle that resizes a sibling widget's height."""

from __future__ import annotations

from textual import events
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Static


def clamp_height(value: int, min_height: int, max_height: int) -> int:
    """Clamp a height to inclusive bounds."""
    return max(min_height, min(max_height, value))


class CommandResizeHandle(Static):
    """One-row drag bar that adjusts `#command-input` height."""

    DEFAULT_CSS = """
    CommandResizeHandle {
        height: 1;
        width: 100%;
        content-align: center middle;
        color: $text-secondary;
        background: transparent;
        margin: 0 1;
    }
    CommandResizeHandle:hover {
        color: $accent-primary;
        background: $panel-border;
    }
    CommandResizeHandle.-dragging {
        color: $accent-primary;
        background: $panel-border;
    }
    """

    dragging: reactive[bool] = reactive(False)

    def __init__(
        self,
        *,
        target_id: str = "command-input",
        min_height: int = 3,
        max_height: int = 40,
        id: str | None = None,
    ) -> None:
        super().__init__("┄┄ drag to resize ┄┄", id=id)
        self.target_id = target_id
        self.min_height = min_height
        self.max_height = max_height
        self._drag_start_y: int | None = None
        self._height_at_start: int | None = None
        self.can_focus = False

    def watch_dragging(self, dragging: bool) -> None:
        self.set_class(dragging, "-dragging")
        self.update("┄┄ resizing ┄┄" if dragging else "┄┄ drag to resize ┄┄")

    def _target(self) -> Widget:
        return self.app.query_one(f"#{self.target_id}")

    def _current_height(self) -> int:
        target = self._target()
        # Prefer the laid-out size; fall back to the style value.
        if target.size.height > 0:
            return target.size.height
        try:
            return int(target.styles.height.value)
        except Exception:
            return self.min_height

    def set_target_height(self, height: int) -> None:
        height = clamp_height(height, self.min_height, self.max_height)
        self._target().styles.height = height

    def on_mouse_down(self, event: events.MouseDown) -> None:
        if event.button != 1:
            return
        event.stop()
        self.capture_mouse()
        self.dragging = True
        self._drag_start_y = event.screen_y
        self._height_at_start = self._current_height()

    def on_mouse_move(self, event: events.MouseMove) -> None:
        if not self.dragging or self._drag_start_y is None or self._height_at_start is None:
            return
        # Dragging the top edge up grows the box; dragging down shrinks it.
        delta = self._drag_start_y - event.screen_y
        self.set_target_height(self._height_at_start + delta)

    def on_mouse_up(self, event: events.MouseUp) -> None:
        if not self.dragging:
            return
        event.stop()
        self.release_mouse()
        self.dragging = False
        self._drag_start_y = None
        self._height_at_start = None
