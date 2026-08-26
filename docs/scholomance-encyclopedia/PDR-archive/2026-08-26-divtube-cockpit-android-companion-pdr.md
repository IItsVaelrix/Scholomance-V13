# PDR: DivTube Cockpit Android Companion

## A private LAN companion for mobile chat, download control, and live cockpit status

**Status:** Implementation complete — release gate pending device instrumentation
**Classification:** Architectural | Behavioral | Security | Native Android UI
**Priority:** High
**Primary Goal:** Let a paired Android phone talk to the DivTube Cockpit agent, monitor work, and explicitly start lawful downloads on the user's PC without exposing the cockpit to the public internet or delegating unrestricted PC control to the phone.
**Bytecode Search Code:** `DIVTUBE-COCKPIT-ANDROID-COMPANION-PDR`

---

## Owner(s)

- **Codex:** Define the `DivTubeRemoteProtocolV1` schema, capability law, event ordering, and the adapter boundary between the remote gateway and Cockpit services.
- **Claude:** Own the Android Jetpack Compose surfaces, the small desktop pairing/status surface, TalkBack behavior, and visual review.
- **Gemini:** Implement the Python gateway, pairing store, service integration, Android networking/storage, tests, CI, documentation maintenance, and security review evidence.
- **Escalation owner:** Angel / repository owner. Angel decides whether a phone may ever authorize coding tools, arbitrary shell execution, or non-LAN exposure.

## Context

DivTube Cockpit is a local Textual terminal application. It already has a chat agent, a Java/yt-dlp download path, live progress callbacks, and a mature Python test suite, but it has no authenticated network API for a phone. This PDR adds an Android-only companion that treats the PC as the authority and the phone as a paired control surface.

## Target Integration Area

`divtube_downloader/tui/` (Cockpit services and new remote gateway), `divtube_downloader/android/` (new Android app), `SCHEMA_CONTRACT.md` (the versioned companion protocol), and the PDR/PIR archive.

## Core Concept

The companion is a keyed remote-control panel, not a copy of the computer. The Cockpit remains the engine room: it owns model credentials, filesystem access, the download process, and all state. The Android app is a deliberately narrow radio: it can hear named status events, send a chat turn through a reduced-capability agent profile, and request a download only after the human explicitly confirms rights. A QR pairing ceremony gives the phone a device-specific key and pins the PC certificate so a nearby machine cannot impersonate the Cockpit.

## Implementation Philosophy

Build a thin, versioned adapter around existing `PromptService` and `AgentService`; do not automate or scrape the Textual UI. Preserve desktop behavior, existing commands, and the Java downloader's rights confirmation. Keep the gateway disabled by default, LAN-only, pair-first, allow-listed, and independently testable. A mobile request must become a typed protocol command before it touches an existing service.

## Ownership & Law Compliance

The protocol is added to the active schema contract by Codex before implementation; no unversioned JSON shape becomes a de facto API. Gemini owns the implementation and test files, Claude owns native visual surfaces, and the PDR archive/index are maintained as encyclopedia artifacts. The phone never becomes authoritative: it cannot receive API keys, raw provider configuration, unrestricted tool output, filesystem paths outside a bounded presentation policy, or a shell capability.

---

# 1. Executive Summary

This PDR specifies a private Android companion for the local DivTube Cockpit. The first release pairs one or more user-approved Android devices over the same private network, presents live connection/download/chat state, sends chat turns to a safe remote agent profile, and permits explicit video or audio download requests. The PC runs a new, opt-in HTTPS/WebSocket gateway; it adapts existing `PromptService` and `AgentService` rather than replacing the Textual cockpit or Java downloader. The blast radius is limited to DivTube's Python TUI/service subtree, a new Android Gradle project, the companion protocol entry in `SCHEMA_CONTRACT.md`, and documentation. No public relay, cloud account, remote shell, provider configuration, coding tools, or silent download initiation is part of this release.

# 2. Out of Scope / Non-Goals

- iOS, Wear OS, Android Auto, tablets with a distinct layout, and a browser/PWA client.
- Internet exposure, port forwarding, Cloudflare tunnels, Tailscale, VPN setup, cloud relays, account registration, or push notifications.
- Mirroring the full Textual screen, replaying Rich markup, or remotely operating every existing slash command.
- Sending `OPENAI_API_KEY`, provider URLs, `.env` content, model management controls, local file contents, or local shell output to Android by default.
- Remote use of `run_command`, `bash_session`, `python_exec`, `replace_file_content`, `write_file`, `apply_patch`, `/provider`, `/apikey`, `/deploy`, `/release`, `/refactor-all`, `/write-file`, or any equivalent future tool.
- Letting an LLM infer that a download is authorized from ordinary chat text. A user must make a separate confirmation gesture that includes the rights statement.
- Reworking the existing Java `DivTubeApp` menu or changing its public download semantics.
- Persisting complete chat transcripts in a cloud service or synchronizing them without an explicit device-local export action.

# 3. Spec Sheet

## Functional specification

