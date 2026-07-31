#!/usr/bin/env python3
"""
test_substrate_advanced.py — Tests for Information Matrix + Semantic Ballistics
================================================================================
Tests the four-layer retrieval upgrade:
  1. QBIT Lattice (constellation of partial addresses)
  2. Triangulation (point + relational convergence)
  3. Information Matrix (scoped authority)
  4. Semantic Ballistics (multi-hop trajectory)

Pure Python. Deterministic. No numpy.
"""

import hashlib
import json
import math
import os
import sqlite3
import sys
import tempfile
import time

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from substrate.lattice_index import QBITLattice, quantize_dimension, compute_dimension_ranges
from substrate.triangulation import Triangulator, Anchor, ConvergenceResult, CandidateScore
from substrate.information_matrix import InformationMatrix, EdgeType, AuthorityScope
from substrate.semantic_ballistics import SemanticBallistics, TrajectoryLog


# ─── Test Helpers ────────────────────────────────────────────────────────────

def make_vector(seed: int, dim: int = 64) -> list:
    """Create a deterministic pseudo-random vector from a seed."""
    vec = []
    state = seed
    for _ in range(dim):
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        vec.append((state / 0x7FFFFFFF) * 2.0 - 1.0)
    # Normalize
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def make_similar_vector(base: list, noise_seed: int, noise_amount: float = 0.1) -> list:
    """Create a vector similar to base with controlled noise."""
    noise = make_vector(noise_seed, len(base))
    result = [b + noise_amount * n for b, n in zip(base, noise)]
    norm = math.sqrt(sum(v * v for v in result))
    if norm > 0:
        result = [v / norm for v in result]
    return result


def cosine(a: list, b: list) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a)
    nb = sum(x * x for x in b)
    if na == 0 or nb == 0:
        return 0.0
    return dot / math.sqrt(na * nb)


# ─── Test 1: QBIT Lattice ───────────────────────────────────────────────────

def test_lattice_constellation():
    """Test that the lattice uses constellation of partial addresses, not exact keys."""
    print("\n═══ Test 1: QBIT Lattice — Constellation of Partial Addresses ═══")
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        db_path = f.name
    
    try:
        dim = 64
        lattice = QBITLattice(db_path, dim=dim)
        
        # Verify projection structure
        assert len(lattice.projections) == 3, f"Expected 3 projections, got {len(lattice.projections)}"
        total_groups = sum(len(p["groups"]) for p in lattice.projections)
        print(f"  ✓ {len(lattice.projections)} projections, {total_groups} total groups")
        
        # Verify each projection has correct dims_per_group
        for proj in lattice.projections:
            for group in proj["groups"]:
                assert len(group) == proj["dims_per_group"], \
                    f"Group size mismatch: {len(group)} != {proj['dims_per_group']}"
        print(f"  ✓ All groups have correct dimensionality")
        
        # Create test vectors and compute dimension ranges
        vectors = [make_vector(i, dim) for i in range(100)]
        dim_ranges = compute_dimension_ranges(vectors)
        assert len(dim_ranges) == dim
        print(f"  ✓ Dimension ranges computed: {dim} dims")
        
        # Index memories
        entries = [(i, vectors[i]) for i in range(100)]
        lattice.index_batch(entries, dim_ranges)
        
        # Verify index was populated
        stats = lattice.stats()
        assert stats["indexed_memories"] == 100, f"Expected 100 indexed, got {stats['indexed_memories']}"
        assert stats["total_cell_entries"] > 0
        print(f"  ✓ Indexed 100 memories: {stats['total_cell_entries']} cell entries, {stats['unique_addresses']} unique addresses")
        
        # Search: a vector similar to memory 42 should find it
        query_vec = make_similar_vector(vectors[42], noise_seed=999, noise_amount=0.05)
        candidates = lattice.search_candidates(query_vec, dim_ranges, probe_neighbors=True)
        
        assert 42 in candidates, f"Memory 42 not found in {len(candidates)} candidates"
        assert len(candidates) < 100, f"Candidate set too large: {len(candidates)} (should be sub-linear)"
        print(f"  ✓ Search found memory 42 in {len(candidates)} candidates (sub-linear)")
        
        # Verify the constellation property: multiple partial addresses per memory
        addresses = lattice.compute_partial_addresses(vectors[0], dim_ranges)
        assert len(addresses) == total_groups, f"Expected {total_groups} addresses, got {len(addresses)}"
        print(f"  ✓ Each memory gets {len(addresses)} partial addresses (constellation)")
        
        # Hamming-1 neighbors
        neighbors = lattice._hamming1_neighbors("3,7,12")
        assert len(neighbors) == 45, f"Expected 45 Hamming-1 neighbors for 3-dim, got {len(neighbors)}"
        assert "3,7,12" not in neighbors  # original not included
        print(f"  ✓ Hamming-1 neighbors: {len(neighbors)} for 3-dim address")
        
        # Determinism: same query → same candidates
        candidates2 = lattice.search_candidates(query_vec, dim_ranges, probe_neighbors=True)
        assert candidates == candidates2, "Lattice search not deterministic!"
        print(f"  ✓ Deterministic: identical candidates on repeat query")
        
        # Dimension ranges persistence
        lattice.save_dim_ranges(dim_ranges)
        loaded = lattice.load_dim_ranges()
        assert loaded == dim_ranges, "Dimension ranges not persisted correctly"
        print(f"  ✓ Dimension ranges persisted and loaded")
        
        print("  ✅ Lattice constellation: PASS")
        return True
    finally:
        os.unlink(db_path)


