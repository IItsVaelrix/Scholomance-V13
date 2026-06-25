from textual.app import App
from textual.screen import ModalScreen
from textual.theme import Theme
from textual.widgets import OptionList
from textual.widgets.option_list import Option
from textual.containers import Vertical
from textual.widgets import Static, Input, TextArea
from textual import events, on
from rich.text import Text
from rich.markup import escape as _escape_markup
from rich.errors import MarkupError
import threading
import os
import asyncio

from tui.ui.layout import get_layout
from tui.core.command_parser import CommandRegistry
from tui.ui.widgets.command_area import CommandSubmitted
from tui.services.agent_service import AgentService
from tui.services.memory_service import MemoryService
from tui.services.export_service import ExportService
from tui.services.config_service import ConfigService
from tui.services.content_critic_service import ContentCriticService
from tui.services.turboquant_service import TurboQuantService
from tui.services.video_forge_service import VideoForgeService
from tui.services.cleri_bridge import CleriBridge
from tui.services.bytecode_bridge import BytecodeHealthBridge
from tui.services.archive_bridge import ArchiveBridge
from tui.services.prompt_service import PromptService
from tui.services.scd64_service import scd64_service
from tui.services.substrate_osmosis_service import SubstrateOsmosisService
from tui.services.env_config import write_key, set_active_key, set_provider, get_active_provider
from tui.screens.video_forge_screen import VideoForgeScreen
from tui.widgets.log_tail_widget import LogTailWidget
from tui.widgets.registry_inspector_widget import RegistryInspectorWidget

# ── Scholomance palette ──────────────────────────────────────────────
# Obsidian · Purple · Crimson
BACKGROUND = "#0D0D0D"   # obsidian black
SURFACE    = "#161616"   # obsidian surface
PANEL      = "#1C1818"   # obsidian panel (crimson warmth)
CRIMSON    = "#DC143C"   # primary accent
GOLD       = "#FFD700"   # highlight
PURPLE     = "#8B5CF6"   # secondary accent (royal purple)
PURPLE_LT  = "#B388FF"   # light purple
SUCCESS    = "#7CFF8B"
WARNING    = "#FFD166"
ERROR      = "#FF5C7A"
MUTED      = "#6A5A6A"   # muted purple-gray
FOREGROUND = "#E2E8F0"


EXT_LANG = {
    ".py": "python", ".js": "javascript", ".ts": "typescript", ".java": "java",
    ".json": "json", ".md": "markdown", ".sh": "bash", ".yml": "yaml",
    ".yaml": "yaml", ".toml": "toml", ".gradle": "groovy", ".xml": "xml",
    ".html": "html", ".css": "css", ".sql": "sql", ".rb": "ruby",
    ".go": "go", ".rs": "rust", ".c": "c", ".cpp": "cpp", ".h": "c",
    ".mjs": "javascript", ".cjs": "javascript", ".jsx": "jsx",
    ".tsx": "tsx", ".swift": "swift", ".kt": "kotlin", ".php": "php",
    ".r": "r", ".lua": "lua", ".dart": "dart",
}

def _guess_language(filename: str) -> str:
    """Best-effort language guess from a file extension for Syntax highlighting."""
    ext = os.path.splitext(filename)[1].lower()
    return EXT_LANG.get(ext, "text")


def _copy_to_clipboard(text: str, log_fn) -> None:
    """Copy *text* to the system clipboard, falling back to a file if no tool exists."""
    import shutil
    import subprocess

    copied = False
    # Try wl-copy (Wayland / KDE / Steam Deck)
    if shutil.which("wl-copy"):
        try:
            subprocess.run(["wl-copy"], input=text, text=True, check=True, timeout=5)
            copied = True
        except Exception:
            pass
    # Try xclip (X11)
    if not copied and shutil.which("xclip"):
        try:
            subprocess.run(["xclip", "-selection", "clipboard"], input=text, text=True, check=True, timeout=5)
            copied = True
        except Exception:
            pass
    # Try xsel (X11)
    if not copied and shutil.which("xsel"):
        try:
            subprocess.run(["xsel", "--clipboard", "--input"], input=text, text=True, check=True, timeout=5)
            copied = True
        except Exception:
            pass
    # macOS pbcopy
    if not copied and shutil.which("pbcopy"):
        try:
            subprocess.run(["pbcopy"], input=text, text=True, check=True, timeout=5)
            copied = True
        except Exception:
            pass

    if copied:
        log_fn(f"[{SUCCESS}]✔ Copied {len(text)} characters to clipboard[/]")
        return

    # Fallback: write to a temp file and tell the user.
    import tempfile
    try:
        fd, path = tempfile.mkstemp(prefix="divtube-copy-", suffix=".txt")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        log_fn(f"[{WARNING}]⚠ No clipboard tool found (wl-copy/xclip/xsel/pbcopy).[/]")
        log_fn(f"[{MUTED}]  Saved copy to:[/] {path}")
    except Exception as e:
        log_fn(f"[{ERROR}]✗ Could not copy or save:[/] {e}")


SCHOLOMANCE_THEME = Theme(
    name="scholomance",
    primary=CRIMSON,
    secondary=PURPLE,
    accent=GOLD,
    foreground=FOREGROUND,
    background=BACKGROUND,
    surface=SURFACE,
    panel=PANEL,
    success=SUCCESS,
    warning=WARNING,
    error=ERROR,
    dark=True,
)

def _flags(args, value_flags):
    """Split args into (positionals, {flag: value}).

    `value_flags` is the set of flags that consume the following token as
    their value (e.g. {"--curve"}). Everything else is positional.
    """
    pos, flags = [], {}
    i = 0
    while i < len(args):
        a = args[i]
        if a in value_flags and i + 1 < len(args):
            flags[a] = args[i + 1]
            i += 2
        else:
            pos.append(a)
            i += 1
    return pos, flags
class FileSelectScreen(ModalScreen[str]):
    CSS = """
    FileSelectScreen {
        align: center middle;
        background: rgba(13, 13, 13, 0.92);
    }
    #file-select-container {
        width: 80;
        height: 25;
        border: panel #DC143C;
        background: #1C1C1C;
        padding: 1 2;
        box-sizing: border-box;
    }
    .modal-title {
        text-align: center;
        margin-bottom: 1;
        color: #B388FF;
    }
    #file-filter {
        margin-bottom: 1;
        border: panel #B81030;
        background: #0D0D0D;
        transition: border 200ms;
    }
    #file-filter:focus {
        border: panel #FF3355;
    }
    """
    IGNORE_DIRS = {"node_modules", ".git", "dist", "build", ".cache",
                   "coverage", "__pycache__", ".gradle", ".venv", "embeddings"}

    def __init__(self, archive=None):
        super().__init__()
        # When the Archive of Dominance bridge is online, @ searches the full
        # Scholomance corpus (~34K files) via server-side path matching. Only
        # fall back to the local filesystem when the archive is unavailable.
        self.archive = archive if (archive and getattr(archive, "available", False)) else None
        self._req = 0  # monotonic id so stale async results never overwrite newer ones
        self.files = []
        if self.archive:
            return
        import subprocess
        # Anchor the picker at the real project root (the git repo top), not the
        # divtube_downloader subfolder — so @ finds files anywhere in the
        # Scholomance tree, and its paths match how resolve_at_references()
        # resolves them (both share _get_project_root()).
        from tui.core.command_parser import _get_project_root
        cwd = _get_project_root()
        try:
            out = subprocess.check_output(["git", "ls-files"], text=True, cwd=cwd)
            self.files = [f for f in out.splitlines() if f.strip()]
        except Exception:
            self.files = []
        # Fall back to a filesystem walk when git lists nothing (e.g. the
        # project is untracked) so the picker still populates.
        if not self.files:
            self.files = self._walk_files(cwd)

    @classmethod
    def _walk_files(cls, root):
        import os
        found = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames
                           if d not in cls.IGNORE_DIRS and not d.startswith(".")]
            for name in filenames:
                if name.startswith("."):
                    continue
                rel = os.path.relpath(os.path.join(dirpath, name), root)
                found.append(rel)
                if len(found) >= 5000:
                    return sorted(found)
        return sorted(found)

    def compose(self):
        from textual.widgets.option_list import Option
        if self.archive:
            title = "❖ ARCHIVE OF DOMINANCE (@) ❖"
            placeholder = "Type to search the archive…"
            options = []
        else:
            title = "❖ FIND FILE (@) ❖"
            placeholder = "Type to filter…"
            options = [Option(f) for f in self.files[:100]]
        yield Vertical(
            Static(f"[bold #DC143C]{title}[/]", classes="modal-title"),
            Input(placeholder=placeholder, id="file-filter"),
            OptionList(*options, id="file-list"),
            id="file-select-container"
        )

    def on_mount(self):
        self.query_one("#file-filter").focus()

    @on(Input.Changed, "#file-filter")
    def filter_files(self, event):
        if self.archive:
            self._search_archive(event.value)
        else:
            self._filter_local(event.value)

    def _filter_local(self, query):
        from textual.widgets.option_list import Option
        val = query.lower()
        matched = [f for f in self.files if val in f.lower()][:100]
        olist = self.query_one("#file-list")
        olist.clear_options()
        for f in matched:
            olist.add_option(Option(f))

    def _search_archive(self, query):
        """Query the Archive of Dominance off the UI thread; apply only the
        latest result so fast typing never flashes stale matches."""
        import threading
        olist = self.query_one("#file-list")
        q = query.strip()
        self._req += 1
        req = self._req
        if len(q) < 2:
            olist.clear_options()
            return

        def run():
            paths = self.archive.search_paths(q, limit=100)
            self.app.call_from_thread(self._apply_archive_results, req, paths)

        threading.Thread(target=run, daemon=True).start()

    def _apply_archive_results(self, req, paths):
        from textual.widgets.option_list import Option
        if req != self._req:
            return  # a newer query superseded this one
        olist = self.query_one("#file-list")
        olist.clear_options()
        for p in paths:
            olist.add_option(Option(p))

    @on(OptionList.OptionSelected, "#file-list")
    def file_selected(self, event):
        self.dismiss(str(event.option.prompt))

    @on(Input.Submitted, "#file-filter")
    def filter_submitted(self, event):
        olist = self.query_one("#file-list")
        if olist.highlighted is not None and olist.highlighted < olist.option_count:
            self.dismiss(str(olist.get_option_at_index(olist.highlighted).prompt))
        elif olist.option_count > 0:
            self.dismiss(str(olist.get_option_at_index(0).prompt))
        event.prevent_default()

    @on(events.Key)
    def on_modal_key(self, event):
        if event.key == "escape":
            self.dismiss(None)
        elif event.key == "down" and self.query_one("#file-filter").has_focus:
            self.query_one("#file-list").focus()
            event.prevent_default()
        elif event.key == "up" and self.query_one("#file-list").has_focus:
            olist = self.query_one("#file-list")
            if olist.highlighted == 0:
                self.query_one("#file-filter").focus()
                event.prevent_default()

