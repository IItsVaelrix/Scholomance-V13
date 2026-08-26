# DivTube Cockpit Android Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PDR's opt-in, LAN-only Android companion with authenticated pairing, certificate-pinned transport, safe Cockpit chat, live status, and explicitly confirmed queued downloads.

**Architecture:** The PC remains authoritative. A versioned Python protocol and HTTPS/WebSocket gateway adapt existing `PromptService` and `AgentService`; Android is a paired Compose client. Remote chat receives a server-selected read-only tool allow-list, while downloads use a separate validated confirmation path and never pass through the LLM or slash-command parser.

**Tech Stack:** Python 3.12 (`aiohttp` 3.14.3, `cryptography` 50.0.1, `qrcode` 8.2, `pytest` 9.1.1, Textual 8.2.8, Rich 15.0.0, OpenAI 3.3.1, Pillow 12.3.0, NumPy 2.5.2, yt-dlp 2026.8.19), Java 21/Gradle 8.5 for the existing backend, Android API 29+ with AGP 9.2.0/Gradle 9.4.1/Kotlin 2.3.21/Compose BOM 2026.08.00/OkHttp 5.5.0/Android Keystore, stdlib `unittest.mock` only at process/network boundaries.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-08-26-divtube-cockpit-android-companion-pdr.md`

## Global Constraints

- Default flags are `remote_companion.enabled=false`, `remote_companion.lan_enabled=false`, and `remote_companion.mode=off`.
- LAN mode requires TLS; there is no HTTP fallback and Android pins the paired PC certificate.
- Pairing offers are opaque, one-use, and expire after 10 minutes; PC stores only a password hash and Android stores its token in Keystore-backed encrypted preferences.
- Remote chat may advertise and execute only `read_file`, `find_symbol`, `list_project_tree`, and `read_import_graph`.
- Remote chat never receives provider credentials, raw configuration, absolute filesystem paths, raw shell output, or mutating tool arguments.
- Downloads require a valid supported HTTPS YouTube URL, media type `audio|video`, `rightsConfirmed=true`, an unseen request id, and queue admission before `AgentService.run_command`.
- Server event `seq` values are strictly increasing per `instanceId`; reconnect sends a snapshot before later events.
- Do not edit the user's unrelated `divtube_downloader/tui/services/token_meter.py` or `divtube_downloader/tests/test_token_meter.py` changes.
- Work in the current non-main feature branch because the approved PDR is uncommitted here; preserve unrelated dirty files with path-scoped edits and verification.
- Every production behavior follows red → green → refactor; record the expected failing assertion before implementation.

---

### Task 1: Canonical remote protocol and capability law

**Files:**
- Create: `divtube_downloader/tui/remote/__init__.py`
- Create: `divtube_downloader/tui/remote/protocol.py`
- Create: `divtube_downloader/tui/remote/capability_policy.py`
- Create: `divtube_downloader/tests/test_remote_protocol.py`
- Create: `divtube_downloader/tests/test_remote_capability_policy.py`
- Create: `divtube_downloader/requirements-remote.txt`
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`

**Interfaces:**
- Produces: `PROTOCOL_VERSION`, `ClientEnvelope.from_json(raw)`, `ServerEnvelope.to_json()`, `ProtocolError`, `RemoteCapabilityProfile`, and `filter_remote_tools(all_tools)`.
- Consumers: gateway, event hub, adapter, and Android decoder in later tasks.

