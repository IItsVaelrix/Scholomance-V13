#!/usr/bin/env node
/**
 * DARK-MATTER BEAM — perturb the dark sentences and image what bends.
 *
 * The census (scripts/gap-zero-sweep.mjs) found 62 sentences that span the
 * whole input yet admit no root: dark matter. This script fires the
 * perturbation beam (codex/core/constellation/perturbation-beam.js) at every
 * one of them and writes the aggregate mass map.
 *
 * WHAT A BEAM IS. Remove one token (or an edge of tokens, or substitute a
 * pure-class probe word) and recompose. If a root appears, the perturbed
 * token was the mass bending the parse away from root status. The pattern of
 * illuminations across all beams is an image of the missing grammar.
 *
 * THE PURITY LAW. This is a PROBE. It never proposes admitting a new root
 * type, never edits bonds, and treats span counts as worthless: the only
 * legitimate downstream gate is head accuracy plus a purity check, per the
 * census verdict. Every illumination therefore records whether the lit root
 * heads on the gold verb.
 *
 * DETERMINISM. No randomness anywhere: dark selection re-derives chart state
 * (never re-reads the census JSON), probe words are the alphabetically first
 * pure-class words in the corpus's own lexicon, and all ordering is sorted.
 * Re-run yields byte-identical evidence.
 *
 * TELEMETRY. The runner prints the slices an agent needs: path census,
 * family × gold-head, remainder autopsy, leftover types that refused, and
 * a boon board whose every row carries a gate and a forbidden move. The
 * headline illumination count is never printed without the family split.
 *
 *   node scripts/dark-matter-beam.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import {
  fireBeam,
  pickProbeWords,
  tomographicScan,
} from '../codex/core/constellation/perturbation-beam.js';
import {
  PURITY_GATE,
  agentBrief,
  corpusTelemetry,
  sentenceTelemetry,
} from '../codex/core/constellation/perturbation-telemetry.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const OUT = 'docs/superpowers/evidence/2026-08-15-dark-matter-beam.json';
const read = (n) => readFileSync(path.join(FIX, n), 'utf8');
const records = parseConllu(read('treebank-gate.conllu'));
const posMap = new Map(Object.entries(JSON.parse(read('treebank-gate-lexicon.json'))));
const MAX_TOKENS = 20; // same aperture as the census — dark sets must match
const probes = pickProbeWords(posMap);

/** Re-derive dark. Never re-read the census JSON: the beam must not trust a
 * description of the territory when it can walk the territory itself. */
const dark = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  const chart = composePacked(tokens, posMap, {});
  if (chart.stable.length > 0 || chart.spanning.length === 0) continue;
  dark.push({ rec, tokens, chart });
}

const sentences = [];

for (const { rec, tokens, chart } of dark) {
  const gold = goldAnswer(rec);
  const scan = tomographicScan(tokens, posMap, chart, gold.verb, gold.subject, { probes });
  const beam = scan.beam;
  const tel = sentenceTelemetry({
    sentId: rec.sentId || tokens.join(' ').slice(0, 60),
    tokens,
    posMap,
    darkChart: chart,
    goldVerb: gold.verb,
    goldSubject: gold.subject,
    beam,
  });
  const lit = (beam.edges || []).concat(beam.deletions || [], beam.substitutions || [])
    .filter((r) => r.effect === 'ILLUMINATED');
  sentences.push({
    ...tel,
    illuminatingPerturbations: lit,
    refractions: [
      ...beam.edges, ...beam.deletions, ...beam.substitutions,
    ].filter((r) => r.effect === 'REFRACTED'),
    tomographicProjections: scan.tomographicProjections,
    contrastiveCount: scan.contrastiveCount,
  });
}

const corpus = corpusTelemetry(sentences);
const pad = (v, w) => String(v).padStart(w);
const fam = corpus.byFamily;

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  DARK-MATTER BEAM — perturbation image of the gap-zero class');
console.log('══════════════════════════════════════════════════════════════════════\n');
console.log(`dark sentences re-derived: ${dark.length}   probe classes: ${Object.entries(probes).map(([c, w]) => `${c}→"${w}"`).join('  ')}`);
console.log(`path: substitution-only=${corpus.paths['substitution-only']}  deletion-lit-gold=${corpus.paths['deletion-lit-gold']}  deletion-lit-false=${corpus.paths['deletion-lit-false']}  inert=${corpus.paths.inert}`);
console.log(`illuminations: ${corpus.illuminationsTotal}   gold-head: ${corpus.goldHeadIlluminations}   lit types: ${corpus.litTypes.join(', ') || '(none)'}\n`);

console.log('  family × gold-head (ILLUMINATED only — substitutions must not hide here)');
console.log('  -------------  ---------  ---------  ---------');
console.log('  family         illum      gold       false');
for (const family of ['delete-token', 'delete-edge', 'substitute']) {
  const b = fam[family];
  console.log(`  ${family.padEnd(13)}  ${pad(b.illuminated, 9)}  ${pad(b.goldHead, 9)}  ${pad(b.falseHead, 9)}`);
}

