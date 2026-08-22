"""Code viewer panel — Rich syntax highlighting, palette-resolved.

DEFAULT_CSS uses $tokens (resolved from theme.py via App.get_css_variables),
and the Rich Syntax background is read from the live palette at render time,
so a theme swap re-skins the viewer without touching this file.
"""

from textual.widgets import Static
from textual.containers import VerticalScroll
from textual.app import ComposeResult
from rich.syntax import Syntax

from tui.ui.theme import palette


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
    import os
    ext = os.path.splitext(filename)[1].lower()
    return EXT_LANG.get(ext, "text")


class CodeBox(VerticalScroll):
    """A scrollable panel that renders source code with Rich syntax highlighting.

    Each code block is wrapped with line numbers and the theme background so it
    stands out from the chat log.  Pass a *filename* to enable automatic
    language detection, or supply *language* explicitly.
    """

    DEFAULT_CSS = """
    CodeBox {
        width: 1fr;
        height: 1fr;
        background: $background;
        border: round $panel-border;
        border-title-color: $text-secondary;
        border-title-align: center;
        padding: 0 1;
    }
    CodeBox > .code-title {
        text-align: center;
        text-style: bold;
        color: $accent-tertiary;
        padding: 0 1;
        height: 1;
    }
    CodeBox > .code-content {
        width: 1fr;
        height: 1fr;
        background: $background;
        padding: 0 1;
    }
    """

    def __init__(self, filename: str = "", language: str = "text", **kwargs):
        super().__init__(**kwargs)
        self._filename = filename
        self._language = language if language != "text" else _guess_language(filename)
        self._container = None

    def _p(self) -> dict:
        return palette(getattr(self.app, "THEME_NAME", None))

    def _empty_markup(self) -> str:
        m = self._p()["muted"]
        # Shown when no source is loaded, so the panel invites use instead of
        # reading as a blank/broken box.
        return (f"[{m}]no scroll open[/]\n"
                f"[{m}]code surfaces here when you /analyze or open a file[/]")

    def _title_markup(self) -> str:
        return f"[{self._p()['accent_tertiary']}]📄 {self._filename}[/]"

    def compose(self) -> ComposeResult:
        if self._filename:
            yield Static(self._title_markup(), classes="code-title")
        self._container = Static(self._empty_markup(), classes="code-content")
        yield self._container

    def set_code(self, code: str, filename: str = "", language: str | None = None):
        """Replace the displayed code and refresh syntax highlighting."""
        if filename:
            self._filename = filename
        if language:
            self._language = language
        else:
            self._language = _guess_language(self._filename) if self._filename else "text"

        if not self._container:
            return

        if not code.strip():
            self._container.update(self._empty_markup())
            return

        try:
            rich_syntax = Syntax(
                code,
                self._language,
                theme="monokai",
                line_numbers=True,
                word_wrap=False,
                background_color=self._p()["background"],
            )
            self._container.update(rich_syntax)
        except Exception:
            self._container.update(code)

        if self._filename:
            title_nodes = self.query(".code-title")
            if title_nodes:
                title_nodes[0].update(self._title_markup())
            else:
                self.mount(Static(self._title_markup(), classes="code-title"), before=self._container)

    @property
    def code(self) -> str:
        return self._container.renderable.raw if self._container and hasattr(self._container.renderable, 'raw') else ""

    @code.setter
    def code(self, value: str):
        if self._container:
            self.set_code(value)

    @property
    def language(self) -> str:
        return self._language

    @language.setter
    def language(self, value: str):
        self._language = value
        if self._container and self.code:
            self.set_code(self.code, language=value)
