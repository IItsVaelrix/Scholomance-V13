"""Memory Cell Grid Widget — visualises persistent memory as a grid of cells.

Each cell is a small coloured square reflecting its status:
  ● OCCUPIED (purple/gold)  — data stored, recently read
  ● DORMANT  (dim/muted)    — stored but not accessed recently
  ● EMPTY    (dark)         — slot available
  ● ANOMALY  (red/orange)   — osmosis detected drift or antigen match

The grid is 8×8 = 64 slots, matching the capacity of the MemoryService.
Clicking a cell shows its contents + osmosis state in the chat log.
"""

import hashlib
from textual.widgets import Static, Button
from textual.containers import Grid
from textual import on
from tui.ui.sigils import title

# ── Scholomance palette (matches app.py) ────────────────────────────
CRIMSON    = "#DC143C"
GOLD       = "#FFD700"
INDIGO     = "#8B5CF6"
PURPLE     = "#8B5CF6"
PURPLE_LT  = "#B388FF"
SUCCESS    = "#7CFF8B"
WARNING    = "#FFD166"
ERROR      = "#FF5C7A"
MUTED      = "#6A5A6A"
BG         = "#0D0D0D"
SURFACE    = "#161616"
CYAN       = "#00E5FF"

# ── Anomaly colors ──────────────────────────────────────────────────
ANOMALY_COLORS = {
    "none":              None,       # Use normal status color
    "baseline_drift":    WARNING,
    "antigen_match":     ERROR,
    "concentration":     "#FF6F00",
}

ANOMALY_GLYPHS = {
    "none":              None,
    "baseline_drift":    "⚠",
    "antigen_match":     "☣",
    "concentration":     "◉",
}

GRID_SIZE = 64  # 8×8
COLS = 8


