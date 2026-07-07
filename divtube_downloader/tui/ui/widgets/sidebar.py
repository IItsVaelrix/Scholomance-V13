from textual.widgets import Static, Button
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from tui.ui.sigils import title

SECTIONS = [
    ("AGENT", ["/prompt", "/analyze", "/download", "/critique", "/apply-patch", "/thumbnail", "/scholomance", "/model"]),
    ("CLERICAL RAID", ["/cleri-scan", "/cleri-diagnose", "/cleri-train", "/cleri-stats",
                       "/cleri-probe", "/cleri-query", "/cleri-ingest", "/cleri-cluster",
                       "/cleri-dupes", "/cleri-maint", "/cleri-feedback", "/cleri-rebuild"]),
    ("ARCHIVE", ["/archive", "/archive-search", "/archive-neighbors", "/archive-status"]),
    ("HEALTH", ["/health", "/health-emit", "/health-verify"]),
    ("TURBOQUANT", ["/register-golden", "/list-curves", "/score-title", "/test-titles",
                    "/analyze-gaps", "/search-similar"]),
    ("SESSION", ["/provider", "/apikey", "/budget", "/release", "/help", "/memory", "/clear", "/exit"]),
]

class Sidebar(Static):
    def on_mount(self) -> None:
        self.border_title = title("COMMANDS")

    def compose(self) -> ComposeResult:
        with VerticalScroll(classes="sidebar-box"):
            for heading, cmds in SECTIONS:
                # Heading carries a dim count — real info (group size), not decor,
                # and the blank-line rhythm above it (CSS margin) groups the list.
                yield Static(
                    f"[bold #8B5CF6]{heading}[/]  [#6A5A6A]{len(cmds)}[/]",
                    classes="sidebar-heading",
                )
                for c in cmds:
                    yield Button(c, variant="primary", classes="sidebar-button")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        # Auto-fill the command input in the app
        cmd_input = self.app.query_one("#command-input")
        cmd_input.value = str(event.button.label) + " "
        cmd_input.focus()
