"""Eval lens: the third instrument, for what code DOES.

  telescope(path)  — zoom OUT. Where things are.
  microscope(path) — zoom IN. What a file says about itself.
  evaluate(path, symbol) — RUN IT. What a symbol actually returns.

Why this exists: a symbol index reports a file's self-description. Every
defect the first two lenses structurally cannot see lives in the gap between
a doc comment and an execution. `projection-laws.js` documents
`synthesizeByProjection()` as sweeping "every licensed law × every observed
atom"; it iterates 50 hand-written keys and the observed-atom filter removes
none of them. The symbol table cannot show that. Calling it can.

DIFFERENT LAWS FROM code_lens.py, DELIBERATELY.

`code_lens` promises pure-stdlib, no-subprocess, deterministic: identical
filesystem state => identical output. This lens cannot promise any of those
and must not pretend to, so it lives in its own module rather than eroding
guarantees the rest of the harness relies on:

  * RUNS CODE. Importing a module executes its top level. A target with
    side effects will perform them. This is the cost of the lens, not a bug
    in it.
  * SUBPROCESS ALWAYS, both languages. Never import a repo module into the
    cockpit's own interpreter — an eval lens that can crash or poison the
    process it reports to is not an instrument.
  * NOT DETERMINISTIC. Deterministic targets give stable output; that is a
    property of the target, and the lens reports `declaredPure` so the
    caller can see what the module claims about itself.
  * BOUNDED. Wall-clock timeout, output cap, no shell, path confined to the
    project root.

The `declaredPure` field is the point of the whole instrument: it puts the
module's claim about itself next to what it did, in one result.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

from tui.services.code_lens import LANG_BY_EXT, resolve_within_root
from tui.services.harness_tools import node_env, resolve_node_bin_dir

DEFAULT_TIMEOUT = 10
MAX_TIMEOUT = 60
MAX_OUTPUT_BYTES = 200_000
MAX_REPR_CHARS = 4000
PURITY_HEADER_LINES = 60
EVALUABLE_LANGS = {"javascript", "python"}

# `PURE AND ZERO-I/O`, `zero-I/O and pure`, `PURE, ZERO-I/O` — the repo writes
# its purity declaration several ways. Both halves must appear in the header.
_PURE_RE = re.compile(r"\bpure\b", re.IGNORECASE)
_ZERO_IO_RE = re.compile(r"zero[\s\-]?i/?o", re.IGNORECASE)


def _declared_pure(abs_path: str) -> bool:
    """Whether the module's own header claims purity. A claim, not a finding."""
    try:
        with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
            head = "".join(fh.readline() for _ in range(PURITY_HEADER_LINES))
    except OSError:
        return False
    return bool(_PURE_RE.search(head) and _ZERO_IO_RE.search(head))


# --------------------------------------------------------------------------
# Drivers — one per language, each printing a single JSON summary on stdout
# --------------------------------------------------------------------------

_JS_DRIVER = r"""
// `node -e script -- a b c` yields argv = [execPath, a, b, c] — there is no
// script path slot, so the args start at index 1, not 2.
const [, modUrl, symbol, argsJson, summariseOnly] = process.argv;

function shapeOf(v) {
  if (v === null) return { type: 'null' };
  if (Array.isArray(v)) return { type: 'array', length: v.length };
  if (v instanceof Map) return { type: 'Map', size: v.size };
  if (v instanceof Set) return { type: 'Set', size: v.size };
  const t = typeof v;
  if (t === 'object') return { type: 'object', keys: Object.keys(v).length };
  if (t === 'function') return { type: 'function', name: v.name || '(anonymous)' };
  return { type: t };
}

/** Bounded, cycle-safe, and able to describe what JSON cannot encode. */
function summarise(v, depth) {
  if (depth > 3) return '…';
  if (v === null || v === undefined) return v === null ? null : '(undefined)';
  if (v instanceof Map) return { '(Map)': [...v.entries()].slice(0, 20).map(([k, x]) => [String(k), summarise(x, depth + 1)]) };
  if (v instanceof Set) return { '(Set)': [...v].slice(0, 40).map((x) => summarise(x, depth + 1)) };
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => summarise(x, depth + 1));
  const t = typeof v;
  if (t === 'function') return `(function ${v.name || 'anonymous'})`;
  if (t === 'bigint') return `${v}n`;
  if (t === 'symbol') return String(v);
  if (t === 'object') {
    const out = {};
    for (const k of Object.keys(v).slice(0, 30)) out[k] = summarise(v[k], depth + 1);
    return out;
  }
  return v;
}

(async () => {
  try {
    const mod = await import(modUrl);
    if (!(symbol in mod)) {
      const available = Object.keys(mod).slice(0, 40);
      process.stdout.write(JSON.stringify({
        ok: false, stage: 'lookup',
        error: `No export named ${symbol} in this module.`,
        available,
      }));
      return;
    }
    const target = mod[symbol];
    const isFn = typeof target === 'function';
    const args = JSON.parse(argsJson);
    const value = isFn ? await target(...args) : target;
    const payload = {
      ok: true, stage: 'done', called: isFn, shape: shapeOf(value),
      repr: summarise(value, 0),
    };
    if (summariseOnly === '1') delete payload.value;
    process.stdout.write(JSON.stringify(payload));
  } catch (err) {
    process.stdout.write(JSON.stringify({
      ok: false, stage: 'execution',
      error: String((err && err.message) || err),
      stack: String((err && err.stack) || '').split('\n').slice(0, 8).join('\n'),
    }));
  }
})();
"""

