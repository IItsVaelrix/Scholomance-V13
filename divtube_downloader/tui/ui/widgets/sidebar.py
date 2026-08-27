"""Command sidebar — data-driven, filterable, fully tooltip-documented.

Design contract (Professional UI Architect, Laws 1/2/5):
  * SECTIONS is the data model: heading -> ordered command list. Every button,
    heading count, and tooltip is DERIVED from it — nothing hand-rendered.
  * COMMAND_HINTS carries one truthful line per command (the tooltip text).
  * Colours resolve through theme.palette() — no raw hex in this file.
  * Keyboard-first: Tab reaches every command; the filter input narrows the
    list live (case-insensitive substring) and Escape clears it.
"""

import re

from textual.widgets import Static, Button, Input
from textual.binding import Binding
from textual.app import ComposeResult
from textual.containers import VerticalScroll

from tui.ui.sigils import title
from tui.ui.theme import palette

SECTIONS = [
    ("AGENT", ["/prompt", "/analyze", "/download", "/critique", "/apply-patch", "/thumbnail", "/scholomance", "/model",
               "/vaelrix", "/prompt-model", "/prompt-clear"]),
    ("PRODUCTION", ["/forge", "/divtube", "/deploy", "/polish", "/intel", "/niche"]),
    ("EDITING", ["/code", "/copy", "/write-file", "/refactor-all", "/undo-list", "/undo-replace"]),
    ("CLERICAL RAID", ["/cleri-scan", "/cleri-diagnose", "/cleri-train", "/cleri-stats",
                       "/cleri-probe", "/cleri-query", "/cleri-ingest", "/cleri-cluster",
                       "/cleri-dupes", "/cleri-maint", "/cleri-feedback", "/cleri-rebuild"]),
    ("COLLAB", ["/collab-status", "/collab-forcefield", "/collab-brains", "/collab-brain",
                "/collab-genes", "/collab-tasks", "/collab-task", "/collab-agents",
                "/collab-locks", "/collab-grep", "/collab-feedback", "/collab-knowledge"]),
    ("ARCHIVE", ["/archive", "/archive-search", "/archive-neighbors", "/archive-status"]),
    ("HEALTH", ["/health", "/health-emit", "/health-verify"]),
    ("TURBOQUANT", ["/register-golden", "/list-curves", "/delete-curve", "/score-title",
                    "/rate-title", "/test-titles", "/analyze-gaps", "/search-similar",
                    "/export-pack", "/import-pack", "/registry"]),
    ("DEV & OPS", ["/lint", "/test", "/typecheck", "/health-status", "/log",
                   "/daemon-start", "/daemon-stop"]),
    ("SESSION", ["/remote-status", "/remote-pair", "/remote-revoke", "/provider", "/apikey", "/budget", "/release", "/gate-status", "/help", "/memory", "/clear", "/exit"]),
]

# Registered commands that deliberately have NO button: true aliases whose
# canonical command carries the button. Pinned by test_sidebar_command_parity:
# alias and canonical must share the same handler in app.py, and the
# canonical must be visible.
EXEMPT_ALIASES: dict[str, str] = {
    "/cleri": "/cleri-scan",           # same handle_cleri_scan handler
    "/archive-files": "/archive",      # same handle_archive_files handler
}

# One truthful line per command — surfaced as the button tooltip so the user
# never has to run /help to know what a button does. Missing key = generic hint.
COMMAND_HINTS = {
    "/remote-status": "Show companion listener and pairing status",
    "/remote-pair": "Create a one-use 10-minute pairing QR",
    "/remote-revoke": "Revoke a paired device — /remote-revoke <device-id>",
    "/prompt": "Compose or edit the agent prompt",
    "/analyze": "Analyze code or a file",
    "/download": "Download media — /download <url> [--audio]",
    "/critique": "Run the content critic on a draft",
    "/apply-patch": "Apply a search/replace patch to a file",
    "/thumbnail": "Analyze or critique a thumbnail",
    "/scholomance": "Query the Scholomance encyclopedia",
    "/model": "Choose the active model",
    "/vaelrix": "Ask Vaelrix (SteamDeck brain)",
    "/prompt-model": "Set the AI model",
    "/prompt-clear": "Clear conversation history",
    "/forge": "Open the Video Forge editor",
    "/divtube": "Return to DivTube home",
    "/deploy": "Deploy app (npm run deploy)",
    "/polish": "Run production polish script",
    "/intel": "Full YouTube intel report — /intel <url>",
    "/niche": "Niche registry: list/show/import/export",
    "/code": "View code in the editor — /code <path>",
    "/copy": "Copy active chat log to clipboard",
    "/write-file": "Create or overwrite a file",
    "/refactor-all": "Batch search/replace across files",
    "/undo-list": "List pending undos",
    "/undo-replace": "Roll back last write — /undo-replace [id]",
    "/delete-curve": "Delete a Golden Curve",
    "/rate-title": 'Rate title (curve-free SEO) — /rate-title "Title"',
    "/export-pack": "Export curves to a .goldenpack",
    "/import-pack": "Import curves from a .goldenpack",
    "/registry": "Inspect TurboQuant registry",
    "/lint": "Run Ruff (Python Linter)",
    "/test": "Run Pytest",
    "/typecheck": "Run Mypy",
    "/health-status": "Show health signal stats",
    "/log": "Live tail of app/error logs",
    "/daemon-start": "Start brain daemon for persistent queries",
    "/daemon-stop": "Stop brain daemon",
    "/cleri-scan": "Scan sources for pathogens",
    "/cleri-diagnose": "Diagnose a symptom set",
    "/cleri-train": "Train the registry on new evidence",
    "/cleri-stats": "Show registry statistics",
    "/cleri-probe": "Hypothesis-driven probe",
    "/cleri-query": "Query the RAID archive",
    "/cleri-ingest": "Ingest documents into the registry",
    "/cleri-cluster": "Cluster archived entries",
    "/cleri-dupes": "Find duplicate entries",
    "/cleri-maint": "Run a maintenance pass",
    "/cleri-feedback": "Record feedback",
    "/cleri-rebuild": "Rebuild the registry index",
    "/collab-status": "Collab server status",
    "/collab-forcefield": "Show the collab forcefield",
    "/collab-brains": "List collab brains",
    "/collab-brain": "Inspect one collab brain",
    "/collab-genes": "List collab genes",
    "/collab-tasks": "List collab tasks",
    "/collab-task": "Inspect one collab task",
    "/collab-agents": "List registered agents",
    "/collab-locks": "Show held collab locks",
    "/collab-grep": "Search collab knowledge",
    "/collab-feedback": "Collab feedback ledger",
    "/collab-knowledge": "Browse collab knowledge",
    "/archive": "Open the archive browser",
    "/archive-search": "Search archive by path or content",
    "/archive-neighbors": "Find files near a path",
    "/archive-status": "Archive health and counts",
    "/health": "BytecodeHealth status",
    "/health-emit": "Emit a PB-OK-v1 green-path signal",
    "/health-verify": "100-iteration determinism verification",
    "/register-golden": "Register a golden curve",
    "/list-curves": "List registered curves",
    "/score-title": "Score a title against curves",
    "/test-titles": "Batch-test titles",
    "/analyze-gaps": "Find coverage gaps",
    "/search-similar": "Search similar entries",
    "/provider": "Set the LLM provider",
    "/apikey": "Store an API key",
    "/budget": "Set the spend budget — /budget <usd>",
    "/release": "Release held session state",
    "/gate-status": "Show tool-gate block counts — /gate-status [reset]",
    "/help": "Show command help",
    "/memory": "Inspect persistent memory",
    "/clear": "Clear the chat log",
    "/exit": "Quit the cockpit",
}

