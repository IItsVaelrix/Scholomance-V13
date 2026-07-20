# DivTube Test Run Panel Design

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Scope:** Replace QBIT Field Radar with an animated Test Run panel driven by `test_run`

## Goal

When DivTube agents (or users) invoke `test_run`, the right-panel slot that currently shows **QBIT FIELD RADAR** becomes a live **TEST RUN** board: progress while the suite runs, then a staggered per-test cascade so the operator can see tests go through.

## Decisions

| Topic | Choice |
|-------|--------|
| Surface | Dedicated right-panel widget (not chat-only) |
| Radar | Removed from layout; replaced by Test Run panel |
| Motion | Hybrid: live progress while running + cascade playback when results land |
| Trigger | `test_run` tool (vitest / npm) |

## Architecture

### Layout

- Remove `SCD64Radar` from `divtube_downloader/tui/ui/layout.py`.
- Mount new `TestRunPanel` with `id="test-run"` in the same right-column slot.
- CSS: migrate `#radar` rules in `app.tcss` to `#test-run` (same height/margins).
- Remove radar `update_state` / `radar_loop` wiring from `app.py`.

### Widget: `TestRunPanel`

Border title: `TEST RUN` (via existing `title()` sigil helper).

| State | Display |
|-------|---------|
| `idle` | Dim “◦ awaiting test_run” / “no suite in flight” |
| `running` | Runner + optional target; progress bar; spinner |
| `playing` | Staggered rows: `…` → `✓` / `✗` / `○` |
| `done` | Final list + tally `passed / failed / skipped` |

Public methods (called via `call_from_thread` from tool workers):

- `begin_run(runner, target=None, suite=None)`
- `on_progress(fraction=None, line=None)` — best-effort while process runs
- `play_results(tests, passed, failed, skipped, ok)` — cascade then settle on `done`
- `fail(message)` — error path (timeout / spawn failure)

### Data path

1. `_test_run` calls `begin_run` on the panel (resolve widget from app/callback self).
2. `harness_tools.run_tests` streams stdout lines (or elapsed ticks) → `on_progress`.
3. On completion, parsed structured tests feed `play_results`.
4. Vitest JSON preferred for per-test cascade; npm may show a single suite row if per-test IDs are unavailable.

Cascade timing: ~40–80ms per row (Textual `set_interval` or async sleep), cancelable if a new run starts.

## File map

| File | Change |
|------|--------|
| `divtube_downloader/tui/ui/widgets/test_run_panel.py` | New widget |
| `divtube_downloader/tui/ui/layout.py` | Swap radar → panel |
| `divtube_downloader/tui/ui/app.tcss` | `#radar` → `#test-run` |
| `divtube_downloader/tui/ui/app.py` | Remove radar loop; optional panel handle |
| `divtube_downloader/tui/services/harness_tools.py` | Stream hooks for `run_tests` |
| `divtube_downloader/tui/services/tool_service.py` | Drive panel from `_test_run` |
| `divtube_downloader/tests/` | Widget/state helper unit tests (no full TUI) |

## Out of scope

- Keeping or toggling QBIT field radar
- Chat-log cascade (panel is the presentation surface)
- Playwright / browser test UI
- Changing `test_run` runner enum beyond existing vitest/npm

## Success criteria

- Right panel shows **TEST RUN**, not **QBIT FIELD RADAR**
- Invoking `test_run` shows running progress, then animated per-test results and a final tally
- Idle state is clear when no suite is active
- A second `test_run` cancels/replaces an in-flight cascade cleanly
