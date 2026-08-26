# PIR: DivTube Cockpit Android Companion

**Date:** 2026-08-26
**PDR:** `PDR-archive/2026-08-26-divtube-cockpit-android-companion-pdr.md`
**Release status:** Implementation complete; Android device-instrumentation gate not yet passed

## Delivered

- Versioned `DivTubeRemoteProtocolV1` with exact client/server envelopes,
  deterministic JSON, bounded payloads, safe server schemas, and ordered
  snapshot/event sequencing.
- Default-off `aiohttp` HTTPS/WebSocket gateway with local ECDSA TLS identity,
  certificate fingerprint pairing, bearer authentication, body/socket bounds,
  feature-mode gates, and per-device request/authentication rate limits.
- One-use ten-minute pairing offers; Scrypt hash-only persistence, atomic
  owner-only state, revocation, and deterministic corrupt-state rejection.
- Device-scoped, single-flight Cockpit chat using only the positive read-only
  tool allow-list; no provider credentials or privileged tools cross the
  boundary.
- Separate rights-confirmed, HTTPS-YouTube-only, idempotent FIFO download path
  with monotonic progress, one terminal event, and basename-only filenames.
- Textual status widget and `/remote-status`, `/remote-pair`, and
  `/remote-revoke` commands with QR expiry text and shutdown-safe gateway
  lifecycle.
- Native Compose Android app (API 29+) with Keystore AES-GCM pairing storage,
  certificate-DER fingerprint verification, strict event decoding, bounded
  WebSocket messages, reconnect backoff, chat, status, job progress, and a
  separate rights-confirmation download form.

## Security boundary

The PC remains authoritative. Remote requests cannot invoke shell, Python,
write, provider, deployment, or arbitrary slash-command paths. Downloads do
not pass through the LLM. LAN transport is TLS-only and Android verifies the
paired certificate fingerprint while normal hostname verification remains in
force. The gateway remains disabled unless explicitly enabled.

## Verification evidence

- Protocol/pairing/event/TLS/gateway focused Python gate: 80 passed before
  service/UI integration.
- Service/UI focused gates: prompt policy, adapter, queue, lifecycle, widget,
  sidebar, and legacy TUI tests passed in their targeted runs.
- Full Python run after implementation initially reported 540 passed, 2
  failures, 13 subtests: one pre-existing bash-session timeout recovery race;
  one tracked-wrapper-JAR hygiene failure. The wrapper binary was then removed
  from Git and replaced by a checksum-pinned first-run bootstrap. Final rerun
  evidence: after the wrapper fix and shutdown/exec-session repair, the fresh
  full run exited normally with **542 passed, 13 subtests passed, and one
  unrelated collection warning** in 88.69 seconds.
- Final gateway-rate-limit, shell-timeout-recovery, and TUI regression gate:
  **8 passed** in 1.95 seconds.
- Existing Java backend: Gradle build successful (`test NO-SOURCE`).
- Android JVM unit tests: Gradle build successful.
- Android lint and debug APK assembly: successful; generated APK is ignored.
- Android emulator: normal launch failed because host `libpulse.so.0` is
  absent. Headless `-no-audio`, SwiftShader, `-accel off` launch attached to
  ADB, but Android did not set `sys.boot_completed=1` within a bounded
  additional 240-second window under software TCG. Therefore
  `connectedDebugAndroidTest` is not represented as passing.
- Encyclopedia hygiene audit: **185 errors and 22 warnings**, still failing on
  repository-wide pre-existing index/search-anchor debt. This PDR is indexed
  and its PIR is linked; the one newly observed unindexed episodic-ledger PDR
  arrived concurrently and is outside this implementation's paths.

## Deviations and residual risk

- Instrumented Compose assertions exist but have not executed on a booted
  Android device in this host environment. This blocks plain `Implemented`
  status under the PDR Definition of Done.
- Late Textual callbacks/typewriter work and prompt/agent worker shutdown were
  hardened during verification; the final full suite exits normally without
  the previous post-summary thread traces.
- Public internet exposure, remote privileged tools, and shared desktop chat
  history remain deliberately out of scope.

## Rollback

Set `DIVTUBE_REMOTE_COMPANION_MODE=off` or unset
`DIVTUBE_REMOTE_COMPANION_ENABLED`, then restart. This starts no listener.
Revoking devices invalidates bearer credentials; deleting `.divtube-remote/`
also rotates the local TLS identity and removes pairing state.
