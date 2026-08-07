# Metastable Stateless APM Hourly Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and operationally validate the Concept Chemistry-selected Stateless Chronicle Compiler that emits deterministic, cumulative Markdown reports for completed active machine-local hours.

**Architecture:** A pure core pipeline parses and verifies a byte-stable resonance-ledger snapshot, projects recurring event histories, resolves DST-safe local-hour windows, and renders content-addressed Markdown. A Node service publishes reports atomically, a runtime coordinator performs catch-up/retry/scheduling without checkpoints, and a Fastify plugin owns start/stop lifecycle. Immutable selection, replay, and live-operation artifacts record the monotonic promotion from `METASTABLE_SELECTED` through `STABLE_OPERATIONAL` without altering the failed original score.

**Tech Stack:** Node.js ES modules, Vitest, Fastify, canonical JSON + pure-JS SHA-256, Node `fs/promises`, machine-local `Date` APIs.

## Global Constraints

- Never edit `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json`; its original `passed: false` and `selectedArchitecture: null` remain authoritative.
- The revised selector requires the same unique candidate to win and strictly clear the bar in at least two of three aligned rounds, at least one clearing win at `METASTABLE`, and all law controls caught.
- Register `SUBTLETY-RESONANCE-RECORD-v2` and `SUBTLETY-OBSERVATION-CONTEXT-v1` in `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`; bump contract version `1.35` to `1.36` and add a schema-change notice before implementation consumes them.
- Keep `SUBTLETY-FINGERPRINT-v1` byte identity unchanged; context is an optional outer-record sibling covered only by the outer checksum.
- The compiler is pure: no filesystem, scheduler, environment, logger, or wall-clock access.
- Reports are written only for completed machine-local hours with at least one valid fingerprint, under `divtube_downloader/APM-Hourly-Reports`.
- Filenames are `APM-YYYY-MM-DD-HH00-UTC+HHMM.md` or `APM-YYYY-MM-DD-HH00-UTC-HHMM.md`; repeated fall-back hours differ by offset and spring-forward creates no nonexistent hour.
- Event identity is SHA-256/SCD64 over `runtime | unitId | errorType | topFrame`; message, build, thread, assessment, and remediation do not split identity.
- Reports contain cumulative occurrence times only through the requested window end; later ledger knowledge never rewrites earlier reports.
- Canonical generation time is the window end. Actual emission time is log metadata only.
- Persistence uses same-directory temporary write + fsync + exclusive hard-link publish. Identical content is idempotent; divergent existing content is a non-overwriting integrity conflict.
- Transient read/write retries are exactly `250`, `1000`, and `4000` milliseconds, abortable on shutdown.
- Promotion is monotonic: `METASTABLE_SELECTED -> IMPLEMENTED_METASTABLE -> STABLE_OPERATIONAL`; each transition receives a new immutable evidence file.
- Reporter failure must never propagate into crash ingest, route sampling, spool draining, or HTTP readiness.

## File Structure

- `scripts/lib/concept-chem-apm-metastable-promotion.mjs`: pure evaluator for the revised selection rule.
- `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/metastable-selection.json`: immutable revised-hypothesis evidence derived from, but not written into, `score.json`.
- `codex/core/pixelbrain/subtlety-observation-context.js`: pure normalization, redaction, bounds, and v1 fallback context.
- `codex/core/pixelbrain/subtlety-apm-hour-window.js`: pure machine-local hour identity and DST-safe boundary search.
- `codex/core/pixelbrain/subtlety-apm-ledger.js`: pure JSONL parsing, checksum/schema validation, warnings, event projection, and assessment association.
- `codex/core/pixelbrain/subtlety-apm-hourly-compiler.js`: pure active-window discovery and deterministic Markdown rendering.
- `codex/services/subtlety-apm-report-store.js`: byte-stable snapshot reads and confined atomic report publication.
- `codex/runtime/subtlety-apm-hourly-reporter.js`: serialized catch-up, bounded retry, next-boundary scheduling, idle, and stop.
- `codex/server/plugins/subtlety-apm-hourly.plugin.js`: production path composition and Fastify lifecycle ownership.
- `scripts/replay-subtlety-apm-hourly-reports.mjs`: isolated real-ledger replay and immutable Level 2 manifest generation.
- `scripts/verify-subtlety-apm-live-operation.mjs`: two-phase active-hour/restart verification and immutable Level 3 evidence generation.

---

### Task 1: Codify the Revised Metastable Selection Without Rewriting Prior Evidence

**Files:**
- Create: `scripts/lib/concept-chem-apm-metastable-promotion.mjs`
- Create: `tests/codex/core/pixelbrain/concept-chem-apm-metastable-promotion.test.js`
- Create: `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/metastable-selection.json`
- Read only: `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json`

**Interfaces:**
- Consumes: `evaluateMetastablePromotion(scoreEvidence, architecture)` where `scoreEvidence.decision.rounds` and `scoreEvidence.scoredRounds` are the frozen v1 evidence.
- Produces: `{ schema, selectedArchitecture, state, clearingWins, aggregateMargin, lawControlsCaught, sourceEvidenceChecksum, passed }`.

- [ ] **Step 1: Write the failing selector tests**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateMetastablePromotion } from '../../../../scripts/lib/concept-chem-apm-metastable-promotion.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('../../../../docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json', import.meta.url),
  'utf8',
));

