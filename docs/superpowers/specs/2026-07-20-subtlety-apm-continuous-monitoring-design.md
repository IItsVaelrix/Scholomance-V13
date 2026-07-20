# Subtlety APM Continuous Monitoring Design

**Date:** 2026-07-20  
**Status:** Draft → user review  
**Related:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-15-subtlety-fingerprint-apm-pdr.md`  
**Bytecode / search:** `SCHOL-ENC-SPEC-SUBTLETY-APM-CONTINUOUS-v1`

## Goal

Wire the existing Subtlety Fingerprint APM so it can **continuously monitor** DivTube and the Node/Fly server, pick up **crashes instantly**, persist history, and notify agents — then expand to **route-level behavioral fingerprinting** on the same hub.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Crash sensors first, then route/unit fingerprint sampling (same program) |
| Storage | Dual-write: Resonance Store = history SoT; Closed-Loop symptoms → collab alerts |
| Recovery | Propose-only (alert + RAID + remediation proposal; no auto-patch) |
| Runtimes (v1 crash) | DivTube TUI + Node/Fly API |
| Architecture | Hub + adapters (single Subtlety Runtime) |

## Non-goals (v1)

- Browser/client error beacons
- Auto-heal / trusted-lane patch apply
- Static “watch every file” or full-repo AST scanning as the APM
- Replacing latency/error/saturation metrics
- Dashboards / GrimDesign surfaces (downstream consumers later)

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐
│ DivTube crash   │     │ Node/Fly process │
│ + thread hook   │     │ + Fastify errors │
└────────┬────────┘     └────────┬─────────┘
         │  crash event          │
         └──────────┬────────────┘
                    ▼
         ┌──────────────────────┐
         │ Subtlety Runtime Hub │  (codex/core + server)
         │  createSubtletyApm() │
         │  ingestCrash()       │
         │  assess() → lenses   │
         └──────────┬───────────┘
          ┌─────────┴─────────┐
          ▼                   ▼
 ┌────────────────┐   ┌─────────────────┐
 │ Resonance Store│   │ Collab alerts   │
 │ append-only    │   │ (propose-only)  │
 │ fingerprint +  │   │ + RAID symptom  │
 │ healing ledger │   │ attached        │
 └────────────────┘   └─────────────────┘

Phase 2 (same hub):
  executeRoute / selected paths → recordObserved() → same assess/dual-write
```

### Laws

- `observed` mode never re-runs business work (PDR §3.2).
- Hub and lens logic live in core/service — not render-adjacent.
- Closed-Loop never auto-applies patches in v1; proposals only (PDR Phase 3 posture).
- APM failure must never create a secondary crash loop.

## Components

| Component | Responsibility |
|-----------|----------------|
| `subtlety-runtime.js` | Process singleton: APM instance, store I/O, `ingestCrash`, `recordObserved`, `assessAndNotify` |
| `subtlety-resonance-store.js` | Append-only ledger (JSONL preferred for v1) of fingerprint packets + healing proposals; sealed records |
| `subtlety-crash-ingest.js` | Normalize crash events → structured output + seam vocabulary → fingerprint + assess |
| DivTube adapter | Extend `_persist_crash` / `threading.excepthook`: POST crash JSON to hub ingest HTTP endpoint; on failure write spool (never block shutdown) |
| Node adapter | `uncaughtException`, `unhandledRejection`, Fastify `setErrorHandler` → ingest; do not swallow fatal exits |
| Collab bridge | On Closed-Loop symptom: create collab alert with Subtlety identity packet + RAID best-effort result |
| MCP (thin) | Read surface: latest assessment / store tail so agents need not scrape logs |
| Phase 2 hook | `executeRoute` (and later selected Fastify routes): `recordObserved` on already-produced output only |

### Normalized crash event

```js
{
  runtime: 'divtube-tui' | 'node-fly',
  unitId: string,           // e.g. crash.divtube.tui.archive_search_apply
  errorType: string,
  message: string,
  stack: string,
  thread: string | null,
  filePaths: string[],
  timestamp: string,        // ISO-8601
  buildId: string | null,
}
```