| Capability | Required behavior | Acceptance criteria |
|---|---|---|
| Opt-in host | The Cockpit starts no listener unless `remote_companion.enabled` is explicitly enabled. Default bind is loopback; LAN binding needs a separate `remote_companion.lan_enabled` setting and a visible desktop warning. | Starting the normal Cockpit produces no listening TCP port. Enabling only the feature flag still binds loopback. LAN binding requires both flags. |
| Pairing | Desktop shows a one-time QR offer with host, port, certificate fingerprint, opaque pairing nonce, and expiry. Android scans it, pins the certificate, and creates a device-local credential in Android Keystore. | An offer expires after 10 minutes or first use. A replay, altered fingerprint, expired offer, or unpaired device receives no status or chat data. |
| Connection state | Android shows PC name, last successful connection, transport state, and an explicit offline state. | Disconnects are visible within 5 seconds; reconnect does not duplicate events or download jobs. |
| Cockpit status | Phone receives a reduced status snapshot: gateway mode, agent state, active download count, and summarized job progress. | Status polling/streaming exposes no API key, absolute local path, raw command, or tool argument. |
| Remote chat | Phone sends one bounded text turn to the Cockpit's configured provider/model through `REMOTE_READ_ONLY`. The app receives activity and finalized assistant messages. | A successful message appears in Android and in a dedicated remote conversation stream. Remote tool discovery contains only approved read-only tools. |
| Download request | Phone may request video or MP3 from a valid supported URL. It must select media type and affirm rights in a separate confirm action. | Missing affirmation, malformed URL, duplicate request id, or unsupported media type is rejected before `AgentService.run_command` is called. |
| Download progress | Existing `AgentService` callbacks are adapted into job events. | Progress is clamped to 0–100, monotonically nondecreasing per job, and terminal events are emitted once. |
| Device management | Cockpit can list paired device labels and revoke one or all pairs. | Revoked credentials fail immediately after the next authenticated request; revocation stops the device's socket. |
| Desktop continuity | Existing desktop `/prompt`, `/download`, and `/analyze` flows retain their behavior. | The current DivTube suite remains green, and a desktop chat/download test proves no changed command routing. |

## Non-functional specification

- **Latency:** On an otherwise idle private LAN, p95 gateway acknowledgement for `chat.turn.request` and `download.request` is under 250 ms, excluding model/download execution. WebSocket event delivery p95 is under 500 ms after the adapter emits it.
- **Resource budget:** Gateway idle CPU under 1% of one logical core; under 80 MiB resident memory with one paired device and no active model turn; bounded per-socket outbound queue of 256 events.
- **Reliability:** A reconnect sends an ordered snapshot followed by events with sequence values greater than `snapshot.lastSeq`. Replayed client request IDs never create a second download.
- **Determinism:** Validation results, protocol errors, event serialisation key order, capability decisions, and status snapshot ordering are deterministic for the same inputs. Wall-clock values may be presented as metadata but never determine authorization or request identity.
- **Security:** TLS is required for LAN mode; Android certificate pinning is mandatory. Pairing secrets are random 256-bit values, stored only as a password-hash on PC and in Android Keystore on the phone. Rate limits are per paired device: 30 chat requests/minute, 6 download requests/minute, and 5 failed authentications/minute.
- **Accessibility:** All interactive Android controls have content descriptions, error messages are announced, state is not color-only, text scales to 200%, and destructive revoke actions require confirmation.
- **Privacy:** Chat text flows only from phone to the user's PC and then to the provider already configured by the user on that PC. It is not logged by the remote gateway beyond the existing Cockpit conversation policy. Android retains only the explicitly enabled local conversation cache.

## Contracts and public APIs

`SCHEMA_CONTRACT.md` gains `DivTubeRemoteProtocolV1`. Each JSON frame has this envelope:

```json
{
  "protocolVersion": "divtube-remote-v1",
  "instanceId": "pc-8c3a4b9d",
  "seq": 42,
  "type": "download.progress",
  "requestId": "2cd5f66a-0a1e-4bba-b66a-55005b0dba29",
  "payload": {}
}
```

`seq` is a nonnegative server-issued integer, strictly increasing per `instanceId`; client messages omit it. Allowed v1 types are:

| Direction | Type | Payload rule |
|---|---|---|
| Android → PC | `session.hello` | Protocol version and app version only. |
| Android → PC | `chat.turn.request` | `requestId`, 1–8,000 Unicode scalar values of text, and a named remote conversation. |
| Android → PC | `download.request` | `requestId`, HTTPS YouTube URL, `video` or `audio`, and `rightsConfirmed: true`. |
| Android → PC | `status.snapshot.request` | Empty payload. |
| PC → Android | `status.snapshot` | Sanitized Cockpit and ordered active-job summaries. |
| PC → Android | `chat.activity` | `thinking`, `looking`, `responding`, `idle`, or `failed`; no tool arguments. |
| PC → Android | `chat.message` | Immutable `messageId`, `role`, plain text, and terminal boolean. |
| PC → Android | `download.accepted` | Server-generated `jobId`, requested media type, and display-safe source host. |
| PC → Android | `download.progress` | `jobId`, bounded percent, speed, eta, and state. |
| PC → Android | `download.completed` | `jobId`, terminal state, and a display-safe filename only. |
| PC → Android | `error` | Stable `code`, deterministic message, optional field name, and originating request id. |

