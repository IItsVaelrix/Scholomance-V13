#!/usr/bin/env python3
"""
information_matrix.py — Knowledge Graph with Scoped Authority
==============================================================
CORRECTION APPLIED: PINNED is conditional, not globally injected.
Authority has an activation surface, not a global shout.

A globally pinned memory contaminates every retrieval. Instead:
  PINNED: domain=scdna, trigger=gene-generation, authority=curation-law, priority=constitutional

The Curation Law is unavoidable when the query touches gene generation,
but does NOT appear when asking about CSS spacing or audio compression.

Institutional edge types:
  CONSTITUTIONAL   — always active for its domain (the four invariants)
  MANDATORY_WHEN   — active when trigger condition matches
  SUPERSEDES       — this node replaces another (old is penalized)
  CONTRADICTS      — this node contradicts another (loser is penalized)
  EXTENDS          — this node builds on another (both relevant)
  DEPENDS_ON       — this node requires another for context
  EVIDENCES        — this node provides evidence for another
  DEPRECATED_BY    — this node is replaced (stronger than SUPERSEDES)

Pure Python. Deterministic. Stored in SQLite alongside the substrate.
"""

import hashlib
import json
import re
import sqlite3
import time
from typing import List, Tuple, Optional, Dict, Any, Set
from dataclasses import dataclass, field
from enum import Enum


# ─── Edge Types ──────────────────────────────────────────────────────────────

class EdgeType(str, Enum):
    CONSTITUTIONAL = "CONSTITUTIONAL"
    MANDATORY_WHEN = "MANDATORY_WHEN"
    SUPERSEDES = "SUPERSEDES"
    CONTRADICTS = "CONTRADICTS"
    EXTENDS = "EXTENDS"
    DEPENDS_ON = "DEPENDS_ON"
    EVIDENCES = "EVIDENCES"
    DEPRECATED_BY = "DEPRECATED_BY"


# Edge semantics for scoring
EDGE_WEIGHTS = {
    EdgeType.CONSTITUTIONAL: 1.0,    # maximum authority
    EdgeType.MANDATORY_WHEN: 0.9,    # strong when triggered
    EdgeType.SUPERSEDES: 0.7,        # winner gets authority
    EdgeType.CONTRADICTS: 0.8,       # winner penalizes loser
    EdgeType.EXTENDS: 0.5,           # both relevant, mild boost
    EdgeType.DEPENDS_ON: 0.4,        # context requirement
    EdgeType.EVIDENCES: 0.6,         # evidence boosts claim
    EdgeType.DEPRECATED_BY: 0.95,    # strongest replacement signal
}

# Which edges make the SOURCE authoritative (vs the target)
SOURCE_AUTHORITATIVE = {
    EdgeType.CONSTITUTIONAL,
    EdgeType.MANDATORY_WHEN,
    EdgeType.SUPERSEDES,
    EdgeType.CONTRADICTS,
    EdgeType.DEPRECATED_BY,
}


# ─── Authority Scope ─────────────────────────────────────────────────────────

@dataclass
class AuthorityScope:
    """
    Scoped authority: when does this node's authority activate?
    
    CONSTITUTIONAL edges are always active for their domain.
    MANDATORY_WHEN edges activate when the query matches the trigger.
    """
    domain: str                          # e.g., "scdna", "combat", "audio"
    trigger: Optional[str] = None        # regex or keyword for MANDATORY_WHEN
    priority: str = "standard"           # "constitutional" | "mandatory" | "standard"
    description: str = ""
    
    def activates_for(self, query: str, query_tags: Optional[List[str]] = None) -> bool:
        """Check if this authority scope activates for the given query."""
        # CONSTITUTIONAL: always active if domain matches
        if self.priority == "constitutional":
            if query_tags and self.domain in query_tags:
                return True
            # Also activate if domain keyword appears in query
            if self.domain.lower() in query.lower():
                return True
            return False
        
        # MANDATORY_WHEN: active when trigger matches
        if self.trigger:
            # Regex match
            try:
                if re.search(self.trigger, query, re.IGNORECASE):
                    return True
            except re.error:
                # Fallback to substring
                if self.trigger.lower() in query.lower():
                    return True
        
        # Domain match as fallback
        if query_tags and self.domain in query_tags:
            return True
        
        return False


