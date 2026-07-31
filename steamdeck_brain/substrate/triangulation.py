#!/usr/bin/env python3
"""
triangulation.py — Multi-Anchor Vertex Triangulation
=====================================================
CORRECTION APPLIED: Hard intersection erases distributed answers.
Sometimes the answer is one needle. Sometimes it is a sewn seam
between three needles.

Two convergence modes:
  1. POINT convergence: a single memory appears in multiple anchor sets
  2. RELATIONAL convergence: separate memories jointly answer via graph paths

Scoring function (per candidate):
  score = anchor_coverage
        + weighted_similarity
        + graph_connectivity
        + authority
        + provenance_quality
        + temporal_validity
        - contradiction_penalty

Require either:
  - sufficient multi-anchor convergence (point), OR
  - a graph path explaining why separate memories jointly answer (relational)

Pure Python. Deterministic. No numpy.
"""

import math
import time
from typing import List, Tuple, Optional, Dict, Any, Set
from dataclasses import dataclass, field


# ─── Data Types ──────────────────────────────────────────────────────────────

@dataclass
class Anchor:
    """A triangulation anchor — one aspect of the query."""
    id: str
    text: str
    vector: List[float]
    weight: float = 1.0
    tag_hint: Optional[str] = None  # optional domain constraint


@dataclass
class CandidateScore:
    """Composite score for a candidate memory."""
    memory_id: int
    text: str
    metadata: Dict[str, Any]
    
    # Component scores
    anchor_coverage: float = 0.0      # fraction of anchors that found this memory
    weighted_similarity: float = 0.0   # weighted average cosine similarity
    graph_connectivity: float = 0.0    # edges to other high-scoring candidates
    authority: float = 0.0             # scoped authority activation score
    provenance_quality: float = 0.0    # source reliability (law > pdr > bug)
    temporal_validity: float = 0.0     # recency / non-superseded
    contradiction_penalty: float = 0.0 # penalized if contradicted by higher-auth
    
    # Derived
    composite: float = 0.0
    convergence_type: str = "none"     # "point" | "relational" | "none"
    anchor_hits: List[str] = field(default_factory=list)
    
    def compute_composite(self):
        """Compute the final composite score."""
        self.composite = (
            self.anchor_coverage * 2.0 +      # coverage is king
            self.weighted_similarity * 1.5 +   # similarity matters
            self.graph_connectivity * 1.0 +    # graph context
            self.authority * 2.5 +             # authority is critical
            self.provenance_quality * 1.0 +    # source reliability
            self.temporal_validity * 0.5 +     # recency bonus
            - self.contradiction_penalty * 3.0 # contradictions are severe
        )


@dataclass
class ConvergenceResult:
    """The result of a triangulation operation."""
    # Point convergence: single memories that satisfy multiple anchors
    point_results: List[CandidateScore] = field(default_factory=list)
    
    # Relational convergence: groups of memories that jointly answer
    relational_results: List[List[CandidateScore]] = field(default_factory=list)
    
    # The final ranked output (merged, deduplicated)
    final_ranking: List[CandidateScore] = field(default_factory=list)
    
    # Diagnostics
    anchors_used: int = 0
    candidates_evaluated: int = 0
    convergence_mode: str = "none"  # "point" | "relational" | "hybrid"
    seam_explanation: Optional[str] = None  # why relational convergence fired


# ─── Provenance Hierarchy ────────────────────────────────────────────────────

# Source reliability: higher = more authoritative
PROVENANCE_SCORES = {
    "law": 1.0,
    "core": 1.0,
    "whitepaper": 0.9,
    "foundation": 0.9,
    "architecture": 0.8,
    "design": 0.8,
    "pdr": 0.75,
    "pir": 0.7,
    "review": 0.7,
    "verdict": 0.85,
    "audit": 0.85,
    "bible": 0.95,
    "canon": 0.95,
    "guide": 0.6,
    "reference": 0.6,
    "bug": 0.4,
    "incident": 0.4,
    "handoff": 0.5,
    "transition": 0.5,
    "change": 0.45,
    "log": 0.45,
    "discovery": 0.55,
    "decision": 0.65,
    "correction": 0.7,
    "insight": 0.6,
}


# ─── The Triangulator ────────────────────────────────────────────────────────