describe('Concept Chemistry metastable promotion', () => {
  it('selects Stateless by the separately versioned majority-control rule', () => {
    expect(evidence.decision.passed).toBe(false);
    expect(evidence.decision.selectedArchitecture).toBeNull();
    expect(evaluateMetastablePromotion(evidence, 'stateless-chronicle-compiler')).toMatchObject({
      passed: true,
      state: 'METASTABLE_SELECTED',
      clearingWins: 2,
      aggregateMargin: 0.1259,
      lawControlsCaught: true,
    });
  });

  it('rejects a candidate with only one clearing win or no metastable clearing win', () => {
    const changed = structuredClone(evidence);
    changed.decision.rounds[2].winner = 'streaming-materialized-view';
    expect(evaluateMetastablePromotion(changed, 'stateless-chronicle-compiler').passed).toBe(false);

    const noMetastable = structuredClone(evidence);
    noMetastable.scoredRounds[0].reactions.find((r) => r.architecture === 'stateless-chronicle-compiler').stability = 'UNSTABLE';
    expect(evaluateMetastablePromotion(noMetastable, 'stateless-chronicle-compiler').passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the selector tests and verify RED**

Run: `npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-metastable-promotion.test.js`

Expected: FAIL because `concept-chem-apm-metastable-promotion.mjs` does not exist.

- [ ] **Step 3: Implement the pure revised selector**

```js
export const METASTABLE_PROMOTION_SCHEMA = 'PB-CONCEPT-CHEM-APM-METASTABLE-SELECTION-v1';

export function evaluateMetastablePromotion(evidence, architecture) {
  const rounds = evidence.decision.rounds;
  const clearing = rounds.filter((round) =>
    round.uniqueWinner && round.winner === architecture && round.winnerBeatsBar
  );
  const clearingRoundIds = new Set(clearing.map((round) => round.round));
  const hasMetastableClearingWin = evidence.scoredRounds.some(({ round, reactions }) =>
    clearingRoundIds.has(round) && reactions.some((reaction) =>
      reaction.kind === 'candidate'
      && reaction.architecture === architecture
      && reaction.stability === 'METASTABLE'
    )
  );
  const aggregateMargin = Number(rounds.reduce((sum, round) => {
    const candidate = evidence.scoredRounds
      .find((entry) => entry.round === round.round)
      .reactions.find((reaction) => reaction.architecture === architecture);
    return sum + candidate.feasibility - round.barFeasibility;
  }, 0).toFixed(4));
  const lawControlsCaught = rounds.every((round) => round.lawControlsCaught);
  const passed = clearing.length >= 2 && hasMetastableClearingWin && lawControlsCaught;

  return {
    schema: METASTABLE_PROMOTION_SCHEMA,
    selectedArchitecture: passed ? architecture : null,
    state: passed ? 'METASTABLE_SELECTED' : 'NOT_SELECTED',
    clearingWins: clearing.length,
    clearingRounds: clearing.map((round) => round.round),
    hasMetastableClearingWin,
    aggregateMargin,
    lawControlsCaught,
    sourceEvidenceChecksum: evidence.evidenceChecksum,
    passed,
  };
}
```

- [ ] **Step 4: Run tests, generate the immutable artifact, and verify GREEN**

Run: `npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-metastable-promotion.test.js`

Expected: PASS (2 tests).

Write this exact immutable artifact; every numeric value comes from the frozen evidence and selector result:

```json
{
  "schema": "PB-CONCEPT-CHEM-APM-METASTABLE-SELECTION-v1",
  "recordedAt": "2026-08-03T00:00:00.000-04:00",
  "designSpec": "docs/superpowers/specs/2026-08-03-concept-chemistry-metastable-stateless-reporter-design.md",
  "selectedArchitecture": "stateless-chronicle-compiler",
  "state": "METASTABLE_SELECTED",
  "clearingWins": 2,
  "clearingRounds": [1, 3],
  "hasMetastableClearingWin": true,
  "aggregateMargin": 0.1259,
  "lawControlsCaught": true,
  "sourceEvidenceChecksum": "sha256:fd809fd89df908c1e243d2c74612d9d20b49a35f272804e20ee51750bbc57d3f",
  "passed": true
}
```

Then run the selector test again and confirm `git diff -- docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json` prints nothing.

- [ ] **Step 5: Commit the revised hypothesis artifact**

```bash
git add scripts/lib/concept-chem-apm-metastable-promotion.mjs tests/codex/core/pixelbrain/concept-chem-apm-metastable-promotion.test.js docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/metastable-selection.json
git commit -m "evidence: select metastable Stateless APM trial"
```

### Task 2: Register and Seal Observation Context v1

**Files:**
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md:9-18`
- Create: `codex/core/pixelbrain/subtlety-observation-context.js`
- Modify: `codex/core/pixelbrain/subtlety-resonance-store.js:19-39`
- Modify: `codex/core/pixelbrain/subtlety-runtime.js:50-63`
- Modify: `tests/codex/core/pixelbrain/subtlety-resonance-store.test.js`
- Modify: `tests/codex/core/pixelbrain/subtlety-runtime.test.js`
- Modify: `tests/codex/server/subtlety-routes.test.js`

**Interfaces:**
- Produces: `SUBTLETY_OBSERVATION_CONTEXT_SCHEMA`, `normalizeObservationContext(raw)`, `legacyObservationContext(payload)`, `SUBTLETY_RESONANCE_SCHEMA_V1`, and `SUBTLETY_RESONANCE_SCHEMA_V2`.
- Changes: `store.append(kind, payload, { context } = {})`; omission retains v1, presence normalizes context and emits v2.
- Preserves: `SUBTLETY_RESONANCE_SCHEMA` remains an alias of v1 for existing consumers.

- [ ] **Step 1: Add the schema-change notice and exact canonical shapes**

Change the contract header to `Version: 1.36 | Last updated: 2026-08-03`, then insert a notice before the existing 1.35 notice. Define these exact shapes in the notice:

```ts
interface SubtletyObservationContextV1 {
  schema: "SUBTLETY-OBSERVATION-CONTEXT-v1";
  runtime: string;   // 1..128 Unicode code points; missing => "unknown"
  errorType: string; // 1..256 Unicode code points; missing => "unknown"
  message: string;   // 0..2048 Unicode code points
  topFrame: string;  // 1..1024 Unicode code points; missing => "unknown"
  thread: string;    // 0..256 Unicode code points
}

interface SubtletyResonanceRecordV2 {
  schema: "SUBTLETY-RESONANCE-RECORD-v2";
  recordedAt: string;
  kind: "fingerprint" | "assessment";
  payload: object;
  context?: SubtletyObservationContextV1;
  checksum: string;
}
```

The notice must say the change is additive, Claude impact is none, Gemini impact is new v1/v2 fixtures plus checksum/redaction coverage, and v1 records remain readable indefinitely.

- [ ] **Step 2: Write failing context/store/runtime tests**

Add assertions covering CRLF/NUL normalization, the three ordered redactions, code-point truncation with emoji, v2 outer-checksum sensitivity, v1 compatibility, unchanged fingerprint checksum, and route success. Use this exact malicious message in both core and route tests:

```js
const sensitive = 'https://me:pw@example.test/a\r\nBearer abc123\0 token=secret-value';
const first = await rt.ingestCrash({ ...sample, message: sensitive });
const records = store.readAll();
const fingerprint = records.find((record) => record.kind === 'fingerprint');

expect(fingerprint.schema).toBe('SUBTLETY-RESONANCE-RECORD-v2');
expect(fingerprint.context).toMatchObject({
  schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1',
  runtime: 'divtube-tui',
  errorType: 'textual._context.NoActiveAppError',
  topFrame: 'File "tui/ui/app.py", line 284, in run',
  thread: 'Thread-32',
});
expect(fingerprint.context.message).toBe(
  'https://[REDACTED]@example.test/a\nBearer [REDACTED] token=[REDACTED]',
);
expect(first.packet.checksum).toBe(fingerprint.payload.checksum);
```

In the store test, append the same already-sealed fingerprint payload twice with contexts whose only difference is `message`. Assert the two `record.payload.checksum` values are identical while the two outer `record.checksum` values differ. This distinguishes unchanged packet identity from the intentionally context-sensitive v2 envelope checksum.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-resonance-store.test.js tests/codex/core/pixelbrain/subtlety-runtime.test.js tests/codex/server/subtlety-routes.test.js`

Expected: FAIL because the store emits v1 and does not persist `context`.

- [ ] **Step 4: Implement normalization and legacy fallback**

```js
export const SUBTLETY_OBSERVATION_CONTEXT_SCHEMA = 'SUBTLETY-OBSERVATION-CONTEXT-v1';

const LIMITS = Object.freeze({ runtime: 128, errorType: 256, message: 2048, topFrame: 1024, thread: 256 });

function redact(value) {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@([^\s/]+)/giu, '$1[REDACTED]@$2')
    .replace(/\bBearer\s+[^\s]+/giu, 'Bearer [REDACTED]')
    .replace(/\b(api-key|api_key|apikey|token|password|secret)(\s*[:=]\s*)[^\s]+/giu, '$1$2[REDACTED]');
}

function field(raw, name, fallback) {
  const normalized = redact(String(raw?.[name] ?? fallback).replace(/\r\n?/gu, '\n').replace(/\0/gu, ''));
  const bounded = [...normalized].slice(0, LIMITS[name]).join('');
  return bounded || fallback;
}

export function normalizeObservationContext(raw = {}) {
  return {
    schema: SUBTLETY_OBSERVATION_CONTEXT_SCHEMA,
    runtime: field(raw, 'runtime', 'unknown'),
    errorType: field(raw, 'errorType', 'unknown'),
    message: field(raw, 'message', ''),
    topFrame: field(raw, 'topFrame', 'unknown'),
    thread: field(raw, 'thread', ''),
  };
}

export function legacyObservationContext(payload = {}) {
  const emits = payload.fingerprint?.emits || [];
  const crashEmit = emits.find((value) => String(value).startsWith('thread.crash.'));
  return normalizeObservationContext({
    runtime: payload.identity?.runtimeProfile || payload.execution?.runtimeProfile || 'unknown',
    errorType: crashEmit ? String(crashEmit).slice('thread.crash.'.length) : 'unknown',
    topFrame: 'unknown',
  });
}
```

Update the store sealing path exactly as follows:

```js
export const SUBTLETY_RESONANCE_SCHEMA_V1 = 'SUBTLETY-RESONANCE-RECORD-v1';
export const SUBTLETY_RESONANCE_SCHEMA_V2 = 'SUBTLETY-RESONANCE-RECORD-v2';
export const SUBTLETY_RESONANCE_SCHEMA = SUBTLETY_RESONANCE_SCHEMA_V1;

function append(kind, payload, { context } = {}) {
  const normalizedContext = context === undefined ? undefined : normalizeObservationContext(context);
  const record = seal({
    schema: normalizedContext ? SUBTLETY_RESONANCE_SCHEMA_V2 : SUBTLETY_RESONANCE_SCHEMA_V1,
    recordedAt: now(),
    kind,
    payload,
    ...(normalizedContext ? { context: normalizedContext } : {}),
  });
  fs.appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}
```

In `ingestCrash`, pass raw normalized crash context without changing the packet:

```js
const context = {
  runtime: identity.runtimeProfile,
  errorType: output.error?.type,
  message: output.error?.message,
  topFrame: output.error?.site,
  thread: output.error?.thread,
};
store.append('fingerprint', packet, { context });
```

- [ ] **Step 5: Run focused and checksum-regression tests**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-resonance-store.test.js tests/codex/core/pixelbrain/subtlety-runtime.test.js tests/codex/core/pixelbrain/subtlety-fingerprint.test.js tests/codex/server/subtlety-routes.test.js`

Expected: PASS; the pre-existing fingerprint tests prove packet checksum semantics did not change.

- [ ] **Step 6: Commit the schema and context envelope**

```bash
git add 'docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md' codex/core/pixelbrain/subtlety-observation-context.js codex/core/pixelbrain/subtlety-resonance-store.js codex/core/pixelbrain/subtlety-runtime.js tests/codex/core/pixelbrain/subtlety-resonance-store.test.js tests/codex/core/pixelbrain/subtlety-runtime.test.js tests/codex/server/subtlety-routes.test.js
git commit -m "feat: seal Subtlety observation context"
```

### Task 3: Resolve Machine-Local Hours Across DST

**Files:**
- Create: `codex/core/pixelbrain/subtlety-apm-hour-window.js`
- Create: `tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js`

**Interfaces:**
- Produces: `localHourWindowContaining(epochMs)`, `nextLocalHourBoundary(epochMs)`, `isCompletedWindow(window, nowMs)`, and `formatLocalTimestamp(epochMs)`.
- Window shape: `{ startMs, endMs, year, month, day, hour, offsetMinutes, filename, label }`.

- [ ] **Step 1: Write failing normal, spring-forward, and fall-back tests**

```js
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localHourWindowContaining, nextLocalHourBoundary } from '../../../../codex/core/pixelbrain/subtlety-apm-hour-window.js';

const previousTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => { process.env.TZ = previousTz; });

describe('machine-local APM hour windows', () => {
  it('does not invent the skipped spring-forward hour', () => {
    const beforeJump = localHourWindowContaining(Date.parse('2026-03-08T06:30:00.000Z'));
    const afterJump = localHourWindowContaining(Date.parse('2026-03-08T07:30:00.000Z'));
    expect(beforeJump.filename).toBe('APM-2026-03-08-0100-UTC-0500.md');
    expect(afterJump.filename).toBe('APM-2026-03-08-0300-UTC-0400.md');
    expect(nextLocalHourBoundary(Date.parse('2026-03-08T06:30:00.000Z'))).toBe(Date.parse('2026-03-08T07:00:00.000Z'));
  });

  it('gives repeated fall-back hours different offsets and filenames', () => {
    const first = localHourWindowContaining(Date.parse('2026-11-01T05:30:00.000Z'));
    const second = localHourWindowContaining(Date.parse('2026-11-01T06:30:00.000Z'));
    expect(first.filename).toBe('APM-2026-11-01-0100-UTC-0400.md');
    expect(second.filename).toBe('APM-2026-11-01-0100-UTC-0500.md');
    expect(first.endMs).toBe(second.startMs);
  });
});
```

- [ ] **Step 2: Run the hour-window tests and verify RED**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement epoch-based boundary search and offset identity**

```js
function localParts(epochMs) {
  const date = new Date(epochMs);
  return {
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
    hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
    millisecond: date.getMilliseconds(), offsetMinutes: -date.getTimezoneOffset(),
  };
}

function isBoundary(epochMs) {
  const value = localParts(epochMs);
  return value.minute === 0 && value.second === 0 && value.millisecond === 0;
}

function seekBoundary(epochMs, direction) {
  let cursor = Math.floor(epochMs / 60_000) * 60_000;
  if (direction > 0 && cursor <= epochMs) cursor += 60_000;
  for (let inspected = 0; inspected <= 26 * 60; inspected += 1, cursor += direction * 60_000) {
    if (isBoundary(cursor)) return cursor;
  }
  throw new RangeError('local hour boundary not found within 26 hours');
}

function offsetToken(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
}

export function localHourWindowContaining(epochMs) {
  const startMs = isBoundary(epochMs) ? epochMs : seekBoundary(epochMs, -1);
  const endMs = seekBoundary(startMs, 1);
  const start = localParts(startMs);
  const stem = `${String(start.year).padStart(4, '0')}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}-${String(start.hour).padStart(2, '0')}00-UTC${offsetToken(start.offsetMinutes)}`;
  return { ...start, startMs, endMs, filename: `APM-${stem}.md`, label: stem };
}

export function nextLocalHourBoundary(epochMs) { return seekBoundary(epochMs, 1); }
export function isCompletedWindow(window, nowMs) { return window.endMs <= nowMs; }
export function formatLocalTimestamp(epochMs) {
  const value = localParts(epochMs);
  const date = `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
  const time = `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}:${String(value.second).padStart(2, '0')}.${String(value.millisecond).padStart(3, '0')}`;
  return `${date}T${time}${offsetToken(value.offsetMinutes).replace(/(..)$/, ':$1')}`;
}
```

- [ ] **Step 4: Run in two timezones and verify GREEN**

Run: `TZ=America/New_York npx vitest run tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js`

Run: `TZ=UTC npx vitest run tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js`

Expected: PASS in both invocations because the test owns `process.env.TZ` and restores it.

- [ ] **Step 5: Commit local-hour identity**

```bash
git add codex/core/pixelbrain/subtlety-apm-hour-window.js tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js
git commit -m "feat: resolve DST-safe APM hour windows"
```

### Task 4: Parse the Ledger and Build Deterministic Recurrence Histories

**Files:**
- Create: `codex/core/pixelbrain/subtlety-apm-ledger.js`
- Create: `tests/codex/core/pixelbrain/subtlety-apm-ledger.test.js`

**Interfaces:**
- Consumes: `parseResonanceSnapshot({ ledgerText, cutoffMs })` where `cutoffMs` is the report window end.
- Produces: `{ records, fingerprints, warnings, sourceRecordSetChecksum }` with accepted records sorted by epoch then outer checksum.
- Produces: `buildEventChronicle(parsed)` returning occurrences grouped by stable event key, with the nearest preceding same-unit assessment attached.

- [ ] **Step 1: Write fixture helpers and failing parser tests**

In the test file, define deterministic record helpers using production canonicalization:

```js
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../../../codex/core/pixelbrain/canonical-json.js';
import { sha256Hex } from '../../../../codex/core/pixelbrain/sha256.js';
import { buildEventChronicle, parseResonanceSnapshot } from '../../../../codex/core/pixelbrain/subtlety-apm-ledger.js';

function seal(body) { return { ...body, checksum: sha256Hex(canonicalStringify(body)) }; }
function fingerprint(at, unitId, context, buildId = 'b1') {
  const payloadBody = {
    schema: 'SUBTLETY-FINGERPRINT-v1',
    identity: { unitId, runtimeProfile: context.runtime },
    execution: { runtimeProfile: context.runtime, buildId },
    fingerprint: { emits: [`thread.crash.${context.errorType}`] },
  };
  return seal({
    schema: 'SUBTLETY-RESONANCE-RECORD-v2', recordedAt: at, kind: 'fingerprint',
    payload: seal(payloadBody), context: { schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1', ...context },
  });
}
function assessment(at, unitId, driftStatus) {
  return seal({
    schema: 'SUBTLETY-RESONANCE-RECORD-v1', recordedAt: at, kind: 'assessment',
    payload: { unitId, drift: { status: driftStatus }, seam: { violations: [] }, recovery: { proposals: [] } },
  });
}
const context = { runtime: 'divtube-tui', errorType: 'NoActiveAppError', message: 'boom', topFrame: 'app.py:284', thread: 'Thread-32' };

describe('Subtlety APM ledger projection', () => {
  it('defers a partial tail and isolates malformed, invalid-checksum, and future rows', () => {
    const valid = fingerprint('2026-08-03T10:15:00.000Z', 'crash.tui', context);
    const badChecksum = { ...fingerprint('2026-08-03T10:20:00.000Z', 'crash.tui', context), checksum: '0'.repeat(64) };
    const future = fingerprint('2026-08-03T12:00:00.000Z', 'crash.tui', context);
    const ledgerText = `${JSON.stringify(valid)}\n{bad json}\n${JSON.stringify(badChecksum)}\n${JSON.stringify(future)}\n{"schema":`;
    const parsed = parseResonanceSnapshot({ ledgerText, cutoffMs: Date.parse('2026-08-03T11:00:00.000Z') });
    expect(parsed.records).toHaveLength(1);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      'FUTURE_TIMESTAMP', 'INCOMPLETE_TRAILING_ROW', 'INVALID_OUTER_CHECKSUM', 'MALFORMED_ROW',
    ]);
  });

  it('groups recurrence and associates an assessment without incrementing count', () => {
    const rows = [
      fingerprint('2026-08-03T09:10:00.000Z', 'crash.tui', context),
      assessment('2026-08-03T09:10:01.000Z', 'crash.tui', 'stable'),
      fingerprint('2026-08-03T10:20:00.000Z', 'crash.tui', { ...context, message: 'changed' }),
      assessment('2026-08-03T10:20:01.000Z', 'crash.tui', 'drifting'),
    ];
    const parsed = parseResonanceSnapshot({ ledgerText: `${rows.map(JSON.stringify).join('\n')}\n`, cutoffMs: Date.parse('2026-08-03T11:00:00.000Z') });
    const chronicle = buildEventChronicle(parsed);
    expect(chronicle.events).toHaveLength(1);
    expect(chronicle.events[0].occurrences).toHaveLength(2);
    expect(chronicle.events[0].occurrences[1].assessment.payload.drift.status).toBe('drifting');
  });

  it('reads v1 fingerprints through deterministic legacy fallbacks', () => {
    const v2 = fingerprint('2026-08-03T10:15:00.000Z', 'crash.tui', context);
    const { context: removed, checksum: removedChecksum, ...legacyBody } = v2;
    const legacy = seal({ ...legacyBody, schema: 'SUBTLETY-RESONANCE-RECORD-v1' });
    const parsed = parseResonanceSnapshot({ ledgerText: `${JSON.stringify(legacy)}\n`, cutoffMs: Date.parse('2026-08-03T11:00:00.000Z') });
    expect(parsed.fingerprints[0].context).toMatchObject({ runtime: 'divtube-tui', errorType: 'NoActiveAppError', topFrame: 'unknown' });
    expect(parsed.warnings.some((warning) => warning.code === 'LEGACY_CONTEXT')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the parser tests and verify RED**

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-apm-ledger.test.js`

Expected: FAIL because `subtlety-apm-ledger.js` does not exist.

- [ ] **Step 3: Implement checksum validation, warning isolation, and projection**

Use these exact exported shapes and helpers:

```js
import { canonicalStringify } from './canonical-json.js';
import { sha256Hex } from './sha256.js';
import { legacyObservationContext, normalizeObservationContext } from './subtlety-observation-context.js';

const SUPPORTED = new Set(['SUBTLETY-RESONANCE-RECORD-v1', 'SUBTLETY-RESONANCE-RECORD-v2']);
const SUPPORTED_KINDS = new Set(['fingerprint', 'assessment']);
const withoutChecksum = ({ checksum: _checksum, ...body }) => body;
const validChecksum = (value) => /^[0-9a-f]{64}$/.test(value?.checksum || '')
  && sha256Hex(canonicalStringify(withoutChecksum(value))) === value.checksum;

function warning(code, source, detail) {
  return { code, checksum: sha256Hex(source), detail };
}

export function stableEventKey({ runtime, unitId, errorType, topFrame }) {
  return sha256Hex(`${runtime} | ${unitId} | ${errorType} | ${topFrame}`);
}

export function parseResonanceSnapshot({ ledgerText, cutoffMs }) {
  const text = String(ledgerText);
  const completeLines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n').slice(0, -1);
  const warnings = [];
  if (text && !text.endsWith('\n')) warnings.push(warning('INCOMPLETE_TRAILING_ROW', text.split('\n').at(-1), 'deferred until the next snapshot'));
  const records = [];

  for (const line of completeLines.filter((value) => value.length > 0)) {
    let record;
    try { record = JSON.parse(line); }
    catch { warnings.push(warning('MALFORMED_ROW', line, 'complete JSONL row could not be parsed')); continue; }
    if (!SUPPORTED.has(record.schema)) { warnings.push(warning('UNSUPPORTED_SCHEMA', line, String(record.schema))); continue; }
    if (!SUPPORTED_KINDS.has(record.kind)) { warnings.push(warning('UNSUPPORTED_KIND', line, String(record.kind))); continue; }
    if (!validChecksum(record)) { warnings.push(warning('INVALID_OUTER_CHECKSUM', line, record.checksum || 'missing')); continue; }
    const atMs = Date.parse(record.recordedAt);
    if (!Number.isFinite(atMs)) { warnings.push(warning('INVALID_TIMESTAMP', line, String(record.recordedAt))); continue; }
    if (atMs > cutoffMs) { warnings.push(warning('FUTURE_TIMESTAMP', line, record.recordedAt)); continue; }
    if (record.kind === 'fingerprint') {
      if (record.payload?.schema !== 'SUBTLETY-FINGERPRINT-v1') {
        warnings.push(warning('UNSUPPORTED_FINGERPRINT_SCHEMA', line, String(record.payload?.schema))); continue;
      }
      if (!validChecksum(record.payload)) {
        warnings.push(warning('INVALID_FINGERPRINT_CHECKSUM', line, record.checksum)); continue;
      }
      if (record.context && record.context.schema !== 'SUBTLETY-OBSERVATION-CONTEXT-v1') {
        warnings.push(warning('UNSUPPORTED_CONTEXT_SCHEMA', line, String(record.context.schema))); continue;
      }
    }
    records.push({ ...record, atMs, rawLineChecksum: sha256Hex(line) });
  }

  records.sort((left, right) => left.atMs - right.atMs || left.checksum.localeCompare(right.checksum));
  const fingerprints = records.filter((record) => record.kind === 'fingerprint').map((record) => ({
    ...record,
    unitId: record.payload.identity?.unitId || 'unknown',
    context: record.schema === 'SUBTLETY-RESONANCE-RECORD-v2' && record.context
      ? normalizeObservationContext(record.context)
      : legacyObservationContext(record.payload),
  }));
  for (const record of fingerprints.filter((entry) => entry.schema === 'SUBTLETY-RESONANCE-RECORD-v1')) {
    warnings.push(warning('LEGACY_CONTEXT', record.checksum, `reduced identity precision for ${record.unitId}`));
  }
  warnings.sort((left, right) => left.code.localeCompare(right.code) || left.checksum.localeCompare(right.checksum));
  const sourceRecordSetChecksum = sha256Hex([
    ...records.map((record) => record.checksum), ...warnings.map((entry) => entry.checksum),
  ].sort().join('\n'));
  return { records, fingerprints, warnings, sourceRecordSetChecksum };
}

export function buildEventChronicle(parsed) {
  const fingerprintByChecksum = new Map(parsed.fingerprints.map((record) => [record.checksum, record]));
  const latestByUnit = new Map();
  const occurrences = [];
  for (const record of parsed.records) {
    if (record.kind === 'fingerprint') {
      const fingerprint = fingerprintByChecksum.get(record.checksum);
      const occurrence = { ...fingerprint, assessment: null };
      occurrences.push(occurrence);
      latestByUnit.set(fingerprint.unitId, occurrence);
    } else if (record.kind === 'assessment') {
      const occurrence = latestByUnit.get(record.payload?.unitId);
      if (occurrence) occurrence.assessment = record;
    }
  }
  const grouped = new Map();
  for (const occurrence of occurrences) {
    const key = stableEventKey({ ...occurrence.context, unitId: occurrence.unitId });
    const event = grouped.get(key) || { key, runtime: occurrence.context.runtime, unitId: occurrence.unitId, errorType: occurrence.context.errorType, topFrame: occurrence.context.topFrame, occurrences: [] };
    event.occurrences.push(occurrence);
    grouped.set(key, event);
  }
  return { events: [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key)), warnings: parsed.warnings };
}
```

- [ ] **Step 4: Add input-shuffle determinism coverage and verify GREEN**

Add a test that enumerates six permutations of the same four rows and asserts the same event keys, occurrence timestamps, assessment status, warning codes, and source checksum for every permutation. Then run:

Run: `npx vitest run tests/codex/core/pixelbrain/subtlety-apm-ledger.test.js`

Expected: PASS, including malformed/future isolation, v1 fallback, assessment association, and shuffle determinism.

- [ ] **Step 5: Commit the pure ledger projection**

```bash
git add codex/core/pixelbrain/subtlety-apm-ledger.js tests/codex/core/pixelbrain/subtlety-apm-ledger.test.js
git commit -m "feat: project Subtlety APM recurrence history"
```

### Task 5: Compile Deterministic Cumulative Markdown

**Files:**
- Create: `codex/core/pixelbrain/subtlety-apm-hourly-compiler.js`
- Create: `tests/codex/core/pixelbrain/subtlety-apm-hourly-compiler.test.js`

**Interfaces:**
- Consumes: `compileHourlyReport({ ledgerText, sourcePath, window })`.
- Produces quiet result `{ status: 'quiet', filename, window }` or report result `{ status: 'report', filename, markdown, integrityChecksum, sourceRecordSetChecksum, summary }`.
- Produces: `discoverCompletedActiveWindows({ ledgerText, nowMs })`, deduplicated and sorted oldest-first.

- [ ] **Step 1: Write the frozen report-behavior matrix**

Reuse the sealed-record helpers from Task 4 in a local test helper. Add explicit tests for the following assertions:

```js
const quiet = compileHourlyReport({ ledgerText: '', sourcePath: '/ledger.jsonl', window });
expect(quiet).toEqual({ status: 'quiet', filename: window.filename, window });

const report = compileHourlyReport({ ledgerText, sourcePath: '/ledger.jsonl', window });
expect(report.status).toBe('report');
expect(report.summary).toEqual({ windowOccurrences: 2, activeEvents: 1, newEvents: 0, recurringEvents: 1 });
expect(report.markdown).toContain('- Lifetime occurrences: 3');
expect(report.markdown).toContain('## All occurrence times through window end');
expect(report.markdown).toContain('2026-08-03T08:10:00.000-04:00');
expect(report.markdown).toContain('2026-08-03T10:20:00.000-04:00');
expect(report.markdown).not.toContain('2026-08-03T12:20:00.000-04:00');

const second = compileHourlyReport({ ledgerText, sourcePath: '/ledger.jsonl', window });
expect(second.markdown).toBe(report.markdown);
expect(second.integrityChecksum).toBe(report.integrityChecksum);
```

Also assert: a previous event absent from the current hour has no section; new/recurring counts are correct; descending lifetime count then event-key ordering is stable; malformed/future/legacy warnings render; and shuffling complete lines cannot change the report.

- [ ] **Step 2: Run compiler tests and verify RED**

Run: `TZ=America/New_York npx vitest run tests/codex/core/pixelbrain/subtlety-apm-hourly-compiler.test.js`

Expected: FAIL because the compiler module does not exist.

- [ ] **Step 3: Implement active-window discovery and report selection**

```js
import { sha256Hex } from './sha256.js';
import { buildEventChronicle, parseResonanceSnapshot } from './subtlety-apm-ledger.js';
import { formatLocalTimestamp, isCompletedWindow, localHourWindowContaining } from './subtlety-apm-hour-window.js';

export function discoverCompletedActiveWindows({ ledgerText, nowMs }) {
  const parsed = parseResonanceSnapshot({ ledgerText, cutoffMs: nowMs });
  const byFilename = new Map();
  for (const occurrence of parsed.fingerprints) {
    const window = localHourWindowContaining(occurrence.atMs);
    if (isCompletedWindow(window, nowMs)) byFilename.set(window.filename, window);
  }
  return [...byFilename.values()].sort((left, right) => left.startMs - right.startMs || left.filename.localeCompare(right.filename));
}

function value(value, fallback = 'unavailable') {
  if (value === undefined || value === null || value === '') return fallback;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function eventLines(event, window) {
  const history = event.occurrences.filter((entry) => entry.atMs <= window.endMs);
  const current = history.filter((entry) => entry.atMs >= window.startMs);
  const latest = history.at(-1);
  const assessment = latest.assessment?.payload;
  return [
    `## Event ${event.key}`,
    '',
    `- Runtime: ${event.runtime}`,
    `- Unit ID: ${event.unitId}`,
    `- Error type: ${event.errorType}`,
    `- Top frame: ${event.topFrame}`,
    `- First seen: ${formatLocalTimestamp(history[0].atMs)}`,
    `- Last seen: ${formatLocalTimestamp(latest.atMs)}`,
    `- Lifetime occurrences: ${history.length}`,
    `- Latest message: ${value(latest.context.message)}`,
    `- Latest build: ${value(latest.payload.execution?.buildId)}`,
    `- Latest thread: ${value(latest.context.thread)}`,
    `- Drift: ${value(assessment?.drift)}`,
    `- Seam: ${value(assessment?.seam)}`,
    `- Propose-only remediation: ${value(assessment?.recovery?.proposals)}`,
    '',
    '### Occurrence times in this window',
    '',
    ...current.map((entry) => `- ${formatLocalTimestamp(entry.atMs)}`),
    '',
    '## All occurrence times through window end',
    '',
    ...history.map((entry) => `- ${formatLocalTimestamp(entry.atMs)}`),
    '',
  ];
}
```

- [ ] **Step 4: Implement the canonical header, ordering, warnings, and integrity line**

`compileHourlyReport` must parse with `cutoffMs: window.endMs`, retain only events with an occurrence in `[window.startMs, window.endMs)`, sort by descending history length then key, and render this exact top-level order:

```js
const body = [
  '# Subtlety APM Hourly Report',
  '',
  `- Window start: ${formatLocalTimestamp(window.startMs)}`,
  `- Window end: ${formatLocalTimestamp(window.endMs)}`,
  `- Canonical generation instant: ${formatLocalTimestamp(window.endMs)}`,
  `- Timezone offset at start: UTC${window.filename.match(/UTC([+-]\d{4})/)[1]}`,
  `- Source ledger: ${sourcePath}`,
  `- Source record set checksum: ${parsed.sourceRecordSetChecksum}`,
  '',
  '## Summary',
  '',
  `- Current-window occurrences: ${windowOccurrences}`,
  `- Distinct active events: ${activeEvents.length}`,
  `- New events: ${newEvents}`,
  `- Recurring events: ${recurringEvents}`,
  '',
  ...activeEvents.flatMap((event) => eventLines(event, window)),
  '## Warnings',
  '',
  ...(parsed.warnings.length ? parsed.warnings.map((entry) => `- ${entry.code} [${entry.checksum}]: ${entry.detail}`) : ['- None']),
  '',
].join('\n');
const integrityChecksum = sha256Hex(body);
const markdown = `${body}Report integrity checksum: ${integrityChecksum}\n`;
```

- [ ] **Step 5: Run compiler, ledger, and hour-window tests**

Run: `TZ=America/New_York npx vitest run tests/codex/core/pixelbrain/subtlety-apm-hourly-compiler.test.js tests/codex/core/pixelbrain/subtlety-apm-ledger.test.js tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js`

Expected: PASS; the same window and ledger bytes always produce identical Markdown and checksum.

- [ ] **Step 6: Commit the Stateless Chronicle Compiler**

```bash
git add codex/core/pixelbrain/subtlety-apm-hourly-compiler.js tests/codex/core/pixelbrain/subtlety-apm-hourly-compiler.test.js
git commit -m "feat: compile cumulative APM hourly Markdown"
```

### Task 6: Publish Reports Atomically and Without Overwrite

**Files:**
- Create: `codex/services/subtlety-apm-report-store.js`
- Create: `tests/codex/services/subtlety-apm-report-store.test.js`

**Interfaces:**
- Produces: `createSubtletyApmReportStore({ ledgerPath, reportDir, fsApi })`.
- Methods: `readLedgerSnapshot() -> Promise<string>`, `listReportFilenames() -> Promise<string[]>`, and `publish({ filename, markdown }) -> Promise<{ status, path }>`.
- Publish statuses: `published`, `identical`, or `conflict`; conflict also returns `existingChecksum` and `incomingChecksum`.

- [ ] **Step 1: Write failing adapter tests**

```js
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSubtletyApmReportStore } from '../../../codex/services/subtlety-apm-report-store.js';

describe('Subtlety APM report store', () => {
  let dir; let ledgerPath; let reportDir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'apm-report-store-')); ledgerPath = join(dir, 'ledger.jsonl'); reportDir = join(dir, 'reports'); await writeFile(ledgerPath, 'one\n', 'utf8'); });
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  it('reads a byte-stable snapshot and publishes exclusively', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
    expect(await store.readLedgerSnapshot()).toBe('one\n');
    expect((await store.publish({ filename: 'APM-2026-08-03-1000-UTC-0400.md', markdown: 'body\n' })).status).toBe('published');
    expect((await store.publish({ filename: 'APM-2026-08-03-1000-UTC-0400.md', markdown: 'body\n' })).status).toBe('identical');
    const conflict = await store.publish({ filename: 'APM-2026-08-03-1000-UTC-0400.md', markdown: 'different\n' });
    expect(conflict.status).toBe('conflict');
    expect(await readFile(join(reportDir, 'APM-2026-08-03-1000-UTC-0400.md'), 'utf8')).toBe('body\n');
    expect((await readdir(reportDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects path traversal before filesystem mutation', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
    await expect(store.publish({ filename: '../escape.md', markdown: 'no' })).rejects.toThrow('invalid APM report filename');
  });
});
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `npx vitest run tests/codex/services/subtlety-apm-report-store.test.js`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement confined same-directory exclusive publication**

