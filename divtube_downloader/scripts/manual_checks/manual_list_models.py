"""Manual check: which models does the configured GEMINI_API_KEY actually see?

Run from the module root:

    python -m scripts.manual_checks.manual_list_models

Was `list_models.py` at the module root. Two fixes:

* The key used to be interpolated into the URL query string
  (`/v1beta/models?key=<KEY>`). Query strings are logged by proxies, echoed in
  urllib debug output and appear in exception text, so a credential there is a
  credential that has leaked. The v1beta API accepts the same credential as the
  `x-goog-api-key` header.
* `urlopen()` had no `timeout`, so a wedged provider hung the script forever.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from _env import load_env

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

load_env()
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise SystemExit("GEMINI_API_KEY not set - add it to .env or your environment")

req = urllib.request.Request(ENDPOINT, method="GET")
req.add_header("x-goog-api-key", api_key)

try:
    with urllib.request.urlopen(req, timeout=30) as response:
        models = json.loads(response.read().decode("utf-8"))
        for m in models.get("models", []):
            print(m["name"])
except urllib.error.HTTPError as e:
    print("API Error:", e.code, e.read().decode("utf-8", "replace"))
except Exception as e:
    print("Error:", type(e).__name__, e)

