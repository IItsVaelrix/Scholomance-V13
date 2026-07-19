"""Pure helpers + local harness actions for DivTube agent tools.

Kept separate from tool_service so parsers/path logic can be unit-tested
without importing the full TUI tool surface.
"""

from __future__ import annotations

import glob
import json
import os
import re
import shutil
import subprocess
from typing import Any


TSC_ERROR_RE = re.compile(
    r"^(?P<file>[^(]+)\((?P<line>\d+),(?P<col>\d+)\):\s*"
    r"error\s+(?P<code>TS\d+):\s*(?P<message>.*)$"
)

# DivTube is often launched from a desktop shortcut / konsole without sourcing
# ~/.bashrc, so nvm's node/npm are missing from PATH. Resolve them explicitly.
_NVM_NODE_GLOB = os.path.expanduser("~/.nvm/versions/node/*/bin")


def resolve_node_bin_dir() -> str | None:
    """Return a directory that contains node/npm/npx, or None."""
    nvm_bin = os.environ.get("NVM_BIN")
    if nvm_bin and os.path.isfile(os.path.join(nvm_bin, "node")):
        return nvm_bin
    # Prefer the same pin tool_service._node_bin uses when present.
    pinned = "/home/deck/.nvm/versions/node/v20.20.2/bin"
    if os.path.isfile(os.path.join(pinned, "node")):
        return pinned
    candidates = sorted(glob.glob(_NVM_NODE_GLOB), reverse=True)
    for d in candidates:
        if os.path.isfile(os.path.join(d, "node")):
            return d
    which_node = shutil.which("node")
    if which_node:
        return os.path.dirname(os.path.realpath(which_node))
    return None


def node_env(base: dict | None = None) -> dict:
    """Environment with nvm/node bin prepended so npm/npx resolve reliably."""
    env = dict(base if base is not None else os.environ)
    bin_dir = resolve_node_bin_dir()
    if bin_dir:
        env["PATH"] = bin_dir + os.pathsep + env.get("PATH", "")
    return env


def _tool(name: str) -> str:
    """Absolute path to node/npm/npx when possible; else bare name."""
    bin_dir = resolve_node_bin_dir()
    if bin_dir:
        candidate = os.path.join(bin_dir, name)
        if os.path.isfile(candidate):
            return candidate
    return shutil.which(name) or name


def normalize_violation(v: dict) -> dict:
    """Normalize a diagnostic violation to include file_path + line when known."""
    ctx = v.get("context") if isinstance(v.get("context"), dict) else {}
    loc = ctx.get("loc") if isinstance(ctx.get("loc"), dict) else {}
    file_path = (
        ctx.get("filePath")
        or ctx.get("file_path")
        or v.get("filePath")
        or v.get("file_path")
        or ctx.get("path")
        or v.get("path")
    )
    line = (
        ctx.get("line")
        or v.get("line")
        or loc.get("line")
        or loc.get("startLine")
    )
    if line is not None:
        try:
            line = int(line)
        except (TypeError, ValueError):
            line = None
    return {
        "file_path": file_path,
        "line": line,
        "rule_id": ctx.get("ruleId") or v.get("ruleId") or v.get("checkId"),
        "severity": v.get("severity"),
        "message": v.get("message") or ctx.get("detail") or v.get("checkId") or "",
        "context": ctx,
    }


def format_violations_text(violations: list, total: int | None = None) -> str:
    n = total if total is not None else len(violations)
    lines = [f"--- Violations ({n} total) ---"]
    for v in violations[:20]:
        nv = normalize_violation(v)
        loc = ""
        if nv.get("file_path"):
            loc = nv["file_path"]
            if nv.get("line") is not None:
                loc = f"{loc}:{nv['line']}"
            loc = f" @ {loc}"
        lines.append(
            f"  [{nv.get('severity', '?')}] {nv.get('rule_id', '?')} - {nv.get('message', '')}{loc}"
        )
    if len(violations) > 20:
        lines.append(f"  ... and {len(violations) - 20} more")
    return "\n".join(lines)


def parse_tsc_errors(stdout: str, stderr: str = "") -> list[dict]:
    errors = []
    for raw in (stdout or "").splitlines() + (stderr or "").splitlines():
        m = TSC_ERROR_RE.match(raw.strip())
        if not m:
            continue
        errors.append({
            "file": m.group("file").strip(),
            "line": int(m.group("line")),
            "column": int(m.group("col")),
            "code": m.group("code"),
            "message": m.group("message").strip(),
        })
    return errors