```js
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { sha256Hex } from '../core/pixelbrain/sha256.js';

const REPORT_NAME = /^APM-\d{4}-\d{2}-\d{2}-\d{4}-UTC[+-]\d{4}\.md$/;

export function createSubtletyApmReportStore({ ledgerPath, reportDir, fsApi = fs }) {
  async function readLedgerSnapshot() { return fsApi.readFile(ledgerPath, 'utf8'); }
  async function listReportFilenames() {
    try { return (await fsApi.readdir(reportDir)).filter((name) => REPORT_NAME.test(name)).sort(); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  }
  async function publish({ filename, markdown }) {
    if (!REPORT_NAME.test(filename)) throw new TypeError('invalid APM report filename');
    await fsApi.mkdir(reportDir, { recursive: true });
    const target = join(reportDir, filename);
    const temporary = join(reportDir, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await fsApi.open(temporary, 'wx', 0o600);
      await handle.writeFile(markdown, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      try { await fsApi.link(temporary, target); }
      catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const existing = await fsApi.readFile(target, 'utf8');
        if (existing === markdown) return { status: 'identical', path: target };
        return { status: 'conflict', path: target, existingChecksum: sha256Hex(existing), incomingChecksum: sha256Hex(markdown) };
      }
      return { status: 'published', path: target };
    } finally {
      await handle?.close().catch(() => {});
      await fsApi.unlink(temporary).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
  }
  return { readLedgerSnapshot, listReportFilenames, publish, ledgerPath, reportDir };
}
```

