"""Telescope + Microscope: structural code navigation lenses.

Two complementary views over the repository:

  telescope(path)  — zoom OUT. Structural map of a directory or file:
                     tree of dirs/files with line counts, languages, and
                     top-level symbols. The map you build BEFORE grepping.

  microscope(path) — zoom IN. Symbol-level view of one file: functions /
                     classes / methods with exact line ranges (Python via
                     the `ast` module; JS/TS via deterministic regex +
                     brace tracking). Extract a symbol body by name, a
                     window around a line, or cross-reference a symbol
                     across the repo.

Design laws (same as the rest of the harness):
  * pure stdlib — no numpy, no external parsers, no subprocess
  * deterministic — sorted traversal, no wall clock, no randomness;
    identical filesystem state => identical output
  * bounded — hard caps on depth, file sizes, symbol counts, and scan
    breadth so a lens can never drown the caller
  * safe — every path is resolved and must stay inside the project root
"""

from __future__ import annotations

import ast
import os
import re
from typing import Any


# --------------------------------------------------------------------------
# Shared constants
# --------------------------------------------------------------------------

IGNORED_DIR_NAMES = {
    "node_modules", ".git", "dist", "dist-ssr", "build", "out", "coverage",
    "__pycache__", ".next", ".cache", ".tmp", ".pytest_cache",
    ".ruff_cache", ".wrangler", ".worktrees", ".claude", ".aider.tags.cache.v4",
    "squashfs-root", ".venv", ".venv-align", ".antigravitycli", ".blackboxcli",
    ".codex", ".cursor", ".grok", ".qwen", ".superpowers", ".vscode", ".github",
}

IGNORED_DIR_PREFIXES = (".venv", ".aider")

LANG_BY_EXT = {
    ".py": "python",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".json": "json", ".jsonc": "json",
    ".md": "markdown", ".toml": "toml", ".yaml": "yaml", ".yml": "yaml",
    ".sh": "shell", ".lua": "lua", ".html": "html", ".css": "css",
    ".gd": "gdscript", ".glsl": "glsl", ".c": "c", ".cpp": "cpp", ".h": "c",
}

CODE_LANGS = {"python", "javascript", "typescript", "lua", "shell", "gdscript", "c", "cpp"}

MAX_FILE_BYTES_FOR_SYMBOLS = 500_000      # don't parse giants
MAX_FILE_BYTES_FOR_LINES = 2_000_000      # don't even count lines past this
MAX_SYMBOLIZED_FILES = 40                 # per telescope call
MAX_SYMBOLS_PER_FILE = 30                 # per file in telescope
MAX_BODY_LINES = 400                      # per microscope symbol body
MAX_LINE_WINDOW = 200                     # per microscope line window
MAX_REF_FILES_SCANNED = 4000              # breadth cap for cross-reference
MAX_REF_FILE_BYTES = 1_000_000
REF_EXTENSIONS = {
    ".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
    ".lua", ".sh", ".md", ".json",
}

_PY_OK = True
try:  # pragma: no cover - ast is stdlib, but stay defensive
    import ast as _ast_check  # noqa: F401
except Exception:  # pragma: no cover
    _PY_OK = False


# --------------------------------------------------------------------------
# Path safety
# --------------------------------------------------------------------------

def resolve_within_root(project_root: str, rel_path: str) -> str | None:
    """Resolve rel_path against project_root; None if it escapes the root."""
    root = os.path.abspath(project_root)
    candidate = os.path.abspath(os.path.join(root, rel_path or "."))
    if candidate != root and not candidate.startswith(root + os.sep):
        return None
    return candidate


def _is_ignored_dir(name: str) -> bool:
    if name in IGNORED_DIR_NAMES:
        return True
    return any(name.startswith(p) for p in IGNORED_DIR_PREFIXES)


def _lang_of(path: str) -> str:
    return LANG_BY_EXT.get(os.path.splitext(path)[1].lower(), "other")


def _count_lines(abs_path: str) -> int | None:
    """Fast newline count on raw bytes; None past the size cap."""
    try:
        if os.path.getsize(abs_path) > MAX_FILE_BYTES_FOR_LINES:
            return None
        with open(abs_path, "rb") as fh:
            data = fh.read()
        if not data:
            return 0
        n = data.count(b"\n")
        if not data.endswith(b"\n"):
            n += 1
        return n
    except OSError:
        return None


# --------------------------------------------------------------------------
# Symbol extraction — Python (AST, exact)
# --------------------------------------------------------------------------

