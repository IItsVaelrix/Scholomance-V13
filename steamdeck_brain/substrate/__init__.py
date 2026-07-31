#!/usr/bin/env python3
"""
substrate/ — The Information Matrix + Semantic Ballistics Package
=================================================================
Upgrades the flat 4-bit substrate from O(n) scan to indexed, multi-hop,
priority-aware retrieval.

Four layers:
  1. lattice_index.py       — QBIT Lattice: constellation of partial addresses
  2. triangulation.py       — Multi-anchor vertex triangulation (point + relational)
  3. information_matrix.py  — Knowledge graph with scoped authority edges
  4. semantic_ballistics.py — Multi-hop trajectory engine (the "bullet path")

Design principles:
  - Pure Python (no numpy dependency)
  - Deterministic (same inputs → same outputs, always)
  - The lattice is a constellation of partial addresses, not one postal code
  - Triangulation supports sewn seams, not just single needles
  - Authority has an activation surface, not a global shout
"""

from .lattice_index import QBITLattice
from .triangulation import Triangulator, ConvergenceResult
from .information_matrix import InformationMatrix, EdgeType, AuthorityScope
from .semantic_ballistics import SemanticBallistics, TrajectoryLog

__all__ = [
    "QBITLattice",
    "Triangulator",
    "ConvergenceResult",
    "InformationMatrix",
    "EdgeType",
    "AuthorityScope",
    "SemanticBallistics",
    "TrajectoryLog",
]