- [ ] **Step 4: Add injected interruption coverage and verify GREEN**

Wrap `fsApi.link` to throw `Object.assign(new Error('interrupted'), { code: 'EIO' })`; assert rejection, no visible `.md`, and no `.tmp`. Run:

Run: `npx vitest run tests/codex/services/subtlety-apm-report-store.test.js`

Expected: PASS for publish, identical idempotence, divergent conflict, traversal rejection, and interrupted cleanup.

- [ ] **Step 5: Commit the filesystem adapter**

```bash
git add codex/services/subtlety-apm-report-store.js tests/codex/services/subtlety-apm-report-store.test.js
git commit -m "feat: atomically publish APM hourly reports"
```

### Task 7: Coordinate Catch-Up, Retry, Serialization, and Shutdown

**Files:**
- Create: `codex/runtime/subtlety-apm-hourly-reporter.js`
- Create: `tests/codex/runtime/subtlety-apm-hourly-reporter.test.js`

**Interfaces:**
- Consumes: a report store from Task 6 plus pure `discoverCompletedActiveWindows` and `compileHourlyReport` functions.
- Produces: `createSubtletyApmHourlyReporter(options)` with synchronous `start()`, promise-returning `requestTick()`, `whenIdle()`, and `stop()`.
- State guarantee: one active pass, at most one queued follow-up pass, no cursor/checkpoint, and no live timer/backoff after `stop()` resolves.

