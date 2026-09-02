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

# Exact paths exempt from BLOAT_PATTERNS, each with a hard size ceiling.
#
# The Gradle wrapper JAR is the one `.jar` that MUST be tracked. `gradlew`,
# `gradlew.bat` and `gradle-wrapper.properties` were already tracked, so the
# build had committed to the wrapper and then withheld the only file it can
# execute — every fresh clone died with
# "could not find or load main class org.gradle.wrapper.GradleWrapperMain".
#
# Matched on the full repo-relative path, never a substring, and re-checked
# against its own ceiling below, so this cannot be used to smuggle a vendored
# jar in by renaming it.
ALLOWED_BLOAT = {
    "android/gradle/wrapper/gradle-wrapper.jar": 256 * 1024,
}


def _is_allowed(path: str) -> bool:
    return path in ALLOWED_BLOAT


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
        if not _is_allowed(path)
        and any(pat in path or path.endswith(pat.lstrip("/")) for pat in BLOAT_PATTERNS)
    ]
    assert offenders == [], f"bloat is tracked in git: {offenders}"


def test_allowed_bloat_stays_small_and_wrapper_coherent():
    """An exemption is only safe if it cannot grow or orphan its companions."""
    tracked = set(_git_ls_files())
    for path, ceiling in ALLOWED_BLOAT.items():
        assert path in tracked, f"{path} is allowlisted but not tracked — the wrapper is broken"
        full = os.path.join(DIVTUBE_ROOT, path)
        if not os.path.exists(full):
            continue
        size = os.path.getsize(full)
        assert size <= ceiling, (
            f"{path} is {size} bytes, over the {ceiling}-byte exemption ceiling. "
            f"The wrapper jar is ~49 KB; a larger one is not the wrapper jar."
        )
    # gradlew needs all three of these; a partial set is the original bug.
    wrapper_dir = "android/gradle/wrapper/"
    assert f"{wrapper_dir}gradle-wrapper.properties" in tracked
    assert "android/gradlew" in tracked


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