_ALL_CMD_COUNT = sum(len(cmds) for _, cmds in SECTIONS)


def _slug(text: str) -> str:
    """Reduce arbitrary text to a Textual-legal id fragment.

    Textual ids admit only letters, digits, underscores and hyphens. A heading
    like "DEV & OPS" would otherwise raise BadIdentifier during compose and take
    the entire cockpit down — a section title is user-facing prose and must never
    be load-bearing for widget identity. Runs of illegal characters collapse to a
    single hyphen so "DEV & OPS" and "DEV  OPS" do not collide silently.
    """
    slug = re.sub(r"[^a-z0-9_]+", "-", text.lower()).strip("-")
    return slug or "x"


def _btn_id(cmd: str) -> str:
    """Deterministic widget id per command: /cleri-scan -> cmd-cleri-scan."""
    return "cmd-" + _slug(cmd.lstrip("/"))


def _heading_id(heading: str) -> str:
    return "sb-head-" + _slug(heading)


class SidebarFilter(Input):
    """Filter box for the command list. Escape clears the filter and blurs."""

    BINDINGS = [
        Binding("escape", "clear_filter", "Clear filter", show=False, priority=True),
    ]

    def action_clear_filter(self) -> None:
        self.value = ""
        self.app.set_focus(None)


class Sidebar(Static):
    def on_mount(self) -> None:
        self.border_title = title("COMMANDS")
        # Index the composed tree once so filtering is O(buttons), not O(query).
        self._headings: dict[str, Static] = {}
        self._section_buttons: dict[str, list[Button]] = {}
        for heading, _ in SECTIONS:
            self._headings[heading] = self.query_one("#" + _heading_id(heading))
            self._section_buttons[heading] = []
        for btn in self.query(".sidebar-button"):
            for heading, cmds in SECTIONS:
                if str(btn.label) in cmds:
                    self._section_buttons[heading].append(btn)
                    break
        self._no_match = self.query_one("#sidebar-no-match")

    def compose(self) -> ComposeResult:
        p = palette(getattr(self.app, "THEME_NAME", None))
        with VerticalScroll(classes="sidebar-box"):
            yield SidebarFilter(placeholder="▸ filter…", id="sidebar-filter")
            for heading, cmds in SECTIONS:
                # Heading carries a dim count — real info (group size), not decor,
                # and the blank-line rhythm above it (CSS margin) groups the list.
                yield Static(
                    f"[bold {p['accent_secondary']}]{heading}[/]"
                    f"  [{p['muted']}]{len(cmds)}[/]",
                    classes="sidebar-heading",
                    id=_heading_id(heading),
                )
                for c in cmds:
                    yield Button(
                        c,
                        variant="default",
                        classes="sidebar-button",
                        id=_btn_id(c),
                        tooltip=COMMAND_HINTS.get(c, f"Run {c}"),
                    )
            yield Static(
                f"[{p['muted']}]no command matches — Esc clears[/]",
                id="sidebar-no-match",
            )

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id != "sidebar-filter":
            return
        needle = event.value.strip().lower()
        any_visible = False
        for heading, _cmds in SECTIONS:
            visible = 0
            for btn in self._section_buttons[heading]:
                show = (not needle) or (needle in str(btn.label).lower())
                btn.display = show
                if show:
                    visible += 1
            self._headings[heading].display = visible > 0
            any_visible = any_visible or visible > 0
        self._no_match.display = bool(needle) and not any_visible

    def on_button_pressed(self, event: Button.Pressed) -> None:
        # Auto-fill the command input in the app
        cmd_input = self.app.query_one("#command-input")
        cmd_input.value = str(event.button.label) + " "
        cmd_input.focus()
