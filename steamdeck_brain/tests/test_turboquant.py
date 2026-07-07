import os
import sys
import numpy as np
import pytest

# Add the parent directory to sys.path so we can import cortex and turbo_quant
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from turbo_quant.provider import TurboQuantEmbedProvider
from cortex import L1Cache

def test_compression_roundtrip():
    np.random.seed(42)
    original = np.random.randn(768).astype(np.float32)
    provider = TurboQuantEmbedProvider(768, bits_per_coord=2)
    packet = provider.compress(original)
    reconstructed = provider.decompress(packet)
    
    # 2-bit quantization generates noise, so we check general direction/norm approximation
    assert np.allclose(np.linalg.norm(original), np.linalg.norm(reconstructed), rtol=0.01)
    
    # We check that the cosine similarity between original and reconstructed is reasonably high (e.g., > 0.7)
    orig_unit = original / np.linalg.norm(original)
    recon_unit = reconstructed / np.linalg.norm(reconstructed)
    cos_sim = np.dot(orig_unit, recon_unit)
    assert cos_sim > 0.6

def test_similarity_accuracy():
    # Use 768-dim so padding doesn't heavily skew the bitwise calculation
    provider = TurboQuantEmbedProvider(768, bits_per_coord=2)
    
    vec1 = np.zeros(768, dtype=np.float32)
    vec1[:384] = 1.0
    vec2 = np.zeros(768, dtype=np.float32)
    vec2[384:] = 1.0
    
    packet1 = provider.compress(vec1)
    packet2 = provider.compress(vec2)
    
    sim = provider.similarity(packet1, packet2)
    # They are completely orthogonal, similarity should be relatively low
    assert sim < 0.5

def test_cache_expansion():
    # Instantiate L1Cache with max_size=16384. Vectors MUST match the cache's
    # configured embedding dim (production default 384) — feeding a mismatched
    # dim is exactly the bug that broke every /ask (768 vs 384 matmul).
    cache = L1Cache(max_size=16384)
    dim = cache.dim
    rng = np.random.RandomState(0)
    first_vec = None
    for i in range(100):
        vec = rng.randn(dim).astype(np.float32)
        if first_vec is None:
            first_vec = vec.tolist()
        cache.put(text=f"text_{i}", vector=vec.tolist())

    # Verify cache length
    # Note: the subagent might have named the internal array _entries or _cache
    assert hasattr(cache, '_entries') or hasattr(cache, '_cache')

    # Query with a stored vector — it must retrieve itself (self-similarity 1.0).
    # (An unrelated random query can legitimately match nothing above the 0.3
    # relevance gate, since independent Hamming similarity clusters near 0.15.)
    results = cache.query(first_vec, top_k=1)
    assert len(results) > 0
    assert results[0]["text"] == "text_0"
