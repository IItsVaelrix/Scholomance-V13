#!/usr/bin/env python3
"""
brain_daemon.py — HTTP Server Daemon for SteamDeck Brain
========================================================
Keeps the Cortex + Ollama bridge alive in a persistent process.

Run this once at startup. The DivTube TUI connects via HTTP instead of
spawning fresh Python processes each query.

Architecture:
  - Cortex (L1/L2 substrate + multi-hop) stays warm
  - Ollama connection pooled
  - HTTP API on localhost:9090

Usage:
  python3 brain_daemon.py --model phi3:mini --port 9090   # foreground

To keep it on at all times (independent of DivTube, surviving crashes and
reboots), install it as a systemd --user service:
  ./systemd/install.sh

Clients use brain_bridge.BrainBridgeClient for transparent queries.
"""

import argparse
import json
import os
import sys
import signal
import socket
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ──────────────────────────────────────────────────────────────────

DEFAULT_PORT = 9090
DEFAULT_MODEL = "qwen2.5-coder:7b"
DEFAULT_NO_LLM = True  # Brain serves ForceField/SCDNA without Ollama by default

# Global bridge (single instance). Either BrainBridge (LLM) or NoLLMBridge (deterministic).
_bridge: Optional[object] = None


class NoLLMBridge:
    """
    Model-free brain bridge. Wraps direct_brain.forcefield_ask() so the HTTP
    daemon can serve brains + SCDNA + routing + arbiter without ever loading
    or calling Ollama. The full ForceField pipeline runs deterministically;
    no 7B model is touched, no RAM is pinned for inference, and the daemon
    never blocks on model cold-loads.
    """

    MODEL_ID = "no-llm (direct ForceField + SCDNA)"

    def __init__(self):
        # Lazy import so daemon startup doesn't fail if direct_brain is unavailable.
        import direct_brain  # noqa: F401
        self._direct = direct_brain
        self._queries = 0
        self._started_at = time.time()

    @property
    def model(self):
        # duck-typed for /health endpoint compatibility
        class _M:
            model = self.MODEL_ID
        return _M()

    def ask(self, query: str, show_context: bool = False, **_) -> str:
        self._queries += 1
        result = self._direct.forcefield_ask(query, deterministic=True)
        return self._format(result, show_context=show_context)

    def ask_direct(self, query: str, **_) -> str:
        self._queries += 1
        return (
            f"[no-llm direct] {query}\n"
            "(ForceField pipeline only; no Ollama model attached. "
            "Use /ask for full brain arbitration + SCDNA.)"
        )

    def get_stats(self) -> dict:
        return {
            "mode": "no-llm",
            "model": self.MODEL_ID,
            "queries_served": self._queries,
            "uptime_s": round(time.time() - self._started_at, 1),
            "ollama_used": False,
        }

    @staticmethod
    def _format(result: dict, show_context: bool) -> str:
        if not isinstance(result, dict):
            return str(result)
        if result.get("error"):
            return f"[brain error] {result['error']}"
        ans = result.get("answer") or {}
        findings = result.get("findings") or []
        signals = result.get("scdna_health_signals") or result.get("health_signals") or []
        genes = result.get("scdna_genes") or []
        next_action = result.get("next_action")
        lines = []
        if isinstance(ans, dict):
            summary = ans.get("summary") or ans.get("direct") and "Direct ForceField."
            if summary:
                lines.append(f"# {summary}")
            kf = ans.get("key_findings") or []
            if kf:
                lines.append("\n## Key findings")
                for f in kf[:8]:
                    lines.append(f"- {f}")
        else:
            lines.append(str(ans))
        if findings and show_context:
            lines.append("\n## Findings (raw)")
            for f in findings[:12]:
                lines.append(f"- {f}")
        if next_action:
            lines.append(f"\n## Next action\n{next_action}")
        if genes and show_context:
            lines.append(f"\n## SCDNA genes applied: {len(genes)}")
        if signals and show_context:
            lines.append(f"\n## Health signals: {len(signals)}")
        lines.append(f"\n[mode: {result.get('mode', 'direct-forcefield')}, ollama_used: {result.get('ollama_used', False)}]")
        return "\n".join(lines) if lines else json.dumps(result, indent=2, default=str)

# ─── HTTP Handler ────────────────────────────────────────────────────────────

