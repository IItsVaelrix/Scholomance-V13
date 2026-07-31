#!/usr/bin/env python3
"""
lattice_index.py — QBIT Lattice: Constellation of Partial Addresses
====================================================================
CORRECTION APPLIED: The full 64-dimensional 4-bit address space (16^64) is
astronomically sparse. Exact-cell + Hamming-1 matching retrieves nothing.

Instead, the lattice routes through MULTIPLE DIMENSIONAL PROJECTIONS —
a constellation of partial addresses, not one 64-coordinate postal code.

Architecture:
  Full QBIT signature (64 dims × 4 bits)
      ↓ multiple dimensional projections
  Coarse lattice regions (3-4 dims each)
      ↓ candidate union across all projections
  Full-resolution similarity reranking

Mechanisms:
  - Dimensional subspaces: partition 64 dims into groups of 3-4
  - Multiple overlapping lattice keys: each memory gets P partial addresses
  - Coarse centroids: 2-bit quantization for broader capture
  - Multi-probe neighboring regions: Hamming-1 on the COARSE address
  - Hierarchical cells: coarse (3-dim) → medium (4-dim) → fine (rerank)

The lattice is an inverted index: {partial_address: [memory_ids]}.
Built once at seed time, updated on store. Search quantizes the query,
looks up its partial addresses across all projections, unions the
candidates, and reranks with full cosine similarity.

Pure Python. Deterministic. No numpy.
"""

import hashlib
import json
import math
import sqlite3
import time
from typing import List, Tuple, Optional, Dict, Any, Set


# ─── Constants ───────────────────────────────────────────────────────────────

# Projection configurations: (dims_per_group, num_groups, overlap)
# Each projection partitions (or overlaps) the embedding dimensions.
PROJECTION_CONFIGS = [
    # Coarse: 3 dims per group, 21 groups (covers 63 of 64 dims, 1 overlap)
    {"dims_per_group": 3, "num_groups": 21, "label": "coarse_3"},
    # Medium: 4 dims per group, 16 groups (covers all 64 dims exactly)
    {"dims_per_group": 4, "num_groups": 16, "label": "medium_4"},
    # Broad: 2 dims per group, 32 groups (covers all 64 dims, very coarse)
    {"dims_per_group": 2, "num_groups": 32, "label": "broad_2"},
]

# How many Hamming-1 neighbors to probe per partial address
# For a 3-dim address with 16 values each: 3 × 15 = 45 neighbors
# For a 2-dim address: 2 × 15 = 30 neighbors
MAX_NEIGHBORS_PER_PROBE = 48

# Maximum candidates before reranking (safety cap)
MAX_CANDIDATES = 2000

# Minimum similarity to include in final results
MIN_SIMILARITY = 0.05


# ─── Quantization Helpers ────────────────────────────────────────────────────

def quantize_dimension(value: float, min_val: float, max_val: float, bits: int = 4) -> int:
    """Quantize a single float to an integer in [0, 2^bits - 1]."""
    if max_val == min_val:
        return 0
    levels = (1 << bits) - 1  # 15 for 4-bit
    q = int((value - min_val) / (max_val - min_val) * levels + 0.5)
    return max(0, min(levels, q))


def compute_dimension_ranges(vectors: List[List[float]]) -> List[Tuple[float, float]]:
    """Compute (min, max) for each dimension across all vectors."""
    if not vectors:
        return []
    dim = len(vectors[0])
    ranges = []
    for d in range(dim):
        vals = [v[d] for v in vectors]
        ranges.append((min(vals), max(vals)))
    return ranges


# ─── The QBIT Lattice ────────────────────────────────────────────────────────

