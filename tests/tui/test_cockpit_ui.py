"""Cockpit UI guard rails (Professional UI Architect skill).

Covers, with headless Textual pilot runs:
  * sidebar data contract: every command is a button with id + tooltip
  * sidebar live filter: narrow / empty / clear — deterministic
  * sidebar → command input wiring
  * inspector palette-driven rows with stable ids
  * activity glyph: state-driven pulse + reduced-motion static fallback
  * theme token parallelism (both palettes key-for-key)
  * LAW 2 guard: no raw hex in tui/ui/**/*.py outside theme.py
    (zero exemptions — app.py's chat markup is palette-derived)

Runs under PLAIN pytest (no asyncio plugin): each scenario drives the
Textual pilot inside asyncio.run().

Run:  divtube_downloader/.venv/bin/python -m pytest tests/tui -q
"""

import asyncio
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
_DT = ROOT / "divtube_downloader"
if str(_DT) not in sys.path:
    sys.path.insert(0, str(_DT))

from textual.app import App, ComposeResult          # noqa: E402
from textual.containers import Vertical              # noqa: E402
from textual.widgets import TextArea                 # noqa: E402

from tui.ui.theme import THEMES, palette             # noqa: E402
from tui.ui.widgets.sidebar import (                 # noqa: E402
    SECTIONS,
    COMMAND_HINTS,
    Sidebar,
    _ALL_CMD_COUNT,
)
from tui.ui.widgets.inspector import Inspector       # noqa: E402
from tui.ui.widgets.glyph import AnimatedGlyph, build_frames  # noqa: E402
from tui.ui.widgets.test_run_panel import (          # noqa: E402
    format_test_row,
    format_progress_bar,
)


class HarnessApp(App):
    """Minimal cockpit shell: sidebar + inspector + command input."""

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Sidebar(id="sidebar")
            yield Inspector(id="inspector")
            yield TextArea(id="command-input")


def _run(scenario) -> None:
    async def wrapper():
        app = HarnessApp()
        async with app.run_test(size=(120, 40)) as pilot:
            await scenario(app, pilot)
    asyncio.run(wrapper())


# ── theme tokens ────────────────────────────────────────────────────────

def test_theme_palettes_are_key_parallel():
    """theme.py contract: every theme defines the SAME key set."""
    keys = [set(t.keys()) for t in THEMES.values()]
    assert all(k == keys[0] for k in keys), "theme palettes drifted"


def test_palette_fallback_never_raises():
    assert palette(None) == THEMES["obsidian_crimson"]
    assert palette("no-such-theme") == THEMES["obsidian_crimson"]


def test_glyph_frames_are_deterministic():
    p = palette(None)
    assert build_frames(p) == build_frames(p)
    assert len(build_frames(p)) == 6


# ── sidebar data contract ───────────────────────────────────────────────

def test_sidebar_every_command_is_a_button():
    async def scenario(app, pilot):
        buttons = app.query(".sidebar-button")
        assert len(buttons) == _ALL_CMD_COUNT == sum(len(c) for _, c in SECTIONS)
        ids = [b.id for b in buttons]
        assert len(set(ids)) == len(ids), "button ids must be unique"
        for b in buttons:
            cmd = str(b.label)
            assert b.id == "cmd-" + cmd.lstrip("/").replace("/", "-")
            assert b.tooltip, f"{cmd} has no tooltip"
            # tooltip must be truthful metadata, not the command itself
            assert b.tooltip != cmd
        headings = app.query(".sidebar-heading")
        assert len(headings) == len(SECTIONS)
    _run(scenario)


def test_every_command_has_a_hint():
    for _heading, cmds in SECTIONS:
        for c in cmds:
            assert c in COMMAND_HINTS, f"missing hint for {c}"


def test_sidebar_button_fills_command_input():
    async def scenario(app, pilot):
        btn = app.query_one("#cmd-download")
        btn.press()
        await pilot.pause()
        cmd_input = app.query_one("#command-input")
        assert cmd_input.value == "/download "
    _run(scenario)


