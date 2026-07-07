#!/usr/bin/env python3
"""
brain_bridge_client.py — HTTP Client for SteamDeck Brain Daemon
================================================================
Connects to a running brain_daemon.py instead of spinning up a fresh process.

Usage in DivTube TUI:
  from steamdeck_brain.brain_bridge_client import BrainBridgeClient
  client = BrainBridgeClient(port=9090)
  response = client.ask("what is soulfire?")
"""

import json
import urllib.request
import urllib.error
from typing import Dict, Any


class BrainBridgeClient:
    """HTTP client for the brain daemon - zero process spawn overhead."""

    def __init__(self, host: str = "127.0.0.1", port: int = 9090, timeout: int = 120):
        self.base_url = f"http://{host}:{port}"
        self.timeout = timeout
        self._available = None

    def _check_available(self) -> bool:
        """Check if daemon is running."""
        if self._available is None:
            try:
                req = urllib.request.Request(
                    f"{self.base_url}/health",
                    method="GET"
                )
                with urllib.request.urlopen(req, timeout=2) as resp:
                    data = json.loads(resp.read().decode())
                    self._available = "status" in data
            except Exception:
                self._available = False
        return self._available

    def ask(self, query: str, show_context: bool = False, compare: bool = False) -> Dict[str, Any]:
        """Query the daemon with full cortex context. Returns dict with response + tool_calls."""
        try:
            req = urllib.request.Request(
                f"{self.base_url}/ask",
                data=json.dumps({"query": query, "show_context": show_context, "compare": compare}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode())
                return {
                    "response": data.get("response", "[Error: no response]"),
                    "tool_calls": data.get("tool_calls", [])
                }
        except urllib.error.URLError as e:
            return {"response": f"[Error: daemon unavailable - {e.reason}]", "tool_calls": []}
        except Exception as e:
            return {"response": f"[Error: {e}]", "tool_calls": []}

    def ask_direct(self, query: str) -> str:
        """Query without substrate augmentation."""
        return self.ask(query, compare=True)["response"]

    def stats(self) -> Dict[str, Any]:
        """Get daemon stats."""
        try:
            req = urllib.request.Request(f"{self.base_url}/stats")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            return {"error": "daemon unavailable"}

    def is_available(self) -> bool:
        return self._check_available()