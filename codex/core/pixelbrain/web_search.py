#!/usr/bin/env python3
"""
PB-WEB-SEARCH-v1 — Web search with deterministic freeze boundary.

LIVE SEARCH IS NON-DETERMINISTIC. Results change over time, by region,
by rate-limit state. The Determinism Law forbids feeding non-deterministic
inputs into scoring channels.

THE FREEZE BOUNDARY SOLVES THIS:
  live search → frozen artifact (checksummed, immutable) → grounding index

Once frozen, the artifact is deterministic forever. The grounding index
reads from frozen artifacts, never from live searches. The checksum covers
query + results (not timestamp), so identical result sets produce identical
checksums regardless of when the search was performed.

Architecture:
  search(query)           → raw results (non-deterministic, never scored)
  freeze(query, results)  → frozen artifact (deterministic, safe to score)
  fetch_page(url)         → clean text (non-deterministic, cached on freeze)
  inject(artifact)        → adds to grounding corpus (deterministic post-freeze)

Usage:
  python3 web_search.py search "phonological RAG" --max 10
  python3 web_search.py freeze "phonological RAG" --max 10 --out cache/
  python3 web_search.py inject cache/search_phonological_rag.frozen.json
  python3 web_search.py verify cache/search_phonological_rag.frozen.json
"""

import argparse
import hashlib
import html as html_mod
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) "
    "Gecko/20100101 Firefox/128.0"
)
DDG_HTML_URL = "https://html.duckduckgo.com/html/"
DEFAULT_MAX_RESULTS = 10
FETCH_TIMEOUT = 15
MAX_PAGE_CHARS = 50_000  # cap fetched page text
SCHEMA_VERSION = "PB-WEB-SEARCH-v1"


# ---------------------------------------------------------------------------
# Search (non-deterministic — never feed directly into scoring)
# ---------------------------------------------------------------------------

def search(query: str, max_results: int = DEFAULT_MAX_RESULTS) -> list[dict]:
    """Search DuckDuckGo HTML endpoint. Returns list of {title, url, snippet}.

    NON-DETERMINISTIC. Results vary by time, region, rate limits.
    Must be frozen before use in any scoring channel.
    """
    url = DDG_HTML_URL + "?" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    resp = urllib.request.urlopen(req, timeout=FETCH_TIMEOUT)
    page = resp.read().decode("utf-8", errors="replace")

    results = []

    # Parse result links
    for m in re.finditer(
        r'class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>',
        page, re.DOTALL,
    ):
        href = html_mod.unescape(m.group(1))
        title = re.sub(r"<[^>]+>", "", html_mod.unescape(m.group(2))).strip()
        # DDG wraps URLs in a redirect — extract actual URL
        if "uddg=" in href:
            uddg = re.search(r"uddg=([^&]+)", href)
            if uddg:
                href = urllib.parse.unquote(uddg.group(1))
        results.append({"title": title, "url": href, "snippet": ""})

    # Parse snippets
    snippets = re.findall(
        r'class="result__snippet"[^>]*>(.*?)</(?:a|td|div)',
        page, re.DOTALL,
    )
    for i, s in enumerate(snippets):
        if i < len(results):
            results[i]["snippet"] = re.sub(
                r"<[^>]+>", "", html_mod.unescape(s)
            ).strip()

    return results[:max_results]


# ---------------------------------------------------------------------------
# Page fetch (non-deterministic — cached on freeze)
# ---------------------------------------------------------------------------

def fetch_page(url: str, max_chars: int = MAX_PAGE_CHARS) -> str:
    """Fetch a URL and return clean text. NON-DETERMINISTIC.

    Strips scripts, styles, and HTML tags. Caps at max_chars.
    """
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        resp = urllib.request.urlopen(req, timeout=FETCH_TIMEOUT)
        content_type = resp.headers.get("Content-Type", "")
        if "pdf" in content_type or "octet-stream" in content_type:
            return "[PDF/binary content — not extractable]"
        raw = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return f"[FETCH ERROR: {e}]"

    # Strip to clean text
    clean = re.sub(r"<script[^>]*>.*?</script>", "", raw, flags=re.DOTALL)
    clean = re.sub(r"<style[^>]*>.*?</style>", "", clean, flags=re.DOTALL)
    clean = re.sub(r"<[^>]+>", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:max_chars]


# ---------------------------------------------------------------------------
# Freeze (THE DETERMINISM BOUNDARY)
# ---------------------------------------------------------------------------

def _canonical_payload(query: str, results: list[dict]) -> str:
    """Canonical string for checksumming. Excludes timestamp and page_text.

    The checksum covers WHAT was found, not WHEN. Identical result sets
    produce identical checksums regardless of fetch time.
    """
    canonical = {
        "schema": SCHEMA_VERSION,
        "query": query,
        "results": [
            {"title": r["title"], "url": r["url"], "snippet": r["snippet"]}
            for r in results
        ],
    }
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"))


def checksum(query: str, results: list[dict]) -> str:
    """Deterministic checksum over query + results (not timestamp)."""
    payload = _canonical_payload(query, results)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"search1:{digest[:16]}"


