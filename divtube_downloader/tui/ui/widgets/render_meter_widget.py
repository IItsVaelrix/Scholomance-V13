"""Render progress meter for VideoForge.

All colours resolve through theme.palette() — no raw hex in this file, so the
widget follows a theme switch instead of staying pinned to one palette.
"""

from textual.widgets import Static
from textual.app import RenderResult
from rich.text import Text
from rich.style import Style

from tui.ui.theme import palette


class RenderMeterWidget(Static):
    def __init__(self, **kwargs):
        super().__init__("", **kwargs)
        self._status = "idle"
        self._preset = ""
        self._render_id = ""
        self._progress = 0.0
        self._message = ""

    @property
    def _p(self):
        return palette(getattr(self.app, "THEME_NAME", None))

    def set_render_state(self, status: str, preset: str = "", render_id: str = "",
                         progress: float = 0.0, message: str = ""):
        self._status = status
        self._preset = preset
        self._render_id = render_id
        self._progress = progress
        self._message = message
        self.refresh()

    def reset(self):
        self._status = "idle"
        self._preset = ""
        self._render_id = ""
        self._progress = 0.0
        self._message = ""
        self.refresh()

    def render(self) -> RenderResult:
        p = self._p
        muted = p["muted"]

        if self._status == "idle":
            return Text(" ⏸  Render idle. Use /forge export <preset> to start.", style=Style(color=muted))

        status_color = {
            "rendering": p["warning"],
            "completed": p["success"],
            "failed": p["accent_primary"],
        }.get(self._status, muted)

        bar_width = 30
        filled = int(self._progress * bar_width)
        bar = "█" * filled + "░" * (bar_width - filled)
        pct = f"{int(self._progress * 100)}%"

        lines = Text.assemble(
            (f" {bar}", Style(color=status_color, bgcolor=p["background"])),
            (f" {pct:>4} ", Style(color=p["highlight"])),
            "\n",
            # The Style already carries the colour; the status text must not
            # also interpolate it, or the palette value prints as literal text.
            (f" {self._status.upper()} ", Style(color=status_color)),
            (f"{self._preset}", Style(color=p["accent_tertiary"])),
            (f" [{self._render_id[:8]}]", Style(color=muted)) if self._render_id else Text(""),
            "\n" if self._message else Text(""),
            (f" {self._message}", Style(color=muted)) if self._message else Text(""),
        )
        return lines
