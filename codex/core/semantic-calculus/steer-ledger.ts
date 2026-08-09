/**
 * STEER LEDGER — PB-STEER-v1 / PB-STEER-RESOLVE-v1
 * ========================================================================
 *
 * PHASE 0 of the Pressure Field Governor PDR
 * (docs/scholomance-encyclopedia/PDR-archive/2026-08-09-pressure-field-governor-pdr.md).
 *
 * A record of deflections — actions a governor refused — written at the
 * moment of refusal, PLUS the predicate that makes the record evidence:
 * a resolution row that can later say the deflection was WRONG.
 *
 * WHY THIS EXISTS. The repository's named pathology is
 * `project-checks-that-cannot-fail`: "Prediction had no predicate field...
 * Every prediction was decorative prose." A deflection nobody can mark
 * wrong is the same shape — it can never calibrate anything. So this
 * ledger ships BEFORE the field it will one day calibrate (Phase 0 is the
 * separability experiment; if resolved receipts cannot separate good
 * trajectories from bad, the field is refuted and this ledger is the
 * deliverable).
 *
 * DISCIPLINE — inherited from the denial ledger (PB-DENY-v1):
 *
 *   - APPEND-ONLY. Rows are never rewritten or deleted. A deflection that
 *     turns out wrong gets a NEW resolution row; the reversal is part of
 *     the record. `appendResolution` never touches the evaluation row.
 *   - TIMESTAMP EXCLUDED FROM CHECKSUM. `capturedAt` is metadata only.
 *     Two rows identical in every other byte carry identical checksums,
 *     which is what makes the 100-iteration determinism ritual possible.
 *   - MALFORMED IS LOUD. Strict reads throw with the offending line
 *     number. The future calibrator (Phase 4) reads non-strict and counts
 *     skips; nothing silently drops evidence.
 *   - RESOLUTIONS REFERENCE. A resolution for an unknown steer-id is a
 *     corrupt write and is refused.
 *   - OUTCOME NULL IS INVISIBLE. An evaluation row with no resolution is
 *     excluded from `resolvedReceipts`, which is the only view a
 *     calibrator may fit. That is F8a in code.
 *
 * CROSS-LANGUAGE. Phase 0 rows are written by Python
 * (steamdeck_brain/vaelrix_forcefield/steer_emitter.py — the search and
 * tool governors) and validated here. Checksums therefore use the
 * canonical-json module's Python-compatible serialization. Key order is a
 * contract; both emitters declare it:
 *
 *   PB-STEER-v1:          schema, id, utterance, candidates,
 *                         selected_trajectory, verdict, outcome,
 *                         field_checksum   [+ checksum, capturedAt]
 *   candidate entry:      key, pressure, result, dominant_source,
 *                         gate_considered, governor, category, tier
 *                         (+ suggested_alternative, optional provenance)
 *   PB-STEER-RESOLVE-v1:  schema, steer_id, outcome, deflected_candidate,
 *                         note             [+ checksum, capturedAt]
 *
 * Phase 0 records exactly ONE measured pressure source per deflection, at
 * magnitude 1.0. Which source fired is the discriminative signal; invented
 * magnitudes would be self-scored pressure (F10). The category→source map
 * is declared in both emitters and mirrored in CATEGORY_PRESSURE below.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalStringify, parseCanonicalJson, pyFloat } from '../pixelbrain/canonical-json.js';

export const SCHEMA = 'PB-STEER-v1';
export const RESOLVE_SCHEMA = 'PB-STEER-RESOLVE-v1';
/**
 * An epoch marker starts a fresh measurement window WITHOUT deleting anything.
 * Append-only forbids truncating a smoke run out of the corpus, but a run that
 * emitted 70 rows in eight seconds is not evidence about a two-week clock
 * either. So the calibrator fits only rows after the LAST epoch marker, and
 * the earlier rows stay in the file as history. Re-dating the clock is one
 * appended row, and the reason it was re-dated is part of the record.
 */
export const EPOCH_SCHEMA = 'PB-STEER-EPOCH-v1';

/** F1 — the nine pressure sources. Tier membership lives in the field core
 *  (Phase 1); the ledger only needs the closed vocabulary. */
