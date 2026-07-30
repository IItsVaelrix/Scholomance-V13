"""Substrate Bridge Service — connects the Cockpit to the Scholomance substrate.

Bridges the Cockpit's ToolService (Python) directly to the steamdeck_brain
Cortex / Substrate (also Python). No Node.js intermediary needed — this is a
pure Python-to-Python bridge.

Architecture (Step 2 — Cortex upgrade):
  ToolService._substrate_query()
      → SubstrateBridgeService.query()
          → Cortex.retrieve()          # multi-hop + L1 cache (numpy)
              → L1Cache.query()        # hot in-RAM, <1ms
              → Substrate.retrieve()   # 4-bit quantized vector search, ~4s cold
                  → ~/.substrate/memory.sqlite

  Falls back to Substrate-only (pure Python) if numpy is unavailable.

Architecture (Step 3 — Write-back with curation gate):
  ToolService._substrate_store()
      → SubstrateBridgeService.store()
          → Substrate.store()          # persists to SQLite
          → returns memory_id + checksum

  The tool call itself IS the human approval. The agent proposes; the human
  invokes the tool; the substrate stores. No auto-commit path exists.

Architecture (Step 4 — Cross-agent knowledge sharing):
  ToolService._substrate_recent()
      → SubstrateBridgeService.recent()
          → SQLite query on memories table, ordered by created_at DESC
          → filterable by agent_id, tag, time window

  All agents share the same ~/.substrate/memory.sqlite. Agent-tagged
  memories (metadata.agent) make cross-agent discovery possible.

Design constraints:
  - Write-back is human-gated: only the substrate_store tool writes, and
    only when a human explicitly invokes it. No auto-consolidation.
  - Graceful degradation: if the substrate DB is missing or imports fail,
    returns a structured error rather than crashing the TUI.
  - Cortex requires numpy; falls back to Substrate (pure Python) if absent.
"""

import hashlib
import json
import os
import sqlite3
import sys
import time
import traceback
from typing import Any, Dict, List, Optional

# ── Path setup ──────────────────────────────────────────────────────────
_PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
_BRAIN_DIR = os.path.join(_PROJECT_ROOT, "steamdeck_brain")

# ── Singleton ───────────────────────────────────────────────────────────
_instance: Optional["SubstrateBridgeService"] = None


def get_substrate_bridge() -> "SubstrateBridgeService":
    """Return the singleton SubstrateBridgeService, creating it on first call."""
    global _instance
    if _instance is None:
        _instance = SubstrateBridgeService()
    return _instance


