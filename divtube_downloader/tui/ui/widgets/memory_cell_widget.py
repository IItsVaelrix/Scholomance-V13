"""Memory Cell Grid Widget — visualises persistent memory as a grid of cells.

Each cell is a small coloured square reflecting its status:
  ● OCCUPIED (purple/gold)  — data stored, recently read
  ● DORMANT  (dim/muted)    — stored but not accessed recently
  ● EMPTY    (dark)         — slot available
  ● ANOMALY  (red/orange)   — osmosis detected drift or antigen match

The grid is 8×8 = 64 slots, matching the capacity of the MemoryService.
Clicking a cell shows its contents + osmosis state in the chat log.

All colours resolve through theme.palette() via semantic ROLES — the widget
never names a hex value (Professional UI Architect Law 2).
"""

import hashlib
from textual.widgets import Static, Button
from textual.containers import Grid
from textual import on
from tui.ui.sigils import title
from tui.ui.theme import palette

# status -> palette ROLE (resolved against the active palette at render time)
_STATUS_ROLES = {
    "hot": "highlight",        # reads > 10
    "warm": "accent_tertiary", # reads > 3
    "live": "accent_secondary",
    "clean": "success",
}

# ── Anomaly roles ───────────────────────────────────────────────────
_ANOMALY_ROLES = {
    "none":              None,       # Use normal status color
    "baseline_drift":    "warning",
    "antigen_match":     "error",
    "concentration":     "warning",
}

_ANOMALY_GLYPHS = {
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

    def _p(self) -> dict:
        return palette(getattr(self.app, "THEME_NAME", None))

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
        p = self._p()
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
                    role = _ANOMALY_ROLES.get(anomaly_kind, "error")
                    color = p[role]
                    glyph = _ANOMALY_GLYPHS.get(anomaly_kind, "⚠")
                elif reads > 10:
                    color = p[_STATUS_ROLES["hot"]]
                    glyph = "◆"
                elif reads > 3:
                    color = p[_STATUS_ROLES["warm"]]
                    glyph = "◈"
                else:
                    color = p[_STATUS_ROLES["live"]]
                    glyph = "◇"

                # If scanned and clean, show a subtle checkmark
                if osm and not is_anomaly and osm.get("scan_count", 0) > 0:
                    glyph = "✓"
                    color = p["success"] if reads > 3 else p["accent_secondary"]

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
                btn.styles.background = p["surface"]
                btn.styles.color = p["muted"]
                btn.styles.border = ("solid", p["muted"] + "40")
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
        p = self._p()
        btn_id = event.button.id
        if btn_id not in self._cell_map:
            if self._log:
                self._log(f"[{p['muted']}]Empty memory cell — nothing stored here.[/]")
            return
        cdata = self._cell_map[btn_id]
        osm = cdata.get("osmosis")

        lines = [
            f"\n[{p['highlight']}]❖ MEMORY CELL ❖[/]  [{p['accent_tertiary']}]{cdata['cell_id']}[/]",
            f"  [{p['muted']}]Key:[/]    [{p['success']}]{cdata['key']}[/]",
            f"  [{p['muted']}]Reads:[/]  {cdata['reads']}",
            f"  [{p['muted']}]Status:[/] [{p['accent_secondary']}]{cdata['status']}[/]",
            f"  [{p['muted']}]Value:[/]  {cdata['preview']}",
        ]

        if osm:
            anomaly_kind = osm.get("anomaly_kind", "none")
            is_anomaly = osm.get("status") == "anomaly"
            if is_anomaly:
                anomaly_color = p[_ANOMALY_ROLES.get(anomaly_kind, "muted")]
            else:
                anomaly_color = p["success"]
            anomaly_glyph = _ANOMALY_GLYPHS.get(anomaly_kind, "◇") if is_anomaly else "✓"

            lines.append("")
            lines.append(f"  [{p['accent_tertiary']}]⬡ SUBSTRATE OSMOSIS[/]")
            lines.append(
                f"  [{anomaly_color}]{anomaly_glyph}[/] Status: "
                f"[{anomaly_color}]{osm.get('status', '?')}[/]"
                + (f"  ({anomaly_kind})" if is_anomaly else "")
            )
            lines.append(
                f"  [{p['muted']}]  Similarity:[/] {osm.get('similarity', 0):.4f}  "
                f"[{p['muted']}]Drift:[/] {osm.get('drift', 0):.4f}  "
                f"[{p['muted']}]Confidence:[/] {osm.get('confidence', 0):.4f}"
            )
            lines.append(
                f"  [{p['muted']}]  Scans:[/] {osm.get('scan_count', 0)}  "
                f"[{p['muted']}]Last:[/] {osm.get('last_scan', 'never')}"
            )

        if self._log:
            self._log("\n".join(lines))