export const PRESSURE_SOURCES = Object.freeze([
  'law', 'authorization', 'destructive',            // Tier 0 — safety
  'scope', 'regression', 'dependency',              // Tier 1 — structure
  'evidence', 'uncertainty',                        // Tier 2 — epistemic
  'goal',                                           // Tier 3 — attraction (negative)
] as const);
export type PressureSource = (typeof PRESSURE_SOURCES)[number];

/** F8a — the only values a resolution may carry. `deflection_was_wrong` is
 *  the load-bearing one: the only signal that can falsify a weight. */
export const OUTCOMES = Object.freeze([
  'succeeded', 'regressed', 'needed_rework', 'deflection_was_wrong',
] as const);
export type Outcome = (typeof OUTCOMES)[number];

export const CANDIDATE_RESULTS = Object.freeze([
  'DEFLECTED', 'PERMITTED', 'GATED_OPEN', 'GATED_CLOSED', 'STALLED',
] as const);

export const VERDICTS = Object.freeze(['PERMITTED', 'STALLED'] as const);

/** Canonical key order — a cross-language contract, see header. */
export const RECEIPT_KEYS = Object.freeze([
  'schema', 'id', 'utterance', 'candidates', 'selected_trajectory',
  'verdict', 'outcome', 'field_checksum',
] as const);
export const CANDIDATE_KEYS = Object.freeze([
  'key', 'pressure', 'result', 'dominant_source', 'gate_considered',
  'governor', 'category', 'tier', 'suggested_alternative', 'provenance',
] as const);
export const RESOLUTION_KEYS = Object.freeze([
  'schema', 'steer_id', 'outcome', 'deflected_candidate', 'note',
] as const);
export const EPOCH_KEYS = Object.freeze([
  'schema', 'epoch', 'reason', 'note',
] as const);

/** Phase 0 emits from two governors; Phase 2 (--steer) emits from the gate. */
export const KNOWN_GOVERNORS = Object.freeze(['search', 'tool', 'scholo-gate'] as const);

/** Phase 0 category → measured pressure source. Mirrors CATEGORY_PRESSURE in
 *  steer_emitter.py. A change on either side is a contract change and must
 *  move both plus the cross-language fixture. */
export const CATEGORY_PRESSURE: Readonly<Record<string, PressureSource>> = Object.freeze({
  MISSING_REASON: 'evidence',
  REPEATED_SEARCH: 'regression',
  SEARCH_BUDGET_EXHAUSTED: 'scope',
  KNOWN_TARGET: 'evidence',
  SCDNA_BYPASS: 'evidence',
  TOOL_NOT_ALLOWED: 'authorization',
  TOOL_MISSING_REASON: 'evidence',
  TOOL_BUDGET_EXHAUSTED: 'scope',
  REPEATED_TOOL_CALL: 'regression',
});

export const ID_PATTERN = /^steer-\d{6}$/;

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root is three levels above codex/core/semantic-calculus/. */
export const DEFAULT_LEDGER_PATH = resolve(HERE, '..', '..', '..', 'bench', 'semantic-calculus', 'corpus', 'steer-receipts.jsonl');

/**
 * The ledger the CLI reads and writes. Honors SCHOLO_STEER_LEDGER_PATH so
 * tests and dry runs never touch the live corpus — symmetric with
 * steer_emitter.py, which honors the same variable.
 */
export function ledgerPath(): string {
  return process.env.SCHOLO_STEER_LEDGER_PATH || DEFAULT_LEDGER_PATH;
}

function fail(message: string): never {
  throw new Error(`${SCHEMA}: ${message}`);
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The Phase 0 field is empty by definition — no ridges, corridors, or gates
 * exist yet ("No field, no tiers, no ridges", PDR §8). Its checksum is a
 * computable constant so receipts still carry a real `field_checksum`; the
 * Python emitter computes the identical value. Asserted equal by the
 * cross-language test.
 */
export function phase0FieldChecksum(): string {
  const emptyField = { ridges: [], corridors: [], gates: [] };
  return sha256Hex(canonicalStringify(emptyField)).slice(0, 12);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`"${field}" is required and must be a non-empty string`);
  }
  return value;
}