- [ ] **Step 1: Write failing protocol tests** for exact envelope keys, protocol mismatch, unknown types, 8,000-codepoint chat maximum, rights confirmation, stable sorted JSON, and monotonically increasing server sequences. The primary test must assert `ClientEnvelope.from_json('{"protocolVersion":"divtube-remote-v1","type":"status.snapshot.request","requestId":"r-1","payload":{}}').type == "status.snapshot.request"`.
- [ ] **Step 2: Run red tests:** `cd divtube_downloader && uv run --with pytest==9.1.1 pytest tests/test_remote_protocol.py -q`. Expected: import failure for `tui.remote.protocol`.
- [ ] **Step 3: Implement frozen dataclasses and explicit allow-lists.** Reject missing/extra keys, booleans where integers are required, invalid UUID/request strings, unknown payload keys, non-HTTPS URLs, and unsupported hostnames. Serialize with `json.dumps(..., sort_keys=True, ensure_ascii=False, separators=(",", ":"))`.
- [ ] **Step 4: Write and run red capability tests:** include all current `ToolService.tools`, require exactly the four allowed names when present, and prove `run_command`, `bash_session`, `python_exec`, `replace_file_content`, and a future unknown tool are absent.
- [ ] **Step 5: Implement `filter_remote_tools` with a positive allow-list** and duplicate-name rejection; never infer safety from `is_coding_action`.
- [ ] **Step 6: Add `DivTubeRemoteProtocolV1` and a schema-change notice** to the active schema contract with the exact PDR message types and invariants.
- [ ] **Step 7: Add exact runtime/test dependencies** to `requirements-remote.txt`: `aiohttp==3.14.3`, `cryptography==50.0.1`, `qrcode[pil]==8.2`, `pytest==9.1.1`, `textual==8.2.8`, `rich==15.0.0`, `openai==3.3.1`, `Pillow==12.3.0`, `numpy==2.5.2`, and `yt-dlp==2026.8.19`.
- [ ] **Step 8: Run green tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_protocol.py tests/test_remote_capability_policy.py -q`.
- [ ] **Step 9: Commit path-scoped changes:** `git add divtube_downloader/tui/remote divtube_downloader/tests/test_remote_protocol.py divtube_downloader/tests/test_remote_capability_policy.py divtube_downloader/requirements-remote.txt 'docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md' && git commit -m "feat(divtube): define remote companion protocol"`.

### Task 2: Pairing, credentials, flags, and ordered event hub

**Files:**
- Create: `divtube_downloader/tui/remote/config.py`
- Create: `divtube_downloader/tui/remote/pairing.py`
- Create: `divtube_downloader/tui/remote/event_hub.py`
- Create: `divtube_downloader/tests/test_remote_pairing.py`
- Create: `divtube_downloader/tests/test_remote_event_hub.py`
- Modify: `divtube_downloader/.gitignore`

**Interfaces:**
- Consumes: Task 1 envelopes/errors.
- Produces: `RemoteCompanionConfig.from_env()`, `PairingStore.create_offer()`, `PairingStore.redeem()`, `PairingStore.authenticate()`, `PairingStore.revoke()`, `RemoteEventHub.publish()`, `RemoteEventHub.snapshot()`.

- [ ] **Step 1: Write red config tests** proving the default creates no LAN listener, `lan_enabled=true` is ignored unless `enabled=true`, and modes outside `off|status_only|chat_read_only|downloads_confirmed` fail closed.
- [ ] **Step 2: Write red pairing tests** using a temporary store and injected clock/random source. Assert 10-minute expiry, first-redemption success, second-redemption failure, Argon2/Scrypt/PBKDF hash storage rather than plaintext token, authentication, revocation, and five-failure rate limit.
- [ ] **Step 3: Run red tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_pairing.py -q`. Expected: missing modules/classes.
- [ ] **Step 4: Implement config and pairing** with `secrets.token_urlsafe(32)`, `hashlib.scrypt`, `hmac.compare_digest`, atomic JSON write (`tempfile` + `os.replace`), owner-only `0o600` files, and injected `now` for deterministic tests.
- [ ] **Step 5: Write red event-hub tests** asserting per-instance sequence order, a 256-event bounded backlog, deterministic active-job ordering, device-specific socket queues, and reconnect snapshot `lastSeq`.
- [ ] **Step 6: Implement the event hub** using `asyncio.Queue(maxsize=256)` and immutable serialized events. A full queue drops the stale connection, not arbitrary events.
- [ ] **Step 7: Ignore only generated remote secrets:** `.divtube-remote/`, `android/local.properties`, and Android build outputs; do not ignore source or test fixtures.
- [ ] **Step 8: Run green tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_pairing.py tests/test_remote_event_hub.py -q`.
- [ ] **Step 9: Commit:** `git add divtube_downloader/tui/remote divtube_downloader/tests/test_remote_pairing.py divtube_downloader/tests/test_remote_event_hub.py divtube_downloader/.gitignore && git commit -m "feat(divtube): add secure companion pairing"`.

### Task 3: TLS HTTPS/WebSocket gateway

**Files:**
- Create: `divtube_downloader/tui/remote/tls.py`
- Create: `divtube_downloader/tui/remote/gateway.py`
- Create: `divtube_downloader/tests/test_remote_gateway.py`
- Create: `divtube_downloader/tests/test_remote_tls.py`

**Interfaces:**
- Consumes: config, pairing, protocol, event hub.
- Produces: `ensure_local_certificate(state_dir)`, `RemoteGateway.start()`, `RemoteGateway.stop()`, `/v1/pair`, `/v1/status`, and authenticated `/v1/events` WebSocket.

- [ ] **Step 1: Write red TLS tests** proving certificate/key creation, SHA-256 fingerprint stability, file permissions, regeneration when certificate/key mismatch, and no plaintext HTTP runner in LAN mode.
- [ ] **Step 2: Write red gateway tests** with `aiohttp.test_utils`: disabled mode starts no site; pairing allows only a valid one-use offer; bearer middleware rejects missing/revoked credentials; status-only mode rejects chat/download; WebSocket sends snapshot before live events; body/message maximum is 32 KiB.
- [ ] **Step 3: Run red tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_tls.py tests/test_remote_gateway.py -q`. Expected: missing gateway/TLS APIs.
- [ ] **Step 4: Implement certificate creation with `cryptography`** using a local CA-less ECDSA P-256 certificate, SAN entries for the explicit bind host/local hostname, 365-day lifetime, owner-only key, and a returned `ssl.SSLContext`.
- [ ] **Step 5: Implement `aiohttp` application and middleware.** Register routes only for permitted feature modes, enforce JSON content type and byte limits, use bearer hash authentication, attach/detach event queues, and map `ProtocolError` to stable JSON errors.
- [ ] **Step 6: Run green gateway tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_tls.py tests/test_remote_gateway.py -q`.
- [ ] **Step 7: Commit:** `git add divtube_downloader/tui/remote divtube_downloader/tests/test_remote_tls.py divtube_downloader/tests/test_remote_gateway.py && git commit -m "feat(divtube): add authenticated TLS companion gateway"`.

### Task 4: Safe PromptService integration and Cockpit adapter

**Files:**
- Create: `divtube_downloader/tui/services/remote_cockpit_adapter.py`
- Create: `divtube_downloader/tests/test_remote_cockpit_adapter.py`
- Create: `divtube_downloader/tests/test_prompt_remote_policy.py`
- Modify: `divtube_downloader/tui/services/prompt_service.py`

**Interfaces:**
- Consumes: Task 1 capability policy, Task 2 event hub, existing `PromptService`.
- Produces: `PromptService.prompt(..., tools=None, on_finished=None)` and `RemoteCockpitAdapter.submit_chat(device_id, request_id, text)`.

- [ ] **Step 1: Write red PromptService tests** proving the desktop default still sees all tools, an explicit list is the only advertised/executable list, an unadvertised tool call raises a deterministic policy error, and `on_finished(ok, detail)` fires exactly once on success, provider failure, cancellation, and exception.
- [ ] **Step 2: Run red:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_prompt_remote_policy.py -q`. Expected: `prompt()` rejects the new keyword arguments.
- [ ] **Step 3: Implement explicit tool injection** through `_select_tools`, `_call_api(..., tools)`, and a pre-`execute_tool` membership check. Preserve `tools=None` as the existing desktop behavior.
- [ ] **Step 4: Add one terminal callback path** in the worker's `finally`; do not infer completion from display callback text.
- [ ] **Step 5: Write red adapter tests** proving device-scoped `remote:{device}:main` history, single-flight rejection, plain-text sanitization of Rich values, stable activity states, and lock release for every terminal path.
- [ ] **Step 6: Implement `RemoteCockpitAdapter`** with dependency injection; it publishes only sanitized activity/messages and the gateway-selected read-only tools.
- [ ] **Step 7: Run green targeted tests plus existing prompt/TUI tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_prompt_remote_policy.py tests/test_remote_cockpit_adapter.py tests/test_tui.py -q`.
- [ ] **Step 8: Commit:** `git add divtube_downloader/tui/services/prompt_service.py divtube_downloader/tui/services/remote_cockpit_adapter.py divtube_downloader/tests/test_prompt_remote_policy.py divtube_downloader/tests/test_remote_cockpit_adapter.py && git commit -m "feat(divtube): add read-only remote cockpit chat"`.

### Task 5: Idempotent confirmed download queue

**Files:**
- Create: `divtube_downloader/tui/services/remote_download_queue.py`
- Create: `divtube_downloader/tests/test_remote_download_queue.py`
- Modify: `divtube_downloader/tui/services/agent_service.py`
- Modify: `divtube_downloader/tui/services/remote_cockpit_adapter.py`

**Interfaces:**
- Consumes: validated Task 1 download payload, existing command constants and `AgentService.run_command` callbacks.
- Produces: `RemoteDownloadQueue.submit(request)`, `RemoteDownloadQueue.snapshot()`, `RemoteCockpitAdapter.submit_download(...)`.

- [ ] **Step 1: Write red queue tests** for rights confirmation, HTTPS YouTube host allow-list, audio/video mapping, FIFO single-worker order, request-id idempotency, percent clamping/monotonicity, one terminal event, disconnect continuation, and sanitized filename (basename only).
- [ ] **Step 2: Run red:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_download_queue.py -q`. Expected: missing queue.
- [ ] **Step 3: Extract an optional process-launch seam from `AgentService`** without changing defaults so tests can use a deterministic fake backend. Preserve `build_agent_inputs()` rights-confirmation `y` behavior.
- [ ] **Step 4: Implement queue and adapter mapping** with UUID job ids, an ordered request-id ledger, `queue.Queue`, one daemon worker, and event-hub callbacks.
- [ ] **Step 5: Run green tests plus existing resolver/TUI coverage:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_download_queue.py tests/test_java_resolver.py tests/test_tui.py -q`.
- [ ] **Step 6: Commit:** `git add divtube_downloader/tui/services/agent_service.py divtube_downloader/tui/services/remote_cockpit_adapter.py divtube_downloader/tui/services/remote_download_queue.py divtube_downloader/tests/test_remote_download_queue.py && git commit -m "feat(divtube): queue confirmed companion downloads"`.

### Task 6: Desktop lifecycle, pairing QR, and status surface

**Files:**
- Create: `divtube_downloader/tui/ui/widgets/remote_companion_status.py`
- Create: `divtube_downloader/tests/test_remote_companion_widget.py`
- Create: `divtube_downloader/tests/test_remote_lifecycle.py`
- Modify: `divtube_downloader/tui/ui/app.py`
- Modify: `divtube_downloader/tui/ui/layout.py`
- Modify: `divtube_downloader/tui/ui/app.tcss`

**Interfaces:**
- Consumes: gateway lifecycle, pairing offer URI/QR, event hub state.
- Produces: `/remote-status`, `/remote-pair`, `/remote-revoke`, and a compact accessible status widget.

- [ ] **Step 1: Write red widget/command tests** proving disabled/offline/paired states, unique legal Textual ids, descriptive labels independent of color, QR expiry text, and no secret token in logs after pairing completes.
- [ ] **Step 2: Write red lifecycle tests** proving disabled configuration constructs no listener, mount starts enabled gateway once, shutdown stops it, and late callbacks after exit are dropped.
- [ ] **Step 3: Run red tests:** `cd divtube_downloader && uv run --with-requirements requirements-remote.txt pytest tests/test_remote_companion_widget.py tests/test_remote_lifecycle.py -q`.
- [ ] **Step 4: Implement a focused widget and three commands.** Render QR as terminal-safe blocks through `qrcode`; show the fallback pairing URI only while the offer is active; never persist/log the nonce.
- [ ] **Step 5: Wire lifecycle through a service-owned runner** so Textual composition contains no HTTP/auth logic. Respect the existing shutdown-safe `call_from_thread` boundary.
- [ ] **Step 6: Run green tests and a live Textual pilot** that opens status, creates an offer, revokes it, and exits without an event-loop warning.
- [ ] **Step 7: Re-run sidebar structural/runtime parity** because three commands are added.
- [ ] **Step 8: Commit:** `git add divtube_downloader/tui/ui divtube_downloader/tests/test_remote_companion_widget.py divtube_downloader/tests/test_remote_lifecycle.py && git commit -m "feat(divtube): add companion pairing surface"`.

### Task 7: Android project, secure pairing, and pinned transport

**Files:**
- Create: `divtube_downloader/android/settings.gradle.kts`
- Create: `divtube_downloader/android/build.gradle.kts`
- Create: `divtube_downloader/android/gradle/libs.versions.toml`
- Create: `divtube_downloader/android/gradlew`
- Create: `divtube_downloader/android/gradlew.bat`
- Create: `divtube_downloader/android/gradle/wrapper/gradle-wrapper.jar`
- Create: `divtube_downloader/android/gradle/wrapper/gradle-wrapper.properties`
- Create: `divtube_downloader/android/app/build.gradle.kts`
- Create: `divtube_downloader/android/app/src/main/AndroidManifest.xml`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/data/Protocol.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/data/PairingStore.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/data/PinnedCockpitClient.kt`
- Create: `divtube_downloader/android/app/src/test/java/divtube/companion/data/ProtocolTest.kt`
- Create: `divtube_downloader/android/app/src/test/java/divtube/companion/data/PinnedCockpitClientTest.kt`