`RemoteCapabilityProfile` is a named server-side enum: `REMOTE_READ_ONLY` and `REMOTE_DOWNLOAD_CONFIRM`. It is never accepted as an untrusted client value. `REMOTE_READ_ONLY` offers the model only explicit read/search tools approved by Codex. `REMOTE_DOWNLOAD_CONFIRM` is a gateway action, not a model tool; it invokes `AgentService` only after protocol validation and user affirmation.

## Deferred to follow-up PDRs

- External/private-overlay access, device discovery across networks, and certificate lifecycle beyond a local self-signed certificate.
- A user-approved remote coding workflow with per-action desktop approval, immutable audit records, and a security review.
- iOS companion, notification delivery, background download management, media playback, and Android file transfer.

# 4. Change Classification

| Tag | Rationale |
|---|---|
| Architectural | Introduces a versioned PC-to-phone protocol, adapter layer, device pairing, and a native client without making the TUI itself a network API. |
| Behavioral | Adds a new remote chat and confirmed-download path; existing desktop behavior remains unchanged. |
| Structural | Splits remote concerns into `tui/remote/` rather than adding HTTP, pairing, and capability checks to `app.py` or `PromptService`. |
| Security | Creates a new input surface and requires TLS, certificate pinning, replay resistance, rate limits, authorization, and revocation. |
| Native Android UI | Adds an Android-specific Compose surface and accessibility requirements; it does not alter Scholomance React UI. |

# 5. Assumptions and Unknowns

| Item | Assumption or unknown | Handling |
|---|---|---|
| Network | The PC and phone can reach each other on a trusted private LAN. | V1 documents the router/firewall prerequisite and never enables LAN binding by default. |
| Android version | Android 10/API 29 is the minimum supported device level. | Verify the Android Gradle Plugin/Kotlin versions in the Phase 0 toolchain spike and commit the version lockfile with the new app. |
| TLS | The PC can generate and retain a local certificate/key with owner-only filesystem permissions. | Fail closed if keys cannot be stored securely; do not fall back to HTTP. |
| Model streaming | Current `PromptService` produces callback chunks/activity, not a stable token-stream API. | The adapter emits activity plus finalized plain-text messages in V1; token deltas are an optimization, not an acceptance condition. |
| Conversation context | Current history is persisted by agent/tab id in `.tui_prompt_history.json`. | Use a `remote:<device-id>:<conversation-id>` namespace; do not race a desktop tab's mutable history. |
| Read-only tools | Existing ToolService tool definitions are not yet classified by capability. | Add explicit allow-list construction; never filter by a fragile deny-list or `is_coding_action` flag alone. |
| Download serialization | `AgentService` currently launches a worker per command. | Add a single remote download queue before exposing requests; desktop behavior remains as-is. |

# 6. Open Questions / Escalations

```text
ESCALATION:
- Conflict: Mobile control convenience versus the Security Before Features law and the Cockpit agent's current full read/write/shell tool belt.
- My domain says: Remote clients must receive only an explicit read-only tool allow-list; downloads must be gateway-confirmed actions, never LLM tool calls.
- Other domain says: A future owner may want phone chat to perform coding, shell, provider, or deployment actions available in the desktop Cockpit.
- Option A: Keep V1 read-only chat plus explicitly confirmed downloads; add a separate PDR for privileged remote actions.
- Option B: Expose the existing complete ToolService to the phone now, accepting remote filesystem and shell control.
- Recommendation: Option A. It preserves useful mobile chat/control while containing a new network attack surface.
- Needs: Angel's decision before any privileged remote action is implemented.
```

```text
ESCALATION:
- Conflict: A single shared conversation appears convenient, but the existing PromptService mutates per-agent history from worker threads and does not define concurrent-turn conflict semantics.
- My domain says: Remote history must be device-scoped and serialized; a desktop tab cannot be silently merged with it.
- Other domain says: The product wording "chat with the agent in the cockpit" may be interpreted as one exact shared transcript.
- Option A: Use the same provider, system context, and project tools with a dedicated remote conversation namespace.
- Option B: Redesign PromptService around a shared conversation ledger with explicit turn ownership and conflict resolution.
- Recommendation: Option A for V1; Option B requires a concurrency/Persistence PDR.
- Needs: Angel's decision only if exact transcript sharing is required for the first release.
```

# 7. Architecture / File Map

## Dependency flow

```text
Android Compose UI
  -> Pinned HTTPS / WebSocket client
  -> RemoteGateway (authentication, rate limit, protocol validation)
  -> RemoteCockpitAdapter (capability and serialization seam)
     -> PromptService (REMOTE_READ_ONLY conversation)
     -> AgentService (confirmed download queue only)
  -> RemoteEventHub (ordered sanitized events)
  -> Desktop status/pairing surface
```

The gateway never imports Textual widgets. `DivTubeApp` only creates/stops it and forwards desktop-visible pairing/status actions. The adapter receives plain typed requests and returns typed events; it never parses terminal markup as state.

## Planned file tree

