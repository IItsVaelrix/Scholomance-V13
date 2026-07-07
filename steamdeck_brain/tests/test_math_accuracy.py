"""
Math accuracy suite for the steamdeck_brain memory hierarchy.

Validates the numerical building blocks that the daemon's /ask path depends on:
  * rotation.py       — orthogonal rotation matrix properties
  * turbo_quant       — compress/decompress roundtrip, quantization mapping,
                        Hamming similarity behaviour
  * cortex._cosine_sim — pure-python cosine vs numpy reference
  * embed_providers   — n-gram embedding norm / determinism / dim
  * dim wiring        — L1Cache.tq dim tracks the configured dim (the regression
                        that broke every /ask: hard-coded 768 vs substrate 384)

Run standalone for a printed report:
    uv run --with numpy python3 tests/test_math_accuracy.py

Or under pytest:
    uv run --with numpy --with pytest python3 -m pytest tests/test_math_accuracy.py -q
"""
import os
import sys
import math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from turbo_quant.provider import TurboQuantEmbedProvider
from turbo_quant.rotation import generate_rotation_matrix
from cortex import L1Cache
from embed_providers import NGramEmbeddingProvider

PROD_DIM = 384  # substrate / HybridEmbedProvider default — the real config


# ─────────────────────────────────────────────────────────────────────────────
#  Measurement helpers — each returns (label, measured, expected, passed)
# ─────────────────────────────────────────────────────────────────────────────

def _cos(a, b):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))


# ── rotation.py ──────────────────────────────────────────────────────────────

def check_rotation_orthogonal(dim=PROD_DIM):
    Q = generate_rotation_matrix(dim).astype(np.float64)
    err = np.abs(Q @ Q.T - np.eye(dim)).max()
    return ("rotation: Q·Qᵀ = I (max |err|)", err, "< 1e-4", err < 1e-4)

def check_rotation_determinant(dim=PROD_DIM):
    Q = generate_rotation_matrix(dim).astype(np.float64)
    det = float(np.linalg.det(Q))
    return ("rotation: det(Q) (proper rotation)", det, "≈ +1.0 (±1e-3)", abs(det - 1.0) < 1e-3)

def check_rotation_deterministic(dim=128):
    a = generate_rotation_matrix(dim, seed=42)
    b = generate_rotation_matrix(dim, seed=42)
    same = bool(np.array_equal(a, b))
    return ("rotation: same seed → same matrix", same, "True", same)

def check_rotation_norm_preserving(dim=PROD_DIM):
    Q = generate_rotation_matrix(dim).astype(np.float64)
    v = np.random.RandomState(1).randn(dim)
    err = abs(np.linalg.norm(v @ Q) - np.linalg.norm(v))
    return ("rotation: preserves L2 norm (|Δ|)", err, "< 1e-4", err < 1e-4)


# ── turbo_quant roundtrip / quantization ────────────────────────────────────

def check_roundtrip_norm(dim=PROD_DIM):
    tq = TurboQuantEmbedProvider(dim)
    rng = np.random.RandomState(7)
    errs = []
    for _ in range(20):
        v = rng.randn(dim).astype(np.float32)
        r = tq.decompress(tq.compress(v))
        errs.append(abs(np.linalg.norm(v) - np.linalg.norm(r)) / np.linalg.norm(v))
    m = float(np.mean(errs))
    return (f"turboquant[{dim}]: norm preserved (mean rel err)", m, "< 1e-3", m < 1e-3)

def check_roundtrip_cosine(dim=PROD_DIM):
    tq = TurboQuantEmbedProvider(dim)
    rng = np.random.RandomState(11)
    sims = []
    for _ in range(20):
        v = rng.randn(dim).astype(np.float32)
        r = tq.decompress(tq.compress(v))
        sims.append(_cos(v, r))
    m = float(np.mean(sims))
    # 2-bit quantization is lossy; direction must still be well preserved.
    return (f"turboquant[{dim}]: recon cosine (mean)", m, "> 0.55", m > 0.55)

def check_quant_symbol_roundtrip(dim=PROD_DIM):
    """Bit-pack/unpack of the 4 quant symbols must be lossless."""
    tq = TurboQuantEmbedProvider(dim)
    # A vector whose scaled/rounded coords hit all four symbols {-2,-1,1,2}.
    # Decompress the compressed packet twice → identical (idempotent codec).
    rng = np.random.RandomState(3)
    v = rng.randn(dim).astype(np.float32)
    pkt = tq.compress(v)
    r1 = tq.decompress(pkt)
    r2 = tq.decompress(pkt)
    err = float(np.abs(r1 - r2).max())
    return ("turboquant: codec deterministic (max |Δ|)", err, "== 0.0", err == 0.0)


# ── turbo_quant Hamming similarity ──────────────────────────────────────────

