# PDR: DivTube Mobile Coding Partner
## Full Cockpit Capability from a Paired Android Phone, with Host-Authoritative Effects

**Status:** In Progress  
**Classification:** Architectural | Mobile | Remote Control | Coding Agent | Security | QA  
**Priority:** Critical  
**Date:** 2026-08-27  
**Primary Goal:** Make the Android companion a practical, full-capability phone surface for the DivTube coding cockpit while the paired PC remains the sole authority for code, processes, credentials, and side effects.

---

# 1. Executive Summary

DivTube already has a working Android companion. It securely pairs to a local Cockpit, pins the Cockpit certificate, reconnects over WebSocket, streams agent replies, shows download status, and can issue a rights-confirmed download request. That is a useful remote observer and coding *reader*, but it is not a phone coding partner: the current remote protocol can send only a hello, a chat turn, a download request, or a status-snapshot request; the remote agent receives only a positive allow-list of read/navigation tools.

This PDR evolves that proven seam into **DivTube Mobile Coding Partner v2**. The phone becomes the interaction surface for every desktop Cockpit capability—code exploration, agent tasks, diagnostics, code changes, test/typecheck runs, Git inspection, terminal sessions, memory/collaboration, healing workflows, and DivTube downloads. The PC remains the executor. The phone never receives filesystem, shell, process, environment, or provider credentials directly, and it cannot turn an arbitrary model response into an unreviewed effect.

The central design is a **capability manifest + action lifecycle**:

1. The host derives the available capability catalog from the same Cockpit tool registry that powers desktop.
2. A phone task requests an intent, not a raw host command line.
3. The host creates typed, bounded action proposals with preconditions and a risk class.
4. The user reviews a rendered diff, command summary, or diagnostic plan on the phone and explicitly approves the specific action when policy requires it.
5. The host revalidates the proposal immediately before execution, runs it locally, and emits an immutable sanitized receipt.

This preserves actual desktop power without making the Android device a secret-bearing remote shell. It also makes the distinction between a proposed patch, an applied patch, and verified test evidence visible in the small-screen UI.

---

# 2. Evidence-Grounded Current State

## 2.1 Verified capabilities

| Surface | Verified repository evidence | What it proves |
|---|---|---|
| Android app | `divtube_downloader/android/app/src/main/java/divtube/companion/ui/CockpitScreen.kt:21-48` | A native Compose phone app with paired Chat and Device tabs exists. |
| Phone coding chat | `CockpitScreen.kt:142-154` | The UI expressly describes a read/search/navigate-only coding agent. |
| TLS-pinned pairing | `tui/remote/gateway.py:99-108`, `android/.../PinnedCockpitClient.kt` | The host serves TLS and the Android client is built around a pinned Cockpit client. |
| Authentication and reconnect | `gateway.py:135-145,227-234`; `CockpitViewModel.kt:114-143` | Pairing creates a device bearer credential; the app reconnects with bounded backoff. |
| Ordered, validated transport | `tui/remote/protocol.py:12-30,254-273` | V1 has a versioned exact-key envelope and fixed client/server message types. |
| Live host status | `tui/remote/gateway.py:54-80,147-176` | Reconnect snapshots and live events are delivered by the gateway. |
| Read-only agent boundary | `tui/remote/capability_policy.py:12-30,54-68`; `remote_cockpit_adapter.py:45-90` | Remote chat gets a positive tool allow-list and strips `microscope` execution parameters. |
| Desktop capability substrate | `tui/services/tool_service.py:352+`; `tests/test_tool_recommendation.py:40-54` | The desktop cockpit owns a much broader registered tool catalog, including file, test, command, patch, diagnostic, Git, collaboration, and execution tools. |

## 2.2 Verified gap

