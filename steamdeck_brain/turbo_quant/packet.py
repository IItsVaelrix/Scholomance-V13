import numpy as np
from dataclasses import dataclass

@dataclass
class TurboQuantPacket:
    norm: float
    packed_bits: bytes
    original_id: str = ""