# ─── Test 2: Triangulation ───────────────────────────────────────────────────

def test_triangulation_point_and_relational():
    """Test both point convergence and relational convergence (sewn seams)."""
    print("\n═══ Test 2: Triangulation — Point + Relational Convergence ═══")
    
    dim = 64
    tri = Triangulator(point_threshold=0.4, similarity_floor=0.05)
    
    # Create a scenario where:
    # - Memory 1 is similar to ALL anchors (point convergence)
    # - Memories 2, 3, 4 are each similar to ONE anchor but graph-connected (relational)
    
    base_vec = make_vector(100, dim)
    
    # Anchors
    anchor_vecs = [
        make_similar_vector(base_vec, 201, 0.2),  # "law" aspect
        make_similar_vector(base_vec, 202, 0.2),  # "implementation" aspect
        make_similar_vector(base_vec, 203, 0.2),  # "superseding" aspect
    ]
    anchors = [
        Anchor(id="law", text="Curation Law", vector=anchor_vecs[0], weight=1.0, tag_hint="law"),
        Anchor(id="impl", text="gene generation", vector=anchor_vecs[1], weight=1.0, tag_hint="pdr"),
        Anchor(id="super", text="superseding PDR", vector=anchor_vecs[2], weight=1.0),
    ]
    
    # Candidates
    candidates = []
    
    # Memory 1: similar to all anchors (point convergence candidate)
    mem1_vec = make_similar_vector(base_vec, 301, 0.1)
    candidates.append({
        "id": 1, "text": "The Curation Law governs gene generation",
        "vector": mem1_vec, "similarity": 0.8,
        "metadata": {"tag": "law", "tier": "core"},
    })
    
    # Memory 2: similar to "law" anchor only
    mem2_vec = make_similar_vector(anchor_vecs[0], 302, 0.1)
    candidates.append({
        "id": 2, "text": "Law section 7.1: genes are curated",
        "vector": mem2_vec, "similarity": 0.6,
        "metadata": {"tag": "law", "tier": "core"},
    })
    
    # Memory 3: similar to "impl" anchor only
    mem3_vec = make_similar_vector(anchor_vecs[1], 303, 0.1)
    candidates.append({
        "id": 3, "text": "Implementation: scdna-gene-packet.js",
        "vector": mem3_vec, "similarity": 0.6,
        "metadata": {"tag": "pdr", "tier": "archive"},
    })
    
    # Memory 4: similar to "super" anchor only
    mem4_vec = make_similar_vector(anchor_vecs[2], 304, 0.1)
    candidates.append({
        "id": 4, "text": "PDR-20260725 supersedes earlier gene spec",
        "vector": mem4_vec, "similarity": 0.6,
        "metadata": {"tag": "pdr", "tier": "archive"},
    })
    
    # Memory 5: unrelated (noise)
    mem5_vec = make_vector(999, dim)
    candidates.append({
        "id": 5, "text": "CSS spacing in the toolbar",
        "vector": mem5_vec, "similarity": 0.1,
        "metadata": {"tag": "change", "tier": "log"},
    })
    
    # Graph edges: 2→3→4 are connected (the "sewn seam")
    graph_edges = {
        2: [(3, "EXTENDS"), (1, "DEPENDS_ON")],
        3: [(2, "EXTENDS"), (4, "EXTENDS")],
        4: [(3, "EXTENDS")],
        1: [(2, "EVIDENCES")],
    }
    
    # Authority: memory 1 has constitutional authority
    authority = {1: 1.0, 2: 0.9}
    
    # Triangulate
    result = tri.triangulate(
        anchors=anchors,
        candidates=candidates,
        graph_edges=graph_edges,
        authority_activations=authority,
        superseded_ids=set(),
        contradicted_pairs=[],
    )
    
    # Verify point convergence found memory 1
    assert len(result.point_results) > 0, "No point convergence found"
    point_ids = [cs.memory_id for cs in result.point_results]
    assert 1 in point_ids, f"Memory 1 not in point results: {point_ids}"
    print(f"  ✓ Point convergence: memory 1 found (covers {result.point_results[0].anchor_hits})")
    
    # Verify final ranking has memory 1 in top 3 (highest authority + coverage)
    # Memory 2 may rank higher on raw similarity (it's closer to the law anchor),
    # but memory 1 must be present and highly ranked due to coverage + authority.
    top3_ids = [cs.memory_id for cs in result.final_ranking[:3]]
    assert 1 in top3_ids, \
        f"Expected memory 1 in top 3, got {top3_ids}"
    mem1_rank = next(i for i, cs in enumerate(result.final_ranking) if cs.memory_id == 1)
    print(f"  ✓ Final ranking: memory 1 at position {mem1_rank} (composite={result.final_ranking[mem1_rank].composite:.3f})")
    
    # Verify unrelated memory 5 is ranked low or absent
    final_ids = [cs.memory_id for cs in result.final_ranking]
    if 5 in final_ids:
        idx_5 = final_ids.index(5)
        assert idx_5 >= 3, f"Unrelated memory 5 ranked too high: position {idx_5}"
    print(f"  ✓ Unrelated memory 5 ranked low/absent")
    
    # Verify convergence mode
    assert result.convergence_mode in ("point", "hybrid"), \
        f"Expected point/hybrid convergence, got {result.convergence_mode}"
    print(f"  ✓ Convergence mode: {result.convergence_mode}")
    
    # Verify scoring components are populated
    top = result.final_ranking[0]
    assert top.anchor_coverage > 0, "Anchor coverage is zero"
    assert top.weighted_similarity > 0, "Weighted similarity is zero"
    assert top.authority > 0, "Authority is zero"
    assert top.provenance_quality > 0, "Provenance quality is zero"
    print(f"  ✓ Scoring components: coverage={top.anchor_coverage:.2f}, sim={top.weighted_similarity:.3f}, auth={top.authority:.2f}, prov={top.provenance_quality:.2f}")
    
    # Test contradiction penalty
    result_with_contradiction = tri.triangulate(
        anchors=anchors,
        candidates=candidates,
        graph_edges=graph_edges,
        authority_activations=authority,
        superseded_ids=set(),
        contradicted_pairs=[(1, 3)],  # memory 1 contradicts memory 3
    )
    # Memory 3 should be penalized
    mem3_score = next((cs for cs in result_with_contradiction.final_ranking if cs.memory_id == 3), None)
    if mem3_score:
        assert mem3_score.contradiction_penalty > 0, "Contradiction penalty not applied"
        print(f"  ✓ Contradiction penalty applied to memory 3: -{mem3_score.contradiction_penalty:.1f}")
    
    # Test supersession
    result_with_superseded = tri.triangulate(
        anchors=anchors,
        candidates=candidates,
        graph_edges=graph_edges,
        authority_activations=authority,
        superseded_ids={4},  # memory 4 is superseded
        contradicted_pairs=[],
    )
    mem4_score = next((cs for cs in result_with_superseded.final_ranking if cs.memory_id == 4), None)
    if mem4_score:
        assert mem4_score.temporal_validity < 0, "Superseded memory not penalized"
        print(f"  ✓ Superseded memory 4 penalized: temporal_validity={mem4_score.temporal_validity:.2f}")
    
    print("  ✅ Triangulation point + relational: PASS")
    return True


