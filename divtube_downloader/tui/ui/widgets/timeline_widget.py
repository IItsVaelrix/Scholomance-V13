"""Timeline / track view for VideoForge.

All colours resolve through theme.palette() — no raw hex in this file, so the
widget follows a theme switch instead of staying pinned to one palette.
"""

from textual.widgets import Static
from textual.app import RenderResult
from rich.text import Text
from rich.style import Style

from tui.ui.theme import palette


def _clip_colors(p):
    """Six categorical slots for clip fills, all drawn from theme tokens.

    A clip's colour is an identity band, not a status, so these are the
    theme's distinct identity/state hues rather than semantic roles.
    """
    return [
        p["highlight"],
        p["accent_tertiary"],
        p["success"],
        p["warning"],
        p["accent_primary"],
        p["accent_secondary"],
    ]


class TimelineWidget(Static):
    def __init__(self, clips: list | None = None, transitions: list | None = None, **kwargs):
        super().__init__("", **kwargs)
        self._clips = clips or []
        self._transitions = transitions or []

    @property
    def _p(self):
        return palette(getattr(self.app, "THEME_NAME", None))

    def update_clips(self, clips: list, transitions: list):
        self._clips = clips
        self._transitions = transitions
        self.refresh()

    def on_resize(self, event) -> None:
        self.refresh()

    def render(self) -> RenderResult:
        p = self._p
        muted, gold = p["muted"], p["highlight"]

        if self._clips:
            max_time = max(c.get("endTime", 0) for c in self._clips)
        else:
            max_time = 0.0

        if max_time == 0:
            max_time = 10.0

        width = self.size.width - 15
        if width <= 20:
            width = 60 # fallback

        lines = []
        clip_colors = _clip_colors(p)

        # Sort tracks
        tracks = {}
        if self._clips:
            for c in self._clips:
                t_idx = c.get("trackIndex", 0)
                if t_idx not in tracks:
                    tracks[t_idx] = []
                tracks[t_idx].append(c)
        else:
            tracks[0] = []

        # Draw Ruler
        lines.append(Text(""))
        ruler_text = Text(style=Style(color=muted))
        ruler_text.append("       ") # indent for track label

        ruler_str = ["─"] * width
        num_ticks = 5
        for i in range(num_ticks + 1):
            tick_time = (max_time / num_ticks) * i
            pos = int((tick_time / max_time) * (width - 1))
            tick_label = f"[{tick_time:.1f}s]"

            # Center or place the tick label
            start_pos = pos
            if i == num_ticks: # right align the last tick
                start_pos = max(0, width - len(tick_label))

            for j, ch in enumerate(tick_label):
                if start_pos + j < width:
                    ruler_str[start_pos + j] = ch

        ruler_text.append("".join(ruler_str))
        lines.append(ruler_text)
        lines.append(Text(""))

        # Draw Tracks
        for t_idx in sorted(tracks.keys()):
            track_clips = sorted(tracks[t_idx], key=lambda c: c.get("startTime", 0))

            track_line = Text()
            track_line.append(f" V{t_idx:<4} ", style=Style(color=gold, bold=True))

            current_pos = 0

            for c in track_clips:
                start_t = c.get("startTime", 0)
                end_t = c.get("endTime", 0)

                start_col = int((start_t / max_time) * (width - 1))
                end_col = int((end_t / max_time) * (width - 1))
                clip_width = max(1, end_col - start_col)

                # Add padding if there's a gap
                if start_col > current_pos:
                    track_line.append(" " * (start_col - current_pos))
                    current_pos = start_col

                # Handle overlap visually by truncating earlier clip padding if needed
                if start_col < current_pos:
                    # In a real editor, clips on the same track don't overlap time,
                    # but if they do, we'll just draw from current_pos
                    clip_width = max(1, end_col - current_pos)

                color = clip_colors[hash(c.get("clipId", "")) % len(clip_colors)]
                label = c.get("label", c.get("clipId", "?"))

                if clip_width == 1:
                    clip_str = "█"
                elif clip_width == 2:
                    clip_str = "██"
                else:
                    label_trunc = label[:max(0, clip_width - 2)]
                    pad = clip_width - 2 - len(label_trunc)

                    # Center the label if possible, or just left-align
                    clip_str = f"[{label_trunc}{' ' * pad}]"

                track_line.append(clip_str, style=Style(color=p["background"], bgcolor=color))
                current_pos += clip_width

            lines.append(track_line)
            lines.append(Text(""))

        if self._transitions:
            lines.append(Text(""))
            for t in self._transitions:
                lines.append(Text(f"  ↗ Transition: {t.get('transitionType', '?')}  {t.get('fromClipId', '')} → {t.get('toClipId', '')}  {t.get('durationSecs', 0)}s",
                                  style=Style(color=p["accent_primary"])))

        return Text("\n").join(lines)