```text
divtube_downloader/
  requirements-remote.txt
  tui/
    remote/
      __init__.py
      protocol.py
      pairing.py
      capability_policy.py
      event_hub.py
      gateway.py
    services/
      remote_cockpit_adapter.py
      prompt_service.py
      agent_service.py
    ui/
      app.py
      widgets/remote_companion_status.py
  android/
    settings.gradle.kts
    build.gradle.kts
    gradle/libs.versions.toml
    app/build.gradle.kts
    app/src/main/AndroidManifest.xml
    app/src/main/java/divtube/companion/MainActivity.kt
    app/src/main/java/divtube/companion/data/PinnedCockpitClient.kt
    app/src/main/java/divtube/companion/data/PairingStore.kt
    app/src/main/java/divtube/companion/ui/CockpitViewModel.kt
    app/src/main/java/divtube/companion/ui/CockpitScreen.kt
    app/src/test/java/divtube/companion/data/PinnedCockpitClientTest.kt
    app/src/androidTest/java/divtube/companion/ui/CockpitScreenTest.kt
  tests/
    test_remote_protocol.py
    test_remote_pairing.py
    test_remote_capability_policy.py
    test_remote_cockpit_adapter.py
    test_remote_gateway.py
    test_remote_download_queue.py
  README_TUI.md
SCHEMA_CONTRACT.md
docs/scholomance-encyclopedia/
  PDR-archive/2026-08-26-divtube-cockpit-android-companion-pdr.md
  PDR-archive/README.md
  post-implementation-reports/PIR-20260826-DIVTUBE-COCKPIT-ANDROID-COMPANION.md
```

## File ownership table

| Path | Owner | Responsibility |
|---|---|---|
| `SCHEMA_CONTRACT.md` | Codex | Add `DivTubeRemoteProtocolV1`, enum values, invariants, and schema-change notice. |
| `divtube_downloader/tui/remote/protocol.py` | Codex | Canonical validation model and deterministic envelope serialization. |
| `divtube_downloader/tui/remote/capability_policy.py` | Codex | Explicit remote capability allow-list and policy invariants. |
| `divtube_downloader/tui/remote/pairing.py`, `event_hub.py`, `gateway.py` | Gemini | TLS host, pairing persistence, authentication, rate limit, sockets, and event lifecycle. |
| `divtube_downloader/tui/services/remote_cockpit_adapter.py` | Gemini | Translate protocol calls into safe PromptService/AgentService operations. |
| `divtube_downloader/tui/services/prompt_service.py`, `agent_service.py` | Gemini | Add dependency-injected tool profile and remote-only serialized download queue without changing desktop defaults. |
| `divtube_downloader/tui/ui/app.py`, `widgets/remote_companion_status.py` | Claude | Mount lifecycle and visible pair/status surface; Gemini supplies service interface only. |
| `divtube_downloader/android/app/src/main/java/**/ui/` | Claude | Compose layout, theme, and TalkBack semantics. |
| `divtube_downloader/android/app/src/main/java/**/data/` | Gemini | Pinned transport, secure credential storage, reconnection, and protocol decoding. |
| `divtube_downloader/tests/test_remote_*.py`, Android test sources | Gemini | Unit, integration, mutation, and instrumented test coverage. |
| `divtube_downloader/requirements-remote.txt`, Android Gradle files, `README_TUI.md` | Gemini | Reproducible dependencies and operational documentation. |
| This PDR, archive index, and required PIR | Gemini | Encyclopedia maintenance; Codex provides architectural review. |

Any modification of `tui/ui/app.py` that changes visual composition is coordinated through Claude; any change that changes service semantics is reviewed by Gemini. The gateway implementation must not add a second, unsanctioned schema outside `SCHEMA_CONTRACT.md`.

# 8. Step-by-Step Implementation Plan

| Phase | Owner | Approx. time | Milestone | Exit criteria | Safe flag state |
|---|---|---:|---|---|---|
| 0. Contract and threat-model spike | Codex + Gemini | 1–2 days | Protocol approved | Schema notice reviewed; unsafe actions enumerated; Android build boots a blank app; no gateway listener. | `off` |
| 1. Protocol and policy foundation | Codex + Gemini | 2 days | Pure library green | Envelope, errors, request idempotency, capability allow-list, and 100% mutation-selected negative tests pass. | `off` |
| 2. Local host and pairing | Gemini + Claude | 3–4 days | One paired device sees status | TLS, QR expiry, pin validation, revoke, rate-limit, desktop status card, and loopback/LAN two-key opt-in pass. | `status_only` canary |
| 3. Read-only remote chat | Gemini + Claude | 3–4 days | Safe chat round-trip | Dedicated remote history, single-flight turn lock, sanitized activity/messages, Android reconnect, and tool-policy tests pass. | `chat_read_only` one device |
| 4. Confirmed download control | Gemini + Claude | 2–3 days | One lawful job end-to-end | URL validation, rights confirmation, remote queue, progress events, duplicate suppression, and failure/cancel behavior pass. | `downloads_confirmed` one device |
| 5. Hardening and release evidence | Gemini + Codex + Claude | 2 days | Release candidate | Full Python suite, Android unit/instrumented suite, static analysis, LAN manual script, security review, and PIR complete. | Gradual canary then enabled |

No phase may widen the flag automatically. Phase 2 can ship as a status-only companion while later phases are incomplete; it must show a clear “Chat and download control are not enabled” state and contain no dormant privileged endpoint.

# 9. Code Examples for the Most Pivotal Changes

## 9.1 Canonical envelope validation — `tui/remote/protocol.py`