V1 client frames are exactly `session.hello`, `chat.turn.request`, `download.request`, and `status.snapshot.request` (`tui/remote/protocol.py:12-18`). The gateway permits chat only in read-only/download modes and downloads only in the latter (`tui/remote/gateway.py:206-225`). Therefore the current companion cannot request a code edit, approve and apply a diff, run a test, inspect a terminal session, manage an agent/task, or use the Cockpit's non-read-only tools.

There is also a contract-drift item to resolve before implementation: `SCHEMA_CONTRACT.md:35-75` describes a four-tool remote read-only allow-list, whereas the implementation allows nine read/navigation tools in `tui/remote/capability_policy.py:12-22`. This PDR does not treat either list as the v2 source of truth. Phase 0 must reconcile the living schema contract and executable implementation through one generated manifest and exact conformance tests.

## 2.3 Boundary statement

The desktop Cockpit is the actual coding environment. The phone is a secured controller and review surface for that Cockpit, not a standalone code executor and not a cloud relay. The paired PC must be online. Initial release remains private-LAN only; public-internet exposure, relay hosting, VPN/tunnel setup, and multi-user collaboration are separate decisions and out of scope.

---

# 3. Product Goal and Non-Goals

## Product goal

From the Android app, the owner can start and follow a coding task, inspect the relevant code and repository state, direct the agent, review proposed changes, approve authorized effects, run and inspect verification, manage active agents/tasks, and receive an accurate final receipt—without needing to return to the desktop Cockpit for an ordinary workflow.

"Full capability" means all **enabled desktop Cockpit capabilities** are represented in the host-advertised manifest and reachable through their defined mobile interaction. It does not mean every desktop layout is copied pixel-for-pixel or that all operations are silently enabled on a newly paired phone.

## Non-goals

- No raw filesystem mount, SSH shell, terminal byte stream, local process handle, API key, `.env` value, absolute path, or unredacted command environment reaches Android.
- No autonomous edit, command, test, agent delegation, download, Git mutation, or external/browser action becomes an effect merely because the model suggested it.
- No public listener, cloud proxy, background host wake-up, iOS client, desktop replacement, or offline code execution in this release.
- No automatic synchronization of phone drafts or prompts to a third party. Task text is retained only under an explicit local host retention policy.
- No attempt to keep V1 clients interoperable with V2 message types. The two protocol versions are separately negotiated and independently tested.

---

# 4. Design Principles

1. **Host authority is absolute.** Only the Cockpit host reads/writes the repository, starts processes, owns credentials, and executes tools.
2. **Manifest, not duplicated policy.** The desktop registry is authoritative for what exists. The mobile gateway exposes a generated, versioned manifest whose entries declare whether they are observable, proposal-only, approval-gated, or host-local-only.
3. **Effects are receipts, not chat text.** A result is authoritative only after the host emits its action receipt with outcome, preconditions checked, affected logical files, and verification evidence.
4. **Explicit approval, bound to content.** Approval signs one action ID plus its canonical digest, target scope, expiry, and current repository revision; it never means "approve the rest of the conversation."
5. **Fail closed under drift.** Unknown tool, capability, action state, manifest version, extra payload field, mismatched digest, expired approval, or stale repository precondition is rejected before dispatch.
6. **Sanitize by type.** Android gets logical relative paths and redacted summaries; it does not receive strings that are merely regex-scrubbed as the primary safety mechanism. Existing text sanitization remains a defense in depth.
7. **Small-screen truthfulness.** The UI must distinguish plan, pending approval, executing, failed, applied, and verified. A green-looking task that has no test evidence is never labeled verified.
8. **No delegated safety.** A model cannot self-classify a high-risk command as low risk. The host policy engine classifies capabilities and validates all supplied arguments.

---

# 5. User Experience

The paired app has five primary areas, optimized for a phone rather than a miniature terminal:

