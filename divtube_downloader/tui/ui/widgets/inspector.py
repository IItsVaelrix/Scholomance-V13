"""Intel Inspector — service health + session identity, palette-driven.

Rows are grouped into two labelled tiers so the eye separates *what is
running* (SERVICES) from *what am I talking to* (SESSION). Every colour
resolves through theme.palette(); state is carried by the status DOT plus
its word (never colour alone).
"""

from textual.widgets import Static
from textual.app import ComposeResult
from textual.containers import Vertical

from tui.ui.widgets.glyph import AnimatedGlyph
from tui.ui.sigils import title
from tui.ui.theme import palette

# Semantic roles, never raw hex. Each maps to a palette key.
_ROLE_KEYS = {
    "ok": "success",
    "err": "error",
    "warn": "warning",
    "info": "accent_secondary",
    "dim": "muted",
    "bright": "text_bright",
    "label": "accent_secondary",
}


def _row(p: dict, label: str, value: str, role: str, dot: str = "●") -> str:
    color = p[_ROLE_KEYS.get(role, "text_primary")]
    return (
        f"[{p[_ROLE_KEYS['label']]}]{label:<8}[/]"
        f" [{color}]{dot}[/]"
        f" [{p['text_bright']}]{value}[/]"
    )


def _caption(p: dict, text: str) -> str:
    return f"[{p['muted']}]── {text} ─────────────[/]"


class Inspector(Static):
    def on_mount(self) -> None:
        self.border_title = title("INTEL INSPECTOR")
        self._p = palette(getattr(self.app, "THEME_NAME", None))
        self._update_periodic()

    def _update_periodic(self):
        app = self.app
        p = getattr(self, "_p", None) or palette(None)
        health = getattr(app, "health", None)
        archive = getattr(app, "archive", None)

        health_role, health_text = "err", "OFFLINE"
        if health and health.available:
            health_role, health_text = "ok", f"ONLINE ({health.signal_count})"

        archive_role, archive_text = "err", "OFFLINE"
        if archive and archive.available:
            archive_role, archive_text = "ok", f"{archive.files_count} files"

        c = getattr(app, "cleri", None)
        cleri_role, cleri_text = "err", "OFF"
        if c and c.available:
            cleri_role, cleri_text = "ok", "ON"

        prompt = getattr(app, "prompt", None)
        prompt_text = prompt.active_model if prompt else "N/A"

        self.query_one("#insp-memory").update(_row(p, "Memory", "OK", "ok"))
        self.query_one("#insp-health").update(_row(p, "Health", health_text, health_role))
        self.query_one("#insp-archive").update(_row(p, "Archive", archive_text, archive_role))
        self.query_one("#insp-cleri").update(_row(p, "RAID", cleri_text, cleri_role))
        self.query_one("#insp-prompt").update(_row(p, "Model", str(prompt_text)[:18], "info"))

        self.set_timer(5.0, self._update_periodic)

    def compose(self) -> ComposeResult:
        p = palette(getattr(self.app, "THEME_NAME", None))
        yield Vertical(
            Static(_caption(p, "SERVICES"), classes="inspector-caption"),
            Static(_row(p, "Memory", "OK", "ok"), id="insp-memory"),
            Static(_row(p, "Health", "SCANNING", "warn"), id="insp-health"),
            Static(_row(p, "Archive", "SCANNING", "warn"), id="insp-archive"),
            Static(_row(p, "RAID", "SCANNING", "warn"), id="insp-cleri"),
            Static(_caption(p, "SESSION"), classes="inspector-caption"),
            Static(_row(p, "Model", "—", "info"), id="insp-prompt"),
            Static(_row(p, "Engine", "DivTube-V1", "info"), id="insp-engine"),
            Static(_row(p, "Tokens", "N/A", "dim", "─"), id="insp-tokens"),
            AnimatedGlyph(id="activity-glyph", classes="glyph-container"),
            classes="inspector-box",
        )