**Interfaces:**
- Consumes: `DivTubeRemoteProtocolV1` and pairing URI.
- Produces: strict Kotlin serializer models, Keystore-backed pairing record, pinned HTTPS/WebSocket client, reconnect/snapshot flow.

- [ ] **Step 1: Install the official user-local Android CLI if absent** with `curl -fsSL https://dl.google.com/android/cli/latest/linux_x86_64/install.sh | bash`; use it to install Android platform 37, Build Tools 36.0.0, platform-tools 37.0.1, emulator, and an API 37 x86_64 system image, then write the resolved SDK path to ignored `android/local.properties`.
- [ ] **Step 2: Generate and commit Gradle wrapper 9.4.1** using `JAVA_HOME=/home/deck/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-1.55.0-linux-x64/jre/21.0.11-linux-x86_64`; pin AGP 9.2.0, Kotlin 2.3.21, Compose BOM 2026.08.00, compile/target SDK 37, minimum SDK 29, Build Tools 36.0.0, OkHttp 5.5.0, kotlinx-serialization-json 1.11.0, activity-compose 1.13.0, and lifecycle-viewmodel-compose 2.10.0.
- [ ] **Step 3: Write red JVM protocol tests** for unknown enum/type failure, required fields, sequence rules, stable error decoding, and unsupported protocol version.
- [ ] **Step 4: Write red transport tests** with MockWebServer for pin mismatch, host mismatch, missing bearer token, reconnect snapshot ordering, and no authorization value in exception/log text.
- [ ] **Step 5: Run red:** `cd divtube_downloader/android && ./gradlew testDebugUnitTest`. Expected: missing data classes/client.
- [ ] **Step 6: Implement strict Kotlin models and pinned client** using `kotlinx.serialization`, OkHttp, encrypted preferences backed by Android Keystore, 32 KiB socket message limit, and exponential reconnect capped at 30 seconds.
- [ ] **Step 7: Run green JVM tests and lint:** `cd divtube_downloader/android && ./gradlew testDebugUnitTest lintDebug`.
- [ ] **Step 8: Commit:** `git add divtube_downloader/android && git commit -m "feat(divtube): add pinned Android cockpit transport"`.