| Area | Phone workflow | Desktop parity represented |
|---|---|---|
| **Tasks** | Start a coding request; see the agent's plan, live activity, tool receipts, blockers, and final evidence. | Prompt/agent runs, tasks, activity, history. |
| **Code** | Browse project tree, search, telescope/microscope/atlas results, file excerpts, imports, and Git diff. Tap evidence to add it to a task. | Read, search, tree, lenses, dependency graph, diff/history. |
| **Changes** | Review a semantic summary and unified/side-by-side diff; approve, reject, or request revision. | File creation/replacement/patch, healing, reversible edits. |
| **Verify** | Run a host-defined test/typecheck/diagnostic action; stream sanitized progress and receive an outcome receipt. | Test run, typecheck, gates, diagnostics, health/forensics. |
| **Control** | Inspect capability availability, current worktree state, agents/tasks, memory status, device grants, and disconnect/revoke. | Collaboration, memory, configuration/status, remote pairing. |

The existing rights-confirmed download workflow remains a Control action and retains its separate rights confirmation. It must not be reinterpreted as a generic approval token.

## Task flow

```text
Phone request
  -> host creates task and emits a plan/activity receipt
  -> agent explores through manifest-authorized tools
  -> host emits a proposed action (diff / command plan / external action)
  -> phone reviews and approves or rejects that exact proposal
  -> host rechecks scope + repository preconditions
  -> host executes locally and emits action receipt
  -> phone displays verified, failed, or blocked with evidence
```

For long-running work, the phone receives compact task events and can reconnect to a fresh snapshot. It never needs to reconstruct hidden host state from only chat fragments.

---

# 6. Architecture

## 6.1 Components

| Component | Responsibility | Depends on |
|---|---|---|
| **Android Compose client** | Pairing, local device credential storage, render of typed task/code/change/verification events, biometric gate before sensitive approval. | V2 protocol decoder, pinned TLS client, local encrypted state. |
| **Remote Gateway** | TLS, device authentication, strict protocol parsing, rate limiting, event ordering, snapshot/reconnect, and dispatch to the host adapter. | Pairing store, event hub, V2 policy. |
| **Capability Manifest Service** | Derives an immutable, versioned mobile manifest from the desktop registry and host policy; records why each desktop capability is available, approval-gated, or unavailable. | `ToolService` registry, policy table, workspace state. |
| **Mobile Coding Adapter** | Converts typed phone task/actions to Cockpit service calls; creates proposals and receipts; prevents raw direct dispatch. | Prompt service, tool service, Git/worktree inspector, action journal. |
| **Action Policy Engine** | Validates arguments and classifies each action into observe, propose, apply, execute, external, or host-local. Checks scope, expiry, operation budget, approval digest, and current preconditions. | Generated manifest, allow-list validators. |
| **Action Journal** | Append-only host-local records of action proposal, approval, execution, cancellation, and receipt. Retains digests and logical references, never secrets. | Atomic local persistence. |
| **Existing Cockpit services** | The actual read, search, edit, test, diagnostic, Git, agent, and download behavior. | Existing desktop runtime. |

## 6.2 Capability classes

| Class | Examples | Mobile behavior | Approval rule |
|---|---|---|---|
| Observe | Read file, search, tree, lenses, Git diff/history, diagnostics that do not execute code. | Agent may use after task start; result is streamed as typed/sanitized evidence. | None. |
| Propose | Plan, tool recommendation, patch preview, command preview, diagnostic plan. | Creates a reviewable proposal only. | None to create; cannot cause effects. |
| Apply | `apply_patch`, file creation/replacement, memory mutation, bug/task creation. | Shows exact logical scope and diff/summary. | Explicit phone approval for each proposal. |
| Execute | Test/typecheck, approved command runner, controlled browser inspection, supported diagnostics. | Shows a canonical command category, inputs, timeout/budget, and expected output shape—not raw secrets or an arbitrary shell transcript. | Explicit phone approval, except a user-configured safe verification preset may use a short, one-task approval lease. |
| External | Downloads and any network/write action beyond the local repository. | Keeps its domain-specific confirmation and visible destination policy. | Separate explicit confirmation; never inherits a code-change approval. |
| Host-local-only | Tools that cannot be safely represented or validated on mobile yet. | Manifest says unavailable and gives the reason. | Not dispatchable. Full parity is not claimed until no enabled desktop tool remains in this class. |

