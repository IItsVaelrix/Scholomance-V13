"""Media bin listing for VideoForge.

All colours resolve through theme.palette() — no raw hex in this file, so the
widget follows a theme switch instead of staying pinned to one palette.
"""

from textual.widgets import Static
from textual.app import RenderResult
from rich.text import Text
from rich.style import Style

from tui.ui.theme import palette


class MediaBinWidget(Static):
    def __init__(self, media_items: list | None = None, **kwargs):
        super().__init__("", **kwargs)
        self._items = media_items or []

    @property
    def _p(self):
        return palette(getattr(self.app, "THEME_NAME", None))

    def update_media(self, items: list):
        self._items = items
        self.refresh()

    def render(self) -> RenderResult:
        p = self._p
        muted, gold = p["muted"], p["highlight"]

        if not self._items:
            return Text(" Media bin is empty. Import with /forge import.", style=Style(color=muted))
        lines = []
        for m in self._items:
            type_icon = {"video": "🎬", "audio": "🎵", "image": "🖼", "subtitle": "📝"}.get(m.get("fileType", ""), "📁")
            color_band = Style(color=gold, bgcolor=p["background"])
            has_duration = m.get("durationSecs", 0) > 0
            line = Text.assemble(
                (f" {type_icon} ", color_band),
                (f" {m.get('mediaId', ''):<14} ", Style(color=gold)),
                (f"{m.get('label', ''):<24} ", Style(color=muted)),
                (f"{m.get('width', 0)}x{m.get('height', 0)} ", Style(color=p["accent_tertiary"])),
                (f"{m.get('durationSecs', 0):.1f}s ",
                 Style(color=p["success"] if has_duration else p["warning"])),
                (f"{m.get('fps', 0):.0f}fps", Style(color=muted)),
            )
            lines.append(line)
        t = Text.assemble(*lines, "\n")
        return t
