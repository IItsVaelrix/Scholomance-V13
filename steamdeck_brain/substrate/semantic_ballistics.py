#!/usr/bin/env python3
"""
semantic_ballistics.py — Multi-Hop Trajectory Engine
=====================================================
The "bullet path" through concept space.

The query doesn't land on the nearest neighbor — it TRAVELS through
related concepts, deflected by context, arriving at the answer via
a deterministic trajectory.

Ballistics metaphor → mechanism:
  Initial velocity  = query embedding direction
  Gravity           = tag/domain constraints pulling toward relevant domains
  Drag              = similarity decay over hops (ballistic coefficient)
  Wind              = Information Matrix edges deflecting the trajectory
  Impact point      = final retrieval result

Trajectory:
  Hop 0: query → lattice lookup → nearest anchors
  Hop 1: anchors → graph edges → related concepts (deflected by gravity)
  Hop 2: related concepts → lattice lookup → refined candidates (drag)
  Hop 3: refined candidates → triangulation → final retrieval (impact)

Each hop is logged for audit/replay. The trajectory is deterministic:
same query + same substrate state → same trajectory → same results.

Pure Python. Deterministic. No numpy.
"""

import hashlib
import json
import math
import time
from typing import List, Tuple, Optional, Dict, Any, Set
from dataclasses import dataclass, field

from .lattice_index import QBITLattice
from .triangulation import Triangulator, Anchor, ConvergenceResult, CandidateScore
from .information_matrix import InformationMatrix, EdgeType


# ─── Constants ───────────────────────────────────────────────────────────────

DEFAULT_MAX_HOPS = 4
DEFAULT_BALLISTIC_COEFFICIENT = 0.15  # similarity floor per hop (drag)
DEFAULT_GRAVITY_STRENGTH = 0.3        # how much tag/domain pulls the trajectory
DEFAULT_WIND_STRENGTH = 0.2           # how much graph edges deflect


# ─── Trajectory Logging ──────────────────────────────────────────────────────

@dataclass
class HopRecord:
    """A single hop in the trajectory."""
    hop_number: int
    action: str                    # "lattice_lookup" | "graph_traverse" | "triangulate" | "rerank"
    input_count: int               # how many items entered this hop
    output_count: int              # how many items emerged
    candidates_added: int          # new candidates discovered at this hop
    similarity_range: Tuple[float, float] = (0.0, 0.0)  # min/max similarity at this hop
    duration_ms: float = 0.0
    description: str = ""


@dataclass
class TrajectoryLog:
    """Full trajectory audit trail."""
    query: str
    query_checksum: str
    total_hops: int
    hops: List[HopRecord] = field(default_factory=list)
    total_candidates: int = 0
    final_results: int = 0
    convergence_mode: str = "none"
    total_duration_ms: float = 0.0
    deterministic_checksum: str = ""  # checksum of the full trajectory for replay verification
    
    def compute_checksum(self) -> str:
        """Compute a deterministic checksum of the trajectory for replay verification."""
        parts = [
            self.query_checksum,
            str(self.total_hops),
            str(self.total_candidates),
            str(self.final_results),
            self.convergence_mode,
        ]
        for hop in self.hops:
            parts.append(f"{hop.hop_number}:{hop.action}:{hop.input_count}:{hop.output_count}")
        payload = "|".join(parts)
        self.deterministic_checksum = hashlib.sha256(payload.encode()).hexdigest()[:16]
        return self.deterministic_checksum


# ─── The Semantic Ballistics Engine ──────────────────────────────────────────