/**
 * Validate the pressure object of a candidate entry. Phase 0 rows carry one
 * measured source at 1.0; later phases may carry several. Ranges: `goal` is
 * attraction and must be <= 0; every other source is pressure and >= 0.
 * Unknown source names are refused — the vocabulary is closed (F1).
 */
function normalizePressure(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) fail('"candidates[].pressure" must be an object');
  const out: Record<string, number> = {};
  for (const [source, magnitude] of Object.entries(value)) {
    if (!(PRESSURE_SOURCES as readonly string[]).includes(source)) {
      fail(`unknown pressure source "${source}" (closed vocabulary: ${PRESSURE_SOURCES.join(', ')})`);
    }
    if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) {
      fail(`pressure "${source}" must be a finite number`);
    }
    if (source === 'goal' ? magnitude > 0 : magnitude < 0) {
      fail(`pressure "${source}" out of range (${source === 'goal' ? 'goal is attraction and must be <= 0' : 'must be >= 0'})`);
    }
    if (Math.abs(magnitude) > 1) fail(`pressure "${source}" magnitude exceeds 1.0`);
    out[source] = magnitude;
  }
  return out;
}

function normalizeCandidate(value: unknown, index: number): Record<string, unknown> {
  const where = `candidates[${index}]`;
  if (!isPlainObject(value)) fail(`${where} must be an object`);

  const key = requireNonEmptyString(value.key, `${where}.key`);
  const pressure = normalizePressure(value.pressure);
  const result = value.result;
  if (!(CANDIDATE_RESULTS as readonly string[]).includes(result as string)) {
    fail(`${where}.result must be one of ${CANDIDATE_RESULTS.join(', ')}`);
  }
  if (Object.keys(pressure).length > 0 && !(value.dominant_source as string in pressure)) {
    fail(`${where}.dominant_source must name a measured pressure source`);
  }
  const gateConsidered = value.gate_considered;
  if (gateConsidered !== null && typeof gateConsidered !== 'string') {
    fail(`${where}.gate_considered must be a string or null`);
  }

  const candidate: Record<string, unknown> = {
    key,
    pressure: Object.fromEntries(Object.entries(pressure).map(([s, m]) => [s, pyFloat(m)])),
    result,
    dominant_source: value.dominant_source ?? null,
    gate_considered: gateConsidered ?? null,
  };
  // Provenance (F10): which governor deflected this, under which category
  // and tier, and what it suggested instead. Emitted by Phase 0 governors;
  // optional for later emitters. suggested_alternative is prose and never a
  // selected_trajectory (§3.3) — it rides along for canary review.
  if (value.governor !== undefined) candidate.governor = requireNonEmptyString(value.governor, `${where}.governor`);
  if (value.category !== undefined) candidate.category = requireNonEmptyString(value.category, `${where}.category`);
  if (value.tier !== undefined) candidate.tier = requireNonEmptyString(value.tier, `${where}.tier`);
  if (value.suggested_alternative !== undefined) {
    candidate.suggested_alternative = requireNonEmptyString(value.suggested_alternative, `${where}.suggested_alternative`);
  }
  // F10 in the data, not just in review: every pressure names the module that
  // produced it, so "no source was authored by the thing it ranks" is a query
  // over the corpus rather than a promise. Required once a candidate carries
  // more than one source — a single-source governor row is self-describing
  // through `category`, but a vector is not.
  if (value.provenance !== undefined) {
    if (!isPlainObject(value.provenance)) fail(`${where}.provenance must be an object`);
    for (const [source, producer] of Object.entries(value.provenance)) {
      if (!(source in pressure)) {
        fail(`${where}.provenance names "${source}", which carries no measured pressure`);
      }
      requireNonEmptyString(producer, `${where}.provenance.${source}`);
    }
    for (const source of Object.keys(pressure)) {
      if (!(source in (value.provenance as object))) {
        fail(`${where}.provenance omits "${source}" — every pressure must name its producer (F10)`);
      }
    }
    candidate.provenance = { ...(value.provenance as Record<string, string>) };
  } else if (Object.keys(pressure).length > 1) {
    fail(`${where}.provenance is required when a candidate carries more than one pressure source (F10)`);
  }
  return candidate;
}