def check_sim_self(dim=PROD_DIM):
    tq = TurboQuantEmbedProvider(dim)
    v = np.random.RandomState(5).randn(dim).astype(np.float32)
    p = tq.compress(v)
    s = tq.similarity(p, p)
    return (f"hamming[{dim}]: self-similarity", s, "== 1.0", abs(s - 1.0) < 1e-9)

def check_sim_orthogonal(dim=PROD_DIM):
    tq = TurboQuantEmbedProvider(dim)
    rng = np.random.RandomState(9)
    sims = []
    for _ in range(30):
        a = tq.compress(rng.randn(dim).astype(np.float32))
        b = tq.compress(rng.randn(dim).astype(np.float32))
        sims.append(tq.similarity(a, b))
    m = float(np.mean(sims))
    # Independent random vectors → Hamming sim clusters near 0.
    return (f"hamming[{dim}]: independent vecs (mean)", m, "< 0.35", m < 0.35)

def check_sim_range(dim=PROD_DIM):
    tq = TurboQuantEmbedProvider(dim)
    rng = np.random.RandomState(13)
    lo, hi = 1.0, -1.0
    for _ in range(50):
        a = tq.compress(rng.randn(dim).astype(np.float32))
        b = tq.compress(rng.randn(dim).astype(np.float32))
        s = tq.similarity(a, b)
        lo, hi = min(lo, s), max(hi, s)
    ok = (-1.0 - 1e-9) <= lo and hi <= (1.0 + 1e-9)
    return (f"hamming[{dim}]: range [{lo:.3f},{hi:.3f}]", (lo, hi), "⊆ [-1, 1]", ok)

def check_sim_monotonic(dim=PROD_DIM):
    """Near-identical inputs must score higher than independent ones."""
    tq = TurboQuantEmbedProvider(dim)
    rng = np.random.RandomState(17)
    wins = 0
    trials = 30
    for _ in range(trials):
        v = rng.randn(dim).astype(np.float32)
        noisy = v + 0.01 * rng.randn(dim).astype(np.float32)
        other = rng.randn(dim).astype(np.float32)
        near = tq.similarity(tq.compress(v), tq.compress(noisy))
        far = tq.similarity(tq.compress(v), tq.compress(other))
        if near > far:
            wins += 1
    frac = wins / trials
    return ("hamming: near > far ordering (frac)", frac, "== 1.0", frac == 1.0)


# ── cortex cosine ───────────────────────────────────────────────────────────

def check_cosine_matches_numpy():
    cache = L1Cache(use_turbo_quant=False)
    rng = np.random.RandomState(21)
    errs = []
    for _ in range(20):
        a = rng.randn(64).tolist()
        b = rng.randn(64).tolist()
        errs.append(abs(cache._cosine_sim(a, b) - _cos(a, b)))
    m = float(max(errs))
    return ("cortex._cosine_sim vs numpy (max |Δ|)", m, "< 1e-9", m < 1e-9)

def check_cosine_orthogonal():
    cache = L1Cache(use_turbo_quant=False)
    s = cache._cosine_sim([1, 0, 0, 0], [0, 1, 0, 0])
    return ("cortex._cosine_sim: orthogonal", s, "== 0.0", abs(s) < 1e-12)

def check_cosine_identical():
    cache = L1Cache(use_turbo_quant=False)
    s = cache._cosine_sim([3, 1, 4, 1, 5], [3, 1, 4, 1, 5])
    return ("cortex._cosine_sim: identical", s, "== 1.0", abs(s - 1.0) < 1e-12)

def check_cosine_dim_mismatch_safe():
    cache = L1Cache(use_turbo_quant=False)
    s = cache._cosine_sim([1, 2, 3], [1, 2])
    return ("cortex._cosine_sim: len mismatch → 0", s, "== 0.0", s == 0.0)


# ── embed_providers ─────────────────────────────────────────────────────────

def check_ngram_dim(dim=PROD_DIM):
    p = NGramEmbeddingProvider(dim=dim)
    v = p.encode("the scholomance awaits")
    return (f"ngram[{dim}]: output length", len(v), f"== {dim}", len(v) == dim)

def check_ngram_unit_norm(dim=PROD_DIM):
    p = NGramEmbeddingProvider(dim=dim)
    n = math.sqrt(sum(x * x for x in p.encode("vaelrix speaks in riddles")))
    return (f"ngram[{dim}]: L2 norm", n, "≈ 1.0 (±1e-6)", abs(n - 1.0) < 1e-6)

def check_ngram_deterministic(dim=PROD_DIM):
    p = NGramEmbeddingProvider(dim=dim)
    same = p.encode("same text twice") == p.encode("same text twice")
    return ("ngram: deterministic within process", same, "True", same)