class DaemonHandler(BaseHTTPRequestHandler):
    """HTTP handler for Cortex queries."""

    def log_message(self, format, *args):
        # Suppress default HTTP logs
        pass

    def _send_json(self, status: int, data: dict):
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
        except ConnectionError:
            print("⚠️  Warning: Client disconnected before response could be sent.")

    def do_GET(self):
        if self.path == "/health":
            tools_count = 0
            file_cache_stats = {"entries": 0, "size_bytes": 0, "size_mb": 0.0}
            try:
                from vaelrix_tools import TOOL_REGISTRY, _file_cache
                tools_count = len(TOOL_REGISTRY)
                file_cache_stats = _file_cache.stats()
            except Exception:
                pass
            self._send_json(200, {
                "status": "ok",
                "model": _bridge.model.model if _bridge else "not ready",
                "tools": tools_count,
                "file_cache": file_cache_stats
            })
        elif self.path == "/stats":
            if _bridge:
                self._send_json(200, _bridge.get_stats())
            else:
                self._send_json(503, {"error": "Bridge not initialized"})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ask":
            self._send_json(404, {"error": "not found"})
            return

        if not _bridge:
            self._send_json(503, {"error": "Bridge not initialized"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 10 * 1024 * 1024:
                self._send_json(413, {"error": "PB-ERR-v1-STATE-MAJOR-BRAIN-413--Payload Too Large"})
                return

            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except json.JSONDecodeError as e:
                self._send_json(400, {"error": f"PB-ERR-v1-STATE-MAJOR-BRAIN-400--Invalid JSON: {str(e)}"})
                return

            query = data.get("query", "")
            show_context = data.get("show_context", False)
            compare = data.get("compare", False)

            if not query:
                self._send_json(400, {"error": "empty query"})
                return

            if compare:
                response = _bridge.ask_direct(query)
            else:
                response = _bridge.ask(query, show_context=show_context)

            stats = _bridge.get_stats()
            tool_calls = getattr(_bridge, "_last_tool_log", [])
            self._send_json(200, {
                "response": response,
                "memories": stats.get("queries_served", stats.get("L2_substrate", {}).get("total", 0)),
                "model": _bridge.model.model if hasattr(_bridge, 'model') else DEFAULT_MODEL,
                "tool_calls": tool_calls
            })

        except Exception as e:
            self._send_json(500, {"error": f"PB-ERR-v1-STATE-CRITICAL-BRAIN-500--{str(e)}"})


def _port_in_use(host: str, port: int) -> bool:
    """Check whether a TCP port is currently bound."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def _probe_existing_daemon(port: int) -> Optional[dict]:
    """If something is listening on port, try to read its /health endpoint."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _pids_using_port(host: str, port: int) -> list[int]:
    """Return all PIDs listening on host:port (handles shared/listening sockets)."""
    pids: list[int] = []
    try:
        import psutil
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == psutil.CONN_LISTEN and conn.laddr.port == port:
                if host in ("0.0.0.0", "127.0.0.1") or conn.laddr.ip == host:
                    if conn.pid and conn.pid not in pids:
                        pids.append(conn.pid)
    except Exception:
        pass
    return pids


def _kill_process_tree(pid: int, sig: int) -> None:
    """Send signal to a process and its children."""
    try:
        import psutil
        parent = psutil.Process(pid)
        for child in parent.children(recursive=True):
            try:
                child.send_signal(sig)
            except psutil.NoSuchProcess:
                pass
        parent.send_signal(sig)
    except psutil.NoSuchProcess:
        pass
    except Exception:
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass


def _wait_for_port_free(host: str, port: int, timeout_s: float = 5.0) -> bool:
    """Poll until the port is no longer in use."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if not _port_in_use(host, port):
            return True
        time.sleep(0.1)
    return not _port_in_use(host, port)


def _refresh_port(port: int) -> bool:
    """
    If a brain daemon is already on this port, terminate it so we can take over.

    Returns True if the port is now free (or was already free), False if another
    process owns the port and could not be identified as the brain daemon.
    """
    if not _port_in_use("127.0.0.1", port):
        return True

    health = _probe_existing_daemon(port)
    if not health or "status" not in health:
        print(f"⛔ Port {port} is already in use by another process.")
        print("   Stop the other process or choose a different port with --port.")
        return False

    pids = _pids_using_port("127.0.0.1", port)
    if not pids:
        print(f"⚠️  Found a brain daemon on port {port} but could not determine its PID.")
        print("   Waiting briefly to see if it releases the port...")
        return _wait_for_port_free("127.0.0.1", port, timeout_s=3.0)

    print(f"🔄 Refreshing brain daemon on port {port} (PIDs {', '.join(map(str, pids))})...")
    for pid in pids:
        _kill_process_tree(pid, signal.SIGTERM)

    if _wait_for_port_free("127.0.0.1", port, timeout_s=5.0):
        print(f"   ✓ Port {port} released.")
        return True

    print("   ⚠️  SIGTERM did not release port; force-killing...")
    for pid in pids:
        _kill_process_tree(pid, signal.SIGKILL)

    if _wait_for_port_free("127.0.0.1", port, timeout_s=3.0):
        print(f"   ✓ Port {port} released.")
        return True

    print(f"   ✖ Port {port} is still occupied after attempting to refresh.")
    return False


def run_server(port: int = DEFAULT_PORT, model: str = DEFAULT_MODEL,
               substrate_db: str = "~/.substrate/memory.sqlite",
               top_k: int = 5, multi_hop: bool = True,
               ollama_host: str = "http://localhost:11434",
               personality: str = None,
               no_llm: bool = DEFAULT_NO_LLM):
    """Start the HTTP daemon."""
    global _bridge

    if not _refresh_port(port):
        sys.exit(1)

    if no_llm:
        print("🧠 Initializing NoLLMBridge (ForceField + SCDNA only, no Ollama)...")
        _bridge = NoLLMBridge()
        print(f"   ✓ Model-free mode active. Ollama will not be contacted.")
    else:
        print("🧠 Initializing BrainBridge (daemon mode, LLM-backed)...")
        from steamdeck_brain import BrainBridge
        _bridge = BrainBridge(
            model=model,
            substrate_db=substrate_db,
            top_k=top_k,
            multi_hop=multi_hop,
            ollama_host=ollama_host,
            personality=personality
        )

    HTTPServer.allow_reuse_address = True
    HTTPServer.allow_reuse_port = True

    server = None
    last_error = None
    for attempt in range(5):
        try:
            server = HTTPServer(("127.0.0.1", port), DaemonHandler)
            break
        except OSError as e:
            last_error = e
            if e.errno != 98:
                raise
            print(f"   ⏳ Port {port} still in use, retrying bind ({attempt + 1}/5)...")
            time.sleep(0.5)
    if server is None:
        raise RuntimeError(
            f"Could not bind to http://127.0.0.1:{port}: {last_error}"
        ) from last_error

    print(f"🌐 Brain daemon listening on http://127.0.0.1:{port}")
    print(f"   Model: {model} | Substrate: {substrate_db}")
    print("   Ready: POST JSON to /ask with {'query': '...'}")

    # Handle graceful shutdown
    def shutdown(signum, frame):
        print("\n🛑 Shutting down daemon...")
        server.shutdown()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="SteamDeck Brain HTTP Daemon")
    parser.add_argument("--port", "-p", type=int, default=DEFAULT_PORT)
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL)
    parser.add_argument("--db", default="~/.substrate/memory.sqlite")
    parser.add_argument("--top-k", "-k", type=int, default=5)
    parser.add_argument("--ollama-host", default="http://localhost:11434")
    parser.add_argument("--personality", "-P", default=None, help="Persona to load (e.g. Vaelrix)")
    parser.add_argument("--no-multi-hop", action="store_true")
    parser.add_argument("--no-llm", dest="no_llm", action="store_true",
                        default=DEFAULT_NO_LLM,
                        help="Run without Ollama (default: ON). ForceField + SCDNA only.")
    parser.add_argument("--llm", dest="no_llm", action="store_false",
                        help="Enable Ollama-backed bridge (loads 7B model).")
    args = parser.parse_args()

    run_server(
        port=args.port,
        model=args.model,
        substrate_db=args.db,
        top_k=args.top_k,
        multi_hop=not args.no_multi_hop,
        ollama_host=args.ollama_host,
        personality=args.personality,
        no_llm=args.no_llm
    )


if __name__ == "__main__":
    main()