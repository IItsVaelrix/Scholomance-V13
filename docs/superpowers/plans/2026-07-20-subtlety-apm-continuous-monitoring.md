# Subtlety APM Continuous Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Subtlety Fingerprint APM into a continuous hub that ingests DivTube + Node/Fly crashes instantly (Resonance Store + collab alerts, propose-only), then add optional `executeRoute` observed sampling on the same hub.

**Architecture:** Single Node Subtlety Runtime (APM + append-only JSONL Resonance Store + assess/notify). Crash adapters on DivTube (HTTP POST + spool) and Node/Fly (process + Fastify hooks). Closed-Loop is propose-only; dual-write history to Resonance Store and agent-visible collab alerts.

**Tech Stack:** Node ESM (`codex/core/pixelbrain`), Fastify (`codex/server`), Vitest, DivTube Python TUI (`divtube_downloader/tui`), collab persistence alerts, existing `createSubtletyApm` / fingerprint / lenses

**Spec:** `docs/superpowers/specs/2026-07-20-subtlety-apm-continuous-monitoring-design.md`

## Global Constraints

- Crash sensors first; route sampling is Phase 2 behind a flag (default off)
- Resonance Store is fingerprint history SoT; collab alerts are notification only
- Closed-Loop: propose-only — never auto-apply patches in this plan
- `observed` mode never re-runs business work
- APM ingest failures must not mask or replace the original crash
- Hub logic stays in core/service (not render-adjacent)
- Out of scope: browser beacons, auto-heal, full-repo static watch, dashboards
- **Do not auto-commit** unless the user explicitly asks (skip commit steps otherwise)

## File Structure

| File | Responsibility |
|------|----------------|
| `codex/core/pixelbrain/subtlety-resonance-store.js` | Append-only JSONL ledger + checksum seal |
| `codex/core/pixelbrain/subtlety-crash-ingest.js` | Normalize crash events → fingerprintable output + identity |
| `codex/core/pixelbrain/subtlety-runtime.js` | Singleton hub: APM + store + ingestCrash + assessAndNotify + dedup |
| `codex/server/routes/subtlety.routes.js` | `POST /subtlety/crash` ingest + `GET /subtlety/status` |
| `codex/server/index.js` | Register routes; install Node crash adapters at boot |
| `codex/server/collab/mcp-bridge.js` | Thin MCP tools: subtlety status / latest |
| `codex/core/pixelbrain/microprocessor-route.js` | Phase 2: optional `recordObserved` after execute |
| `divtube_downloader/tui/services/subtlety_crash_forward.py` | POST crash JSON or spool |
| `divtube_downloader/tui/ui/app.py` | Call forwarder from `_persist_crash` |
| `.gitignore` | Ignore `divtube_downloader/subtlety-spool/` and local resonance JSONL if needed |
| `tests/codex/core/pixelbrain/subtlety-resonance-store.test.js` | Store tests |
| `tests/codex/core/pixelbrain/subtlety-crash-ingest.test.js` | Normalize + NoActiveApp fixture |
| `tests/codex/core/pixelbrain/subtlety-runtime.test.js` | Hub, dedup, propose-only |
| `tests/codex/server/subtlety-routes.test.js` | HTTP ingest (if pattern exists) or unit with inject |
| `divtube_downloader/tests/test_subtlety_crash_forward.py` | Spool + POST failure path |

---

### Task 1: Resonance Store (append-only JSONL)

**Files:**
- Create: `codex/core/pixelbrain/subtlety-resonance-store.js`
- Create: `tests/codex/core/pixelbrain/subtlety-resonance-store.test.js`

**Interfaces:**
- Consumes: `sha256Hex` from `./sha256.js`, `canonicalStringify` from `./canonical-json.js`
- Produces:
  - `SUBTLETY_RESONANCE_SCHEMA = 'SUBTLETY-RESONANCE-RECORD-v1'`
  - `createResonanceStore({ path, now? })` → `{ append(kind, payload), readAll(), tail(n), path }`
  - Record shape: `{ schema, recordedAt, kind: 'fingerprint'|'assessment'|'healing-proposal', payload, checksum }`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createResonanceStore, SUBTLETY_RESONANCE_SCHEMA } from '../../../../codex/core/pixelbrain/subtlety-resonance-store.js';

