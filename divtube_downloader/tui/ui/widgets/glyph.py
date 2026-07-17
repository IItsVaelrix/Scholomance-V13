from textual.widgets import Static
from textual.reactive import reactive

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

# Pulse through the Scholomance palette: dim purple → crimson → gold → back.
FRAMES = [
    _frame("#4B2A6F", "▷"),   # dim purple, hollow
    _frame("#8B5CF6"),        # royal purple
    _frame("#DC143C"),        # crimson
    _frame("#FFD700", inner="#FFFFFF"),  # gold flare, white triangle
    _frame("#DC143C"),        # crimson
    _frame("#8B5CF6"),        # royal purple
]

class AnimatedGlyph(Static):
    frame_index = reactive(0)
    
    def __init__(self, **kwargs):
        super().__init__(FRAMES[0], **kwargs)
        self.animation_timer = None
        self.pulses_remaining = 0

    def pulse(self, cycles=3):
        self.pulses_remaining = cycles * len(FRAMES)
        if self.animation_timer is None:
            self.animation_timer = self.set_interval(0.1, self.advance_frame)

    def advance_frame(self) -> None:
        if self.pulses_remaining > 0:
            self.frame_index = (self.frame_index + 1) % len(FRAMES)
            self.pulses_remaining -= 1
        else:
            self.frame_index = 0
            if self.animation_timer:
                self.animation_timer.stop()
                self.animation_timer = None

    def watch_frame_index(self, index: int) -> None:
        self.update(FRAMES[index])