- [ ] **Step 1: Write failing coordinator tests with fake timers**

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubtletyApmHourlyReporter } from '../../../codex/runtime/subtlety-apm-hourly-reporter.js';

describe('Subtlety APM hourly reporter coordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('catches up oldest-first, omits quiet hours, and becomes byte-idempotent', async () => {
    const published = [];
    const store = {
      readLedgerSnapshot: vi.fn(async () => 'ledger'),
      listReportFilenames: vi.fn(async () => []),
      publish: vi.fn(async (report) => { published.push(report.filename); return { status: 'published' }; }),
    };
    const windows = [{ startMs: 1, endMs: 2, filename: 'APM-2026-08-03-0800-UTC-0400.md' }, { startMs: 3, endMs: 4, filename: 'APM-2026-08-03-0900-UTC-0400.md' }];
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: store, clock: () => 10,
      discoverWindows: () => windows,
      compile: ({ window }) => window.startMs === 1
        ? { status: 'quiet', filename: window.filename, window }
        : { status: 'report', filename: window.filename, markdown: 'body\n' },
      nextBoundary: () => 60_000,
    });
    reporter.start();
    await reporter.whenIdle();
    expect(published).toEqual(['APM-2026-08-03-0900-UTC-0400.md']);
    await reporter.requestTick();
    expect(store.publish).toHaveBeenCalledTimes(2);
    await reporter.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries transient I/O at 250ms, 1s, and 4s without overlapping passes', async () => {
    const readLedgerSnapshot = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockRejectedValueOnce(Object.assign(new Error('again'), { code: 'EIO' }))
      .mockResolvedValue('ledger');
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: { readLedgerSnapshot, listReportFilenames: async () => [], publish: async () => ({ status: 'published' }) },
      clock: () => 10, discoverWindows: () => [], compile: vi.fn(), nextBoundary: () => 60_000,
    });
    reporter.start();
    const overlap = reporter.requestTick();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1000);
    await overlap;
    expect(readLedgerSnapshot).toHaveBeenCalledTimes(4);
    await reporter.stop();
  });

  it('aborts retry backoff and the boundary timer on stop', async () => {
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: { readLedgerSnapshot: async () => { throw Object.assign(new Error('down'), { code: 'EIO' }); }, listReportFilenames: async () => [], publish: vi.fn() },
      clock: () => 10, discoverWindows: () => [], compile: vi.fn(), nextBoundary: () => 60_000,
    });
    reporter.start();
    const stopped = reporter.stop();
    await vi.runAllTimersAsync();
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run coordinator tests and verify RED**