def freeze(
    query: str,
    results: list[dict],
    fetch_pages: bool = False,
) -> dict:
    """Freeze search results into a deterministic artifact.

    THE FREEZE IS THE DETERMINISM BOUNDARY. After this call, the artifact
    is immutable and checksummed. The grounding index may consume it.

    Args:
        query: The search query.
        results: Raw results from search().
        fetch_pages: If True, fetch and cache page text for each result.
                     This is non-deterministic but cached in the artifact.

    Returns:
        Frozen artifact dict with checksum.
    """
    frozen_results = []
    for r in results:
        entry = {
            "title": r["title"],
            "url": r["url"],
            "snippet": r["snippet"],
        }
        if fetch_pages:
            entry["page_text"] = fetch_page(r["url"])
        frozen_results.append(entry)

    artifact = {
        "schema": SCHEMA_VERSION,
        "query": query,
        "frozen_at": datetime.now(timezone.utc).isoformat(),
        "result_count": len(frozen_results),
        "results": frozen_results,
        "checksum": checksum(query, results),
        "determinism_note": (
            "This artifact is frozen. The checksum covers query + results "
            "(not timestamp). The grounding index may consume this artifact "
            "deterministically. Live search is non-deterministic and must "
            "never be fed directly into scoring channels."
        ),
    }
    return artifact


def verify(artifact: dict) -> bool:
    """Verify a frozen artifact's checksum is intact."""
    expected = checksum(artifact["query"], artifact["results"])
    return expected == artifact.get("checksum", "")


# ---------------------------------------------------------------------------
# Corpus injection (deterministic post-freeze)
# ---------------------------------------------------------------------------

def to_corpus_docs(artifact: dict) -> list[dict]:
    """Convert a frozen artifact into grounding-index corpus documents.

    Each result becomes a document. If page_text was fetched, it's included.
    The source is tagged for provenance tracking.

    Returns:
        List of {text, source, tag} dicts ready for grounding index.
    """
    if not verify(artifact):
        raise ValueError(
            f"Artifact checksum mismatch: {artifact.get('checksum')} "
            f"!= {checksum(artifact['query'], artifact['results'])}"
        )

    docs = []
    for r in artifact["results"]:
        # Build document text from snippet + optional page text
        parts = [r["title"], r["snippet"]]
        page_text = r.get("page_text", "")
        if page_text and not page_text.startswith("["):
            # Include first 2000 chars of page text for grounding
            parts.append(page_text[:2000])
        text = "\n".join(p for p in parts if p)

        docs.append({
            "text": text,
            "source": f"web-search:{artifact['checksum']}",
            "tag": "web",
            "url": r["url"],
            "query": artifact["query"],
        })
    return docs


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="PB-WEB-SEARCH-v1: Web search with deterministic freeze"
    )
    sub = parser.add_subparsers(dest="command")

    # search
    p_search = sub.add_parser("search", help="Live search (non-deterministic)")
    p_search.add_argument("query")
    p_search.add_argument("--max", type=int, default=DEFAULT_MAX_RESULTS)

    # freeze
    p_freeze = sub.add_parser("freeze", help="Search + freeze artifact")
    p_freeze.add_argument("query")
    p_freeze.add_argument("--max", type=int, default=DEFAULT_MAX_RESULTS)
    p_freeze.add_argument("--out", default="cache/", help="Output directory")
    p_freeze.add_argument("--fetch-pages", action="store_true")

    # verify
    p_verify = sub.add_parser("verify", help="Verify frozen artifact")
    p_verify.add_argument("path")

    # inject
    p_inject = sub.add_parser("inject", help="Convert to corpus docs")
    p_inject.add_argument("path")

    args = parser.parse_args()

    if args.command == "search":
        results = search(args.query, args.max)
        print(json.dumps(results, indent=2))

    elif args.command == "freeze":
        results = search(args.query, args.max)
        artifact = freeze(args.query, results, fetch_pages=args.fetch_pages)
        os.makedirs(args.out, exist_ok=True)
        slug = re.sub(r"[^a-z0-9]+", "_", args.query.lower())[:40]
        path = os.path.join(args.out, f"search_{slug}.frozen.json")
        with open(path, "w") as f:
            json.dump(artifact, f, indent=2)
        print(f"Frozen: {path}")
        print(f"Checksum: {artifact['checksum']}")
        print(f"Results: {artifact['result_count']}")
        print(f"Verified: {verify(artifact)}")

    elif args.command == "verify":
        with open(args.path) as f:
            artifact = json.load(f)
        ok = verify(artifact)
        print(f"Checksum: {artifact.get('checksum')}")
        print(f"Expected: {checksum(artifact['query'], artifact['results'])}")
        print(f"Valid: {ok}")
        sys.exit(0 if ok else 1)

    elif args.command == "inject":
        with open(args.path) as f:
            artifact = json.load(f)
        docs = to_corpus_docs(artifact)
        print(json.dumps(docs, indent=2))

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
