# Security Policy

Scholomance is a monorepo. The surface with real remote attack exposure is the
**DivTube phone companion** (`divtube_downloader/tui/remote/`) and the
**subprocess boundary** around `yt-dlp` (`divtube_downloader/src/main/java/`).
Start threat modelling there.

## Reporting a vulnerability

**Do not open a public issue.** Email `dev@scholomance.local` with:

- the module and file path,
- a concrete reproduction,
- what the flaw grants an attacker.

Expect an acknowledgement within 5 business days. We treat a working PoC as the
fastest path to a fix; a report that only asserts a class of problem without a
repro is triaged below one that has a repro.

### What we consider in scope

| Surface | Why it matters |
| --- | --- |
| Pairing / TLS trust (`remote/pairing.py`, `remote/tls.py`) | A flawed pairing flow lets an off-device attacker bind to the cockpit as a trusted phone. |
| Capability policy (`remote/capability_policy.py`) | The remote profile is meant to be **read-only**. Any path that lets a remote client reach an execution-capable parameter is a vulnerability, not a bug report. |
| Gateway auth + rate limiting (`remote/gateway.py`) | Per-device and per-message-type limits are the DoS backstop. |
| URL → process arguments (`validation/YouTubeUrlValidator.java` → `YtDlpProvider.java`) | User input becomes a `ProcessBuilder` argument. Validation bypass here is arbitrary argument injection. |
| Action journal (`remote/action_journal.py`) | If an action can be performed without being journalled, the audit trail is not trustworthy. |
| Secret handling | `.env` is gitignored and `.env.example` ships empty values. Any committed credential is a vulnerability regardless of how it got there. |

### What is out of scope

- Vulnerabilities requiring you to already control the user's machine,
  `~/.divtube-remote/` state directory, or their `JAVA_HOME`.
- The `Unlicense`-dedicated third-party CLI we shell out to (`yt-dlp`) — report
  those upstream; we will pin and note the fix here.
- Findings in the Godot/React game client that do not cross into a trust
  boundary.

## Threat model as currently implemented

This is a description of the intended behaviour. A deviation from it is a bug.

**Network exposure is opt-in and closed by default.**
`RemoteCompanionConfig.bind_host` (`remote/config.py`) returns `127.0.0.1`
unless `DIVTUBE_REMOTE_COMPANION_LAN_ENABLED` is explicitly enabled, in which
case it returns `0.0.0.0`. The cockpit is loopback-only until a user asks
otherwise.

**The certificate covers the host actually bound.**
`gateway.py` passes the real bind host into `ensure_local_certificate`. Passing
`127.0.0.1` when binding `0.0.0.0` would issue a loopback-only certificate and
silently break LAN clients, so the wildcard is preserved deliberately. This is
not a missing hostname check.

**Key material is authenticated and fingerprint-pinned.**
TLS ≥ 1.2 pinned, EC P-256, SHA-256, state directory `0700` and private key
`0600`, certificate↔key mismatch detection, randomised serial, LAN IP in the SAN.
Fingerprint pinning **and** hostname verification are both intended to remain in
force — pinning alone is not a substitute for verification.

**Pairing offers are single-use and short-lived.**
An offer carries `expiresAt`, a `used` flag, and an `scrypt` token hash
(`{algorithm, salt, digest}`). Schema validation is strict: the key set must
match exactly and `algorithm` must be `scrypt` (`pairing.py`). An expired or
already-used offer is rejected at `pairing.py`.

**The remote agent profile is read-only by construction, twice.**
`REMOTE_READ_ONLY_TOOLS` is an allowlist. `FORBIDDEN_REMOTE_PARAMETERS` holds
`eval` and `args` — `microscope` reads code, but those two parameters turn it
into `code_eval` and **run** the target. They are stripped from the schema the
remote client is shown (it cannot request what it cannot see) *and* rejected
server-side if one arrives anyway. A tool is only as safe as its narrowest
advertised surface; if you find a tool where a parameter class survives one of
those two layers, that is a reportable vulnerability.

**Every remote action is journalled** (`remote/action_journal.py`).

## Unresolved risk we want help with

**Rights enforcement is a user attestation, not a control.**
`LegalPolicyGuard.validate()` checks `userConfirmedRights()` and nothing else.
There is deliberately no access-control bypass check here: the former
`urlRequiresLoginKnown()` predicate returned a hardcoded `false`, so it could
not enforce the claim it was attached to and was removed rather than left as a
fig leaf. The real "is this private/age/login-gated" signal comes from `yt-dlp`
stderr parsing in `YtDlpProvider.analyze()`, which is best-effort. Treat the
rights confirmation as a UI promise to the operator, not a security boundary.

## Supported versions

| Branch | Status |
| --- | --- |
| `main` | Fully supported. CI: `.github/workflows/divtube.yml`. |
| Anything else | Best effort; assume unsupported. |

## Automated checks

`divtube.yml` runs the Python suite, the cockpit UI guard rails, `pip-audit`
against the fully `==`-pinned `requirements-remote.txt`, and a clean Java
compile + JUnit run. It is a build gate, not a scanner: it does not currently
cover the Android module or SAST.