_PY_DRIVER = r'''
import importlib.util, json, sys, traceback

mod_path, symbol, args_json, summarise_only = sys.argv[1:5]

def shape_of(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "boolean"}
    if isinstance(v, (list, tuple)):
        return {"type": "array", "length": len(v)}
    if isinstance(v, set):
        return {"type": "Set", "size": len(v)}
    if isinstance(v, dict):
        return {"type": "object", "keys": len(v)}
    if callable(v):
        return {"type": "function", "name": getattr(v, "__name__", "(anonymous)")}
    return {"type": type(v).__name__}

def summarise(v, depth=0):
    if depth > 3:
        return "…"
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if isinstance(v, (list, tuple)):
        return [summarise(x, depth + 1) for x in list(v)[:20]]
    if isinstance(v, set):
        return {"(set)": [summarise(x, depth + 1) for x in list(v)[:40]]}
    if isinstance(v, dict):
        return {str(k): summarise(x, depth + 1) for k, x in list(v.items())[:30]}
    if callable(v):
        return f"(function {getattr(v, '__name__', 'anonymous')})"
    return repr(v)[:400]

try:
    spec = importlib.util.spec_from_file_location("_lens_target", mod_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, symbol):
        available = [n for n in dir(mod) if not n.startswith("__")][:40]
        print(json.dumps({
            "ok": False, "stage": "lookup",
            "error": f"No export named {symbol} in this module.",
            "available": available,
        }))
        sys.exit(0)
    target = getattr(mod, symbol)
    is_fn = callable(target)
    args = json.loads(args_json)
    value = target(*args) if is_fn else target
    payload = {
        "ok": True, "stage": "done", "called": is_fn,
        "shape": shape_of(value), "repr": summarise(value),
    }
    if summarise_only != "1":
        payload["value"] = summarise(value)
    print(json.dumps(payload))
except Exception as exc:
    print(json.dumps({
        "ok": False, "stage": "execution",
        "error": f"{type(exc).__name__}: {exc}",
        "stack": "".join(traceback.format_exc()).splitlines()[-8:],
    }))
'''


def _node_bin() -> str:
    """Absolute node path via harness_tools — desktop launches skip ~/.bashrc,
    so bare `node` is not reliably on PATH here."""
    bin_dir = resolve_node_bin_dir()
    if bin_dir:
        candidate = os.path.join(bin_dir, "node")
        if os.path.isfile(candidate):
            return candidate
    return "node"


def _run(cmd: list[str], timeout: int, cwd: str) -> dict:
    """Spawn a driver with no shell and a hard wall-clock bound."""
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
            shell=False,
            env=node_env(),
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "stage": "timeout",
            "error": f"Evaluation exceeded {timeout}s and was killed.",
        }
    except FileNotFoundError as exc:
        return {"ok": False, "stage": "spawn", "error": f"Interpreter not found: {exc}"}

    out = (proc.stdout or "")[:MAX_OUTPUT_BYTES]
    if not out.strip():
        return {
            "ok": False,
            "stage": "spawn",
            "error": "Driver produced no output.",
            "stderr": (proc.stderr or "")[:2000],
        }
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        # The target printed to stdout itself, so the JSON summary is the last
        # line rather than the whole stream.
        for line in reversed(out.strip().splitlines()):
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
            parsed["targetStdout"] = out[:2000]
            return parsed
        return {
            "ok": False,
            "stage": "decode",
            "error": "Driver output was not JSON.",
            "stdout": out[:2000],
            "stderr": (proc.stderr or "")[:2000],
        }


def evaluate(
    project_root: str,
    path: str,
    symbol: str,
    *,
    args: list | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    summarise_only: bool = False,
) -> dict:
    """Call `symbol` from `path` in a subprocess and report what came back.

    A callable export is invoked with `args` (JSON literals, default none); a
    non-callable export is read and reported with `called: False`.

    Returns a dict with `ok`, `shape`, `repr`, `called`, and `declaredPure`.
    Failures carry `stage` — one of `lookup`, `execution`, `timeout`, `spawn`,
    `decode` — so the caller can tell "the symbol is missing" from "the symbol
    threw" from "the interpreter never started".
    """
    abs_path = resolve_within_root(project_root, path)
    if abs_path is None:
        return {"ok": False, "stage": "path", "error": f"Path escapes project root: {path!r}"}
    if not os.path.isfile(abs_path):
        return {"ok": False, "stage": "path", "error": f"Not a file: {path!r}"}
    if not symbol or not str(symbol).strip():
        return {"ok": False, "stage": "path", "error": "symbol is required."}

    lang = LANG_BY_EXT.get(os.path.splitext(abs_path)[1].lower(), "other")
    if lang not in EVALUABLE_LANGS:
        return {
            "ok": False,
            "stage": "path",
            "error": f"Cannot evaluate a {lang} file; the eval lens runs JavaScript and Python.",
        }

    symbol = str(symbol).strip()
    args_json = json.dumps(list(args or []))
    timeout = max(0, min(int(timeout), MAX_TIMEOUT))
    flag = "1" if summarise_only else "0"
    root = os.path.abspath(project_root)

    if lang == "javascript":
        mod_url = "file://" + abs_path
        cmd = [_node_bin(), "--input-type=module", "-e", _JS_DRIVER,
               "--", mod_url, symbol, args_json, flag]
    else:
        cmd = [sys.executable or "python3", "-c", _PY_DRIVER,
               abs_path, symbol, args_json, flag]

    result = _run(cmd, timeout=timeout, cwd=root)
    result.setdefault("ok", False)
    result["path"] = os.path.relpath(abs_path, root)
    result["lang"] = lang
    result["symbol"] = symbol
    result["declaredPure"] = _declared_pure(abs_path)
    if isinstance(result.get("repr"), str) and len(result["repr"]) > MAX_REPR_CHARS:
        result["repr"] = result["repr"][:MAX_REPR_CHARS] + "…"
    return result