def _python_symbols(abs_path: str) -> list[dict]:
    """Exact symbol table via the ast module: qualified names + line ranges."""
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
            source = fh.read()
        tree = ast.parse(source)
    except (OSError, SyntaxError, ValueError):
        return []

    symbols: list[dict] = []

    def walk(node: ast.AST, prefix: str) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                kind = "async function" if isinstance(child, ast.AsyncFunctionDef) else (
                    "method" if prefix else "function"
                )
                qualified = f"{prefix}.{child.name}" if prefix else child.name
                args = [a.arg for a in child.args.args[:6]]
                symbols.append({
                    "name": qualified,
                    "kind": kind,
                    "line": child.lineno,
                    "endLine": getattr(child, "end_lineno", child.lineno),
                    "args": args,
                })
                walk(child, qualified)
            elif isinstance(child, ast.ClassDef):
                qualified = f"{prefix}.{child.name}" if prefix else child.name
                symbols.append({
                    "name": qualified,
                    "kind": "class",
                    "line": child.lineno,
                    "endLine": getattr(child, "end_lineno", child.lineno),
                    "args": [],
                })
                walk(child, qualified)

    walk(tree, "")
    symbols.sort(key=lambda s: (s["line"], s["name"]))
    return symbols


# --------------------------------------------------------------------------
# Symbol extraction — JS/TS (deterministic regex + brace tracking)
# --------------------------------------------------------------------------

_JS_PATTERNS = [
    # export [default] [async] function [*] name
    (re.compile(
        r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*"
        r"([A-Za-z_$][\w$]*)"
    ), "function"),
    # export const|let|var name = [async] ( ... ) | function
    (re.compile(
        r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*"
        r"(?:async\s*)?(?:\(|function\b|[A-Za-z_$][\w$]*\s*=>)"
    ), "const"),
    # [export] class name
    (re.compile(
        r"^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)"
    ), "class"),
]


def _js_body_end(lines: list[str], start_idx: int) -> int:
    """Approximate end of a JS declaration: brace tracking with a bounded scan.

    Approximate by design (string-aware counting would need a real parser);
    the lens only needs a reliable ENVELOPE around the definition.

    Braces inside the parameter list — default args like `options = {}` or
    destructured params — are ignored: a brace only counts as the body brace
    when paren depth is 0.
    """
    depth = 0
    paren_depth = 0
    started = False
    limit = min(len(lines), start_idx + 2000)
    for i in range(start_idx, limit):
        line = lines[i]
        for ch in line:
            if ch == "(":
                paren_depth += 1
            elif ch == ")":
                paren_depth = max(0, paren_depth - 1)
            elif ch == "{":
                if paren_depth == 0:
                    depth += 1
                    started = True
            elif ch == "}":
                if paren_depth == 0 and depth > 0:
                    depth -= 1
                    if started and depth == 0:
                        return i
        # Expression-style declaration (no braces): stop at a terminating ';'.
        if not started and i > start_idx and line.rstrip().endswith(";"):
            return i
        if not started and i - start_idx > 6:
            return i
    return limit - 1


def _js_symbols(abs_path: str) -> list[dict]:
    try:
        if os.path.getsize(abs_path) > MAX_FILE_BYTES_FOR_SYMBOLS:
            return []
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return []

    symbols: list[dict] = []
    seen_spans: set[int] = set()
    for idx, line in enumerate(lines):
        for pattern, kind in _JS_PATTERNS:
            m = pattern.match(line)
            if not m:
                continue
            if idx in seen_spans:
                break
            end = _js_body_end(lines, idx)
            seen_spans.add(idx)
            symbols.append({
                "name": m.group(1),
                "kind": kind,
                "line": idx + 1,
                "endLine": end + 1,
                "exported": line.lstrip().startswith("export"),
                "args": [],
            })
            break
    symbols.sort(key=lambda s: (s["line"], s["name"]))
    return symbols


def symbols_for_file(abs_path: str) -> list[dict]:
    """Symbol table for any supported language; [] when unsupported/too big."""
    lang = _lang_of(abs_path)
    try:
        if os.path.getsize(abs_path) > MAX_FILE_BYTES_FOR_SYMBOLS:
            return []
    except OSError:
        return []
    if lang == "python" and _PY_OK:
        return _python_symbols(abs_path)
    if lang in ("javascript", "typescript"):
        return _js_symbols(abs_path)
    return []


# --------------------------------------------------------------------------
# Telescope — zoom OUT
# --------------------------------------------------------------------------

