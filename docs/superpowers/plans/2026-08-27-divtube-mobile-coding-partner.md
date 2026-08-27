# DivTube Mobile Coding Partner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an Android phone surface that can drive every enabled DivTube Cockpit capability through a host-authoritative, typed, approval-bound V2 protocol.

**Architecture:** Preserve the current pinned-TLS pairing gateway and V1 protocol. Add a separate V2 codec, host capability manifest, action policy/journal, and mobile adapter. The Android client renders typed task, artifact, action, and verification state; it never receives a shell, secrets, absolute paths, or a direct `ToolService.execute_tool` escape hatch.

**Tech Stack:** Python 3.12, aiohttp, pytest, Android Kotlin/Compose, kotlinx.serialization, OkHttp, Gradle/JDK 21.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-08-27-divtube-mobile-coding-partner-pdr.md`

## Global Constraints

- Preserve `divtube-remote-v1` behavior and exact existing V1 frame rules.
- V2 is private-LAN only, uses existing certificate pinning and paired-device credentials, and fails closed on unknown fields/versions/capabilities.
- The PC alone owns filesystem, processes, secrets, and provider credentials.
- Mobile effects require an action proposal with target/precondition digests and an explicit, expiring, single-use approval.
- No generic remote command, Python, bash, `evaluate`, or direct tool-dispatch endpoint may ship.
- A tool absent from the policy classification is unavailable by default; full-parity status is prohibited until the generated matrix has no unavailable live desktop tools.
- New tests are written first, observed failing, then made green; acceptance uses real gateway/client fixtures and disposable worktrees.

---

## File Structure

| Path | Responsibility |
|---|---|
| `divtube_downloader/tui/remote/coding_protocol.py` | V2 exact envelopes, payload validators, canonical JSON, and typed action/task events. |
| `divtube_downloader/tui/remote/coding_policy.py` | Tool manifest classification, argument validation, risk/approval decisions, and policy parity audit. |
| `divtube_downloader/tui/remote/action_journal.py` | Atomic host-local proposal, approval, invalidation, and receipt records. |
| `divtube_downloader/tui/services/mobile_coding_adapter.py` | Task orchestration, artifact paging, proposal/revalidation/execution routing, and sanitized receipts. |
| `divtube_downloader/tui/remote/gateway.py` | Protocol negotiation and V2 dispatch without changing V1 behavior. |
| `divtube_downloader/tui/remote/event_hub.py` | V2 device event queues/snapshots, isolated from V1 sequencing. |
| `divtube_downloader/android/.../data/CodingProtocol.kt` | Strict V2 Android serialization and decoding. |
| `divtube_downloader/android/.../ui/CodingPartnerViewModel.kt` | Android task/action/reconnect state reducer. |
| `divtube_downloader/android/.../ui/CodingPartnerScreen.kt` | Tasks, Code, Changes, Verify, and Control Compose screens. |
| `divtube_downloader/tests/test_mobile_*` | Host policy, journal, adapter, protocol, and gateway evidence. |
| `divtube_downloader/android/app/src/test/...` | Android codec and state reducer tests. |

---

### Task 1: Capability inventory and fail-closed manifest

**Files:**
- Create: `divtube_downloader/tui/remote/coding_policy.py`
- Test: `divtube_downloader/tests/test_mobile_capability_policy.py`

**Interfaces:**
- Produces `CapabilityClass`, `CapabilityEntry`, `build_manifest(tools)`, and `audit_manifest(tools, manifest)`.
- `build_manifest` accepts the actual `ToolService.tools` list and returns every tool name exactly once with an explicit mobile disposition.

- [ ] **Step 1: Write failing behavior tests**

```python
def test_unclassified_desktop_tool_is_unavailable_not_silently_omitted():
    manifest = build_manifest([tool("future_power")])
    assert manifest["future_power"].availability == "unavailable"
    assert manifest["future_power"].reason == "unclassified_capability"