class Triangulator:
    """
    Multi-anchor vertex triangulation with point + relational convergence.
    
    Usage:
        tri = Triangulator()
        anchors = [
            Anchor(id="law", text="Curation Law", vector=law_vec, tag_hint="law"),
            Anchor(id="impl", text="gene generation", vector=impl_vec, tag_hint="pdr"),
            Anchor(id="super", text="superseding PDR", vector=super_vec),
        ]
        result = tri.triangulate(anchors, candidates, graph_edges)
    """
    
    def __init__(
        self,
        point_threshold: float = 0.4,
        relational_min_path: int = 2,
        max_relational_group: int = 5,
        similarity_floor: float = 0.1,
    ):
        self.point_threshold = point_threshold
        self.relational_min_path = relational_min_path
        self.max_relational_group = max_relational_group
        self.similarity_floor = similarity_floor
    
    def triangulate(
        self,
        anchors: List[Anchor],
        candidates: List[Dict[str, Any]],
        graph_edges: Optional[Dict[int, List[Tuple[int, str]]]] = None,
        authority_activations: Optional[Dict[int, float]] = None,
        superseded_ids: Optional[Set[int]] = None,
        contradicted_pairs: Optional[List[Tuple[int, int]]] = None,
    ) -> ConvergenceResult:
        """
        Perform multi-anchor triangulation over candidates.
        
        Args:
            anchors: Query decomposition into multiple anchor concepts
            candidates: List of {id, text, similarity, metadata, vector} dicts
            graph_edges: Adjacency list: memory_id → [(neighbor_id, edge_type)]
            authority_activations: memory_id → authority score (from InformationMatrix)
            superseded_ids: Set of memory_ids that have been superseded
            contradicted_pairs: List of (winner_id, loser_id) contradiction pairs
        
        Returns:
            ConvergenceResult with point and relational convergence.
        """
        if not anchors or not candidates:
            return ConvergenceResult()
        
        graph_edges = graph_edges or {}
        authority_activations = authority_activations or {}
        superseded_ids = superseded_ids or set()
        contradicted_pairs = contradicted_pairs or []
        
        # Phase 1: Compute per-anchor candidate sets
        anchor_hits: Dict[str, Set[int]] = {}
        anchor_sims: Dict[str, Dict[int, float]] = {}
        
        for anchor in anchors:
            hits = set()
            sims = {}
            for cand in candidates:
                sim = self._cosine(anchor.vector, cand.get("vector", []))
                if sim >= self.similarity_floor:
                    # Tag hint filtering: if anchor has a tag hint, boost matching
                    tag_bonus = 0.0
                    if anchor.tag_hint:
                        meta = cand.get("metadata", {})
                        if meta.get("tag") == anchor.tag_hint:
                            tag_bonus = 0.15
                        elif meta.get("tier") == anchor.tag_hint:
                            tag_bonus = 0.10
                    
                    effective_sim = sim + tag_bonus
                    if effective_sim >= self.similarity_floor:
                        hits.add(cand["id"])
                        sims[cand["id"]] = effective_sim
            
            anchor_hits[anchor.id] = hits
            anchor_sims[anchor.id] = sims
        
        # Phase 2: Score each candidate
        scored: Dict[int, CandidateScore] = {}
        cand_by_id = {c["id"]: c for c in candidates}
        
        for cand in candidates:
            cid = cand["id"]
            cs = CandidateScore(
                memory_id=cid,
                text=cand.get("text", ""),
                metadata=cand.get("metadata", {}),
            )
            
            # Anchor coverage: fraction of anchors that found this candidate
            hits = [a.id for a in anchors if cid in anchor_hits.get(a.id, set())]
            cs.anchor_hits = hits
            cs.anchor_coverage = len(hits) / len(anchors) if anchors else 0.0
            
            # Weighted similarity: weighted average across anchors
            total_weight = 0.0
            weighted_sum = 0.0
            for anchor in anchors:
                sim = anchor_sims.get(anchor.id, {}).get(cid, 0.0)
                weighted_sum += sim * anchor.weight
                total_weight += anchor.weight
            cs.weighted_similarity = weighted_sum / total_weight if total_weight > 0 else 0.0
            
            # Graph connectivity: edges to other candidates
            neighbors = graph_edges.get(cid, [])
            candidate_ids = set(cand_by_id.keys())
            connected = sum(1 for nid, _ in neighbors if nid in candidate_ids)
            cs.graph_connectivity = min(connected / max(len(anchors), 1), 1.0)
            
            # Authority: from InformationMatrix activations
            cs.authority = authority_activations.get(cid, 0.0)
            
            # Provenance quality: based on metadata tag/tier
            meta = cand.get("metadata", {})
            tag = meta.get("tag", "")
            tier = meta.get("tier", "")
            cs.provenance_quality = max(
                PROVENANCE_SCORES.get(tag, 0.3),
                PROVENANCE_SCORES.get(tier, 0.3),
            )
            
            # Temporal validity: penalize superseded
            if cid in superseded_ids:
                cs.temporal_validity = -0.5
            else:
                # Recency bonus (mild)
                created = meta.get("created_at", 0)
                if created > 0:
                    age_days = (time.time() - created) / 86400
                    cs.temporal_validity = max(0.0, 1.0 - age_days / 365.0)
                else:
                    cs.temporal_validity = 0.5
            
            # Contradiction penalty
            for winner, loser in contradicted_pairs:
                if cid == loser:
                    cs.contradiction_penalty += 1.0
            
            cs.compute_composite()
            scored[cid] = cs
        
        # Phase 3: Identify convergence modes
        result = ConvergenceResult(
            anchors_used=len(anchors),
            candidates_evaluated=len(candidates),
        )
        
        # Point convergence: candidates hit by multiple anchors
        for cid, cs in scored.items():
            if cs.anchor_coverage >= self.point_threshold and cs.composite > 0:
                cs.convergence_type = "point"
                result.point_results.append(cs)
        
        result.point_results.sort(key=lambda x: -x.composite)
        
        # Relational convergence: groups connected by graph edges
        # that JOINTLY cover all anchors (even if no single memory does)
        relational_groups = self._find_relational_groups(
            scored, anchor_hits, anchors, graph_edges
        )
        result.relational_results = relational_groups
        
        # Phase 4: Merge into final ranking
        # Point results first, then relational group representatives
        seen_ids: Set[int] = set()
        final = []
        
        for cs in result.point_results:
            if cs.memory_id not in seen_ids:
                final.append(cs)
                seen_ids.add(cs.memory_id)
        
        for group in relational_groups:
            # Add the group's best member as representative
            if group:
                rep = max(group, key=lambda x: x.composite)
                if rep.memory_id not in seen_ids:
                    rep.convergence_type = "relational"
                    final.append(rep)
                    seen_ids.add(rep.memory_id)
                # Also add other group members if they add anchor coverage
                for member in group:
                    if member.memory_id not in seen_ids:
                        member.convergence_type = "relational"
                        final.append(member)
                        seen_ids.add(member.memory_id)
        
        # Sort final by composite
        final.sort(key=lambda x: -x.composite)
        result.final_ranking = final
        
        # Determine convergence mode
        if result.point_results and result.relational_results:
            result.convergence_mode = "hybrid"
        elif result.point_results:
            result.convergence_mode = "point"
        elif result.relational_results:
            result.convergence_mode = "relational"
            result.seam_explanation = self._explain_seam(relational_groups, anchors)
        
        return result
    
    def _find_relational_groups(
        self,
        scored: Dict[int, CandidateScore],
        anchor_hits: Dict[str, Set[int]],
        anchors: List[Anchor],
        graph_edges: Dict[int, List[Tuple[int, str]]],
    ) -> List[List[CandidateScore]]:
        """
        Find groups of graph-connected memories that JOINTLY cover all anchors.
        
        This is the "sewn seam" — no single needle satisfies all anchors,
        but a connected group does.
        """
        groups = []
        
        # For each anchor, find its best candidates
        anchor_best: Dict[str, List[int]] = {}
        for anchor in anchors:
            hits = anchor_hits.get(anchor.id, set())
            # Sort by composite score
            ranked = sorted(
                hits,
                key=lambda cid: scored[cid].composite if cid in scored else 0,
                reverse=True
            )
            anchor_best[anchor.id] = ranked[:5]  # top 5 per anchor
        
        # Try to form connected groups that cover all anchors
        # Start from the best candidate of each anchor and BFS through graph
        all_anchor_ids = set(a.id for a in anchors)
        
        # Seed: take the top candidate from each anchor
        seeds = set()
        for aid, best_list in anchor_best.items():
            if best_list:
                seeds.add(best_list[0])
        
        if len(seeds) < 2:
            return []  # Can't form a relational group with < 2 seeds
        
        # BFS from seeds through graph edges to find connected group
        group_ids: Set[int] = set(seeds)
        frontier = list(seeds)
        visited = set(seeds)
        
        while frontier and len(group_ids) < self.max_relational_group:
            current = frontier.pop(0)
            neighbors = graph_edges.get(current, [])
            for nid, edge_type in neighbors:
                if nid not in visited and nid in scored:
                    visited.add(nid)
                    # Only add if this neighbor contributes anchor coverage
                    neighbor_hits = scored[nid].anchor_hits
                    if neighbor_hits:
                        group_ids.add(nid)
                        frontier.append(nid)
        
        # Check if the group jointly covers all anchors
        group_anchor_coverage: Set[str] = set()
        for cid in group_ids:
            if cid in scored:
                group_anchor_coverage.update(scored[cid].anchor_hits)
        
        if len(group_anchor_coverage) >= len(all_anchor_ids) * 0.67:
            # Group covers at least 2/3 of anchors — valid relational convergence
            group = [scored[cid] for cid in group_ids if cid in scored]
            group.sort(key=lambda x: -x.composite)
            groups.append(group)
        
        return groups
    
    def _explain_seam(
        self,
        groups: List[List[CandidateScore]],
        anchors: List[Anchor],
    ) -> str:
        """Generate a human-readable explanation of why relational convergence fired."""
        if not groups:
            return "No relational convergence found."
        
        group = groups[0]
        parts = []
        for member in group:
            parts.append(
                f"  [{member.memory_id}] covers anchors {member.anchor_hits} "
                f"(sim={member.weighted_similarity:.3f}, auth={member.authority:.2f})"
            )
        
        return (
            f"Relational convergence: {len(group)} memories jointly answer "
            f"{len(anchors)} anchors. No single memory satisfies all.\n"
            + "\n".join(parts)
        )
    
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