```python
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from typing import Any

PROTOCOL_VERSION = "divtube-remote-v1"
CLIENT_TYPES = frozenset({"session.hello", "chat.turn.request", "download.request", "status.snapshot.request"})


@dataclass(frozen=True)
class ProtocolError(Exception):
    code: str
    message: str


@dataclass(frozen=True)
class ClientEnvelope:
    protocolVersion: str
    type: str
    requestId: str
    payload: dict[str, Any]

    @classmethod
    def from_json(cls, raw: str) -> "ClientEnvelope":
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ProtocolError("invalid_envelope", "Envelope must be an object.")
        allowed = {"protocolVersion", "type", "requestId", "payload"}
        if set(data) != allowed or data["protocolVersion"] != PROTOCOL_VERSION:
            raise ProtocolError("invalid_envelope", "Unsupported protocol envelope.")
        if data["type"] not in CLIENT_TYPES or not isinstance(data["requestId"], str):
            raise ProtocolError("invalid_envelope", "Unsupported request type.")
        if not isinstance(data["payload"], dict):
            raise ProtocolError("invalid_envelope", "Payload must be an object.")
        return cls(**data)


def stable_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
```

## 9.2 Capability allow-list — `tui/remote/capability_policy.py`

```python
from enum import Enum


class RemoteCapabilityProfile(str, Enum):
    REMOTE_READ_ONLY = "remote_read_only"
    REMOTE_DOWNLOAD_CONFIRM = "remote_download_confirm"


REMOTE_READ_ONLY_TOOLS = frozenset({"read_file", "find_symbol", "list_project_tree", "read_import_graph"})


def filter_remote_tools(all_tools: list[dict]) -> list[dict]:
    allowed = []
    for tool in all_tools:
        name = tool.get("function", {}).get("name")
        if name in REMOTE_READ_ONLY_TOOLS:
            allowed.append(tool)
    found = {tool["function"]["name"] for tool in allowed}
    if found - REMOTE_READ_ONLY_TOOLS:
        raise RuntimeError("remote capability policy drift")
    return allowed
```

## 9.3 PromptService explicit tool selection — `tui/services/prompt_service.py`

```python
def _select_tools(self, explicit_tools: list[dict] | None) -> tuple[list[dict], frozenset[str]]:
    selected = list(self.tools.tools if explicit_tools is None else explicit_tools)
    names = frozenset(
        tool["function"]["name"]
        for tool in selected
        if isinstance(tool, dict)
        and isinstance(tool.get("function"), dict)
        and isinstance(tool["function"].get("name"), str)
    )
    if len(names) != len(selected):
        raise ValueError("Every selected tool must have one unique function name.")
    return selected, names


def _assert_selected_tool(selected_names: frozenset[str], function_name: str) -> None:
    if function_name not in selected_names:
        raise PermissionError(f"Remote capability policy rejected tool: {function_name}")
```

`prompt()` calls `_select_tools(tools)` once, passes `selected_tools` to `_call_api`, and calls `_assert_selected_tool(selected_names, func_name)` immediately before each `execute_tool`. `_call_api` accepts the selected list rather than reading `self.tools.tools`; a remote request therefore cannot acquire a newly registered desktop tool by accident.

## 9.4 Single-flight remote chat adapter — `tui/services/remote_cockpit_adapter.py`

```python
import threading

from tui.remote.capability_policy import filter_remote_tools


class RemoteCockpitAdapter:
    def __init__(self, prompt_service, event_hub):
        self._prompt = prompt_service
        self._events = event_hub
        self._turn_lock = threading.Lock()

    def submit_chat(self, device_id: str, request_id: str, text: str) -> None:
        if not self._turn_lock.acquire(blocking=False):
            self._events.error(device_id, request_id, "chat_busy", "Another remote chat turn is active.")
            return

        agent_id = f"remote:{device_id}:main"
        tools = filter_remote_tools(self._prompt.tools.tools)

        def message_callback(message: str) -> None:
            self._events.chat_message(device_id, request_id, "assistant", str(message), terminal=False)

        def finished(ok: bool, detail: str) -> None:
            try:
                if not ok:
                    self._events.error(device_id, request_id, "chat_failed", detail)
                self._events.chat_message(device_id, request_id, "assistant", detail, terminal=True)
            finally:
                self._turn_lock.release()

        try:
            self._prompt.prompt(
                text,
                message_callback,
                agent_id=agent_id,
                tools=tools,
                on_finished=finished,
            )
        except Exception as exc:
            finished(False, str(exc))
```

The `on_finished(ok, detail)` callback is added to `PromptService` and invoked from the worker's `finally` block for success, provider error, policy error, cancellation, and unhandled exception. The test suite simulates each path.

## 9.5 Confirmed download request mapping — `tui/services/remote_cockpit_adapter.py`

```python
from tui.services.agent_service import CMD_DOWNLOAD_AUDIO, CMD_DOWNLOAD_VIDEO


def launch_confirmed_download(agent_service, request, on_progress, on_done):
    if request.media_type not in {"audio", "video"} or not request.rights_confirmed:
        raise ValueError("download confirmation is required")
    command = CMD_DOWNLOAD_AUDIO if request.media_type == "audio" else CMD_DOWNLOAD_VIDEO
    agent_service.run_command(command, request.url, lambda _: None,
                              on_progress=on_progress, on_done=on_done)
```

The gateway validates URL and request id before this function is reachable. It must not invoke `CommandRegistry`, feed generated text into a slash-command parser, or accept an agent-generated `DownloadRequest`.

