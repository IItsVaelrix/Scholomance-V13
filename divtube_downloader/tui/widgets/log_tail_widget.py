"""Live log tail widget for DivTube Cockpit.

Watches error.log + app.log and streams new lines into a scrollable view.
"""

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
                    self.write(f"[dim]{path}[/]: {line.rstrip()}")
            time.sleep(0.4)
