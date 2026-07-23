"""Boon 5: keep vendored binaries & stray artifacts out of git history.

A durable guardrail: the harness ships a ~268 MB gradle distribution and an
~8 MB GloVe blob that must be provisioned on demand, never committed. This test
fails if any tracked file matches a known-bloat pattern or exceeds a size cap,
so a future `git add -A` cannot silently re-bloat the clone.
"""
from __future__ import annotations

import os
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.dirname(HERE)

# 5 MB — no source file in the harness approaches this; binaries do.
MAX_TRACKED_BYTES = 5 * 1024 * 1024

# Patterns that must never be tracked (substrings / suffixes of repo-relative paths).
BLOAT_PATTERNS = (
    "gradle.zip",
    "gradle-8.5/",
    ".kate-swp",
    ".f32",
    ".jar",
    "embeddings/glove",
    "/bug",          # the stray 1920x1080 PNG screenshot blob
    "bug.png",
    ".consolidation-backup",
    ".healer.bak",
)


def _git_ls_files() -> list[str]:
    proc = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=DIVTUBE_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        pytest.skip(f"git ls-files failed: {proc.stderr.strip()}")
    return [p for p in proc.stdout.split("\0") if p]


def test_no_bloat_patterns_tracked():
    tracked = _git_ls_files()
    offenders = [
        path
        for path in tracked
        if any(pat in path or path.endswith(pat.lstrip("/")) for pat in BLOAT_PATTERNS)
    ]
    assert offenders == [], f"bloat is tracked in git: {offenders}"


def test_no_oversized_tracked_file():
    tracked = _git_ls_files()
    oversized = []
    for path in tracked:
        full = os.path.join(DIVTUBE_ROOT, path)
        try:
            size = os.path.getsize(full)
        except OSError:
            continue  # skip files removed from the working tree
        if size > MAX_TRACKED_BYTES:
            oversized.append((path, size))
    assert oversized == [], (
        f"tracked files exceed {MAX_TRACKED_BYTES} bytes "
        f"(provision these on demand, do not commit): {oversized}"
    )


def test_gradle_distribution_is_ignored():
    # The vendored gradle dist may exist on disk for local builds, but must be
    # ignored so it never enters history.
    proc = subprocess.run(
        ["git", "check-ignore", "-q", "gradle-8.5"],
        cwd=DIVTUBE_ROOT,
        capture_output=True,
        text=True,
    )
    # check-ignore exits 0 when the path IS ignored.
    assert proc.returncode == 0, "gradle-8.5/ is not git-ignored"
