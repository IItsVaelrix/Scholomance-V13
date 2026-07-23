"""Bridge subprocess dispatch — lifted out of tool_service.py (Boon 3).

This is the first reversible cut of decomposing the ~2759-line ToolService
god-module (strangler-fig). It gathers the cohesive, self-contained MODULE-LEVEL
helpers for shelling out to the Node ``scholomance-bridge.mjs`` microservice:

  * resolve a node binary that desktop launches otherwise miss (NVM),
  * run the bridge subprocess,
  * parse its JSON despite leading log noise,
  * confine relative paths to the project root.

``tool_service.py`` re-imports every name here, so its ~50 handlers — which call
these by bare module-global name — are unchanged. Behaviour is identical: the
node PATH side effect still fires at import time (now via this module).
"""
import json
import os
import subprocess

from tui.services import harness_tools

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BRIDGE_SCRIPT = os.path.join(PROJECT_ROOT, "divtube_downloader", "scripts", "scholomance-bridge.mjs")

# Ensure nvm node/npm are visible for the whole TUI process (bash_session,
# run_command, bridge). Desktop launches often skip ~/.bashrc.
_node_bin_dir = harness_tools.resolve_node_bin_dir()
if _node_bin_dir:
    os.environ["PATH"] = _node_bin_dir + os.pathsep + os.environ.get("PATH", "")


def _node_bin():
    bin_dir = harness_tools.resolve_node_bin_dir()
    if bin_dir:
        n = os.path.join(bin_dir, "node")
        if os.path.exists(n):
            return n
    return "node"


def _extract_bridge_json(text):
    """Parse JSON from bridge stdout/stderr, tolerating leading log noise."""
    if not text:
        return None
    raw = text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Prefer the last successfully decoded JSON value. Immunity used to print
    # a pseudo-object log line before the real payload; taking the first '{'
    # would fail. Walk candidates from the end.
    decoder = json.JSONDecoder()
    for opener in ("{", "["):
        idx = raw.rfind(opener)
        while idx >= 0:
            try:
                value, _ = decoder.raw_decode(raw, idx)
                return value
            except json.JSONDecodeError:
                idx = raw.rfind(opener, 0, idx)
    return None


def _run_bridge(command, *args, timeout=30, stdin=None):
    node = _node_bin()
    cmd = [node, BRIDGE_SCRIPT, command] + list(args)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=PROJECT_ROOT,
            input=stdin,
            env=harness_tools.node_env(),
        )
        payload = _extract_bridge_json(proc.stdout)
        if payload is None:
            payload = _extract_bridge_json(proc.stderr)
        if proc.returncode != 0:
            if isinstance(payload, dict) and payload.get("error"):
                return payload
            err = (proc.stderr or proc.stdout or "").strip() or f"exit code {proc.returncode}"
            return {"error": err}
        if payload is None:
            return {"error": "Failed to parse bridge output"}
        return payload
    except subprocess.TimeoutExpired:
        return {"error": "Command timed out"}
    except Exception as e:
        return {"error": str(e)}


def _safe_path(path):
    """Resolve a relative path and ensure it stays within PROJECT_ROOT."""
    joined = os.path.normpath(os.path.join(PROJECT_ROOT, path))
    if not joined.startswith(PROJECT_ROOT):
        return None
    return joined