## 9.6 Authenticated WebSocket gate — `tui/remote/gateway.py`

```python
from aiohttp import web


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    principal = request["remote_principal"]  # set only by authenticated middleware
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=32 * 1024)
    await ws.prepare(request)
    await request.app["event_hub"].attach(principal.device_id, ws)
    try:
        async for message in ws:
            if message.type == web.WSMsgType.TEXT:
                await request.app["dispatcher"].dispatch(principal, message.data)
            elif message.type == web.WSMsgType.ERROR:
                break
    finally:
        await request.app["event_hub"].detach(principal.device_id, ws)
    return ws
```

The application runner supplies an `ssl.SSLContext`; no route is registered without it in LAN mode. Authentication middleware verifies the bearer credential and device revocation before this handler executes.

## 9.7 Certificate-pinned Android request — `android/.../PinnedCockpitClient.kt`

```kotlin
fun pinnedClient(certificate: X509Certificate): OkHttpClient {
    val pinner = CertificatePinner.Builder()
        .add("cockpit.local", CertificatePinner.pin(certificate))
        .build()
    return OkHttpClient.Builder()
        .certificatePinner(pinner)
        .build()
}
```

The pairing QR supplies the actual host and certificate fingerprint; `cockpit.local` is replaced with the validated host stored in the pairing record. The pairing flow refuses a host mismatch and stores the bearer credential using AndroidX Security Crypto backed by Android Keystore.

## 9.8 Compose confirmation surface — `android/.../CockpitScreen.kt`

```kotlin
@Composable
fun DownloadConfirmButton(enabled: Boolean, onConfirm: () -> Unit) {
    var confirmed by rememberSaveable { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(
            checked = confirmed,
            onCheckedChange = { confirmed = it },
            modifier = Modifier.semantics { contentDescription = "I confirm I have rights to download this media" }
        )
        Text("I confirm I have rights to download this media")
    }
    Button(onClick = onConfirm, enabled = enabled && confirmed) {
        Text("Start download")
    }
}
```

# 10. Glossary

- **Adapter:** A narrow translation layer that lets two systems communicate without each depending on the other's UI or internals.
- **Bearer credential:** A secret presented with a request that proves the paired device is authorized.
- **Certificate pinning:** Android accepts only the PC certificate fingerprint established during QR pairing.
- **Device-scoped conversation:** A history namespace belonging to one paired phone, preventing concurrent changes to a desktop tab's history.
- **Gateway:** The opt-in PC HTTPS/WebSocket service that validates remote requests and emits safe events.
- **Idempotency:** Repeating a request with the same ID produces the original result rather than a second download.
- **LAN:** Local area network; V1 supports a private network only, not the public internet.
- **Remote capability profile:** A server-selected named permission set applied to a remote agent turn.
- **Single-flight:** Only one remote chat turn is active at once, avoiding interleaved history and output.
- **WebSocket:** A persistent bidirectional connection used for live status and chat events.

# 11. Q&A — Top 10 Most Confusing Implementation Concerns

1. **Why not expose the Textual app over VNC or scrape its output?** Textual markup and widget state are presentation details. A typed gateway is testable, accessible on Android, and prevents keyboard/mouse access from becoming arbitrary PC control.
2. **Does “same agent” mean the same exact conversation history?** V1 uses the same configured provider, project context, and approved read-only tools, but has a device-scoped history. Exact shared history is a separate concurrency decision.
3. **Can the mobile agent edit a file?** No. The remote tool allow-list contains only named read/search tools; the gateway does not expose desktop command handlers that mutate state.
4. **Can a chat message cause a download?** No. Chat cannot call a download tool. The user must use the download form and confirm rights.
5. **Why do downloads need a remote queue?** The current `AgentService` starts worker threads per call. A queue gives the companion stable job IDs, duplicate protection, and predictable progress without changing desktop concurrency.
6. **Why TLS on a home LAN?** Wi-Fi and shared private networks are not automatically trustworthy. TLS plus pinning prevents a nearby device from impersonating the Cockpit or reading a pairing credential.
7. **What happens if the phone disconnects mid-download?** The PC job continues. On reconnect, Android receives a snapshot of active/recent jobs; it does not resend the original request.
8. **Where are provider credentials stored?** Only in the existing PC configuration. Android never receives them and cannot change them.
9. **Why exclude absolute paths and raw tool output from status?** They can disclose private filesystem layout, filenames, commands, or secrets. The protocol uses display-safe labels only.
10. **What if a future cockpit tool is accidentally added?** Remote calls remain safe because the policy constructs an allow-list by name. An unlisted tool cannot be advertised or executed remotely; a policy-drift test fails.

# 12. QA Plan

## New tests

