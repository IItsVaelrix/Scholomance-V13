#!/usr/bin/env python3
"""
steamdeck_brain.py — The Motherboard: Cortex ↔ Model Bridge (v2)
================================================================
Integrated with Cortex for L1/L2 cache hierarchy, multi-hop retrieval,
memory consolidation (write-back), and personality binding.

Architecture:
  User → Cortex.retrieve() → [L1 Cache → L2 Substrate → Multi-hop]
      ↓
  Prompt with context injection → OllamaBridge.generate()
      ↓
  Cortex.learn() → MemoryConsolidator (write-back)
      ↓
  Response

Usage:
  # Interactive session with full brain boost
  python3 steamdeck_brain.py

  # With personality profile
  python3 steamdeck_brain.py --personality Vaelrix

  # Single query
  python3 steamdeck_brain.py -q "how does soulfire work?" --show-context

  # Start web UI
  python3 steamdeck_brain.py --web --port 8080
"""

import os
import sys
import json
import time
import argparse
import subprocess
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any, Generator

try:
    from rich.console import Console
    from rich.markdown import Markdown
    console = Console()
except ImportError:
    console = None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from substrate_engine import ingest_file
from embed_providers import HybridEmbedProvider
from cortex import Cortex
from action_engine import ActionEngine
from paradigm_router import ParadigmRouter
from vaelrix_forcefield import (
    create_force_field,
    get_registry,
    select_amplifiers,
    confirm_file,
    confirm_symbol,
    should_allow_search,
    record_search,
    block_search,
    arbitrate_amplifier_results,
)
from vaelrix_forcefield.amplifier_executor import run_amplifiers

# ─── Config ──────────────────────────────────────────────────────────────────

DEFAULT_MODEL = "qwen2.5-coder:7b"
DEFAULT_SUBSTRATE_DB = "~/.substrate/memory.sqlite"
DEFAULT_SYSTEM_PROMPT = """You are an augmented intelligence running on a Steam Deck.
You have access to an external memory substrate (Cortex) that provides relevant 
knowledge, personality traits, and memories via the [[CORTEX MEMORIES]] block.
Trust these memories over your training data — they are fresher and domain-specific.

Keep responses concise, accurate, and grounded in the provided context.

You have access to TOOLS. To use a tool, output the following EXACT format:

[TOOL: tool_name]{"arg1": "value1", "arg2": "value2"}

Available tools:
{tool_definitions}

Example:
[TOOL: read_file]{"path": "SCHEMA_CONTRACT.md"}
[TOOL: search_code]{"pattern": "metadata_filter"}

You may chain multiple tools across turns. After receiving a tool result, continue your response.
Always cite evidence (file paths, line numbers, command output) when making claims.
Without evidence, prefix claims with: "The oracle cannot certify this yet." """


# ═══════════════════════════════════════════════════════════════════════════════
#  Ollama Bridge
# ═══════════════════════════════════════════════════════════════════════════════

