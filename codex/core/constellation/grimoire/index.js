/**
 * THE GRIMOIRE — Construction Registry.
 *
 * BONDS are the spells the chart executes.
 * The Grimoire explains what each spell means about grammar.
 *
 * One source of truth:
 *
 *              CONSTRUCTIONS (this module)
 *               /       |        \
 *              ↓        ↓         ↓
 *           BONDS   anatomy    audit tooling
 *              ↓
 *           parser (stays gloriously stupid)
 *
 * Status ontology:
 *   grammar       — linguistic claim intended
 *   scaffold      — assembly only; never infer linguistic facts from identity
 *   approximation — real phenomenon, known collapses
 *   deprecated    — known-wrong, migration target
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/grimoire
 */

import {
  CONSTRUCTION_STATUS,
  CONSTRUCTION_STATUSES,
  CONSTRUCTION_FAMILIES,
  defineConstruction,
  toBond,
  toAnatomyRow,
  validateConstructions,
  isScaffold,
  isGrammar,
  isApproximation,
  mayClaimLinguisticFact,
  defaultGrades,
} from './schemas.js';

import { DETERMINATION } from './families/determination.js';
import { ADPOSITION } from './families/adposition.js';
import { VERB } from './families/verb.js';
import { CLAUSE } from './families/clause.js';
import { PARTICIPIAL } from './families/participial.js';
import { MODIFIER } from './families/modifier.js';
import { COMPOUND } from './families/compound.js';
import { AUXILIARY } from './families/auxiliary.js';
import { COPULAR } from './families/copular.js';
import { RELATIVE } from './families/relative.js';
import { COORDINATION } from './families/coordination.js';
import { NONFINITE } from './families/nonfinite.js';
import { SUBORDINATION } from './families/subordination.js';
import { COMPARATIVE } from './families/comparative.js';
import { POSSESSION } from './families/possession.js';
import { PUNCTUATION } from './families/punctuation.js';
import { INVERSION } from './families/inversion.js';
import { LIST } from './families/list.js';

/** Lookup helpers keyed by bond signature. */
function byPattern(list) {
  const m = new Map();
  for (const c of list) m.set(`${c.left}|${c.right}|${c.result}`, c);
  return m;
}

const ALL_BY_FAMILY = {
  determination: DETERMINATION,
  adposition: ADPOSITION,
  verb: VERB,
  clause: CLAUSE,
  participial: PARTICIPIAL,
  modifier: MODIFIER,
  compound: COMPOUND,
  auxiliary: AUXILIARY,
  copular: COPULAR,
  'relative-clause': RELATIVE,
  coordination: COORDINATION,
  nonfinite: NONFINITE,
  subordination: SUBORDINATION,
  comparative: COMPARATIVE,
  possession: POSSESSION,
  punctuation: PUNCTUATION,
  inversion: INVERSION,
  list: LIST,
};

const POOL = byPattern(Object.values(ALL_BY_FAMILY).flat());

/**
 * Historical bond order from compose.js — preserved so the projection is a
 * pure enrichment of the same chemistry, not a reshuffle.
 */
const ORDER = [
  'DET|N|NP',
  'DET|PROPN|NP',        // fission daughter of DET+NP (parent retired)
  'DET|PRON|NP',         // fission daughter (minor residual)
  // DET|NP|NP RETIRED — isomer mass; see determination.js fission notes
  'P|NP|PP',
  'V|PP|VP',
  'NP|VP|S',
  'V|PP|PART',
  'NP|PART|NP',
  'V|NP|VP',
  'V|NPO|VP',
  'P|NPO|PP',
  'V|ADJ|VP',
  'VP|PP|VP',
  'NP|PP|NP',
  'ADJ|N|N',
  'ADJ|NC|NC',           // hint: adj-nc-stack
  'NC|NC|NC',
  'PROPN|PROPN|N',
  'PROPN|N|N',
  'N|PROPN|N',
  'ADV|ADJ|ADJ',
  'ADV|VP|VP',
  'VP|ADV|VP',
  'COP|ADJ|VP',
  'COP|NP|VP',
  'COP|VP|VP',
  'AUX|VP|VP',
  'MODAL|VP|VP',
  'REL|VP|RELC',
  'REL|VP|S',
  'NP|RELC|NP',
  'CONJ|NP|CONJNP',
  'NP|CONJNP|NP',
  'CONJ|VP|CONJVP',
  'VP|CONJVP|VP',
  'CONJ|S|CONJS',
  'S|CONJS|S',
  'CONJ|S|S',
  'CONJ|ADJ|CONJADJ',    // adj coord bridge — inert without its completion below
  'ADJ|CONJADJ|ADJ',     // adj coord completion — the pair is what gains
  'TO|VP|INF',
  'V|INF|VP',
  'VP|INF|VP',           // hint: vp-inf host extension
  'COP|INF|VP',
  'NP|INF|NP',
  'SUB|S|SBAR',
  'SUB|S|S',
  'S|SBAR|S',
  'SBAR|S|S',
  'THAN|NP|THANP',
  'ADJ|THANP|ADJ',
  'VP|THANP|VP',
  'POSS|N|N',
  'NP|POSS|GEN',
  'GEN|N|NP',
  'ADV|COMMA|FRONTED',
  'ADV|COMMA|S',
  'SBAR|COMMA|FRONTED',
  'PP|COMMA|FRONTED',
  'FRONTED|S|S',
  'NP|COMMA|NPCOMMA',
  'NPCOMMA|NP|APPOS',
  'APPOS|COMMA|NP',
  'NPCOMMA|NP|NP',
  'S|COMMA|SCOMMA',
  'S|COMMA|S',
  'SCOMMA|S|S',
  'S|PUNCT|S',
  'NP|PUNCT|NP',
  'ADJ|PUNCT|ADJ',
  'N|PUNCT|N',           // hint: punct-parity N
  'NC|PUNCT|NC',         // hint: punct-parity NC
  'S|WRAP|S',
  'WRAP|S|S',
  'NP|WRAP|NP',
  'WRAP|NP|NP',
  'N|WRAP|N',
  'WRAP|N|N',
  'NC|WRAP|NC',
  'WRAP|NC|NC',
  'ADJ|WRAP|ADJ',
  'WRAP|ADJ|ADJ',
  'V|PRT|V',
  'VP|PRT|VP',
  'PP|S|S',
  'ADV|S|S',
  'ADJ|S|S',             // hint: fronted-adj-clause
  'REL|S|SBAR',
  'V|SBAR|VP',
  'VP|SBAR|VP',          // hint: vp-sbar host extension
  'COP|SBAR|VP',
  'ADJ|INF|ADJ',
  'MODAL|NP|INV',
  'AUX|NP|INV',
  'COP|NP|INV',
  'INV|VP|S',
  'INV|ADJ|S',
  'INV|NP|S',
  'CLOCK|MERIDIAN|CLOCK',
  'DATE|CLOCK|DATE',
];