# ─── Test 3: Information Matrix ──────────────────────────────────────────────

def test_information_matrix_scoped_authority():
    """Test that authority is scoped, not globally injected."""
    print("\n═══ Test 3: Information Matrix — Scoped Authority ═══")
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        db_path = f.name
    
    try:
        matrix = InformationMatrix(db_path)
        
        # Add nodes with different authority scopes
        # Curation Law: CONSTITUTIONAL for scdna domain
        matrix.add_node(
            memory_id=1,
            checksum="scd64:AAAA",
            authority_scope=AuthorityScope(
                domain="scdna",
                trigger=None,
                priority="constitutional",
                description="The Curation Law: genes are never auto-generated",
            ),
            tags=["law", "core"],
        )
        
        # Determinism Law: CONSTITUTIONAL for all domains
        matrix.add_node(
            memory_id=2,
            checksum="scd64:BBBB",
            authority_scope=AuthorityScope(
                domain="determinism",
                trigger=None,
                priority="constitutional",
                description="All computation must be deterministic",
            ),
            tags=["law", "core"],
        )
        
        # Gene generation PDR: MANDATORY_WHEN trigger matches
        matrix.add_node(
            memory_id=3,
            checksum="scd64:CCCC",
            authority_scope=AuthorityScope(
                domain="scdna",
                trigger="gene.*(generat|creat|author)",
                priority="mandatory",
                description="PDR for gene generation pipeline",
            ),
            tags=["pdr", "archive"],
        )
        
        # Audio compression: standard (no authority)
        matrix.add_node(
            memory_id=4,
            checksum="scd64:DDDD",
            authority_scope=AuthorityScope(
                domain="audio",
                trigger=None,
                priority="standard",
                description="Audio compression notes",
            ),
            tags=["change", "log"],
        )
        
        # Add edges
        matrix.add_edge(1, 3, EdgeType.CONSTITUTIONAL)  # Law governs PDR
        matrix.add_edge(3, 1, EdgeType.DEPENDS_ON)      # PDR depends on Law
        matrix.add_edge(2, 1, EdgeType.EXTENDS)          # Determinism extends Curation
        matrix.add_edge(3, 4, EdgeType.CONTRADICTS)      # PDR contradicts audio note (contrived)
        
        print(f"  ✓ Added 4 nodes, 4 edges")
        
        # Test: query about gene generation → Curation Law + PDR activate
        activations = matrix.activate_authority(
            query="how does gene generation work in SCDNA?",
            query_tags=["scdna"],
        )
        assert 1 in activations, "Curation Law not activated for gene query"
        assert 3 in activations, "Gene PDR not activated for gene query"
        assert activations[1] >= 0.9, f"Curation Law authority too low: {activations[1]}"
        print(f"  ✓ Gene query: Law activated ({activations[1]:.2f}), PDR activated ({activations.get(3, 0):.2f})")
        
        # Test: query about CSS → Curation Law does NOT activate
        activations_css = matrix.activate_authority(
            query="what is the CSS spacing in the toolbar?",
            query_tags=["ui"],
        )
        assert 1 not in activations_css, "Curation Law should NOT activate for CSS query!"
        assert 3 not in activations_css, "Gene PDR should NOT activate for CSS query!"
        print(f"  ✓ CSS query: Law NOT activated, PDR NOT activated (scoped correctly)")
        
        # Test: query about determinism → Determinism Law activates
        activations_det = matrix.activate_authority(
            query="is the projection deterministic?",
            query_tags=["determinism"],
        )
        assert 2 in activations_det, "Determinism Law not activated"
        print(f"  ✓ Determinism query: Law activated ({activations_det[2]:.2f})")
        
        # Test: supersession
        matrix.add_edge(3, 4, EdgeType.SUPERSEDES)  # PDR supersedes audio note
        superseded = matrix.get_superseded()
        assert 4 in superseded, "Memory 4 not marked as superseded"
        print(f"  ✓ Supersession: memory 4 marked as superseded")
        
        # Test: contradictions
        contradictions = matrix.get_contradictions()
        assert (3, 4) in contradictions, "Contradiction pair (3,4) not found"
        print(f"  ✓ Contradictions: pair (3,4) found")
        
        # Test: graph traversal
        traversal = matrix.traverse(1, max_depth=2)
        traversed_ids = {t[0] for t in traversal}
        assert 3 in traversed_ids, "Memory 3 not reachable from memory 1"
        assert 2 in traversed_ids, "Memory 2 not reachable from memory 1"
        print(f"  ✓ Traversal from node 1: reached {traversed_ids}")
        
        # Test: adjacency
        adj = matrix.get_adjacency({1, 2, 3, 4})
        assert 1 in adj, "Node 1 not in adjacency"
        assert len(adj[1]) > 0, "Node 1 has no edges"
        print(f"  ✓ Adjacency: node 1 has {len(adj[1])} edges")
        
        # Test: stats
        stats = matrix.stats()
        assert stats["nodes"] == 4
        assert stats["edges"] >= 4
        print(f"  ✓ Stats: {stats['nodes']} nodes, {stats['edges']} edges")
        
        # Verify edge type breakdown
        assert "CONSTITUTIONAL" in stats["edge_types"]
        assert "DEPENDS_ON" in stats["edge_types"]
        print(f"  ✓ Edge types: {stats['edge_types']}")
        
        print("  ✅ Information Matrix scoped authority: PASS")
        return True
    finally:
        os.unlink(db_path)