/**
 * Validate an evaluation row body (without id/checksum/capturedAt, which the
 * writer supplies). Throws rather than defaulting — an unresolved required
 * slot is a refusal, never a plausible fill-in.
 */
export function normalizeSteerReceipt(entry: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(entry)) fail('receipt must be an object');
  if (entry.schema !== SCHEMA) fail(`"schema" must be "${SCHEMA}"`);

  const utterance = requireNonEmptyString(entry.utterance, 'utterance');
  if (!Array.isArray(entry.candidates) || entry.candidates.length === 0) {
    fail('"candidates" must be a non-empty array');
  }
  const candidates = entry.candidates.map((c, i) => normalizeCandidate(c, i));

  const selected = entry.selected_trajectory;
  if (selected !== null && typeof selected !== 'string') {
    fail('"selected_trajectory" must be a string or null');
  }
  if (!(VERDICTS as readonly string[]).includes(entry.verdict as string)) {
    fail(`"verdict" must be one of ${VERDICTS.join(', ')}`);
  }
  if (entry.verdict === 'STALLED' && selected !== null) {
    fail('a STALLED receipt cannot select a trajectory (§9.2: absorbing means removed)');
  }
  if (entry.outcome !== null && entry.outcome !== undefined) {
    fail('"outcome" must be null on an evaluation row — resolutions are separate rows (F8a)');
  }
  const fieldChecksum = requireNonEmptyString(entry.field_checksum, 'field_checksum');
  if (!/^[0-9a-f]{12}$/.test(fieldChecksum)) fail('"field_checksum" must be 12 hex chars');

  // Canonical key order, pyFloat magnitudes already applied per-source.
  return {
    schema: SCHEMA,
    id: '', // assigned by the writer (monotonic)
    utterance,
    candidates,
    selected_trajectory: selected ?? null,
    verdict: entry.verdict,
    outcome: null,
    field_checksum: fieldChecksum,
  };
}

/** Validate a resolution row. `knownIds` enforces referential integrity. */
export function normalizeResolution(entry: Record<string, unknown>, knownIds: ReadonlySet<string>): Record<string, unknown> {
  if (!isPlainObject(entry)) fail('resolution must be an object');
  if (entry.schema !== RESOLVE_SCHEMA) fail(`"schema" must be "${RESOLVE_SCHEMA}"`);

  const steerId = requireNonEmptyString(entry.steer_id, 'steer_id');
  if (!ID_PATTERN.test(steerId)) fail(`"steer_id" must match ${ID_PATTERN}`);
  if (!knownIds.has(steerId)) fail(`no receipt with id "${steerId}" exists — resolutions cannot reference the void`);

  const outcome = entry.outcome;
  if (!(OUTCOMES as readonly string[]).includes(outcome as string)) {
    fail(`"outcome" must be one of ${OUTCOMES.join(', ')}`);
  }
  const deflected = entry.deflected_candidate ?? null;
  if (outcome === 'deflection_was_wrong') {
    if (typeof deflected !== 'string' || deflected.trim().length === 0) {
      fail('"deflected_candidate" is required when outcome is deflection_was_wrong — say WHICH deflection was wrong');
    }
  } else if (deflected !== null && typeof deflected !== 'string') {
    fail('"deflected_candidate" must be a string or null');
  }
  const note = entry.note ?? '';
  if (typeof note !== 'string') fail('"note" must be a string');

  return {
    schema: RESOLVE_SCHEMA,
    steer_id: steerId,
    outcome,
    deflected_candidate: deflected,
    note,
  };
}

/**
 * Validate an epoch marker. `epoch` is a human-readable label for the window
 * it opens; `reason` says why the previous window was abandoned. Both are
 * required — an unexplained clock restart is how a smoke run quietly becomes
 * the dataset.
 */
