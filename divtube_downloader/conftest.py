"""Rootdir conftest for the divtube_downloader module.

One job: control *what pytest is allowed to import*.

pytest's defaults are `python_files = test_*.py *_test.py` and
`python_classes = Test*`, applied to **every** directory it walks. This module
used to carry seven tracked files that matched that pattern without being
tests: six hand-run probes at the module root (live network calls, a 3.5k-line
`ToolService()` built at import, one already bit-rotted into a collection
`TypeError`) and one production Textual widget, `tui/ui/widgets/test_run_panel.py`.

`testpaths = tests` in pytest.ini hides all of that -- but only when pytest gets
no path arguments. The moment someone types `pytest divtube_downloader` from the
repo root, `testpaths` is ignored and every matching file is imported and run.
That was demonstrated, not theorised: `Interrupted: 1 error during collection`,
plus 6 seconds of import for zero tests.

Renaming the files fixed the present. This file stops it rotting again.

Note what this deliberately does *not* do: it never recurses from the module
root. The root holds `.venv/` (thousands of third-party `test_*.py` that are
correctly named for their own packages), `gradle-8.5/`, `build/`, `downloads/`
and generated data. An earlier draft of this guard used `rglob` from the root
and dutifully reported `qrcode/tests/test_util.py` as a violation. Scope is
expressed as an allowlist of *our* source trees instead.
"""

from __future__ import annotations

import pathlib

import pytest

ROOT = pathlib.Path(__file__).parent

# Recursive: these are ours, top to bottom.
SOURCE_DIRS = ("tui", "intel", "src", "scripts", "grok", "video_forge")

# Where a `test_*.py` is exactly what it claims to be.
LEGIT_TEST_DIRS = ("tests", "video_forge/tests")


def _is_legit(relpath: str) -> bool:
    return any(relpath == d or relpath.startswith(d + "/") for d in LEGIT_TEST_DIRS)


def _looks_like_a_test(name: str) -> bool:
    return name.startswith("test_") or name.endswith("_test.py")


def _violations() -> list[str]:
    bad: list[str] = []
    seen: set[str] = set()

    # Module root, non-recursive by design -- see the module docstring.
    for path in sorted(ROOT.glob("test_*.py")) + sorted(ROOT.glob("*_test.py")):
        if path.name not in seen:
            seen.add(path.name)
            bad.append(path.name)

    for rel in SOURCE_DIRS:
        base = ROOT / rel
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.py")):
            if not _looks_like_a_test(path.name):
                continue
            relpath = path.relative_to(ROOT).as_posix()
            if _is_legit(relpath) or relpath in seen:
                continue
            seen.add(relpath)
            bad.append(relpath)
    return bad


_BAD = _violations()

if _BAD:
    raise pytest.UsageError(
        "Files matching pytest's `python_files` pattern live outside a test "
        "directory, so pytest would import -- and therefore *execute* -- them:\n\n"
        + "".join(f"    {line}\n" for line in _BAD)
        + "\nLegit tests live in: " + ", ".join(LEGIT_TEST_DIRS) + "\n\n"
        "Hand-run probes belong in scripts/manual_checks/; see its README for "
        "why that directory exists. Rename the file, do not add an ignore -- a "
        "filename is a claim about how it will be executed."
    )