def parse_vitest_json(payload: str | dict) -> dict:
    """Parse vitest --reporter=json output into a compact summary."""
    data = json.loads(payload) if isinstance(payload, str) else payload
    tests_out = []
    passed = failed = skipped = 0
    # Vitest JSON shapes vary; support common ones.
    test_results = data.get("testResults") or data.get("files") or []
    if not test_results and isinstance(data.get("tests"), list):
        for t in data["tests"]:
            status = (t.get("status") or t.get("result") or "").lower()
            name = t.get("fullName") or t.get("name") or t.get("title") or "?"
            file_path = t.get("file") or t.get("filepath") or ""
            if status in ("pass", "passed", "success"):
                passed += 1
                st = "pass"
            elif status in ("fail", "failed", "failure"):
                failed += 1
                st = "fail"
            else:
                skipped += 1
                st = "skip"
            tests_out.append({"name": name, "status": st, "file": file_path})
    else:
        for fr in test_results:
            file_path = fr.get("name") or fr.get("file") or fr.get("filepath") or ""
            assertion = fr.get("assertionResults") or fr.get("tasks") or fr.get("tests") or []
            for t in assertion:
                status = (t.get("status") or "").lower()
                name = t.get("fullName") or t.get("title") or t.get("name") or "?"
                if isinstance(name, list):
                    name = " ".join(str(x) for x in name)
                if status in ("pass", "passed", "success"):
                    passed += 1
                    st = "pass"
                elif status in ("fail", "failed", "failure"):
                    failed += 1
                    st = "fail"
                else:
                    skipped += 1
                    st = "skip"
                tests_out.append({"name": name, "status": st, "file": file_path})
    if not tests_out:
        # Fallback counters from summary fields
        num_pass = data.get("numPassedTests") or data.get("passed") or 0
        num_fail = data.get("numFailedTests") or data.get("failed") or 0
        num_skip = data.get("numPendingTests") or data.get("skipped") or 0
        passed, failed, skipped = int(num_pass), int(num_fail), int(num_skip)
    return {
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "tests": tests_out,
    }


def parse_git_log(stdout: str, limit: int = 20) -> list[dict]:
    entries = []
    # Expected: hash\x00author\x00date\x00subject\n
    for block in (stdout or "").split("\n"):
        if not block.strip():
            continue
        parts = block.split("\x00")
        if len(parts) < 4:
            continue
        entries.append({
            "hash": parts[0],
            "author": parts[1],
            "date": parts[2],
            "summary": parts[3],
        })
        if len(entries) >= limit:
            break
    return entries


def parse_git_blame_porcelain(stdout: str) -> list[dict]:
    """Collapse porcelain blame into line-range entries per commit."""
    entries = []
    current = None
    for line in (stdout or "").splitlines():
        if re.match(r"^[0-9a-f]{7,40} ", line):
            parts = line.split()
            sha, orig_line, final_line = parts[0], int(parts[1]), int(parts[2])
            group = int(parts[3]) if len(parts) > 3 else 1
            current = {
                "hash": sha,
                "start_line": final_line,
                "end_line": final_line + group - 1,
                "author": None,
                "date": None,
                "summary": None,
            }
            entries.append(current)
        elif current is None:
            continue
        elif line.startswith("author "):
            current["author"] = line[7:]
        elif line.startswith("author-time "):
            current["date"] = line[12:]
        elif line.startswith("summary "):
            current["summary"] = line[8:]
    return entries


def file_create(
    project_root: str,
    rel_path: str,
    content: str,
    overwrite: bool = False,
) -> dict[str, Any]:
    if not rel_path or rel_path.strip() in (".", "/"):
        return {"ok": False, "error": "path is required"}
    joined = os.path.normpath(os.path.join(project_root, rel_path))
    if not joined.startswith(os.path.normpath(project_root)):
        return {"ok": False, "error": "path escapes project root"}
    exists = os.path.exists(joined)
    if exists and not overwrite:
        return {
            "ok": False,
            "error": f"File already exists: {rel_path} (pass overwrite=true to replace)",
            "path": rel_path,
            "created": False,
        }
    parent = os.path.dirname(joined)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(joined, "w", encoding="utf-8") as f:
        f.write(content if content is not None else "")
    return {
        "ok": True,
        "path": rel_path,
        "created": not exists,
        "bytes": len((content or "").encode("utf-8")),
    }


def run_typecheck(project_root: str, project: str | None = None, timeout: int = 300) -> dict:
    if project:
        cmd = [_tool("npx"), "tsc", "-p", project, "--noEmit"]
    else:
        cmd = [_tool("npm"), "run", "typecheck"]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=project_root,
        env=node_env(),
    )
    errors = parse_tsc_errors(proc.stdout, proc.stderr)
    return {
        "ok": proc.returncode == 0,
        "errors": errors,
        "exit_code": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-2000:],
        "stderr_tail": (proc.stderr or "")[-2000:],
    }