export function normalizeEpoch(entry: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(entry)) fail('epoch must be an object');
  if (entry.schema !== EPOCH_SCHEMA) fail(`"schema" must be "${EPOCH_SCHEMA}"`);
  const epoch = requireNonEmptyString(entry.epoch, 'epoch');
  const reason = requireNonEmptyString(entry.reason, 'reason');
  const note = entry.note ?? '';
  if (typeof note !== 'string') fail('"note" must be a string');
  return { schema: EPOCH_SCHEMA, epoch, reason, note };
}

/** Checksum a canonical payload: everything except checksum + capturedAt. */
function rowChecksum(payload: Record<string, unknown>): string {
  return 'steer1:' + sha256Hex(canonicalStringify(payload)).slice(0, 16);
}

export interface LedgerContents {
  rows: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
  resolutions: Record<string, unknown>[];
  epochs: Record<string, unknown>[];
  skipped: number;
}

/**
 * Read the ledger. Strict (default) throws on any malformed line with its
 * 1-based line number; non-strict counts skips. Rows are parsed with the
 * canonical parser so numeric lexemes (1.0 stays 1.0) and key order survive
 * — checksum recomputation depends on both.
 */
export function readLedger(path: string = ledgerPath(), options: { strict?: boolean } = {}): LedgerContents {
  const strict = options.strict !== false;
  if (!existsSync(path)) return { rows: [], receipts: [], resolutions: [], epochs: [], skipped: 0 };

  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  lines.forEach((line, i) => {
    try {
      const parsed = parseCanonicalJson(line);
      if (!(parsed instanceof Map)) throw new SyntaxError('row is not a JSON object');
      const row = mapToObject(parsed);
      if (row.schema === SCHEMA) {
        normalizeSteerReceipt(row);
        row.id = row.id; // keep assigned id
        rows.push(row);
      } else if (row.schema === EPOCH_SCHEMA) {
        normalizeEpoch(row);
        rows.push(row);
      } else if (row.schema === RESOLVE_SCHEMA) {
        // Referential integrity is checked at WRITE time; reads tolerate an
        // orphan only in non-strict mode.
        if (strict) {
          normalizeResolution(row, new Set(rows.filter((r) => r.schema === SCHEMA).map((r) => r.id as string)));
        }
        rows.push(row);
      } else {
        throw new SyntaxError(`unknown schema "${String(row.schema)}"`);
      }
    } catch (err) {
      if (strict) fail(`malformed row at line ${i + 1}: ${(err as Error).message}`);
      skipped += 1;
    }
  });

  return {
    rows,
    receipts: rows.filter((r) => r.schema === SCHEMA),
    resolutions: rows.filter((r) => r.schema === RESOLVE_SCHEMA),
    epochs: rows.filter((r) => r.schema === EPOCH_SCHEMA),
    skipped,
  };
}

/** Convert a canonical Map tree back to plain objects (key order preserved
 *  by JS string-key insertion semantics). */
function mapToObject(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value) out[k] = mapToObjectValue(v);
    return out;
  }
  throw new Error('expected a canonical object');
}

function mapToObjectValue(value: unknown): unknown {
  if (value instanceof Map) return mapToObject(value);
  if (Array.isArray(value)) return value.map(mapToObjectValue);
  if (value !== null && typeof value === 'object' && 'lexeme' in (value as object)) {
    return Number((value as { lexeme: string }).lexeme);
  }
  return value;
}

/** Recompute every row checksum. Returns the offending rows, empty if ok. */
export function verifyLedger(path: string = ledgerPath()): { ok: boolean; bad: { line: number; id: string | null; reason: string }[] } {
  if (!existsSync(path)) return { ok: true, bad: [] };
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const bad: { line: number; id: string | null; reason: string }[] = [];

  lines.forEach((line, i) => {
    let id: string | null = null;
    try {
      const parsed = parseCanonicalJson(line);
      if (!(parsed instanceof Map)) throw new SyntaxError('row is not a JSON object');
      const checksum = parsed.get('checksum');
      const idValue = parsed.get('id') ?? parsed.get('steer_id') ?? null;
      id = typeof idValue === 'string' ? idValue : null;
      if (typeof checksum !== 'string') throw new SyntaxError('missing checksum');
      const payload = new Map(parsed);
      payload.delete('checksum');
      payload.delete('capturedAt');
      const expect = rowChecksum(payload as unknown as Record<string, unknown>);
      if (expect !== checksum) throw new SyntaxError(`checksum mismatch (expected ${expect})`);
    } catch (err) {
      bad.push({ line: i + 1, id, reason: (err as Error).message });
    }
  });

  return { ok: bad.length === 0, bad };
}