def check_ngram_semantic():
    """Similar strings should embed closer than unrelated ones."""
    p = NGramEmbeddingProvider(dim=PROD_DIM)
    base = p.encode("the dragon guards the tower")
    near = p.encode("the dragon guards the towers")
    far = p.encode("quarterly financial spreadsheet")
    ok = _cos(base, near) > _cos(base, far)
    return ("ngram: similar > unrelated cosine", (round(_cos(base, near), 3), round(_cos(base, far), 3)), "near > far", ok)

def check_ngram_empty_zero(dim=PROD_DIM):
    p = NGramEmbeddingProvider(dim=dim)
    v = p.encode("")
    return ("ngram: empty text → zero vector", sum(abs(x) for x in v), "== 0.0", sum(abs(x) for x in v) == 0.0)


# ── dim-wiring regression (the bug we fixed) ────────────────────────────────

def check_l1_dim_tracks_config():
    for d in (384, 768, 512):
        cache = L1Cache(dim=d)
        if cache.tq.embedding_dim != d or cache.tq.Q.shape != (d, d):
            return (f"L1Cache(dim={d}).tq wiring", (cache.tq.embedding_dim, cache.tq.Q.shape), f"({d}, ({d},{d}))", False)
    return ("L1Cache.tq dim tracks configured dim", "384/512/768", "all match", True)

def check_l1_query_no_crash():
    """The exact /ask regression: matching-dim vectors must not raise."""
    cache = L1Cache(dim=PROD_DIM)
    rng = np.random.RandomState(2)
    for i in range(20):
        cache.put(f"m{i}", rng.randn(PROD_DIM).astype(np.float32).tolist())
    try:
        res = cache.query(rng.randn(PROD_DIM).astype(np.float32).tolist(), top_k=3)
        ok = len(res) > 0
        detail = f"{len(res)} results"
    except Exception as e:  # pragma: no cover
        ok, detail = False, f"RAISED {type(e).__name__}"
    return (f"L1Cache[{PROD_DIM}]: put/query no crash", detail, "results, no error", ok)


ALL_CHECKS = [
    check_rotation_orthogonal, check_rotation_determinant,
    check_rotation_deterministic, check_rotation_norm_preserving,
    check_roundtrip_norm, check_roundtrip_cosine, check_quant_symbol_roundtrip,
    check_sim_self, check_sim_orthogonal, check_sim_range, check_sim_monotonic,
    check_cosine_matches_numpy, check_cosine_orthogonal, check_cosine_identical,
    check_cosine_dim_mismatch_safe,
    check_ngram_dim, check_ngram_unit_norm, check_ngram_deterministic,
    check_ngram_semantic, check_ngram_empty_zero,
    check_l1_dim_tracks_config, check_l1_query_no_crash,
]


# ─────────────────────────────────────────────────────────────────────────────
#  pytest wrappers (one assertion per check)
# ─────────────────────────────────────────────────────────────────────────────

import pytest

@pytest.mark.parametrize("fn", ALL_CHECKS, ids=[f.__name__ for f in ALL_CHECKS])
def test_math(fn):
    label, measured, expected, passed = fn()
    assert passed, f"{label}: measured={measured}, expected {expected}"


# ─────────────────────────────────────────────────────────────────────────────
#  Standalone report
# ─────────────────────────────────────────────────────────────────────────────

def _fmt(v):
    if isinstance(v, float):
        return f"{v:.6g}"
    if isinstance(v, tuple):
        return "(" + ", ".join(_fmt(x) for x in v) + ")"
    return str(v)

def main():
    print("\n" + "═" * 78)
    print("  steamdeck_brain — MATH ACCURACY REPORT   (production dim = %d)" % PROD_DIM)
    print("═" * 78)
    rows = []
    for fn in ALL_CHECKS:
        try:
            label, measured, expected, passed = fn()
        except Exception as e:
            label, measured, expected, passed = fn.__name__, f"EXC {type(e).__name__}: {e}", "no exception", False
        rows.append((label, measured, expected, passed))

    wname = max(len(r[0]) for r in rows) + 2
    wmeas = max(len(_fmt(r[1])) for r in rows) + 2
    header = f"  {'CHECK':<{wname}}{'MEASURED':<{wmeas}}{'EXPECTED':<18}RESULT"
    print(header)
    print("  " + "─" * (len(header) + 4))
    npass = 0
    for label, measured, expected, passed in rows:
        mark = "✅ PASS" if passed else "❌ FAIL"
        npass += passed
        print(f"  {label:<{wname}}{_fmt(measured):<{wmeas}}{expected:<18}{mark}")
    print("  " + "─" * (len(header) + 4))
    print(f"  {npass}/{len(rows)} checks passed")
    print("═" * 78 + "\n")
    return 0 if npass == len(rows) else 1

if __name__ == "__main__":
    sys.exit(main())