`bash_session`, `python_exec`, `evaluate`, and autonomous `heal` are high-risk Execute/Apply paths. They need their own typed host adapters, bounded arguments and independent postconditions before becoming mobile-enabled. They are not to be exposed through a generic `command` string.

## 6.3 Protocol v2

V2 adds a new protocol version, `divtube-remote-v2`; V1 remains unchanged during migration. Both paths use exact envelope keys, nonnegative monotonic server sequence numbers per Cockpit instance, message-size bounds, UTF-8 canonical serialization, and strict Android decoding.

Minimum V2 client requests:

- `session.hello`, `capability.manifest.request`, `task.create`, `task.cancel`, `task.snapshot.request`
- `action.propose.request`, `action.approve`, `action.reject`, `action.cancel`
- `code.query.request`, `artifact.open.request`, `verification.start.request`
- `device.revoke`

Minimum V2 server events:

- `capability.manifest`, `task.snapshot`, `task.activity`, `task.message`, `task.blocked`, `task.completed`
- `artifact.summary`, `artifact.chunk`, `action.proposed`, `action.approval.required`, `action.running`, `action.receipt`, `action.invalidated`
- `verification.progress`, `verification.receipt`, `device.notice`, `error`

Every action proposal contains at least: `actionId`, capability identifier and manifest version, risk class, canonical argument digest, logical target list, precondition digest(s), expires-at time, human summary, and renderable review artifact. Every receipt contains the same identity plus an authoritative terminal state, host timestamps, revalidation result, changed logical files, verification references, and a sanitized failure reason if applicable.

The schema contract will define exact field sets and finite enums before gateway or Android changes begin. The host rejects unknown keys; the client rejects unknown event shapes rather than silently interpreting a future unsafe field.

## 6.4 Integrity and concurrency

- Change proposals bind each target to a pre-image digest and repository/worktree state snapshot. The host refuses approval execution if either has changed.
- The host holds a per-worktree action lock while applying a mutation or executing a stateful task. A conflicting phone task becomes blocked, not interleaved.
- After a mutation, the host obtains a new authoritative diff and records it in the receipt. The agent's claimed summary is never the proof that a patch applied.
- Idempotency keys are scoped to device + task + request. Replayed approval cannot re-run a completed or expired action.
- The action journal uses atomic append/write semantics and bounded retention. It stores no bearer token, raw command environment, provider key, full absolute path, or unsanitized tool output.

---

# 7. Security and Privacy Review

## Threats addressed

| Threat | Required control |
|---|---|
| Lost/unlocked phone | Device-specific pairing credential, Android encrypted storage, biometric confirmation for Apply/Execute/External approvals, one-tap local revoke plus host-side revocation. |
| LAN attacker or fake host | Existing TLS certificate pinning and one-time pairing remain mandatory; V2 does not permit plaintext fallback. |
| Replayed or delayed approval | Expiring action ID + canonical digest + device/task binding + single-use terminal journal state. |
| Stale diff approval | Host revalidates target digests and repository state directly before effect. |
| Agent escalation by prompt injection | Host policy, typed validators, capability classification, and approval digest are authoritative; model text cannot grant a capability. |
| Secret/path leakage | Typed result schemas default to logical paths and summaries; recursive secret-field rejection and sanitization are defense in depth. |
| Unsafe desktop-tool drift | Manifest generation fails closed for an unclassified tool; parity audit fails if registry, manifest, and policy disagree. |
| Host busy/disconnect | Per-task lifecycle and reconnect snapshot preserve a visible blocked/running state; no client-side assumption of success. |

## Explicit policy decisions

