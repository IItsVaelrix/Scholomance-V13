from textual.widgets import Static, Button
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from tui.ui.widgets.glyph import AnimatedGlyph

SECTIONS = [
    ("AGENT", ["/prompt", "/analyze", "/download", "/critique", "/apply-patch", "/thumbnail", "/scholomance", "/model"]),
    ("CLERICAL RAID", ["/cleri-scan", "/cleri-diagnose", "/cleri-train", "/cleri-stats",
                       "/cleri-probe", "/cleri-query", "/cleri-ingest", "/cleri-cluster",
                       "/cleri-dupes", "/cleri-maint", "/cleri-feedback", "/cleri-rebuild"]),
    ("ARCHIVE", ["/archive", "/archive-search", "/archive-neighbors", "/archive-status"]),
    ("HEALTH", ["/health", "/health-emit", "/health-verify"]),
    ("TURBOQUANT", ["/register-golden", "/list-curves", "/score-title", "/test-titles",
                    "/analyze-gaps", "/search-similar"]),
    ("SESSION", ["/provider", "/apikey", "/release", "/help", "/memory", "/clear", "/exit"]),
]

class Sidebar(Static):
    def on_mount(self) -> None:
        self.border_title = "❖ COMMANDS ❖"

    def compose(self) -> ComposeResult:
        with VerticalScroll(classes="sidebar-box"):
            for heading, cmds in SECTIONS:
                yield Static(f"[#8B5CF6]{heading}[/]", classes="sidebar-heading")
                for c in cmds:
                    yield Button(c, variant="primary", classes="sidebar-button")
            yield AnimatedGlyph(classes="glyph-container")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        # Auto-fill the command input in the app
        cmd_input = self.app.query_one("#command-input")
        cmd_input.value = str(event.button.label) + " "
        cmd_input.focus()