/**
 * Canonical construction list — the constitution.
 * @type {ReadonlyArray<import('./schemas.js').Construction>}
 */
export const CONSTRUCTIONS = Object.freeze(ORDER.map((sig) => {
  const c = POOL.get(sig);
  if (!c) throw new Error(`Grimoire missing construction for bond signature ${sig}`);
  return c;
}));

/**
 * THE OTHER DIRECTION, WHICH USED TO BE SILENT.
 *
 * `ORDER` -> `POOL` already throws: a signature with no construction is a loud
 * error. `POOL` -> `ORDER` was unguarded, so a construction written into a
 * family file and never listed here was dropped without a word — it never
 * reached `CONSTRUCTIONS`, never reached `BONDS`, and never fired.
 *
 * That failure is expensive precisely because it is quiet. A rule that is absent
 * from the table produces a clean, plausible, entirely inert experimental arm:
 * `+0/-0`, no error, no warning, and a result that looks like evidence the idea
 * does not work. It cost a full measurement cycle on 2026-08-20, when ten WRAP
 * constructions scored exactly nothing because they were in the book and not the
 * index. `BONDS.filter(b => b.includes('WRAP')).length` was 0 the whole time.
 *
 * So both directions are now errors, and the message names the fix.
 */
const ORDERED = new Set(ORDER);
for (const [sig, construction] of POOL) {
  if (ORDERED.has(sig)) continue;
  throw new Error(
    `Grimoire construction ${construction.id} (${sig}) is defined in family `
    + `'${construction.family}' but absent from ORDER, so it would never reach BONDS. `
    + `Add '${sig}' to ORDER, or delete the construction.`,
  );
}

validateConstructions(CONSTRUCTIONS);

/**
 * Active constructions — deprecated spells are kept in the Grimoire for history
 * but are not projected into the chart. Theory can migrate without deleting law.
 */
export const ACTIVE_CONSTRUCTIONS = Object.freeze(
  CONSTRUCTIONS.filter((c) => c.status !== CONSTRUCTION_STATUS.DEPRECATED),
);

/**
 * Chart chemistry: pure 4-tuples. The parser stays stupid on purpose.
 * Deprecated constructions are excluded (see cop-vp-mislabel → AUX+VP).
 * @type {ReadonlyArray<[string, string, string, 0|1]>}
 */
export const BONDS = Object.freeze(ACTIVE_CONSTRUCTIONS.map(toBond));

/**
 * Anatomy projection for the examiner — full constitution including deprecated.
 */
export const BOND_ANATOMY = Object.freeze(CONSTRUCTIONS.map(toAnatomyRow));

const BY_ID = new Map(CONSTRUCTIONS.map((c) => [c.id, c]));
const BY_SIG = new Map(
  CONSTRUCTIONS.map((c) => [`${c.left}|${c.right}|${c.result}`, c]),
);

export function constructionById(id) {
  return BY_ID.get(id) || null;
}

export function constructionByBond(left, right, result) {
  return BY_SIG.get(`${left}|${right}|${result}`) || null;
}

export function constructionByBondTuple(bond) {
  if (!bond || bond.length < 3) return null;
  return constructionByBond(bond[0], bond[1], bond[2]);
}

/**
 * Family inventory for "what does Scholomance understand?"
 * @returns {Array<{family: string, total: number, grammar: number, scaffold: number, approximation: number, deprecated: number}>}
 */
export function familyInventory() {
  const map = new Map();
  for (const c of CONSTRUCTIONS) {
    if (!map.has(c.family)) {
      map.set(c.family, {
        family: c.family,
        total: 0,
        grammar: 0,
        scaffold: 0,
        approximation: 0,
        deprecated: 0,
      });
    }
    const row = map.get(c.family);
    row.total += 1;
    row[c.status] += 1;
  }
  return [...map.values()].sort((a, b) => a.family.localeCompare(b.family));
}

export {
  CONSTRUCTION_STATUS,
  CONSTRUCTION_STATUSES,
  CONSTRUCTION_FAMILIES,
  defineConstruction,
  toBond,
  toAnatomyRow,
  validateConstructions,
  isScaffold,
  isGrammar,
  isApproximation,
  mayClaimLinguisticFact,
  defaultGrades,
};