Run: `npx vitest run tests/codex/runtime/subtlety-apm-hourly-reporter.test.js`

Expected: FAIL because the runtime module does not exist.

- [ ] **Step 3: Implement abortable retry and one-pass compilation**

```js
import { compileHourlyReport, discoverCompletedActiveWindows } from '../core/pixelbrain/subtlety-apm-hourly-compiler.js';
import { nextLocalHourBoundary } from '../core/pixelbrain/subtlety-apm-hour-window.js';

const TRANSIENT = new Set(['EACCES', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ENOENT']);

function abortableDelay(ms, signal, setTimer, clearTimer) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimer(resolve, ms);
    signal.addEventListener('abort', () => { clearTimer(timer); reject(signal.reason); }, { once: true });
  });
}

export function createSubtletyApmHourlyReporter({
  reportStore,
  clock = () => Date.now(),
  discoverWindows = discoverCompletedActiveWindows,
  compile = compileHourlyReport,
  nextBoundary = nextLocalHourBoundary,
  retryDelays = [250, 1000, 4000],
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  logger = {},
} = {}) {
  if (!reportStore) throw new TypeError('createSubtletyApmHourlyReporter requires reportStore');
  let stopped = true;
  let running = false;
  let queued = false;
  let boundaryTimer = null;
  let active = Promise.resolve();
  let controller = new AbortController();

  async function pass() {
    const ledgerText = await reportStore.readLedgerSnapshot();
    const existing = new Set(await reportStore.listReportFilenames());
    const windows = discoverWindows({ ledgerText, nowMs: clock() });
    for (const window of windows) {
      if (controller.signal.aborted || existing.has(window.filename)) continue;
      const result = compile({ ledgerText, sourcePath: reportStore.ledgerPath, window });
      if (result.status === 'quiet') continue;
      const published = await reportStore.publish({ filename: result.filename, markdown: result.markdown });
      if (published.status === 'conflict') {
        const error = new Error(`APM report integrity conflict: ${result.filename}`);
        error.code = 'APM_REPORT_CONFLICT';
        throw error;
      }
      existing.add(result.filename);
      logger.info?.({ filename: result.filename, status: published.status, emittedAt: new Date(clock()).toISOString() }, '[subtlety-apm] hourly report ready');
    }
  }

  async function passWithRetry() {
    for (let attempt = 0; ; attempt += 1) {
      try { return await pass(); }
      catch (error) {
        if (controller.signal.aborted) return;
        if (!TRANSIENT.has(error?.code) || attempt >= retryDelays.length) throw error;
        await abortableDelay(retryDelays[attempt], controller.signal, setTimer, clearTimer);
      }
    }
  }
```

- [ ] **Step 4: Implement serialized ticks, idle, boundary recalculation, and stop**

Complete the factory with these state transitions:

```js
  async function drain() {
    running = true;
    try {
      do {
        queued = false;
        await passWithRetry().catch((error) => logger.error?.({ err: error }, '[subtlety-apm] reporter pass failed'));
      } while (queued && !stopped);
    } finally { running = false; }
  }

  function requestTick() {
    if (stopped) return active;
    queued = true;
    if (!running) active = drain();
    return active;
  }

  function scheduleNext() {
    if (stopped) return;
    const nowMs = clock();
    const delay = Math.max(1, nextBoundary(nowMs) - nowMs);
    boundaryTimer = setTimer(() => {
      boundaryTimer = null;
      void requestTick().finally(scheduleNext);
    }, delay);
    boundaryTimer?.unref?.();
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    controller = new AbortController();
    void requestTick();
    scheduleNext();
  }

  async function stop() {
    stopped = true;
    queued = false;
    controller.abort(new Error('Subtlety APM reporter stopped'));
    if (boundaryTimer !== null) clearTimer(boundaryTimer);
    boundaryTimer = null;
    await active.catch(() => {});
  }

  function whenIdle() { return active; }
  return { start, stop, requestTick, whenIdle };
}
```

- [ ] **Step 5: Add a real-store restart integration test and verify GREEN**

Use a temporary ledger/report directory, run reporter A through catch-up and stop, create reporter B over the same paths, and assert exactly one filename with byte-identical content. Then run:

Run: `TZ=America/New_York npx vitest run tests/codex/runtime/subtlety-apm-hourly-reporter.test.js tests/codex/services/subtlety-apm-report-store.test.js tests/codex/core/pixelbrain/subtlety-apm-hourly-compiler.test.js`

Expected: PASS for startup catch-up, quiet omission, retry, overlap serialization, restart idempotence, and timer/backoff cancellation.

- [ ] **Step 6: Commit runtime orchestration**

```bash
git add codex/runtime/subtlety-apm-hourly-reporter.js tests/codex/runtime/subtlety-apm-hourly-reporter.test.js
git commit -m "feat: schedule restart-safe APM hourly catch-up"
```

### Task 8: Bind the Reporter to Fastify Without Coupling It to Ingest

**Files:**
- Create: `codex/server/plugins/subtlety-apm-hourly.plugin.js`
- Create: `tests/codex/server/subtlety-apm-hourly-plugin.test.js`
- Modify: `codex/server/index.js:97-100`
- Modify: `codex/server/index.js:1223-1226`
- Modify: `tests/codex/server/subtlety-routes.test.js`

