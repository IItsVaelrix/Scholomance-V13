"""Live log tail widget for DivTube Cockpit.

Watches error.log + app.log and streams new lines into a scrollable view.

MARKUP SAFETY: log lines are arbitrary text — they routinely contain Rich
markup characters typed by users, emitted by the LLM, or copied from tool
output (e.g. ``mismatched [bold]hi[/italic] tags``). Rendering such a line
raw through a markup-enabled RichLog raises ``rich.errors.MarkupError`` on
the Textual main thread and kills the whole TUI (same failure class as the
chat-log crash fixed in app.py::_write_to_chat). Every dynamic value is
therefore escaped, and the write itself is fenced with a plain-text
fallback.
"""

from rich.errors import MarkupError
from rich.markup import escape
from textual.widgets import RichLog
import os
import threading
import time

LOG_PATHS = ["error.log", "app.log"]


class LogTailWidget(RichLog):
    """Auto-tailing RichLog that follows the last N lines of the log files."""

    def __init__(self, max_lines: int = 200, **kwargs):
        super().__init__(highlight=True, markup=True, wrap=True, **kwargs)
        self.max_lines = max_lines
        self._stop = False
        self._thread = None

    @staticmethod
    def _format_line(path: str, line: str) -> str:
        """Build the markup for one tail line with all dynamic text escaped.

        NOT named ``_render_line``: RichLog already defines
        ``_render_line(y, scroll_x, width)`` as its scroll renderer, and
        shadowing it with a different signature raises TypeError inside
        Textual's paint loop the moment this widget is mounted.

        Both the path and the line content are attacker-controllable; neither
        may reach the markup parser unescaped.
        """
        return f"[dim]{escape(path)}[/]: {escape(line.rstrip())}"

    def _safe_write(self, markup: str, plain: str) -> None:
        """Write markup to the log; never let a MarkupError escape the widget."""
        try:
            self.write(markup)
        except MarkupError:
            # Belt and braces: escape() should make this unreachable, but a
            # crash here takes down the entire cockpit, so the fallback cost
            # is zero and the insurance is free.
            self.write(plain)

    def on_mount(self):
        self._thread = threading.Thread(target=self._tail_loop, daemon=True)
        self._thread.start()

    def on_unmount(self):
        self._stop = True

    def _tail_loop(self):
        files = {}
        for path in LOG_PATHS:
            if os.path.exists(path):
                f = open(path, "r", encoding="utf-8", errors="ignore")
                f.seek(0, 2)
                files[path] = f

        while not self._stop:
            for path, f in list(files.items()):
                line = f.readline()
                if line:
                    self._safe_write(self._format_line(path, line), line.rstrip())
            time.sleep(0.4)