def telescope(
    project_root: str,
    path: str,
    *,
    max_depth: int = 2,
    with_symbols: bool = True,
) -> dict:
    """Structural map of a directory or file, depth-bounded and sorted."""
    abs_path = resolve_within_root(project_root, path)
    if abs_path is None:
        return {"ok": False, "error": f"Path escapes project root: {path!r}"}
    if not os.path.exists(abs_path):
        return {"ok": False, "error": f"Path not found: {path!r}"}

    max_depth = max(0, min(int(max_depth), 6))
    root_abs = os.path.abspath(project_root)

    def rel(p: str) -> str:
        return os.path.relpath(p, root_abs)

    if os.path.isfile(abs_path):
        entry: dict[str, Any] = {
            "path": rel(abs_path),
            "type": "file",
            "lang": _lang_of(abs_path),
            "lines": _count_lines(abs_path),
            "bytes": os.path.getsize(abs_path),
        }
        if with_symbols:
            syms = symbols_for_file(abs_path)
            entry["symbols"] = [
                {"name": s["name"], "kind": s["kind"], "line": s["line"]}
                for s in syms[:MAX_SYMBOLS_PER_FILE]
            ]
            if len(syms) > MAX_SYMBOLS_PER_FILE:
                entry["symbolsTruncated"] = True
        return {"ok": True, "type": "file", "view": entry}

    # Directory walk --------------------------------------------------------
    stats = {"dirs": 0, "files": 0, "lines": 0, "symbolized": 0}
    budget = [MAX_SYMBOLIZED_FILES]

    def build(dir_abs: str, depth: int) -> dict:
        node = {
            "path": rel(dir_abs),
            "type": "dir",
            "children": [],
        }
        try:
            entries = sorted(os.listdir(dir_abs))
        except OSError:
            node["error"] = "unreadable"
            return node

        dirs = []
        files = []
        for name in entries:
            if name.startswith("."):
                continue  # dotfiles/dotdirs are noise for the lens
            full = os.path.join(dir_abs, name)
            if os.path.isdir(full):
                if not _is_ignored_dir(name):
                    dirs.append((name, full))
            elif os.path.isfile(full):
                files.append((name, full))

        for name, full in dirs:
            stats["dirs"] += 1
            if depth < max_depth:
                node["children"].append(build(full, depth + 1))
            else:
                node["children"].append({
                    "path": rel(full), "type": "dir", "collapsed": True,
                })

        for name, full in files:
            stats["files"] += 1
            lines = _count_lines(full)
            if lines:
                stats["lines"] += lines
            fnode: dict[str, Any] = {
                "path": rel(full),
                "type": "file",
                "lang": _lang_of(full),
                "lines": lines,
            }
            if (
                with_symbols
                and budget[0] > 0
                and _lang_of(full) in CODE_LANGS
                and os.path.getsize(full) <= MAX_FILE_BYTES_FOR_SYMBOLS
            ):
                syms = symbols_for_file(full)
                if syms:
                    fnode["symbols"] = [
                        {"name": s["name"], "kind": s["kind"], "line": s["line"]}
                        for s in syms[:MAX_SYMBOLS_PER_FILE]
                    ]
                    stats["symbolized"] += 1
                budget[0] -= 1
            node["children"].append(fnode)
        return node

    tree = build(abs_path, 0)
    return {
        "ok": True,
        "type": "dir",
        "path": rel(abs_path),
        "maxDepth": max_depth,
        "tree": tree,
        "summary": stats,
    }


# --------------------------------------------------------------------------
# Microscope — zoom IN
# --------------------------------------------------------------------------

def _read_lines(abs_path: str) -> list[str] | None:
    try:
        if os.path.getsize(abs_path) > MAX_FILE_BYTES_FOR_LINES:
            return None
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
            return fh.read().splitlines()
    except OSError:
        return None


