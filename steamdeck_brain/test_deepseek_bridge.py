import os
import sys

# Fake an API key just to test if the initialization works, but then we will get a real API error.
os.environ["DEEPSEEK_API_KEY"] = os.environ.get("DEEPSEEK_API_KEY", "test_key")

from steamdeck_brain import DeepSeekBridge

try:
    bridge = DeepSeekBridge()
    print("Bridge initialized successfully.")
    # Try an empty generate to see if we get an auth error
    print("Testing generate...")
    res = bridge.generate("Hello")
    print("Result:", res)
except SystemExit:
    print("Failed to initialize due to missing key.")
