/**
 * DENIAL LEDGER — PB-DENY-v1
 * ========================================================================
 *
 * A record of ideas that were REFUSED, written at the moment of refusal.
 *
 * WHY THIS EXISTS. The concept-chem ledger records what the *engine*
 * concluded across two days of chemistry runs. It cannot record the much
 * larger population: proposals killed by reading, by a grep, or by knowing
 * the codebase. Those denials are real, they are the majority, and they
 * currently live nowhere. A filter with no memory lets the same idea
 * through repeatedly wearing different words.
 *
 * THE TWO FAILURES THIS SHAPE IS BUILT AGAINST — both already on the books:
 *
 *   1. FAILURE BY SYNONYMY. `melanin` was an elegant restatement of an idea
 *      denied one hour earlier and scored 0.2601 against ~0.09 nonsense.
 *      A denial recorded by its VOCABULARY cannot catch a restatement, so
 *      `mechanism` is required and is the load-bearing field: what
 *      specifically dies, not what it was called.
 *
 *   2. THE STALE REFUTATION. A REJECT from 2026-07-13 was cited to block a
 *      proposal whose engine was created 2026-07-23. A denial that does not
 *      say WHAT IT WAS MEASURED AGAINST cannot be checked for staleness, so
 *      `scope` and `date` are required for any denial claiming evidence, and
 *      `unbindsIf` states the condition that retires it.
 *
 * WHAT THIS STORE CAN AND CANNOT DETECT — declared, not implied:
 *
 *   an idea re-proposed in the same words ...... `check()` surfaces it
 *   an idea re-proposed in new words, same
 *     mechanism, IF the mechanism is restated
 *     in overlapping terms ..................... `check()` MAY surface it
 *   an idea re-proposed in new words with the
 *     mechanism described differently .......... `check()` does NOT detect it
 *   a denial that has gone stale ............... NOT detected; `scope` and
 *                                                `unbindsIf` are what a human
 *                                                or agent reads to decide
 *   whether the denial was CORRECT ............. never assessed; this is a
 *                                                record, not a judge
 *
 * `check()` is RETRIEVAL. It ranks candidates for a human to read. It does
 * not return a verdict, and a zero-candidate result is not evidence that an
 * idea is new — it is the absence of a lexical match, which is exactly the
 * signal that failed on `melanin`.
 *
 * STORAGE. Append-only JSONL at `denials.jsonl` beside this module. Rows are
 * never rewritten or deleted; a denial that turns out wrong gets a new row
 * that retires it (`retires`), so the reversal is part of the record.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalStringify } from '../canonical-json.js';

export const SCHEMA = 'PB-DENY-v1';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DENIALS_PATH = join(HERE, 'denials.jsonl');

/**
 * What KIND of denial this is. The evidentiary weight differs, and LBL-004 is
 * the standing reminder that a low SCORE is not a denial at all.
 *
 *   MEASURED      — an experiment ran and the numbers refused it.
 *   ARCHITECTURAL — the code was read; the port/capability/mechanism is absent.
 *   JUDGEMENT     — no measurement. A design stance, taken deliberately.
 *
 * JUDGEMENT is not a lesser tier, it is an HONEST one. Marking a stance as
 * MEASURED because it feels obvious is how a denial acquires authority it did
 * not earn.
 */
export const GROUNDS = Object.freeze(['MEASURED', 'ARCHITECTURAL', 'JUDGEMENT']);

/** Grounds that assert evidence, and therefore must say what they were measured against. */
const EVIDENCE_BEARING = Object.freeze(['MEASURED', 'ARCHITECTURAL']);