class WidgetModalScreen(ModalScreen):
    """Host an arbitrary widget inside a dismissable modal.

    LogTailWidget / RegistryInspectorWidget are plain widgets, not Screens, so
    they cannot be handed straight to push_screen(). This wraps one in a screen
    so it can be pushed, and dismisses on Escape.
    """

    CSS = """
    WidgetModalScreen {
        align: center middle;
        background: rgba(13, 13, 13, 0.92);
    }
    #widget-modal-container {
        width: 90%;
        height: 90%;
        border: panel #DC143C;
        background: #1C1C1C;
        padding: 1 2;
        box-sizing: border-box;
    }
    .modal-title {
        text-align: center;
        margin-bottom: 1;
        color: #B388FF;
    }
    """

    def __init__(self, widget, title: str = ""):
        super().__init__()
        self._widget = widget
        self._title = title

    def compose(self):
        children = []
        if self._title:
            children.append(Static(f"[bold #DC143C]{self._title}[/]", classes="modal-title"))
        children.append(self._widget)
        yield Vertical(*children, id="widget-modal-container")

    @on(events.Key)
    def _on_modal_key(self, event):
        if event.key == "escape":
            self.dismiss(None)


class ModelSelectScreen(ModalScreen[str]):
    def __init__(self, free_models, paid_models):
        super().__init__()
        self.free_models = free_models
        self.paid_models = paid_models

    def compose(self):
        options = []
        if self.free_models:
            options.append(Option("=== 🟢 FREE MODELS ===", disabled=True))
            for m in self.free_models:
                options.append(Option(m))
                
        if self.paid_models:
            options.append(Option("=== 💎 PAID MODELS ===", disabled=True))
            for m in self.paid_models:
                options.append(Option(m))
                
        yield Vertical(
            Static("[bold #FFD700]❖ SELECT ACTIVE MODEL ❖[/]\n", id="model-title"),
            OptionList(*options, id="model-options"),
            id="model-dialog"
        )
        
    def on_mount(self):
        self.query_one("#model-options").focus()

    def on_option_list_option_selected(self, event):
        val = str(event.option.prompt)
        if not val.startswith("==="):
            self.dismiss(val)