| Test file | Purpose |
|---|---|
| `divtube_downloader/tests/test_remote_protocol.py` | Exact envelope allow-list, version failures, deterministic JSON, and event sequencing. |
| `divtube_downloader/tests/test_remote_pairing.py` | QR offer expiry, one-use nonce, certificate mismatch, revocation, and rate limits. |
| `divtube_downloader/tests/test_remote_capability_policy.py` | Every forbidden desktop tool is absent and rejected; every permitted tool is intentional. |
| `divtube_downloader/tests/test_remote_cockpit_adapter.py` | Device-scoped history, single-flight behavior, terminal errors, and sanitized messages. |
| `divtube_downloader/tests/test_remote_download_queue.py` | Rights confirmation, malformed URL rejection, duplicate request id, progress monotonicity, and terminal-event uniqueness. |
| `divtube_downloader/tests/test_remote_gateway.py` | HTTPS/auth middleware, WebSocket lifecycle, bounded queues, reconnect snapshot, and transport errors. |
| `divtube_downloader/android/app/src/test/java/divtube/companion/data/PinnedCockpitClientTest.kt` | Pin/host mismatch rejection and credential storage boundaries. |
| `divtube_downloader/android/app/src/androidTest/java/divtube/companion/ui/CockpitScreenTest.kt` | TalkBack labels, offline state, chat state, and disabled download confirmation. |

## Exact commands

Run from the repository root:

```bash
cd divtube_downloader && nice -n 19 ../.venv/bin/python -m pytest tests/ -q -p no:cacheprovider
cd divtube_downloader && ./gradle-8.5/bin/gradle test
cd divtube_downloader/android && ./gradlew testDebugUnitTest
cd divtube_downloader/android && ./gradlew connectedDebugAndroidTest
node docs/scholomance-encyclopedia/tools/audit-hygiene.mjs
```

The Android commands are enabled only after Phase 0 adds the committed Android Gradle wrapper. The existing Cockpit suite remains the canonical Python runner and must be executed from `divtube_downloader` so its imports and fixtures resolve consistently.

## Runnable test examples

```python
def test_remote_policy_never_exposes_mutation_tools():
    all_tools = [
        {"function": {"name": "read_file"}},
        {"function": {"name": "run_command"}},
        {"function": {"name": "replace_file_content"}},
    ]
    visible = filter_remote_tools(all_tools)
    assert [tool["function"]["name"] for tool in visible] == ["read_file"]
```

```python
def test_download_requires_explicit_rights_confirmation(remote_client):
    response = remote_client.download(
        request_id="5b4e864d-0a1e-4bba-b66a-55005b0dba29",
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        media_type="audio",
        rights_confirmed=False,
    )
    assert response.code == "rights_confirmation_required"
    assert remote_client.agent_calls == []
```

Mutation tests must flip every authorization branch, remove the tool allow-list condition, disable nonce expiry, and allow repeated request IDs. Each mutant must be caught by a specific test; a green happy-path suite alone is insufficient.

# 13. Regression Risks and Specific Retest Checklist

| Risk | Specific retest |
|---|---|
| Desktop command routing changes | `tests/test_tui.py`, `tests/test_sidebar_command_parity.py`, manual `/prompt`, `/download`, `/analyze` in a live Textual session. |
| Existing agent receives unintended tool filtering | `tests/test_tool_service_dispatch_golden.py`, `tests/test_exec_session.py`, desktop `/prompt` read/write behavior under the existing profile. |
| Download progress regressions | `tests/test_java_resolver.py`, `tests/test_tui.py`, a legal local fixture/probe proving callback percent clamps and terminal completion. |
| Textual shutdown race | Start/stop the gateway while closing the Cockpit; verify no `NoActiveAppError`, no late UI callback, and no dangling socket thread. |
| Credential/secret leak | Scan Android fixture logs and all remote events for `OPENAI_API_KEY`, `Authorization: Bearer`, `.env`, absolute home path, and provider URL; each must be absent. |
| Pairing replay | Reuse a QR after success, alter its fingerprint, and use a revoked credential; every attempt must fail closed. |
| Event ordering loss | Disconnect while a job progresses, reconnect, assert snapshot `lastSeq`, then assert future events have larger sequence values without a duplicate completion. |
| Android accessibility regression | Run TalkBack traversal, 200% font scale, dark mode, and no-network state on one physical device and one emulator. |

# 14. Rollout Plan

## Feature flags and modes

```text
remote_companion.enabled=false
remote_companion.lan_enabled=false
remote_companion.mode=off|status_only|chat_read_only|downloads_confirmed
remote_companion.max_paired_devices=3
```

- **Off:** Default. No listener, no pairing offer, no new remote data path.
- **Status-only:** A canary device can pair and receive a sanitized snapshot. Chat and download endpoints return `feature_disabled`.
- **Chat-read-only:** The canary device can use `REMOTE_READ_ONLY`; capability audits run at gateway boot and on each turn.
- **Downloads-confirmed:** The canary device can request a queued download only through the confirmation form.

## Shadow and canary operation

Before chat is exposed, Phase 2 runs the event hub in shadow mode inside the Cockpit: it consumes status/download callbacks, performs serialization and redaction, and writes only bounded in-memory diagnostics visible on desktop. Compare the shadow event count/order with the local callbacks; no phone receives it. Then enable `status_only` for one repository-owner-controlled Android device for at least five separate reconnect cycles. Enable chat for that device only after a security review confirms tool filtering. Enable downloads only after explicit-confirmation and duplicate-suppression tests pass.

## Incomplete-but-safe clause

Until every phase is complete, the system runs with `remote_companion.mode=off` by default. A partially implemented gateway may ship only in `status_only` after pairing, TLS pinning, revocation, event redaction, and no-listener-by-default checks pass. It must not ship a hidden chat or download route, accept an unpaired request, or fall back to HTTP. Missing Android functionality must be represented as disabled UI with a local explanation, never an optimistic control that sends an unsupported request.

