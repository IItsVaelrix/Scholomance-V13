#!/usr/bin/env python3
"""
MCP stdio bridge for the SteamDeck Brain daemon.

Exposes the brain network (Cortex + vaelrix_forcefield + scdna genes)
to any MCP-compatible CLI agent (opencode, Claude, Cursor, Gemini, Grok, Codex, etc.).

Run as stdio server:
  python steamdeck_brain/mcp_brain_bridge.py

Assumes the brain_daemon is running on http://127.0.0.1:9090
(or will attempt to hint the user).

Tools exposed:
  - ask_brain(query, show_context=False)
  - get_brain_health()
  - get_scdna_genes(domain="all")  # pulls relevant genes
  - list_available_brains()

This makes the daemon a first-class tool server for the entire agent ecosystem.
"""

import json
import sys
import os
import urllib.request
import urllib.error
from typing import Any, Dict

BRAIN_URL = os.environ.get("SCHOLOMANCE_BRAIN_URL", "http://127.0.0.1:9090")

def _http_get(path: str) -> dict:
    try:
        with urllib.request.urlopen(f"{BRAIN_URL}{path}", timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return {"error": f"Brain daemon not reachable at {BRAIN_URL}. Start with ./steamdeck_brain/launch-brain-stack.sh", "brain_url": BRAIN_URL, "details": str(e)}
    except Exception as e:
        return {"error": str(e), "brain_url": BRAIN_URL}

def _http_post(path: str, payload: dict) -> dict:
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{BRAIN_URL}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}", "body": body}
    except Exception as e:
        return {"error": str(e), "brain_url": BRAIN_URL}

def handle_initialize(params: dict) -> dict:
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {"listChanged": False},
            "resources": {"subscribe": False, "listChanged": False}
        },
        "serverInfo": {
            "name": "scholomance-brain",
            "version": "0.2.0"
        }
    }

def handle_tools_list() -> dict:
    return {
        "tools": [
            {
                "name": "ask_brain",
                "description": "Ask the Scholomance brain network (vaelrix forcefield + cortex + genes). Use for project-specific reasoning, PixelBrain, Wand propagation, architecture, lore, etc.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The question or task"},
                        "show_context": {"type": "boolean", "default": False, "description": "Include retrieved context/genes in response"}
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_brain_health",
                "description": "Check status of the brain daemon and loaded capabilities (genes, tools, model).",
                "inputSchema": {"type": "object", "properties": {}}
            },
            {
                "name": "get_scdna_genes",
                "description": "Retrieve active SCDNA genes for the current or specified domain (code, pixel, architecture, lore, etc.). Essential for chemical/rule-based reasoning.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "domain": {"type": "string", "default": "all"}
                    }
                }
            },
            {
                "name": "list_available_brains",
                "description": "List specialized brains available in the network (pixel_brain, architecture_brain, etc.).",
                "inputSchema": {"type": "object", "properties": {}}
            },
            {
                "name": "fetch_scdna_gene_packet",
                "description": "Fetch a large SCDNA Gene Packet containing coordinate cell grids, retrieved via its payloadRef from a PB-OK-v1-SCDNA-GENE-READY health event.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "payloadRef": {"type": "string", "description": "The path to the gene packet (e.g. pixelbrain/imports/asset_id/gene_id.json)"}
                    },
                    "required": ["payloadRef"]
                }
            }
        ]
    }

