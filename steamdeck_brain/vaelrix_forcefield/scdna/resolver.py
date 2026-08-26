"""SCDNA resolver — an identifier in, the module that explains that code out.

    gene stableId          -> the gene's instruction, checks, forbidden drift
    SCD64 (64 hex)         -> the glossary family and its eight decoded slots
    SCD64 slot (8 hex)     -> the slot's meaning, and EVERY family owning it
    capability checksum    -> the packet, with MEASURED freshness
    repo-relative path     -> the packets that claim it, with measured freshness

The one law that governs everything here: AN IDENTIFIER THAT DOES NOT BIND
COMES BACK `THEORY`. Not the nearest family, not a "did you mean", not the
packet whose domain sounds similar. SEMANTIC_KIND_THEORY_UNBOUND says Theory is
a lookup rather than a judgement and forbids resolving an unbound concept to a
plausible default; a resolver that always finds something cannot be told apart
from one that guesses, and its output cannot be trusted anywhere.

Why genes do not reach code
---------------------------
A gene carries `domain.primary` ("code", "phoneme", "ui"). A capability packet
carries `domain` ("divtube-cockpit", "phonology"). These are different
namespaces and nothing in the repo maps between them. "phoneme" is not
"phonology" — it is only spelled like it. So a gene resolves to itself and
`boundCapability` stays None until a gene declares surfaces of its own.

That gap is also why gene freshness is served as `declared`, never `measured`:
the number in registry.py is a literal, genes name no surfaces, and therefore
nothing that happens in the repo can ever lower it. Reporting a frozen literal
as freshness would be a check that cannot fail.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from . import capability_freshness as _fresh
from .capability_store import CAPABILITY_DIR, load_packets, packets_for_path

_HERE = Path(__file__).resolve()
REPO_ROOT = _HERE.parents[3]
GLOSSARY_REL = os.path.join(".atlas", "scd64-glossary.json")

_FULL_CODE = re.compile(r"^[0-9A-Fa-f]{64}$")
_SLOT_CODE = re.compile(r"^[0-9A-Fa-f]{8}$")
_GENE_ID = re.compile(r"^[A-Z][A-Z0-9_]{3,}$")
_CAP_CHECKSUM = re.compile(r"^scd64:[0-9a-fA-F]{16,64}$")

THEORY, RESOLVED, CLARIFY = "THEORY", "RESOLVED", "CLARIFY"


def _verdict(query, kind, bound=None, module=None, freshness=None, reason=""):
    return {
        "query": query,
        "kind": kind,
        "boundAs": bound,
        "module": module,
        "freshness": freshness or {"basis": "none", "unverifiable": True,
                                   "stale": False, "reason": "nothing to date"},
        "reason": reason,
    }


def _load_glossary(repo_root: str, glossary_path: str | None):
    path = glossary_path or os.path.join(repo_root, GLOSSARY_REL)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh), None
    except OSError:
        return None, (
            f"glossary index not built at {path} — run "
            "`npx tsx scripts/scd64-glossary-export.mjs`"
        )
    except ValueError as exc:
        return None, f"glossary index unreadable: {exc}"


def _load_genes():
    try:
        from .registry import DEFAULT_GENE_REGISTRY
    except Exception:
        return {}
    reg = DEFAULT_GENE_REGISTRY
    try:
        return dict(reg) if hasattr(reg, "keys") else {}
    except Exception:
        return {}


def _packet_module(packet: dict) -> dict:
    return {
        "domain": packet.get("domain"),
        "contract": packet.get("contract"),
        "surfaces": packet.get("surfaces", []),
        "checksum": packet.get("checksum"),
        "capabilities": [
            {
                "need": c.get("need"),
                "canonical": c.get("canonical"),
                "path": c.get("path"),
                "evidence": c.get("evidence"),
                "forbidden": c.get("forbidden", []),
            }
            for c in packet.get("capabilities", []) or []
        ],
    }


def _packet_file(packet: dict, directory: Path) -> str | None:
    for f in sorted(directory.glob("*.capability.json")):
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("checksum") == packet.get("checksum"):
                return str(f)
        except Exception:
            continue
    return None


def _measured(packet, repo_root, directory):
    v = _fresh.freshness(packet, repo_root,
                         packet_path=_packet_file(packet, directory))
    v["basis"] = "measured"
    return v


def resolve(query, repo_root: str | None = None, *,
            glossary_path: str | None = None,
            capability_dir: str | None = None) -> dict:
    """Resolve one identifier. Never guesses; never answers without a basis."""
    root = os.path.abspath(repo_root or REPO_ROOT)
    directory = Path(capability_dir) if capability_dir else CAPABILITY_DIR

    if not isinstance(query, str) or not query.strip():
        return _verdict(query, THEORY, reason="empty query binds to nothing")
    q = query.strip()

    # -- capability checksum ------------------------------------------------
    if _CAP_CHECKSUM.match(q):
        packets, errors = load_packets(directory)
        for p in packets:
            if p.get("checksum") == q:
                fr = _measured(p, root, directory)
                kind = CLARIFY if fr["stale"] else RESOLVED
                return _verdict(q, kind, "capability-checksum", _packet_module(p), fr,
                                reason=(f"capability packet '{p.get('domain')}'; "
                                        + fr["reason"]))
        return _verdict(q, THEORY, reason=(
            "no capability packet carries that checksum"
            + (f"; {len(errors)} packet(s) failed to load" if errors else "")))

    # -- SCD64 full code ----------------------------------------------------
    if _FULL_CODE.match(q):
        gl, err = _load_glossary(root, glossary_path)
        if gl is None:
            return _verdict(q, THEORY, reason=err)
        code = q.upper()
        for family, rec in gl.get("families", {}).items():
            if rec.get("code") == code:
                return _verdict(q, RESOLVED, "scd64-glossary",
                                {"family": family, "code": rec["code"],
                                 "slots": rec["slots"]},
                                {"basis": "declared", "unverifiable": True,
                                 "stale": False,
                                 "reason": "glossary families are fixedForever "
                                           "by construction; no surface to date"},
                                reason=f"SCD64 decodes to glossary family {family}")
        return _verdict(q, THEORY, reason=(
            "well-formed SCD64 that matches no glossary family — "
            "the code is not in the executable lexicon"))

    # -- SCD64 single slot --------------------------------------------------
    if _SLOT_CODE.match(q):
        gl, err = _load_glossary(root, glossary_path)
        if gl is None:
            return _verdict(q, THEORY, reason=err)
        owners = gl.get("slots", {}).get(q.upper())
        if owners:
            return _verdict(q, RESOLVED, "scd64-slot",
                            {"hexCode": q.upper(), "owners": owners,
                             "ambiguous": len(owners) > 1},
                            reason=(f"slot hex owned by {len(owners)} famil"
                                    f"{'ies' if len(owners) > 1 else 'y'}"))
        return _verdict(q, THEORY, reason="no glossary slot carries that hex")

    # -- gene stableId ------------------------------------------------------
    if _GENE_ID.match(q):
        genes = _load_genes()
        gene = genes.get(q)
        if gene is not None:
            d = gene.to_dict() if hasattr(gene, "to_dict") else dict(gene)
            module = {
                "stableId": d["identity"]["stableId"],
                "sourceKind": d["identity"].get("sourceKind"),
                "domain": d.get("domain", {}),
                "imperative": d["instruction"].get("imperative"),
                "requiredChecks": d["instruction"].get("requiredChecks", []),
                "forbiddenDrift": d["instruction"].get("forbiddenDrift", []),
                # Stays None on purpose: gene.domain and capability.domain are
                # different namespaces, and inventing the join here would put a
                # guess into every downstream answer.
                "boundCapability": None,
            }
            from . import gene_freshness as _gf
            gv = _gf.gene_freshness(gene, root)
            module["surfaces"] = gv["surfaces"]
            fr = {
                "basis": gv["basis"],
                "unverifiable": gv["unverifiable"],
                "stale": gv["stale"],
                "declaredFreshness": d["retrieval"].get("freshness"),
                "measuredFreshness": gv["measured"],
                "commitsBehind": gv["commitsBehind"],
                "reason": gv["reason"],
            }
            kind = CLARIFY if gv["stale"] else RESOLVED
            return _verdict(q, kind, "gene", module, fr,
                            reason=f"gene {q} found in the registry; " + gv["reason"])
        return _verdict(q, THEORY, reason="no gene with that stableId is registered")

    # -- repo-relative path -------------------------------------------------
    if "/" in q or "." in q:
        packets, _ = load_packets(directory)
        owning = packets_for_path(q, packets)
        if owning:
            frs = [_measured(p, root, directory) for p in owning]
            stale = any(f["stale"] for f in frs)
            return _verdict(
                q, CLARIFY if stale else RESOLVED, "path",
                {"path": q, "packets": [_packet_module(p) for p in owning]},
                {"basis": "measured", "unverifiable": any(f["unverifiable"] for f in frs),
                 "stale": stale,
                 "reason": "; ".join(f"{p.get('domain')}: {f['reason']}"
                                     for p, f in zip(owning, frs))},
                reason=f"{len(owning)} capability packet(s) claim this path")
        exists = os.path.exists(os.path.join(root, q))
        return _verdict(q, THEORY, reason=(
            "path exists but no capability packet declares a surface covering it"
            if exists else "no such path, and no packet declares it"))

    return _verdict(q, THEORY, reason=(
        "query matches no known identifier shape "
        "(gene stableId, 64- or 8-hex SCD64, scd64: checksum, or repo path)"))
