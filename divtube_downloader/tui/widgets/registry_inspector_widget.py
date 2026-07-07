"""TurboQuant Registry Inspector widget.

Allows browsing/searching the 100k+ line turboquant_registry.json from inside the TUI.
"""

from textual.widgets import DataTable
import json
import os

REGISTRY_PATH = "turboquant_registry.json"


class RegistryInspectorWidget(DataTable):
    """Interactive DataTable showing registry entries."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.add_columns("ID", "Score", "Tags", "Path")

    def on_mount(self):
        self.load_registry()

    def load_registry(self):
        if not os.path.exists(REGISTRY_PATH):
            self.add_row("—", "—", "Registry not found", "")
            return

        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            self.add_row("ERR", str(e), "", "")
            return

        # Expect list of dicts with id/score/tags/path or similar
        for entry in data[:500]:  # limit initial load
            self.add_row(
                str(entry.get("id", "")),
                str(entry.get("score", "")),
                ", ".join(entry.get("tags", []))[:40],
                entry.get("path", "")[:60],
            )