def handle_tools_call(name: str, arguments: dict) -> dict:
    if name == "ask_brain":
        query = arguments.get("query", "")
        # Direct ForceField + brain network (no Ollama, no daemon required).
        # The model-free path is mandatory; we never fall back to the
        # Ollama-backed daemon endpoint, so no 7B model is ever loaded.
        try:
            import direct_brain
            direct = direct_brain.forcefield_ask(query, deterministic=True)
            direct["via"] = "direct_forcefield"
            direct["ollama_used"] = False
            return {"content": [{"type": "text", "text": json.dumps(direct, indent=2)}]}
        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": json.dumps({
                        "error": str(e),
                        "mode": "direct-forcefield",
                        "ollama_used": False,
                        "hint": "Direct brain access requires PYTHONPATH=steamdeck_brain. "
                                "Daemon HTTP fallback intentionally disabled (no-llm mode).",
                    }, indent=2)
                }]
            }

    elif name == "get_brain_health":
        result = _http_get("/health")
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

    elif name == "get_scdna_genes":
        domain = arguments.get("domain", "all")
        # For now, call health or a future /genes endpoint. We can proxy to scdna.
        try:
            from vaelrix_forcefield.scdna.inject import load_injection_registry
            reg = load_injection_registry()
            if domain != "all":
                filtered = {k: v for k, v in reg.items() if domain in (v.domain.primary, *v.domain.secondary)}
            else:
                filtered = reg
            genes = [{"id": k, "domain": v.domain.primary, "imperative": v.instruction.imperative} for k, v in list(filtered.items())[:20]]
            return {"content": [{"type": "text", "text": json.dumps({"genes": genes}, indent=2)}]}
        except Exception as e:
            return {"content": [{"type": "text", "text": f"Error loading genes: {e}. Make sure PYTHONPATH includes steamdeck_brain."}]}

    elif name == "list_available_brains":
        try:
            import direct_brain
            data = direct_brain.list_brains()
            return {"content": [{"type": "text", "text": json.dumps(data, indent=2)}]}
        except Exception:
            brains = [
                "CODE_BRAIN - Code analysis + ripgrep",
                "PIXEL_BRAIN - Pixel/Scdl/lattice",
                "LORE_BRAIN - Lore + Vaelrix Law",
                "ARCHITECTURE_BRAIN - Schemas/contracts",
                "DETERMINISM_BRAIN - Purity checks",
                "vaelrix_forcefield - Full amplifier network + SCDNA"
            ]
            return {"content": [{"type": "text", "text": "\n".join(brains)}]}

    elif name == "fetch_scdna_gene_packet":
        payload_ref = arguments.get("payloadRef", "")
        # Validate safety (must be within codex/core/pixelbrain/imports)
        if ".." in payload_ref or not payload_ref.startswith("pixelbrain/imports/"):
            return {"content": [{"type": "text", "text": "Error: payloadRef must be a valid path inside pixelbrain/imports/"}]}
        
        full_path = os.path.join("codex/core", payload_ref)
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                data = f.read()
            return {"content": [{"type": "text", "text": data}]}
        except Exception as e:
            return {"content": [{"type": "text", "text": f"Error reading packet at {full_path}: {e}"}]}

    return {"content": [{"type": "text", "text": f"Unknown tool: {name}"}]}

def main():
    """Stdio MCP server loop."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            method = msg.get("method")
            params = msg.get("params") or {}
            msg_id = msg.get("id")

            if method == "initialize":
                result = handle_initialize(params)
            elif method == "tools/list":
                result = handle_tools_list()
            elif method == "tools/call":
                result = handle_tools_call(params.get("name"), params.get("arguments") or {})
            elif method == "notifications/initialized":
                # No response for notifications
                continue
            elif method == "ping":
                result = {}
            else:
                # Unknown method
                if msg_id is not None:
                    print(json.dumps({
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {"code": -32601, "message": f"Method not found: {method}"}
                    }), flush=True)
                continue

            if msg_id is not None:
                print(json.dumps({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": result
                }), flush=True)

        except Exception as e:
            if 'msg' in locals() and msg.get("id") is not None:
                print(json.dumps({
                    "jsonrpc": "2.0",
                    "id": msg.get("id"),
                    "error": {"code": -32603, "message": f"Internal error: {str(e)}"}
                }), flush=True)
            else:
                # Log to stderr for daemon
                print(f"ERROR in MCP brain bridge: {e}", file=sys.stderr)

if __name__ == "__main__":
    # Make executable from PATH if needed
    main()