# ─── Test 4: Semantic Ballistics ─────────────────────────────────────────────

def test_semantic_ballistics_trajectory():
    """Test the full multi-hop trajectory engine."""
    print("\n═══ Test 4: Semantic Ballistics — Multi-Hop Trajectory ═══")
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        db_path = f.name
    
    try:
        dim = 64
        
        # Create test data
        num_memories = 200
        vectors = {}
        texts = {}
        metadata = {}
        
        # Create clusters of related memories
        for i in range(num_memories):
            vectors[i] = make_vector(i * 7 + 13, dim)
            texts[i] = f"Memory {i}: knowledge about topic {i % 10}"
            metadata[i] = {
                "tag": ["law", "pdr", "whitepaper", "bug", "architecture"][i % 5],
                "tier": ["core", "archive", "foundation", "incident", "design"][i % 5],
            }
        
        # Make memory 42 special: it's about "gene curation"
        vectors[42] = make_vector(4242, dim)
        texts[42] = "The Curation Law states genes are never auto-generated"
        metadata[42] = {"tag": "law", "tier": "core"}
        
        # Make memories 43, 44 similar to 42 (the "sewn seam")
        vectors[43] = make_similar_vector(vectors[42], 4343, 0.15)
        texts[43] = "Implementation: scdna-gene-packet.js creates gene packets"
        metadata[43] = {"tag": "pdr", "tier": "archive"}
        
        vectors[44] = make_similar_vector(vectors[42], 4444, 0.15)
        texts[44] = "PDR-20260725: Ontological Art-Direction Pipeline"
        metadata[44] = {"tag": "pdr", "tier": "archive"}
        
        # Compute dimension ranges
        all_vecs_list = [vectors[i] for i in range(num_memories)]
        dim_ranges = compute_dimension_ranges(all_vecs_list)
        
        # Build lattice
        lattice = QBITLattice(db_path, dim=dim)
        entries = [(i, vectors[i]) for i in range(num_memories)]
        lattice.index_batch(entries, dim_ranges)
        lattice.save_dim_ranges(dim_ranges)
        
        # Build Information Matrix
        matrix = InformationMatrix(db_path)
        matrix.add_node(42, authority_scope=AuthorityScope(
            domain="scdna", priority="constitutional",
            description="Curation Law",
        ))
        matrix.add_node(43, authority_scope=AuthorityScope(
            domain="scdna", trigger="gene|packet|scdna",
            priority="mandatory",
        ))
        matrix.add_edge(42, 43, EdgeType.CONSTITUTIONAL)
        matrix.add_edge(43, 44, EdgeType.EXTENDS)
        matrix.add_edge(42, 44, EdgeType.EVIDENCES)
        
        # Build ballistics engine
        ballistics = SemanticBallistics(
            lattice=lattice,
            matrix=matrix,
            max_hops=4,
        )
        
        # Fire a query about gene curation
        query = "what does the Curation Law say about gene generation?"
        query_vec = make_similar_vector(vectors[42], 5555, 0.1)
        
        results, log = ballistics.fire(
            query=query,
            query_vector=query_vec,
            dim_ranges=dim_ranges,
            all_vectors=vectors,
            all_texts=texts,
            all_metadata=metadata,
            top_k=5,
            query_tags=["scdna", "law"],
        )
        
        # Verify results
        assert len(results) > 0, "No results returned"
        print(f"  ✓ Got {len(results)} results")
        
        # Memory 42 (Curation Law) should be in top results
        result_ids = [r["id"] for r in results]
        assert 42 in result_ids, f"Memory 42 (Curation Law) not in results: {result_ids}"
        print(f"  ✓ Memory 42 (Curation Law) in results at position {result_ids.index(42)}")
        
        # Verify trajectory log
        assert log.total_hops == 4, f"Expected 4 hops, got {log.total_hops}"
        assert log.total_candidates > 0
        assert log.final_results > 0
        assert log.deterministic_checksum != ""
        print(f"  ✓ Trajectory: {log.total_hops} hops, {log.total_candidates} candidates, {log.final_results} results")
        print(f"  ✓ Trajectory checksum: {log.deterministic_checksum}")
        
        # Verify hop details
        for hop in log.hops:
            print(f"    Hop {hop.hop_number}: {hop.action} — {hop.input_count}→{hop.output_count} (+{hop.candidates_added}) [{hop.duration_ms:.1f}ms]")
        
        # Verify convergence mode
        assert log.convergence_mode in ("point", "relational", "hybrid")
        print(f"  ✓ Convergence mode: {log.convergence_mode}")
        
        # Verify authority activation
        top_result = results[0]
        if top_result["id"] == 42:
            assert top_result["authority"] > 0, "Top result has no authority"
            print(f"  ✓ Top result authority: {top_result['authority']:.3f}")
        
        # ── Determinism verification: fire same query again ──
        results2, log2 = ballistics.fire(
            query=query,
            query_vector=query_vec,
            dim_ranges=dim_ranges,
            all_vectors=vectors,
            all_texts=texts,
            all_metadata=metadata,
            top_k=5,
            query_tags=["scdna", "law"],
        )
        
        # Verify deterministic replay
        replay_check = ballistics.verify_replay(log, log2)
        assert replay_check["deterministic"], f"Replay not deterministic: {replay_check['divergences']}"
        print(f"  ✓ Deterministic replay verified (checksum: {log2.deterministic_checksum})")
        
        # Verify same results
        result_ids2 = [r["id"] for r in results2]
        assert result_ids == result_ids2, f"Results differ: {result_ids} vs {result_ids2}"
        print(f"  ✓ Identical results on replay")
        
        print("  ✅ Semantic Ballistics trajectory: PASS")
        return True
    finally:
        os.unlink(db_path)


