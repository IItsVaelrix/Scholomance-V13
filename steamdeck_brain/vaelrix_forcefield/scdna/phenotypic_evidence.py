"""SCDNA evidence attach for Phenotypic Idealism.

Given a query + TurboQuant hit paths, return matched capability packets and
gene compact strings. Archaeology only — does not invent capabilities.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .capability_store import load_packets, packets_for_path
from .inject import select_genes


def _compact_gene(gene: Any) -> str:
    if hasattr(gene, "to_compact_string"):
        return gene.to_compact_string()
    identity = getattr(gene, "identity", None)
    stable = getattr(identity, "stableId", None) if identity else None
    domain = getattr(getattr(gene, "domain", None), "primary", "?")
    return f"{stable or 'gene'}:{domain}"


def attach_evidence(
    query: str,
    hit_paths: list[str],
    *,
    capability_dir: Path | None = None,
) -> dict[str, Any]:
    """Match capabilities to hit paths; select genes from query + path tokens."""
    packets, load_errors = load_packets(capability_dir)
    matched: list[dict] = []
    seen_domains: set[str] = set()

    for path in hit_paths:
        for packet in packets_for_path(path, packets):
            domain = str(packet.get("domain") or "")
            if domain in seen_domains:
                continue
            seen_domains.add(domain)
            matched.append(packet)

    # Gene query: operator text plus path basename tokens (artifact bias)
    path_bits = " ".join(Path(p).stem.replace("-", " ").replace("_", " ") for p in hit_paths[:12])
    gene_query = f"{query} {path_bits}".strip()
    genes = select_genes(gene_query)

    return {
        "capabilities": matched,
        "genes": [_compact_gene(g) for g in genes],
        "load_errors": load_errors,
        "packet_count_loaded": len(packets),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SCDNA evidence for Phenotypic Idealism")
    parser.add_argument("--query", required=True, help="Operator query")
    parser.add_argument(
        "--hits-json",
        default=None,
        help='JSON array of hit paths or {path} objects (or "-" for stdin)',
    )
    parser.add_argument(
        "--capability-dir",
        default=None,
        help="Override capability packet directory",
    )
    args = parser.parse_args(argv)

    raw = args.hits_json
    if raw is None or raw == "-":
        raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw and str(raw).strip() else []
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"invalid hits JSON: {exc}"}))
        return 2

    paths: list[str] = []
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                paths.append(item)
            elif isinstance(item, dict) and item.get("path"):
                paths.append(str(item["path"]))
    else:
        print(json.dumps({"error": "hits JSON must be an array"}))
        return 2

    cap_dir = Path(args.capability_dir) if args.capability_dir else None
    result = attach_evidence(args.query, paths, capability_dir=cap_dir)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
