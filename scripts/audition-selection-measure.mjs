/**
 * MEASURE the audition jury against the selection residual.
 *
 * Head-declaration left ~36% of scoreable parses in "different span won".
 * Audition ranks projected {subject, verb} slips and casts one. This script
 * answers whether that cast recovers gold when gold is already in the ensemble,
 * and how often it regresses.
 *
 * Metrics (all on scoreable sentences = spanning S + gold nsubj):
 *   - containment / gold-in-ensemble  — ceiling for any cast rule
 *   - baseline cast                   — first slip off stable[0] (order-stable)
 *   - audition cast                   — runAuditionJury winner
 *   - fixed / missed / regressed among gold-in-ensemble
 *   - wrongness-style buckets for baseline cast vs audition cast
 *
 * Usage:
 *   node scripts/audition-selection-measure.mjs [dev|test]
 *
 * PURE measurement: does not modify grammar or jury. Prints only.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { runAuditionJury } from '../codex/core/constellation/audition/index.js';
import { answerKey } from '../codex/core/constellation/audition/schemas.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SPLIT = process.argv[2] || 'dev';
const CORPUS = path.resolve(ROOT, `cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve(ROOT, 'scholomance_dict.sqlite');

if (!existsSync(CORPUS)) {
  console.error(`missing ${CORPUS}`);
  process.exit(1);
}
if (!existsSync(DICT)) {
  console.error(`missing ${DICT}`);
  process.exit(1);
}

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

function loadPosMap() {
  const db = new Database(DICT, { readonly: true });
  const posMap = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) {
      if (!have.includes(tag)) have.push(tag);
    } else {
      posMap.set(r.surface_lower, [tag]);
    }
  }
  db.close();
  return posMap;
}

const lc = (x) => String(x == null ? '' : x).toLowerCase();
const sameAnswer = (a, gold) =>
  a && gold
  && lc(a.subject) === lc(gold.subject)
  && lc(a.verb) === lc(gold.verb);

const subtreeSpan = (tokens, id) => {
  const kids = new Map();
  for (const t of tokens) {
    if (!kids.has(t.head)) kids.set(t.head, []);
    kids.get(t.head).push(t.id);
  }
  let min = id - 1;
  let max = id - 1;
  let size = 1;
  const walk = (x) => {
    for (const c of kids.get(x) || []) {
      const i = c - 1;
      if (i < min) min = i;
      if (i > max) max = i;
      size += 1;
      walk(c);
    }
  };
  walk(id);
  return { min, max, contiguous: max - min + 1 === size };
};

/**
 * Classify one cast against gold using the same bucket shapes as wrongness.mjs,
 * but for a SINGLE cast (not containment-over-answers).
 */
