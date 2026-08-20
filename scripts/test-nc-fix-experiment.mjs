/**
 * EXPERIMENT: UNIFYING NOUN EMISSION TO NC (LIFTING NC -> N -> NP)
 *
 * Evaluates the effect of allowing all nouns (including dual n+v) to emit NC:
 * 1. On the 18 True Polysemy-Collapse cases.
 * 2. On the full held-out UD-EWT test set (1,715 sentences <= 20 tokens).
 * 3. On the Treebank Gate (395 sentences).
 *
 * Run with:
 *   node scripts/test-nc-fix-experiment.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer, goldPosMap } from '../codex/core/constellation/treebank.js';
import {
  composePacked,
  ROOT_DOORWAY,
  projectAnswers,
  crystallizeChart,
} from '../codex/core/constellation/compose-packed.js';
import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';

const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
const GATE_PATH = path.resolve('tests/qa/fixtures/constellation/treebank-gate.conllu');
const DICT_PATH = path.resolve('scholomance_dict.sqlite');

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

function loadRealDictionary() {
  const db = new Database(DICT_PATH, { readonly: true });
  const posTable = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posTable.get(r.surface_lower);
    if (have) {
      if (!have.includes(tag)) have.push(tag);
    } else {
      posTable.set(r.surface_lower, [tag]);
    }
  }
  db.close();
  return posTable;
}

const realDict = loadRealDictionary();

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  TESTING NC ATOM UNIFICATION FIX');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

// Let's create a custom atomsFor function that emits NC for all nouns
import {
  DETERMINERS, PREPOSITION_CUES, CONJUNCTIONS, RELATIVIZERS, SUBORDINATORS,
  COPULAS, MODALS, PRONOUNS_NOMINATIVE, PRONOUNS_ACCUSATIVE, AUXILIARY_VERBS,
  INTERROGATIVE_ADVERBS, PRONOUNS, AUXILIARIES
} from '../codex/core/lexical-analysis/closed-class.js';
import { irregularPos } from '../codex/core/lexical-analysis/irregular-forms.js';

function customAtomsFor(token, index, posMap, options = {}) {
  const lower = String(token).toLowerCase();
  const known = posMap.get(lower);
  let tags = known ? [...known] : [];
  if (tags.length === 0) {
    const irreg = irregularPos(lower);
    if (irreg.length > 0) tags = irreg.map((i) => i.pos);
  }

  const capitalised = /^[A-Z]/.test(String(token));
  const isClosedClass = DETERMINERS.has(lower) || PRONOUNS.has(lower)
    || AUXILIARIES.has(lower) || CONJUNCTIONS.has(lower)
    || RELATIVIZERS.has(lower) || PREPOSITION_CUES.has(lower)
    || INTERROGATIVE_ADVERBS.has(lower);

  const allCapsAcronym = /^[A-Z]{2,}$/.test(String(token));
  const out = [];
  if (capitalised && (index > 0 || allCapsAcronym || (!known?.length && !isClosedClass))) {
    out.push('PROPN');
  }

  if (DETERMINERS.has(lower)) out.push('DET');
  if (PREPOSITION_CUES.has(lower)) out.push('P');

  const closedForContent = DETERMINERS.has(lower)
    || PREPOSITION_CUES.has(lower)
    || CONJUNCTIONS.has(lower)
    || RELATIVIZERS.has(lower)
    || SUBORDINATORS.has(lower)
    || COPULAS.has(lower)
    || MODALS.has(lower)
    || PRONOUNS.has(lower)
    || lower === 'to'
    || lower === 'than';

  // THE FIX: All content nouns emit NC (which lifts NC -> N -> NP)
  if (tags.includes('n') && !closedForContent && !AUXILIARY_VERBS.has(lower)) {
    out.push('NC');
  }
  if (tags.includes('v') && !closedForContent) out.push('V');
  if ((tags.includes('a') || tags.includes('s')) && !closedForContent) out.push('ADJ');
  if (tags.includes('r') && !closedForContent) out.push('ADV');
  if (PRONOUNS_NOMINATIVE.has(lower)) out.push('PRON');
  if (PRONOUNS_ACCUSATIVE.has(lower)) out.push('PRONACC');
  if (COPULAS.has(lower)) {
    out.push('COP');
    out.push('AUX');
  }
  if (MODALS.has(lower)) out.push('MODAL');
  if (AUXILIARY_VERBS.has(lower)) out.push('AUX');
  if (CONJUNCTIONS.has(lower)) out.push('CONJ');
  if (RELATIVIZERS.has(lower)) out.push('REL');
  if (SUBORDINATORS.has(lower)) out.push('SUB');
  if (INTERROGATIVE_ADVERBS.has(lower)) out.push('ADV');
  if (lower === 'to') out.push('TO');
  if (lower === 'than') out.push('THAN');
  if (lower === ',') out.push('COMMA');
  if (/^[.!?…;:]+$/.test(lower)) out.push('PUNCT');

  return out;
}

// ── TEST ON THE 18 CASES ───────────────────────────────────────────────────
const rawTestRecords = parseConllu(readFileSync(TEST_PATH, 'utf8'));
const testSentences = [];
for (const rec of rawTestRecords) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= 20) {
    testSentences.push({
      rec,
      tokens,
      gold: goldAnswer(rec),
      oracleMap: goldPosMap(rec),
    });
  }
}

console.log('1. Evaluating on the 18 True Polysemy-Collapse Sentences...');
// We will test if the fix allows them to parse