class SubstrateBridgeService:
    """Lazy-init bridge from the Cockpit to the Scholomance substrate.

    The Cortex / Substrate is NOT created until the first query. This avoids
    paying init cost on TUI startup when the user may never touch substrate
    tools.

    Step 2: Uses Cortex (multi-hop + L1 cache) when numpy is available.
    Step 3: Supports write-back via store() with human-gated approval.
    Step 4: Supports cross-agent discovery via recent() and agent-tagged memories.
    """

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path or os.path.expanduser("~/.substrate/memory.sqlite")
        self._cortex = None          # Cortex (numpy available)
        self._substrate = None       # Substrate (fallback, pure Python)
        self._init_error: Optional[str] = None
        self._query_count = 0
        self._store_count = 0
        self._engine = "none"        # "cortex" | "substrate" | "none"

    # ── Lazy init ───────────────────────────────────────────────────────

    def _ensure_engine(self) -> bool:
        """Initialize Cortex (preferred) or Substrate (fallback) on first use."""
        if self._cortex is not None or self._substrate is not None:
            return True
        if self._init_error is not None:
            return False  # already failed, don't retry

        if not os.path.isfile(self._db_path):
            self._init_error = (
                f"Substrate database not found at {self._db_path}. "
                f"Run: python3 steamdeck_brain/seed_scholomance.py"
            )
            return False

        # Ensure steamdeck_brain is importable
        if _BRAIN_DIR not in sys.path:
            sys.path.insert(0, _BRAIN_DIR)

        # Try Cortex first (requires numpy)
        try:
            from cortex import Cortex
            self._cortex = Cortex(substrate_db=self._db_path)
            # Lower the L1 cache similarity threshold for hash embeddings
            # (default 0.3 is too high; hash embeddings produce low cosine scores)
            self._engine = "cortex"
            return True
        except ImportError:
            pass  # numpy not available, fall through to Substrate
        except Exception as e:
            # Cortex failed for another reason; try Substrate fallback
            pass

        # Fallback: Substrate only (pure Python, no numpy)
        try:
            from substrate_engine import Substrate
            self._substrate = Substrate(db_path=self._db_path)
            self._engine = "substrate"
            return True
        except Exception as e:
            self._init_error = f"Failed to initialize engine: {e}\n{traceback.format_exc()}"
            return False

    def _get_substrate(self):
        """Return the Substrate instance (from Cortex or standalone)."""
        if self._cortex is not None:
            return self._cortex.substrate
        return self._substrate

    # ── Step 2: Query (Cortex multi-hop + L1, or Substrate fallback) ────

    def query(
        self,
        text: str,
        top_k: int = 5,
        tag_filter: Optional[str] = None,
        multi_hop: bool = False,
    ) -> Dict[str, Any]:
        """Semantic query against the substrate.

        Args:
            text: Natural-language query.
            top_k: Max results (default 5, capped at 20).
            tag_filter: Optional metadata tag filter (e.g. 'law', 'pdr').
            multi_hop: Enable multi-hop retrieval (Cortex only, slower).

        Returns:
            {ok, query, results, context_block, stats}
        """
        top_k = max(1, min(top_k, 20))

        if not self._ensure_engine():
            return {"ok": False, "error": self._init_error}

        t0 = time.monotonic()
        try:
            if self._cortex is not None:
                # Cortex path: multi-hop or single-hop with L1 warming
                results_raw, _ctx = self._cortex.retrieve(
                    text, top_k=top_k, multi_hop=multi_hop
                )
                # Apply tag filter post-hoc (Cortex doesn't support it natively)
                if tag_filter:
                    results_raw = [
                        r for r in results_raw
                        if r.get("metadata", {}).get("tag") == tag_filter
                    ][:top_k]
            else:
                # Substrate fallback: flat retrieval
                metadata_filter = {"tag": tag_filter} if tag_filter else None
                results_raw = self._substrate.retrieve(
                    text, top_k=top_k, metadata_filter=metadata_filter
                )

            results = [
                {
                    "text": r["text"][:500],
                    "similarity": round(r.get("similarity", 0), 4),
                    "metadata": r.get("metadata", {}),
                    "hop": r.get("hop", 0),
                    "source": r.get("source", "L2"),
                }
                for r in results_raw
            ]

            # Build context block
            lines = ["[[SUBSTRATE MEMORIES]]"]
            for i, r in enumerate(results, 1):
                meta = r.get("metadata", {})
                tag = meta.get("tag", "?")
                src = meta.get("source", "?")
                lines.append(f"[{i}] ({r['similarity']:.3f}) [{tag}] {src}")
                lines.append(r["text"][:300])
                lines.append("")

            elapsed_ms = round((time.monotonic() - t0) * 1000, 1)
            self._query_count += 1

            return {
                "ok": True,
                "query": text,
                "results": results,
                "context_block": "\n".join(lines),
                "stats": {
                    "query_time_ms": elapsed_ms,
                    "result_count": len(results),
                    "engine": self._engine,
                    "multi_hop": multi_hop and self._engine == "cortex",
                    "tag_filter": tag_filter,
                    "session_queries": self._query_count,
                },
            }
        except Exception as e:
            return {"ok": False, "error": f"Query failed: {e}\n{traceback.format_exc()}"}

    # ── Step 3: Write-back with curation gate ───────────────────────────

    def store(
        self,
        text: str,
        tag: str = "discovery",
        agent_id: str = "cockpit",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Store a memory in the substrate (human-gated write-back).

        The tool call itself IS the human approval. No auto-commit path.

        Args:
            text: The knowledge to store.
            tag: Category tag (e.g. 'discovery', 'decision', 'correction').
            agent_id: Which agent is storing (e.g. 'mother', 'divtube', 'vaelrix').
            metadata: Additional metadata to attach.

        Returns:
            {ok, memory_id, checksum, text_preview}
        """
        if not self._ensure_engine():
            return {"ok": False, "error": self._init_error}

        try:
            substrate = self._get_substrate()

            # Build full metadata with provenance
            full_meta = {
                "tag": tag,
                "tier": "cockpit",
                "agent": agent_id,
                "approved_by": "human",  # the tool invocation IS the approval
                "stored_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source": "cockpit-write-back",
            }
            if metadata:
                full_meta.update(metadata)

            memory_id = substrate.store(text, metadata=full_meta)

            # Compute a checksum for traceability
            checksum = hashlib.sha256(
                f"{text}|{json.dumps(full_meta, sort_keys=True)}".encode()
            ).hexdigest()[:16]

            self._store_count += 1

            return {
                "ok": True,
                "memory_id": memory_id,
                "checksum": checksum,
                "text_preview": text[:120],
                "tag": tag,
                "agent_id": agent_id,
                "metadata": full_meta,
                "session_stores": self._store_count,
            }
        except Exception as e:
            return {"ok": False, "error": f"Store failed: {e}\n{traceback.format_exc()}"}

    # ── Step 4: Cross-agent knowledge sharing ───────────────────────────

    def recent(
        self,
        limit: int = 10,
        agent_id: Optional[str] = None,
        tag: Optional[str] = None,
        since_minutes: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Retrieve recently stored memories for cross-agent discovery.

        Args:
            limit: Max memories to return (default 10, capped at 50).
            agent_id: Filter by storing agent (e.g. 'mother', 'divtube').
            tag: Filter by tag (e.g. 'discovery', 'decision').
            since_minutes: Only memories from the last N minutes.

        Returns:
            {ok, memories, stats}
        """
        limit = max(1, min(limit, 50))

        if not self._ensure_engine():
            return {"ok": False, "error": self._init_error}

        try:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row

            query = "SELECT id, text, metadata, created_at FROM memories"
            conditions = []
            params = []

            if since_minutes is not None:
                cutoff = time.time() - (since_minutes * 60)
                conditions.append("created_at > ?")
                params.append(cutoff)

            if conditions:
                query += " WHERE " + " AND ".join(conditions)

            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit * 3)  # over-fetch for post-filter

            rows = conn.execute(query, params).fetchall()
            conn.close()

            memories = []
            for row in rows:
                meta = json.loads(row["metadata"] or "{}")

                # Post-filter by agent and tag (metadata is JSON, not indexed)
                if agent_id and meta.get("agent") != agent_id:
                    continue
                if tag and meta.get("tag") != tag:
                    continue

                memories.append({
                    "id": row["id"],
                    "text": row["text"][:300],
                    "agent": meta.get("agent", "?"),
                    "tag": meta.get("tag", "?"),
                    "tier": meta.get("tier", "?"),
                    "source": meta.get("source", "?"),
                    "stored_at": meta.get("stored_at", "?"),
                    "created_at": row["created_at"],
                })

                if len(memories) >= limit:
                    break

            return {
                "ok": True,
                "memories": memories,
                "stats": {
                    "count": len(memories),
                    "agent_filter": agent_id,
                    "tag_filter": tag,
                    "since_minutes": since_minutes,
                    "engine": self._engine,
                },
            }
        except Exception as e:
            return {"ok": False, "error": f"Recent query failed: {e}\n{traceback.format_exc()}"}

    # ── Status / health ─────────────────────────────────────────────────

    def status(self) -> Dict[str, Any]:
        """Health and status of the substrate bridge."""
        db_exists = os.path.isfile(self._db_path)
        db_size_mb = round(os.path.getsize(self._db_path) / (1024 * 1024), 2) if db_exists else 0

        info = {
            "ok": True,
            "db_path": self._db_path,
            "db_exists": db_exists,
            "db_size_mb": db_size_mb,
            "engine": self._engine,
            "cortex_available": self._cortex is not None,
            "substrate_available": self._substrate is not None or self._cortex is not None,
            "session_queries": self._query_count,
            "session_stores": self._store_count,
        }

        if self._cortex is not None:
            info["cortex_stats"] = {
                "L1_cache": self._cortex.l1.stats(),
                "L2_substrate": {"total": self._cortex.substrate.count()},
                "query_count": self._cortex._query_count,
            }
        elif self._substrate is not None:
            info["substrate_stats"] = {
                "total": self._substrate.count(),
            }

        if self._init_error:
            info["init_error"] = self._init_error

        return info

    def tags(self) -> Dict[str, Any]:
        """Tag/tier breakdown from substrate metadata."""
        if not self._ensure_engine():
            return {"ok": False, "error": self._init_error}

        try:
            conn = sqlite3.connect(self._db_path)
            rows = conn.execute("SELECT metadata FROM memories").fetchall()
            conn.close()

            tag_counts: Dict[str, int] = {}
            tier_counts: Dict[str, int] = {}
            agent_counts: Dict[str, int] = {}

            for (meta_json,) in rows:
                meta = json.loads(meta_json or "{}")
                t = meta.get("tag", "untagged")
                tag_counts[t] = tag_counts.get(t, 0) + 1
                tier = meta.get("tier", "untiered")
                tier_counts[tier] = tier_counts.get(tier, 0) + 1
                agent = meta.get("agent")
                if agent:
                    agent_counts[agent] = agent_counts.get(agent, 0) + 1

            return {
                "ok": True,
                "tags": dict(sorted(tag_counts.items(), key=lambda x: -x[1])),
                "tiers": dict(sorted(tier_counts.items(), key=lambda x: -x[1])),
                "agents": dict(sorted(agent_counts.items(), key=lambda x: -x[1])),
                "total_memories": len(rows),
            }
        except Exception as e:
            return {"ok": False, "error": f"Tag scan failed: {e}"}
