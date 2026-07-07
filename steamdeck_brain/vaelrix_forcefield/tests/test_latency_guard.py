"""
Latency / structural regression guards for the ForceField runtime.

These exist because two un-budgeted I/O paths once inflated ``BrainBridge.ask()``
from ~4ms to ~962ms while every functional test stayed green:

  1. ``ui_brain._scan_ui_files`` materialized ``list(root.rglob("*"))`` over the
     whole repo (node_modules / virtualenvs) before slicing — O(repo) per query.
  2. ``submit_to_diagnostic_memory`` opened+committed+closed a SQLite connection
     per health signal — ~10x the open/checkpoint cost per ask().

The functional suite can't catch these (outputs were still correct), so we guard
them two ways:

  * **Structural** (deterministic, the primary guard): the scan must not descend
    vendored dirs, and a batch submit must open exactly one DB connection.
  * **Wall-clock** (order-of-magnitude, generous): ``ask()`` median must stay far
    below the hundreds-of-ms regressions above, with enough headroom not to flake
    on a slow shared CI runner.
"""

import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield import BrainBridge, create_force_field
from vaelrix_forcefield import diagnostic_memory_submitter as dms
from vaelrix_forcefield.brains.ui_brain import _scan_ui_files, run_ui_brain
from vaelrix_forcefield.pixelbrain.bytecode_health import encode_clean_health


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("// test fixture\n")


class TestUiBrainScanGuard(unittest.TestCase):
    """ui_brain must scan project source only — never vendored / build trees."""

    def test_prunes_vendored_and_dot_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root / "src" / "components" / "Real.jsx")        # real component
            _touch(root / "src" / "styles" / "app.css")             # real style
            _touch(root / "node_modules" / "pkg" / "ui" / "Vendor.jsx")  # vendored
            _touch(root / ".venv" / "lib" / "styles" / "vendor.css")     # dot dir
            _touch(root / "dist" / "ui" / "Built.jsx")              # build output

            components, styles = _scan_ui_files(root)
            found = components + styles

            self.assertIn(os.path.join("src", "components", "Real.jsx"), components)
            self.assertIn(os.path.join("src", "styles", "app.css"), styles)
            # Nothing vendored / built / dotted may leak in.
            self.assertFalse(
                any("node_modules" in p or ".venv" in p or "dist" in p for p in found),
                msg=f"vendored/build paths leaked into scan: {found}",
            )

    def test_scan_is_bounded_under_large_vendored_tree(self):
        # A big node_modules must not cost anything: pruning makes the walk
        # O(real source), not O(vendored). Without the prune this tree alone
        # would dominate every ask().
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root / "src" / "components" / "Real.jsx")
            vendor = root / "node_modules" / "huge"
            vendor.mkdir(parents=True)
            for i in range(1500):
                (vendor / f"m{i}.jsx").write_text("//\n")

            start = time.perf_counter()
            components, styles = _scan_ui_files(root)
            elapsed = time.perf_counter() - start

            self.assertIn(os.path.join("src", "components", "Real.jsx"), components)
            self.assertFalse(any("node_modules" in p for p in components + styles))
            # Generous ceiling: the pruned walk is sub-ms; only an un-pruned
            # O(repo) regression could breach this.
            self.assertLess(elapsed, 1.0, f"scan took {elapsed*1000:.0f}ms — vendored tree not pruned?")

    def test_run_ui_brain_still_resolves_real_files(self):
        # End-to-end: the brain must still surface real component/style files
        # (the fix must not have lobotomized it into finding nothing).
        field = create_force_field("design a responsive sidebar component")
        result = run_ui_brain(field, "design a responsive sidebar component")
        self.assertTrue(
            any("file(s)" in f for f in result.findings),
            msg=f"ui_brain found no project files: {result.findings}",
        )


class TestDiagnosticMemoryBatchGuard(unittest.TestCase):
    """A batch submit must amortize SQLite cost into a single connection."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        self.db_path = self.tmp.name
        self.tmp.close()

    def tearDown(self):
        try:
            os.unlink(self.db_path)
        except OSError:
            pass

    def test_batch_opens_single_connection(self):
        signals = [
            encode_clean_health("IMMUNITY_SCAN", f"CHK_{i}", {"i": i})
            for i in range(8)
        ]

        real_connect = dms.sqlite3.connect
        calls = {"n": 0}

        def counting_connect(*args, **kwargs):
            calls["n"] += 1
            return real_connect(*args, **kwargs)

        with mock.patch.object(dms.sqlite3, "connect", side_effect=counting_connect):
            report = dms.submit_to_diagnostic_memory(
                health_signals=signals, db_path=self.db_path
            )

        self.assertEqual(report["total"], 8)
        # The whole point: 8 signals, ONE connection — not one per signal.
        self.assertEqual(
            calls["n"], 1,
            msg=f"expected 1 DB connection for the batch, got {calls['n']} "
                "(per-signal connect/commit/close regression)",
        )


class TestAskLatencyGuard(unittest.TestCase):
    """Order-of-magnitude wall-clock ceiling on the full pipeline."""

    # Local baseline after the I/O fixes is ~43ms; the regressions this guards
    # against were 962ms (glob) and +100ms (per-signal SQLite). 400ms gives ~9x
    # headroom over baseline so a slow CI runner won't flake, while still
    # tripping decisively on any O(repo) / per-call-I/O regression.
    CEILING_S = 0.40

    def test_ask_median_latency_under_ceiling(self):
        bridge = BrainBridge()
        prompt = "fix the color dragon frontend fallback bug"
        for _ in range(3):  # warm thread pool / DB / import caches
            bridge.ask(prompt)

        samples = []
        for _ in range(7):
            t = time.perf_counter()
            bridge.ask(prompt)
            samples.append(time.perf_counter() - t)
        samples.sort()
        median = samples[len(samples) // 2]

        self.assertLess(
            median, self.CEILING_S,
            msg=f"ask() median {median*1000:.0f}ms exceeds {self.CEILING_S*1000:.0f}ms "
                f"ceiling (min={samples[0]*1000:.0f}ms) — likely an O(repo) walk or "
                "per-call I/O regression.",
        )


if __name__ == "__main__":
    unittest.main()