**Interfaces:**
- Consumes: `subtletyApmHourlyPlugin(fastify, { enabled, ledgerPath, reportDir, reporter })`.
- Lifecycle: `onReady` calls synchronous `reporter.start()` and does not await catch-up; `onClose` awaits `reporter.stop()`.
- Defaults: ledger `codex/server/data/subtlety-resonance.jsonl`; reports `divtube_downloader/APM-Hourly-Reports`.

- [ ] **Step 1: Write failing plugin lifecycle tests**

```js
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { subtletyApmHourlyPlugin } from '../../../codex/server/plugins/subtlety-apm-hourly.plugin.js';

describe('Subtlety APM hourly Fastify plugin', () => {
  it('starts after readiness and stops cleanly', async () => {
    const reporter = { start: vi.fn(), stop: vi.fn(async () => {}) };
    const app = Fastify({ logger: false });
    await app.register(subtletyApmHourlyPlugin, { reporter });
    expect(reporter.start).not.toHaveBeenCalled();
    await app.ready();
    expect(reporter.start).toHaveBeenCalledOnce();
    await app.close();
    expect(reporter.stop).toHaveBeenCalledOnce();
  });

  it('keeps readiness and close alive when reporter hooks fail', async () => {
    const app = Fastify({ logger: false });
    await app.register(subtletyApmHourlyPlugin, {
      reporter: { start: () => { throw new Error('start failed'); }, stop: async () => { throw new Error('stop failed'); } },
    });
    await expect(app.ready()).resolves.toBeUndefined();
    await expect(app.close()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run plugin and route tests and verify RED**

Run: `npx vitest run tests/codex/server/subtlety-apm-hourly-plugin.test.js tests/codex/server/subtlety-routes.test.js`

Expected: FAIL because the plugin module does not exist.

- [ ] **Step 3: Implement the lifecycle plugin**

```js
import { createSubtletyApmReportStore } from '../../services/subtlety-apm-report-store.js';
import { createSubtletyApmHourlyReporter } from '../../runtime/subtlety-apm-hourly-reporter.js';

export async function subtletyApmHourlyPlugin(fastify, opts = {}) {
  if (opts.enabled === false) return;
  const reporter = opts.reporter || createSubtletyApmHourlyReporter({
    reportStore: createSubtletyApmReportStore({ ledgerPath: opts.ledgerPath, reportDir: opts.reportDir }),
    logger: fastify.log,
  });
  fastify.addHook('onReady', async () => {
    try { reporter.start(); }
    catch (error) { fastify.log?.error?.({ err: error }, '[subtlety-apm] reporter start failed'); }
  });
  fastify.addHook('onClose', async () => {
    try { await reporter.stop(); }
    catch (error) { fastify.log?.error?.({ err: error }, '[subtlety-apm] reporter stop failed'); }
  });
}
```

- [ ] **Step 4: Register production paths next to the existing Subtlety runtime**

Import the plugin in `codex/server/index.js`, then register it immediately after `fastify.register(subtletyRoutes)`:

```js
const subtletyResonancePath = process.env.SUBTLETY_RESONANCE_PATH
    || path.join(PROJECT_ROOT, 'codex', 'server', 'data', 'subtlety-resonance.jsonl');
const subtletyApmReportDir = process.env.SUBTLETY_APM_REPORT_DIR
    || path.join(PROJECT_ROOT, 'divtube_downloader', 'APM-Hourly-Reports');
fastify.register(subtletyApmHourlyPlugin, {
    enabled: !IS_TEST_RUNTIME,
    ledgerPath: subtletyResonancePath,
    reportDir: subtletyApmReportDir,
});
```

Pass the same `subtletyResonancePath` into eager runtime initialization so writer and reporter cannot silently diverge:

```js
getSubtletyRuntime({
    alertFn: fastify.subtletyCreateAlert,
    store: createResonanceStore({ path: subtletyResonancePath }),
});
```

Add the required `createResonanceStore` import. Do not add reporter calls to `ingestCrash`, route handlers, or spool draining.

- [ ] **Step 5: Prove ingest remains isolated from reporter failure**

In `tests/codex/server/subtlety-routes.test.js`, register a failing reporter plugin beside `subtletyRoutes`, call `app.ready()`, POST `sample`, assert HTTP 200 and a persisted fingerprint, then close cleanly. Run:

Run: `npx vitest run tests/codex/server/subtlety-apm-hourly-plugin.test.js tests/codex/server/subtlety-routes.test.js tests/codex/core/pixelbrain/subtlety-runtime.test.js`

Expected: PASS; reporter failure logs only and never alters ingest results.

- [ ] **Step 6: Commit server composition**

```bash
git add codex/server/plugins/subtlety-apm-hourly.plugin.js codex/server/index.js tests/codex/server/subtlety-apm-hourly-plugin.test.js tests/codex/server/subtlety-routes.test.js
git commit -m "feat: bind APM hourly reporter lifecycle"
```

### Task 9: Replay the Real Ledger and Record `IMPLEMENTED_METASTABLE`

**Files:**
- Create: `scripts/replay-subtlety-apm-hourly-reports.mjs`
- Create: `tests/codex/server/subtlety-apm-hourly-replay.test.js`
- Create after successful replay: `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/implementation-replay.json`
- Read only: `codex/server/data/subtlety-resonance.jsonl`

**Interfaces:**
- CLI: `node scripts/replay-subtlety-apm-hourly-reports.mjs --ledger <path> --reports <temporary-dir> --manifest <path>`.
- Produces manifest schema `PB-CONCEPT-CHEM-APM-IMPLEMENTATION-REPLAY-v1` with state `IMPLEMENTED_METASTABLE`, source checksum before/after, report filenames/checksums, two-pass status, recurrence growth, and tested Git commit.

- [ ] **Step 1: Write a failing isolated replay test**

The test copies a fixture ledger into a temporary directory, invokes exported `replayLedger`, and asserts:

```js
const manifest = await replayLedger({ ledgerPath, reportDir, testCommit: '0123456789abcdef' });
expect(manifest).toMatchObject({
  schema: 'PB-CONCEPT-CHEM-APM-IMPLEMENTATION-REPLAY-v1',
  state: 'IMPLEMENTED_METASTABLE',
  sourceUnchanged: true,
  secondPassByteIdentical: true,
  recurrenceGrowthObserved: true,
  testCommit: '0123456789abcdef',
});
expect(manifest.reports.length).toBeGreaterThan(0);
expect(await readdir(productionReportDir).catch(() => [])).toEqual([]);
```

- [ ] **Step 2: Run replay test and verify RED**

Run: `TZ=America/New_York npx vitest run tests/codex/server/subtlety-apm-hourly-replay.test.js`

Expected: FAIL because the replay driver does not exist.

- [ ] **Step 3: Implement two-pass replay over the same report directory**

```js
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256Hex } from '../codex/core/pixelbrain/sha256.js';
import { compileHourlyReport, discoverCompletedActiveWindows } from '../codex/core/pixelbrain/subtlety-apm-hourly-compiler.js';
import { createSubtletyApmReportStore } from '../codex/services/subtlety-apm-report-store.js';

async function inventory(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(names.map(async (filename) => ({ filename, checksum: sha256Hex(await readFile(resolve(directory, filename), 'utf8')) })));
}