class DivTubeAgentApp(App):
    CSS = '''
    Screen { 
        background: #0D0D0D; 
    }

    Header { 
        background: #1C1C1C; 
        color: #F8FAFC; 
        text-style: bold; 
        padding: 0 1;
    }
    HeaderTitle { 
        color: #B388FF; 
        text-style: bold; 
    }
    Footer { 
        background: #1C1C1C; 
    }
    FooterKey { 
        background: #1C1C1C; 
        color: #9B8A9B;
        transition: background 200ms, color 200ms;
    }
    FooterKey > .footer-key--key { 
        color: #0D0D0D; 
        background: #B388FF; 
        text-style: bold; 
    }
    FooterKey > .footer-key--description { 
        color: #C0B0C0; 
    }
    FooterKey:hover { 
        background: #2D181E; 
        color: #F8FAFC;
    }

    #sidebar {
        width: 32;
        background: #1C1C1C;
        border: panel #8B5CF6;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 1 1;
        margin: 1 0 1 1;
    }
    #aether-meter {
        height: 6;
        background: #1C1C1C;
        border: panel #B388FF;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 0 1;
        margin: 1 1 0 0;
    }
    #inspector {
        height: 1fr;
        background: #1C1C1C;
        border: panel #DC143C;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 1 1;
        margin: 1 1 1 0;
    }
    #radar {
        height: 1fr;
        background: #0D0D0D;
        border: panel #FFD700;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 1 1;
        margin: 0 1 1 0;
        text-align: center;
        content-align: center middle;
    }
    #right-panel {
        width: 42;
        background: #0D0D0D;
    }
    #code-viewer {
        height: 1fr;
        background: #0D0D0D;
        border: panel #DC143C;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 0 1;
        margin: 1 1 1 0;
    }
    
    .sidebar-heading { 
        margin-top: 1; 
        margin-bottom: 0; 
        text-style: bold; 
        color: #8B5CF6; 
        padding-left: 1;
    }
    .sidebar-button { 
        width: 100%; 
        height: 1; 
        border: none; 
        background: transparent; 
        color: #9B8A9B; 
        content-align: left middle; 
        padding-left: 2; 
        transition: background 200ms, color 200ms;
    }
    .sidebar-button:hover { 
        background: #2D181E; 
        color: #B388FF; 
        text-style: bold; 
    }
    
    #center-panel { 
        width: 1fr; 
        background: #0D0D0D; 
        padding: 1 1; 
    }

    .chat-log-cls {
        background: #1C1C1C;
        color: #F8FAFC;
        border: panel #DC143C;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 0 1;
        scrollbar-color: #8B5CF6;
        scrollbar-color-hover: #B388FF;
        scrollbar-color-active: #B388FF;
        scrollbar-background: #0D0D0D;
        scrollbar-size-vertical: 1;
    }
    
    #typewriter-box {
        background: #1C1C1C;
        color: #F8FAFC;
        height: auto;
        min-height: 3;
        max-height: 30;
        border: panel #FFD700;
        border-title-color: #F8FAFC;
        border-title-align: center;
        padding: 0 1;
        overflow-y: scroll;
        display: none;
        margin-top: 1;
    }
    #typewriter-box.-active {
        display: block;
    }

    #command-input {
        dock: bottom;
        width: 100%;
        height: 3;
        margin: 1;
        background: #1C1C1C;
        border: tall #2D181E;
    }
    #command-input.expanded {
        height: 15;
    }
    #command-input:focus { 
        border: panel #F43F5E; 
    }

    .cmd-list { padding: 1 0 0 1; }
    .muted { color: #6A5A6A; }
    .glyph-container { 
        dock: bottom; 
        content-align: center middle; 
        padding-bottom: 1; 
        height: 9; 
        color: #8B5CF6; 
    }

    #loading-bar { display: none; height: 1; margin: 1 0; }
    #loading-bar.working > Bar > .bar--bar { color: #E11D48; }
    #loading-bar.finished > Bar > .bar--bar { color: #10B981; }
    #loading-bar.working .bar--bar { color: #E11D48; }
    #loading-bar.finished .bar--bar { color: #10B981; }

    ModelSelectScreen {
        align: center middle;
        background: rgba(13, 13, 13, 0.92);
    }
    #model-dialog {
        width: 60;
        height: 20;
        background: #1C1C1C;
        border: panel #8B5CF6;
        border-title-color: #F8FAFC;
        padding: 0;
        box-sizing: border-box;
    }
    #model-title {
        background: #2D181E;
        color: #B388FF;
        text-style: bold;
        content-align: center middle;
        width: 100%;
        padding: 1;
        border-bottom: solid #8B5CF6;
    }
    OptionList { 
        background: transparent; 
        border: none; 
        padding: 1 1; 
    }
    OptionList > .option-list--option-highlighted { 
        background: #2D181E; 
        color: #F8FAFC; 
        text-style: bold; 
    }
    '''
    
    BINDINGS = [
        ("q", "quit", "Quit"),
        ("c", "clear", "Clear"),
        ("escape", "stop_agents", "Stop"),
    ]

    def __init__(self):
        super().__init__()
        self.config = ConfigService()
        self.agent = AgentService()
        self.memory = MemoryService()
        self.exporter = ExportService()
        self.registry = CommandRegistry()
        self.critic_service = ContentCriticService()
        self.turbo = TurboQuantService()
        self.forge = VideoForgeService()
        self.cleri = CleriBridge()
        self.health = BytecodeHealthBridge()
        self.substrate = SubstrateOsmosisService(self.memory)
        self.archive = ArchiveBridge()
        self.prompt = PromptService()
        self.cmd_history = []
        self.cmd_index = 0
        # ── plain-text mirror of each chat log (for /copy) ──────────
        self._chat_text_mirror: dict[str, list[str]] = {}
        # ── agent run controller (Esc to stop) ───────────────────────
        self._agent_procs = []          # tracked killable subprocesses
        self._agent_gen = 0             # cancellation generation token
        self._agent_busy = False
        self._agent_lock = threading.Lock()
        self.setup_commands()

    async def on_mount(self):
        try:
            from tui.services.exec_session_service import get_exec_session
            get_exec_session().bind_app(self)
        except Exception:
            pass
        await scd64_service.start()
        
        # Connect radar widget updates
        def on_scd64_update(state):
            try:
                radar = self.query_one("#radar")
                self.call_from_thread(radar.update_state, state)
            except Exception:
                pass
        scd64_service.subscribe(on_scd64_update)

        # Trigger initial radar tick loop
        async def radar_loop():
            while scd64_service.running:
                await scd64_service.tick()
                await asyncio.sleep(0.5)
        
        asyncio.create_task(radar_loop())

    # ── Agent run controller ─────────────────────────────────────────
    def begin_agent(self):
        """Mark an agent operation as running. Returns a cancellation token;
        callbacks should bail when ``agent_cancelled(token)`` is True."""
        self._agent_busy = True
        return self._agent_gen

    def agent_cancelled(self, token):
        return token != self._agent_gen

    def register_agent_proc(self, proc):
        with self._agent_lock:
            self._agent_procs.append(proc)

    def unregister_agent_proc(self, proc):
        with self._agent_lock:
            if proc in self._agent_procs:
                self._agent_procs.remove(proc)

    def end_agent(self):
        with self._agent_lock:
            if not self._agent_procs:
                self._agent_busy = False

    def action_stop_agents(self):
        """Esc handler: cancel any running agent — kill tracked subprocesses
        and invalidate in-flight thread/network work via the generation token."""
        if not self._agent_busy and not self._agent_procs:
            return
        self._agent_gen += 1            # any callback holding an old token now no-ops
        with self._agent_lock:
            procs = list(self._agent_procs)
            self._agent_procs.clear()
        killed = 0
        for p in procs:
            try:
                p.terminate()
                killed += 1
            except Exception:
                pass
        self._agent_busy = False
        try:
            bar = self.query_one("#loading-bar")
            bar.remove_class("working")
            bar.styles.display = "none"
        except Exception:
            pass
        suffix = f" [{MUTED}](killed {killed} process{'es' if killed != 1 else ''})[/]" if killed else ""
        self.log_msg(f"[{WARNING}]⛔ Stopped agent[/]{suffix}")

    def setup_commands(self):
        def handle_clear(ui, args):
            chat = ui._get_active_chat()
            chat.clear()
            ui._chat_text_mirror[chat.id] = []

        def handle_copy(ui, args):
            chat = ui._get_active_chat()
            lines = ui._chat_text_mirror.get(chat.id, [])
            if not lines:
                ui.log_msg(f"[{WARNING}]Nothing to copy — chat is empty.[/]")
                return
            text = "\n".join(lines)
            _copy_to_clipboard(text, ui.log_msg)

        def handle_code(ui, args):
            if not args:
                ui.show_code("", "")
                ui.log_msg("[#6A5A6A]Code viewer cleared.[/]")
                return
            path = args[0]
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    source = f.read()
                ui.show_code(source, filename=path)
                ui.log_msg(f"[#7CFF8B]✔ Code loaded:[/] {path}")
            except Exception as e:
                ui.log_msg(f"[#FF5C7A]✗ Failed to read {path}:[/] {e}")

        def handle_undo_replace(ui, args):
            from tui.services.tool_service import undo_replace, list_undoable
            if args and args[0] in ("--list", "-l", "list"):
                stack = list_undoable()
                if not stack:
                    ui.log_msg("[#6A5A6A]Nothing to undo — undo stack is empty.[/]")
                    return
                ui.log_msg(f"[bold {GOLD}]◀ UNDO STACK[/] [dim](newest last)[/]")
                for entry in stack:
                    ui.log_msg(
                        f"  [dim]{entry['id']}[/]  {entry['path']}  "
                        f"[dim]({entry['bytes']} bytes)[/]"
                    )
                return
            target = args[0] if args else None
            msg = undo_replace(target)
            if msg.startswith("Error") or "Nothing to undo" in msg or "No undo entry" in msg:
                ui.log_msg(f"[{WARNING}]{msg}[/]")
            else:
                ui.log_msg(f"[{SUCCESS}]⏪ {msg}[/]")

        def handle_undo_list(ui, args):
            handle_undo_replace(ui, ["--list"])

        r = self.registry.register
        r("/help",    lambda ui, args: ui.show_help(),                         "Show commands",          "/help")
        r("/exit",    lambda ui, args: ui.exit(),                              "Exit app",               "/exit")
        r("/clear",   handle_clear,                                            "Clear chat",             "/clear")
        r("/copy",    handle_copy,                                             "Copy active chat log",   "/copy")
        r("/code",    handle_code,                                             "View code in editor",    "/code <path>")
        r("/undo-replace", handle_undo_replace,                                 "Roll back last write",   "/undo-replace [write_id|--list]")
        r("/undo-list",    handle_undo_list,                                    "List pending undos",     "/undo-list")
        self.registry.register("/analyze", lambda ui, args: ui.agent.run_command("1", args[0] if args else "", ui.log_msg, ui), "Analyze URL", "/analyze <url>")
        self.registry.register("/download", lambda ui, args: ui.agent.run_command("2", args[0] if args else "", ui.log_msg, ui), "Download URL", "/download <url>")
        def handle_memory(ui, args):
            sub = args[0].lower() if args else ""

        r = self.registry.register
        r("/help",    lambda ui, args: ui.show_help(),                         "Show commands",          "/help")
        r("/exit",    lambda ui, args: ui.exit(),                              "Exit app",               "/exit")
        r("/clear",   handle_clear,                                            "Clear chat",             "/clear")
        r("/code",    handle_code,                                             "View code in editor",    "/code <path>")
        r("/undo-replace", handle_undo_replace,                                 "Roll back last write",   "/undo-replace [write_id|--list]")
        r("/undo-list",    handle_undo_list,                                    "List pending undos",     "/undo-list")
        self.registry.register("/analyze", lambda ui, args: ui.agent.run_command("1", args[0] if args else "", ui.log_msg, ui), "Analyze URL", "/analyze <url>")
        self.registry.register("/download", lambda ui, args: ui.agent.run_command("2", args[0] if args else "", ui.log_msg, ui), "Download URL", "/download <url>")
        def handle_memory(ui, args):
            sub = args[0].lower() if args else ""

            if sub == "scan":
                ui.log_msg(f"[bold #00E5FF]⬡ Running substrate osmosis scan...[/]")
                ui.substrate.scan_all_async(ui.log_msg)
                return

            if sub == "status":
                summary = ui.substrate.anomaly_summary()
                states = ui.substrate.get_all_osmosis_states()
                lines = [
                    f"\n[bold #00E5FF]⬡ SUBSTRATE STATUS ⬡[/]",
                    f"  [{SUCCESS}]●[/] Tracked cells: [{PURPLE_LT}]{summary['total_cells']}[/]",
                    f"  [{SUCCESS}]●[/] Silent: [{SUCCESS}]{summary['silent']}[/]  Anomalous: [{ERROR}]{summary['anomalies']}[/]",
                    f"  [{MUTED}]   Total scans: {summary['total_scans']}  Last: {summary['last_scan']}[/]",
                ]
                if states:
                    lines.append("")
                    for s in states[:10]:
                        kind = s.get('anomaly_kind', 'none')
                        glyph = '☣' if kind == 'antigen_match' else '⚠' if kind == 'baseline_drift' else '◉' if kind == 'concentration' else '◇'
                        color = ERROR if s['status'] == 'anomaly' else SUCCESS
                        lines.append(
                            f"  [{color}]{glyph}[/] [{PURPLE_LT}]{s.get('key', s['cell_id'])}[/]  "
                            f"[{MUTED}]sim={s['similarity']:.3f} drift={s['drift']:.3f}[/]  "
                            f"[{color}]{s['status']}[/]"
                        )
                ui.log_msg("\n".join(lines))
                return

            if sub == "list":
                cells = ui.memory.list_cells()
                lines = [f"\n[bold {PURPLE_LT}]❖ ALL MEMORY CELLS ❖[/]"]
                for cell in cells:
                    osm = ui.substrate.get_cell_osmosis(cell['cell_id'])
                    osm_tag = ""
                    if osm and osm['status'] == 'anomaly':
                        osm_tag = f" [{ERROR}]⚠ {osm['anomaly_kind']}[/]"
                    elif osm:
                        osm_tag = f" [{SUCCESS}]✓[/]"
                    lines.append(
                        f"  [{GOLD}]{cell['cell_id']}[/]  "
                        f"[{PURPLE_LT}]{cell['key']}[/] = "
                        f"[{MUTED}]{cell['preview']}[/]"
                        f"{osm_tag}"
                    )
                ui.log_msg("\n".join(lines))
                return

            # Default: show stats summary
            stats = ui.memory.cell_stats()
            osm_summary = ui.substrate.anomaly_summary()
            ui.log_msg(
                f"[bold {PURPLE_LT}]Memory Cells:[/] {stats['occupied']}/{stats['capacity']} occupied  "
                f"| [dim]{stats['dormant']} dormant[/]  "
                f"| [dim]{stats['total_reads']} total reads[/]  "
                f"| [dim]{stats['critiques']} critiques[/]\n"
                f"  [bold #00E5FF]Substrate:[/] {osm_summary['total_cells']} tracked  "
                f"| [{ERROR}]{osm_summary['anomalies']}[/] anomalies  "
                f"| {osm_summary['total_scans']} scans\n"
                f"  [{MUTED}]Use /memory scan · /memory status · /memory list[/]"
            )
        self.registry.register("/memory", handle_memory, "Show memory & substrate", "/memory [scan|status|list]")

        def handle_deploy(ui, args):
            ui.log_msg("\n[bold #B388FF]⚡ Deploying...[/]")
            def run():
                import subprocess
                import os
                proj_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
                try:
                    cmd = ["bash", "-ic", "npm run deploy"]
                    result = subprocess.run(cmd, cwd=proj_root, capture_output=True, text=True)
                    output = result.stdout + "\n" + result.stderr
                    output = output.replace("[", "\\[")
                    if result.returncode == 0:
                        ui.log_msg(f"\n[bold #7CFF8B]✓ Deployment successful[/]\n{output[-1000:]}")
                    else:
                        ui.log_msg(f"\n[bold #FF5C7A]✗ Deployment failed (code {result.returncode})[/]\n{output[-1000:]}")
                except Exception as e:
                    ui.log_msg(f"\n[bold #FF5C7A]✗ Deployment error: {e}[/]")
            import threading
            threading.Thread(target=run, daemon=True).start()

        self.registry.register("/deploy", handle_deploy, "Deploy app (npm run deploy)", "/deploy")

        def handle_polish(ui, args):
            ui.log_msg("\n[bold #B388FF]✨ Running Production Polish...[/]")
            def run():
                import subprocess
                import os
                proj_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
                try:
                    import shlex
                    args_str = " ".join(shlex.quote(a) for a in args)
                    bash_cmd = f"node scripts/production-polish.js {args_str}"
                    cmd = ["bash", "-ic", bash_cmd]
                    result = subprocess.run(cmd, cwd=proj_root, capture_output=True, text=True)
                    output = result.stdout + "\n" + result.stderr
                    # Escape brackets to prevent Rich from attempting to parse compiler output as markup
                    output = output.replace("[", "\\[")
                    # Limit output to prevent UI freeze, showing the bottom (most relevant part)
                    if len(output) > 4000:
                        output = "... [truncated] ...\n" + output[-4000:]
                    if result.returncode == 0:
                        ui.log_msg(f"\n[bold #7CFF8B]✓ Polish complete[/]\n{output}")
                    else:
                        ui.log_msg(f"\n[bold #FF5C7A]✗ Polish failed (code {result.returncode})[/]\n{output}")
                except Exception as e:
                    ui.log_msg(f"\n[bold #FF5C7A]✗ Polish error: {e}[/]")
            import threading
            threading.Thread(target=run, daemon=True).start()

        self.registry.register("/polish", handle_polish, "Run production polish script", "/polish [quick|full|force] [--ci]")

        def create_python_check_command(name, python_cmd, desc, usage_text):
            def handler(ui, args):
                ui.log_msg(f"\n[bold #B388FF]⚡ Running {name}...[/]")
                def run():
                    import subprocess
                    import os
                    # We run this in the python project root: divtube_downloader
                    proj_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    try:
                        # Find the virtual environment binaries
                        venv_bin = os.path.join(proj_root, ".venv", "bin")
                        cmd_path = os.path.join(venv_bin, python_cmd[0])
                        cmd = [cmd_path] + python_cmd[1:] + args
                        result = subprocess.run(cmd, cwd=proj_root, capture_output=True, text=True)
                        output = result.stdout + "\n" + result.stderr
                        output = output.replace("[", "\\[")
                        if len(output) > 4000:
                            output = "... [truncated] ...\n" + output[-4000:]
                        if result.returncode == 0:
                            ui.log_msg(f"\n[bold #7CFF8B]✓ {name} complete[/]\n{output}")
                        else:
                            ui.log_msg(f"\n[bold #FF5C7A]✗ {name} failed (code {result.returncode})[/]\n{output}")
                    except Exception as e:
                        ui.log_msg(f"\n[bold #FF5C7A]✗ {name} error: {e}[/]")
                import threading
                threading.Thread(target=run, daemon=True).start()
            self.registry.register(f"/{name}", handler, desc, usage_text)

        create_python_check_command("lint", ["ruff", "check", "."], "Run Ruff (Python Linter)", "/lint")
        create_python_check_command("test", ["python", "-m", "pytest", "tests/"], "Run Pytest", "/test")
        create_python_check_command("typecheck", ["mypy", "."], "Run Mypy", "/typecheck")

        def handle_critique(ui, args):
            file_path = args[0] if args else "test_content.json"
            model = ui.critic_service.active_model

            token = ui.begin_agent()
            bar = ui.query_one("#loading-bar")
            bar.styles.display = "block"
            bar.remove_class("finished")
            bar.add_class("working")
            bar.progress = 0

            def on_progress(msg, success=None, is_final=False):
                if ui.agent_cancelled(token):
                    return  # Esc was pressed — drop late output
                if msg:
                    ui.log_msg(msg)

                def update_ui():
                    if ui.agent_cancelled(token):
                        return
                    if not is_final:
                        if bar.progress < 90:
                            bar.advance(30)
                    else:
                        bar.progress = 100
                        bar.remove_class("working")
                        bar.add_class("finished")
                        ui.set_timer(2.0, lambda: setattr(bar.styles, "display", "none"))
                        ui.end_agent()

                ui.call_from_thread(update_ui)

            ui.critic_service.critique(file_path, model, on_progress)

        self.registry.register("/critique", handle_critique, "Critique File", "/critique <f>")

        def handle_scholomance(ui, args):
            file_path = args[0] if args else "test_content.md"
            model = ui.critic_service.active_model

            token = ui.begin_agent()
            bar = ui.query_one("#loading-bar")
            bar.styles.display = "block"
            bar.remove_class("finished")
            bar.add_class("working")
            bar.progress = 0

            def on_progress(msg, success=None, is_final=False):
                if ui.agent_cancelled(token):
                    return  # Esc was pressed — drop late output
                if msg:
                    ui.log_msg(msg)

                def update_ui():
                    if ui.agent_cancelled(token):
                        return
                    if not is_final:
                        if bar.progress < 90:
                            bar.advance(30)
                    else:
                        bar.progress = 100
                        bar.remove_class("working")
                        bar.add_class("finished")
                        ui.set_timer(2.0, lambda: setattr(bar.styles, "display", "none"))
                        ui.end_agent()

                ui.call_from_thread(update_ui)

            ui.critic_service.critique(file_path, model, on_progress, skill_name="mirrorborne-scholomance")

        self.registry.register("/scholomance", handle_scholomance, "Scholomance Intel", "/scholomance <f>")

        def handle_apply_patch(ui, args):
            import os
            import json
            import re
            if not args:
                ui.log_msg(f"[{ERROR}]Usage:[/] /apply-patch <file.json>")
                return
            target_json = args[0]
            if not os.path.exists(target_json):
                ui.log_msg(f"[{ERROR}]File not found:[/] {target_json}")
                return
                
            base_name = os.path.basename(target_json)
            name_without_ext = os.path.splitext(base_name)[0]
            report_file = os.path.join(os.getcwd(), "reports", f"{name_without_ext}_critique.md")
            
            if not os.path.exists(report_file):
                ui.log_msg(f"[{ERROR}]Critique report not found:[/] {report_file}. Run /critique first.")
                return
                
            with open(report_file, "r", encoding="utf-8") as rf:
                report_text = rf.read()
                
            match = re.search(r'```json\s*({.*?"patches".*?})\s*```', report_text, re.DOTALL)
            if not match:
                ui.log_msg(f"[{ERROR}]No machine-readable JSON patches found in the critique report.[/]")
                return
                
            try:
                patch_data = json.loads(match.group(1))
                patches = patch_data.get("patches", [])
            except Exception as e:
                ui.log_msg(f"[{ERROR}]Failed to parse patch JSON:[/] {e}")
                return
                
            if not patches:
                ui.log_msg(f"[{MUTED}]No patches to apply.[/]")
                return
                
            with open(target_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            def set_deep(obj, path, value):
                parts = re.split(r'\.|\[', path.replace(']', ''))
                curr = obj
                for i, part in enumerate(parts[:-1]):
                    if not part:
                        continue
                    idx = int(part) if part.isdigit() else part
                    curr = curr[idx]
                last_part = int(parts[-1]) if parts[-1].isdigit() else parts[-1]
                curr[last_part] = value

            applied_count = 0
            for p in patches:
                field = p.get("field")
                new_val = p.get("new_value")
                if field and new_val is not None:
                    try:
                        set_deep(data, field, new_val)
                        applied_count += 1
                        ui.log_msg(f"  [{SUCCESS}]✔[/] Patched [{GOLD}]{field}[/]")
                    except Exception as e:
                        ui.log_msg(f"  [{ERROR}]✖[/] Failed to patch [{GOLD}]{field}[/]: {e}")
                        
            with open(target_json, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                
            ui.log_msg(f"\n[bold {SUCCESS}]Successfully applied {applied_count} AI patches to {target_json}[/]")

        self.registry.register("/apply-patch", handle_apply_patch, "Apply AI Patches", "/apply-patch <f>")

        def handle_refactor_all(ui, args):
            if len(args) < 3:
                ui.log_msg(f"[{ERROR}]Usage:[/] /refactor-all <glob> <search> <replace> [--dry-run] [--regex]")
                return
            pattern = args[0]
            search = args[1]
            replace = args[2]
            dry_run = "--dry-run" in args[3:]
            regex = "--regex" in args[3:]
            ui.log_msg(f"[{MUTED}]Refactoring files matching [bold]{pattern}[/]{' (regex)' if regex else ''}...[/]")
            try:
                from tui.utils.agent_tools import refactor_all
                result = refactor_all(pattern, search, replace, dry_run=dry_run, regex=regex)
                if result.details and result.details[0].get("status") == "invalid_regex":
                    ui.log_msg(f"[{ERROR}]Invalid regex:[/] {result.details[0].get('error')}")
                    return
                color = WARNING if result.changed == 0 else SUCCESS
                ui.log_msg(
                    f"[{color}]Searched {result.searched} file(s): {result.changed} changed, "
                    f"{result.skipped} skipped[/]"
                )
                for detail in result.details:
                    status = detail["status"]
                    fpath = detail["file"]
                    if status == "changed":
                        ui.log_msg(f"  [{SUCCESS}]✔[/] {fpath}")
                    elif status == "would_change":
                        ui.log_msg(f"  [{WARNING}]◌[/] {fpath} (dry-run)")
                    elif status == "ambiguous":
                        ui.log_msg(f"  [{WARNING}]⚠[/] {fpath} — {detail['occurrences']} occurrences (ambiguous)")
                    elif status == "no_match":
                        ui.log_msg(f"  [{MUTED}]−[/] {fpath} — no match")
                    else:
                        ui.log_msg(f"  [{ERROR}]✖[/] {fpath} — {status}")
            except Exception as e:
                ui.log_msg(f"[{ERROR}]Refactor failed:[/] {e}")

        self.registry.register(
            "/refactor-all",
            handle_refactor_all,
            "Batch search/replace across files",
            '/refactor-all <glob> "search" "replace" [--dry-run] [--regex]',
        )

        def handle_write_file(ui, args):
            if len(args) < 2:
                ui.log_msg(f"[{ERROR}]Usage:[/] /write-file <path> '<content>'")
                return
            path = args[0]
            content = " ".join(args[1:])
            try:
                from tui.utils.agent_tools import write_file
                result = write_file(path, content)
                if result.success:
                    color = SUCCESS
                    tag = "Created" if result.created else "Overwrote"
                    ui.log_msg(f"[{color}]✓ {tag}[/] {path} [{MUTED}]({result.bytes_written} bytes)[/]")
                else:
                    ui.log_msg(f"[{ERROR}]✗ {result.message}[/]")
            except Exception as e:
                ui.log_msg(f"[{ERROR}]Write failed:[/] {e}")

        self.registry.register(
            "/write-file",
            handle_write_file,
            "Create or overwrite a file",
            "/write-file <path> '<content>'",
        )

        def handle_thumbnail(ui, args):
            import os
            import threading
            if not args:
                ui.log_msg(f"[{ERROR}]Usage:[/] /thumbnail <path_to_image>")
                return
            path = os.path.abspath(args[0])
            if not os.path.exists(path):
                ui.log_msg(f"[{ERROR}]File not found:[/] {path}")
                return
                
            # Attempt to show the image externally
            import platform
            import subprocess
            try:
                if platform.system() == 'Darwin':
                    subprocess.Popen(['open', path])
                elif platform.system() == 'Windows':
                    os.startfile(path)
                else:
                    subprocess.Popen(['xdg-open', path])
            except Exception:
                pass # fail silently if no external viewer
                
            ui.log_msg(f"[{MUTED}]Analyzing thumbnail:[/] {os.path.basename(path)}")
            
            def do_analyze():
                try:
                    with open(path, "rb") as f:
                        thumbnail_bytes = f.read()
                    
                    from intel.engines.thumbnail_engine import run as analyze_thumbnail
                    
                    result = analyze_thumbnail(None, thumbnail_bytes)
                    score = result.score or 0
                    
                    color = "#FF5C7A" if score < 50 else "#FFD166" if score < 75 else "#7CFF8B"
                    
                    msg = "\n[bold magenta]❖ THUMBNAIL INTEL GRADE ❖[/]\n"
                    msg += f"File: {os.path.basename(path)}\n"
                    msg += f"Score: [bold {color}]{score}/100[/]\n"
                    
                    if result.flags:
                        msg += "\n[bold #FFD166]Warnings & Flags:[/]\n"
                        for flag in result.flags:
                            msg += f"  - [{flag.code}] {flag.message}\n"
                    else:
                        msg += "\n[bold #7CFF8B]✔ No critical warnings. Composition is solid![/]\n"
                        
                    msg += f"\n[dim]Metrics: Silhouette ({result.metrics.get('silhouette', 0)}), Contrast ({result.metrics.get('contrast', 0)}), Color Sep ({result.metrics.get('colorSeparation', 0)})[/]"
                        
                    ui.call_from_thread(ui.log_msg, msg)
                except Exception as e:
                    ui.call_from_thread(ui.log_msg, f"[{ERROR}]Thumbnail analysis failed:[/] {e}")
            
            threading.Thread(target=do_analyze).start()

        self.registry.register("/thumbnail", handle_thumbnail, "Grade Thumbnail", "/thumbnail <img_path>")

        def handle_rate_title(ui, args):
            if not args:
                ui.log_msg(f"[{ERROR}]Usage:[/] /rate-title \"Your video title here\"")
                return
            title_text = " ".join(args)
            ui.log_msg(f"[{MUTED}]Analyzing title:[/] \"{title_text}\"")
            try:
                from intel.schema import VideoAnalysis, VideoOverview
                from intel.engines.title_engine import run as analyze_title
                analysis = VideoAnalysis(overview=VideoOverview(title=title_text))
                result = analyze_title(analysis)
                score = result.score or 0
                color = "#FF5C7A" if score < 50 else "#FFD166" if score < 75 else "#7CFF8B"
                msg = "\n[bold magenta]❖ TITLE INTEL GRADE ❖[/]\n"
                msg += f"Title: \"{title_text}\"\n"
                msg += f"Score: [bold {color}]{score}/100[/]\n"
                m = result.metrics
                msg += "\n[bold #B388FF]Breakdown:[/]\n"
                msg += f"  Length: {m.get('length', '?')} chars ({'✓' if m.get('length', 99) <= 50 else '⚠ over 60 → mobile truncation'})\n"
                hook = m.get('hasHook', False)
                msg += f"  Hook: {'✓' if hook else '✗'} in first 3 words\n"
                kw = m.get('keyword', '')
                kp = m.get('keywordPosition', -1)
                msg += f"  Keyword: \"{kw}\" @ pos {kp} ({'✓ frontloaded' if 0 <= kp < 32 else '⚠ past char 32' if kp >= 32 else '✗ none found'})\n"
                msg += f"  Curiosity gap: {'✓' if m.get('hasCuriosity', False) else '✗'}\n"
                msg += f"  Clarity: {m.get('clarity', 0):.0%}\n"
                msg += f"  Uniqueness: {m.get('uniqueness', 0):.0%}\n"
                if result.flags:
                    msg += "\n[bold #FFD166]Flags:[/]\n"
                    for flag in result.flags:
                        msg += f"  - [{flag.code}] {flag.message}\n"
                else:
                    msg += "\n[bold #7CFF8B]✔ No issues detected.[/]\n"
                ui.log_msg(msg)
            except Exception as e:
                ui.log_msg(f"[{ERROR}]Title analysis failed:[/] {e}")

        self.registry.register("/rate-title", handle_rate_title, "Rate title (curve-free SEO scoring)", '/rate-title "Your Title"')

        def handle_model(ui, args):
            def on_fetched(free_models, paid_models):
                def push_screen():
                    def on_selected(model_name):
                        if model_name:
                            ui.critic_service.active_model = model_name
                            ui.prompt.set_model(model_name)
                            write_key("OPENCODE_MODEL", model_name)
                            ui.log_msg(f"[bold {SUCCESS}]✔ Active default model set to:[/] {model_name}")
                    # Show both free and paid models so every available model
                    # is selectable (paid ones only appear when the provider
                    # reports a positive price).
                    ui.push_screen(ModelSelectScreen(free_models, paid_models), on_selected)
                ui.call_from_thread(push_screen)
            ui.critic_service.get_models(ui.log_msg, on_fetched)

        self.registry.register("/model", handle_model, "Change model", "/model")

        def handle_apikey(ui, args):
            if not args:
                ui.log_msg(f"[{ERROR}]Usage:[/] /apikey <your_api_key>")
                return

            key = args[0]
            provider = set_active_key(key)

            if provider:
                ui.log_msg(f"[bold {SUCCESS}]✔ API Key saved for [{provider}]![/] It will be restored automatically whenever you switch back to this provider — no need to re-enter it.")
            else:
                ui.log_msg(f"[bold {SUCCESS}]✔ API Key securely saved![/] This key will persist across restarts.")

        self.registry.register("/apikey", handle_apikey, "Set API Key", "/apikey <key>")

        def handle_budget(ui, args):
            from tui.services.token_meter import meter
            if args and args[0].lower() in ("reset", "clear"):
                meter.reset_spend()
                ui.log_msg(f"[bold {SUCCESS}]✔ Aether reserve refilled.[/] Spend counter zeroed.")
                return
            if args:
                raw = args[0].lstrip("$")
                try:
                    meter.set_budget(float(raw))
                except ValueError:
                    ui.log_msg(f"[{ERROR}]Usage:[/] /budget <usd amount>  ·  /budget reset")
                    return
            s = meter.snapshot()
            ui.log_msg(
                f"[bold {PURPLE_LT}]❖ AETHER RESERVE ❖[/]\n"
                f"  Budget:    ${s['budget']:.2f}\n"
                f"  Spent:     ≈${s['cost']:.4f}  ({s['calls']} calls)\n"
                f"  Remaining: ≈${s['remaining']:.2f}  ({s['ratio'] * 100:.0f}%)\n"
                f"  Tokens:    {s['tokens']:,}\n"
                f"[{MUTED}]Cost is an estimate from a tunable price table — tune via AETHER_PRICE_* in .env.[/]"
            )

        self.registry.register("/budget", handle_budget, "Set/show the aether (credit) reserve", "/budget <usd> | reset")

        def handle_provider(ui, args):
            if not args:
                ui.log_msg(f"[{ERROR}]Usage:[/] /provider <openai|xai(grok)|opencode|router(openrouter)|gemini|blackbox|groq|custom_base_url>")
                return

            provider, base_url, models_url, default_model, key_restored = set_provider(args[0])

            if default_model:
                os.environ["OPENCODE_MODEL"] = default_model
                ui.critic_service.active_model = default_model
                ui.prompt.set_model(default_model)
                model_msg = f"\n[bold {SUCCESS}]✔ Auto-set default model to:[/] {default_model}"
            else:
                model_msg = ""

            if key_restored:
                key_msg = f"\n[bold {SUCCESS}]🔑 Saved API key for [{provider}] restored.[/] You're ready to go."
            else:
                key_msg = f"\n[{WARNING}]No API key saved for [{provider}] yet.[/] Set it once with /apikey <key> — it'll be remembered from now on."

            ui.log_msg(f"[bold {SUCCESS}]✔ API Provider set to:[/] {base_url}{model_msg}{key_msg}")

        self.registry.register("/provider", handle_provider, "Set API Provider", "/provider <name_or_url>")

        def handle_release(ui, args):
            try:
                from tui.core.gate_keeper import gate
                gate.reset()
                ui.log_msg(f"[bold {SUCCESS}]✔ Internal tool gates and API cooldown blocks released.[/]")
            except ImportError:
                ui.log_msg(f"[bold {SUCCESS}]✔ API blocks released.[/]")

        self.registry.register("/release", handle_release, "Release API 429 and tool gates", "/release")

        def handle_forge(ui, args):
            if not args:
                forge_screen = VideoForgeScreen(ui.forge, ui.log_msg)
                ui.push_screen(forge_screen)
            else:
                ui.forge.cmd_forge(args, ui.log_msg)
                for s in ui.screen_stack:
                    if isinstance(s, VideoForgeScreen):
                        s.refresh_display()
                        break

        self.registry.register("/forge", handle_forge, "Video Forge editor", "/forge <subcommand>")

        def handle_divtube(ui, args):
            if any(isinstance(s, VideoForgeScreen) for s in ui.screen_stack):
                ui.pop_screen()
            else:
                ui.log_msg("[#6A5A6A]Already on DivTube home. Use /forge to open the Video Forge editor.[/]")

        self.registry.register("/divtube", handle_divtube, "Return to DivTube", "/divtube")

        def handle_prompt(ui, args):
            text = " ".join(args)
            if not text:
                ui.log_msg("[#FF5C7A]Usage: /prompt <your message>[/]")
                return
            try:
                active_tab = ui.query_one("#agent-tabs").active
                agent_id = active_tab.split("-")[1] if active_tab else "divtube"
            except Exception:
                agent_id = "divtube"
            ui.prompt.prompt(text, ui.log_msg, state_callback=ui.set_ai_state, controller=ui, agent_id=agent_id)

        def handle_prompt_model(ui, args):
            model = " ".join(args).strip()
            if not model:
                ui.log_msg("[#FF5C7A]Usage: /prompt-model <model_name>[/]")
                return
            import os
            ui.prompt.set_model(model)
            ui.critic_service.active_model = model
            os.environ["OPENCODE_MODEL"] = model
            with open(".env", "a") as f:
                f.write(f"\nOPENCODE_MODEL={model}\n")
            ui.log_msg(f"[bold #7CFF8B]✔ AI model set to:[/] {model}")

        def handle_prompt_clear(ui, args):
            try:
                active_tab = ui.query_one("#agent-tabs").active
                agent_id = active_tab.split("-")[1] if active_tab else "divtube"
            except Exception:
                agent_id = "divtube"
            ui.prompt.clear_history(agent_id=agent_id)
            ui.log_msg(f"[#7CFF8B]✔ Conversation history cleared for {agent_id}.[/]")

        self.registry.register("/prompt",        handle_prompt,       "Chat with AI agent",        "/prompt <message>")
        self.registry.register("/prompt-model",  handle_prompt_model, "Set AI model for /prompt",  "/prompt-model <name>")
        self.registry.register("/prompt-clear",  handle_prompt_clear, "Clear conversation history","/prompt-clear")

        self.setup_cleri_commands()
        self.setup_archive_commands()
        self.setup_health_commands()

        self.setup_turbo_commands()
        self.setup_daemon_commands()

    def setup_daemon_commands(self):
        """Brain daemon control commands."""
        r = self.registry.register

        def handle_daemon_start(ui, args):
            ui.log_msg(f"[{PURPLE}]Starting brain daemon...[/]")
            def run():
                try:
                    from tui.services.brain_bridge_service import BrainBridgeService
                    svc = BrainBridgeService()
                    result = svc.start_daemon()
                    if "error" in result:
                        ui.log_msg(f"[{ERROR}]Failed to start daemon:[/] {result['error']}")
                    else:
                        ui.log_msg(f"[{SUCCESS}]✔ Brain daemon started[/] on port {svc.port} (PID: {result['pid']})")
                except Exception as e:
                    ui.log_msg(f"[{ERROR}]Error:[/] {e}")
            threading.Thread(target=run, daemon=True).start()

        def handle_daemon_stop(ui, args):
            ui.log_msg(f"[{WARNING}]Stopping brain daemon...[/]")
            try:
                from tui.services.brain_bridge_service import BrainBridgeService
                svc = BrainBridgeService()
                svc.stop_daemon()
                ui.log_msg(f"[{SUCCESS}]✔ Brain daemon stopped.[/]")
            except Exception as e:
                ui.log_msg(f"[{ERROR}]Error:[/] {e}")

        r("/daemon-start", handle_daemon_start, "Start brain daemon for persistent queries", "/daemon-start")
        r("/daemon-stop", handle_daemon_stop, "Stop brain daemon", "/daemon-stop")

        def handle_vaelrix(ui, args):
            text = " ".join(args).strip()
            if not text:
                ui.log_msg(f"[{GOLD}]Use /vaelrix <question> to ask Vaelrix.[/]")
                return
            ui.log_msg(f"\n[bold {PURPLE}]✦ VAELRIX ✦[/]")
            bar = ui.query_one("#loading-bar")
            bar.styles.display = "block"
            bar.progress = 0

            def run():
                import urllib.request, urllib.error, json as _json
                try:
                    data = _json.dumps({"query": text}).encode()
                    req = urllib.request.Request(
                        "http://127.0.0.1:9090/ask",
                        data=data,
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=120) as resp:
                        body = _json.loads(resp.read().decode())
                        response = body.get("response", "[Empty]")

                    def _write():
                        bar.progress = 100
                        ui.set_timer(2.0, lambda: setattr(bar.styles, "display", "none"))
                        ui.log_msg(f"[{GOLD}]{response}[/]")
                    ui.call_from_thread(_write)
                except Exception as e:
                    def _write():
                        bar.progress = 100
                        ui.set_timer(2.0, lambda: setattr(bar.styles, "display", "none"))
                        ui.log_msg(f"[{ERROR}]Vaelrix unreachable: {e}\n[#6A5A6A]Is the daemon running on :9090?[/]")
                    ui.call_from_thread(_write)

            threading.Thread(target=run, daemon=True).start()

        r("/vaelrix", handle_vaelrix, "Ask Vaelrix (SteamDeck brain)", "/vaelrix <question>")

    def setup_turbo_commands(self):
        """TurboQuant SEO plugin commands (spec v1.0, phases 0-3)."""

        def usage(ui, text):
            ui.log_msg(f"[#6A5A6A]usage:[/] {text}")

        def register_golden(ui, args):
            pos, flags = _flags(args, {"--name"})
            if "--name" in flags:
                name, text = flags["--name"], " ".join(pos)
            elif len(pos) >= 2:
                name, text = pos[0], " ".join(pos[1:])
            else:
                return usage(ui, '/register-golden <name> <text…>   or   /register-golden --name "X" "text…"')
            if not name or not text:
                return usage(ui, "/register-golden <name> <text…>")
            ui.turbo.register_golden(name, text, ui.log_msg)

        def list_curves(ui, args):
            ui.turbo.list_curves(ui.log_msg)

        def delete_curve(ui, args):
            name = " ".join(args).strip()
            if not name:
                return usage(ui, "/delete-curve <name>")
            ui.turbo.delete_curve(name, ui.log_msg)

        def score_title(ui, args):
            pos, flags = _flags(args, {"--curve"})
            if "--curve" in flags:
                curve, title = flags["--curve"], " ".join(pos)
            elif len(pos) >= 2:
                curve, title = pos[0], " ".join(pos[1:])
            else:
                return usage(ui, '/score-title "Title…" --curve <name>')
            if not curve or not title:
                return usage(ui, '/score-title "Title…" --curve <name>')
            ui.turbo.score_title(curve, title, ui.log_msg)

        def test_titles(ui, args):
            pos, flags = _flags(args, {"--curve"})
            if "--curve" in flags:
                curve, titles = flags["--curve"], pos
            elif len(pos) >= 2:
                curve, titles = pos[0], pos[1:]
            else:
                return usage(ui, '/test-titles --curve <name> "Title A" "Title B" …')
            if not curve or len(titles) < 2:
                return usage(ui, '/test-titles --curve <name> "Title A" "Title B" …')
            ui.turbo.test_titles(curve, titles, ui.log_msg)

        def analyze_gaps(ui, args):
            pos, flags = _flags(args, {"--curve", "--target"})
            curve = flags.get("--curve") or flags.get("--target")
            if curve:
                text = " ".join(pos)
            elif len(pos) >= 2:
                curve, text = pos[0], " ".join(pos[1:])
            else:
                return usage(ui, '/analyze-gaps --target <name> "your title/description…"')
            if not curve or not text:
                return usage(ui, '/analyze-gaps --target <name> "your title/description…"')
            ui.turbo.analyze_gaps(curve, text, ui.log_msg)

        def search_similar(ui, args):
            pos, flags = _flags(args, {"-k", "--k"})
            try:
                k = int(flags.get("-k") or flags.get("--k") or 5)
            except ValueError:
                k = 5
            text = " ".join(pos).strip()
            if not text:
                return usage(ui, '/search-similar "draft description…" [-k N]')
            ui.turbo.search_similar(text, ui.log_msg, k=k)

        def export_pack(ui, args):
            name = " ".join(args).strip()
            if not name:
                return usage(ui, "/export-pack <filename>")
            ui.turbo.export_pack(name, ui.log_msg)

        def import_pack(ui, args):
            name = " ".join(args).strip()
            if not name:
                return usage(ui, "/import-pack <filename>")
            ui.turbo.import_pack(name, ui.log_msg)

        r = self.registry.register
        r("/register-golden", register_golden, "Store text/video as a Golden Curve", '/register-golden <name> <text…>')
        r("/list-curves",     list_curves,     "List saved Golden Curves",          "/list-curves")
        r("/delete-curve",    delete_curve,    "Delete a Golden Curve",             "/delete-curve <name>")
        r("/score-title",     score_title,     "Score a title vs a curve",          '/score-title "Title" --curve <name>')
        r("/test-titles",     test_titles,     "A/B rank titles vs a curve",        '/test-titles --curve <name> "A" "B"')
        r("/analyze-gaps",    analyze_gaps,    "Find missing semantic concepts",    '/analyze-gaps --target <name> "text"')
        r("/search-similar",  search_similar,  "k-NN search across all curves",     '/search-similar "text" [-k N]')
        r("/export-pack",     export_pack,     "Export curves to a .goldenpack",    "/export-pack <file>")
        r("/import-pack",     import_pack,     "Import curves from a .goldenpack",  "/import-pack <file>")

    # ─── CLERICAL RAID COMMANDS ────────────────────────────────────────

    def setup_cleri_commands(self):
        r = self.registry.register

        def handle_cleri_scan(ui, args):
            text = " ".join(args).strip()
            if not text:
                ui.log_msg("[#FF5C7A]Usage: /cleri-scan \"symptom text\"[/]")
                return
            ui.cleri.scan(text, ui.log_msg)

        def handle_cleri_diagnose(ui, args):
            report = args[0] if args else None
            if not report:
                ui.log_msg("[#FF5C7A]Usage: /cleri-diagnose <bug.json>[/]")
                return
            ui.cleri.diagnose(report, ui.log_msg)

        def handle_cleri_train(ui, args):
            pattern = args[0] if args else None
            if not pattern:
                ui.log_msg("[#FF5C7A]Usage: /cleri-train <pattern.json>[/]")
                return
            ui.cleri.train(pattern, ui.log_msg)

        def handle_cleri_stats(ui, args):
            ui.cleri.stats(ui.log_msg)

        def handle_cleri_probe(ui, args):
            text = " ".join(args).strip()
            if not text:
                ui.log_msg("[#FF5C7A]Usage: /cleri-probe \"text\" [--mode prion][/]")
                return
            ui.cleri.probe(text, ui.log_msg)

        def handle_cleri_agent_query(ui, args):
            if len(args) < 2:
                ui.log_msg("[#FF5C7A]Usage: /cleri-agent-query <codex|claude|gemini|merlin> <bug.json>[/]")
                return
            ui.cleri.agent_query(args[0], args[1], ui.log_msg)

        def handle_cleri_merlin_ingest(ui, args):
            if not args:
                ui.log_msg("[#FF5C7A]Usage: /cleri-merlin-ingest <bug.json> [--no-train][/]")
                return
            no_train = "--no-train" in args
            report = [a for a in args if not a.startswith("--")]
            ui.cleri.merlin_ingest(report[0] if report else args[0], ui.log_msg, no_train=no_train)

        def handle_cleri_cluster(ui, args):
            min_sim = 0.92
            for a in args:
                if a.startswith("--min-sim="):
                    try:
                        min_sim = float(a.split("=")[1])
                    except ValueError:
                        pass
            ui.cleri.cluster(ui.log_msg, min_sim=min_sim)

        def handle_cleri_duplicates(ui, args):
            min_sim = 0.97
            for a in args:
                if a.startswith("--min-sim="):
                    try:
                        min_sim = float(a.split("=")[1])
                    except ValueError:
                        pass
            ui.cleri.duplicates(ui.log_msg, min_sim=min_sim)

        def handle_cleri_maintenance(ui, args):
            ui.cleri.maintenance(ui.log_msg)

        def handle_cleri_feedback(ui, args):
            if len(args) < 2:
                ui.log_msg("[#FF5C7A]Usage: /cleri-feedback <pattern-id> --confirm|--reject[/]")
                return
            pid = args[0]
            confirm = "--confirm" in args
            reject = "--reject" in args
            if confirm == reject:
                ui.log_msg("[#FF5C7A]Specify exactly one: --confirm or --reject[/]")
                return
            ui.cleri.feedback(pid, confirm, ui.log_msg)

        def handle_cleri_rebuild(ui, args):
            ui.cleri.rebuild_index(ui.log_msg)

        def handle_cleri_repl(ui, args):
            ui.log_msg("[#FFD700]CLERI REPL[/] [#6A5A6A]— enter symptom text, blank to exit.[/]")
            text = " ".join(args).strip()
            if text:
                ui.cleri.scan(text, ui.log_msg)

        r("/cleri",          handle_cleri_scan,       "Alias for /cleri-scan",               "/cleri <text>")
        r("/cleri-scan",     handle_cleri_scan,       "Scan symptom against RAID patterns",   "/cleri-scan <text>")
        r("/cleri-diagnose", handle_cleri_diagnose,   "Diagnose a bug report JSON",           "/cleri-diagnose <file>")
        r("/cleri-train",    handle_cleri_train,      "Train a new pattern from JSON",        "/cleri-train <file>")
        r("/cleri-stats",    handle_cleri_stats,       "RAID statistics & pattern counts",     "/cleri-stats")
        r("/cleri-probe",    handle_cleri_probe,       "Probe code for structural prions",     "/cleri-probe <text>")
        r("/cleri-query",    handle_cleri_agent_query, "Agent-hooked RAID query",              "/cleri-query <agent> <file>")
        r("/cleri-ingest",   handle_cleri_merlin_ingest, "Auto-train from Merlin report",     "/cleri-ingest <file> [--no-train]")
        r("/cleri-cluster",  handle_cleri_cluster,     "Cluster similar patterns",             "/cleri-cluster [--min-sim=0.92]")
        r("/cleri-dupes",    handle_cleri_duplicates,  "Find near-duplicate patterns",         "/cleri-dupes [--min-sim=0.97]")
        r("/cleri-maint",    handle_cleri_maintenance, "Deprecate stale patterns",             "/cleri-maint")
        r("/cleri-feedback", handle_cleri_feedback,    "Confirm or reject a pattern match",    "/cleri-feedback <id> --confirm|--reject")
        r("/cleri-rebuild",  handle_cleri_rebuild,     "Re-quantize pattern index",            "/cleri-rebuild")

    # ─── ARCHIVE COMMANDS ──────────────────────────────────────────────

    def setup_archive_commands(self):
        r = self.registry.register

        def handle_archive_files(ui, args):
            ui.archive.list_files(ui.log_msg)

        def handle_archive_search(ui, args):
            query = " ".join(args).strip()
            if not query:
                ui.log_msg("[#FF5C7A]Usage: /archive-search <query>[/]")
                return
            ui.archive.search(query, ui.log_msg)

        def handle_archive_neighbors(ui, args):
            path = " ".join(args).strip()
            if not path:
                ui.log_msg("[#FF5C7A]Usage: /archive-neighbors <file_path>[/]")
                return
            ui.archive.neighbors(path, ui.log_msg)

        def handle_archive_status(ui, args):
            ui.archive.status(ui.log_msg)

        r("/archive",         handle_archive_files,    "List all indexed source files",        "/archive")
        r("/archive-files",   handle_archive_files,    "List all indexed source files",        "/archive-files")
        r("/archive-search",  handle_archive_search,   "Search codebase by path/name",         "/archive-search <query>")
        r("/archive-neighbors", handle_archive_neighbors, "Find neighboring files",            "/archive-neighbors <path>")
        r("/archive-status",  handle_archive_status,   "Archive bridge status",                "/archive-status")

    # ─── BYTECODE HEALTH COMMANDS ──────────────────────────────────────

    def setup_health_commands(self):
        r = self.registry.register

        def handle_health_emit(ui, args):
            if len(args) < 2:
                ui.log_msg("[#FF5C7A]Usage: /health-emit <cellId> <checkId> [--module <mod>][/]")
                return
            cell_id = args[0]
            check_id = args[1]
            module_id = None
            for i, a in enumerate(args):
                if a == "--module" and i + 1 < len(args):
                    module_id = args[i + 1]
            ui.health.emit(cell_id, check_id, ui.log_msg, module_id=module_id)

        def handle_health_verify(ui, args):
            cell_id = args[0] if args else "IMMUNE_CELL"
            check_id = args[1] if len(args) > 1 else "VERIFY"
            ui.health.verify_determinism(cell_id, check_id, ui.log_msg)

        def handle_health_status(ui, args):
            ui.health.status(ui.log_msg)

        r("/health",          handle_health_status,    "BytecodeHealth bridge status",          "/health")
        r("/health-emit",     handle_health_emit,      "Emit a BytecodeHealth green signal",    "/health-emit <cell> <check>")
        r("/health-verify",   handle_health_verify,    "Run 100x determinism verification",     "/health-verify [cell] [check]")
        r("/health-status",   handle_health_status,    "Show health signal stats",              "/health-status")
        r("/log",             self._show_log_tail,     "Live tail of app/error logs",           "/log")
        r("/registry",        self._show_registry,     "Inspect TurboQuant registry",           "/registry")

    def show_help(self):
        gold, muted, purple = GOLD, MUTED, PURPLE_LT
        self.log_msg(f"[bold {gold}]❖ DIVTUBE COMMANDS ❖[/]")
        self.log_msg(f"[{purple}]Agent[/]   /prompt <msg> · /analyze <url> · /download <url> · /rate-title \"T\" · /critique <f> · /model · /memory")
        self.log_msg(f"[{purple}]Video Forge[/]")
        self.log_msg(f"  [{gold}]/forge new|import|timeline|add-title|add-caption|add-credit[/]")
        self.log_msg(f"  [{gold}]/forge trim|split|move|delete|duplicate|mute|transition[/]")
        self.log_msg(f"  [{gold}]/forge music|narration|effect|export|ledger|presets|effects|transitions[/]")
        self.log_msg(f"  [{gold}]/forge list|open|project|snapshot|freeze|detach-audio[/]")
        self.log_msg(f"  [{gold}]/forge recipe[/]        — dump full project JSON (AI-editable)")
        self.log_msg(f"  [{gold}]/forge apply <file>[/]   — load modified JSON recipe")
        self.log_msg(f"[{purple}]TurboQuant SEO[/]")
        for name in ("/register-golden", "/list-curves", "/delete-curve", "/score-title",
                     "/test-titles", "/analyze-gaps", "/search-similar", "/export-pack", "/import-pack"):
            cmd = self.registry.commands.get(name)
            if cmd:
                self.log_msg(f"  [{gold}]{cmd['usage']:<44}[/] [{muted}]{cmd['desc']}[/]")
        self.log_msg(f"[{purple}]Clerical RAID[/]")
        for name in ("/cleri-scan", "/cleri-diagnose", "/cleri-train", "/cleri-stats",
                     "/cleri-probe", "/cleri-query", "/cleri-ingest", "/cleri-cluster",
                     "/cleri-dupes", "/cleri-maint", "/cleri-feedback", "/cleri-rebuild"):
            cmd = self.registry.commands.get(name)
            if cmd:
                self.log_msg(f"  [{gold}]{cmd['usage']:<44}[/] [{muted}]{cmd['desc']}[/]")
        self.log_msg(f"[{purple}]Archive of Dominance[/]")
        for name in ("/archive", "/archive-search", "/archive-neighbors", "/archive-status"):
            cmd = self.registry.commands.get(name)
            if cmd:
                self.log_msg(f"  [{gold}]{cmd['usage']:<44}[/] [{muted}]{cmd['desc']}[/]")
        self.log_msg(f"[{purple}]BytecodeHealth[/]")
        for name in ("/health", "/health-emit", "/health-verify"):
            cmd = self.registry.commands.get(name)
            if cmd:
                self.log_msg(f"  [{gold}]{cmd['usage']:<44}[/] [{muted}]{cmd['desc']}[/]")
        self.log_msg(f"[{purple}]Brain Daemon[/]")
        for name in ("/daemon-start", "/daemon-stop"):
            cmd = self.registry.commands.get(name)
            if cmd:
                self.log_msg(f"  [{gold}]{cmd['usage']:<44}[/] [{muted}]{cmd['desc']}[/]")
        self.log_msg(f"[{purple}]Refactor[/]")
        for name in ("/refactor-all", "/write-file"):
            cmd = self.registry.commands.get(name)
            if cmd:
                self.log_msg(f"  [{gold}]{cmd['usage']:<44}[/] [{muted}]{cmd['desc']}[/]")
        self.log_msg(f"[{purple}]Session[/] /clear · /copy · /exit")

    def compose(self):
        return get_layout()

    def on_mount(self):
        self.register_theme(SCHOLOMANCE_THEME)
        self.theme = "scholomance"
        self.title = "DivTube Cockpit"
        self.sub_title = "Determinism Engine"
        self._render_banner()
        self.log_msg(f"[{MUTED}]Determinism engine active · UI wrapper engaged.[/]")
        if getattr(self, "turbo", None) and self.turbo.available:
            mode = "semantic embeddings" if self.turbo.semantic else "lexical hashing"
            self.log_msg(f"[{SUCCESS}]●[/] TurboQuant SEO plugin online [{MUTED}](zero-GPU local vector search · {mode}).[/]")
        else:
            self.log_msg(f"[{WARNING}]●[/] TurboQuant plugin offline [{MUTED}](Node not found — SEO commands disabled).[/]")
        self.log_msg(f"Type [bold {GOLD}]/help[/] for commands.\n")

    def _render_banner(self):
        title = "✦  D I V T U B E   C O C K P I T  ✦"
        sub   = "determinism engine · cockpit online"
        width = max(len(title), len(sub)) + 4
        bar   = "─" * (width - 2)
        self.log_msg(f"[{CRIMSON}]╭{bar}╮[/]")
        self.log_msg(f"[{CRIMSON}]│[/][bold {GOLD}]{title.center(width - 2)}[/][{CRIMSON}]│[/]")
        self.log_msg(f"[{CRIMSON}]│[/][{PURPLE_LT}]{sub.center(width - 2)}[/][{CRIMSON}]│[/]")
        self.log_msg(f"[{CRIMSON}]╰{bar}╯[/]")

    def set_ai_state(self, state):
        def _update():
            chat = self._get_active_chat()
            base_title = str(chat.border_title).split("  [")[0] if chat.border_title else "✦ COCKPIT ✦"
            if state == "thinking":
                chat.border_title = f"{base_title}  [bold #3b82f6]ᗣ THINKING[/]"
            elif state == "looking":
                chat.border_title = f"{base_title}  [bold #ef4444]ᗣ LOOKING[/]"
            elif state == "responding":
                chat.border_title = f"{base_title}  [bold #eab308]ᗣ RESPONDING[/]"
            else:
                chat.border_title = base_title
        self.call_from_thread(_update)

    def typewriter_log_msg(self, msg, delay=0.005):
        """Simulates the AI typing out its response."""
        def _task():
            box = self.query_one("#typewriter-box")
            self.call_from_thread(lambda: box.add_class("-active"))
            self.call_from_thread(lambda: setattr(box, "border_title", "❖ AI IS TYPING... ❖"))
            
            from rich.markdown import Markdown
            current_text = ""
            # Chunk the string by words to make it look like fast typing
            words = msg.split(" ")
            for i, word in enumerate(words):
                current_text += word + (" " if i < len(words) - 1 else "")
                # Update the box with rendered Markdown
                self.call_from_thread(box.update, Markdown(current_text))
                import time
                time.sleep(delay)
                
            # Once done, push the final message to the rich log and hide the box
            self.call_from_thread(lambda: box.remove_class("-active"))
            self.call_from_thread(lambda: box.update(""))
            self.call_from_thread(lambda: self.log_msg(Markdown(msg)))
            self.call_from_thread(lambda: self.log_msg("\n"))

        import threading
        threading.Thread(target=_task, daemon=True).start()

    def _get_active_chat(self):
        try:
            tabs = self.query_one("#agent-tabs")
            active = tabs.active
            if active:
                tab_id = active.split("-")[1]
                return self.query_one(f"#chat-{tab_id}")
        except Exception:
            pass
        return self.query_one("#chat-divtube")

    def log_msg(self, msg):
        def _write():
            chat = self._get_active_chat()
            try:
                chat.write(msg)
            except MarkupError:
                # Malformed Rich markup (stray "[/]"/mismatched tags from raw
                # user, LLM, file or tool text) must never crash the TUI. Fall
                # back to writing the text with its markup neutralised.
                chat.write(_escape_markup(msg) if isinstance(msg, str) else msg)
            # Keep a plain-text mirror for /copy.
            try:
                if isinstance(msg, str):
                    plain = Text.from_markup(msg).plain
                elif hasattr(msg, "markup"):
                    # Rich Markdown objects expose their source markup.
                    plain = Text.from_markup(msg.markup).plain
                else:
                    # Other rich renderables — best-effort stringification.
                    plain = str(msg)
            except Exception:
                plain = str(msg)
            if chat.id:
                self._chat_text_mirror.setdefault(chat.id, []).append(plain)
        if self._thread_id == threading.get_ident():
            _write()
        else:
            self.call_from_thread(_write)

    def show_code(self, code: str, filename: str = "", language: str = "python"):
        """Render *code* into the dedicated CodeBox panel with syntax highlighting."""
        def _render():
            viewer = self.query_one("#code-viewer")
            lang = _guess_language(filename) if filename else language
            viewer.set_code(code, filename=filename, language=lang)
            viewer.border_title = f"❖ CODE ❖ — {filename or 'snippet'}"
            viewer.styles.display = "block"
        if self._thread_id == threading.get_ident():
            _render()
        else:
            self.call_from_thread(_render)

    def hide_code(self):
        """Hide the code viewer panel."""
        def _hide():
            viewer = self.query_one("#code-viewer")
            viewer.styles.display = "none"
        if self._thread_id == threading.get_ident():
            _hide()
        else:
            self.call_from_thread(_hide)

    def on_unmount(self):
        if getattr(self, "turbo", None):
            self.turbo.shutdown()
    @on(CommandSubmitted)
    def on_command_submitted(self, event: CommandSubmitted):
        val = event.value.strip()
        if val:
            if not self.cmd_history or self.cmd_history[-1] != val:
                self.cmd_history.append(val)
            self.cmd_index = len(self.cmd_history)

        import os
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            
        # Escape the raw message: user text may contain Rich markup sequences
        # (e.g. a stray "[/]") that would otherwise break markup rendering.
        self.log_msg(f"\n[bold #FFD700]▸[/] [bold #FFFFFF]{_escape_markup(val)}[/]")

        # ── bare @file reference (no command) ────────────────────────
        if val.startswith("@") and not val.startswith("/"):
            rel = val[1:]
            full = os.path.join(project_root, rel)
            if not os.path.isfile(full):
                full = rel if os.path.isabs(rel) else os.path.abspath(rel)
            if os.path.isfile(full):
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except Exception as exc:
                    self.log_msg(f"[#FF5C7A]✗ Cannot read {full}: {exc}[/]")
                    return
                os.path.splitext(full)[1].lower()
                short = os.path.relpath(full, project_root)
                self.log_msg(f"\n[bold #B388FF]📎 @{short}[/] [#6A5A6A]({len(content)} B)[/]")
                self.log_msg("[#8B5CF6]━━━ file ──────────────────[/]")
                self.log_msg(f"[#E2E8F0]{content[:5000]}[/]")
                if len(content) > 5000:
                    self.log_msg(f"[#6A5A6A]… ({len(content) - 5000} more bytes)[/]")
                self.log_msg("[#8B5CF6]━━━━━━━━━━━━━━━━━━━━━━━━━[/]\n")
            else:
                self.log_msg(f"[#FF5C7A]✗ File not found: {full}[/]")
            return

        # ── command dispatch ─────────────────────────────────────────
        if val.startswith("/"):
            self.registry.parse_and_execute(val, self)
        else:
            if "youtube.com" in val or "youtu.be" in val:
                self.log_msg("[#6A5A6A]Auto-detecting URL… running analysis.[/]")
                self.agent.run_command("1", val, self.log_msg, self)
            else:
                self.registry.parse_and_execute(f"/prompt {val}", self)

    @on(events.Paste)
    def on_paste(self, event: events.Paste) -> None:
        event.prevent_default()
        text = event.text.strip()
        import os
        if os.path.exists(text) and os.path.isfile(text):
            ext = os.path.splitext(text)[1].lower()
            cmd = None
            if ext == ".json":
                cmd = f"/critique {text}"
            elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
                cmd = f"/thumbnail {text}"
            elif ext == ".md":
                cmd = f"/scholomance {text}"

            if cmd:
                inp = self.query_one("#command-input")
                inp.text = cmd
                inp.focus()
            else:
                inp = self.query_one("#command-input")
                inp.text = text
                inp.focus()

    def _show_log_tail(self, args: list[str]) -> None:
        """Open live log tail widget."""
        self.push_screen(WidgetModalScreen(LogTailWidget(), "❖ LIVE LOG TAIL ❖"))

    def _show_registry(self, args: list[str]) -> None:
        """Open TurboQuant registry inspector."""
        self.push_screen(WidgetModalScreen(RegistryInspectorWidget(), "❖ TURBOQUANT REGISTRY ❖"))

    def handle_keys(self, event: events.Key):
        try:
            input_widget = self.query_one("#command-input")
            if not input_widget.has_focus:
                return
        except Exception:
            return

        if event.key == "up":
            if self.cmd_history and self.cmd_index > 0:
                self.cmd_index -= 1
                input_widget.text = self.cmd_history[self.cmd_index]
                input_widget.cursor_location = (0, len(input_widget.text))
                event.prevent_default()
        elif event.key == "down":
            if self.cmd_history and self.cmd_index < len(self.cmd_history) - 1:
                self.cmd_index += 1
                input_widget.text = self.cmd_history[self.cmd_index]
                input_widget.cursor_location = (0, len(input_widget.text))
                event.prevent_default()
            elif self.cmd_history and self.cmd_index == len(self.cmd_history) - 1:
                self.cmd_index = len(self.cmd_history)
                input_widget.text = ""
                event.prevent_default()
        elif event.key == "tab":
            self._complete_at_reference(input_widget)
            event.prevent_default()
    @on(TextArea.Changed, "#command-input")
    def on_input_changed(self, event: TextArea.Changed):
        input_widget = event.text_area
        val = input_widget.text
        row, col = input_widget.cursor_location
        if row == 0 and col > 0 and col <= len(val) and val[col - 1] == "@":
            if col == 1 or val[col - 2] in (" ", "\t", "\n"):
                def on_selected(path):
                    if path:
                        new_val = val[:col - 1] + "@" + path + " " + val[col:]
                        input_widget.text = new_val
                        input_widget.cursor_location = (row, (col - 1) + len("@" + path + " "))
                    input_widget.focus()
                self.push_screen(FileSelectScreen(getattr(self, "archive", None)), on_selected)

    def _complete_at_reference(self, input_widget):
        """Tab-complete ``@`` file references in the command input."""
        import os
        val = input_widget.text
        row, cursor = input_widget.cursor_location
        if cursor == 0:
            return

        # find the start of the current token under cursor
        start = cursor
        while start > 0 and val[start - 1] not in (" ", "\t", "\n"):
            start -= 1

        token = val[start:cursor]
        if not token.startswith("@"):
            return

        prefix = token[1:]  # what comes after @
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        # if prefix contains a /, split dir and file prefix for globbing
        dir_part = os.path.dirname(prefix) if "/" in prefix else ""
        file_prefix = os.path.basename(prefix) if prefix else ""
        search_dir = os.path.join(project_root, dir_part) if dir_part else project_root

        if not os.path.isdir(search_dir):
            return

        matches = []
        try:
            for entry in sorted(os.listdir(search_dir)):
                if entry.startswith(file_prefix):
                    full = os.path.join(search_dir, entry)
                    if os.path.isfile(full) or os.path.isdir(full):
                        display = entry + ("/" if os.path.isdir(full) else "")
                        if not display.startswith(file_prefix):
                            continue
                        matches.append(display)
        except PermissionError:
            return

        if not matches:
            return

        if len(matches) == 1:
            # auto-complete
            new_val = val[:start] + "@" + (dir_part + "/" if dir_part else "") + matches[0].rstrip("/") + val[cursor:]
            input_widget.text = new_val
            input_widget.cursor_location = (row, start + len("@" + (dir_part + "/" if dir_part else "") + matches[0].rstrip("/")))
        else:
            # show options in chat
            self.log_msg(f"[#6A5A6A]@{prefix} → {', '.join(matches)}[/]")

def _persist_crash(header, exc_text):
    """Append a crash traceback to error.log + a timestamped crash file.

    Textual restores the terminal on exit, so an unhandled traceback usually
    scrolls away (or the window closes) before it can be read. Persisting it
    makes every crash recoverable after the fact — error.log is also tailed
    live by the in-app /log view.
    """
    import datetime
    now = datetime.datetime.now()
    banner = f"\n===== {header} {now.isoformat(timespec='seconds')} =====\n{exc_text}"
    for path in ("error.log", f"crash-{now:%Y%m%d-%H%M%S}.log"):
        try:
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(banner)
        except OSError:
            pass
    try:
        import sys
        sys.stderr.write(banner)
        sys.stderr.flush()
    except Exception:
        pass


if __name__ == "__main__":
    import threading as _threading
    import traceback as _traceback

    # Worker-thread crashes (e.g. the typewriter/agent threads) otherwise die
    # silently — capture those too.
    def _thread_excepthook(args):
        _persist_crash(
            f"THREAD CRASH ({args.thread.name})",
            "".join(_traceback.format_exception(
                args.exc_type, args.exc_value, args.exc_traceback)),
        )
    _threading.excepthook = _thread_excepthook

    app = DivTubeAgentApp()
    try:
        app.run()
    except Exception:
        # Main-thread / message-loop crash surfaced by Textual after exit.
        _persist_crash("CRASH", _traceback.format_exc())
        raise