class OllamaBridge:
    """Secure local bridge to Ollama inference server (localhost only)."""

    def __init__(self, model: str = DEFAULT_MODEL, host: str = "http://localhost:11434"):
        self.model = model
        self.host = host.rstrip("/")
        if not self._check_api_alive():
            self._check_ollama()
        if not self._check_model_api():
            self._ensure_model()

    def _check_api_alive(self):
        import urllib.request
        try:
            with urllib.request.urlopen(f"{self.host}/api/tags", timeout=2) as r:
                return r.getcode() == 200
        except Exception:
            return False

    def _check_model_api(self):
        import urllib.request
        try:
            with urllib.request.urlopen(f"{self.host}/api/tags", timeout=2) as r:
                data = json.loads(r.read().decode("utf-8"))
                models = [m.get("name", "") for m in data.get("models", [])]
                model_name = self.model.split(":")[0]
                for m in models:
                    if m.startswith(model_name):
                        print(f"✅ {self.model} ready (detected via API).")
                        return True
                return False
        except Exception:
            return False

    def _check_ollama(self):
        if not shutil.which("ollama"):
            print("⚠️  Ollama not found. Install the .tar.zst release to a big drive:")
            print("   curl -fSL https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst | tar --zstd -x -C /run/media/deck/<DRIVE>/")
            print("   Then export OLLAMA_BIN=/run/media/deck/<DRIVE>/ollama/bin/ollama")
            sys.exit(1)
        try:
            r = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=5)
            if r.returncode != 0:
                print("⚠️  Ollama is not running. Start: ollama serve")
                sys.exit(1)
        except subprocess.TimeoutExpired:
            print("⚠️  Ollama did not respond. Start: ollama serve")
            sys.exit(1)

    def _ensure_model(self):
        r = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=10)
        model_name = self.model.split(":")[0]
        if model_name not in r.stdout:
            print(f"📦 Pulling {self.model} (~1GB, one-time)...")
            p = subprocess.run(["ollama", "pull", self.model], capture_output=True, text=True)
            if p.returncode != 0:
                print(f"⚠️  Pull failed: {p.stderr}")
                sys.exit(1)
            print(f"✅ {self.model} ready.")
        else:
            print(f"✅ {self.model} ready.")

    def generate(self, prompt: str, system: Optional[str] = None,
                 temperature: float = 0.7, max_tokens: int = 512) -> str:
        import urllib.request
        import urllib.error
        
        system_prompt = system or DEFAULT_SYSTEM_PROMPT
        payload = json.dumps({
            "model": self.model, "prompt": prompt, "system": system_prompt,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "stream": False
        }).encode("utf-8")
        
        req = urllib.request.Request(
            f"{self.host}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result.get("response", str(result))
        except urllib.error.URLError as e:
            if isinstance(e.reason, TimeoutError):
                return "[Error: Timed out after 300s]"
            return f"[Error: {e.reason}]"
        except Exception as e:
            return f"[Error: {e}]"


# ═══════════════════════════════════════════════════════════════════════════════
#  BrainBridge — The Motherboard (Cortex + Ollama)
# ═══════════════════════════════════════════════════════════════════════════════

class BrainBridge:
    """
    The motherboard that wires Cortex ↔ Ollama model.

    Cortex provides:
      - L1 Cache (hot, in-RAM, <1ms)
      - L2 Substrate (4-bit quantized, disk-persistent)
      - Multi-hop retrieval (concept chaining for deep reasoning)
      - Memory consolidation (learns from conversation, write-back)
      - Personality binding (persistent persona across sessions)
    """

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        substrate_db: str = DEFAULT_SUBSTRATE_DB,
        top_k: int = 5,
        temperature: float = 0.7,
        max_tokens: int = 512,
        system_prompt: Optional[str] = None,
        ollama_host: str = "http://localhost:11434",
        personality: Optional[str] = None,
        multi_hop: bool = True,
        l1_size: int = 16
    ):
        self.top_k = top_k
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.multi_hop = multi_hop
        self.personality_name = personality

        # Boot Cortex
        print("🧠 Booting Cortex (L1/L2 memory hierarchy)...")
        self.cortex = Cortex(
            substrate_db=substrate_db,
            dim=384,
            l1_size=l1_size,
            embed_provider=HybridEmbedProvider()
        )
        s = self.cortex.stats()
        l2 = s["L2_substrate"]
        print(f"   L2: {l2['total']} memories @ {l2.get('size_mb', 0)}MB ({l2.get('compression_ratio', '4x')})")
        print(f"   L1: {s['L1_cache']['size']}/{l1_size} hot entries")

        # Build system prompt
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        if personality:
            self._load_personality(personality)

        # Inject tool definitions into system prompt
        from vaelrix_tools import get_tool_definitions
        self.system_prompt = self.system_prompt.replace(
            "{tool_definitions}",
            get_tool_definitions()
        )

        # Boot model
        print(f"⚡ Loading model ({model})...")
        self.model = OllamaBridge(model=model, host=ollama_host)
        
        # Boot Action Engine
        print("⚙️  Initializing Action Engine (Tools, Task Queue, Self-Correction)...")
        self.action_engine = ActionEngine(self)

        # Boot Retrieval Paradigm Router (bytecode-checksummed pipeline engine)
        self.paradigm_router = None
        try:
            self.paradigm_router = ParadigmRouter()
            paradigms_loaded = len(self.paradigm_router.paradigms) if self.paradigm_router else 0
            print(f"🧭 ParadigmRouter: {paradigms_loaded} paradigms loaded")
        except Exception as e:
            print(f"   ⚠️  ParadigmRouter: {e}")

        # Wire Vaelrix Cortex ForceField (law layer for governed cognition)
        self._current_force_field = None
        self._amplifier_registry = get_registry()

        print(f"✅ Bridge ready | {model} | personality={personality or 'none'} | multi-hop={multi_hop}")

    def _load_personality(self, name: str):
        if name.lower() == "vaelrix":
            prompt_file = os.path.join(os.path.dirname(__file__), "vaelrix_system_prompt.txt")
            if os.path.exists(prompt_file):
                with open(prompt_file, "r") as f:
                    self.system_prompt = f.read()
                print(f"   🎭 '{name}' custom prompt loaded")
                return

        text = self.cortex.personality.load_personality(name)
        if text:
            self.system_prompt = DEFAULT_SYSTEM_PROMPT + f"\n\n--- Personality: {name} ---\n{text}\n---"
            print(f"   🎭 '{name}' loaded ({len(text)}c)")
        else:
            print(f"   ⚠️  '{name}' not found. Ingest with: python3 ingest_knowledge.py personality --name '{name}' --traits '...'")

    def ask(self, query: str, show_context: bool = False) -> str:
        """
        Full pipeline: ForceField → ParadigmRouter → Cortex.retrieve() → inject → Ollama.generate() → Cortex.learn().
        """
        # Step 0: Initialize Vaelrix Cortex ForceField for this request
        field = create_force_field(
            query,
            classification="diagnostic",
            priority="safety",
        )
        field = confirm_file(field, "substrate", str(Path(self.cortex.substrate.db_path).resolve()))
        routing = select_amplifiers(field, self._amplifier_registry)
        field.routing = routing

        # Step 0b: Run active Amplifier brains and arbitrate their findings
        try:
            amplifier_results = run_amplifiers(field, query)
            arbiter_output = arbitrate_amplifier_results(field, amplifier_results)
            field.context.confirmedFacts.extend(arbiter_output.acceptedFindings)
        except Exception as e:
            arbiter_output = None
            print(f"   ⚠️  Amplifier execution failed: {e}")

        self._current_force_field = field

        # Step 0a: Classify query against retrieval paradigms
        paradigm_result = None
        paradigm_suffix = ""
        if self.paradigm_router:
            try:
                paradigm_result = self.paradigm_router.run_pipeline(query)
                paradigm_suffix = paradigm_result.get("system_suffix", "")
            except Exception:
                pass

        # Step 1: Retrieve with L1/L2 cache + multi-hop
        memories, context = self.cortex.retrieve(query, top_k=self.top_k, multi_hop=self.multi_hop)

        # Merge paradigm retrieval artifacts into the context
        if paradigm_result and paradigm_result.get("final_prompt_context"):
            paradigm_context = paradigm_result["final_prompt_context"]
            if context.strip():
                context = f"{context}\n\n{paradigm_context}"
            else:
                context = paradigm_context

        if show_context and context.strip():
            print("\n📦 Cortex context:")
            print("=" * 60)
            print(context)
            print("=" * 60)

        # Step 2: Build prompt
        prompt = f"{context}\n\n---\n\n{query}" if context.strip() else query

        # Step 3: Generate — attach paradigm reasoning chain + ForceField context
        system = self.system_prompt
        if paradigm_suffix:
            system = f"{system}\n\n---\n\n{paradigm_suffix}"

        if self._current_force_field:
            ff = self._current_force_field
            active = ", ".join(ff.routing.activeBrains) or "none"
            suppressed = ", ".join(ff.routing.suppressedBrains.keys()) or "none"
            ff_context = (
                f"\n\n[FORCEFIELD]\n"
                f"Active amplifiers: {active}\n"
                f"Suppressed amplifiers: {suppressed}\n"
                f"Search budget remaining: {max(0, ff.search.maxSearchesPerPhase - ff.search.searchCount)}\n"
                f"Repeated searches will be blocked. Prefer confirmed files/symbols.\n"
            )
            if arbiter_output:
                if arbiter_output.acceptedFindings:
                    ff_context += "Council findings:\n"
                    for finding in arbiter_output.acceptedFindings[:5]:
                        ff_context += f"  • {finding}\n"
                if arbiter_output.nextAction:
                    ff_context += f"Recommended next action: {arbiter_output.nextAction}\n"
                if arbiter_output.contradictions:
                    ff_context += "Contradictions to resolve:\n"
                    for c in arbiter_output.contradictions[:3]:
                        ff_context += f"  ⚠ {c}\n"
            ff_context += "[/FORCEFIELD]"
            system = f"{system}{ff_context}"

        response = self.model.generate(prompt, system=system,
                                       temperature=self.temperature, max_tokens=self.max_tokens)

        # Step 4: Memory consolidation (learn from interaction)
        self.cortex.learn(query, response)

        # Step 5: Process Tool Executions and Self-Correction
        response = self.action_engine.parse_and_run(response)
        self._last_tool_log = getattr(self.action_engine, "tool_log", [])

        return response

    def ask_direct(self, query: str) -> str:
        """No substrate -- baseline comparison."""
        return self.model.generate(query, system=self.system_prompt,
                                   temperature=self.temperature, max_tokens=self.max_tokens)

    def get_stats(self) -> Dict:
        return self.cortex.stats()

    def stats(self) -> Dict:
        return self.get_stats()