# ─── Graph Node ──────────────────────────────────────────────────────────────

@dataclass
class MatrixNode:
    """A node in the Information Matrix (a memory with authority metadata)."""
    memory_id: int
    checksum: Optional[str] = None
    authority_scope: Optional[AuthorityScope] = None
    tags: List[str] = field(default_factory=list)
    created_at: float = 0.0


# ─── The Information Matrix ──────────────────────────────────────────────────

class InformationMatrix:
    """
    Knowledge graph overlay on the substrate.
    
    Nodes are memories (by ID). Edges are typed relationships with
    scoped authority. The graph is traversable and governs retrieval
    by activating authority conditionally.
    
    Stored in SQLite tables alongside the substrate memories.
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._ensure_tables()
    
    def _ensure_tables(self):
        """Create Information Matrix tables."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS matrix_nodes (
                    memory_id   INTEGER PRIMARY KEY,
                    checksum    TEXT,
                    domain      TEXT,
                    trigger_pattern TEXT,
                    priority    TEXT DEFAULT 'standard',
                    description TEXT DEFAULT '',
                    tags        TEXT DEFAULT '[]',
                    created_at  REAL DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS matrix_edges (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id   INTEGER NOT NULL,
                    target_id   INTEGER NOT NULL,
                    edge_type   TEXT NOT NULL,
                    weight      REAL DEFAULT 1.0,
                    metadata    TEXT DEFAULT '{}',
                    created_at  REAL DEFAULT 0,
                    UNIQUE(source_id, target_id, edge_type)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_edges_source
                ON matrix_edges(source_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_edges_target
                ON matrix_edges(target_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_edges_type
                ON matrix_edges(edge_type)
            """)
            conn.commit()
        finally:
            conn.close()
    
    # ── Node Operations ──────────────────────────────────────────────────
    
    def add_node(
        self,
        memory_id: int,
        checksum: Optional[str] = None,
        authority_scope: Optional[AuthorityScope] = None,
        tags: Optional[List[str]] = None,
    ):
        """Register a memory as a node in the Information Matrix."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT OR REPLACE INTO matrix_nodes
                (memory_id, checksum, domain, trigger_pattern, priority, description, tags, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                memory_id,
                checksum,
                authority_scope.domain if authority_scope else None,
                authority_scope.trigger if authority_scope else None,
                authority_scope.priority if authority_scope else "standard",
                authority_scope.description if authority_scope else "",
                json.dumps(tags or []),
                time.time(),
            ))
            conn.commit()
        finally:
            conn.close()
    
    def remove_node(self, memory_id: int):
        """Remove a node and all its edges."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("DELETE FROM matrix_nodes WHERE memory_id = ?", (memory_id,))
            conn.execute("DELETE FROM matrix_edges WHERE source_id = ? OR target_id = ?", (memory_id, memory_id))
            conn.commit()
        finally:
            conn.close()
    
    # ── Edge Operations ──────────────────────────────────────────────────
    
    def add_edge(
        self,
        source_id: int,
        target_id: int,
        edge_type: EdgeType,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Add a typed relationship between two memories."""
        weight = EDGE_WEIGHTS.get(edge_type, 0.5)
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT OR REPLACE INTO matrix_edges
                (source_id, target_id, edge_type, weight, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                source_id,
                target_id,
                edge_type.value,
                weight,
                json.dumps(metadata or {}),
                time.time(),
            ))
            conn.commit()
        finally:
            conn.close()
    
    def remove_edge(self, source_id: int, target_id: int, edge_type: EdgeType):
        """Remove a specific edge."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "DELETE FROM matrix_edges WHERE source_id = ? AND target_id = ? AND edge_type = ?",
                (source_id, target_id, edge_type.value)
            )
            conn.commit()
        finally:
            conn.close()
    
    def get_edges(self, memory_id: int) -> List[Tuple[int, str, float]]:
        """Get all edges connected to a memory (both directions)."""
        conn = sqlite3.connect(self.db_path)
        try:
            edges = []
            # Outgoing
            for row in conn.execute(
                "SELECT target_id, edge_type, weight FROM matrix_edges WHERE source_id = ?",
                (memory_id,)
            ):
                edges.append((row[0], row[1], row[2]))
            # Incoming
            for row in conn.execute(
                "SELECT source_id, edge_type, weight FROM matrix_edges WHERE target_id = ?",
                (memory_id,)
            ):
                edges.append((row[0], row[1], row[2]))
            return edges
        finally:
            conn.close()
    
    def get_adjacency(self, memory_ids: Optional[Set[int]] = None) -> Dict[int, List[Tuple[int, str]]]:
        """
        Build adjacency list for a set of memories (or all).
        Returns: {memory_id: [(neighbor_id, edge_type)]}
        """
        conn = sqlite3.connect(self.db_path)
        try:
            adj: Dict[int, List[Tuple[int, str]]] = {}
            
            if memory_ids:
                placeholders = ",".join("?" for _ in memory_ids)
                ids_list = list(memory_ids)
                cursor = conn.execute(
                    f"SELECT source_id, target_id, edge_type FROM matrix_edges WHERE source_id IN ({placeholders}) OR target_id IN ({placeholders})",
                    ids_list + ids_list
                )
            else:
                cursor = conn.execute("SELECT source_id, target_id, edge_type FROM matrix_edges")
            
            for row in cursor:
                src, tgt, etype = row
                adj.setdefault(src, []).append((tgt, etype))
                adj.setdefault(tgt, []).append((src, etype))
            
            return adj
        finally:
            conn.close()
    
    # ── Authority Activation ─────────────────────────────────────────────
    
    def activate_authority(
        self,
        query: str,
        query_tags: Optional[List[str]] = None,
        candidate_ids: Optional[Set[int]] = None,
    ) -> Dict[int, float]:
        """
        Compute authority activation scores for memories given a query.
        
        This is the scoped authority mechanism:
          - CONSTITUTIONAL nodes activate when domain matches
          - MANDATORY_WHEN nodes activate when trigger regex matches
          - Standard nodes get no authority boost
        
        Returns:
            {memory_id: authority_score} for activated nodes.
        """
        conn = sqlite3.connect(self.db_path)
        try:
            activations: Dict[int, float] = {}
            
            # Load all nodes with authority scopes
            cursor = conn.execute(
                "SELECT memory_id, domain, trigger_pattern, priority, tags FROM matrix_nodes WHERE priority != 'standard'"
            )
            
            for row in cursor:
                mem_id, domain, trigger, priority, tags_json = row
                tags = json.loads(tags_json) if tags_json else []
                
                scope = AuthorityScope(
                    domain=domain or "",
                    trigger=trigger,
                    priority=priority or "standard",
                )
                
                if scope.activates_for(query, query_tags):
                    # Base authority from priority
                    if priority == "constitutional":
                        base = 1.0
                    elif priority == "mandatory":
                        base = 0.9
                    else:
                        base = 0.5
                    
                    # Boost from incoming CONSTITUTIONAL/MANDATORY_WHEN edges
                    edge_boost = 0.0
                    for erow in conn.execute(
                        "SELECT edge_type, weight FROM matrix_edges WHERE target_id = ?",
                        (mem_id,)
                    ):
                        etype_str, weight = erow
                        try:
                            etype = EdgeType(etype_str)
                            if etype in SOURCE_AUTHORITATIVE:
                                edge_boost += weight * 0.1
                        except ValueError:
                            pass
                    
                    activations[mem_id] = min(base + edge_boost, 1.0)
            
            # Also activate nodes that are EVIDENCED by candidates
            if candidate_ids:
                for cid in candidate_ids:
                    for erow in conn.execute(
                        "SELECT source_id, weight FROM matrix_edges WHERE target_id = ? AND edge_type = ?",
                        (cid, EdgeType.EVIDENCES.value)
                    ):
                        src_id, weight = erow
                        if src_id not in activations:
                            activations[src_id] = weight * 0.5
            
            return activations
        finally:
            conn.close()
    
    # ── Supersession & Contradiction ─────────────────────────────────────
    
    def get_superseded(self) -> Set[int]:
        """Get all memory IDs that have been superseded or deprecated."""
        conn = sqlite3.connect(self.db_path)
        try:
            superseded = set()
            for row in conn.execute(
                "SELECT target_id FROM matrix_edges WHERE edge_type IN (?, ?)",
                (EdgeType.SUPERSEDES.value, EdgeType.DEPRECATED_BY.value)
            ):
                superseded.add(row[0])
            return superseded
        finally:
            conn.close()
    
    def get_contradictions(self) -> List[Tuple[int, int]]:
        """Get all contradiction pairs: (winner_id, loser_id)."""
        conn = sqlite3.connect(self.db_path)
        try:
            pairs = []
            for row in conn.execute(
                "SELECT source_id, target_id FROM matrix_edges WHERE edge_type = ?",
                (EdgeType.CONTRADICTS.value,)
            ):
                pairs.append((row[0], row[1]))
            return pairs
        finally:
            conn.close()
    
    # ── Graph Traversal ──────────────────────────────────────────────────
    
    def traverse(
        self,
        start_id: int,
        max_depth: int = 3,
        edge_filter: Optional[List[EdgeType]] = None,
    ) -> List[Tuple[int, str, int]]:
        """
        BFS traversal from a starting node.
        
        Returns:
            List of (memory_id, edge_type, depth) tuples.
        """
        visited: Set[int] = {start_id}
        frontier: List[Tuple[int, int]] = [(start_id, 0)]  # (node_id, depth)
        results: List[Tuple[int, str, int]] = []
        
        conn = sqlite3.connect(self.db_path)
        try:
            while frontier:
                node_id, depth = frontier.pop(0)
                if depth >= max_depth:
                    continue
                
                cursor = conn.execute(
                    "SELECT target_id, edge_type FROM matrix_edges WHERE source_id = ? UNION SELECT source_id, edge_type FROM matrix_edges WHERE target_id = ?",
                    (node_id, node_id)
                )
                
                for row in cursor:
                    neighbor_id, etype_str = row
                    if neighbor_id in visited:
                        continue
                    
                    # Edge filter
                    if edge_filter:
                        try:
                            etype = EdgeType(etype_str)
                            if etype not in edge_filter:
                                continue
                        except ValueError:
                            continue
                    
                    visited.add(neighbor_id)
                    results.append((neighbor_id, etype_str, depth + 1))
                    frontier.append((neighbor_id, depth + 1))
        finally:
            conn.close()
        
        return results
    
    # ── Statistics ───────────────────────────────────────────────────────
    
    def stats(self) -> Dict[str, Any]:
        """Return Information Matrix statistics."""
        conn = sqlite3.connect(self.db_path)
        try:
            nodes = conn.execute("SELECT COUNT(*) FROM matrix_nodes").fetchone()[0]
            edges = conn.execute("SELECT COUNT(*) FROM matrix_edges").fetchone()[0]
            
            # Edge type breakdown
            edge_types = {}
            for row in conn.execute(
                "SELECT edge_type, COUNT(*) FROM matrix_edges GROUP BY edge_type"
            ):
                edge_types[row[0]] = row[1]
            
            # Authority breakdown
            authority = {}
            for row in conn.execute(
                "SELECT priority, COUNT(*) FROM matrix_nodes GROUP BY priority"
            ):
                authority[row[0]] = row[1]
            
            return {
                "nodes": nodes,
                "edges": edges,
                "edge_types": edge_types,
                "authority_levels": authority,
            }
        finally:
            conn.close()
    
    # ── Bulk Operations ──────────────────────────────────────────────────
    
    def clear(self):
        """Clear all nodes and edges (for rebuild)."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("DELETE FROM matrix_nodes")
            conn.execute("DELETE FROM matrix_edges")
            conn.commit()
        finally:
            conn.close()
