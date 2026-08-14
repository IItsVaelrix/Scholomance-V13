#!/usr/bin/env python3
"""CLI entrypoint for the four navigation lenses.

Used by the Grok / Scholomance-collab MCP bridge and by agents that
cannot import the DivTube cockpit package. Prints one JSON object.

    python3 scripts/lens_cli.py telescope --path codex/core/pixelbrain
    python3 scripts/lens_cli.py microscope --path FILE --symbol NAME --refs
    python3 scripts/lens_cli.py atlas --action rollup --path codex/core
    python3 scripts/lens_cli.py evaluate --path FILE --symbol NAME
"""
from __future__ import annotations

import argparse
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIVTUBE = os.path.join(REPO_ROOT, "divtube_downloader")
if DIVTUBE not in sys.path:
    sys.path.insert(0, DIVTUBE)


def _load():
    from tui.services import code_atlas, code_eval, code_lens
    return code_atlas, code_eval, code_lens


def _dumps(payload: dict) -> str:
    from tui.services import code_lens
    return code_lens.serialize_for_agent(payload)


def cmd_telescope(args) -> dict:
    from tui.services import code_lens
    return code_lens.telescope(
        args.root, args.path,
        max_depth=args.max_depth,
        with_symbols=not args.no_symbols,
    )


def cmd_microscope(args) -> dict:
    from tui.services import code_lens
    return code_lens.microscope(
        args.root, args.path,
        symbol=args.symbol,
        line=args.line,
        context=args.context,
        refs=args.refs,
        max_refs=args.max_refs,
    )


def cmd_atlas(args) -> dict:
    from tui.services import code_atlas
    atlas = code_atlas.load_atlas(args.root)
    if atlas is None:
        return {"ok": False, "available": False, "reason": "atlas-not-built"}
    action = args.action
    if action == "stale":
        return {"ok": True, **atlas.is_stale(args.root)}
    if action == "rollup":
        path = args.path or "."
        roll = atlas.dir_rollup(path)
        return {
            "ok": roll is not None,
            "path": path,
            "rollup": roll,
            "stale": atlas.is_stale(args.root),
        }
    if action == "refs":
        if not args.token:
            return {"ok": False, "error": "token is required for action=refs"}
        files = atlas.refs(args.token, max_files=args.limit)
        return {"ok": True, "token": args.token, "files": files, "n": len(files)}
    if action == "prefix":
        if not args.token:
            return {"ok": False, "error": "token is required for action=prefix"}
        tokens = atlas.prefix(args.token, limit=args.limit)
        return {"ok": True, "prefix": args.token, "tokens": tokens, "n": len(tokens)}
    return {"ok": False, "error": f"unknown action: {action!r}"}


def cmd_evaluate(args) -> dict:
    from tui.services import code_eval
    argv = json.loads(args.args) if args.args else []
    if not isinstance(argv, list):
        return {"ok": False, "error": "--args must be a JSON array"}
    return code_eval.evaluate(args.root, args.path, args.symbol, args=argv)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=REPO_ROOT, help="repo root")
    sub = parser.add_subparsers(dest="cmd", required=True)

    tel = sub.add_parser("telescope", help="zoom OUT")
    tel.add_argument("--path", required=True)
    tel.add_argument("--max-depth", type=int, default=2)
    tel.add_argument("--no-symbols", action="store_true")
    tel.set_defaults(func=cmd_telescope)

    mic = sub.add_parser("microscope", help="zoom IN")
    mic.add_argument("--path", required=True)
    mic.add_argument("--symbol")
    mic.add_argument("--line", type=int)
    mic.add_argument("--context", type=int, default=2)
    mic.add_argument("--refs", action="store_true")
    mic.add_argument("--max-refs", type=int, default=25)
    mic.set_defaults(func=cmd_microscope)

    atl = sub.add_parser("atlas", help="telemetry / refs / prefix / stale")
    atl.add_argument("--action", required=True,
                     choices=("rollup", "refs", "prefix", "stale"))
    atl.add_argument("--path")
    atl.add_argument("--token")
    atl.add_argument("--limit", type=int, default=25)
    atl.set_defaults(func=cmd_atlas)

    ev = sub.add_parser("evaluate", help="run a symbol")
    ev.add_argument("--path", required=True)
    ev.add_argument("--symbol", required=True)
    ev.add_argument("--args", help="JSON array of arguments")
    ev.set_defaults(func=cmd_evaluate)

    args = parser.parse_args(argv)
    try:
        payload = args.func(args)
    except Exception as exc:  # noqa: BLE001 — CLI must never traceback to MCP
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 2
    print(_dumps(payload) if isinstance(payload, dict) else json.dumps(payload))
    return 0 if payload.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
