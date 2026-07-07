# Import color constants from app.py
import subprocess
import threading
import os
import sys

# Add steamdeck_brain parent to path for imports
steamdeck_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
parent = os.path.dirname(steamdeck_dir)
if parent not in sys.path:
    sys.path.insert(0, parent)

# ── Scholomance palette (mirrors tui/ui/app.py) ──────────────────────
GOLD    = "#FFD700"
PURPLE  = "#B388FF"
SUCCESS = "#7CFF8B"
WARNING = "#FFD166"
ERROR   = "#FF5C7A"
MUTED   = "#6A5A6A"


class BrainBridgeService:
    """Service wrapper for SteamDeck Brain daemon.

    Manages a persistent HTTP connection to brain_daemon.py instead of
    spawning fresh Python processes. Falls back to direct subprocess if
    daemon is unavailable.
    """

    def __init__(self, port: int = 9090):
        self.port = port
        self.process = None
        self._client = None
        self._lock = threading.Lock()

    def _get_client(self):
        """Lazy-load HTTP client."""
        if self._client is None:
            try:
                import sys
                steamdeck_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                parent = os.path.dirname(steamdeck_dir)
                if parent not in sys.path:
                    sys.path.insert(0, parent)
                from steamdeck_brain.brain_bridge_client import BrainBridgeClient
                self._client = BrainBridgeClient(port=self.port)
            except ImportError:
                return None
        return self._client

    def start_daemon(self, model: str = "qwen2.5:1.5b", substrate_db: str = "~/.substrate/memory.sqlite"):
        """Start the brain daemon in background."""
        steamdeck_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        brain_dir = os.path.join(os.path.dirname(os.path.dirname(steamdeck_dir)), "steamdeck_brain")
        script_path = os.path.join(brain_dir, "brain_daemon.py")

        if not os.path.exists(script_path):
            return {"error": f"brain_daemon.py not found at {script_path}"}

        try:
            self.process = subprocess.Popen(
                ["python3", script_path, "--model", model, "--port", str(self.port), "--db", substrate_db],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True
            )
            # Give daemon time to start
            import time
            for _ in range(50):
                time.sleep(0.1)
                if self.is_available():
                    return {"status": "ok", "pid": self.process.pid}
            return {"error": "Daemon started but not responding on port"}
        except Exception as e:
            return {"error": str(e)}

    def stop_daemon(self):
        """Stop the brain daemon."""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None
        self._client = None
        return {"status": "ok", "message": "Daemon stopped"}

    def is_available(self) -> bool:
        """Check if daemon is running."""
        client = self._get_client()
        if client is None:
            return False
        return client.is_available()

    def ask(self, query: str, callback, show_context: bool = False, compare: bool = False):
        """Query via daemon or fall back to subprocess."""
        def run():
            client = self._get_client()
            if client and client.is_available():
                resp = client.ask(query, show_context=show_context, compare=compare)
                callback(resp)
            else:
                # Fallback: call steamdeck_brain.py directly
                steamdeck_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                brain_dir = os.path.join(os.path.dirname(os.path.dirname(steamdeck_dir)), "steamdeck_brain")
                script = os.path.join(brain_dir, "steamdeck_brain.py")

                cmd = ["python3", script, "-q", query, "--model", "qwen2.5:1.5b"]
                if compare:
                    cmd.append("--compare")
                try:
                    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                    output = proc.stdout
                    # Strip the header lines
                    lines = output.split("\n")
                    start = next((i for i, l in enumerate(lines) if "🧠" in l or "Response:" in l or lines[i-1] == "==============="), 0)
                    response = "\n".join(lines[start+1:]) if start else output
                    callback(response.strip())
                except Exception as e:
                    callback(f"[{ERROR}]Error:[/] {e}")

        threading.Thread(target=run, daemon=True).start()

    def stats(self, callback):
        """Get daemon stats."""
        client = self._get_client()
        if client and client.is_available():
            stats = client.stats()
            callback(f"[bold {GOLD}]Brain Daemon Stats:[/]\n  L2 memories: {stats.get('L2_substrate', {}).get('total', '?')}\n  Queries served: {stats.get('queries_served', '?')}")
        else:
            callback(f"[{WARNING}]Daemon not available.[/]")

    def shutdown(self):
        """Clean shutdown."""
        if self._client:
            self._client = None
        if self.process:
            self.stop_daemon()