export async function replayLedger({ ledgerPath, reportDir, testCommit }) {
  const sourceBefore = await readFile(ledgerPath, 'utf8');
  const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
  const timestampValues = sourceBefore.split('\n').filter(Boolean).map((line) => {
    try { return Date.parse(JSON.parse(line).recordedAt); } catch { return Number.NaN; }
  }).filter(Number.isFinite);
  const replayCutoffMs = Math.max(...timestampValues) + 48 * 60 * 60 * 1000;
  const windows = discoverCompletedActiveWindows({ ledgerText: sourceBefore, nowMs: replayCutoffMs });
  for (const window of windows) {
    const result = compileHourlyReport({ ledgerText: sourceBefore, sourcePath: ledgerPath, window });
    if (result.status === 'report') await store.publish({ filename: result.filename, markdown: result.markdown });
  }
  const firstInventory = await inventory(reportDir);
  for (const window of windows) {
    const result = compileHourlyReport({ ledgerText: sourceBefore, sourcePath: ledgerPath, window });
    if (result.status === 'report') await store.publish({ filename: result.filename, markdown: result.markdown });
  }
  const secondInventory = await inventory(reportDir);
  const sourceAfter = await readFile(ledgerPath, 'utf8');
  const lifetimeCounts = await Promise.all(firstInventory.map(async ({ filename }) => {
    const markdown = await readFile(resolve(reportDir, filename), 'utf8');
    return [...markdown.matchAll(/- Lifetime occurrences: (\d+)/g)].map((match) => Number(match[1]));
  }));
  return {
    schema: 'PB-CONCEPT-CHEM-APM-IMPLEMENTATION-REPLAY-v1',
    state: 'IMPLEMENTED_METASTABLE',
    sourceLedger: ledgerPath,
    sourceChecksum: sha256Hex(sourceBefore),
    sourceUnchanged: sourceBefore === sourceAfter,
    reports: firstInventory,
    secondPassByteIdentical: JSON.stringify(firstInventory) === JSON.stringify(secondInventory),
    recurrenceGrowthObserved: lifetimeCounts.flat().some((count) => count > 1),
    testCommit,
  };
}
```

The CLI parser must require all three paths, derive `testCommit` with `git rev-parse HEAD`, refuse a report directory equal to `divtube_downloader/APM-Hourly-Reports`, write the manifest only when every boolean gate is true, and exit nonzero otherwise.

- [ ] **Step 4: Verify the replay driver against a fixture**

Run: `TZ=America/New_York npx vitest run tests/codex/server/subtlety-apm-hourly-replay.test.js`

Expected: PASS with at least one report, recurrence growth, byte-identical second pass, and unchanged source.

- [ ] **Step 5: Commit replay code, then run the real ledger into `/tmp`**

```bash
git add scripts/replay-subtlety-apm-hourly-reports.mjs tests/codex/server/subtlety-apm-hourly-replay.test.js
git commit -m "test: add isolated APM real-ledger replay"
```

Create a unique directory with `mktemp -d`, then run the replay CLI with the real ledger, that temporary report directory, and manifest path `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/implementation-replay.json`.

Expected: nonzero report count, `sourceUnchanged: true`, `secondPassByteIdentical: true`, `recurrenceGrowthObserved: true`, and no files under the production report directory.

- [ ] **Step 6: Commit immutable Level 2 evidence**

```bash
git add docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/implementation-replay.json
git commit -m "evidence: promote APM reporter to implemented metastable"
```

### Task 10: Gate Level 1, Restart the Server, and Record Live Stability

**Files:**
- Create: `scripts/verify-subtlety-apm-live-operation.mjs`
- Create: `tests/codex/server/subtlety-apm-live-operation.test.js`
- Create only after restart proof: `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/live-operation.json`
- Modify after verification: `docs/superpowers/specs/2026-08-03-concept-chemistry-metastable-stateless-reporter-design.md`

**Interfaces:**
- Capture: `node scripts/verify-subtlety-apm-live-operation.mjs capture --ledger <path> --reports <dir> --state /tmp/subtlety-apm-live-before-restart.json`.
- Verify: `node scripts/verify-subtlety-apm-live-operation.mjs verify --ledger <path> --reports <dir> --state /tmp/subtlety-apm-live-before-restart.json --evidence <path>`.
- Final evidence schema: `PB-CONCEPT-CHEM-APM-LIVE-OPERATION-v1`, state `STABLE_OPERATIONAL`.

- [ ] **Step 1: Write failing two-phase proof tests**

Create a temporary ledger and one valid report. Capture state, mutate nothing, verify after a simulated restart, and assert the final evidence contains:

```js
expect(evidence).toMatchObject({
  schema: 'PB-CONCEPT-CHEM-APM-LIVE-OPERATION-v1',
  state: 'STABLE_OPERATIONAL',
  byteIdenticalAfterRestart: true,
  duplicateCount: 1,
});
expect(evidence.reportFilename).toMatch(/^APM-.*\.md$/);
expect(evidence.reportChecksum).toMatch(/^[0-9a-f]{64}$/);
expect(evidence.ledgerChecksum).toMatch(/^[0-9a-f]{64}$/);
```

Then alter the report between capture and verify and assert verification refuses to write evidence.

- [ ] **Step 2: Run live-proof tests and verify RED**

Run: `npx vitest run tests/codex/server/subtlety-apm-live-operation.test.js`

Expected: FAIL because the live proof driver does not exist.

- [ ] **Step 3: Implement capture/verify with no production mutation beyond the final evidence file**

The script must select the most recently modified valid report filename, read its canonical window-end line as `boundaryTime`, hash the ledger and report with `sha256Hex`, record `git rev-parse HEAD`, and write capture state only to the caller-supplied `/tmp` path. Verify must require the same filename to exist exactly once, require identical report bytes/checksum, confirm the report's window contains at least one valid fingerprint from the current ledger, and only then write:

```js
const evidence = {
  schema: 'PB-CONCEPT-CHEM-APM-LIVE-OPERATION-v1',
  state: 'STABLE_OPERATIONAL',
  reportFilename: before.reportFilename,
  reportChecksum: afterReportChecksum,
  ledgerChecksum: sha256Hex(afterLedger),
  boundaryTime: before.boundaryTime,
  serverCommitBeforeRestart: before.serverCommit,
  serverCommitAfterRestart: currentCommit,
  byteIdenticalAfterRestart: before.reportBytes === afterReport,
  duplicateCount: filenames.filter((name) => name === before.reportFilename).length,
};
```

- [ ] **Step 4: Run the complete automated Level 1 suite**

Run:

```bash
TZ=America/New_York npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-metastable-promotion.test.js tests/codex/core/pixelbrain/subtlety-resonance-store.test.js tests/codex/core/pixelbrain/subtlety-runtime.test.js tests/codex/core/pixelbrain/subtlety-apm-hour-window.test.js tests/codex/core/pixelbrain/subtlety-apm-ledger.test.js tests/codex/core/pixelbrain/subtlety-apm-hourly-compiler.test.js tests/codex/services/subtlety-apm-report-store.test.js tests/codex/runtime/subtlety-apm-hourly-reporter.test.js tests/codex/server/subtlety-apm-hourly-plugin.test.js tests/codex/server/subtlety-apm-hourly-replay.test.js tests/codex/server/subtlety-apm-live-operation.test.js tests/codex/server/subtlety-routes.test.js
```

Expected: all focused tests PASS and cover all 20 frozen acceptance requirements.

Run: `npx vitest run tests/codex/core/pixelbrain`

Expected: all existing PixelBrain/Subtlety regression tests PASS.

Run: `npm run build:app`

Expected: production build PASS, proving Node-only namespace import choices do not break the browser graph.

- [ ] **Step 5: Run schema/law and immunity gates before integration**

Run: `npm run immune:scan:all`

Expected: zero new CRIT/FATAL violations attributable to this change.

Run the collaboration `verify_run` profiles `schema`, `test`, and `build`, each linked to the implementation task. Record every result in the task note before changing task status to review.

- [ ] **Step 6: Commit the live-proof driver while state remains `IMPLEMENTED_METASTABLE`**

```bash
git add scripts/verify-subtlety-apm-live-operation.mjs tests/codex/server/subtlety-apm-live-operation.test.js
git commit -m "test: add APM live restart proof"
```

- [ ] **Step 7: Perform the actual active-hour and restart proof**

Integrate the branch through the repository's chosen merge workflow, restart the authority server on that commit, and wait for a completed machine-local hour containing at least one new valid fingerprint. Confirm a matching Markdown file appears automatically under `divtube_downloader/APM-Hourly-Reports`.

Run capture with the production ledger/report paths and `/tmp/subtlety-apm-live-before-restart.json`. Restart the same server commit once. Run verify with evidence path `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/live-operation.json`.

Expected: `byteIdenticalAfterRestart: true`, `duplicateCount: 1`, and state `STABLE_OPERATIONAL`. A quiet hour leaves this step pending and is not a failure.

- [ ] **Step 8: Record the conclusion without erasing negative evidence**

Append a dated result section to the approved metastable design linking all three evidence files and stating whether the revised majority-control thesis reached `STABLE_OPERATIONAL`. Explicitly retain the statement that the original stable-selection protocol failed.

```bash
git add docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/live-operation.json docs/superpowers/specs/2026-08-03-concept-chemistry-metastable-stateless-reporter-design.md
git commit -m "evidence: promote APM reporter to stable operational"
```

## Final Acceptance Map

| Frozen requirement | Primary proof |
|---|---|
| Quiet hour, one-event boundary, assessment non-counting | Task 5 compiler tests |
| Cumulative recurrence, inactive prior event omission | Tasks 4-5 projection/compiler tests |
| Restart catch-up and repeated-window idempotence | Task 7 real-store integration test |
| Divergent conflict and interrupted persistence | Task 6 adapter tests |
| Shuffle determinism and integrity checksums | Tasks 4-5 pure tests |
| Spring-forward/fall-back identity | Task 3 timezone tests |
| Malformed/future warnings | Task 4 parser tests |
| Transient retry and no overlap | Task 7 fake-timer tests |
| Fastify start/stop and no live timer | Tasks 7-8 lifecycle tests |
| Existing Subtlety behavior | Tasks 2, 8, and full Level 1 run |
| v2 context, v1 fallback, redaction/bounds, packet checksum stability | Task 2 schema tests |
| Real-ledger reproducibility | Task 9 immutable replay manifest |
| Automatic active-hour emission and restart stability | Task 10 immutable live manifest |
