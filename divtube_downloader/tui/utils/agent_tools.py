"""
DivTube agent toolbelt — lightweight primitives for autonomous codebase work.

These functions are intentionally simple, file-system-based, and safe to call
from an agent loop. They batch work into single subprocess calls where possible
and return structured, serializable results.
"""

from __future__ import annotations

import ast
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from tui.utils.search_governor import _DEFAULT_IGNORED_DIRS, _find_ripgrep, _resolve_root


@dataclass
class SymbolMatch:
    """A found symbol definition."""

    name: str
    kind: str  # function, class, variable, import
    file: str
    line: int
    context: str = ""


@dataclass
class ImportEdge:
    """One import relationship from a single file."""

    source: str
    target: str
    line: int
    is_from: bool = False
    alias: str | None = None


@dataclass
class ImportGraph:
    """Import graph for a single file."""

    file: str
    edges: list[ImportEdge] = field(default_factory=list)


@dataclass
class PatchResult:
    """Result of apply_patch()."""

    success: bool
    message: str
    backup_path: str | None = None


@dataclass
class AgentToolResult:
    """Result of run_targeted_tests()."""

    success: bool
    stdout: str
    stderr: str
    returncode: int


def list_project_tree(
    root: str | Path | None = None,
    *,
    max_depth: int = 4,
    max_files: int = 500,
    show_size: bool = False,
) -> str:
    """
    Return an ASCII tree of the project, ignoring common build/cache dirs.

    Args:
        root: Project root. Auto-detected if omitted.
        max_depth: How deep to recurse.
        max_files: Hard cap on files enumerated.
        show_size: Append byte sizes to file entries.
    """
    root_path = _resolve_root(root)
    ignored = _DEFAULT_IGNORED_DIRS | {".git", ".idea", ".vscode"}

    lines: list[str] = [str(root_path.name) + "/"]
    count = 0

    def walk(current: Path, prefix: str, depth: int) -> None:
        nonlocal count
        if depth >= max_depth or count >= max_files:
            return

        try:
            entries = sorted(
                (e for e in current.iterdir() if e.name not in ignored and not e.name.startswith(".")),
                key=lambda e: (not e.is_dir(), e.name.lower()),
            )
        except PermissionError:
            return

        for i, entry in enumerate(entries):
            if count >= max_files:
                lines.append(prefix + "... (truncated)")
                return

            is_last = i == len(entries) - 1
            connector = "└── " if is_last else "├── "
            name = entry.name + "/" if entry.is_dir() else entry.name
            if show_size and entry.is_file():
                try:
                    name += f"  ({entry.stat().st_size} bytes)"
                except OSError:
                    pass
            lines.append(prefix + connector + name)
            count += 1

            if entry.is_dir():
                extension = "    " if is_last else "│   "
                walk(entry, prefix + extension, depth + 1)

    walk(root_path, "", 0)
    return "\n".join(lines)


def ripgrep_many(
    queries: Iterable[str],
    *,
    root: str | Path | None = None,
    include: str | None = None,
    max_results_per_query: int = 200,
    timeout: int = 30,
):
    """Snake-case alias for search_governor.ripgrepMany."""
    from tui.utils.search_governor import ripgrepMany

    return ripgrepMany(
        queries,
        root=root,
        include=include,
        max_results_per_query=max_results_per_query,
        timeout=timeout,
    )


def find_symbol(
    name: str,
    *,
    root: str | Path | None = None,
    include: str | None = None,
) -> list[SymbolMatch]:
    """
    Find definitions of a symbol (function, class, or assignment) across the project.

    Uses ripgrep for fast file discovery, then AST parsing for accurate line numbers.
    """
    if not name.strip():
        return []

    rg_bin = _find_ripgrep()
    if rg_bin is None:
        raise RuntimeError("ripgrep (rg) not found")

    root_path = _resolve_root(root)
    cmd = [rg_bin, "--files"]
    for d in _DEFAULT_IGNORED_DIRS:
        cmd.extend(["--glob", f"!{d}/**"])
    if include:
        cmd.extend(["--glob", include])

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=root_path)
    if result.returncode != 0:
        raise RuntimeError(f"ripgrep failed: {result.stderr}")

    matches: list[SymbolMatch] = []
    target = name.strip()

    for file_path in result.stdout.splitlines():
        if not file_path.endswith(".py"):
            continue
        full = root_path / file_path
        try:
            source = full.read_text(encoding="utf-8", errors="replace")
            tree = ast.parse(source)
        except (SyntaxError, UnicodeDecodeError, OSError):
            continue

        for node in ast.walk(tree):
            line = getattr(node, "lineno", 0)
            if isinstance(node, ast.FunctionDef) and node.name == target:
                matches.append(SymbolMatch(target, "function", str(full), line))
            elif isinstance(node, ast.AsyncFunctionDef) and node.name == target:
                matches.append(SymbolMatch(target, "async_function", str(full), line))
            elif isinstance(node, ast.ClassDef) and node.name == target:
                matches.append(SymbolMatch(target, "class", str(full), line))
            elif isinstance(node, ast.Assign):
                for target_node in node.targets:
                    if isinstance(target_node, ast.Name) and target_node.id == target:
                        matches.append(SymbolMatch(target, "variable", str(full), line))

    return sorted(matches, key=lambda m: (m.file, m.line))