class SemanticBallistics:
    """
    Multi-hop trajectory engine for substrate retrieval.
    
    Orchestrates:
      1. QBIT Lattice (candidate generation via constellation of partial addresses)
      2. Information Matrix (graph traversal for related concepts)
      3. Triangulator (multi-anchor convergence)
    
    The trajectory is logged and checksummed for deterministic replay.
    """
    
    def __init__(
        self,
        lattice: QBITLattice,
        matrix: InformationMatrix,
        triangulator: Optional[Triangulator] = None,
        max_hops: int = DEFAULT_MAX_HOPS,
        ballistic_coefficient: float = DEFAULT_BALLISTIC_COEFFICIENT,
        gravity_strength: float = DEFAULT_GRAVITY_STRENGTH,
        wind_strength: float = DEFAULT_WIND_STRENGTH,
    ):
        self.lattice = lattice
        self.matrix = matrix
        self.triangulator = triangulator or Triangulator()
        self.max_hops = max_hops
        self.ballistic_coefficient = ballistic_coefficient
        self.gravity_strength = gravity_strength
        self.wind_strength = wind_strength
    
    def fire(
        self,
        query: str,
        query_vector: List[float],
        dim_ranges: List[Tuple[float, float]],
        all_vectors: Dict[int, List[float]],
        all_texts: Dict[int, str],
        all_metadata: Dict[int, Dict[str, Any]],
        top_k: int = 10,
        query_tags: Optional[List[str]] = None,
        anchor_texts: Optional[List[str]] = None,
        anchor_vectors: Optional[List[List[float]]] = None,
    ) -> Tuple[List[Dict[str, Any]], TrajectoryLog]:
        """
        Fire a query through the ballistic trajectory.
        
        Args:
            query: The natural language query
            query_vector: Pre-computed query embedding
            dim_ranges: Dimension ranges for lattice quantization
            all_vectors: {memory_id: vector} for all indexed memories
            all_texts: {memory_id: text} for all indexed memories
            all_metadata: {memory_id: metadata} for all indexed memories
            top_k: Number of final results
            query_tags: Optional domain tags for gravity
            anchor_texts: Optional pre-decomposed anchor texts
            anchor_vectors: Optional pre-computed anchor vectors
        
        Returns:
            (results, trajectory_log) — ranked results + audit trail
        """
        start_time = time.time()
        query_checksum = hashlib.sha256(query.encode()).hexdigest()[:16]
        
        log = TrajectoryLog(
            query=query,
            query_checksum=query_checksum,
            total_hops=0,
        )
        
        # ── Hop 0: Lattice Lookup (initial velocity) ─────────────────────
        hop0_start = time.time()
        candidate_ids = self.lattice.search_candidates(
            query_vector, dim_ranges, probe_neighbors=True
        )
        
        # If lattice returns too few, fall back to full scan
        if len(candidate_ids) < top_k * 2:
            candidate_ids = set(all_vectors.keys())
        
        log.hops.append(HopRecord(
            hop_number=0,
            action="lattice_lookup",
            input_count=1,
            output_count=len(candidate_ids),
            candidates_added=len(candidate_ids),
            duration_ms=(time.time() - hop0_start) * 1000,
            description=f"Lattice constellation lookup: {len(candidate_ids)} candidates from partial addresses",
        ))
        
        # ── Hop 1: Graph Traversal (wind deflection) ─────────────────────
        hop1_start = time.time()
        graph_candidates = self._graph_deflect(candidate_ids, query, query_tags)
        new_from_graph = graph_candidates - candidate_ids
        candidate_ids = candidate_ids | graph_candidates
        
        log.hops.append(HopRecord(
            hop_number=1,
            action="graph_traverse",
            input_count=len(candidate_ids) - len(new_from_graph),
            output_count=len(candidate_ids),
            candidates_added=len(new_from_graph),
            duration_ms=(time.time() - hop1_start) * 1000,
            description=f"Graph wind deflection: +{len(new_from_graph)} from Information Matrix edges",
        ))
        
        # ── Hop 2: Authority Activation (gravity) ────────────────────────
        hop2_start = time.time()
        authority_scores = self.matrix.activate_authority(query, query_tags, candidate_ids)
        
        # Inject authority-activated nodes even if not in lattice candidates
        authority_injected = set(authority_scores.keys()) - candidate_ids
        candidate_ids = candidate_ids | set(authority_scores.keys())
        
        log.hops.append(HopRecord(
            hop_number=2,
            action="authority_gravity",
            input_count=len(candidate_ids) - len(authority_injected),
            output_count=len(candidate_ids),
            candidates_added=len(authority_injected),
            duration_ms=(time.time() - hop2_start) * 1000,
            description=f"Authority gravity: {len(authority_scores)} activated, +{len(authority_injected)} injected",
        ))
        
        # ── Hop 3: Triangulation (impact) ────────────────────────────────
        hop3_start = time.time()
        
        # Build candidate list with vectors
        candidates = []
        for cid in candidate_ids:
            if cid in all_vectors:
                sim = self._cosine(query_vector, all_vectors[cid])
                candidates.append({
                    "id": cid,
                    "text": all_texts.get(cid, ""),
                    "vector": all_vectors[cid],
                    "similarity": sim,
                    "metadata": all_metadata.get(cid, {}),
                })
        
        # Build anchors
        anchors = self._build_anchors(
            query, query_vector, anchor_texts, anchor_vectors, query_tags
        )
        
        # Get graph adjacency for triangulation
        adjacency = self.matrix.get_adjacency(candidate_ids)
        
        # Get superseded and contradicted
        superseded = self.matrix.get_superseded()
        contradictions = self.matrix.get_contradictions()
        
        # Triangulate
        convergence = self.triangulator.triangulate(
            anchors=anchors,
            candidates=candidates,
            graph_edges=adjacency,
            authority_activations=authority_scores,
            superseded_ids=superseded,
            contradicted_pairs=contradictions,
        )
        
        log.hops.append(HopRecord(
            hop_number=3,
            action="triangulate",
            input_count=len(candidates),
            output_count=len(convergence.final_ranking),
            candidates_added=0,
            similarity_range=(
                convergence.final_ranking[-1].weighted_similarity if convergence.final_ranking else 0.0,
                convergence.final_ranking[0].weighted_similarity if convergence.final_ranking else 0.0,
            ),
            duration_ms=(time.time() - hop3_start) * 1000,
            description=f"Triangulation: {convergence.convergence_mode} convergence, {len(convergence.final_ranking)} ranked",
        ))
        
        # ── Final: Format results ────────────────────────────────────────
        results = []
        for cs in convergence.final_ranking[:top_k]:
            results.append({
                "id": cs.memory_id,
                "text": cs.text,
                "similarity": round(cs.weighted_similarity, 4),
                "composite_score": round(cs.composite, 4),
                "convergence_type": cs.convergence_type,
                "anchor_hits": cs.anchor_hits,
                "authority": round(cs.authority, 3),
                "provenance": round(cs.provenance_quality, 3),
                "metadata": cs.metadata,
            })
        
        # Finalize log
        log.total_hops = len(log.hops)
        log.total_candidates = len(candidate_ids)
        log.final_results = len(results)
        log.convergence_mode = convergence.convergence_mode
        log.total_duration_ms = (time.time() - start_time) * 1000
        log.compute_checksum()
        
        return results, log
    
    # ── Internal Methods ─────────────────────────────────────────────────
    
    def _graph_deflect(
        self,
        candidate_ids: Set[int],
        query: str,
        query_tags: Optional[List[str]],
    ) -> Set[int]:
        """
        Deflect the trajectory through graph edges (wind).
        
        For each candidate, follow EXTENDS, DEPENDS_ON, and EVIDENCES
        edges to discover related concepts that pure similarity missed.
        """
        deflected: Set[int] = set()
        
        # Only deflect from the top candidates (by graph degree)
        adjacency = self.matrix.get_adjacency(candidate_ids)
        
        for cid in list(candidate_ids)[:50]:  # cap to avoid explosion
            neighbors = adjacency.get(cid, [])
            for nid, etype_str in neighbors:
                try:
                    etype = EdgeType(etype_str)
                    # Only follow "discovery" edges, not authority edges
                    if etype in (EdgeType.EXTENDS, EdgeType.DEPENDS_ON, EdgeType.EVIDENCES):
                        deflected.add(nid)
                except ValueError:
                    pass
        
        return deflected
    
    def _build_anchors(
        self,
        query: str,
        query_vector: List[float],
        anchor_texts: Optional[List[str]],
        anchor_vectors: Optional[List[List[float]]],
        query_tags: Optional[List[str]],
    ) -> List[Anchor]:
        """
        Build triangulation anchors from the query.
        
        If pre-decomposed anchors are provided, use them.
        Otherwise, decompose the query into keyword-based anchors.
        """
        anchors = []
        
        if anchor_texts and anchor_vectors:
            for i, (text, vec) in enumerate(zip(anchor_texts, anchor_vectors)):
                tag_hint = query_tags[i] if query_tags and i < len(query_tags) else None
                anchors.append(Anchor(
                    id=f"anchor_{i}",
                    text=text,
                    vector=vec,
                    weight=1.0,
                    tag_hint=tag_hint,
                ))
        else:
            # Auto-decompose: split query into meaningful phrases
            # Use the full query as primary anchor
            anchors.append(Anchor(
                id="primary",
                text=query,
                vector=query_vector,
                weight=1.5,  # primary gets more weight
                tag_hint=query_tags[0] if query_tags else None,
            ))
            
            # Secondary anchors from keyword clusters
            words = query.lower().split()
            if len(words) >= 4:
                # Split into two halves as secondary anchors
                mid = len(words) // 2
                left = " ".join(words[:mid])
                right = " ".join(words[mid:])
                
                # These would need their own vectors in production;
                # for now, use the query vector with reduced weight
                anchors.append(Anchor(
                    id="left_context",
                    text=left,
                    vector=query_vector,  # approximation
                    weight=0.7,
                    tag_hint=query_tags[1] if query_tags and len(query_tags) > 1 else None,
                ))
                anchors.append(Anchor(
                    id="right_context",
                    text=right,
                    vector=query_vector,  # approximation
                    weight=0.7,
                    tag_hint=query_tags[2] if query_tags and len(query_tags) > 2 else None,
                ))
        
        return anchors
    
    @staticmethod
    def _cosine(a: List[float], b: List[float]) -> float:
        """Cosine similarity (pure Python)."""
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a)
        norm_b = sum(x * x for x in b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / math.sqrt(norm_a * norm_b)
    
    # ── Replay Verification ──────────────────────────────────────────────
    
    def verify_replay(
        self,
        log1: TrajectoryLog,
        log2: TrajectoryLog,
    ) -> Dict[str, Any]:
        """
        Verify that two trajectory logs are deterministically identical.
        
        Returns a diagnostic report of any divergence.
        """
        divergences = []
        
        if log1.query_checksum != log2.query_checksum:
            divergences.append("query_checksum mismatch")
        
        if log1.total_hops != log2.total_hops:
            divergences.append(f"hop count: {log1.total_hops} vs {log2.total_hops}")
        
        if log1.total_candidates != log2.total_candidates:
            divergences.append(f"candidate count: {log1.total_candidates} vs {log2.total_candidates}")
        
        if log1.final_results != log2.final_results:
            divergences.append(f"result count: {log1.final_results} vs {log2.final_results}")
        
        if log1.convergence_mode != log2.convergence_mode:
            divergences.append(f"convergence: {log1.convergence_mode} vs {log2.convergence_mode}")
        
        if log1.deterministic_checksum != log2.deterministic_checksum:
            divergences.append(f"trajectory checksum: {log1.deterministic_checksum} vs {log2.deterministic_checksum}")
        
        # Per-hop comparison
        for i, (h1, h2) in enumerate(zip(log1.hops, log2.hops)):
            if h1.output_count != h2.output_count:
                divergences.append(f"hop {i} output: {h1.output_count} vs {h2.output_count}")
            if h1.candidates_added != h2.candidates_added:
                divergences.append(f"hop {i} added: {h1.candidates_added} vs {h2.candidates_added}")
        
        return {
            "deterministic": len(divergences) == 0,
            "divergences": divergences,
            "checksum_1": log1.deterministic_checksum,
            "checksum_2": log2.deterministic_checksum,
        }
