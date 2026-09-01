"""VideoForge screen.

All colours resolve through theme.py — markup via theme.palette(), CSS via
the app's $tokens (get_css_variables) — so this surface follows a theme
switch instead of staying pinned to one palette.
"""

from textual.app import ComposeResult
from textual.screen import Screen
from textual.containers import Horizontal, Vertical
from textual.widgets import Static, Header, Footer, Input
from rich.text import Text
from rich.style import Style
import shlex

from tui.ui.theme import palette
from tui.ui.widgets.timeline_widget import TimelineWidget
from tui.ui.widgets.media_bin_widget import MediaBinWidget
from tui.ui.widgets.render_meter_widget import RenderMeterWidget

_FORGE_COMMANDS = [
    ("new", "Create new project"),
    ("import", "Import media into bin"),
    ("timeline", "Show timeline"),
    ("trim", "Trim clip in/out"),
    ("split", "Split clip at time"),
    ("delete", "Remove clip from timeline"),
    ("transition", "Add transition between clips"),
    ("effect", "Apply effect to clip"),
    ("export", "Render project to file"),
    ("presets", "List export presets"),
    ("effects", "List available effects"),
    ("transitions", "List available transitions"),
    ("recipe", "Dump full project JSON"),
    ("apply", "Load modified recipe file"),
    ("ledger", "Show render history"),
    ("add-title", "Add title card"),
    ("add-caption", "Add caption overlay"),
    ("add-credit", "Add credit card"),
    ("snapshot", "Save project snapshot"),
    ("freeze", "Freeze frame"),
    ("music", "Add background music"),
    ("narration", "Add narration track"),
    ("mute", "Mute track"),
    ("detach-audio", "Detach audio from clip"),
    ("duplicate", "Duplicate clip"),
    ("move", "Move clip on timeline"),
    ("list", "List saved projects"),
    ("open", "Open saved project"),
    ("project", "Show current project info"),
]


def _forge_help_markup(p) -> str:
    """Command help, coloured from the active palette rather than baked in."""
    head = f"[{p['accent_tertiary']}]FORGE COMMANDS[/]"
    rows = [
        f"  [{p['highlight']}]{name}[/]{' ' * max(1, 16 - len(name))}{desc}"
        for name, desc in _FORGE_COMMANDS
    ]
    return "\n".join([head, *rows])


class VideoForgeScreen(Screen):
    # $tokens resolve from the app's active theme via get_css_variables —
    # theme.py stays the single source of truth for this screen's chrome too.
    CSS = '''
    #forge-left {
        width: 2fr;
    }
    #forge-right {
        width: 3fr;
    }
    #forge-terminal-input {
        dock: bottom;
        border: round $accent-primary;
        background: $background;
        color: $highlight;
        text-style: bold;
        margin-top: 1;
        height: 3;
    }
    #forge-terminal-input:focus {
        border: round $highlight;
    }
    #forge-command-list {
        height: 10;
        border: round $accent-secondary;
        background: $surface;
        padding: 0 1;
        margin-top: 1;
        overflow-y: auto;
    }
    '''

    BINDINGS = [
        ("escape", "go_back", "Back to DivTube"),
        ("d", "go_back", "DivTube"),
    ]

    def __init__(self, service, log_fn):
        super().__init__()
        self._service = service
        self._log_fn = log_fn

    @property
    def _p(self):
        return palette(getattr(self.app, "THEME_NAME", None))

    def action_go_back(self):
        self.dismiss()

    def compose(self) -> ComposeResult:
        yield Header()
        yield Horizontal(
            Vertical(
                Static("", id="forge-title"),
                Static("", id="forge-project-info"),
                Static("", id="forge-media-label"),
                MediaBinWidget(id="forge-media-bin"),
                Input(placeholder="▸ forge command…", id="forge-terminal-input"),
                id="forge-left",
            ),
            Vertical(
                Static("", id="forge-timeline-label"),
                TimelineWidget(id="forge-timeline"),
                Static("", id="forge-render-label"),
                RenderMeterWidget(id="forge-render-meter"),
                Static("", id="forge-command-list"),
                id="forge-right",
            ),
        )
        yield Footer()

    def on_mount(self):
        p = self._p
        section = Style(color=p["accent_tertiary"], bold=True)
        self.query_one("#forge-title", Static).update(
            Text("✦  V I D E O   F O R G E  ✦", style=Style(color=p["highlight"], bold=True))
        )
        self.query_one("#forge-media-label", Static).update(
            Text("\n📦 MEDIA BIN", style=section)
        )
        self.query_one("#forge-timeline-label", Static).update(
            Text("\n⏱ TIMELINE", style=section)
        )
        self.query_one("#forge-render-label", Static).update(
            Text("\n⚡ RENDER", style=section)
        )
        self.query_one("#forge-command-list", Static).update(
            Text.from_markup(_forge_help_markup(p))
        )
        self.refresh_display()

    def on_input_submitted(self, event):
        val = event.value.strip()
        event.input.value = ""
        if not val:
            return

        self._output_buffer = []

        try:
            args = shlex.split(val)
        except ValueError as e:
            error = self._p["error"]
            self._log_fn(f"[{error}]Parse error: {e}[/]")
            self._show_output(f"[{error}]Parse error: {e}[/]")
            return

        self._service.cmd_forge(args, self._show_output)

        if self._output_buffer:
            cmd_list = self.query_one("#forge-command-list", Static)
            cmd_list.update(Text.from_markup("\n".join(self._output_buffer)))

        self.refresh_display()

    def _show_output(self, msg):
        if not hasattr(self, '_output_buffer'):
            self._output_buffer = []
        self._output_buffer.append(str(msg))

    def refresh_display(self):
        p = self._p
        proj = self._service.current_project
        if proj is None:
            self.query_one("#forge-project-info", Static).update(
                Text("No project loaded. Use /forge new or /forge open",
                     style=Style(color=p["warning"]))
            )
            self.query_one("#forge-media-bin", MediaBinWidget).update_media([])
            self.query_one("#forge-timeline", TimelineWidget).update_clips([], [])
            return

        self.query_one("#forge-project-info", Static).update(
            Text(f"Project: {proj.project_name}  |  "
                 f"{len(proj.timeline)} clips  |  "
                 f"{len(proj.media_bin)} media files  |  "
                 f"{len(proj.audio_tracks)} audio tracks",
                 style=Style(color=p["muted"]))
        )

        media_list = []
        for m in proj.media_bin.values():
            media_list.append({
                "mediaId": m.media_id, "label": m.label, "fileType": m.file_type,
                "width": m.width, "height": m.height, "durationSecs": m.duration_secs,
                "fps": m.fps, "audioChannels": m.audio_channels,
            })
        self.query_one("#forge-media-bin", MediaBinWidget).update_media(media_list)

        clip_list = []
        for c in sorted(proj.timeline, key=lambda x: (x.timeline_index, x.track_index)):
            media = proj.media_bin.get(c.media_id)
            clip_list.append({
                "clipId": c.clip_id, "label": media.label if media else c.media_id,
                "startTime": c.start_time, "endTime": c.end_time,
                "trackIndex": c.track_index,
            })
        trans_list = [{
            "fromClipId": t.from_clip_id, "toClipId": t.to_clip_id,
            "transitionType": t.transition_type, "durationSecs": t.duration_secs,
        } for t in proj.transitions]
        self.query_one("#forge-timeline", TimelineWidget).update_clips(clip_list, trans_list)