class MemoryCellWidget(Static):
    """A fixed 8×8 grid of memory cells showing occupancy, activity, and anomaly state."""

    def __init__(self, memory_service=None, substrate_service=None, log_callback=None, **kwargs):
        super().__init__(**kwargs)
        self._memory = memory_service
        self._substrate = substrate_service
        self._log = log_callback
        self._cell_map = {}       # btn_id -> (key, preview, reads, status, osmosis)
        self._auto_refresh = None

    def on_mount(self):
        self.border_title = title("MEMORY CELLS")
        self.styles.height = "22"
        self._build_grid()
        self._auto_refresh = self.set_interval(10.0, self._refresh)

    def compose(self):
        with Grid(id="memcell-grid", classes="memcell-grid"):
            for idx in range(GRID_SIZE):
                yield Button("", id=f"memcell-{idx}", classes="memcell-slot")

    def _build_grid(self):
        """Populate the grid from the memory service + substrate osmosis state."""
        if not self._memory:
            return
        cells = {r["cell_id"]: r for r in self._memory.list_cells()}

        # Load osmosis state if substrate is available
        osmosis_map = {}
        if self._substrate:
            try:
                for osm in self._substrate.get_all_osmosis_states():
                    osmosis_map[osm["cell_id"]] = osm
            except Exception:
                pass

        # Map cells to slots by hashing the cell_id
        self._cell_map = {}
        for idx in range(GRID_SIZE):
            btn = self.query_one(f"#memcell-{idx}")
            if not btn:
                continue
            # Deterministic slot assignment via cell_id hash
            assigned = None
            for cid, cdata in cells.items():
                slot = (int(hashlib.md5(cid.encode()).hexdigest()[:4], 16) % GRID_SIZE)
                if slot == idx:
                    assigned = cdata
                    break

            if assigned:
                osm = osmosis_map.get(assigned["cell_id"])
                self._cell_map[f"memcell-{idx}"] = {**assigned, "osmosis": osm}
                reads = assigned["reads"]
                anomaly_kind = osm["anomaly_kind"] if osm else "none"
                is_anomaly = osm and osm.get("status") == "anomaly"

                # Pick color: anomaly overrides normal status
                if is_anomaly:
                    color = ANOMALY_COLORS.get(anomaly_kind, ERROR)
                    glyph = ANOMALY_GLYPHS.get(anomaly_kind, "⚠")
                elif reads > 10:
                    color = GOLD
                    glyph = "◆"
                elif reads > 3:
                    color = PURPLE_LT
                    glyph = "◈"
                else:
                    color = PURPLE
                    glyph = "◇"

                # If scanned and clean, show a subtle checkmark
                if osm and not is_anomaly and osm.get("scan_count", 0) > 0:
                    glyph = "✓"
                    color = SUCCESS if reads > 3 else PURPLE

                label = assigned["preview"][:6]
                btn.styles.background = color + "30"
                btn.styles.color = color
                btn.styles.border = ("solid", color)
                btn.label = f"{glyph} {label}"

                # Tooltip includes osmosis data
                tooltip_lines = [
                    f"{assigned['cell_id']}",
                    f"{assigned['key']}",
                    f"↻ {reads} reads",
                ]
                if osm:
                    tooltip_lines.append(
                        f"osmosis: {osm.get('status', '?')} "
                        f"(sim={osm.get('similarity', 0):.3f} "
                        f"drift={osm.get('drift', 0):.3f})"
                    )
                btn.tooltip = "\n".join(tooltip_lines)
            else:
                # Empty slot
                btn.styles.background = SURFACE
                btn.styles.color = MUTED
                btn.styles.border = ("solid", MUTED + "40")
                btn.label = "·"
                btn.tooltip = "Empty slot"

    def _refresh(self):
        """Periodic refresh of the grid."""
        if not self._memory:
            return
        try:
            self._build_grid()
        except Exception:
            pass

    def refresh_grid(self):
        """Public method to force a grid refresh."""
        self._build_grid()

    @on(Button.Pressed)
    def _on_cell_click(self, event: Button.Pressed):
        """Show cell contents + osmosis state in the chat log."""
        btn_id = event.button.id
        if btn_id not in self._cell_map:
            if self._log:
                self._log(f"[{MUTED}]Empty memory cell — nothing stored here.[/]")
            return
        cdata = self._cell_map[btn_id]
        osm = cdata.get("osmosis")

        lines = [
            f"\n[{GOLD}]❖ MEMORY CELL ❖[/]  [{PURPLE_LT}]{cdata['cell_id']}[/]",
            f"  [{MUTED}]Key:[/]    [{SUCCESS}]{cdata['key']}[/]",
            f"  [{MUTED}]Reads:[/]  {cdata['reads']}",
            f"  [{MUTED}]Status:[/] [{PURPLE}]{cdata['status']}[/]",
            f"  [{MUTED}]Value:[/]  {cdata['preview']}",
        ]

        if osm:
            anomaly_kind = osm.get("anomaly_kind", "none")
            is_anomaly = osm.get("status") == "anomaly"
            anomaly_color = ANOMALY_COLORS.get(anomaly_kind, MUTED) if is_anomaly else SUCCESS
            anomaly_glyph = ANOMALY_GLYPHS.get(anomaly_kind, "◇") if is_anomaly else "✓"

            lines.append("")
            lines.append(f"  [{CYAN}]⬡ SUBSTRATE OSMOSIS[/]")
            lines.append(
                f"  [{anomaly_color}]{anomaly_glyph}[/] Status: "
                f"[{anomaly_color}]{osm.get('status', '?')}[/]"
                + (f"  ({anomaly_kind})" if is_anomaly else "")
            )
            lines.append(
                f"  [{MUTED}]  Similarity:[/] {osm.get('similarity', 0):.4f}  "
                f"[{MUTED}]Drift:[/] {osm.get('drift', 0):.4f}  "
                f"[{MUTED}]Confidence:[/] {osm.get('confidence', 0):.4f}"
            )
            lines.append(
                f"  [{MUTED}]  Scans:[/] {osm.get('scan_count', 0)}  "
                f"[{MUTED}]Last:[/] {osm.get('last_scan', 'never')}"
            )

        if self._log:
            self._log("\n".join(lines))