### Task 8: Android Compose cockpit UI and instrumentation

**Files:**
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/MainActivity.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/CockpitViewModel.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/CockpitScreen.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/theme/Color.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/theme/Theme.kt`
- Create: `divtube_downloader/android/app/src/main/java/divtube/companion/ui/theme/Type.kt`
- Create: `divtube_downloader/android/app/src/test/java/divtube/companion/ui/CockpitViewModelTest.kt`
- Create: `divtube_downloader/android/app/src/androidTest/java/divtube/companion/ui/CockpitScreenTest.kt`

**Interfaces:**
- Consumes: Task 7 client state/events.
- Produces: pair/offline/connected screens, chat timeline/composer, agent activity, job list, rights-confirmation download form, revoke action.

- [ ] **Step 1: Write red ViewModel tests** for state reduction, stale sequence rejection, reconnect snapshot replacement, no optimistic download acceptance, and confirmation reset after submit.
- [ ] **Step 2: Write instrumentation tests** for TalkBack descriptions, error announcements, 200% text-safe scrolling, non-color-only connection state, disabled download button until rights checkbox, and revoke confirmation.
- [ ] **Step 3: Run red unit tests:** `cd divtube_downloader/android && ./gradlew testDebugUnitTest`. Expected: missing ViewModel/reducer.
- [ ] **Step 4: Implement immutable `CockpitUiState` and reducer**; make network effects injectable and keep composables stateless except transient input text.
- [ ] **Step 5: Implement Compose screen** with Material 3, LazyColumn chat/job regions, explicit offline banner, agent activity semantics, URL/media controls, rights checkbox, and no hidden privileged controls.
- [ ] **Step 6: Run unit/instrumented tests:** `./gradlew testDebugUnitTest connectedDebugAndroidTest`; if no hardware acceleration is available, run a software-rendered API 29+ emulator and record it.
- [ ] **Step 7: Build APK:** `./gradlew assembleDebug`; verify output exists and is not tracked.
- [ ] **Step 8: Commit:** `git add divtube_downloader/android/app && git commit -m "feat(divtube): add Android companion cockpit UI"`.

### Task 9: Documentation, PIR, full regression, and security release gate

**Files:**
- Modify: `divtube_downloader/README_TUI.md`
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260826-DIVTUBE-COCKPIT-ANDROID-COMPANION.md`
- Modify: `docs/scholomance-encyclopedia/PDR-archive/2026-08-26-divtube-cockpit-android-companion-pdr.md`
- Modify: `docs/scholomance-encyclopedia/PDR-archive/README.md`