# ── sidebar filter ──────────────────────────────────────────────────────

def test_sidebar_filter_narrows_deterministically():
    async def scenario(app, pilot):
        flt = app.query_one("#sidebar-filter")
        no_match = app.query_one("#sidebar-no-match")

        def visible_buttons():
            return [b for b in app.query(".sidebar-button") if b.display]

        flt.value = "cleri"
        await pilot.pause()
        vis = visible_buttons()
        assert len(vis) == 12, f"expected 12 cleri commands, got {len(vis)}"
        assert all("cleri" in str(b.label) for b in vis)
        visible_headings = [h for h in app.query(".sidebar-heading") if h.display]
        assert len(visible_headings) == 1
        assert not no_match.display

        flt.value = "zzz-no-such-command"
        await pilot.pause()
        assert visible_buttons() == []
        assert no_match.display

        flt.value = ""
        await pilot.pause()
        assert len(visible_buttons()) == _ALL_CMD_COUNT
        assert not no_match.display
    _run(scenario)


# ── inspector ───────────────────────────────────────────────────────────

def test_inspector_rows_present_and_offline_honest():
    async def scenario(app, pilot):
        for row_id in ("insp-memory", "insp-health", "insp-archive", "insp-cleri",
                       "insp-prompt", "insp-engine", "insp-tokens"):
            assert app.query_one("#" + row_id) is not None
        await pilot.pause()
        # harness has no health service → must say OFFLINE, never a fake ONLINE
        health_markup = str(app.query_one("#insp-health").render())
        assert "OFFLINE" in health_markup
    _run(scenario)


# ── activity glyph: state-driven + reduced-motion ───────────────────────

def test_glyph_pulse_and_stop():
    async def scenario(app, pilot):
        glyph = app.query_one("#activity-glyph", AnimatedGlyph)
        assert glyph.display is False, "idle glyph must not occupy space"
        glyph.pulse(cycles=1)
        assert glyph.display is True
        assert glyph.animation_timer is not None
        glyph.stop()
        assert glyph.display is False
        assert glyph.animation_timer is None
    _run(scenario)


def test_glyph_reduced_motion_is_static():
    async def scenario(app, pilot):
        app.animation_level = "none"          # user opted out of motion
        glyph = app.query_one("#activity-glyph", AnimatedGlyph)
        glyph.pulse(cycles=2)
        assert glyph.display is True, "reduced-motion must still signal activity"
        assert glyph.animation_timer is None, "no frame cycling under reduced motion"
        assert glyph.frame_index == 3
        glyph.stop()
        assert glyph.display is False
    _run(scenario)


# ── test-run panel helpers stay palette-driven ──────────────────────────

def test_test_run_helpers_use_palette_colours():
    p = palette("obsidian_crimson")
    row = format_test_row("my-test", "pass", p=p)
    assert p["success"] in row and "✓" in row
    bar = format_progress_bar(0.5, p=p)
    assert p["warning"] in bar


# ── LAW 2 guard: no raw hex outside theme.py ────────────────────────────

_HEX = re.compile(r"#[0-9a-fA-F]{6}\b")

# Documented legacy exemptions. Every entry is debt with a reason, not a
# permission slip — shrink this list, never grow it.
HEX_EXEMPT: set = set()
# Zero exemptions remain: app.py's chat markup was swept to palette-derived
# constants (follow-up to 72660737, 66 inline sites + ternaries). theme.py
# is the ONLY file permitted to carry raw hex, enforced by the test below.


def test_no_raw_hex_in_ui_outside_theme():
    ui_dir = _DT / "tui" / "ui"
    offenders = {}
    for py in ui_dir.rglob("*.py"):
        if py.name in HEX_EXEMPT or py.name == "theme.py":
            continue
        hits = []
        for lineno, line in enumerate(py.read_text().splitlines(), 1):
            if _HEX.search(line):
                hits.append((lineno, line.strip()[:80]))
        if hits:
            offenders[str(py.relative_to(ROOT))] = hits
    assert not offenders, f"raw hex leaked outside theme.py: {offenders}"
