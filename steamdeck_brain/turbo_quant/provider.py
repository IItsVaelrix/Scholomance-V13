import numpy as np
from typing import Optional
from .packet import TurboQuantPacket
from .rotation import generate_rotation_matrix

class TurboQuantEmbedProvider:
    def __init__(self, embedding_dim: int, bits_per_coord: int = 2, seed: int = 42):
        self.embedding_dim = embedding_dim
        self.bits_per_coord = bits_per_coord
        self.Q = generate_rotation_matrix(embedding_dim, seed=seed)
        
    def compress(self, embedding: np.ndarray, original_id: str = "") -> TurboQuantPacket:
        # Polar Decomposition
        norm = np.linalg.norm(embedding)
        if norm == 0:
            unit_vector = embedding
        else:
            unit_vector = embedding / norm
            
        # Randomized Orthogonal Rotation
        rotated = unit_vector @ self.Q
        
        # 2-bit Quantization Mapping
        # A unit vector in d dimensions has std deviation 1/sqrt(d).
        # We scale by sqrt(d) to map the distribution properly.
        scaled = rotated * np.sqrt(self.embedding_dim)
        quantized = np.round(scaled)
        clamped = np.clip(quantized, -2, 2)
        
        # Skip 0 to preserve entropy (map to 1 arbitrarily)
        clamped[clamped == 0] = 1
        
        mapped = np.zeros_like(clamped, dtype=np.uint8)
        mapped[clamped == -2] = 0
        mapped[clamped == -1] = 1
        mapped[clamped == 1] = 2
        mapped[clamped == 2] = 3
        
        # Bit Packing (2 bits per coord)
        rem = len(mapped) % 4
        if rem != 0:
            mapped = np.pad(mapped, (0, 4 - rem), 'constant')
            
        reshaped = mapped.reshape(-1, 4)
        bytes_arr = (reshaped[:, 0] << 6) | (reshaped[:, 1] << 4) | (reshaped[:, 2] << 2) | reshaped[:, 3]
        packed_bits = bytes_arr.astype(np.uint8).tobytes()
        
        return TurboQuantPacket(norm=float(norm), packed_bits=packed_bits, original_id=original_id)

    def decompress(self, packet: TurboQuantPacket) -> np.ndarray:
        bytes_arr = np.frombuffer(packet.packed_bits, dtype=np.uint8)
        val0 = (bytes_arr >> 6) & 0x03
        val1 = (bytes_arr >> 4) & 0x03
        val2 = (bytes_arr >> 2) & 0x03
        val3 = bytes_arr & 0x03
        
        mapped = np.stack((val0, val1, val2, val3), axis=-1).flatten()
        mapped = mapped[:self.embedding_dim]
        
        clamped = np.zeros_like(mapped, dtype=np.float32)
        clamped[mapped == 0] = -2
        clamped[mapped == 1] = -1
        clamped[mapped == 2] = 1
        clamped[mapped == 3] = 2
        
        rotated_approx = clamped / np.sqrt(self.embedding_dim)
        unit_approx = rotated_approx @ self.Q.T
        norm_approx = np.linalg.norm(unit_approx)
        if norm_approx > 0:
            unit_approx = unit_approx / norm_approx
        return unit_approx * packet.norm

    def bitwise_similarity(self, a: TurboQuantPacket, b: TurboQuantPacket) -> float:
        return self.similarity(a, b)

    def similarity(self, a: TurboQuantPacket, b: TurboQuantPacket) -> float:
        """Bitwise Hamming similarity."""
        a_bytes = np.frombuffer(a.packed_bits, dtype=np.uint8)
        b_bytes = np.frombuffer(b.packed_bits, dtype=np.uint8)
        
        xor_bytes = np.bitwise_xor(a_bytes, b_bytes)
        hamming_dist = np.sum(np.unpackbits(xor_bytes))
        
        total_bits = len(a.packed_bits) * 8
        sim = 1.0 - (2.0 * hamming_dist / total_bits)
        return float(sim)