Fingerprinted as observed output:

```js
{ ok: false, applied: false, error: { type, message, site, thread }, seam: string }
```

with seam `consumes` / `emits` marking the crash boundary (e.g. emit `thread.crash.<ErrorName>`).

## Data flow

### Crash happy path

1. Hook captures exception → keep existing local crash log (DivTube file writer).
2. Normalize → `ingestCrash` → `recordObserved` on unit `crash.<runtime>.<site>`.
3. `assess()` runs Lens I (drift), II (seam), III (closed-loop).
4. Append fingerprint + assessment to Resonance Store.
5. For each Closed-Loop symptom: best-effort `raid_query` → collab alert with propose-only remediation (`allowed: false` / `action: propose-only`).
6. Original process exit / rethrow policy unchanged.

### DivTube when Node hub is down

- Spool crash JSON under `divtube_downloader/subtlety-spool/` (gitignored).
- Hub drains spool on connect / bridge heartbeat / server boot.
- Never block TUI shutdown on ingest.

### Node ingest failure

- Resonance Store write is best-effort + stderr log.
- Alert emit is best-effort.
- Never throw from ingest into the original error path in a way that masks the primary failure.

### Dedup

Within a short window (default 60s), same `unitId` + `errorType` + top stack frame → one alert; ledger entry increments `occurrenceCount`.

### Phase 2 sampling

- Behind feature flag (default off until rolled out).
- `recordObserved` after successful route output only.
- Never re-execute the route for fingerprinting.

## Resonance Store (v1)

- Path: configurable; default under server data dir (e.g. `codex/server/data/subtlety-resonance.jsonl`) or env `SUBTLETY_RESONANCE_PATH`.
- One JSON object per line: `{ schema, recordedAt, kind: 'fingerprint' | 'assessment' | 'healing-proposal', payload, checksum }`.
- Append-only; readers tail / scan. No silent rewrite of history.
- Collab SQLite is **not** the fingerprint history SoT — alerts only.

## Integration points (existing)

| Existing | Role |
|----------|------|
| `createSubtletyApm` / fingerprint / lenses | Core assess pipeline |
| DivTube `_persist_crash` + thread excepthook | Crash source (already writes logs) |
| Fastify `setErrorHandler` in `codex/server/index.js` | Request-path errors |
| Collab `alerts.create` | Agent-visible instant notification |
| `raid_query` | Best-effort pattern match on Closed-Loop symptoms |
| `executeRoute` | Phase 2 observed sampling hook |

## Testing

- Crash normalize: `NoActiveAppError` fixture → sealed fingerprint packet
- Hub ingest: store append + Closed-Loop propose-only
- Dedup: two identical crashes in-window → one alert, `occurrenceCount: 2`
- Spool: ingest fail → spool file; drain empties spool and appends store
- Node adapter: Fastify error + `unhandledRejection` invoke ingest without swallowing
- Phase 2 (when built): `recordObserved` does not re-invoke route fn

## Rollout

1. Hub + Resonance Store + crash ingest (unit tests)
2. Wire Node/Fly adapters + collab alert dual-write
3. Wire DivTube `_persist_crash` + spool/drain
4. MCP read surface
5. Phase 2: `executeRoute` observed sampling behind flag

## Acceptance criteria

1. A DivTube thread crash produces a Resonance Store fingerprint entry and a collab alert within the ingest path (or spool → drain if hub was down).
2. A Node unhandled rejection / Fastify 500 path produces the same dual-write without changing exit/rethrow semantics for fatal process hooks.
3. Closed-Loop never auto-applies a patch; proposals are propose-only.
4. Duplicate crashes in the dedup window do not spam one alert per occurrence.
5. APM ingest failures do not replace or hide the original crash.
6. Phase 2 sampling (when enabled) never re-runs the observed unit.

## Open follow-ups (explicit, not blockers)

- Seed a RAID PAT for Textual `NoActiveAppError` / ContextVar thread seam (current RAID match is ambiguous).
- Browser beacons (deferred).
- Trusted-lane auto-heal (deferred to PDR Phase 4).
- JSONL → SQLite migration if ledger volume demands it.
