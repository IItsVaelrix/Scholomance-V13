"""Activity glyph — a state-driven pulse, palette-resolved, motion-honest.

Frames are built DETERMINISTICALLY from the active theme palette (dim ->
identity -> accent -> highlight flare -> back). When the host app runs with
animations disabled (TEXTUAL_ANIMATIONS=none, App.animation_level == "none")
the glyph still signals activity — as a static lit frame — because an
indicator must never silently disappear for an accessibility setting.
"""

from textual.widgets import Static
from textual.reactive import reactive

from tui.ui.theme import palette


def _frame(color: str, glyph: str = "▶", inner: str | None = None) -> str:
    g = f"[{inner}]{glyph}[/]" if inner else glyph
    return (
        f"[{color}]\n"
        "  ╭───────╮  \n"
        "  │       │  \n"
        f"  │   [/]{g}[{color}]   │  \n"
        "  │       │  \n"
        "  ╰───────╯  [/]"
    )


def build_frames(p: dict) -> list[str]:
    """The six-frame pulse cycle for a palette. Pure function — same palette,
    same frames, every time."""
    return [
        _frame(p["muted"], "▷"),                       # resting, hollow
        _frame(p["accent_secondary"]),                 # identity
        _frame(p["accent_primary"]),                   # accent
        _frame(p["highlight"], inner=p["text_bright"]),  # flare
        _frame(p["accent_primary"]),                   # accent
        _frame(p["accent_secondary"]),                 # identity
    ]


# Off-app fallback (module import context): the default theme's cycle.
FRAMES = build_frames(palette(None))


class AnimatedGlyph(Static):
    frame_index = reactive(0)

    def __init__(self, **kwargs):
        super().__init__(FRAMES[0], **kwargs)
        self.animation_timer = None
        self.pulses_remaining = 0
        self._frames = FRAMES

    def on_mount(self) -> None:
        # Resolve frames against the live app palette once, so theme swaps
        # recolor the glyph without touching this file.
        self._frames = build_frames(
            palette(getattr(self.app, "THEME_NAME", None))
        )
        # Idle = hidden. A static glyph box reads as a broken placeholder; this
        # is an ACTIVITY indicator, so it only occupies space while active.
        self.display = False

    # ── reduced motion ────────────────────────────────────────────────
    def _motion_enabled(self) -> bool:
        return getattr(self.app, "animation_level", "full") != "none"

    def pulse(self, cycles=3):
        if not self._motion_enabled():
            # Reduced motion: show one static lit frame for the duration's
            # worth of visibility instead of cycling.
            self.pulses_remaining = 0
            self.frame_index = 3
            self.update(self._frames[3])
            self.display = True
            self.set_timer(0.3 * cycles, self._recede)
            return
        self.pulses_remaining = cycles * len(self._frames)
        self.display = True
        if self.animation_timer is None:
            self.animation_timer = self.set_interval(0.1, self.advance_frame)

    def _recede(self) -> None:
        self.frame_index = 0
        self.display = False

    def advance_frame(self) -> None:
        if self.pulses_remaining < 0:          # continuous mode (start/stop)
            self.frame_index = (self.frame_index + 1) % len(self._frames)
        elif self.pulses_remaining > 0:        # finite one-shot pulse
            self.frame_index = (self.frame_index + 1) % len(self._frames)
            self.pulses_remaining -= 1
        else:                                  # done → recede to hidden
            self._recede()
            if self.animation_timer:
                self.animation_timer.stop()
                self.animation_timer = None

    def start(self) -> None:
        """Pulse continuously until stop() — a live 'agent is working' light."""
        if not self._motion_enabled():
            self.frame_index = 3
            self.update(self._frames[3])
            self.display = True
            return
        self.pulses_remaining = -1            # sentinel: never decrements to 0
        self.display = True
        if self.animation_timer is None:
            self.animation_timer = self.set_interval(0.1, self.advance_frame)

    def stop(self) -> None:
        """End a continuous pulse and recede to hidden."""
        self.pulses_remaining = 0
        self.frame_index = 0
        self.display = False
        if self.animation_timer:
            self.animation_timer.stop()
            self.animation_timer = None

    def watch_frame_index(self, index: int) -> None:
        self.update(self._frames[index])