console.log('\n  beam effect census (all perturbations, all sentences)');
console.log('  -------------  ---------');
for (const effect of ['ILLUMINATED', 'REFRACTED', 'INVARIANT', 'COLLAPSED']) {
  if (corpus.effectTotals[effect]) console.log(`  ${effect.padEnd(13)}  ${pad(corpus.effectTotals[effect], 9)}`);
}

console.log('\nREMAINDER AUTOPSY (deletion illuminations)');
const autopsies = sentences.flatMap((s) => (s.autopsies || [])
  .filter((a) => a.family === 'delete-token' || a.family === 'delete-edge')
  .map((a) => ({ ...a, text: s.text, gold: s.goldVerb, dark: s.darkTypes })));
if (autopsies.length === 0) {
  console.log('  (none — no deletion lit a root)');
} else {
  for (const a of autopsies) {
    console.log(`  ${String(a.kind).padEnd(16)} ${a.class.padEnd(22)} via=${String(a.via).padEnd(9)} goldHead=${a.goldHead}  del "${a.deleted}"  gold=${a.gold} dark=[${a.dark}]  "${a.text}"`);
  }
}

console.log('\nLEFTOVER TYPES THAT REFUSED DELETION');
if (corpus.leftoverRefused.length === 0) {
  console.log('  (none)');
} else {
  for (const s of corpus.leftoverRefused) {
    console.log(`  [${(s.darkTypes || []).join('|')}] gold=${s.goldVerb}  "${s.text}"`);
  }
}

console.log('\nRESIDUAL TRACE FOCAL POINTS (top obstruction epicenters)');
const focalList = sentences
  .filter((s) => s.residualTrace && s.residualTrace.focalSpans.length > 0 && s.illuminations > 0)
  .map((s) => ({
    text: s.text,
    gold: s.goldVerb,
    top: s.residualTrace.focalSpans[0],
    stress: s.residualTrace.tokenStress,
  }));
if (focalList.length === 0) {
  console.log('  (none)');
} else {
  for (const f of focalList.slice(0, 12)) {
    console.log(`  [${f.top.span[0]}:${f.top.span[1]}] energy=${pad(f.top.energy, 6)} conf=${pad(f.top.confidence, 5)} focus="${f.top.text.padEnd(12)}" gold=${pad(f.gold, 10)}  "${f.text}"`);
  }
}

console.log('\nTOMOGRAPHIC OPTICAL FUSION (descending light back-projections)');
const projections = sentences.flatMap((s) => (s.tomographicProjections || [])
  .filter((p) => p.kind === 'delete' || p.kind === 'delete-prefix' || p.kind === 'delete-suffix')
  .map((p) => ({
    text: s.text,
    gold: s.goldVerb,
    kind: p.kind,
    contrastive: p.excess ? p.excess.isContrastive : null,
    participating: (p.projection && p.projection.participatingTokens) || [],
    obstruction: (p.projection && p.projection.obstructionTokens) || [],
    answers: (p.projection && p.projection.projectedAnswers) || [],
    goldHead: p.projection ? p.projection.goldHeadMatch : null,
  })));
if (projections.length === 0) {
  console.log('  (none)');
} else {
  for (const p of projections.slice(0, 14)) {
    const ans = p.answers.map((a) => `${a.subject ? a.subject + '+' : ''}${a.verb}`).join(',');
    console.log(`  ${p.kind.padEnd(14)} goldHead=${String(p.goldHead).padEnd(5)} contrast=${String(p.contrastive).padEnd(5)} ans=[${ans.padEnd(12)}] part=[${p.participating.join(' ')}] obstr=[${p.obstruction.join(' ')}]`);
  }
}

console.log('\nBOON BOARD');
for (const b of corpus.boons) {
  console.log(`  ${b.status.padEnd(11)} ${b.id}  n=${b.n}`);
  console.log(`    claim:     ${b.claim}`);
  console.log(`    next:      ${b.nextProbe}`);
  console.log(`    forbidden: ${b.forbidden}`);
}
if (corpus.boons.length === 0) console.log('  (none)');

console.log(`\nPURITY LAW: ${PURITY_GATE}`);
console.log('══════════════════════════════════════════════════════════════════════\n');

writeFileSync(OUT, `${JSON.stringify({
  contract: 'PB-DARK-MATTER-BEAM-v2',
  derivedFrom: 'PB-GAP-ZERO-CENSUS-v1',
  corpus: { maxTokens: MAX_TOKENS, darkSentences: dark.length },
  probes,
  effectTotals: corpus.effectTotals,
  litTypes: corpus.litTypes,
  illuminatedSentences: sentences.filter((s) => s.illuminations > 0).length,
  illuminationsTotal: corpus.illuminationsTotal,
  goldHeadIlluminations: corpus.goldHeadIlluminations,
  paths: corpus.paths,
  byFamily: corpus.byFamily,
  leftoverRefused: corpus.leftoverRefused,
  boons: corpus.boons,
  agentBrief: agentBrief(corpus),
  sentences,
}, null, 2)}\n`);
console.log(`wrote ${OUT}`);