- The LAN-only boundary remains default. Enabling an internet-reachable gateway is a separate security PDR with a new threat model.
- A phone may authorize a bounded host effect after biometric confirmation; it may not authorize an unbounded terminal session.
- “Safe verification” is an explicit named host preset with a fixed runner, arguments, working-directory scope, timeout, and output cap. It is not a regex that guesses whether arbitrary shell is safe.
- Any tool that starts a process, writes outside the configured repository root, contacts a third party, or may mutate Git state is denied until a typed adapter and tests exist.

---

# 8. Implementation Phases

## Phase 0 — Establish the source of truth

1. Inventory every currently registered desktop tool and its input/output/effect semantics.
2. Reconcile the V1 schema/implementation read-only allow-list drift; add a conformance test that compares the declared and executable policy.
3. Define the V2 schemas, error taxonomy, manifest format, capability classes, and receipt journal contract in `SCHEMA_CONTRACT.md`.
4. Build a parity matrix with one row per desktop capability: adapter, class, reviewer UI, validation, tests, and rollout status.

**Exit gate:** no tool has an implicit or guessed mobile disposition; unknown/unclassified tools fail closed.

## Phase 1 — Observe and task parity

1. Add V2 negotiation, manifest delivery, typed task lifecycle, artifact viewing, and reconnect snapshots.
2. Port the current paired app from Chat/Device tabs to Tasks, Code, Changes, Verify, and Control navigation while retaining V1 chat/download functionality.
3. Provide read/search/lens/diff/diagnostic/Git-history artifacts in typed, paged, logical-path-safe forms.

**Exit gate:** a phone can complete an evidence-backed read-only coding investigation with the same enabled observability capabilities as desktop, including reconnect and manifest drift tests.

## Phase 2 — Reviewable code change parity

1. Implement host-side proposal generation for file creation/replacement and patch application.
2. Render semantic summaries plus unified and side-by-side diffs on Android.
3. Implement biometric, digest-bound, expiring approval; host revalidation; per-worktree lock; receipt journal; reject/revise/cancel flows.
4. Add direct post-apply diff verification and test recommendation attachment.

**Exit gate:** a deliberately changed file can be proposed, approved on phone, applied once, independently re-read, and rejected on stale preconditions; denied/replayed approvals have no effect.

## Phase 3 — Verification and controlled execution parity

1. Add typed adapters for test run, typecheck, approved diagnostic execution, and named safe verification presets.
2. Stream bounded progress plus structured terminal results and explicit timeouts/cancellation.
3. Add high-risk adapters individually for `bash_session`, `python_exec`, `evaluate`, browser actions, and healing only after threat-specific validators and independent oracles exist.

**Exit gate:** every enabled execution capability has a bounded adapter, approval rule, cancellation semantics, postcondition, and mutation/differential test. No generic remote command path exists.

## Phase 4 — Operational/collaboration parity and hardening

1. Add task/agent/bug/memory/control views and appropriate action proposals.
2. Add capability settings, per-device grants, audit history, host-side revocation, and retention controls.
3. Conduct a closed beta on a non-production worktree, then enable the coding-partner profile only after all parity rows have passed.

**Exit gate:** the parity auditor reports no enabled desktop capability as missing, silently downgraded, or host-local-only; otherwise the product remains accurately labeled partial parity.

---

# 9. QA and Acceptance Requirements

## Contract and security tests

- Exact-key, type, enum, size, sequence, and protocol-version rejection for every V2 message; fuzz malformed frames and nested payloads.
- Differential conformance tests between the Android encoder/decoder and host schema fixtures.
- Mutation tests proving that extra fields, unknown capabilities, boolean-for-integer values, forged logical paths, altered action digests, stale target digests, expired approvals, and replayed approvals are rejected before dispatch.
- Pairing, pinning, revocation, device limits, rate limits, reconnect ordering, and journal atomicity tests.
- Redaction tests for absolute paths, tokens, environment keys, credential-shaped fields, raw commands, and full untrusted terminal output.

