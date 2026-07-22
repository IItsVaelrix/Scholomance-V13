"""Right-panel TEST RUN board — replaces QBIT Field Radar."""

from __future__ import annotations

from textual.widgets import Static

from tui.ui.sigils import title

_IDLE = "[#6A5A6A]◦ awaiting test_run[/]\n[#6A5A6A]no suite in flight[/]"

_STATUS_GLYPH = {
    "pass": ("✓", "#7CFF8B"),
    "fail": ("✗", "#FF5C7A"),
    "skip": ("○", "#6A5A6A"),
    "pending": ("…", "#FFD700"),
}


def format_test_row(name: str, status: str, max_name: int = 28) -> str:
    glyph, color = _STATUS_GLYPH.get(status, ("·", "#6A5A6A"))
    label = name if len(name) <= max_name else name[: max_name - 1] + "…"
    return f"[{color}]{glyph}[/] {label}"


def format_progress_bar(fraction: float, width: int = 16) -> str:
    fraction = max(0.0, min(1.0, fraction))
    filled = int(round(fraction * width))
    bar = "█" * filled + "░" * (width - filled)
    pct = int(fraction * 100)
    return f"[#FFD700]{bar}[/] [#6A5A6A]{pct:3d}%[/]"


class TestRunPanel(Static):
    """Animated test board: running progress, then staggered result cascade."""

    def __init__(self, **kwargs):
        super().__init__(_IDLE, **kwargs)
        self.border_title = title("TEST RUN")
        self._state = "idle"  # idle | running | playing | done | error
        self._runner = ""
        self._target = ""
        self._suite = ""
        self._fraction = 0.0
        self._line = ""
        self._spin_i = 0
        self._tests: list[dict] = []
        self._revealed = 0
        self._passed = 0
        self._failed = 0
        self._skipped = 0
        self._ok = False
        self._error = ""
        self._timer = None
        self._spin_timer = None
        self._run_gen = 0

    def _cancel_timers(self):
        for attr in ("_timer", "_spin_timer"):
            t = getattr(self, attr, None)
            if t is not None:
                try:
                    t.stop()
                except Exception:
                    pass
                setattr(self, attr, None)

    def _safe_interval(self, seconds, callback):
        """set_interval only works on a mounted widget with a running app loop."""
        try:
            if not self.is_attached or getattr(self, "app", None) is None:
                return None
            return self.set_interval(seconds, callback)
        except Exception:
            return None

    def begin_run(self, runner: str, target: str | None = None, suite: str | None = None):
        self._cancel_timers()
        self._run_gen += 1
        self._state = "running"
        self._runner = runner or "vitest"
        self._target = target or ""
        self._suite = suite or ""
        self._fraction = 0.05
        self._line = ""
        self._tests = []
        self._revealed = 0
        self._passed = self._failed = self._skipped = 0
        self._ok = False
        self._error = ""
        self._spin_i = 0
        self._spin_timer = self._safe_interval(0.12, self._tick_spin)
        self._paint()

    def on_progress(self, fraction: float | None = None, line: str | None = None):
        if self._state != "running":
            return
        if fraction is not None:
            self._fraction = max(self._fraction, min(0.95, float(fraction)))
        if line is not None:
            self._line = str(line).strip()[:48]
        self._paint()

    def play_results(
        self,
        tests: list | None,
        passed: int = 0,
        failed: int = 0,
        skipped: int = 0,
        ok: bool = False,
    ):
        self._cancel_timers()
        gen = self._run_gen
        self._state = "playing"
        self._passed = int(passed or 0)
        self._failed = int(failed or 0)
        self._skipped = int(skipped or 0)
        self._ok = bool(ok)
        self._fraction = 1.0
        self._tests = list(tests or [])
        if not self._tests:
            self._tests = [{
                "name": f"{self._runner} suite",
                "status": "pass" if ok else "fail",
            }]
        self._revealed = 0
        self._paint()

        def tick():
            if gen != self._run_gen:
                return
            self._revealed += 1
            if self._revealed >= len(self._tests):
                self._cancel_timers()
                self._state = "done"
            self._paint()

        self._timer = self._safe_interval(0.055, tick)
        if self._timer is None:
            # Off-app / no event loop (unit tests): reveal all immediately.
            self._revealed = len(self._tests)
            self._state = "done"
            self._paint()

    def fail(self, message: str):
        self._cancel_timers()
        self._state = "error"
        self._error = (message or "test_run failed")[:120]
        self._paint()

    def _tick_spin(self):
        if self._state != "running":
            return
        self._spin_i = (self._spin_i + 1) % 4
        self._paint()

    def _paint(self):
        """Push board markup into Static content.

        Must NOT be named ``_render`` — that shadows Textual Widget._render()
        and crashes the compositor with a None visual.
        """
        if self._state == "idle":
            self.update(_IDLE)
            return
        if self._state == "error":
            self.update(
                f"[#FF5C7A]✗ run failed[/]\n[#6A5A6A]{self._error}[/]"
            )
            return

        spin = "⠋⠙⠹⠸"[self._spin_i % 4]
        header_bits = [f"[#FFD700]{self._runner}[/]"]
        if self._suite:
            header_bits.append(f"[#6A5A6A]{self._suite}[/]")
        if self._target:
            t = self._target if len(self._target) <= 22 else "…" + self._target[-21:]
            header_bits.append(f"[#6A5A6A]{t}[/]")
        lines = [" ".join(header_bits)]

        if self._state == "running":
            lines.append(f"[#FFD700]{spin}[/] {format_progress_bar(self._fraction)}")
            if self._line:
                lines.append(f"[#6A5A6A]{self._line}[/]")
            else:
                lines.append("[#6A5A6A]collecting / executing…[/]")
        else:
            lines.append(format_progress_bar(1.0))
            for i, t in enumerate(self._tests):
                name = t.get("name") or t.get("title") or "?"
                status = t.get("status") or "pending"
                if i >= self._revealed:
                    status = "pending"
                lines.append(format_test_row(str(name), status))
            if self._state == "done":
                mark = "#7CFF8B" if self._ok else "#FF5C7A"
                lines.append("")
                lines.append(
                    f"[{mark}]{'✔' if self._ok else '✗'}[/] "
                    f"[#7CFF8B]{self._passed} pass[/] "
                    f"[#FF5C7A]{self._failed} fail[/] "
                    f"[#6A5A6A]{self._skipped} skip[/]"
                )
            elif self._state == "playing":
                lines.append(
                    f"[#6A5A6A]revealing {self._revealed}/{len(self._tests)}…[/]"
                )

        self.update("\n".join(lines))