def run_tests(
    project_root: str,
    runner: str = "vitest",
    target: str | None = None,
    suite: str | None = None,
    timeout: int = 600,
) -> dict:
    runner = (runner or "vitest").lower()
    if runner == "vitest":
        cmd = [_tool("npx"), "vitest", "run", "--reporter=json"]
        if target:
            cmd.append(target)
    elif runner == "npm":
        script = suite or "test"
        cmd = [_tool("npm"), "run", script]
        if target:
            cmd.extend(["--", target])
    else:
        return {"ok": False, "error": f"Unknown runner: {runner}", "exit_code": 2}

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=project_root,
        env=node_env(),
    )
    out = {
        "ok": proc.returncode == 0,
        "runner": runner,
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "tests": [],
        "exit_code": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-3000:],
        "stderr_tail": (proc.stderr or "")[-2000:],
    }
    if runner == "vitest":
        # JSON may be embedded in stdout; try whole stdout then last {...} blob.
        text = proc.stdout or ""
        parsed = None
        try:
            parsed = parse_vitest_json(text)
        except (json.JSONDecodeError, TypeError, ValueError):
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    parsed = parse_vitest_json(text[start : end + 1])
                except (json.JSONDecodeError, TypeError, ValueError):
                    parsed = None
        if parsed:
            out.update(parsed)
            out["ok"] = proc.returncode == 0 and parsed.get("failed", 0) == 0
    return out


def git_history(
    project_root: str,
    rel_path: str,
    mode: str = "log",
    limit: int = 20,
) -> dict:
    if not rel_path:
        return {"ok": False, "error": "path is required"}
    mode = (mode or "log").lower()
    abs_path = os.path.normpath(os.path.join(project_root, rel_path))
    if not abs_path.startswith(os.path.normpath(project_root)):
        return {"ok": False, "error": "path escapes project root"}
    if mode == "log":
        fmt = "%H%x00%an%x00%ad%x00%s"
        proc = subprocess.run(
            [
                "git", "log", "--follow", f"-n{max(1, int(limit))}",
                f"--pretty=format:{fmt}", "--date=iso", "--", rel_path,
            ],
            capture_output=True, text=True, cwd=project_root, timeout=60,
        )
        if proc.returncode != 0:
            return {"ok": False, "error": proc.stderr.strip() or "git log failed", "exit_code": proc.returncode}
        return {
            "ok": True,
            "mode": "log",
            "path": rel_path,
            "entries": parse_git_log(proc.stdout, limit=limit),
        }
    if mode == "blame":
        proc = subprocess.run(
            ["git", "blame", "-p", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=60,
        )
        if proc.returncode != 0:
            return {"ok": False, "error": proc.stderr.strip() or "git blame failed", "exit_code": proc.returncode}
        return {
            "ok": True,
            "mode": "blame",
            "path": rel_path,
            "entries": parse_git_blame_porcelain(proc.stdout)[: max(1, int(limit)) * 5],
        }
    return {"ok": False, "error": f"Unknown mode: {mode}"}


def scholo_gate(
    project_root: str,
    intent: str,
    derived: bool = False,
    taint: str | None = None,
    log: bool = False,
    timeout: int = 60,
) -> dict:
    if not intent or not intent.strip():
        return {"ok": False, "error": "intent is required"}
    script = os.path.join(project_root, "scripts", "scholo-gate.mjs")
    cmd = [_tool("npx"), "tsx", script, "--json"]
    if derived:
        cmd.append("--derived")
    if taint:
        cmd.append(f"--taint={taint}")
    if log:
        cmd.append("--log")
    cmd.append(intent.strip())
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=project_root,
            env=node_env(),
        )
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "scholo_gate timed out"}
    text = (proc.stdout or "").strip()
    if proc.returncode != 0 and not text:
        return {
            "ok": False,
            "error": (proc.stderr or f"exit {proc.returncode}").strip(),
            "exit_code": proc.returncode,
        }
    try:
        data = json.loads(text)
        data.setdefault("ok", True)
        data["raw_tail"] = (proc.stderr or "")[-500:]
        return data
    except json.JSONDecodeError:
        return {
            "ok": proc.returncode == 0,
            "intent": intent,
            "raw_tail": text[-3000:],
            "stderr_tail": (proc.stderr or "")[-1000:],
            "exit_code": proc.returncode,
            "error": "Failed to parse scholo-gate JSON; see raw_tail",
        }