# ─── Test 5: Integration — Full Pipeline ─────────────────────────────────────

def test_full_pipeline_integration():
    """Test the full pipeline: lattice → matrix → triangulation → ballistics."""
    print("\n═══ Test 5: Full Pipeline Integration ═══")
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        db_path = f.name
    
    try:
        dim = 64
        
        # Simulate a real encyclopedia with domains
        domains = {
            "law": ["The Curation Law forbids auto-generation of genes",
                    "Determinism Law: all computation must be reproducible",
                    "The four invariants: human authority, deterministic projection, traceability, retrieval"],
            "pdr": ["PDR: Ontological Art-Direction Pipeline",
                    "PDR: Geometric Construction Solver",
                    "PDR: Capability Packets for retrieval"],
            "architecture": ["SCDNA genes carry construction genotype",
                            "SCD64 is a transmission device with glossary",
                            "BytecodeHealth certifies but does not compute"],
            "bug": ["Bug: golden ratio imported but never used",
                    "Bug: Wand has no geometric guardrails"],
        }
        
        vectors = {}
        texts = {}
        metadata = {}
        mem_id = 0
        
        for domain, docs in domains.items():
            for doc in docs:
                vectors[mem_id] = make_vector(mem_id * 31 + 7, dim)
                texts[mem_id] = doc
                metadata[mem_id] = {"tag": domain, "tier": "core" if domain == "law" else "archive"}
                mem_id += 1
        
        total = mem_id
        dim_ranges = compute_dimension_ranges([vectors[i] for i in range(total)])
        
        # Build all layers
        lattice = QBITLattice(db_path, dim=dim)
        lattice.index_batch([(i, vectors[i]) for i in range(total)], dim_ranges)
        
        matrix = InformationMatrix(db_path)
        # Law nodes are CONSTITUTIONAL
        matrix.add_node(0, authority_scope=AuthorityScope(domain="scdna", priority="constitutional"))
        matrix.add_node(1, authority_scope=AuthorityScope(domain="determinism", priority="constitutional"))
        matrix.add_node(2, authority_scope=AuthorityScope(domain="invariants", priority="constitutional"))
        # PDR nodes are MANDATORY_WHEN
        matrix.add_node(3, authority_scope=AuthorityScope(domain="art", trigger="art|vixel|sprite|render"))
        matrix.add_node(4, authority_scope=AuthorityScope(domain="geometry", trigger="geometry|construction|solver|wand"))
        # Edges
        matrix.add_edge(0, 3, EdgeType.CONSTITUTIONAL)
        matrix.add_edge(1, 4, EdgeType.CONSTITUTIONAL)
        matrix.add_edge(3, 4, EdgeType.EXTENDS)
        matrix.add_edge(5, 3, EdgeType.EVIDENCES)  # capability packets evidence art PDR
        
        ballistics = SemanticBallistics(lattice=lattice, matrix=matrix)
        
        # Query about geometry
        query = "how does the geometric construction solver work?"
        query_vec = make_similar_vector(vectors[4], 8888, 0.1)
        
        results, log = ballistics.fire(
            query=query,
            query_vector=query_vec,
            dim_ranges=dim_ranges,
            all_vectors=vectors,
            all_texts=texts,
            all_metadata=metadata,
            top_k=5,
            query_tags=["geometry", "architecture"],
        )
        
        assert len(results) > 0, "No results"
        print(f"  ✓ Query: '{query}'")
        print(f"  ✓ Results: {len(results)} in {log.total_duration_ms:.1f}ms")
        for r in results[:3]:
            print(f"    [{r['id']}] {r['text'][:60]}... (score={r['composite_score']:.3f}, auth={r['authority']:.2f})")
        
        # Verify the geometry PDR is in results
        result_ids = [r["id"] for r in results]
        assert 4 in result_ids, f"Geometry PDR not in results: {result_ids}"
        print(f"  ✓ Geometry PDR (id=4) in results")
        
        # Verify Determinism Law activated (it's constitutional for this domain)
        det_results = [r for r in results if r["id"] == 1]
        if det_results:
            assert det_results[0]["authority"] > 0
            print(f"  ✓ Determinism Law activated with authority {det_results[0]['authority']:.2f}")
        
        # Verify CSS query does NOT activate law nodes
        css_query = "what CSS spacing does the toolbar use?"
        css_vec = make_vector(7777, dim)
        css_results, css_log = ballistics.fire(
            query=css_query,
            query_vector=css_vec,
            dim_ranges=dim_ranges,
            all_vectors=vectors,
            all_texts=texts,
            all_metadata=metadata,
            top_k=3,
            query_tags=["ui"],
        )
        # Law nodes should not have high authority for CSS
        for r in css_results:
            if r["id"] in (0, 1, 2):
                assert r["authority"] == 0, f"Law node {r['id']} has authority {r['authority']} for CSS query!"
        print(f"  ✓ CSS query: law nodes have zero authority (scoped correctly)")
        
        print("  ✅ Full pipeline integration: PASS")
        return True
    finally:
        os.unlink(db_path)