class QBITLattice:
    """
    Constellation of partial addresses for sub-linear retrieval.
    
    Instead of one exact 64-dim key (16^64 cells, astronomically sparse),
    the lattice maintains multiple overlapping projections, each producing
    a coarse partial address. A memory lives in the UNION of its partial
    addresses across all projections.
    
    Search: quantize query → look up partial addresses → union candidates → rerank.
    
    The lattice is stored in SQLite alongside the substrate memories.
    """
    
    def __init__(self, db_path: str, dim: int = 384):
        self.db_path = db_path
        self.dim = dim
        self.projections = self._build_projections()
        self._ensure_tables()
    
    def _build_projections(self) -> List[Dict[str, Any]]:
        """
        Build deterministic dimension groups for each projection config.
        
        Uses a fixed seed so the grouping is identical across runs.
        Each projection produces a list of dimension-index tuples.
        """
        projections = []
        for config in PROJECTION_CONFIGS:
            dims_per_group = config["dims_per_group"]
            num_groups = config["num_groups"]
            label = config["label"]
            
            # Deterministic grouping: use a hash-based permutation
            # so dimensions are shuffled but reproducibly
            seed = int(hashlib.sha256(label.encode()).hexdigest()[:8], 16)
            indices = list(range(self.dim))
            # Fisher-Yates with deterministic PRNG
            rng_state = seed
            for i in range(len(indices) - 1, 0, -1):
                rng_state = (rng_state * 1103515245 + 12345) & 0x7FFFFFFF
                j = rng_state % (i + 1)
                indices[i], indices[j] = indices[j], indices[i]
            
            groups = []
            for g in range(num_groups):
                start = (g * dims_per_group) % self.dim
                group_dims = tuple(
                    indices[(start + k) % self.dim]
                    for k in range(dims_per_group)
                )
                groups.append(group_dims)
            
            projections.append({
                "label": label,
                "dims_per_group": dims_per_group,
                "groups": groups,
            })
        
        return projections
    
    def _ensure_tables(self):
        """Create lattice tables if they don't exist."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS lattice_cells (
                    projection  TEXT NOT NULL,
                    group_idx   INTEGER NOT NULL,
                    address     TEXT NOT NULL,
                    memory_id   INTEGER NOT NULL,
                    PRIMARY KEY (projection, group_idx, address, memory_id)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_lattice_lookup
                ON lattice_cells(projection, group_idx, address)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS lattice_meta (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            conn.commit()
        finally:
            conn.close()
    
    # ── Address Computation ──────────────────────────────────────────────
    
    def compute_partial_addresses(
        self,
        vector: List[float],
        dim_ranges: List[Tuple[float, float]],
        bits: int = 4
    ) -> List[Tuple[str, int, str]]:
        """
        Compute all partial addresses for a vector across all projections.
        
        Returns:
            List of (projection_label, group_idx, address_string) tuples.
            Each address_string is the quantized values of the group's
            dimensions, joined by commas. E.g., "3,7,12" for a 3-dim group.
        """
        addresses = []
        for proj in self.projections:
            label = proj["label"]
            for group_idx, group_dims in enumerate(proj["groups"]):
                # Quantize only the dimensions in this group
                quantized = []
                for d in group_dims:
                    if d < len(vector) and d < len(dim_ranges):
                        lo, hi = dim_ranges[d]
                        q = quantize_dimension(vector[d], lo, hi, bits)
                    else:
                        q = 0
                    quantized.append(q)
                address = ",".join(str(q) for q in quantized)
                addresses.append((label, group_idx, address))
        return addresses
    
    def _hamming1_neighbors(self, address: str, bits: int = 4) -> List[str]:
        """
        Generate Hamming-1 neighbors of a partial address.
        
        For address "3,7,12" with 4-bit values:
          - Vary dim 0: "0,7,12", "1,7,12", ..., "15,7,12" (15 neighbors)
          - Vary dim 1: "3,0,12", "3,1,12", ..., "3,15,12" (15 neighbors)
          - Vary dim 2: "3,7,0", "3,7,1", ..., "3,7,15" (15 neighbors)
        Total: 3 × 15 = 45 neighbors for a 3-dim address.
        """
        parts = address.split(",")
        levels = (1 << bits) - 1  # 15
        neighbors = []
        for pos in range(len(parts)):
            original = int(parts[pos])
            for val in range(levels + 1):
                if val == original:
                    continue
                new_parts = parts[:]
                new_parts[pos] = str(val)
                neighbors.append(",".join(new_parts))
                if len(neighbors) >= MAX_NEIGHBORS_PER_PROBE:
                    return neighbors
        return neighbors
    
    # ── Index Operations ─────────────────────────────────────────────────
    
    def index_memory(
        self,
        memory_id: int,
        vector: List[float],
        dim_ranges: List[Tuple[float, float]]
    ):
        """Add a memory to the lattice index (all projections)."""
        addresses = self.compute_partial_addresses(vector, dim_ranges)
        conn = sqlite3.connect(self.db_path)
        try:
            conn.executemany(
                "INSERT OR IGNORE INTO lattice_cells (projection, group_idx, address, memory_id) VALUES (?, ?, ?, ?)",
                [(label, gidx, addr, memory_id) for label, gidx, addr in addresses]
            )
            conn.commit()
        finally:
            conn.close()
    
    def index_batch(
        self,
        entries: List[Tuple[int, List[float]]],
        dim_ranges: List[Tuple[float, float]]
    ):
        """Index multiple memories at once."""
        rows = []
        for memory_id, vector in entries:
            addresses = self.compute_partial_addresses(vector, dim_ranges)
            for label, gidx, addr in addresses:
                rows.append((label, gidx, addr, memory_id))
        
        conn = sqlite3.connect(self.db_path)
        try:
            conn.executemany(
                "INSERT OR IGNORE INTO lattice_cells (projection, group_idx, address, memory_id) VALUES (?, ?, ?, ?)",
                rows
            )
            conn.commit()
        finally:
            conn.close()
    
    def remove_memory(self, memory_id: int):
        """Remove a memory from all lattice cells."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("DELETE FROM lattice_cells WHERE memory_id = ?", (memory_id,))
            conn.commit()
        finally:
            conn.close()
    
    def clear(self):
        """Clear the entire lattice index (for rebuild)."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("DELETE FROM lattice_cells")
            conn.commit()
        finally:
            conn.close()
    
    # ── Search ───────────────────────────────────────────────────────────
    
    def search_candidates(
        self,
        query_vector: List[float],
        dim_ranges: List[Tuple[float, float]],
        probe_neighbors: bool = True,
        max_candidates: int = MAX_CANDIDATES
    ) -> Set[int]:
        """
        Find candidate memory IDs via lattice lookup.
        
        For each projection, for each group:
          1. Compute the query's partial address
          2. Look up exact cell
          3. If probe_neighbors: also look up Hamming-1 neighbors
          4. Union all candidate IDs
        
        Returns:
            Set of candidate memory_ids (before reranking).
        """
        query_addresses = self.compute_partial_addresses(query_vector, dim_ranges)
        candidate_ids: Set[int] = set()
        
        conn = sqlite3.connect(self.db_path)
        try:
            for label, gidx, addr in query_addresses:
                # Exact cell lookup
                cursor = conn.execute(
                    "SELECT memory_id FROM lattice_cells WHERE projection = ? AND group_idx = ? AND address = ?",
                    (label, gidx, addr)
                )
                for row in cursor:
                    candidate_ids.add(row[0])
                
                # Multi-probe: Hamming-1 neighbors
                if probe_neighbors:
                    neighbors = self._hamming1_neighbors(addr)
                    if neighbors:
                        placeholders = ",".join("?" for _ in neighbors)
                        cursor = conn.execute(
                            f"SELECT memory_id FROM lattice_cells WHERE projection = ? AND group_idx = ? AND address IN ({placeholders})",
                            [label, gidx] + neighbors
                        )
                        for row in cursor:
                            candidate_ids.add(row[0])
                
                # Safety cap
                if len(candidate_ids) >= max_candidates:
                    break
        finally:
            conn.close()
        
        return candidate_ids
    
    # ── Statistics ───────────────────────────────────────────────────────
    
    def stats(self) -> Dict[str, Any]:
        """Return lattice index statistics."""
        conn = sqlite3.connect(self.db_path)
        try:
            total_cells = conn.execute("SELECT COUNT(*) FROM lattice_cells").fetchone()[0]
            unique_addresses = conn.execute(
                "SELECT COUNT(DISTINCT projection || ':' || group_idx || ':' || address) FROM lattice_cells"
            ).fetchone()[0]
            unique_memories = conn.execute(
                "SELECT COUNT(DISTINCT memory_id) FROM lattice_cells"
            ).fetchone()[0]
            
            # Occupancy distribution
            occupancy = conn.execute("""
                SELECT projection, group_idx, address, COUNT(*) as cnt
                FROM lattice_cells
                GROUP BY projection, group_idx, address
                ORDER BY cnt DESC
                LIMIT 10
            """).fetchall()
            
            return {
                "total_cell_entries": total_cells,
                "unique_addresses": unique_addresses,
                "indexed_memories": unique_memories,
                "projections": len(self.projections),
                "total_groups": sum(len(p["groups"]) for p in self.projections),
                "top_occupied_cells": [
                    {"projection": r[0], "group": r[1], "address": r[2], "count": r[3]}
                    for r in occupancy
                ],
            }
        finally:
            conn.close()
    
    def save_dim_ranges(self, dim_ranges: List[Tuple[float, float]]):
        """Persist dimension ranges for consistent quantization across sessions."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO lattice_meta (key, value) VALUES (?, ?)",
                ("dim_ranges", json.dumps(dim_ranges))
            )
            conn.commit()
        finally:
            conn.close()
    
    def load_dim_ranges(self) -> Optional[List[Tuple[float, float]]]:
        """Load persisted dimension ranges."""
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT value FROM lattice_meta WHERE key = 'dim_ranges'"
            ).fetchone()
            if row:
                return [tuple(r) for r in json.loads(row[0])]
            return None
        finally:
            conn.close()
