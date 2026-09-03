"""Manual smoke-check for ContentCriticService against a real provider.

Not a pytest test: it makes a live network call and needs a working API key.
Run from the module root:

    python -m scripts.manual_checks.manual_content_critic

History: this was `test_critique.py` at the module root, where pytest's default
`python_files = test_*.py` imported it during collection and killed the whole
run with `TypeError: critique() missing 1 required positional argument:
'callback'` -- the signature gained `model_name` and nobody updated the script.
The call below now matches `critique(file_path, model_name, callback,
skill_name=...)` as used by tui/ui/app.py:971.
"""
import pathlib
import sys
import time

# Direct invocation (`python scripts/manual_checks/x.py`) puts this directory,
# not the module root, on sys.path -- so `import tui...` would fail.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from tui.services.content_critic_service import ContentCriticService

SAMPLE = pathlib.Path(__file__).with_name("sample_content.json")


def cb(msg, **_kw):
    # The service passes success=/is_final= keywords on terminal messages.
    print(msg, flush=True)


svc = ContentCriticService()
svc.critique(str(SAMPLE), "grok-4.3", cb)

# critique() is fire-and-forget: it hands off to a worker thread and returns
# immediately, so a raw script has to wait for the result rather than join it.
time.sleep(20)