## Behavioral efficacy tests

- A baseline V1 client must fail to perform each v2 coding action; the V2 client must then perform it only through its correct proposal/approval/receipt path.
- An approval-less agent proposal must not change a fixture worktree.
- A matching approved proposal must change only its declared fixture targets; an out-of-band fixture mutation must invalidate it.
- The authoritative post-apply diff must disagree with a deliberately falsified agent summary and the UI must display the authoritative diff.
- A task cancelled or disconnected while running must recover to a truthful host-derived terminal/blocked status rather than a fabricated success.

## Mobile UX and accessibility tests

- Android tests for one-handed navigation, large text, TalkBack labels, keyboard traversal, screen rotation, dark mode, markdown safety, long diffs, flaky Wi-Fi, and cold reconnect.
- Runtime probes against a real host on the LAN, not only mocked protocol fixtures.
- Device-level test of biometric cancellation: a cancelled biometric prompt cannot leave a reusable approval token.

## Required evidence before claiming full parity

1. The generated parity matrix contains every live desktop tool and no unknown classifications.
2. Each row links an adapter, v2 schema, Android surface, approval rule, and independent test.
3. The release test run exercises the actual Android client against a real Cockpit gateway and a disposable worktree.
4. A final independent audit verifies that V1 remains constrained, V2 cannot reach a generic shell, and no host secret or absolute path appears in captured mobile traffic.

---

# 10. Success Criteria

The feature is **implemented** only when all of the following are true:

- The paired Android app can initiate, monitor, review, approve when required, and verify every enabled desktop Cockpit capability for the configured project.
- Every host effect has a typed proposal/approval/receipt path or is absent from both desktop and the manifest; no capability is silently omitted.
- The owner can complete a real edit-and-verify workflow entirely from the phone: inspect evidence, direct an agent, review a diff, approve it, run the required verification, and read an authoritative receipt.
- Replayed, stale, malformed, unapproved, out-of-scope, and revoked-device requests produce no host effect.
- The PC retains all credentials and filesystem/process authority; captured Android traffic and persistent mobile state contain no secret, raw absolute path, or unrestricted shell command.
- The app truthfully reports partial parity until the parity audit is complete.

---

# 11. Risks and Decisions Required Before Implementation

| Risk / decision | Why it matters | Required resolution |
|---|---|---|
| Full Cockpit catalog contains deliberately powerful tools. | Direct remote exposure would turn a phone into an unbounded shell. | Approve the manifest/action-lifecycle model; classify every tool before enabling it. |
| V1 schema and source policy differ. | A safety contract cannot have two truths. | Resolve in Phase 0 with a generated contract and conformance gate. |
| A small screen makes long diffs and command review error-prone. | Approval must be informed, not ceremonial. | Require semantic summary, paging, search, changed-file count, digest, and a desktop handoff option. |
| Long-running state can outlive connectivity. | The phone must not infer completion from a lost stream. | Persist host task/action journal and emit fresh snapshots on reconnect. |
| Existing desktop tools may not have structured inputs/outputs. | They cannot safely be mirrored through generic JSON. | Add individual typed adapters or leave them host-local-only until they do. |
| User may eventually need off-LAN use. | It materially changes authentication, replay, and network threat models. | Treat it as a separate PDR after LAN parity is complete. |

---

# 12. Final Verdict

**Recommendation: approve the architecture for Phase 0 only.** The current companion demonstrates a strong secure transport and read-only coding seam, but it does not demonstrate mobile coding parity. The requested product is achievable by extending the existing host-controlled architecture, provided the project refuses the tempting shortcut of exposing arbitrary desktop tool calls or a raw shell over the LAN.

The first implementation deliverable is not a new button. It is the executable parity matrix and V2 contract that prove precisely which desktop powers the phone may request, what approval they require, and how the host will independently demonstrate the outcome.