## Rollback

1. Set `remote_companion.mode=off` and restart the Cockpit service; this closes listeners and rejects existing sockets.
2. Revoke all paired devices and rotate the local certificate plus pairing-secret store if any credential exposure is suspected.
3. Preserve existing desktop `PromptService` and `AgentService` behavior; no rollback changes Java downloader outputs or desktop history.
4. Re-run the Python suite and record the rollback cause/outcome in the PIR.

# 15. Definition of Done

- [ ] `DivTubeRemoteProtocolV1` is documented in `SCHEMA_CONTRACT.md` with all message types, validation, versioning, and a schema-change notice.
- [ ] The new PC listener is disabled by default and cannot bind LAN interfaces without both explicit settings.
- [ ] Pairing uses an expiring, one-use QR offer, TLS, certificate pinning, Android Keystore storage, device revocation, and rate limits.
- [ ] The gateway never sends provider credentials, raw configuration, raw shell/tool output, or absolute local paths to Android.
- [ ] Remote agent turns expose exactly the reviewed read-only capability allow-list; mutation tests prove prohibited tools cannot execute.
- [ ] Remote chat histories are device-scoped and all success/error/cancellation paths release the single-flight turn lock.
- [ ] Download requests require protocol URL validation, media-type validation, explicit rights confirmation, idempotency, and a queue with terminal job events.
- [ ] Existing desktop `/prompt`, `/download`, and `/analyze` behavior is regression-tested in both static and live Textual runtime checks.
- [ ] Android unit and instrumented tests pass on an API 29+ emulator or physical device; TalkBack and 200% font-scale checks are recorded.
- [ ] `nice -n 19 ../.venv/bin/python -m pytest tests/ -q -p no:cacheprovider`, Java tests, Android tests, and the encyclopedia hygiene audit pass.
- [ ] The archive index contains this PDR and `PIR-20260826-DIVTUBE-COCKPIT-ANDROID-COMPANION.md` is created after implementation with actual evidence, deviations, and rollback notes.
- [ ] Angel has resolved or explicitly deferred both escalation blocks before privileged remote actions or exact shared-history behavior is claimed.

# 16. Final Architectural Verdict

**Functionally complete but needs follow-up.** A LAN-only Android companion with safe chat, live status, and explicitly confirmed downloads is a practical extension of the existing Cockpit because `PromptService` and `AgentService` already provide the two necessary service seams. The present agent is unsafe to expose unchanged: it advertises full write and arbitrary-shell powers, so a remote capability allow-list and gateway adapter are mandatory rather than polish. The PDR deliberately leaves public-network access and remotely authorized coding actions for later, separately reviewed work.

# 17. References

- `divtube_downloader/README_TUI.md` — Cockpit entrypoint, local runtime, existing service map, and Python test command.
- `divtube_downloader/tui/ui/app.py` — Existing command registration, chat tabs, download UI callbacks, and app lifecycle.
- `divtube_downloader/tui/services/prompt_service.py` — Existing provider call, agent history, tool loop, and cancellation semantics.
- `divtube_downloader/tui/services/agent_service.py` — Existing Java command invocation and download progress parser.
- `divtube_downloader/tui/core/command_parser.py` — Existing slash-command and free-text routing; intentionally not used as the remote API.
- `divtube_downloader/src/main/java/divtube/app/DivTubeApp.java` — Existing Java menu and user rights confirmation behavior.
- `divtube_downloader/src/main/java/divtube/download/DownloadRequest.java` — Existing request inputs and confirmation field.
- `divtube_downloader/src/main/java/divtube/download/DownloadProgressListener.java` — Existing progress callback contract.
- `divtube_downloader/tests/test_tui.py` — Existing command-routing regression tests.
- `divtube_downloader/tests/test_exec_session.py` — Existing persistent execution capabilities that must remain unavailable remotely.
- `divtube_downloader/.gitignore` — Existing local secret/history/download exclusions.
- `SCHEMA_CONTRACT.md` — Active schema authority and handoff/schema-change rules.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — Security-before-features law, PDR/PIR archive requirement, escalation format, and domain boundaries.
- `docs/scholomance-encyclopedia/Scholomance LAW/SHARED_PREAMBLE.md` — Sovereign-editor privacy principle and session reading order.
- `docs/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` — Required PDR sections and handoff constraints used to author this document.
- `docs/scholomance-encyclopedia/PDR-archive/README.md` — PDR catalog and archive hygiene requirement.
- [Android Keystore system](https://developer.android.com/privacy-and-security/keystore) — Android credential storage requirement.
- [Android network security configuration](https://developer.android.com/privacy-and-security/security-config) — Certificate trust/pinning implementation reference.
- [OkHttp CertificatePinner](https://square.github.io/okhttp/3.x/okhttp/okhttp3/CertificatePinner.html) — Android certificate pinning API reference.

# 18. Post-Implementation Report Handoff

The required post-implementation report is `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260826-DIVTUBE-COCKPIT-ANDROID-COMPANION.md`, dated **2026-08-26**. It must be created only after implementation and must include: exact feature-flag state, paired-device count, test command output, Android device/API evidence, protocol version, capability allow-list, security review findings, known deviations, a manual LAN test record, and rollback readiness.