def _cross_reference(
    project_root: str,
    symbol: str,
    *,
    max_hits: int = 25,
) -> list[dict]:
    """Literal word-boundary grep across code files (bounded, sorted)."""
    root_abs = os.path.abspath(project_root)
    pattern = re.compile(r"\b" + re.escape(symbol) + r"\b")
    hits: list[dict] = []
    scanned = 0

    def walk(dir_abs: str) -> None:
        nonlocal scanned
        if scanned >= MAX_REF_FILES_SCANNED or len(hits) >= max_hits:
            return
        try:
            entries = sorted(os.listdir(dir_abs))
        except OSError:
            return
        for name in entries:
            if scanned >= MAX_REF_FILES_SCANNED or len(hits) >= max_hits:
                return
            if name.startswith("."):
                continue  # dotfiles (histories, caches) are noise for refs
            full = os.path.join(dir_abs, name)
            if os.path.isdir(full):
                if not _is_ignored_dir(name):
                    walk(full)
            elif os.path.isfile(full):
                ext = os.path.splitext(name)[1].lower()
                if ext not in REF_EXTENSIONS:
                    continue
                try:
                    if os.path.getsize(full) > MAX_REF_FILE_BYTES:
                        continue
                except OSError:
                    continue
                scanned += 1
                try:
                    with open(full, "r", encoding="utf-8", errors="ignore") as fh:
                        for lineno, line in enumerate(fh, start=1):
                            if pattern.search(line):
                                hits.append({
                                    "file": os.path.relpath(full, root_abs),
                                    "line": lineno,
                                    "text": line.strip()[:160],
                                })
                                if len(hits) >= max_hits:
                                    return
                except OSError:
                    continue

    walk(root_abs)
    hits.sort(key=lambda h: (h["file"], h["line"]))
    return hits


def microscope(
    project_root: str,
    path: str,
    *,
    symbol: str | None = None,
    line: int | None = None,
    context: int = 2,
    refs: bool = False,
    max_refs: int = 25,
) -> dict:
    """Symbol-level view of one file.

    Modes (first match wins):
      symbol given -> extract matching definitions with full bodies
      line given   -> window of lines around it
      neither      -> the file's full symbol table (its internal map)

    refs=True adds a repo-wide cross-reference of `symbol`.
    """
    abs_path = resolve_within_root(project_root, path)
    if abs_path is None:
        return {"ok": False, "error": f"Path escapes project root: {path!r}"}
    if not os.path.isfile(abs_path):
        return {"ok": False, "error": f"Not a file: {path!r}"}

    lang = _lang_of(abs_path)
    lines = _read_lines(abs_path)
    if lines is None:
        return {"ok": False, "error": "File too large for the microscope."}

    result: dict[str, Any] = {
        "ok": True,
        "path": os.path.relpath(abs_path, os.path.abspath(project_root)),
        "lang": lang,
        "totalLines": len(lines),
    }

    syms = symbols_for_file(abs_path)

    if symbol:
        needle = symbol.strip().lower()
        matches = [s for s in syms if needle in s["name"].lower()]
        # Fall back to raw text search when the symbol table has no match.
        if not matches:
            text_hits = [
                i for i, ln in enumerate(lines) if needle in ln.lower()
            ][:10]
            result["mode"] = "text"
            result["matches"] = [
                {
                    "line": i + 1,
                    "text": lines[i].strip()[:200],
                }
                for i in text_hits
            ]
            if not text_hits:
                result["ok"] = False
                result["error"] = f"No symbol or text match for {symbol!r}."
        else:
            result["mode"] = "symbol"
            bodies = []
            for s in matches[:8]:
                start = s["line"] - 1
                end = min(s.get("endLine", s["line"]), len(lines))
                body_lines = lines[start:end]
                truncated = len(body_lines) > MAX_BODY_LINES
                bodies.append({
                    "name": s["name"],
                    "kind": s["kind"],
                    "line": s["line"],
                    "endLine": s.get("endLine"),
                    "truncated": truncated,
                    "body": "\n".join(body_lines[:MAX_BODY_LINES]),
                })
            result["matches"] = bodies
    elif line is not None:
        try:
            line_no = int(line)
        except (TypeError, ValueError):
            return {"ok": False, "error": "line must be an integer."}
        context = max(0, min(int(context), 40))
        half_window = min(context, MAX_LINE_WINDOW // 2)
        lo = max(1, line_no - half_window)
        hi = min(len(lines), line_no + half_window)
        if line_no < 1 or line_no > len(lines):
            return {"ok": False, "error": f"line {line_no} out of range (1-{len(lines)})."}
        result["mode"] = "line"
        result["lines"] = [
            {"line": n, "text": lines[n - 1]} for n in range(lo, hi + 1)
        ]
    else:
        result["mode"] = "index"
        result["symbols"] = syms[:100]
        if len(syms) > 100:
            result["symbolsTruncated"] = True

    if refs and symbol:
        result["refs"] = _cross_reference(
            project_root, symbol.strip(), max_hits=max(1, min(int(max_refs), 50))
        )

    return result
