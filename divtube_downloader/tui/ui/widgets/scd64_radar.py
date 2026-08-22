from textual.widgets import Static
from rich.text import Text
from rich.panel import Panel
from tui.ui.sigils import title
from tui.ui.theme import palette


def _dormant_markup(p: dict) -> str:
    # Shown before any qbit state arrives (cold boot) or whenever the field is
    # idle, so the panel reads as "waiting", not blank/broken.
    return f"[{p['muted']}]◦ field dormant[/]\n[{p['muted']}]no qbits in flight[/]"


class SCD64Radar(Static):
    def __init__(self, **kwargs):
        super().__init__(_dormant_markup(palette(None)), **kwargs)
        self.border_title = title("QBIT FIELD RADAR")
        self.agents = []
        self.seeds = []

    def _p(self) -> dict:
        return palette(getattr(self.app, "THEME_NAME", None))

    def update_state(self, state):
        self.dimensions = state.get("dimensions", {"x": 32, "y": 32, "z": 32})
        self.agents = state.get("agents", [])
        self.seeds = state.get("seeds", [])
        self._refresh_radar()

    def _refresh_radar(self):
        p = self._p()
        if not self.agents and not self.seeds:
            self.update(_dormant_markup(p))
            return

        lines = []
        grid_size = 16
        
        # Determine scale dynamically based on dimensions
        scale_x = self.dimensions.get("x", 32) / grid_size
        scale_y = self.dimensions.get("y", 32) / grid_size

        for y in range(grid_size):
            line = []
            for x in range(grid_size):
                # Scale grid coordinates to engine coordinates
                px = x * scale_x
                py = y * scale_y
                
                char = "·"
                style = p["panel_border"]  # dim dot
                
                # Check seeds
                for s in self.seeds:
                    # Map coordinates within scaled cell bounds
                    if px <= s["x"] < px + scale_x and py <= s["y"] < py + scale_y:
                        char = "◈"
                        style = p["error"]
                
                # Check agents
                for a in self.agents:
                    if px <= a["x"] < px + scale_x and py <= a["y"] < py + scale_y:
                        char = "○"
                        style = p["success"]
                        if a.get("status") == "SYNTHESIZING":
                            char = "●"
                            style = p["highlight"]
                            
                line.append(f"[{style}]{char}[/]")
            lines.append(" ".join(line))
            
        display_text = "\n".join(lines)
        self.update(display_text)
