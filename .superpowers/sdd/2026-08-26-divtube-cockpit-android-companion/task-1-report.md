# Task 1 Report: Canonical remote protocol and capability law

## Status

Complete. Task 1 implements the foundation contracts for `DivTubeRemoteProtocolV1`.
The accepted security review fixes are also complete.

## Changed files

- `divtube_downloader/tui/remote/__init__.py`
- `divtube_downloader/tui/remote/protocol.py`
- `divtube_downloader/tui/remote/capability_policy.py`
- `divtube_downloader/tests/test_remote_protocol.py`
- `divtube_downloader/tests/test_remote_capability_policy.py`
- `divtube_downloader/requirements-remote.txt`
- `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`

### Review-fix files

- `divtube_downloader/tui/remote/protocol.py`
- `divtube_downloader/tests/test_remote_protocol.py`
- `divtube_downloader/tests/test_remote_capability_policy.py`

The unrelated user changes in `divtube_downloader/tests/test_token_meter.py`,
`divtube_downloader/tui/services/prompt_service.py`,
`divtube_downloader/tui/services/token_meter.py`,
`divtube_downloader/tui/ui/widgets/token_meter.py`, and the pre-existing PDR,
plan, and archive-index changes were preserved and not included in the commit.

## RED evidence

After writing the protocol tests, the brief's RED command was run:

```text
uv run --with pytest==9.1.1 pytest tests/test_remote_protocol.py -q
```

Result: collection failed with `ModuleNotFoundError: No module named 'tui.remote'`.

## Initial GREEN evidence

The exact focused command from the brief was run after implementation:

```text
uv run --with-requirements requirements-remote.txt pytest tests/test_remote_protocol.py tests/test_remote_capability_policy.py -q
```

Result: `12 passed in 0.12s`. `git diff --check` also passed, and both remote
Python modules passed `python3 -m py_compile`.

## Review-fix RED evidence

Before hardening server event validation, the focused test command was run:

```text
uv run --with pytest==9.1.1 pytest tests/test_remote_protocol.py tests/test_remote_capability_policy.py -q
```

Result: `7 failed, 14 passed in 0.14s`. Each failure showed that a server
event with an unknown or unsafe payload field could be serialized.

## Review-fix GREEN evidence

After implementation, the exact focused command was run:

```text
uv run --with-requirements requirements-remote.txt pytest tests/test_remote_protocol.py tests/test_remote_capability_policy.py -q
```

Result: `24 passed in 0.08s`. `python3 -m py_compile tui/remote/protocol.py
tui/remote/capability_policy.py` and `git diff --check` also passed.

## Implementation summary

- Added frozen client/server envelope contracts with exact keys, explicit
  message-type and payload allow-lists, deterministic compact sorted JSON,
  bounded chat text, identifier checks, HTTPS YouTube host validation, and
  strict rights confirmation.
- Added per-instance monotonic server sequence allocation.
- Added the two server-selected capability profiles and a positive,
  duplicate-rejecting read-only tool allow-list. Coding metadata is not used
  as a safety decision.
- Registered the v1 contract and invariants in the active schema contract and
  pinned the exact remote dependency set.

### Accepted review fixes

- Defined exact required payload keys and value validation for every server
  event type. The payload boundary only permits the sanitized Cockpit status,
  bounded active-job summaries, permitted chat activity and assistant message
  fields, display-safe download lifecycle summaries, and deterministic error
  data.
- Rejects unknown, missing, secret/config/path/shell/argument-shaped fields,
  unsafe nested values, invalid states, booleans in numeric fields, unsafe
  filenames, and non-YouTube display hosts. `to_json()` revalidates a payload
  if a caller mutates its nested mapping after construction.
- Replaced the copied tool-name tuple with the actual `ToolService().tools`
  catalog while stubbing only its persistence bridge and adding synthetic
  approved definitions when absent.
- Added an explicit valid audio-download request test.

## Self-review

The implementation was reviewed against the Task 1 brief, accepted review
findings, and PDR sections 9.1 and 9.2. Focused tests cover every server event
shape positively; missing/unknown/unsafe nested values; payload mutation before
serialization; bounds and boolean-vs-integer checks; the explicit audio
download path; live-tool-catalog filtering; unsafe-tool absence; duplicate
rejection; and malformed tool entries. The server constructor remains
stateless with respect to ordering.

## Concerns / follow-up

- Sequence allocation remains process-local. Task 2's event hub is the sole
  ordered producer and must enforce strict per-instance ordering across its
  own lifecycle; this constructor intentionally does not own ordering state.
- The approved read-only names `find_symbol`, `list_project_tree`, and
  `read_import_graph` are not currently in ToolService; the filter safely
  selects them when supplied by a future/current catalog, as required by the
  PDR allow-list.

## Commit

`553f1046` — `feat(divtube): define remote companion protocol`

`d32194a9` — `fix(divtube): harden remote protocol payloads`

## Fix loop 2: malformed remote fields

### Scope

Added explicit string type checks before every server-side enum or membership
test for cockpit states, chat activity states, job states, media types, and
YouTube source hosts. This keeps malformed list/dict values on the deterministic
`ProtocolError` path during both envelope construction and serialization
revalidation. Sequence behavior and the protocol surface were unchanged.

### TDD evidence

RED was run after adding focused parameterized construction and serialization
regression tests:

```text
uv run --with pytest==9.1.1 pytest tests/test_remote_protocol.py -q
16 failed, 20 passed in 0.44s
```

The failures reproduced the reviewed raw `TypeError: unhashable type` defect
for all eight affected server fields in both validation paths.

GREEN was then run with the exact focused remote dependency command:

```text
uv run --with-requirements requirements-remote.txt pytest tests/test_remote_protocol.py tests/test_remote_capability_policy.py -q
40 passed in 0.10s
```

Additional checks passed:

```text
python3 -m py_compile tui/remote/protocol.py
git diff --check
```

### Commit

`fix(divtube): normalize malformed remote fields`
