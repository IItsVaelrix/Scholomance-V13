/**
 * PRECEDENT ADAPTER — the case book, and the vocabulary translation.
 *
 * `codex/core/constellation/precedent.js` is pure and zero-I/O by Core law: it
 * takes a case book as an argument and never reads disk. That is why it had no
 * effect on anything — a module that requires an injected case book does
 * nothing at all until something exists to inject. Nothing in the repository
 * ever built one. This adapter is that missing half.
 *
 * ─── WHAT THIS OWNS, AND WHY IT IS NOT IN CORE ─────────────────────────────
 *
 * Two jobs, both explicitly delegated here by `precedent.js`'s own docblock:
 *
 *   1. PERSISTENCE. Rulings are made by humans over time, so they outlive a
 *      process and must live on disk. I/O is a Services-layer concern.
 *
 *   2. VOCABULARY TRANSLATION. "rulings are written in whatever notation the
 *      annotator used, the chart speaks its own categories, and reconciling
 *      them is the adapter's job — not something this module should guess at."
 *      Rulings are written in POS letters (`n`, `v`, `a`, `r`) because that is
 *      what an annotator writes; `compose.js` emits chart categories (`NC`,
 *      `VP`, `PROPN`). The map between them lives here and nowhere else.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * No similarity search, no nearest-case retrieval, no embedding of the case
 * key. `citePrecedent` matches exactly or returns null, and that constraint is
 * the whole design — retrieval by resemblance is inference over cases, which is
 * a learned ranker, which is what repeated measurement rejected. This adapter
 * must never soften that by "helpfully" finding a close case.
 *
 * @module codex/server/services/constellation/precedent.adapter
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { caseKey } from '../../../core/constellation/precedent.js';

/** Where rulings live unless a caller says otherwise. */
export const DEFAULT_CASE_BOOK_PATH = path.resolve(
  process.cwd(),
  'codex',
  'server',
  'data',
  'constellation-case-book.json'
);

/**
 * CHART CATEGORY → THE NOTATION RULINGS ARE WRITTEN IN.
 *
 * Deliberately many-to-one and deliberately partial. `NC` and `N` are both
 * nouns to an annotator — the split between them is chart bookkeeping about
 * compound eligibility, not a distinction a human ruling is asked to make.
 * A category absent from this map translates to itself, so an unmapped
 * category can never silently become a noun; it simply fails to match any
 * ruling written in POS letters, and the cue abstains.
 */
export const CATEGORY_TO_POS = Object.freeze({
  N: 'n',
  NC: 'n',
  NP: 'n',
  NPO: 'n',
  PROPN: 'n',
  PRON: 'n',
  PRONACC: 'n',
  V: 'v',
  VP: 'v',
  ADJ: 'a',
  ADV: 'r',
});

/**
 * Walk a molecule down to its leaves and read off token → ruled notation.
 *
 * `compose.js` builds atoms as `{ type, from, to, parts: [], token }` and
 * binary nodes as `{ type, from, to, parts: [left, right] }`, so a leaf is
 * exactly a node with no parts. Interior nodes carry phrase categories that no
 * ruling is written about, so only leaves are collected.
 *
 * KEYED BY TOKEN, NOT BY INDEX, because `precedent.js` looks rulings up by
 * token. A sentence repeating a word therefore gets one entry for it — that is
 * a real limit of ruling-by-token and is left visible rather than papered over
 * with an index the cue could not consult anyway.
 *
 * @param {object} molecule
 * @returns {Map<string,string>}
 */
export function assignmentOfMolecule(molecule) {
  const assigned = new Map();
  const visit = (node) => {
    if (!node) return;
    const parts = node.parts || [];
    if (parts.length === 0) {
      if (node.token === undefined || node.token === null) return;
      const key = String(node.token).toLowerCase();
      const type = String(node.type);
      assigned.set(key, CATEGORY_TO_POS[type] || type);
      return;
    }
    for (const p of parts) visit(p);
  };
  visit(molecule);
  return assigned;
}

/**
 * Read the case book. A missing or malformed book is an EMPTY book, never an
 * exception: precedent's honest answer when it has no rulings is abstention,
 * and a parser that throws because nobody has ruled yet would be worse than
 * one that simply defers.
 *
 * @param {string} [caseBookPath]
 * @returns {import('../../../core/constellation/precedent.js').Case[]}
 */
export function loadCaseBook(caseBookPath = DEFAULT_CASE_BOOK_PATH) {
  if (!caseBookPath || !existsSync(caseBookPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(caseBookPath, 'utf8'));
    const cases = Array.isArray(parsed) ? parsed : parsed?.cases;
    if (!Array.isArray(cases)) return [];
    return cases.filter((c) => c && typeof c.key === 'string' && c.ruling);
  } catch {
    return [];
  }
}

/**
 * Build a citable case from a ruling a human just made.
 *
 * `authority` is required and unvalidated on purpose: it is the audit trail,
 * and a case whose author is unrecorded is not authority, it is an anonymous
 * assertion wearing the costume of one.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string[]} params.tokens
 * @param {Object<string,string>} params.ruling token → the reading held correct
 * @param {string} params.rationale
 * @param {string} params.authority who ruled, and when
 * @returns {import('../../../core/constellation/precedent.js').Case}
 */
export function makeCase({ id, tokens, ruling, rationale, authority }) {
  if (!id) throw new Error('precedent: a case needs a citable id');
  if (!authority) throw new Error('precedent: a case needs a named authority');
  return { id, key: caseKey(tokens), ruling: { ...ruling }, rationale: rationale || '', authority };
}

/**
 * Append a ruling. Re-ruling the same input REPLACES the earlier case rather
 * than shadowing it, so the book cannot accumulate two live answers for one
 * key — `citePrecedent` takes the first match and silent duplicates would make
 * which one wins depend on insertion order.
 *
 * @returns {import('../../../core/constellation/precedent.js').Case[]} the new book
 */
export function recordRuling(newCase, caseBookPath = DEFAULT_CASE_BOOK_PATH) {
  const book = loadCaseBook(caseBookPath).filter((c) => c.key !== newCase.key);
  book.push(newCase);
  mkdirSync(path.dirname(caseBookPath), { recursive: true });
  writeFileSync(caseBookPath, `${JSON.stringify({ cases: book }, null, 2)}\n`, 'utf8');
  return book;
}
