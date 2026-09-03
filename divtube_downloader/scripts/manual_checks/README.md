# manual_checks

Hand-run probes against **live, external, or interactive** systems. Nothing in
here is a pytest test, and none of these files may be named `test_*.py`.

## Why this directory exists

These six scripts used to sit at the module root as `test_critique.py`,
`test_harness.py`, `test_key.py`, `test_paste.py`, `test_tools.py` and
`tests_textarea.py`. pytest's default `python_files = test_*.py` meant that
*any* invocation which named a path explicitly -- `pytest divtube_downloader`
from the repo root, or `pytest test_tools.py` -- imported them, because
`testpaths = tests` in `pytest.ini` is silently ignored the moment an argument
is passed.

That was not a cosmetic problem. Concretely:

| Symptom | Cause |
|---|---|
| `Interrupted: 1 error during collection` / exit 2 | `test_critique.py` called `critique("x.json", cb)`; the real signature is `critique(file_path, model_name, callback, skill_name=...)`. Bit-rotted, raised `TypeError` at import. |
| 4.7–6.2 s burned before a single test ran | `test_tools.py` constructed `ToolService()` and made two live filesystem calls at module import time. |
| Live API call during a test run | `test_key.py` POSTed to Gemini at import. |
| Silent "it worked" | `tests_textarea.py` built `app = TestApp()` and never called `run()`. |
| "Process died", empty stderr | `test_harness.py` spawned `node turboquant_plugin.js` by relative path. |

The rule is: **a filename is a claim about how it will be executed.** These
files made that claim falsely.

`manual_list_models.py` moved here for a different reason: it is the same kind of
script (live credential, outbound call, no assertions), and it had the same
`?key=<credential>` query-string leak. It never matched `test_*.py`, so it was
never a collection hazard — just a stray.

## Running them

From the module root (`divtube_downloader/`):

```sh
python -m scripts.manual_checks.manual_key_check
python -m scripts.manual_checks.manual_tool_service_probe
python scripts/manual_checks/manual_textual_paste.py
```

Scripts that import module-root packages (`tui`, `_env`) insert the module root
onto `sys.path` themselves, so both invocation styles work.

## Contents

| File | Touches | What it answers |
|---|---|---|
| `manual_key_check.py` | network, credential | Is `GEMINI_API_KEY` live, and what does the provider say? |
| `manual_list_models.py` | network, credential | Which models does the key actually see? |
| `manual_content_critic.py` | network, credential | Does the critic loop produce output end-to-end? |
| `manual_tool_service_probe.py` | live filesystem | Do `ToolService._list_directory` / `_archive_search` return sane shapes? |
| `manual_turboquant_ipc.py` | subprocess (`node`) | Does the TurboQuant JSON-RPC-over-stdio contract still hold? |
| `manual_textual_paste.py` | terminal UI | Does pasting a path into the input rewrite it to `/magic`? |
| `manual_textual_textarea.py` | terminal UI | Visual TextArea sanity. |
| `sample_content.json` | — | Fixture for `manual_content_critic.py`. |

## Rules

1. **Never** name a file here `test_*.py` or `*_test.py`.
2. **Never** name a class `Test*` -- `python_classes = Test*` collects imported
   names, not just locally defined ones.
3. Anything requiring network, a credential, a live filesystem or a terminal
   belongs here, not in `tests/`. `tests/` must stay runnable in a sandbox with
   no keys and no outbound traffic.

`conftest.py` at the module root lists these files in `collect_ignore` as a
backstop, so a future `test_`-prefixed slip fails loudly rather than at three
in the morning in CI.