def test_policy_audit_rejects_duplicate_or_missing_desktop_entries():
    with pytest.raises(PolicyError, match="manifest parity"):
        audit_manifest([tool("read_file")], {})
```

- [ ] **Step 2: Run the focused test and observe the expected missing-import failure.**

Run: `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_mobile_capability_policy.py -q`

- [ ] **Step 3: Implement the smallest manifest and audit API.**

```python
class CapabilityClass(str, Enum):
    OBSERVE = "observe"
    PROPOSE = "propose"
    APPLY = "apply"
    EXECUTE = "execute"
    EXTERNAL = "external"
    UNAVAILABLE = "unavailable"
```

The only default is `UNAVAILABLE`; policy entries must be keyed by the desktop registry tool name.

- [ ] **Step 4: Run focused tests green and add mutation cases for unknown tool and changed tool metadata.**
- [ ] **Step 5: Commit the manifest slice.**

### Task 2: V2 protocol contract and independent server event hub

**Files:**
- Create: `divtube_downloader/tui/remote/coding_protocol.py`
- Create: `divtube_downloader/tui/remote/coding_event_hub.py`
- Test: `divtube_downloader/tests/test_mobile_coding_protocol.py`
- Test: `divtube_downloader/tests/test_mobile_coding_event_hub.py`

**Interfaces:**
- Produces `V2ClientEnvelope.from_json`, `V2ServerEnvelope.to_json`, `CodingEventHub.publish`, and `CodingEventHub.snapshot`.
- V2 client types: `session.hello`, `capability.manifest.request`, `task.create`, `task.cancel`, `task.snapshot.request`, `action.approve`, `action.reject`, `action.cancel`, `artifact.open.request`, and `verification.start.request`.

- [ ] **Step 1: Write failing exact-key and replay-safety tests.**

```python
def test_v2_approval_requires_exact_digest_bound_payload():
    with pytest.raises(ProtocolError, match="missing or extra"):
        V2ClientEnvelope.from_json(frame("action.approve", {"actionId": "a-1"}))

def test_v2_server_event_sequence_is_monotonic_per_host_instance():
    first, second = hub.publish("task.activity", task("t-1")), hub.publish("task.completed", task("t-1"))
    assert json.loads(first)["seq"] + 1 == json.loads(second)["seq"]
```

- [ ] **Step 2: Run tests red; reject wrong protocol version, extra keys, invalid IDs, oversized strings, and invalid event enums.**
- [ ] **Step 3: Implement immutable V2 envelope validation and an isolated event hub.**
- [ ] **Step 4: Run tests green plus an Android-fixture conformance test using literal JSON frames.**
- [ ] **Step 5: Commit the V2 contract slice.**

### Task 3: Atomic action journal and digest-bound approvals

**Files:**
- Create: `divtube_downloader/tui/remote/action_journal.py`
- Test: `divtube_downloader/tests/test_mobile_action_journal.py`

**Interfaces:**
- Produces `ActionJournal.propose`, `approve`, `invalidate_if_stale`, `record_receipt`, and `get`.
- An approval accepts `(device_id, task_id, action_id, canonical_digest, now)` and can transition a proposal once from `pending` to `approved`.

- [ ] **Step 1: Write failing tests for a valid approval, changed digest, expiry, replay, and process restart.**

```python
def test_replayed_approval_cannot_execute_a_second_time(tmp_path):
    journal = ActionJournal(tmp_path)
    proposed = journal.propose(proposal("a-1", expires_at=101))
    assert journal.approve("d-1", "t-1", "a-1", proposed.digest, now=100).state == "approved"
    with pytest.raises(ActionStateError, match="terminal|approved"):
        journal.approve("d-1", "t-1", "a-1", proposed.digest, now=100)