def read_import_graph(file_path: str | Path) -> ImportGraph:
    """
    Parse the import graph for a single Python file.

    Returns ImportGraph with one edge per import statement.
    """
    path = Path(file_path).resolve()
    source = path.read_text(encoding="utf-8", errors="replace")
    tree = ast.parse(source)

    edges: list[ImportEdge] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                edges.append(
                    ImportEdge(
                        source=str(path),
                        target=alias.name,
                        line=node.lineno,
                        is_from=False,
                        alias=alias.asname,
                    )
                )
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                target = f"{module}.{alias.name}" if module else alias.name
                edges.append(
                    ImportEdge(
                        source=str(path),
                        target=target,
                        line=node.lineno,
                        is_from=True,
                        alias=alias.asname,
                    )
                )

    return ImportGraph(file=str(path), edges=edges)


def get_recent_errors(
    *,
    log_dir: str | Path | None = None,
    n: int = 20,
    include_ansi: bool = False,
) -> list[str]:
    """
    Scan known log files and return the most recent error-like lines.

    Searches error.log, output.log, app.log, and any *.log in log_dir.
    Strips ANSI escape codes unless include_ansi is True.
    """
    if log_dir is None:
        log_dir = _resolve_root() / "divtube_downloader"
    log_path = Path(log_dir)

    candidates = [
        log_path / "error.log",
        log_path / "output.log",
        log_path / "app.log",
    ]
    candidates.extend(log_path.glob("*.log"))

    # Deduplicate while preserving order.
    seen: set[Path] = set()
    log_files: list[Path] = []
    for p in candidates:
        if p not in seen and p.exists() and p.stat().st_size > 0:
            seen.add(p)
            log_files.append(p)

    ansi_re = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
    error_re = re.compile(r"(?i)(error|exception|traceback|failed|fatal|critical)")
    collected: list[tuple[float, str]] = []

    for log_file in log_files:
        try:
            with log_file.open("r", encoding="utf-8", errors="replace") as f:
                for raw_line in f:
                    line = raw_line if include_ansi else ansi_re.sub("", raw_line)
                    if error_re.search(line):
                        collected.append((log_file.stat().st_mtime, line.rstrip()))
        except OSError:
            continue

    # Most recent log's errors first, then by discovery order.
    collected.sort(key=lambda x: -x[0])
    return [line for _, line in collected[:n]]


def apply_patch(
    file_path: str | Path,
    target_content: str,
    replacement_content: str,
    *,
    create_backup: bool = True,
) -> PatchResult:
    """
    Apply a search/replace patch to a file.

    Requires the target block to appear exactly once. Creates a `.bak` backup
    unless create_backup is False.
    """
    path = Path(file_path).resolve()
    if not path.is_file():
        return PatchResult(False, f"File not found: {path}")

    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return PatchResult(False, f"Could not read {path}: {e}")

    if target_content not in content:
        return PatchResult(False, "target_content not found in file.")

    if content.count(target_content) > 1:
        return PatchResult(False, "target_content appears multiple times; make it unique.")

    backup_path: str | None = None
    if create_backup:
        bak = path.with_suffix(path.suffix + ".bak")
        shutil.copy2(path, bak)
        backup_path = str(bak)

    new_content = content.replace(target_content, replacement_content, 1)
    path.write_text(new_content, encoding="utf-8")

    return PatchResult(
        True,
        f"Successfully patched {path}",
        backup_path=backup_path,
    )


@dataclass
class WriteFileResult:
    """Result of a write_file() call."""

    success: bool
    message: str
    bytes_written: int = 0
    created: bool = False


def write_file(
    file_path: str | Path,
    content: str,
    *,
    encoding: str = "utf-8",
    require_project_root: bool = True,
) -> WriteFileResult:
    """
    Create or overwrite a file in a single step.

    Args:
        file_path: Target path. Relative paths resolve from the project root.
        content: Text content to write.
        encoding: Text encoding.
        require_project_root: If True, refuses to write outside the project root.

    Returns:
        WriteFileResult with success, message, bytes written, and whether the
        file was newly created.
    """
    root = _resolve_root()
    path = Path(file_path)
    if not path.is_absolute():
        path = root / path
    path = path.resolve()

    if require_project_root:
        try:
            path.relative_to(root)
        except ValueError:
            return WriteFileResult(
                False,
                f"Refusing to write outside project root: {path}",
            )

    created = not path.exists()

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        bytes_written = path.write_text(content, encoding=encoding)
    except OSError as e:
        return WriteFileResult(False, f"Failed to write {path}: {e}")

    action = "Created" if created else "Overwrote"
    return WriteFileResult(
        True,
        f"{action} {path}",
        bytes_written=bytes_written,
        created=created,
    )


