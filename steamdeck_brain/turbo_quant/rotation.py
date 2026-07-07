import numpy as np

def generate_rotation_matrix(dim: int, seed: int = 42) -> np.ndarray:
    """Generate a fixed random orthogonal matrix for spreading outliers."""
    rng = np.random.RandomState(seed)
    H = rng.randn(dim, dim)
    Q, R = np.linalg.qr(H)
    # Canonicalize QR sign ambiguity so the matrix is deterministic.
    d = np.diagonal(R)
    ph = d / np.abs(d)
    Q = np.multiply(Q, ph, Q)
    # Force a proper rotation (det == +1): sign-canonicalization above still
    # leaves an even/odd reflection, so flip one column when det is negative.
    if np.linalg.det(Q) < 0:
        Q[:, 0] = -Q[:, 0]
    return Q.astype(np.float32)