describe('subtlety-resonance-store', () => {
  let dir;
  let path;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'subtlety-res-'));
    path = join(dir, 'ledger.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('appends sealed records and readAll round-trips', () => {
    const store = createResonanceStore({ path, now: () => '2026-07-20T00:00:00.000Z' });
    const rec = store.append('fingerprint', { unitId: 'crash.test', ok: false });
    expect(rec.schema).toBe(SUBTLETY_RESONANCE_SCHEMA);
    expect(rec.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(store.readAll()).toHaveLength(1);
    expect(store.tail(1)[0].payload.unitId).toBe('crash.test');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-resonance-store.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```js
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256Hex } from './sha256.js';
import { canonicalStringify } from './canonical-json.js';

export const SUBTLETY_RESONANCE_SCHEMA = 'SUBTLETY-RESONANCE-RECORD-v1';

function seal(record) {
  const { checksum: _c, ...body } = record;
  return { ...body, checksum: sha256Hex(canonicalStringify(body)) };
}

export function createResonanceStore({ path, now = () => new Date().toISOString() } = {}) {
  if (!path) throw new TypeError('createResonanceStore requires path');
  mkdirSync(dirname(path), { recursive: true });

  function append(kind, payload) {
    const record = seal({
      schema: SUBTLETY_RESONANCE_SCHEMA,
      recordedAt: now(),
      kind,
      payload,
    });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  function readAll() {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  function tail(n = 20) {
    return readAll().slice(-Math.max(0, n));
  }

  return { append, readAll, tail, path };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-resonance-store.test.js`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add codex/core/pixelbrain/subtlety-resonance-store.js tests/codex/core/pixelbrain/subtlety-resonance-store.test.js
git commit -m "feat(subtlety): append-only Resonance Store for APM history"
```

---

### Task 2: Crash ingest normalizer

**Files:**
- Create: `codex/core/pixelbrain/subtlety-crash-ingest.js`
- Create: `tests/codex/core/pixelbrain/subtlety-crash-ingest.test.js`

**Interfaces:**
- Consumes: none (pure normalize)
- Produces:
  - `normalizeCrashEvent(raw)` → `{ identity, output, seam, dedupKey }`
  - `identity`: `{ unitId, unitKind: 'path', contractVersion: 'crash-v1', implementationVersion, canonicalCorpusId: 'corpus-crash-v1', runtimeProfile, buildId }`
  - `output`: `{ ok: false, applied: false, error: { type, message, site, thread }, seam }`
  - `seam`: `{ consumes: string[], emits: string[], mutates: [] }`
  - `dedupKey`: string (`unitId|errorType|topFrame`)

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { normalizeCrashEvent } from '../../../../codex/core/pixelbrain/subtlety-crash-ingest.js';

describe('subtlety-crash-ingest', () => {
  it('normalizes NoActiveAppError DivTube thread crash', () => {
    const n = normalizeCrashEvent({
      runtime: 'divtube-tui',
      unitId: 'crash.divtube.tui.archive_search_apply',
      errorType: 'textual._context.NoActiveAppError',
      message: 'NoActiveAppError',
      stack: 'File "tui/ui/app.py", line 284, in run\n    self.app.call_from_thread(...)\ntextual._context.NoActiveAppError',
      thread: 'Thread-32 (run)',
      filePaths: ['divtube_downloader/tui/ui/app.py'],
      timestamp: '2026-06-27T03:03:39',
      buildId: 'crash-20260627-030339',
    });
    expect(n.identity.unitId).toBe('crash.divtube.tui.archive_search_apply');
    expect(n.identity.runtimeProfile).toBe('divtube-tui');
    expect(n.output.ok).toBe(false);
    expect(n.output.error.type).toBe('textual._context.NoActiveAppError');
    expect(n.seam.emits).toContain('thread.crash.NoActiveAppError');
    expect(n.dedupKey).toContain('NoActiveAppError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-crash-ingest.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```js
function topStackFrame(stack) {
  if (!stack) return 'unknown';
  const line = String(stack).split('\n').map((l) => l.trim()).find((l) => /File "|at /.test(l));
  return line || 'unknown';
}

function shortErrorName(errorType) {
  const s = String(errorType || 'Error');
  const parts = s.split('.');
  return parts[parts.length - 1] || 'Error';
}

export function normalizeCrashEvent(raw = {}) {
  const runtime = raw.runtime || 'node-fly';
  const errorType = raw.errorType || 'Error';
  const unitId = raw.unitId || `crash.${runtime}.unspecified`;
  const topFrame = topStackFrame(raw.stack);
  const short = shortErrorName(errorType);
  return {
    identity: {
      unitId,
      unitKind: 'path',
      contractVersion: 'crash-v1',
      implementationVersion: raw.implementationVersion || 'crash-observed-1',
      canonicalCorpusId: 'corpus-crash-v1',
      runtimeProfile: runtime,
      buildId: raw.buildId ?? null,
    },
    output: {
      ok: false,
      applied: false,
      error: {
        type: errorType,
        message: raw.message || '',
        site: topFrame,
        thread: raw.thread ?? null,
      },
      seam: `crash.${runtime}`,
    },
    seam: {
      consumes: ['process.exception'],
      emits: [`thread.crash.${short}`],
      mutates: [],
    },
    dedupKey: `${unitId}|${errorType}|${topFrame}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-crash-ingest.test.js`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 3: Subtlety Runtime hub (ingest + assess + dedup + propose-only notify)

**Files:**
- Create: `codex/core/pixelbrain/subtlety-runtime.js`
- Create: `tests/codex/core/pixelbrain/subtlety-runtime.test.js`

**Interfaces:**
- Consumes: `createSubtletyApm`, `normalizeCrashEvent`, `createResonanceStore`, `compareFingerprints` (optional)
- Produces:
  - `createSubtletyRuntime({ store, apm?, alertFn?, raidFn?, dedupWindowMs?, now? })`
  - `ingestCrash(rawEvent)` → `{ packet, assessment, alert, deduped, occurrenceCount }`
  - `getStatus()` → `{ storePath, recent: store.tail(20), dedupSize }`
  - `alertFn({ symptom, proposal, packet, assessment, raid })` — injected; default no-op
  - Dedup window default `60_000` ms

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createResonanceStore } from '../../../../codex/core/pixelbrain/subtlety-resonance-store.js';
import { createSubtletyRuntime } from '../../../../codex/core/pixelbrain/subtlety-runtime.js';

describe('subtlety-runtime', () => {
  let dir;
  let alerts;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'subtlety-rt-'));
    alerts = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const sample = {
    runtime: 'divtube-tui',
    unitId: 'crash.divtube.tui.archive_search_apply',
    errorType: 'textual._context.NoActiveAppError',
    message: 'NoActiveAppError',
    stack: 'File "tui/ui/app.py", line 284, in run',
    thread: 'Thread-32',
    buildId: 'b1',
  };

  it('ingests crash, appends store, propose-only alert; dedups within window', () => {
    const store = createResonanceStore({ path: join(dir, 'r.jsonl') });
    let t = 1_000;
    const rt = createSubtletyRuntime({
      store,
      now: () => t,
      dedupWindowMs: 60_000,
      alertFn: (a) => alerts.push(a),
      raidFn: async () => ({ verdict: 'DENIED', confidence: 0 }),
    });
    const a = rt.ingestCrash(sample);
    expect(a.deduped).toBe(false);
    expect(a.packet.fingerprint.semanticChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(store.readAll().some((r) => r.kind === 'fingerprint')).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].proposal.action || alerts[0].proposal.allowed).toBeTruthy();
    // propose-only: allowed must be false when no matching baseline approval
    expect(alerts[0].proposal.allowed).toBe(false);

    t = 2_000;
    const b = rt.ingestCrash(sample);
    expect(b.deduped).toBe(true);
    expect(b.occurrenceCount).toBe(2);
    expect(alerts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-runtime.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `createSubtletyRuntime`:
1. `normalizeCrashEvent` → `apm.recordObserved(identity, output, { seam, mode: 'observed' })`
2. `store.append('fingerprint', packet)`
3. `assessment = apm.assess(unitId)`
4. `store.append('assessment', assessment)`
5. Dedup map: key → `{ at, occurrenceCount, lastAlert }`
6. If not deduped: for each `assessment.recovery.proposals[i]` paired with symptoms, call `raidFn` best-effort, then `alertFn`; mark proposals propose-only (`allowed: false`, `action: 'propose-only'` if missing)
7. Wrap all steps in try/catch; on failure return `{ ok: false, error }` without throwing
8. Export process singleton helper `getSubtletyRuntime(opts)` lazy-init using `process.env.SUBTLETY_RESONANCE_PATH` or default `codex/server/data/subtlety-resonance.jsonl`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-runtime.test.js`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 4: HTTP ingest route + collab alert bridge

**Files:**
- Create: `codex/server/routes/subtlety.routes.js`
- Modify: `codex/server/index.js` — `fastify.register(subtletyRoutes)` (near other route plugins)
- Modify: `codex/server/collab/collab.service.js` or routes — add `issueSubtletyAlert(identityPacket)` if no simpler path; prefer calling existing `alerts.create` with a synthetic message targeting all agents / a dedicated `subtlety-monitor` recipient
- Create: `tests/codex/server/subtlety-routes.test.js` (or extend existing collab route test pattern)

**Interfaces:**
- Consumes: `getSubtletyRuntime`, `collabPersistence.alerts.create` (or collabService helper)
- Produces:
  - `POST /subtlety/crash` body = crash event JSON → `{ ok, deduped, occurrenceCount, unitId }`
  - `GET /subtlety/status` → runtime `getStatus()`
  - Alert `identity_packet` includes `source: 'subtlety-fingerprint-apm'`, symptom codes, propose-only proposal

- [ ] **Step 1: Write failing route/unit test** for POST ingest returning 200 and appending store (use temp path via env in test)

- [ ] **Step 2: Implement `subtlety.routes.js`**

```js
import { getSubtletyRuntime } from '../../core/pixelbrain/subtlety-runtime.js';

export async function subtletyRoutes(fastify) {
  fastify.post('/subtlety/crash', async (request, reply) => {
    try {
      const rt = getSubtletyRuntime({ alertFn: fastify.subtletyAlertFn });
      const result = await Promise.resolve(rt.ingestCrash(request.body || {}));
      return reply.code(200).send({
        ok: true,
        deduped: result.deduped,
        occurrenceCount: result.occurrenceCount,
        unitId: result.packet?.identity?.unitId ?? null,
      });
    } catch (err) {
      request.log?.error?.({ err }, '[subtlety] ingest failed');
      return reply.code(200).send({ ok: false, error: 'ingest-failed' }); // never 500-loop
    }
  });

  fastify.get('/subtlety/status', async (_request, reply) => {
    const rt = getSubtletyRuntime();
    return reply.send(rt.getStatus());
  });
}
```

Wire `fastify.subtletyAlertFn` at boot to create collab alerts (best-effort). If collab DB unavailable, log and continue.

- [ ] **Step 3: Register in `codex/server/index.js`** after collab routes are available

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-runtime.test.js tests/codex/server/subtlety-routes.test.js`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 5: Node/Fly process + Fastify adapters

**Files:**
- Create: `codex/server/subtlety-node-adapter.js`
- Modify: `codex/server/index.js` — call `installSubtletyNodeAdapters({ fastify })` once after Fastify is created; wrap existing `setErrorHandler`

**Interfaces:**
- Produces: `installSubtletyNodeAdapters({ ingest?, logger? })`
  - hooks `uncaughtException`, `unhandledRejection` → ingest then rethrow / existing exit policy
  - wraps Fastify error handler: on `statusCode >= 500`, ingest then continue existing reply logic

- [ ] **Step 1: Write failing test** with mock ingest counting calls for a synthetic rejection handler export `reportNodeCrash(err, meta)`

```js
import { describe, it, expect, vi } from 'vitest';
import { reportNodeCrash } from '../../../codex/server/subtlety-node-adapter.js';

it('maps Error to crash event and calls ingest once', () => {
  const ingest = vi.fn(() => ({ deduped: false }));
  const err = new Error('boom');
  err.stack = 'Error: boom\n    at Object.<anonymous> (codex/server/index.js:10:5)';
  reportNodeCrash(err, { runtime: 'node-fly', unitId: 'crash.node-fly.unhandled', ingest });
  expect(ingest).toHaveBeenCalledTimes(1);
  expect(ingest.mock.calls[0][0].errorType).toBe('Error');
});
```

- [ ] **Step 2: Implement adapter** — never throw from ingest; for `uncaughtException` still allow process to exit as before after ingest

- [ ] **Step 3: Wire into `index.js`** without changing response shape of existing error handler

- [ ] **Step 4: Run tests** — PASS

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 6: DivTube crash forwarder + spool

**Files:**
- Create: `divtube_downloader/tui/services/subtlety_crash_forward.py`
- Modify: `divtube_downloader/tui/ui/app.py` — `_persist_crash` calls forwarder after writing logs
- Modify: `.gitignore` — add `divtube_downloader/subtlety-spool/`
- Create: `divtube_downloader/tests/test_subtlety_crash_forward.py`
- Modify: `codex/server/routes/subtlety.routes.js` or boot — `drainSubtletySpool(spoolDir)` optional on server start if `SUBTLETY_SPOOL_DIR` set (also callable from DivTube bridge)

**Interfaces:**
- Produces (Python):
  - `forward_crash(header: str, exc_text: str, *, base_url: str | None, spool_dir: Path) -> None`
  - Parses error type from traceback last line; builds JSON crash event; `urllib` POST to `{base_url}/subtlety/crash` with short timeout (e.g. 0.5s); on failure write `spool_dir / {timestamp}-{pid}.json`
- Env: `SUBTLETY_HUB_URL` default `http://127.0.0.1:3000` (or existing collab host)

- [ ] **Step 1: Write failing pytest**

```python
from pathlib import Path
from divtube_downloader.tui.services.subtlety_crash_forward import forward_crash

def test_spool_when_hub_down(tmp_path, monkeypatch):
    monkeypatch.setenv("SUBTLETY_HUB_URL", "http://127.0.0.1:9")  # closed port
    forward_crash(
        "THREAD CRASH (Thread-32)",
        'Traceback...\ntextual._context.NoActiveAppError\n',
        spool_dir=tmp_path,
    )
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    data = files[0].read_text()
    assert "NoActiveAppError" in data
```

(Adjust import path to match package layout used by other DivTube tests.)

- [ ] **Step 2: Implement forwarder + wire `_persist_crash`**

```python
# at end of _persist_crash, best-effort:
try:
    from tui.services.subtlety_crash_forward import forward_crash
    forward_crash(header, exc_text)
except Exception:
    pass
```

- [ ] **Step 3: Add spool drain on Node boot** (read JSON files, `ingestCrash`, delete on success)

- [ ] **Step 4: Run pytest + vitest for related suites** — PASS

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 7: MCP read surface

**Files:**
- Modify: `codex/server/collab/mcp-bridge.js` — register `mcp_scholomance_collab_subtlety_status` (alias `subtlety_status`)
- Modify: `tests/collab/mcp-bridge.test.js` — assert tool registered / handler returns status shape

**Interfaces:**
- Produces: tool with no required args → `{ ok, ...getSubtletyRuntime().getStatus() }`

- [ ] **Step 1: Write failing test** expecting tool name present in bridge catalog / handler

- [ ] **Step 2: Register tool** calling `getSubtletyRuntime().getStatus()`

- [ ] **Step 3: Run** `npx vitest run tests/collab/mcp-bridge.test.js` — PASS

- [ ] **Step 4: Commit** (only if user asked)

---

### Task 8: Phase 2 — `executeRoute` observed sampling (flagged)

**Files:**
- Modify: `codex/core/pixelbrain/microprocessor-route.js`
- Create: `tests/codex/core/pixelbrain/subtlety-execute-route-sample.test.js`

**Interfaces:**
- Env / flag: `SUBTLETY_SAMPLE_ROUTES=1` (default off)
- After successful `runRoute(..., { execute: true })` output is available, call `getSubtletyRuntime().recordObservedRoute?.(routeId, output)` **without** re-invoking steps
- Sampling must not throw into route execution (try/catch)

- [ ] **Step 1: Write failing test** — mock runtime; with flag on, `executeRoute` calls record once; with flag off, zero calls; route fn not called twice

- [ ] **Step 2: Implement minimal hook in `executeRoute` / `runRoute`

- [ ] **Step 3: Run tests** — PASS

- [ ] **Step 4: Commit** (only if user asked)

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Resonance Store append-only SoT | Task 1 |
| Crash normalize + NoActiveApp fixture | Task 2 |
| Hub ingest + assess + propose-only | Task 3 |
| Dual-write collab alerts | Task 4 |
| HTTP `POST /subtlety/crash` | Task 4 |
| Node/Fly adapters | Task 5 |
| DivTube forward + spool + drain | Task 6 |
| MCP status | Task 7 |
| Phase 2 executeRoute sampling | Task 8 |
| Dedup 60s window | Task 3 |
| Never mask original crash | Tasks 3–6 |
| No auto-heal | Task 3 (allowed: false) |

## Self-review notes

- No TBD placeholders in task interfaces
- DivTube transport locked: HTTP POST first, spool on failure
- Commit steps gated on explicit user request (matches repo user rules)

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-subtlety-apm-continuous-monitoring.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
