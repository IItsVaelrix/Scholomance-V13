import sys
import numpy as np
import warnings
warnings.filterwarnings('ignore')

from steamdeck_brain.cortex import Cortex
from steamdeck_brain.turbo_quant import TurboQuantEmbedProvider

def test():
    print("Booting Cortex...")
    cortex = Cortex(substrate_db="test.sqlite", dim=384, l1_size=16)
    
    print("Cortex L1 size:", cortex.l1.max_size)
    print("Adding memory via learn...")
    cortex.learn("test query", "test response")
    print("Learn success!")
    
    print("Retrieving...")
    memories, context = cortex.retrieve("test query")
    print("Context:", context)

if __name__ == '__main__':
    test()
