#!/usr/bin/env node
/**
 * Observe-only Phase 8 complement mapping waterfall on EWT DEV.
 *
 * Same chamber as the 3B compatibility waterfall census. Adds a
 * complement-mapping instrument (diagnoseComplementMapping on oriented
 * ends) without overwriting 2026-08-17-compat-waterfall-census.{md,json}.
 *
 * Does not score. Does not open TEST. Does not author relations or COMPAT.
 * TRAIN is read only for gold-independent bond frequencies.
 *
 * Prereg: docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-compat.md
 *
 *   node scripts/phase-8-complement-compat-observe.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { featuresFor } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { ends } from '../codex/core/constellation/semantic-particles/feature-score.js';
import {
  summarizeWaterfall,
  WATERFALL_STAGES,
  diagnoseCompetitionEdge,
} from '../codex/core/constellation/semantic-particles/compat-waterfall.js';
import {
  COMPLEMENT_COMPAT_RELATIONS,
  diagnoseComplementMapping,
  isComplementRelation,
} from '../codex/core/constellation/semantic-particles/complement-compat.js';
import { derivationSignature, isGlueBond, lemmaOf } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-phase-8-observe.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-phase-8-observe.md';
const BASELINE_JSON = 'docs/superpowers/evidence/2026-08-17-compat-waterfall-census.json';
const BASELINE_MD = 'docs/superpowers/evidence/2026-08-17-compat-waterfall-census.md';
const MAX_TOKENS = 28;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');

if (existsSync(TEST_PATH)) {
  // sealed — never read in this script
}

if (OUT === BASELINE_JSON || OUT_MD === BASELINE_MD) {
  throw new Error('Phase 8 observe must not overwrite the 3B waterfall baseline');
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

function pct(x) {
  return `${(Number(x) * 100).toFixed(1)}%`;
}

const posMap = loadPosMap();
const dev = loadSplit('dev');
const train = loadSplit('train');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const provider = EXPERIMENTAL_FEATURE_PROVIDER;

function shortSentences(split) {
  const out = [];
  for (const rec of split) {
    const tokens = (rec.tokens || []).map((t) => t.form);
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
    out.push({ id: rec.sentId || `s${out.length}`, tokens });
  }
  return out;
}

function orientedFeatures(derivation) {
  const leftType = derivation.left?.type;
  const rightType = derivation.right?.type;
  const selfFeats = featuresFor(lemmaOf(derivation.left), leftType, provider);
  const otherFeats = featuresFor(lemmaOf(derivation.right), rightType, provider);
  return ends(leftType, rightType, selfFeats, otherFeats);
}

// ---- TRAIN pass: gold-independent bond frequencies ---------------------
const trainBondCount = new Map();
let trainAnalysed = 0;
const trainShort = shortSentences(train);
for (const rec of trainShort) {
  trainAnalysed += 1;
  if (trainAnalysed % 1500 === 0) {
    process.stderr.write(`[phase8-observe] train ${trainAnalysed}/${trainShort.length}\n`);
  }
  let chart;
  try {
    chart = composePacked(rec.tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    continue;
  }
  for (const node of chart.molecules || []) {
    for (const derivation of node.derivations || []) {
      const bond = derivation.bond;
      if (!Array.isArray(bond) || bond.length < 3) continue;
      if (isGlueBond(bond)) continue;
      const key = `${bond[0]}+${bond[1]}->${bond[2]}`;
      trainBondCount.set(key, (trainBondCount.get(key) || 0) + 1);
    }
  }
}

// ---- DEV pass: the waterfall census -------------------------------------
const tallies = {
  analysed: 0,
  parsed: 0,
  threw: 0,
  events: [],
  fingerprintsChecked: 0,
  fingerprintsIdentical: 0,
  decisionCompetitiveCells: 0,
  edges: 0,
  silent: 0,
  couldFire: 0,
  namedComplete: 0,
  bothNamed: 0,
  bothT1: 0,
  funnel: Object.fromEntries(WATERFALL_STAGES.map((s) => [s, 0])),
  silence: new Map(),
  bonds: new Map(), // bondKey -> aggregate row
  cellsByIdentity: new Map(), // sentenceId -> Set of cell identity keys
  complementEdges: 0,
  complementRelationExists: 0,
  complementBothValuesExist: 0,
  complementMappingExists: 0,
  complementMappingFires: 0,
  complementMappingAbstains: 0,
  firesByRelation: Object.fromEntries(COMPLEMENT_COMPAT_RELATIONS.map((r) => [r, 0])),
  nonComplementFires: 0,
};

const devShort = shortSentences(dev);

for (const rec of devShort) {
  tallies.analysed += 1;
  if (tallies.analysed % 300 === 0) {
    process.stderr.write(`[phase8-observe] dev ${tallies.analysed}/${devShort.length} cells=${tallies.decisionCompetitiveCells}\n`);
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
    // Cheap dedupe FIRST; diagnose only unique signatures (mirrors
    // observeCompetitiveCell — packed charts carry many duplicate
    // derivations and diagnosing them all is pure waste).
    const bySignature = new Map();
    for (const derivation of node.derivations || []) {
      const sig = derivationSignature(derivation);
      if (!bySignature.has(sig)) bySignature.set(sig, derivation);
    }
    const unique = [...bySignature.values()];
    const decision = unique.filter((d) => !isGlueBond(d.bond));
    if (decision.length < 2) continue;
    tallies.decisionCompetitiveCells += 1;

    // Diagnose once per unique decision derivation; sibling lookups need rows.
    const rows = decision.map((d) => diagnoseCompetitionEdge(d, lexicon, provider));

    let namedLive = 0;
    let t1Live = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const derivation = decision[i];
      if (row.family === 'lift') continue;
      tallies.edges += 1;
      if (row.named && row.complete) {
        tallies.namedComplete += 1;
        namedLive += 1;
      }
      if (row.t1Status === 'could-fire') {
        tallies.couldFire += 1;
        t1Live += 1;
      }
      const silent = !(row.named && row.complete) && row.t1Status !== 'could-fire';
      if (silent) {
        tallies.silent += 1;
      }
      if (row.silenceClass) {
        tallies.silence.set(row.silenceClass, (tallies.silence.get(row.silenceClass) || 0) + 1);
      }
      if (row.stages) {
        for (const stage of WATERFALL_STAGES) {
          if (row.stages[stage]) tallies.funnel[stage] += 1;
        }
      }

      if (isComplementRelation(row.relation)) {
        // Recompute oriented ends the same way diagnoseCompetitionEdge does.
        const oriented = orientedFeatures(derivation);
        const cmap = diagnoseComplementMapping({
          leftFeats: oriented.left,
          rightFeats: oriented.right,
          relation: row.relation,
        });
        tallies.complementEdges += 1;
        if (cmap.relationExists) tallies.complementRelationExists += 1;
        if (cmap.bothValuesExist) tallies.complementBothValuesExist += 1;
        if (cmap.mappingExists) tallies.complementMappingExists += 1;
        if (cmap.mappingFires) {
          tallies.complementMappingFires += 1;
          tallies.firesByRelation[row.relation] += 1;
        }
        if (cmap.mappingAbstains) tallies.complementMappingAbstains += 1;
      } else if (row.stages?.actualCompatFire) {
        tallies.nonComplementFires += 1;
      }

      // Bond-level census, ranked by decision cells affected.
      const bond = row.bond;
      if (bond) {
        const key = `${bond[0]}+${bond[1]}->${bond[2]}`;
        let agg = tallies.bonds.get(key);
        if (!agg) {
          agg = {
            bond: key,
            family: row.family,
            leftType: bond[0],
            rightType: bond[1],
            resultType: bond[2],
            silentEdges: 0,
            cells: new Set(),
            sentences: new Set(),
            hasNamedAlternate: 0,
          };
          tallies.bonds.set(key, agg);
        }
        if (silent) {
          agg.silentEdges += 1;
          const cellKey = `${node.type}:${node.from}-${node.to}`;
          agg.cells.add(cellKey);
          agg.sentences.add(rec.id);
          // Does this cell also carry a named-complete sibling alternative?
          const others = rows.filter((r) => r !== row && r.family !== 'lift');
          if (others.some((r) => r.named && r.complete)) agg.hasNamedAlternate += 1;
        }
      }
    }

    if (namedLive >= 2) tallies.bothNamed += 1;
    if (t1Live >= 2) tallies.bothT1 += 1;
  }
}

const rates = summarizeWaterfall({
  edges: tallies.edges,
  silent: tallies.silent,
  couldFire: tallies.couldFire,
  namedComplete: tallies.namedComplete,
  funnel: tallies.funnel,
  cells: tallies.decisionCompetitiveCells,
  bothNamed: tallies.bothNamed,
  bothT1: tallies.bothT1,
  silence: Object.fromEntries(tallies.silence),
});

const complementMapping = {
  complementEdges: tallies.complementEdges,
  complementRelationExists: tallies.complementRelationExists,
  complementBothValuesExist: tallies.complementBothValuesExist,
  complementMappingExists: tallies.complementMappingExists,
  complementMappingFires: tallies.complementMappingFires,
  complementMappingAbstains: tallies.complementMappingAbstains,
  firesByRelation: { ...tallies.firesByRelation },
  nonComplementFires: tallies.nonComplementFires,
};

// Rank bonds: decision cells affected, then sentences, then TRAIN frequency.
const bondRows = [...tallies.bonds.values()]
  .filter((b) => b.silentEdges > 0)
  .map((b) => ({
    bond: b.bond,
    family: b.family,
    leftType: b.leftType,
    rightType: b.rightType,
    resultType: b.resultType,
    silentEdges: b.silentEdges,
    decisionCellsAffected: b.cells.size,
    sentencesAffected: b.sentences.size,
    namedAlternateSilentEdges: b.hasNamedAlternate,
    trainBondFrequency: trainBondCount.get(b.bond) || 0,
  }))
  .sort(
    (a, b) =>
      b.decisionCellsAffected - a.decisionCellsAffected
      || b.sentencesAffected - a.sentencesAffected
      || b.trainBondFrequency - a.trainBondFrequency
      || a.bond.localeCompare(b.bond),
  );

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const report = {
  contract: 'PB-PHASE8-COMPLEMENT-OBSERVE-v1',
  generatedBy: 'scripts/phase-8-complement-compat-observe.mjs',
  mode: 'observe',
  testFileOpened: false,
  scored: false,
  commit: gitHead(),
  maxTokens: MAX_TOKENS,
  split: 'dev',
  trainBondFrequencySource: 'train-packed-charts-gold-independent',
  trainAnalysed,
  protection: {
    analysed: tallies.analysed,
    parsed: tallies.parsed,
    threw: tallies.threw,
    eventsMean: mean(tallies.events),
    fingerprintsChecked: tallies.fingerprintsChecked,
    fingerprintsIdentical: tallies.fingerprintsIdentical === tallies.fingerprintsChecked,
  },
  counts: {
    edges: tallies.edges,
    silent: tallies.silent,
    couldFire: tallies.couldFire,
    namedComplete: tallies.namedComplete,
    bothNamed: tallies.bothNamed,
    bothT1: tallies.bothT1,
    decisionCompetitiveCells: tallies.decisionCompetitiveCells,
  },
  funnel: { ...tallies.funnel },
  rates,
  silenceClasses: Object.fromEntries(
    [...tallies.silence.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  ),
  complementMapping,
  topSilentBondsByDecisionCells: bondRows.slice(0, 24),
  preregGates: {
    note: 'Phase 8 P1–P20 live in 2026-08-17-PREREG-phase-8-complement-compat.md. This census measures; it does not gate.',
  },
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# OBSERVE — Phase 8 complement mapping waterfall');
md.push('');
md.push('SCORE was not run. TEST was not opened. No relations or COMPAT rows authored.');
md.push('Does not overwrite `2026-08-17-compat-waterfall-census.{md,json}`.');
md.push('Prereg: `2026-08-17-PREREG-phase-8-complement-compat.md`.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- DEV sentences ≤ ${MAX_TOKENS} tokens: analysed ${tallies.analysed}, parsed ${tallies.parsed}, threw ${tallies.threw}`);
md.push(`- fingerprints identical on ${tallies.fingerprintsIdentical}/${tallies.fingerprintsChecked} replay pairs`);
md.push(`- TRAIN pass (gold-independent bond frequencies): ${trainAnalysed} sentences analysed`);
md.push(`- testFileOpened: ${report.testFileOpened}; scored: ${report.scored}`);
md.push('');
md.push('## Frozen metrics (this OBSERVE run)');
md.push('');
md.push(`- silentCompetitorRate **${pct(rates.silentCompetitorRate)}** (${tallies.silent}/${tallies.edges})`);
md.push(`- t1DecisionCouldFireRate **${pct(rates.t1DecisionCouldFireRate)}** (${tallies.couldFire}/${tallies.edges})`);
md.push(`- namedCompleteRate **${pct(rates.namedCompleteRate)}** (${tallies.namedComplete}/${tallies.edges})`);
md.push(`- bothAlternativesNamedRate **${pct(rates.bothAlternativesNamedRate)}** (${tallies.bothNamed}/${tallies.decisionCompetitiveCells})`);
md.push(`- bothAlternativesT1Rate **${pct(rates.bothAlternativesT1Rate)}** (${tallies.bothT1}/${tallies.decisionCompetitiveCells})`);
md.push('');
md.push('## Global waterfall (cumulative funnel over decision-bearing edges)');
md.push('');
for (const stage of WATERFALL_STAGES) {
  md.push(`- ${stage}: ${tallies.funnel[stage]} (${pct(rates.waterfall[stage])})`);
}
md.push('');
md.push('## Complement mapping waterfall');
md.push('');
md.push(`- complementEdges: ${complementMapping.complementEdges}`);
md.push(`- complementRelationExists: ${complementMapping.complementRelationExists}`);
md.push(`- complementBothValuesExist: ${complementMapping.complementBothValuesExist}`);
md.push(`- complementMappingExists: ${complementMapping.complementMappingExists}`);
md.push(`- complementMappingFires: ${complementMapping.complementMappingFires}`);
md.push(`- complementMappingAbstains: ${complementMapping.complementMappingAbstains}`);
md.push(`- firesByRelation.INFINITIVAL_COMPLEMENT: ${complementMapping.firesByRelation.INFINITIVAL_COMPLEMENT}`);
md.push(`- firesByRelation.PROPOSITIONAL_COMPLEMENT: ${complementMapping.firesByRelation.PROPOSITIONAL_COMPLEMENT}`);
md.push(`- nonComplementFires: ${complementMapping.nonComplementFires}`);
md.push('');
md.push('## Silence taxonomy');
md.push('');
for (const [cls, count] of [...tallies.silence.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  md.push(`- ${cls}: ${count}`);
}
md.push('');
md.push('## Top silent bonds, ranked by decision cells affected');
md.push('');
md.push('| bond | family | silent edges | cells affected | sentences | named alt present | TRAIN freq |');
md.push('|---|---|---|---|---|---|---|');
for (const b of report.topSilentBondsByDecisionCells) {
  md.push(`| \`${b.bond}\` | ${b.family} | ${b.silentEdges} | ${b.decisionCellsAffected} | ${b.sentencesAffected} | ${b.namedAlternateSilentEdges} | ${b.trainBondFrequency} |`);
}
md.push('');
md.push('Ranking is decision cells affected, then sentences, then TRAIN frequency —');
md.push('never raw DEV bond frequency.');
md.push('');
md.push('Stay in OBSERVE. This census does not promote SCORE.');
md.push('');
md.push('Reproduction: `node scripts/phase-8-complement-compat-observe.mjs`');
writeFileSync(OUT_MD, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  contract: report.contract,
  testFileOpened: report.testFileOpened,
  scored: report.scored,
  rates,
  complementMapping,
  silenceClasses: report.silenceClasses,
  topBond: bondRows[0] || null,
  wrote: [OUT, OUT_MD],
}, null, 2));
