#!/usr/bin/env python3
"""Rebuild the Code Atlas when it lags the live HEAD.

The atlas (divtube_downloader/tui/services/code_atlas.py) degrades
HONESTLY when stale — every lens surfaces builtAtHead/commitsBehind — but
honest degradation is not freshness, and nothing in the repo rebuilt it.
This is the entry point that closes that loop; `git-hooks/post-commit`
backgrounds it after every commit.

Runnable from any cwd against any repo root. Prints a one-line JSON
verdict and exits non-zero on error, so a hook or CI step can branch on
it without parsing prose.

    python3 scripts/atlas_rebuild.py [--root PATH] [--max-commits-behind N]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS_MODULE = os.path.join(
    REPO_ROOT, "divtube_downloader", "tui", "services", "code_atlas.py")


def _load_code_atlas():
    """Load the module FILE directly.

    `from tui.services import code_atlas` executes the package __init__,
    which imports prompt_service -> openai. The atlas itself is pure
    stdlib; importing it must not require the cockpit's dependencies.
    """
    spec = importlib.util.spec_from_file_location(
        "scholomance_code_atlas", ATLAS_MODULE)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load atlas module at {ATLAS_MODULE}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=REPO_ROOT,
                        help="repo root to rebuild the atlas for")
    parser.add_argument("--max-commits-behind", type=int, default=0,
                        help="tolerated lag before a rebuild is forced")
    args = parser.parse_args(argv)

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print(json.dumps({"action": "error",
                          "error": f"no such directory: {root}"}))
        return 2

    try:
        code_atlas = _load_code_atlas()
    except Exception as exc:  # noqa: BLE001 — report, never traceback at a hook
        print(json.dumps({"action": "error", "error": f"{type(exc).__name__}: {exc}"}))
        return 2

    verdict = code_atlas.rebuild_if_stale(
        root, max_commits_behind=args.max_commits_behind)
    print(json.dumps(verdict, sort_keys=True))
    return 1 if verdict.get("action") == "error" else 0


if __name__ == "__main__":
    raise SystemExit(main())
