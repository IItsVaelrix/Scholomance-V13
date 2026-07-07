from textual.widgets import Static
from textual.app import ComposeResult
from textual.containers import Vertical
from tui.ui.widgets.glyph import AnimatedGlyph
from tui.ui.sigils import title, STATE

def _row(label: str, value: str, color: str, dot: str = STATE) -> str:
    return f"[#8B5CF6]{label:<8}[/] [{color}]{dot}[/] [#E2E8F0]{value}[/]"

class Inspector(Static):
    def on_mount(self) -> None:
        self.border_title = title("INTEL INSPECTOR")
        self._update_periodic()

    def _update_periodic(self):
        app = self.app
        health = getattr(app, "health", None)
        archive = getattr(app, "archive", None)

        health_status = "#FF5C7A"
        health_text = "OFFLINE"
        if health and health.available:
            health_status = "#7CFF8B"
            health_text = f"ONLINE ({health.signal_count})"

        archive_status = "#FF5C7A"
        archive_text = "OFFLINE"
        if archive and archive.available:
            archive_status = "#7CFF8B"
            archive_text = f"{archive.files_count} files"

        c = getattr(app, "cleri", None)
        cleri_status = "#FF5C7A"
        cleri_text = "OFF"
        if c and c.available:
            cleri_status = "#7CFF8B"
            cleri_text = "ON"

        memory = self.query_one("#insp-memory")
        memory.update(_row("Memory", "OK", "#7CFF8B"))
        health_w = self.query_one("#insp-health")
        health_w.update(_row("Health", health_text, health_status))
        archive_w = self.query_one("#insp-archive")
        archive_w.update(_row("Archive", archive_text, archive_status))
        cleri_w = self.query_one("#insp-cleri")
        cleri_w.update(_row("RAID", cleri_text, cleri_status))

        prompt = getattr(app, "prompt", None)
        prompt_text = prompt.active_model if prompt else "N/A"
        prompt_color = "#B388FF"
        prompt_w = self.query_one("#insp-prompt")
        prompt_w.update(_row("Model", prompt_text[:18], prompt_color))

        self.set_timer(5.0, self._update_periodic)

    def compose(self) -> ComposeResult:
        yield Vertical(
            Static(_row("Memory", "OK",          "#7CFF8B"),       id="insp-memory"),
            Static(_row("Health", "SCANNING",    "#FFD700"),       id="insp-health"),
            Static(_row("Archive","SCANNING",    "#FFD700"),       id="insp-archive"),
            Static(_row("RAID",   "SCANNING",    "#FFD700"),       id="insp-cleri"),
            Static(_row("Model",  "big-pickle",  "#B388FF"),       id="insp-prompt"),
            Static(_row("Engine", "DivTube-V1",  "#B388FF"),       id="insp-engine"),
            Static(_row("Tokens", "N/A",         "#6A5A6A", "─"),  id="insp-tokens"),
            AnimatedGlyph(id="activity-glyph", classes="glyph-container"),
            classes="inspector-box"
        )