function bucketCast(cast, gold, rec, chart, tokens) {
  if (sameAnswer(cast, gold)) return 'OK';
  const subjRight = cast && lc(cast.subject) === lc(gold.subject);
  const verbRight = cast && lc(cast.verb) === lc(gold.verb);
  if (subjRight && !verbRight) return 'VERB_WRONG';

  const root = rec.tokens.find((t) => t.head === 0);
  const subj = root && rec.tokens.find(
    (t) => t.head === root.id && (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass'),
  );
  if (!subj) return 'BOTH_WRONG_OTHER';

  const s = subtreeSpan(rec.tokens, subj.id);
  const spans = new Set(chart.molecules.map((m) => `${m.from}:${m.to}`));
  const built = s.contiguous && spans.has(`${s.min}:${s.max}`);
  if (!built) return 'SUBJ_MISSING';

  const inside = new Set(tokens.slice(s.min, s.max + 1).map(lc));
  if (cast && cast.subject && inside.has(lc(cast.subject))) return 'SUBJ_HEAD_BUG';
  return 'SUBJ_SELECTION';
}

const posMap = loadPosMap();
const recs = parseConllu(readFileSync(CORPUS, 'utf8'));

let parsed = 0;
let noGoldSubj = 0;
let scored = 0;

// Ensemble / cast accuracy
let goldInEnsemble = 0;
let baselineOk = 0;
let auditionOk = 0;
let bothOk = 0;
let fixed = 0;       // gold in ensemble, baseline wrong, audition right
let missed = 0;      // gold in ensemble, baseline wrong, audition wrong
let regressed = 0;   // gold in ensemble, baseline right, audition wrong
let alreadyOk = 0;   // gold in ensemble, both right
let ceilingMiss = 0; // gold NOT in ensemble (casting cannot help)
let auditionOkOutsideCeiling = 0; // impossible if cast ⊆ ensemble — sanity

// wrongness-style buckets for cast (not containment)
const baseB = {
  OK: 0, VERB_WRONG: 0, SUBJ_HEAD_BUG: 0, SUBJ_SELECTION: 0, SUBJ_MISSING: 0, BOTH_WRONG_OTHER: 0,
};
const audB = { ...baseB };

// Among selection-bucket sentences under baseline cast, what did audition do?
let baseSelection = 0;
let selectionFixed = 0;
let selectionStillWrong = 0;

// Ensemble size stats
let ensembleSum = 0;
let multiAnswer = 0;

const examples = { fixed: [], regressed: [], selectionFixed: [], missed: [] };

for (const rec of recs) {
  const tokens = rec.tokens.map((t) => t.form);
  const chart = composePacked(tokens, posMap);
  if (chart.stable.length === 0) continue;
  parsed += 1;

  const root = rec.tokens.find((t) => t.head === 0);
  const subj = root && rec.tokens.find(
    (t) => t.head === root.id && (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass'),
  );
  if (!root || !subj) {
    noGoldSubj += 1;
    continue;
  }
  scored += 1;

  const gold = goldAnswer(rec);

  // Full ensemble across ALL stable roots (treebank containment definition).
  const ensemble = [];
  const seen = new Set();
  for (const s of chart.stable) {
    for (const a of projectAnswers(s)) {
      const k = `${lc(a.subject)}|${lc(a.verb)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      ensemble.push(a);
    }
  }
  ensembleSum += ensemble.length;
  if (ensemble.length > 1) multiAnswer += 1;

  const inEnsemble = ensemble.some((a) => sameAnswer(a, gold));
  if (inEnsemble) goldInEnsemble += 1;
  else ceilingMiss += 1;

  // Baseline cast: first projected slip from the first stable root.
  const baselineList = projectAnswers(chart.stable[0]);
  const baselineCast = baselineList[0] || null;

  // Audition cast over the whole chart.
  const { cast: auditionCast } = runAuditionJury(tokens, chart, {
    source: 'packed-stable',
  });

  const baseMatch = sameAnswer(baselineCast, gold);
  const audMatch = sameAnswer(auditionCast, gold);
  if (baseMatch) baselineOk += 1;
  if (audMatch) auditionOk += 1;
  if (baseMatch && audMatch) bothOk += 1;

  if (inEnsemble) {
    if (baseMatch && audMatch) {
      alreadyOk += 1;
    } else if (!baseMatch && audMatch) {
      fixed += 1;
      if (examples.fixed.length < 8) {
        examples.fixed.push({
          text: rec.text || tokens.join(' '),
          gold,
          baseline: baselineCast,
          cast: auditionCast,
          ensembleSize: ensemble.length,
        });
      }
    } else if (baseMatch && !audMatch) {
      regressed += 1;
      if (examples.regressed.length < 8) {
        examples.regressed.push({
          text: rec.text || tokens.join(' '),
          gold,
          baseline: baselineCast,
          cast: auditionCast,
          ensembleSize: ensemble.length,
        });
      }
    } else {
      missed += 1;
      if (examples.missed.length < 5) {
        examples.missed.push({
          text: rec.text || tokens.join(' '),
          gold,
          baseline: baselineCast,
          cast: auditionCast,
          ensemble: ensemble.slice(0, 6),
        });
      }
    }
  } else if (audMatch) {
    auditionOkOutsideCeiling += 1;
  }

  const bBucket = bucketCast(baselineCast, gold, rec, chart, tokens);
  const aBucket = bucketCast(auditionCast, gold, rec, chart, tokens);
  baseB[bBucket] += 1;
  audB[aBucket] += 1;

  if (bBucket === 'SUBJ_SELECTION') {
    baseSelection += 1;
    if (audMatch) {
      selectionFixed += 1;
      if (examples.selectionFixed.length < 8) {
        examples.selectionFixed.push({
          text: rec.text || tokens.join(' '),
          gold,
          baseline: baselineCast,
          cast: auditionCast,
          inEnsemble,
        });
      }
    } else {
      selectionStillWrong += 1;
    }
  }
}

const pct = (x, d = scored) => `${((x / Math.max(d, 1)) * 100).toFixed(1)}%`;
const pc = (x, d) => `${((x / Math.max(d, 1)) * 100).toFixed(1)}%`;

console.log(`\nAUDITION JURY vs SELECTION RESIDUAL — EWT ${SPLIT}\n`);
console.log(`  sentences with a spanning S      ${parsed}`);
console.log(`  ...of those, gold has no nsubj   ${noGoldSubj}`);
console.log(`  SCORED                           ${scored}`);
console.log(`  mean ensemble size               ${(ensembleSum / Math.max(scored, 1)).toFixed(2)}`);
console.log(`  multi-answer ensembles           ${multiAnswer}  ${pct(multiAnswer)}\n`);

console.log('── Ceiling and cast accuracy (single answer vs gold) ──\n');
console.log(`  gold IN ensemble (ceiling)       ${goldInEnsemble}  ${pct(goldInEnsemble)}`);
console.log(`  gold NOT in ensemble             ${ceilingMiss}  ${pct(ceilingMiss)}   <- casting cannot help`);
console.log(`  baseline cast correct            ${baselineOk}  ${pct(baselineOk)}   (first slip of stable[0])`);
console.log(`  audition cast correct            ${auditionOk}  ${pct(auditionOk)}`);
console.log(`  delta (audition − baseline)      ${auditionOk - baselineOk}  (${pct(auditionOk - baselineOk)})\n`);

console.log('── Among gold-in-ensemble (where casting CAN help) ──\n');
const ceil = Math.max(goldInEnsemble, 1);
console.log(`  n                                ${goldInEnsemble}`);
console.log(`  already correct both             ${alreadyOk}  ${pc(alreadyOk, ceil)}`);
console.log(`  FIXED by audition                ${fixed}  ${pc(fixed, ceil)}   baseline wrong → cast right`);
console.log(`  MISSED (gold present, not cast)  ${missed}  ${pc(missed, ceil)}`);
console.log(`  REGRESSED (baseline right→wrong) ${regressed}  ${pc(regressed, ceil)}`);
console.log(`  net gain among ceiling           ${fixed - regressed}`);
if (auditionOkOutsideCeiling) {
  console.log(`  SANITY: cast right outside ensemble ${auditionOkOutsideCeiling}  (should be 0)`);
}

console.log('\n── Wrongness-style buckets for SINGLE cast (not containment) ──\n');
console.log('  bucket                              baseline    audition    delta');
for (const k of ['OK', 'VERB_WRONG', 'SUBJ_MISSING', 'SUBJ_HEAD_BUG', 'SUBJ_SELECTION', 'BOTH_WRONG_OTHER']) {
  const d = audB[k] - baseB[k];
  const sign = d > 0 ? '+' : '';
  console.log(
    `  ${k.padEnd(34)} ${String(baseB[k]).padStart(5)} ${pct(baseB[k]).padStart(7)}`
    + `  ${String(audB[k]).padStart(5)} ${pct(audB[k]).padStart(7)}`
    + `  ${sign}${d}`,
  );
}

console.log('\n── Baseline SUBJ_SELECTION subset (the ~30% claim) ──\n');
console.log(`  baseline cast in SUBJ_SELECTION    ${baseSelection}  ${pct(baseSelection)}`);
console.log(`  ...of those, audition FIXED        ${selectionFixed}  ${pc(selectionFixed, baseSelection)}`);
console.log(`  ...of those, still wrong           ${selectionStillWrong}  ${pc(selectionStillWrong, baseSelection)}`);

// Verdict
const net = auditionOk - baselineOk;
const selectionHitRate = baseSelection > 0 ? selectionFixed / baseSelection : 0;
console.log('\n── VERDICT ──\n');
if (net > 0 && selectionHitRate >= 0.15) {
  console.log(
    `  CONFIRMED in part: audition nets +${net} correct casts `
    + `(${pct(net)} of scored) and recovers ${pc(selectionFixed, baseSelection)} `
    + `of baseline SUBJ_SELECTION.`,
  );
} else if (net > 0) {
  console.log(
    `  WEAK CONFIRM: net +${net} correct casts, but only `
    + `${pc(selectionFixed, baseSelection)} of the selection bucket moves — `
    + `not a "good chunk" of ~30%.`,
  );
} else if (net === 0) {
  console.log('  DENIED as a selection fix: net cast accuracy unchanged.');
} else {
  console.log(
    `  DENIED: audition REGRESSES cast accuracy by ${-net} `
    + `(${pct(-net)} of scored).`,
  );
}
console.log(
  `  Ceiling note: only ${pct(goldInEnsemble)} of scored have gold in the ensemble; `
  + `the rest (${pct(ceilingMiss)}) need grammar/projection, not casting.`,
);

const show = (title, list) => {
  if (list.length === 0) return;
  console.log(`\n── examples: ${title} ──\n`);
  for (const ex of list) {
    console.log(`  ${ex.text}`);
    console.log(`    gold      ${answerKey(ex.gold)}`);
    console.log(`    baseline  ${answerKey(ex.baseline)}`);
    console.log(`    cast      ${answerKey(ex.cast)}`);
    if (ex.ensemble) {
      console.log(`    ensemble  ${ex.ensemble.map(answerKey).join(' ; ')}`);
    }
    if (ex.inEnsemble != null) console.log(`    gold-in-ensemble ${ex.inEnsemble}`);
    console.log('');
  }
};

show('FIXED', examples.fixed);
show('REGRESSED', examples.regressed);
show('selection-bucket FIXED', examples.selectionFixed);
show('MISSED (gold present)', examples.missed);
console.log('');