def run_targeted_tests(
    target: str | None = None,
    *,
    pattern: str = "test*.py",
    timeout: int = 120,
) -> AgentToolResult:
    """
    Run targeted Python tests using unittest discovery.

    Args:
        target: Optional dotted test path (e.g. "tests.test_search_governor").
            The "divtube_downloader." package prefix is accepted and normalized.
        pattern: File glob for discovery when target is omitted.
        timeout: Subprocess timeout in seconds.
    """
    root = _resolve_root()
    divtube_root = root / "divtube_downloader"
    cmd = ["python", "-m", "unittest"]

    if target:
        normalized = target
        if normalized.startswith("divtube_downloader."):
            normalized = normalized[len("divtube_downloader.") :]
        cmd.append(normalized)
    else:
        cmd.extend(["discover", "-s", "tests", "-p", pattern])

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=divtube_root,
        )
        return AgentToolResult(
            success=proc.returncode == 0,
            stdout=proc.stdout,
            stderr=proc.stderr,
            returncode=proc.returncode,
        )
    except subprocess.TimeoutExpired as e:
        return AgentToolResult(
            success=False,
            stdout=e.stdout or "",
            stderr=e.stderr or "",
            returncode=-1,
        )


@dataclass
class RefactorResult:
    """Result of a batch refactor operation."""

    searched: int
    changed: int
    skipped: int
    details: list[dict]


def refactor_all(
    glob_pattern: str,
    search_text: str,
    replacement_text: str,
    *,
    root: str | Path | None = None,
    dry_run: bool = False,
    regex: bool = False,
) -> RefactorResult:
    """
    Batch search/replace across all files matching a glob pattern.

    In literal mode (default) only replaces files where ``search_text`` appears
    exactly once, to avoid ambiguous edits. In regex mode (--regex) the search
    string is treated as a Python regular expression and ``replacement_text``
    may contain back-references (\\1, \\2, etc.).

    Creates ``.bak`` backups unless *dry_run* is True.

    Args:
        glob_pattern: e.g. "tui/**/*.py" or "*.md"
        search_text: Exact text or regex pattern to search for.
        replacement_text: Literal replacement text or regex substitution template.
        root: Project root; auto-detected if omitted.
        dry_run: If True, report what would change without writing.
        regex: If True, treat search_text as a regex pattern.
    """
    root_path = _resolve_root(root)
    matches = sorted(root_path.glob(glob_pattern))

    details: list[dict] = []
    changed = 0
    skipped = 0

    compiled_pattern: re.Pattern | None = None
    if regex:
        try:
            compiled_pattern = re.compile(search_text)
        except re.error as e:
            return RefactorResult(
                searched=0,
                changed=0,
                skipped=0,
                details=[{"file": "", "status": "invalid_regex", "error": str(e)}],
            )

    for path in matches:
        if not path.is_file():
            continue
        if any(part in _DEFAULT_IGNORED_DIRS for part in path.parts):
            skipped += 1
            details.append({"file": str(path), "status": "ignored_dir"})
            continue

        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            skipped += 1
            details.append({"file": str(path), "status": "read_error", "error": str(e)})
            continue

        if regex:
            matches_list = list(compiled_pattern.finditer(content))
            count = len(matches_list)
            if count == 0:
                details.append({"file": str(path), "status": "no_match"})
                continue
            if count > 1:
                skipped += 1
                details.append({"file": str(path), "status": "ambiguous", "occurrences": count})
                continue

            if dry_run:
                details.append({"file": str(path), "status": "would_change"})
                changed += 1
                continue

            backup_path = path.with_suffix(path.suffix + ".bak")
            shutil.copy2(path, backup_path)
            new_content = compiled_pattern.sub(replacement_text, content, count=1)
            path.write_text(new_content, encoding="utf-8")
            changed += 1
            details.append({"file": str(path), "status": "changed", "backup": str(backup_path)})
        else:
            if search_text not in content:
                details.append({"file": str(path), "status": "no_match"})
                continue

            count = content.count(search_text)
            if count > 1:
                skipped += 1
                details.append({"file": str(path), "status": "ambiguous", "occurrences": count})
                continue

            if dry_run:
                details.append({"file": str(path), "status": "would_change"})
                changed += 1
                continue

            backup_path = path.with_suffix(path.suffix + ".bak")
            new_content = content.replace(search_text, replacement_text, 1)
            path.write_text(new_content, encoding="utf-8")
            changed += 1
            details.append({"file": str(path), "status": "changed", "backup": str(backup_path)})

    return RefactorResult(
        searched=len(matches),
        changed=changed,
        skipped=skipped,
        details=details,
    )