function denialChecksum(row) {
  const canonical = canonicalStringify({
    date: row.date,
    idea: row.idea,
    mechanism: row.mechanism,
    evidence: row.evidence,
    grounds: row.grounds,
    scope: row.scope,
    unbindsIf: row.unbindsIf,
    proposer: row.proposer,
    retires: row.retires,
  });
  return 'deny1:' + createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${SCHEMA}: "${field}" is required and must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Validate and normalise a denial. Throws rather than defaulting — an
 * unresolved required slot is a refusal, never a plausible fill-in.
 *
 * @param {object} entry
 * @returns {object} the normalised row (without id/checksum)
 */
export function normaliseDenial(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`${SCHEMA}: denial must be an object`);
  }

  const idea = requireText(entry.idea, 'idea');
  const mechanism = requireText(entry.mechanism, 'mechanism');

  // A mechanism that merely restates the idea records vocabulary, which is the
  // exact failure this field exists to prevent.
  if (mechanism.toLowerCase() === idea.toLowerCase()) {
    throw new Error(
      `${SCHEMA}: "mechanism" restates "idea". Record WHAT SPECIFICALLY DIES ` +
        '(the absent port, the measurement that refused it, the law it breaks) — ' +
        'a denial stored by vocabulary cannot catch a restatement.',
    );
  }

  const grounds = requireText(entry.grounds, 'grounds').toUpperCase();
  if (!GROUNDS.includes(grounds)) {
    throw new Error(`${SCHEMA}: "grounds" must be one of ${GROUNDS.join(' | ')}, got "${grounds}"`);
  }

  const evidence = requireText(entry.evidence, 'evidence');

  // A denial claiming evidence must say what the evidence was collected
  // against, or no later reader can tell whether it has gone stale.
  let scope = typeof entry.scope === 'string' ? entry.scope.trim() : '';
  if (EVIDENCE_BEARING.includes(grounds) && scope.length === 0) {
    throw new Error(
      `${SCHEMA}: grounds=${grounds} requires "scope" — the files, module or commit the ` +
        'denial was measured against. Without it the denial cannot be checked for staleness. ' +
        'If there was no measurement, the honest grounds is JUDGEMENT.',
    );
  }
  if (grounds === 'JUDGEMENT') scope = scope || null;

  const date = typeof entry.date === 'string' && entry.date.trim()
    ? entry.date.trim()
    : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${SCHEMA}: "date" must be absolute YYYY-MM-DD, got "${date}"`);
  }

  return {
    date,
    idea,
    mechanism,
    evidence,
    grounds,
    scope: scope || null,
    unbindsIf: typeof entry.unbindsIf === 'string' && entry.unbindsIf.trim()
      ? entry.unbindsIf.trim()
      : null,
    proposer: typeof entry.proposer === 'string' && entry.proposer.trim()
      ? entry.proposer.trim()
      : 'unstated',
    retires: typeof entry.retires === 'string' && entry.retires.trim()
      ? entry.retires.trim()
      : null,
  };
}

/**
 * Read every denial. Malformed lines throw — a store that silently skips a
 * row it cannot parse is a check that cannot matter.
 *
 * @param {string} [path]
 * @returns {Array<object>}
 */
export function readDenials(path = DEFAULT_DENIALS_PATH) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const rows = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`${SCHEMA}: malformed row at ${path}:${i + 1} — ${err.message}`);
    }
  }
  return rows;
}

/**
 * Append a denial. Append-only: the file is opened for append and no existing
 * byte is ever rewritten.
 *
 * @param {object} entry
 * @param {string} [path]
 * @returns {object} the frozen row that was written
 */
export function appendDenial(entry, path = DEFAULT_DENIALS_PATH) {
  const normalised = normaliseDenial(entry);
  const existing = readDenials(path);

  if (normalised.retires) {
    const target = existing.find((r) => r.id === normalised.retires);
    if (!target) {
      throw new Error(
        `${SCHEMA}: "retires" names ${normalised.retires}, which is not in the ledger. ` +
          'A retirement must point at a denial that exists.',
      );
    }
  }

  const row = {
    id: `DENY-${String(existing.length + 1).padStart(4, '0')}`,
    schema: SCHEMA,
    ...normalised,
  };
  row.checksum = denialChecksum(row);

  appendFileSync(path, JSON.stringify(row) + '\n', 'utf8');
  return Object.freeze(row);
}

/**
 * Recompute every row's checksum and report rows whose content no longer
 * matches. Verification, not freezing — the file is editable, so the check is
 * whether anyone edited it.
 *
 * @param {string} [path]
 * @returns {{ total: number, tampered: Array<{id: string, recorded: string, recomputed: string}> }}
 */
export function verifyDenials(path = DEFAULT_DENIALS_PATH) {
  const rows = readDenials(path);
  const tampered = [];
  for (const row of rows) {
    const recomputed = denialChecksum(row);
    if (recomputed !== row.checksum) {
      tampered.push({ id: row.id, recorded: row.checksum, recomputed });
    }
  }
  return { total: rows.length, tampered };
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'as',
  'that', 'this', 'with', 'by', 'from', 'at', 'be', 'are', 'was', 'not', 'no',
  'we', 'i', 'its', 'into', 'than', 'then', 'so', 'but', 'can', 'will', 'would',
]);

function tokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/**
 * RETRIEVAL, NOT A VERDICT. Rank prior denials by lexical overlap with a
 * proposal, so a human can read the candidates and decide whether the
 * mechanism is the same one.
 *
 * An empty result means NO LEXICAL MATCH. It does not mean the idea is new.
 * The documented failure mode (`melanin`) is precisely a restatement that
 * shares no vocabulary with what it restates.
 *
 * @param {string} text - the proposal being considered
 * @param {string} [path]
 * @returns {{ searched: number, candidates: Array<{row: object, overlap: number, shared: string[]}> }}
 */
export function check(text, path = DEFAULT_DENIALS_PATH) {
  const rows = readDenials(path);
  const probe = tokens(text);
  const candidates = [];

  for (const row of rows) {
    if (row.retires) continue; // retirements are bookkeeping, not denials
    const against = tokens(`${row.idea} ${row.mechanism}`);
    const shared = [...probe].filter((t) => against.has(t));
    if (shared.length === 0) continue;
    // Jaccard over the union, so a long row does not win by length alone.
    const union = new Set([...probe, ...against]);
    candidates.push({
      row,
      overlap: Math.round((shared.length / union.size) * 1e4) / 1e4,
      shared: shared.sort(),
    });
  }

  candidates.sort((x, y) => y.overlap - x.overlap);
  return { searched: rows.length, candidates };
}

/**
 * Which denials are retired, and by what.
 * @param {string} [path]
 * @returns {Map<string, object>} retired denial id → the row that retired it
 */
export function retirements(path = DEFAULT_DENIALS_PATH) {
  const rows = readDenials(path);
  const out = new Map();
  for (const row of rows) {
    if (row.retires) out.set(row.retires, row);
  }
  return out;
}