```

- [ ] **Step 2: Run the focused test red.**
- [ ] **Step 3: Implement atomic temp-file replace persistence with mode `0600`; persist logical paths and digests only.**
- [ ] **Step 4: Run tests green, including corrupted journal rejection and a stale-precondition invalidation.**
- [ ] **Step 5: Commit the journal slice.**

### Task 4: Host adapter for read artifacts and reviewable code changes

**Files:**
- Create: `divtube_downloader/tui/services/mobile_coding_adapter.py`
- Test: `divtube_downloader/tests/test_mobile_coding_adapter.py`

**Interfaces:**
- Consumes V2 envelopes, manifest entries, journal, and a real `ToolService` boundary.
- Produces `dispatch(device_id, envelope)`, `propose_patch`, `approve_action`, and typed artifact/receipt events.

- [ ] **Step 1: Write a failing disposable-worktree test that proposes a one-file patch without writing it.**

```python
def test_patch_proposal_does_not_write_until_digest_bound_approval(worktree, adapter):
    action = adapter.propose_patch("d-1", "t-1", {"path": "note.txt", "patch": "before\n---\nafter"})
    assert (worktree / "note.txt").read_text() == "before"
    assert action.state == "pending_approval"
```

- [ ] **Step 2: Run the test red.**
- [ ] **Step 3: Implement a narrow patch/file adapter that creates a unified review artifact, captures pre-image SHA-256, and performs an independent post-apply diff.**
- [ ] **Step 4: Add and pass tests for stale target rejection, undeclared target rejection, redacted output, cancellation, and successful receipt evidence.**
- [ ] **Step 5: Commit the reviewable-change slice.**

### Task 5: Controlled verification and capability-by-capability execution adapters

**Files:**
- Modify: `divtube_downloader/tui/services/mobile_coding_adapter.py`
- Modify: `divtube_downloader/tui/remote/coding_policy.py`
- Test: `divtube_downloader/tests/test_mobile_execution_policy.py`

**Interfaces:**
- Produces named `VerificationPreset` entries and an `execute_verified_action` dispatcher.
- `test_run`, `typecheck`, and diagnostic tools are bounded named presets before their execution; no request contains a generic shell command.

- [ ] **Step 1: Write failing tests that a named test preset runs, a generic command is absent, and an execution receipt contains a timeout/result summary.**
- [ ] **Step 2: Run the focused test red.**
- [ ] **Step 3: Implement only explicit adapters. Classify `bash_session`, `python_exec`, `evaluate`, browser actions, and `heal` unavailable until each receives its own bounded argument schema and postcondition.**
- [ ] **Step 4: Run tests green and verify that a falsified agent claim cannot replace the real post-run result.**
- [ ] **Step 5: Commit the controlled-execution slice.**

### Task 6: Gateway negotiation and V1 regression protection

**Files:**
- Modify: `divtube_downloader/tui/remote/config.py`
- Modify: `divtube_downloader/tui/remote/gateway.py`
- Test: `divtube_downloader/tests/test_remote_gateway.py`
- Test: `divtube_downloader/tests/test_mobile_coding_gateway.py`

**Interfaces:**
- Adds a `coding_partner` configuration profile that is disabled by default.
- Gateway routes V1 frames to the existing adapter and V2 frames to `MobileCodingAdapter` only after exact protocol negotiation.

- [ ] **Step 1: Write failing gateway integration tests: V1 chat remains accepted in its legacy mode; V2 task request is denied outside `coding_partner`; V1 frame is never parsed as V2.**
- [ ] **Step 2: Run tests red.**
- [ ] **Step 3: Implement mode gating and per-device V2 rate limits with the existing pinned/authenticated WebSocket boundary.**
- [ ] **Step 4: Run V1 and V2 suites green, including reconnect snapshot and revoked device cases.**
- [ ] **Step 5: Commit the gateway slice.**

### Task 7: Android V2 codec and state reducer

**Files:**
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/data/CodingProtocol.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/CodingPartnerViewModel.kt`
- Test: `divtube_downloader/android/app/src/test/java/divtube/companion/data/CodingProtocolTest.kt`
- Test: `divtube_downloader/android/app/src/test/java/divtube/companion/ui/CodingPartnerViewModelTest.kt`