**Interfaces:**
- Consumes: all prior deliverables and fresh verification evidence.
- Produces: operator setup, flags, pairing/revocation steps, exact test evidence, deviations, rollback, and final PDR status.

- [ ] **Step 1: Document installation and operation** including dependency install, JDK discovery, Android build, default-off flags, LAN bind warning, pair/revoke commands, firewall scope, and rollback.
- [ ] **Step 2: Run the complete Python suite:** `cd divtube_downloader && nice -n 19 uv run --with-requirements requirements-remote.txt pytest tests/ -q -p no:cacheprovider`. Record exact pass/fail count.
- [ ] **Step 3: Run Java:** `cd divtube_downloader && JAVA_HOME=/home/deck/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-1.55.0-linux-x64/jre/21.0.11-linux-x86_64 ./gradle-8.5/bin/gradle test`. Record result.
- [ ] **Step 4: Run Android:** `cd divtube_downloader/android && JAVA_HOME=/home/deck/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-1.55.0-linux-x64/jre/21.0.11-linux-x86_64 ./gradlew testDebugUnitTest lintDebug assembleDebug` and `connectedDebugAndroidTest`. Record separate results; do not represent an unavailable emulator as passing.
- [ ] **Step 5: Run security probes** for HTTP refusal, bad certificate pin, expired/replayed offer, revoked token, forbidden tool call, duplicate download id, secret/path redaction, and rate limits.
- [ ] **Step 6: Run live Textual probe** for boot, pair/status/revoke commands, sidebar parity, existing `/prompt`, existing `/download` argument mapping, and clean exit.
- [ ] **Step 7: Run repository checks:** `git diff --check`, `node docs/scholomance-encyclopedia/tools/audit-hygiene.mjs`, and a scoped search proving no secrets/build artifacts are tracked. Report pre-existing hygiene failures separately.
- [ ] **Step 8: Write the PIR from actual evidence,** change PDR/index status to `Implemented` only if every enforceable Definition-of-Done item passes, and list any unresolved item without euphemism.
- [ ] **Step 9: Request final architecture/security review** against the PDR and fix every load-bearing finding with a red test.
- [ ] **Step 10: Commit:** `git add divtube_downloader/README_TUI.md docs/scholomance-encyclopedia && git commit -m "docs(divtube): record Android companion implementation"`.