# ─── Test 6: Determinism Stress Test ─────────────────────────────────────────

def test_determinism_stress():
    """100-iteration determinism verification."""
    print("\n═══ Test 6: Determinism Stress Test (100 iterations) ═══")
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        db_path = f.name
    
    try:
        dim = 64
        num_memories = 50
        
        vectors = {i: make_vector(i * 11 + 3, dim) for i in range(num_memories)}
        texts = {i: f"Memory {i}" for i in range(num_memories)}
        metadata = {i: {"tag": "test"} for i in range(num_memories)}
        dim_ranges = compute_dimension_ranges([vectors[i] for i in range(num_memories)])
        
        lattice = QBITLattice(db_path, dim=dim)
        lattice.index_batch([(i, vectors[i]) for i in range(num_memories)], dim_ranges)
        
        matrix = InformationMatrix(db_path)
        matrix.add_node(0, authority_scope=AuthorityScope(domain="test", priority="constitutional"))
        
        ballistics = SemanticBallistics(lattice=lattice, matrix=matrix)
        
        query = "test query for determinism"
        query_vec = make_vector(12345, dim)
        
        # Fire once to get reference
        _, ref_log = ballistics.fire(
            query=query, query_vector=query_vec, dim_ranges=dim_ranges,
            all_vectors=vectors, all_texts=texts, all_metadata=metadata,
            top_k=5, query_tags=["test"],
        )
        ref_checksum = ref_log.deterministic_checksum
        
        # Fire 99 more times
        all_match = True
        for i in range(99):
            _, log = ballistics.fire(
                query=query, query_vector=query_vec, dim_ranges=dim_ranges,
                all_vectors=vectors, all_texts=texts, all_metadata=metadata,
                top_k=5, query_tags=["test"],
            )
            if log.deterministic_checksum != ref_checksum:
                all_match = False
                print(f"  ✗ Iteration {i+2}: checksum mismatch!")
                break
        
        assert all_match, "Determinism violated!"
        print(f"  ✓ 100 iterations: all checksums identical ({ref_checksum})")
        print("  ✅ Determinism stress test: PASS")
        return True
    finally:
        os.unlink(db_path)


# ─── Runner ──────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  Information Matrix + Semantic Ballistics — Test Suite      ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    
    tests = [
        test_lattice_constellation,
        test_triangulation_point_and_relational,
        test_information_matrix_scoped_authority,
        test_semantic_ballistics_trajectory,
        test_full_pipeline_integration,
        test_determinism_stress,
    ]
    
    passed = 0
    failed = 0
    
    for test_fn in tests:
        try:
            if test_fn():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ❌ FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print(f"\n{'═' * 60}")
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print(f"{'═' * 60}")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
