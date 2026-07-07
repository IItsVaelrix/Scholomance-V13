from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Header, Footer, RichLog, Input, Static, ProgressBar, TabbedContent, TabPane
from tui.ui.widgets.sidebar import Sidebar
from tui.ui.widgets.inspector import Inspector
from tui.ui.widgets.code_box import CodeBox
from tui.ui.widgets.scd64_radar import SCD64Radar
from tui.ui.widgets.command_area import CommandArea

def get_layout() -> ComposeResult:
    yield Header(show_clock=True)

    def _make_log(id_name, title):
        chat = RichLog(id=id_name, markup=True, wrap=True, classes="chat-log-cls")
        chat.border_title = title
        return chat

    with Horizontal():
        yield Sidebar(id="sidebar")
        with Vertical(id="center-panel"):
            with TabbedContent(id="agent-tabs"):
                with TabPane("DivTube", id="tab-divtube"):
                    yield _make_log("chat-divtube", "✦ DIVTUBE COCKPIT ✦")
                with TabPane("Mother", id="tab-mother"):
                    yield _make_log("chat-mother", "✦ MOTHER COCKPIT ✦")
                with TabPane("Pixelbrain", id="tab-pixelbrain"):
                    yield _make_log("chat-pixelbrain", "✦ PIXELBRAIN COCKPIT ✦")
                with TabPane("Vaelrix", id="tab-vaelrix"):
                    yield _make_log("chat-vaelrix", "✦ VAELRIX COCKPIT ✦")
            yield Static("", id="typewriter-box")
            yield ProgressBar(id="loading-bar", show_eta=False, total=100)
            yield CommandArea(placeholder="▸ command (/help) or paste a URL…", id="command-input")
        
        with Vertical(id="right-panel"):
            yield Inspector(id="inspector")
            yield SCD64Radar(id="radar")
            yield CodeBox(id="code-viewer", filename="")

    yield Footer()

