#!/usr/bin/env python3
"""
direct_brain.py — Direct (no-Ollama) access to the Vaelrix brain network + ForceField.

This provides the "direct tap" for MCP agents into the specialized brains
and full ForceField pipeline (routing, amplifiers, arbiter, SCDNA, health signals,
without any LLM synthesis step or daemon dependency).

Usage examples (from repo root):
  PYTHONPATH=steamdeck_brain python3 steamdeck_brain/direct_brain.py --action list
  PYTHONPATH=steamdeck_brain python3 steamdeck_brain/direct_brain.py --action forcefield --query "Explain the clerical raid pattern"
  PYTHONPATH=steamdeck_brain python3 steamdeck_brain/direct_brain.py --action brain --name LORE_BRAIN --query "What is Vaelrix?"
  PYTHONPATH=steamdeck_brain python3 steamdeck_brain/direct_brain.py --action genes --domain all

Intended to be called from the governing MCP layer (scholomance-collab) via
child_process / execSync for native tool access by every connected model.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Ensure we can import the forcefield even when run from various cwds
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

try:
    from vaelrix_forcefield.brain_bridge import BrainBridge
    from vaelrix_forcefield import create_force_field
    from vaelrix_forcefield.brains import BRAIN_RUNNERS
    from vaelrix_forcefield.scdna.inject import load_injection_registry
    from vaelrix_forcefield.amplifier_executor import run_amplifiers
    from vaelrix_forcefield.amplifier_router import apply_routing
    from vaelrix_forcefield.council_arbiter import arbitrate_amplifier_results
except ImportError as e:
    print(json.dumps({"error": f"Failed to import vaelrix_forcefield: {e}", "hint": "Set PYTHONPATH=steamdeck_brain"}))
    sys.exit(1)


def _direct_noop_llm(prompt: str) -> str:
    """Purely deterministic placeholder so no Ollama / external model is ever called."""
    return f"[DIRECT-NO-LLM] synthesis would be: {prompt[:280]}..."


def list_brains() -> dict[str, Any]:
    brains = []
    for name, runner in BRAIN_RUNNERS.items():
        # Try to pull metadata if the brain module exposes the constant
        brain_const_name = name.replace("_BRAIN", "") + "_BRAIN" if not name.endswith("_BRAIN") else name
        meta = {}
        try:
            # brains/__init__ reexports the constants
            mod_name = name.lower().replace("_brain", "_brain")
            # Best effort: many modules define XXX_BRAIN = AmplifierBrain(...)
            # We just list them for now
        except Exception:
            pass
        brains.append({
            "id": name,
            "runner": runner.__name__ if hasattr(runner, "__name__") else str(runner),
            "description": _brain_description(name),
        })
    return {"brains": brains, "count": len(brains), "mode": "direct-forcefield"}


def _brain_description(brain_id: str) -> str:
    descs = {
        "CODE_BRAIN": "Code analysis, ripgrep-backed symbol/file search, refactor/debug findings",
        "PIXEL_BRAIN": "Pixel art, SCDL, lattice, chibi profiles, visual bytecode",
        "LORE_BRAIN": "Scholomance lore, VAELRIX_LAW, world knowledge, encyclopedia",
        "ARCHITECTURE_BRAIN": "Layer laws, schemas, contracts, system design",
        "DETERMINISM_BRAIN": "Purity, reproducibility, non-determinism detection",
        "CRITIQUE_BRAIN": "Self-critique, quality, improvement signals",
        "RISK_BRAIN": "Risk assessment, blast radius, security/impact",
        "MEMORY_BRAIN": "Memory/substrate context, recall patterns",
        "TEST_BRAIN": "Test suggestions, coverage, verification",
        "UI_BRAIN": "UI/UX concerns, component structure (non-render core)",
        "SEO_BRAIN": "SEO, metadata, discoverability",
        "PHONEME_BRAIN": "Phoneme, rhyme, verseir, sonic structures",
        "RHYME_BRAIN": "Rhyme analysis, sonic exchange",
        "AUDIO_BRAIN": "Audio, music, beatmap related reasoning",
    }
    return descs.get(brain_id, "Specialized Vaelrix brain")


def run_specific_brain(brain_id: str, query: str) -> dict[str, Any]:
    if brain_id not in BRAIN_RUNNERS:
        return {"error": f"Unknown brain: {brain_id}", "available": list(BRAIN_RUNNERS.keys())}

    runner = BRAIN_RUNNERS[brain_id]
    try:
        field = create_force_field(query, classification="diagnostic", priority="safety")
        # Apply minimal routing so the brain sees the field
        try:
            field = apply_routing(field, None)  # registry optional in some paths
        except Exception:
            pass

        result = runner(field, query)
        # Normalize to dict for JSON
        if hasattr(result, "__dict__"):
            data = {k: getattr(result, k) for k in dir(result) if not k.startswith("_") and not callable(getattr(result, k))}
        else:
            data = {"raw": str(result)}
        return {
            "brain": brain_id,
            "query": query,
            "result": data,
            "mode": "direct",
        }
    except Exception as e:
        return {"error": str(e), "brain": brain_id, "trace": True}


def forcefield_ask(query: str, deterministic: bool = True, max_workers: int = 4) -> dict[str, Any]:
    """
    Full ForceField pipeline (brains + routing + arbiter + scdna + health signals)
    WITHOUT any Ollama/LLM call.
    """
    try:
        bridge = BrainBridge(llm_client=_direct_noop_llm)
        result = bridge.ask(
            query,
            classification="diagnostic",
            priority="safety",
            max_workers=max_workers,
        )

        # Replace LLM-synthesized answer with direct structured findings
        if deterministic:
            findings = result.get("findings") or []
            if isinstance(findings, list):
                key_findings = findings[:8]
            else:
                key_findings = findings
            result["answer"] = {
                "direct": True,
                "summary": "Direct ForceField (no LLM). See findings, health_signals, scdna_genes.",
                "key_findings": key_findings,
            }

        result["mode"] = "direct-forcefield"
        result["ollama_used"] = False
        return result
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()[:2000], "mode": "direct-forcefield", "ollama_used": False}


def get_scdna_genes(domain: str = "all") -> dict[str, Any]:
    try:
        reg = load_injection_registry()
        if domain and domain.lower() != "all":
            filtered = {
                k: v for k, v in reg.items()
                if domain.lower() in (getattr(v.domain, 'primary', '').lower(), *[s.lower() for s in getattr(v.domain, 'secondary', [])])
            }
        else:
            filtered = reg
        genes = []
        for k, v in list(filtered.items())[:30]:
            genes.append({
                "id": k,
                "domain_primary": getattr(v.domain, 'primary', None),
                "domain_secondary": getattr(v.domain, 'secondary', []),
                "imperative": getattr(getattr(v, 'instruction', None), 'imperative', None),
            })
        return {"genes": genes, "count": len(genes), "domain": domain, "mode": "direct"}
    except Exception as e:
        return {"error": str(e), "mode": "direct"}


def main():
    parser = argparse.ArgumentParser(description="Direct (Ollama-free) access to Scholomance brain network + ForceField")
    parser.add_argument("--action", required=True, choices=["list", "forcefield", "brain", "genes"],
                        help="Action to perform")
    parser.add_argument("--query", help="Query string for forcefield or specific brain")
    parser.add_argument("--name", "--brain", dest="brain_name", help="Specific brain id e.g. CODE_BRAIN, LORE_BRAIN")
    parser.add_argument("--domain", default="all", help="Domain filter for genes")
    parser.add_argument("--json", action="store_true", help="Force JSON output (default)")

    args = parser.parse_args()

    if args.action == "list":
        out = list_brains()
    elif args.action == "forcefield":
        if not args.query:
            out = {"error": "--query is required for forcefield"}
        else:
            out = forcefield_ask(args.query)
    elif args.action == "brain":
        if not args.brain_name or not args.query:
            out = {"error": "--name and --query required for brain"}
        else:
            out = run_specific_brain(args.brain_name, args.query)
    elif args.action == "genes":
        out = get_scdna_genes(args.domain)
    else:
        out = {"error": "unknown action"}

    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