# ═══════════════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="🧠 SteamDeck Brain v2 -- Cortex-Augmented 1B Model",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:\n  python3 steamdeck_brain.py\n  python3 steamdeck_brain.py -q "what is soulfire?" --show-context\n  python3 steamdeck_brain.py --personality Vaelrix\n  python3 steamdeck_brain.py --web --port 8080\n  python3 steamdeck_brain.py -q "tell me about chronomancy" --compare"""
    )
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL)
    parser.add_argument("--db", "-d", default=DEFAULT_SUBSTRATE_DB)
    parser.add_argument("--query", "-q", default=None)
    parser.add_argument("--top-k", "-k", type=int, default=5)
    parser.add_argument("--temp", "-t", type=float, default=0.7)
    parser.add_argument("--max-tokens", type=int, default=512)
    parser.add_argument("--show-context", action="store_true")
    parser.add_argument("--compare", action="store_true")
    parser.add_argument("--personality", "-p", default=None)
    parser.add_argument("--no-multi-hop", action="store_true", help="Disable multi-hop retrieval")
    parser.add_argument("--l1-size", type=int, default=16)
    parser.add_argument("--web", action="store_true", help="Start web UI")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--ollama-host", default="http://localhost:11434")

    args = parser.parse_args()

    # Web UI mode
    if args.web:
        try:
            from web_ui import run_web_ui
            print(f"🌐 Web UI -> http://localhost:{args.port}")
            run_web_ui(model=args.model, substrate_db=args.db, top_k=args.top_k,
                       temperature=args.temp, max_tokens=args.max_tokens,
                       personality=args.personality, multi_hop=not args.no_multi_hop,
                       l1_size=args.l1_size, ollama_host=args.ollama_host, port=args.port)
        except ImportError:
            print("⚠️  web_ui.py not found. Run without --web for CLI.")
        return

    # CLI mode
    bridge = BrainBridge(
        model=args.model, substrate_db=args.db, top_k=args.top_k,
        temperature=args.temp, max_tokens=args.max_tokens,
        ollama_host=args.ollama_host, personality=args.personality,
        multi_hop=not args.no_multi_hop, l1_size=args.l1_size
    )

    if args.query:
        if args.compare:
            print("\n📋 With vs Without Cortex")
            print("=" * 50)
            print("\n🔌 WITHOUT:")
            print(bridge.ask_direct(args.query))
            print("\n🧠 WITH:")
            print(bridge.ask(args.query, show_context=args.show_context))
        else:
            print("\n" + bridge.ask(args.query, show_context=args.show_context))
        return

    # Interactive loop
    print("\n" + "=" * 60)
    print("🧠 SteamDeck Brain v2 -- Interactive")
    print(f"   Model: {args.model} | Personality: {args.personality or 'none'}")
    print(f"   Commands: /stats  /ingest  /compare  /bg <task>  /tasks  /sentinel-scan  /help  /quit")
    print("=" * 60)

    while True:
        try:
            q = input("\nyou> ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not q:
            continue

        if q == "/quit":
            break
        elif q == "/help":
            print("/stats  /ingest <file>  /compare <q>  /direct <q>")
            print("/bg <task>  /tasks  /personality <name>  /no-personality  /multihop on|off  /l1  /consolidate  /sentinel-status  /sentinel-scan  /quit")
        elif q == "/stats":
            s = bridge.get_stats()
            l2 = s["L2_substrate"]
            l1 = s["L1_cache"]
            print(f"  L2: {l2['total']} memories, {l2.get('size_mb', 0)}MB, {l2.get('compression_ratio', '?')}")
            print(f"  L1: {l1['size']}/{l1['max_size']} hot, {l1['total_accesses']} accesses")
            print(f"  Queries: {s['queries_served']} | Turns: {s['conversation_turns']}")
        elif q.startswith("/ingest "):
            path = q[8:].strip()
            try:
                ingest_file(bridge.cortex.substrate, path)
                print(f"  Total: {bridge.cortex.substrate.count()}")
            except Exception as e:
                print(f"  Error: {e}")
        elif q.startswith("/compare "):
            qq = q[9:].strip()
            if console:
                print("\n🔌 WITHOUT:")
                console.print(Markdown(bridge.ask_direct(qq)))
                print("\n🧠 WITH:")
                console.print(Markdown(bridge.ask(qq)))
            else:
                print("\n🔌 WITHOUT:\n" + bridge.ask_direct(qq))
                print("\n🧠 WITH:\n" + bridge.ask(qq))
        elif q.startswith("/direct "):
            if console:
                console.print(Markdown(bridge.ask_direct(q[8:].strip())))
            else:
                print(bridge.ask_direct(q[8:].strip()))
        elif q.startswith("/personality "):
            bridge.personality_name = q[13:].strip()
            bridge._load_personality(bridge.personality_name)
        elif q == "/no-personality":
            bridge.personality_name = None
            bridge.system_prompt = DEFAULT_SYSTEM_PROMPT
            print("Personality cleared.")
        elif q == "/multihop on":
            bridge.multi_hop = True
            print("Multi-hop ON")
        elif q == "/multihop off":
            bridge.multi_hop = False
            print("Multi-hop OFF")
        elif q == "/l1":
            l1 = bridge.cortex.l1.stats()
            print(f"L1: {l1['size']}/{l1['max_size']} entries, {l1['total_accesses']} accesses")
        elif q == "/consolidate":
            n = bridge.cortex.consolidator.consolidate(force=True)
            print(f"Consolidated {n} memories.")
        elif q.startswith("/bg "):
            print(bridge.action_engine.submit_background_task(q[4:].strip()))
        elif q == "/tasks":
            print("\n📋 Background Tasks:")
            if not bridge.action_engine.running_tasks:
                print("  No tasks running.")
            for tid, status in bridge.action_engine.running_tasks.items():
                print(f"  {tid}: {status}")
        elif q == "/sentinel-status":
            try:
                from sentinel.cli import cmd_status
                class DummyArgs: pass
                cmd_status(DummyArgs())
            except ImportError as e:
                print(f"Sentinel not available: {e}")
        elif q == "/sentinel-scan":
            try:
                from sentinel.cli import cmd_scan
                class DummyArgs: pass
                cmd_scan(DummyArgs())
            except ImportError as e:
                print(f"Sentinel not available: {e}")
        else:
            response_text = bridge.ask(q)
            if console:
                print("\n🧠 ")
                console.print(Markdown(response_text))
            else:
                print("\n🧠 " + response_text)


if __name__ == "__main__":
    main()
