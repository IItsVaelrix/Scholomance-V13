"""Manual check: is GEMINI_API_KEY live, and what does the provider say back?

Not a pytest test -- it calls a paid external API. Run from the module root:

    python -m scripts.manual_checks.manual_key_check

Two fixes over the original root-level `test_key.py`:

* The key used to travel as `...generateContent?key=<KEY>` in the URL query
  string. Query strings end up in proxy access logs, urllib debug output and
  exception text, so a credential there is a credential that has leaked. The
  v1beta REST API accepts the same credential in the `x-goog-api-key` header,
  which is what the SDK-based production path (tui/services/env_config.py:13)
  effectively does via Authorization: Bearer.
* `from _env import load_env` needs the module root on sys.path, which a script
  one directory down does not get for free.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from _env import load_env

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

load_env()
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise SystemExit("GEMINI_API_KEY not set - add it to .env or your environment")

payload = {"contents": [{"parts": [{"text": "Hello, say 'Test successful'."}]}]}

req = urllib.request.Request(ENDPOINT, method="POST")
req.add_header("content-type", "application/json")
req.add_header("x-goog-api-key", api_key)

try:
    with urllib.request.urlopen(req, data=json.dumps(payload).encode("utf-8"), timeout=30) as response:
        print("Success:", response.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    # e.url includes the query string, so keep it out of anything we echo.
    print("API Error:", e.code, e.read().decode("utf-8", "replace"))
except Exception as e:
    print("Error:", type(e).__name__, e)
