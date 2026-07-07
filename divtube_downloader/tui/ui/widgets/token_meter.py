"""AetherMeter — the cockpit's spend gauge.

Renders the running token/credit reserve as a rune-bar that bleeds from arcane
violet (full) through gold (caution) to blood crimson (critical).

Under Disciplined Grimoire the BORDER stays quiet (muted $panel-border) while
the reserve is healthy and only lights up — gold, then crimson — as credits
actually drain. A full reserve shouldn't shout; the panel "wounds" only when it
matters. Colours come from theme.py (the active app theme), never hardcoded.
"""

from textual.widgets import Static

from tui.services.token_meter import meter
from tui.ui.theme import THEMES
from tui.ui.sigils import title

_BAR_WIDTH = 18
_FILLED = "▰"
_EMPTY = "▱"


def _palette(widget):
    """The active app palette, falling back to obsidian_crimson off-app."""
    name = getattr(widget.app, "THEME_NAME", "obsidian_crimson")
    return THEMES.get(name, THEMES["obsidian_crimson"])


def _bar_color(ratio, p):
    """Rune-bar fill: identity violet when healthy, alarm hues as it drains."""
    if ratio > 0.5:
        return p["accent_secondary"]
    if ratio > 0.2:
        return p["highlight"]
    return p["accent_primary"]


def _fmt_tokens(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


class AetherMeter(Static):
    def on_mount(self):
        self.border_title = title("AETHER RESERVE")
        meter.on_update = lambda: self.app.call_from_thread(self.refresh_meter)
        self.refresh_meter()

    def refresh_meter(self):
        p = _palette(self)
        muted, dim, text = p["muted"], p["text_secondary"], p["text_bright"]
        gold, crimson = p["highlight"], p["accent_primary"]

        s = meter.snapshot()
        ratio = s["ratio"]
        color = _bar_color(ratio, p)

        # Border rests muted while healthy; only the wound (gold→crimson) shows.
        border_color = p["panel_border"] if ratio > 0.5 else color
        self.styles.border = ("round", border_color)
        self.styles.border_title_color = text if ratio <= 0.5 else dim

        filled = round(ratio * _BAR_WIDTH)
        bar = (f"[{color}]{_FILLED * filled}[/]"
               f"[{muted}]{_EMPTY * (_BAR_WIDTH - filled)}[/]")
        pct = f"{ratio * 100:.0f}%"

        if s["budget"] <= 0:
            head = f"[{dim}]no budget set — [/][{muted}]/budget <usd>[/]"
        elif s["remaining"] <= 0:
            head = f"[bold {crimson}]⚠ RESERVE DEPLETED[/] [{muted}]of ${s['budget']:.0f}[/]"
        else:
            head = (f"[{muted}]≈[/] [bold {color}]${s['remaining']:.2f}[/] "
                    f"[{muted}]left of ${s['budget']:.2f}[/]")

        model = s["model"] or "—"
        if len(model) > 20:
            model = model[:19] + "…"
        burn = (f"[{muted}]≈${s['avg_cost']:.3f}/call[/]"
                if s["calls"] else f"[{muted}]idle[/]")

        self.update(
            f"{head}\n"
            f"{bar} [bold {color}]{pct}[/]\n"
            f"[{gold}]◆[/] [{text}]{_fmt_tokens(s['tokens'])}[/] [{muted}]tok[/] "
            f"[{muted}]·[/] [{text}]{s['calls']}[/] [{muted}]calls[/]\n"
            f"[{dim}]{model}[/] [{muted}]·[/] {burn}"
        )