/** The next monotonic id, zero-padded to six digits. */
export function nextSteerId(path: string = ledgerPath()): string {
  const { receipts } = readLedger(path, { strict: false });
  let max = 0;
  for (const row of receipts) {
    const match = /^steer-(\d+)$/.exec(String(row.id ?? ''));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `steer-${String(max + 1).padStart(6, '0')}`;
}

function writeRow(path: string, payload: Record<string, unknown>): Record<string, unknown> {
  const checksum = rowChecksum(payload);
  const row = { ...payload, checksum, capturedAt: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, canonicalStringify(row) + '\n');
  return row;
}

/** Append an evaluation row. Assigns the monotonic id; refuses the write on
 *  any validation failure. */
export function appendSteerReceipt(entry: Record<string, unknown>, path: string = ledgerPath()): Record<string, unknown> {
  const body = normalizeSteerReceipt(entry);
  body.id = nextSteerId(path);
  return writeRow(path, body);
}

/** Append a resolution row. Never mutates the evaluation row it references. */
export function appendResolution(entry: Record<string, unknown>, path: string = ledgerPath()): Record<string, unknown> {
  const { receipts } = readLedger(path);
  const known = new Set(receipts.map((r) => r.id as string));
  const body = normalizeResolution(entry, known);
  return writeRow(path, body);
}

/** Append an epoch marker, opening a fresh measurement window. */
export function appendEpoch(entry: Record<string, unknown>, path: string = ledgerPath()): Record<string, unknown> {
  return writeRow(path, normalizeEpoch(entry));
}

/**
 * Rows belonging to the current measurement window: everything after the LAST
 * epoch marker. With no marker the whole ledger is one window, so behaviour is
 * unchanged for a fresh file. History before the marker is retained on disk and
 * simply not fitted — nothing is ever deleted.
 */
export function rowsSinceEpoch(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  let start = 0;
  rows.forEach((row, i) => { if (row.schema === EPOCH_SCHEMA) start = i + 1; });
  return rows.slice(start);
}

/** The active window's marker, or null when the ledger has never been re-dated. */
export function currentEpoch(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  const markers = rows.filter((r) => r.schema === EPOCH_SCHEMA);
  return markers.length ? markers[markers.length - 1] : null;
}

/**
 * The complement of `resolvedReceipts`, and the reason Phase 0 can reach its
 * own exit criteria. A receipt nobody can FIND is as unresolvable as one with
 * no outcome field: criteria 1 and 2 both require a human to act on specific
 * ids, so the ids have to be listable. Ordered oldest first — the longest
 * unresolved deflection is the most interesting one.
 */
export function pendingReceipts(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const resolved = new Set(rows.filter((r) => r.schema === RESOLVE_SCHEMA).map((r) => r.steer_id as string));
  return rows.filter((r) => r.schema === SCHEMA && !resolved.has(r.id as string));
}

/**
 * F8a in code: the calibrator's ONLY view. An evaluation row with no
 * resolution is invisible here — outcome null means "not evidence yet."
 * Multiple resolutions for one receipt are allowed (append-only history);
 * the LAST one is the current verdict.
 */
export function resolvedReceipts(rows: Record<string, unknown>[]): { receipt: Record<string, unknown>; outcome: Outcome }[] {
  const receipts = rows.filter((r) => r.schema === SCHEMA);
  const resolutions = rows.filter((r) => r.schema === RESOLVE_SCHEMA);
  const latest = new Map<string, Outcome>();
  for (const res of resolutions) latest.set(res.steer_id as string, res.outcome as Outcome);
  const out: { receipt: Record<string, unknown>; outcome: Outcome }[] = [];
  for (const receipt of receipts) {
    const outcome = latest.get(receipt.id as string);
    if (outcome) out.push({ receipt, outcome });
  }
  return out;
}
