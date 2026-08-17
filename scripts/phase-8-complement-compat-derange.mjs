#!/usr/bin/env node
/**
 * Derangement control for Phase 8 complement COMPAT on EWT DEV.
 *
 * Same chamber as Task 7 (DEV ≤ 28, observe mode, 8 fingerprint replays).
 * No TRAIN pass. For each decision-bearing complement edge,
 * diagnoseComplementMapping twice: real provider vs
 * derangeFeatureValues(EXPERIMENTAL_FEATURE_PROVIDER, 0x50383031).
 *
 * Does not score. Does not open TEST. Does not start Task 9.
 *
 *   node scripts/phase-8-complement-compat-derange.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import {
  EXPERIMENTAL_FEATURE_PROVIDER,
  knownFeatureCount,
} from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  derangeFeatureValues,
  featuresFor,
} from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { ends } from '../codex/core/constellation/semantic-particles/feature-score.js';
import {
  diagnoseCompetitionEdge,
  waterfallStages,
  WATERFALL_STAGES,
} from '../codex/core/constellation/semantic-particles/compat-waterfall.js';
import {
  COMPLEMENT_COMPAT_RELATIONS,
  diagnoseComplementMapping,
  isComplementRelation,
} from '../codex/core/constellation/semantic-particles/complement-compat.js';
import { derivationSignature, isGlueBond, lemmaOf } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import { efficacyVerdict } from '../codex/core/constellation/semantic-particles/exposure-gate.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-phase-8-derange.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-phase-8-derange.md';
const BASELINE_JSON = 'docs/superpowers/evidence/2026-08-17-compat-waterfall-census.json';
const BASELINE_MD = 'docs/superpowers/evidence/2026-08-17-compat-waterfall-census.md';
const MAX_TOKENS = 28;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
const DERANGE_SEED = 0x50383031;

// Task 7 committed chamber. Not the 3B 29570/11568/10989 forest.
const CHAMBER = Object.freeze({
  analysed: 1824,
  parsed: 510,
  threw: 0,
  eventsMean: 68.61896929824562,
  edges: 44634,
  relationAvailable: 21621,
  leftValueAvailable: 9460,
  rightValueAvailable: 8862,
  complementMappingFires: 666,
  complementMappingAbstains: 2550,
  fingerprintsChecked: 8,
  fingerprintsIdentical: true,
});

if (existsSync(TEST_PATH)) {
  // sealed — never read in this script
}

if (OUT === BASELINE_JSON || OUT_MD === BASELINE_MD) {
  throw new Error('Phase 8 derange must not overwrite the 3B waterfall baseline');
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

function emptyFunnel() {
  return Object.fromEntries(WATERFALL_STAGES.map((s) => [s, 0]));
}

function emptyComplement() {
  return {
    complementEdges: 0,
    complementRelationExists: 0,
    complementBothValuesExist: 0,
    complementMappingExists: 0,
    complementMappingFires: 0,
    complementMappingAbstains: 0,
    firesByRelation: Object.fromEntries(COMPLEMENT_COMPAT_RELATIONS.map((r) => [r, 0])),
    nonComplementFires: 0,
  };
}

function featLookup(provider) {
  const cache = new Map();
  return (lemma, type) => {
    const key = `${lemma}\0${type || ''}`;
    let feats = cache.get(key);
    if (!feats) {
      feats = featuresFor(lemma, type, provider);
      cache.set(key, feats);
    }
    return feats;
  };
}

function orientedFeatures(derivation, lookup) {
  const leftType = derivation.left?.type;
  const rightType = derivation.right?.type;
  const selfFeats = lookup(lemmaOf(derivation.left), leftType);
  const otherFeats = lookup(lemmaOf(derivation.right), rightType);
  return ends(leftType, rightType, selfFeats, otherFeats);
}

function tallyMapping(bucket, cmap, relation) {
  bucket.complementEdges += 1;
  if (cmap.relationExists) bucket.complementRelationExists += 1;
  if (cmap.bothValuesExist) bucket.complementBothValuesExist += 1;
  if (cmap.mappingExists) bucket.complementMappingExists += 1;
  if (cmap.mappingFires) {
    bucket.complementMappingFires += 1;
    if (Object.prototype.hasOwnProperty.call(bucket.firesByRelation, relation)) {
      bucket.firesByRelation[relation] += 1;
    }
  }
  if (cmap.mappingAbstains) bucket.complementMappingAbstains += 1;
}

function addAll(set, values) {
  for (const v of values || []) {
    if (v != null && v !== 'UNKNOWN') set.add(v);
  }
}

const posMap = loadPosMap();
const dev = loadSplit('dev');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const realProvider = EXPERIMENTAL_FEATURE_PROVIDER;
const derangedProvider = derangeFeatureValues(realProvider, DERANGE_SEED);
const realLookup = featLookup(realProvider);
const derangedLookup = featLookup(derangedProvider);

function shortSentences(split) {
  const out = [];
  for (const rec of split) {
    const tokens = (rec.tokens || []).map((t) => t.form);
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
    out.push({ id: rec.sentId || `s${out.length}`, tokens });
  }
  return out;
}

const startedAt = Date.now();
const tallies = {
  analysed: 0,
  parsed: 0,
  threw: 0,
  events: [],
  fingerprintsChecked: 0,
  fingerprintsIdentical: 0,
  decisionCompetitiveCells: 0,
  edges: 0,
  funnelReal: emptyFunnel(),
  funnelDeranged: emptyFunnel(),
  complementReal: emptyComplement(),
  complementDeranged: emptyComplement(),
  knownPairsChecked: 0,
  knownMismatches: 0,
  complementPairedDisagree: 0,
  complementRealOnly: 0,
  complementDerangeOnly: 0,
  complementBoth: 0,
  nonComplementPairedDisagree: 0,
  nonComplementRealOnly: 0,
  nonComplementDerangeOnly: 0,
};

const knownSeen = new Set();
const realGovFired = new Set();
const derGovFired = new Set();
const realLemmasFired = new Set();
const derLemmasFired = new Set();
const realPairsFired = new Set();
const derPairsFired = new Set();

function checkKnown(lemma, type) {
  const key = `${lemma}\0${type || ''}`;
  if (knownSeen.has(key)) return;
  knownSeen.add(key);
  tallies.knownPairsChecked += 1;
  const realN = knownFeatureCount(realLookup(lemma, type));
  const derN = knownFeatureCount(derangedLookup(lemma, type));
  if (realN !== derN) tallies.knownMismatches += 1;
}

for (const key of Object.keys(realProvider.seed || {})) {
  const cut = key.indexOf('::');
  if (cut >= 0) checkKnown(key.slice(0, cut), key.slice(cut + 2));
  else checkKnown(key, 'V');
}

const devShort = shortSentences(dev);

for (const rec of devShort) {
  tallies.analysed += 1;
  if (tallies.analysed % 300 === 0) {
    process.stderr.write(`[phase8-derange] dev ${tallies.analysed}/${devShort.length} edges=${tallies.edges}\n`);
  }
  let chart;
  try {
    chart = composePacked(rec.tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    tallies.threw += 1;
    continue;
  }
  tallies.events.push(chart.events || 0);
  if (chart.stable?.length) tallies.parsed += 1;
  if (tallies.fingerprintsChecked < 8) {
    const off = composePacked(rec.tokens, posMap, {});
    tallies.fingerprintsChecked += 1;
    if (forestFingerprint(chart) === forestFingerprint(off)) tallies.fingerprintsIdentical += 1;
  }

  for (const node of chart.molecules || []) {
    const bySignature = new Map();
    for (const derivation of node.derivations || []) {
      const sig = derivationSignature(derivation);
      if (!bySignature.has(sig)) bySignature.set(sig, derivation);
    }
    const unique = [...bySignature.values()];
    const decision = unique.filter((d) => !isGlueBond(d.bond));
    if (decision.length < 2) continue;
    tallies.decisionCompetitiveCells += 1;

    const rows = decision.map((d) => diagnoseCompetitionEdge(d, lexicon, realProvider));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const derivation = decision[i];
      if (row.family === 'lift') continue;
      tallies.edges += 1;

      checkKnown(lemmaOf(derivation.left), derivation.left?.type);
      checkKnown(lemmaOf(derivation.right), derivation.right?.type);

      if (row.stages) {
        for (const stage of WATERFALL_STAGES) {
          if (row.stages[stage]) tallies.funnelReal[stage] += 1;
        }
      }

      const derOriented = orientedFeatures(derivation, derangedLookup);
      const derStages = waterfallStages({
        leftFeats: derOriented.left,
        rightFeats: derOriented.right,
        relation: row.relation,
      });
      for (const stage of WATERFALL_STAGES) {
        if (derStages[stage]) tallies.funnelDeranged[stage] += 1;
      }

      if (isComplementRelation(row.relation)) {
        const realOriented = orientedFeatures(derivation, realLookup);
        const realCmap = diagnoseComplementMapping({
          leftFeats: realOriented.left,
          rightFeats: realOriented.right,
          relation: row.relation,
        });
        const derCmap = diagnoseComplementMapping({
          leftFeats: derOriented.left,
          rightFeats: derOriented.right,
          relation: row.relation,
        });
        tallyMapping(tallies.complementReal, realCmap, row.relation);
        tallyMapping(tallies.complementDeranged, derCmap, row.relation);

        if (realCmap.mappingFires) {
          addAll(realGovFired, realCmap.governorClasses);
          realLemmasFired.add(lemmaOf(derivation.left));
          for (const gov of realCmap.governorClasses || []) {
            realPairsFired.add(`${gov}|${realCmap.complementClass}|${row.relation}`);
          }
        }
        if (derCmap.mappingFires) {
          addAll(derGovFired, derCmap.governorClasses);
          derLemmasFired.add(lemmaOf(derivation.left));
          for (const gov of derCmap.governorClasses || []) {
            derPairsFired.add(`${gov}|${derCmap.complementClass}|${row.relation}`);
          }
        }
        if (realCmap.mappingFires !== derCmap.mappingFires) {
          tallies.complementPairedDisagree += 1;
          if (realCmap.mappingFires) tallies.complementRealOnly += 1;
          else tallies.complementDerangeOnly += 1;
        } else if (realCmap.mappingFires) {
          tallies.complementBoth += 1;
        }
      } else {
        const realFire = Boolean(row.stages?.actualCompatFire);
        const derFire = Boolean(derStages.actualCompatFire);
        if (realFire) tallies.complementReal.nonComplementFires += 1;
        if (derFire) tallies.complementDeranged.nonComplementFires += 1;
        if (realFire !== derFire) {
          tallies.nonComplementPairedDisagree += 1;
          if (realFire) tallies.nonComplementRealOnly += 1;
          else tallies.nonComplementDerangeOnly += 1;
        }
      }
    }
  }
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const eventsMean = mean(tallies.events);
const durationMs = Date.now() - startedAt;

const realHits = tallies.complementReal.complementMappingFires;
const derangeHits = tallies.complementDeranged.complementMappingFires;
const verdict = efficacyVerdict({ realHits, derangeHits });

const fingerprintsIdentical = tallies.fingerprintsIdentical === tallies.fingerprintsChecked
  && tallies.fingerprintsChecked === CHAMBER.fingerprintsChecked;

function held(real, expected) {
  return real === expected;
}

const chamberMatch = {
  analysed: held(tallies.analysed, CHAMBER.analysed),
  parsed: held(tallies.parsed, CHAMBER.parsed),
  threw: held(tallies.threw, CHAMBER.threw),
  eventsMean: eventsMean === CHAMBER.eventsMean,
  edges: held(tallies.edges, CHAMBER.edges),
  relationAvailable: held(tallies.funnelReal.relationAvailable, CHAMBER.relationAvailable),
  leftValueAvailable: held(tallies.funnelReal.leftValueAvailable, CHAMBER.leftValueAvailable),
  rightValueAvailable: held(tallies.funnelReal.rightValueAvailable, CHAMBER.rightValueAvailable),
  complementMappingFires: held(realHits, CHAMBER.complementMappingFires),
  complementMappingAbstains: held(
    tallies.complementReal.complementMappingAbstains,
    CHAMBER.complementMappingAbstains,
  ),
  fingerprints: fingerprintsIdentical,
};

const preserve = {
  knownCountPerLemma: tallies.knownMismatches === 0,
  knownPairsChecked: tallies.knownPairsChecked,
  knownMismatches: tallies.knownMismatches,
  relationAvailable: {
    real: tallies.funnelReal.relationAvailable,
    deranged: tallies.funnelDeranged.relationAvailable,
    held: tallies.funnelReal.relationAvailable === tallies.funnelDeranged.relationAvailable,
  },
  leftValueAvailable: {
    real: tallies.funnelReal.leftValueAvailable,
    deranged: tallies.funnelDeranged.leftValueAvailable,
    held: tallies.funnelReal.leftValueAvailable === tallies.funnelDeranged.leftValueAvailable,
  },
  rightValueAvailable: {
    real: tallies.funnelReal.rightValueAvailable,
    deranged: tallies.funnelDeranged.rightValueAvailable,
    held: tallies.funnelReal.rightValueAvailable === tallies.funnelDeranged.rightValueAvailable,
  },
  fingerprints: {
    checked: tallies.fingerprintsChecked,
    identical: tallies.fingerprintsIdentical,
    held: fingerprintsIdentical,
  },
};

const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b));
const realGov = sorted(realGovFired);
const derGov = sorted(derGovFired);
const realLemmas = sorted(realLemmasFired);
const derLemmas = sorted(derLemmasFired);
const realPairs = sorted(realPairsFired);
const derPairs = sorted(derPairsFired);

function setEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

const movement = {
  complementMappingFires: {
    real: realHits,
    deranged: derangeHits,
    delta: derangeHits - realHits,
    moved: realHits !== derangeHits,
  },
  complementMappingAbstains: {
    real: tallies.complementReal.complementMappingAbstains,
    deranged: tallies.complementDeranged.complementMappingAbstains,
    delta: tallies.complementDeranged.complementMappingAbstains
      - tallies.complementReal.complementMappingAbstains,
  },
  firesByRelation: {
    real: { ...tallies.complementReal.firesByRelation },
    deranged: { ...tallies.complementDeranged.firesByRelation },
  },
  complementPaired: {
    disagree: tallies.complementPairedDisagree,
    realOnly: tallies.complementRealOnly,
    derangeOnly: tallies.complementDerangeOnly,
    both: tallies.complementBoth,
  },
  nonComplementFires: {
    note: 'Existing T1 FEATURE_COMPAT rows are value-sensitive. Movement is reported, not a preserve-target.',
    real: tallies.complementReal.nonComplementFires,
    deranged: tallies.complementDeranged.nonComplementFires,
    delta: tallies.complementDeranged.nonComplementFires
      - tallies.complementReal.nonComplementFires,
    moved: tallies.complementReal.nonComplementFires
      !== tallies.complementDeranged.nonComplementFires,
    pairedDisagree: tallies.nonComplementPairedDisagree,
    realOnly: tallies.nonComplementRealOnly,
    derangeOnly: tallies.nonComplementDerangeOnly,
  },
  governorClassesFired: {
    real: realGov,
    deranged: derGov,
    moved: !setEqual(realGov, derGov),
  },
  lemmasFired: {
    realCount: realLemmas.length,
    derangedCount: derLemmas.length,
    real: realLemmas,
    deranged: derLemmas,
    moved: !setEqual(realLemmas, derLemmas),
  },
  classPairsFired: {
    real: realPairs,
    deranged: derPairs,
    moved: !setEqual(realPairs, derPairs),
  },
};

const scoreOpened = false;
let remainder;
if (verdict === 'FALSIFIED_OR_NONDISCRIMINATIVE') {
  remainder = 'The table is a coverage light, not a semantic one. realHits === derangeHits.';
} else if (verdict === 'REAL_BEATS_CONTROLS') {
  remainder = 'SCORE is considerable, not licensed. Task 7 failed P1–P20; Task 9 stays blocked.';
} else {
  remainder = 'Deranged complement mappingFires were not beaten by real. SCORE not licensed.';
}

const report = {
  contract: 'PB-PHASE8-COMPLEMENT-DERANGE-v1',
  generatedBy: 'scripts/phase-8-complement-compat-derange.mjs',
  mode: 'observe',
  testFileOpened: false,
  scored: false,
  scoreOpened,
  commit: gitHead(),
  maxTokens: MAX_TOKENS,
  split: 'dev',
  derangeSeed: '0x50383031',
  derangeSeedNumber: DERANGE_SEED,
  durationMs,
  chamberBaseline: { ...CHAMBER },
  protection: {
    analysed: tallies.analysed,
    parsed: tallies.parsed,
    threw: tallies.threw,
    eventsMean,
    fingerprintsChecked: tallies.fingerprintsChecked,
    fingerprintsIdentical,
  },
  chamberMatch,
  knownCount: {
    pairsChecked: tallies.knownPairsChecked,
    mismatches: tallies.knownMismatches,
    preserved: tallies.knownMismatches === 0,
  },
  real: {
    counts: {
      edges: tallies.edges,
      decisionCompetitiveCells: tallies.decisionCompetitiveCells,
    },
    funnel: { ...tallies.funnelReal },
    complementMapping: { ...tallies.complementReal, firesByRelation: { ...tallies.complementReal.firesByRelation } },
  },
  deranged: {
    funnel: { ...tallies.funnelDeranged },
    complementMapping: {
      ...tallies.complementDeranged,
      firesByRelation: { ...tallies.complementDeranged.firesByRelation },
    },
  },
  preserve,
  movement,
  efficacy: {
    realHits,
    derangeHits,
    verdict,
  },
  remainder,
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

function yn(ok) {
  return ok ? 'held' : 'MOVED';
}

const md = [];
md.push('# DERANGE — Phase 8 complement COMPAT values');
md.push('');
md.push('SCORE was not opened. TEST was not opened. No TRAIN pass. Chamber is Task 7 DEV ≤ 28.');
md.push('3B 29570 / 11568 / 10989 are not the preserve-targets.');
md.push('Prereg: `2026-08-17-PREREG-phase-8-complement-compat.md`.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- derange seed \`0x50383031\` (${DERANGE_SEED})`);
md.push(`- instrument \`derangeFeatureValues(EXPERIMENTAL_FEATURE_PROVIDER, 0x50383031)\``);
md.push(`- DEV sentences ≤ ${MAX_TOKENS} tokens: analysed ${tallies.analysed}, parsed ${tallies.parsed}, threw ${tallies.threw}`);
md.push(`- eventsMean ${eventsMean}`);
md.push(`- fingerprints identical on ${tallies.fingerprintsIdentical}/${tallies.fingerprintsChecked} observe-vs-off replay pairs`);
md.push(`- testFileOpened: false; scored: false; scoreOpened: false`);
md.push(`- durationMs: ${durationMs}`);
md.push('');
md.push('## Efficacy');
md.push('');
md.push(`- realHits (complement mappingFires): **${realHits}**`);
md.push(`- derangeHits (complement mappingFires): **${derangeHits}**`);
md.push(`- efficacyVerdict({ realHits, derangeHits }): **${verdict}**`);
md.push(`- ${remainder}`);
md.push('- SCORE not opened. Task 9 was not started.');
md.push('');
md.push('## Chamber (real arm vs Task 7)');
md.push('');
md.push('| Quantity | Task 7 | This real arm | Match |');
md.push('|---|---|---|---|');
md.push(`| analysed | ${CHAMBER.analysed} | ${tallies.analysed} | ${chamberMatch.analysed} |`);
md.push(`| parsed | ${CHAMBER.parsed} | ${tallies.parsed} | ${chamberMatch.parsed} |`);
md.push(`| threw | ${CHAMBER.threw} | ${tallies.threw} | ${chamberMatch.threw} |`);
md.push(`| eventsMean | ${CHAMBER.eventsMean} | ${eventsMean} | ${chamberMatch.eventsMean} |`);
md.push(`| edges | ${CHAMBER.edges} | ${tallies.edges} | ${chamberMatch.edges} |`);
md.push(`| relationAvailable | ${CHAMBER.relationAvailable} | ${tallies.funnelReal.relationAvailable} | ${chamberMatch.relationAvailable} |`);
md.push(`| leftValueAvailable | ${CHAMBER.leftValueAvailable} | ${tallies.funnelReal.leftValueAvailable} | ${chamberMatch.leftValueAvailable} |`);
md.push(`| rightValueAvailable | ${CHAMBER.rightValueAvailable} | ${tallies.funnelReal.rightValueAvailable} | ${chamberMatch.rightValueAvailable} |`);
md.push(`| complement mappingFires | ${CHAMBER.complementMappingFires} | ${realHits} | ${chamberMatch.complementMappingFires} |`);
md.push(`| complement mappingAbstains | ${CHAMBER.complementMappingAbstains} | ${tallies.complementReal.complementMappingAbstains} | ${chamberMatch.complementMappingAbstains} |`);
md.push(`| fingerprints | 8/8 | ${tallies.fingerprintsIdentical}/${tallies.fingerprintsChecked} | ${chamberMatch.fingerprints} |`);
md.push('');
md.push('## Preserve (real vs deranged)');
md.push('');
md.push(`- known-count per lemma: **${preserve.knownCountPerLemma ? 'held' : 'BROKEN'}** (${preserve.knownPairsChecked} pairs, ${preserve.knownMismatches} mismatches)`);
md.push(`- relationAvailable: real ${preserve.relationAvailable.real} / deranged ${preserve.relationAvailable.deranged} — **${yn(preserve.relationAvailable.held)}**`);
md.push(`- leftValueAvailable: real ${preserve.leftValueAvailable.real} / deranged ${preserve.leftValueAvailable.deranged} — **${yn(preserve.leftValueAvailable.held)}**`);
md.push(`- rightValueAvailable: real ${preserve.rightValueAvailable.real} / deranged ${preserve.rightValueAvailable.deranged} — **${yn(preserve.rightValueAvailable.held)}**`);
md.push(`- forest fingerprints observe-vs-off: **${tallies.fingerprintsIdentical}/${tallies.fingerprintsChecked}** (derange does not touch the chart)`);
md.push('');
md.push('## Complement mappingFires');
md.push('');
md.push(`- real: ${realHits}`);
md.push(`- deranged: ${derangeHits}`);
md.push(`- delta (deranged − real): ${movement.complementMappingFires.delta}`);
md.push(`- complement mappingAbstains: real ${movement.complementMappingAbstains.real} / deranged ${movement.complementMappingAbstains.deranged}`);
md.push(`- firesByRelation INFINITIVAL_COMPLEMENT: real ${movement.firesByRelation.real.INFINITIVAL_COMPLEMENT} / deranged ${movement.firesByRelation.deranged.INFINITIVAL_COMPLEMENT}`);
md.push(`- firesByRelation PROPOSITIONAL_COMPLEMENT: real ${movement.firesByRelation.real.PROPOSITIONAL_COMPLEMENT} / deranged ${movement.firesByRelation.deranged.PROPOSITIONAL_COMPLEMENT}`);
md.push(`- paired disagree: ${movement.complementPaired.disagree} (real-only ${movement.complementPaired.realOnly}, derange-only ${movement.complementPaired.derangeOnly}, both ${movement.complementPaired.both})`);
md.push('');
md.push('## Non-complement actualCompatFire (reported, not preserved)');
md.push('');
md.push('Existing T1 FEATURE_COMPAT rows are value-sensitive. Derange may move them.');
md.push('');
md.push(`- real: ${movement.nonComplementFires.real}`);
md.push(`- deranged: ${movement.nonComplementFires.deranged}`);
md.push(`- delta (deranged − real): ${movement.nonComplementFires.delta}`);
md.push(`- moved: ${movement.nonComplementFires.moved}`);
md.push(`- paired disagree: ${movement.nonComplementFires.pairedDisagree} (real-only ${movement.nonComplementFires.realOnly}, derange-only ${movement.nonComplementFires.derangeOnly})`);
md.push('');
md.push('## Governor classes / lemmas that fire');
md.push('');
md.push(`- governor classes real: ${realGov.join(', ') || '(none)'}`);
md.push(`- governor classes deranged: ${derGov.join(', ') || '(none)'}`);
md.push(`- governor-class set moved: ${movement.governorClassesFired.moved}`);
md.push(`- lemmas fired: real ${realLemmas.length} / deranged ${derLemmas.length} (set moved: ${movement.lemmasFired.moved})`);
md.push(`- class pairs real: ${realPairs.join(', ') || '(none)'}`);
md.push(`- class pairs deranged: ${derPairs.join(', ') || '(none)'}`);
md.push(`- class-pair set moved: ${movement.classPairsFired.moved}`);
md.push('');
md.push('## Global funnel (real vs deranged)');
md.push('');
for (const stage of WATERFALL_STAGES) {
  md.push(`- ${stage}: real ${tallies.funnelReal[stage]} / deranged ${tallies.funnelDeranged[stage]}`);
}
md.push('');
md.push('Stay in OBSERVE. This census does not promote SCORE.');
md.push('');
md.push('Reproduction: `node scripts/phase-8-complement-compat-derange.mjs`');
writeFileSync(OUT_MD, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  contract: report.contract,
  testFileOpened: report.testFileOpened,
  scored: report.scored,
  scoreOpened,
  protection: report.protection,
  chamberMatch,
  preserve: {
    knownCountPerLemma: preserve.knownCountPerLemma,
    relationAvailable: preserve.relationAvailable.held,
    leftValueAvailable: preserve.leftValueAvailable.held,
    rightValueAvailable: preserve.rightValueAvailable.held,
    fingerprints: preserve.fingerprints.held,
  },
  efficacy: report.efficacy,
  nonComplementFires: movement.nonComplementFires,
  remainder,
  wrote: [OUT, OUT_MD],
}, null, 2));