**Interfaces:**
- Produces strict V2 `CodingClientEnvelope`, `CodingServerEnvelope`, `CodingProtocol.decodeServer`, and reducer states for task/action/verification lifecycle.

- [ ] **Step 1: Write failing Kotlin tests that reject unknown event fields, stale sequence, mismatched manifest version, and an approval receipt whose digest differs from the proposal.**
- [ ] **Step 2: Run `./gradlew testDebugUnitTest --tests '*Coding*'` and observe compilation/test failure.**
- [ ] **Step 3: Implement strict `kotlinx.serialization` models with `ignoreUnknownKeys = false`; render literal logical paths only.**
- [ ] **Step 4: Run focused Android tests green.**
- [ ] **Step 5: Commit the Android data slice.**

### Task 8: Android coding-partner UI and real-host acceptance

**Files:**
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/CodingPartnerScreen.kt`
- Modify: `divtube_downloader/android/app/src/main/java/divtube/companion/MainActivity.kt`
- Test: `divtube_downloader/android/app/src/androidTest/java/divtube/companion/ui/CodingPartnerScreenTest.kt`

**Interfaces:**
- Provides Tasks, Code, Changes, Verify, and Control navigation.
- Approval UI displays capability, targets, digest, expiry, risk, review artifact, and the authoritative receipt before/after a biometric prompt.

- [ ] **Step 1: Write failing Compose tests for an approval button being disabled without a proposal, semantic diff/receipt labels, and TalkBack content descriptions for blocked/verified states.**
- [ ] **Step 2: Run the Android UI test red.**
- [ ] **Step 3: Implement phone-sized task/detail screens, diff paging/search, explicit approve/reject/cancel controls, offline/blocked state, and device revoke.**
- [ ] **Step 4: Run unit tests, instrumentation tests, lint, and assemble.**
- [ ] **Step 5: Run a real LAN-host disposable-worktree test: inspect, propose, approve, apply, independently verify, reconnect, and revoke.**
- [ ] **Step 6: Commit the UI and acceptance slice.**

### Task 9: Parity audit, documentation, and rollout gate

**Files:**
- Create: `divtube_downloader/scripts/audit_mobile_coding_parity.py`
- Create: `divtube_downloader/tests/test_mobile_parity_audit.py`
- Modify: `divtube_downloader/README_TUI.md`
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`

**Interfaces:**
- The audit exits nonzero unless every live desktop tool has one manifest entry, one adapter disposition, an approval/risk rule, and a linked test identifier.

- [ ] **Step 1: Write a failing audit fixture with an unclassified desktop tool.**
- [ ] **Step 2: Run it red.**
- [ ] **Step 3: Implement the audit and document V2 configuration, pairing, revocation, capability matrix, data boundaries, and rollback.**
- [ ] **Step 4: Run the parity audit, all focused Python tests, Android unit/lint/build suite, and Markdown/hygiene checks.**
- [ ] **Step 5: Commit documentation and final acceptance evidence.**

## Plan Self-Review

- **Spec coverage:** Tasks 1-3 implement manifest, protocol, policy, and journal; Tasks 4-6 implement host authority, effects, V1 preservation, and execution gates; Tasks 7-8 implement Android parity UI; Task 9 makes the parity claim mechanically auditable.
- **Known hard boundary:** “every enabled desktop tool” is only true once Task 9’s audit is green. Until then the product must report partial parity; no task permits a generic command shortcut to fake completeness.
- **No-placeholder scan:** The plan names each file, interface, test behavior, execution command, and acceptance gate. High-risk adapters are intentionally blocked by explicit policy rather than left as an undocumented gap.
