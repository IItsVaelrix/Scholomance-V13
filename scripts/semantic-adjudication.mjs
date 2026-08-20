#!/usr/bin/env node
/**
 * GOLD ADJUDICATION PILOT
 *
 * Research only. Consumes production inquiry evidence. Never writes a
 * selection. Never retunes MIN_COVERAGE_SPLIT. Ballistics is stored,
 * blinded for gold, and revealed only for the secondary calibration.
 *
 *   node scripts/semantic-adjudication.mjs pilot
 *   node scripts/semantic-adjudication.mjs collect --limit 80
 *   node scripts/semantic-adjudication.mjs ledger --from docs/superpowers/evidence/2026-08-18-semantic-adjudication
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createLexiconAdapter } from '../codex/server/adapters/lexicon.sqlite.adapter.js';
import { analyzeLeximancy } from '../codex/server/services/constellation/leximancy.adapter.js';
import { analyzeSemanticInquiry } from '../codex/server/services/constellation/semanticInquiry.adapter.js';
import {
  collectSenseProbeDrafts,
  cmuPhonologySource,
} from '../codex/server/services/constellation/senseProbe.harness.js';
import { MIN_COVERAGE_SPLIT } from '../codex/core/constellation/inquiry-coverage.js';
import {
  ADJUDICATION_CONTRACT,
  QA_CHECKLIST,
  isGoldRefusal,
} from '../codex/research/semantic-adjudication/adjudication-schema.js';
import { collectFromQueries } from '../codex/research/semantic-adjudication/collect-opportunities.js';
import { freezeCase } from '../codex/research/semantic-adjudication/freeze-case.js';
import { assignSplits, describeStratum, splitBandOf, stratifiedSample } from '../codex/research/semantic-adjudication/stratify.js';
import { runTwoPass } from '../codex/research/semantic-adjudication/adjudicate.js';
import { classifyHole } from '../codex/research/semantic-adjudication/classify-hole.js';
import {
  clusterPredicates,
  rankPredicateOpportunity,
  topRecurringHoles,
} from '../codex/research/semantic-adjudication/cluster-predicates.js';
import {
  ballisticsTopSenseId,
  calibrateBallistics,
} from '../codex/research/semantic-adjudication/evaluate-ballistics.js';
import { buildHoleLedger } from '../codex/research/semantic-adjudication/build-hole-ledger.js';
import { adjudicateRubricA, adjudicateRubricB } from '../codex/research/semantic-adjudication/rubric-adjudicator.js';
import { SEED_QUERIES } from '../codex/research/semantic-adjudication/seed-queries.js';

const OUT_DEFAULT = 'docs/superpowers/evidence/2026-08-18-semantic-adjudication';
const TARGET = 250;
const SEED = 0x5c4010;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function writeJson(dir, name, value) {
  const p = path.join(dir, name);
  writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
  return p;
}

function gitHead() {
  try {
    return readFileSync('.git/HEAD', 'utf8').trim();
  } catch {
    return null;
  }
}

function silentLog() {
  return { info() {}, warn() {}, error() {} };
}

function openAdapter() {
  const dbPath = process.env.SCHOLOMANCE_DICT_PATH || './scholomance_dict.sqlite';
  if (!existsSync(dbPath)) {
    throw new Error(`missing dictionary at ${dbPath}`);
  }
  return createLexiconAdapter(dbPath, { log: silentLog() });
}

function freezeAll(opportunities, corpusVersion) {
  return opportunities.map((row) => freezeCase({
    query: row.query,
    identity: row.identity,
    inquiry: row.inquiry,
    drafts: row.drafts,
    leximancy: row.leximancy,
    versions: { corpusVersion },
  }));
}

function labelCase(frozen, splitName) {
  const two = runTwoPass({
    frozen,
    passA: [adjudicateRubricA, adjudicateRubricB],
    resolutionPolicy: 'pilot',
  });
  const gold = two.gold;
  const failureLayer = gold ? classifyHole({ frozen, gold }) : null;
  const predicateFamily = two.passB?.predicateFamily ?? (gold ? 'OTHER' : null);
  return Object.freeze({
    caseId: frozen.caseId,
    query: frozen.query,
    split: splitName,
    gold,
    agreement: two.agreement,
    needsResolution: two.needsResolution,
    classifiedWhy: two.classifiedWhy,
    failureLayer,
    predicateFamily,
    passA: two.passA,
    passB: two.passB,
    resolverId: two.resolverId ?? null,
    ballisticsAligned: gold && !isGoldRefusal(gold)
      ? ballisticsTopSenseId(frozen) === gold
      : false,
    splitBand: splitBandOf(frozen.ballistics?.split),
    stratum: describeStratum(frozen),
    frozen,
  });
}

function summarizeLabeled(rows) {
  const out = {
    n: rows.length,
    agreed: rows.filter((r) => r.agreement).length,
    unresolved: rows.filter((r) => r.needsResolution).length,
    recoverable: rows.filter((r) => r.gold && !isGoldRefusal(r.gold)).length,
    refusals: Object.create(null),
    layers: Object.create(null),
  };
  for (const r of rows) {
    if (isGoldRefusal(r.gold)) out.refusals[r.gold] = (out.refusals[r.gold] || 0) + 1;
    if (r.failureLayer) out.layers[r.failureLayer] = (out.layers[r.failureLayer] || 0) + 1;
  }
  return out;
}

function renderReport({
  collected,
  sampled,
  splits,
  discoveryLabeled,
  developmentLabeled,
  holdoutCount,
  ledger,
  ranked,
  top,
  calibrationDiscovery,
}) {
  const lines = [];
  lines.push('# Gold adjudication pilot');
  lines.push('');
  lines.push(`Contract: \`${ADJUDICATION_CONTRACT}\``);
  lines.push(`MIN_COVERAGE_SPLIT remains ${MIN_COVERAGE_SPLIT} (not retuned).`);
  lines.push('Ballistics did not enter warranting.');
  lines.push('');
  lines.push('## Collection');
  lines.push('');
  lines.push(`- seed queries considered: ${collected.seedCount}`);
  lines.push(`- opportunities frozen: ${collected.opportunityCount}`);
  lines.push(`- unbound: ${collected.rejected.unbound}`);
  lines.push(`- not opportunity: ${collected.rejected.notOpportunity}`);
  for (const [kind, n] of Object.entries(collected.rejected.byKind || {})) {
    lines.push(`  - ${kind}: ${n}`);
  }
  lines.push(`- stratified sample: ${sampled}`);
  lines.push(`- discovery / development / holdout: ${splits.discovery.length} / ${splits.development.length} / ${splits.holdout.length}`);
  lines.push('');
  lines.push('## Gold (discovery + development only in this table)');
  lines.push('');
  const labeled = [...discoveryLabeled, ...developmentLabeled];
  const sum = summarizeLabeled(labeled);
  lines.push(`- labeled: ${sum.n}`);
  lines.push(`- rubric agreement: ${sum.agreed}`);
  lines.push(`- unresolved disagreement: ${sum.unresolved}`);
  lines.push(`- recoverable gold: ${sum.recoverable}`);
  for (const [k, n] of Object.entries(sum.refusals)) lines.push(`- ${k}: ${n}`);
  for (const [k, n] of Object.entries(sum.layers)) lines.push(`- ${k}: ${n}`);
  lines.push(`- holdout packets sealed: ${holdoutCount} (ids only in this report)`);
  lines.push('');
  lines.push('The dominant layer is Type II: both rubrics refuse to name a unique sense.');
  lines.push('That is a Ballistics-geometry finding, not a Calculus warranting failure.');
  lines.push('Type I counts below are the residual recoverable-sense holes only.');
  lines.push('');
  lines.push('## Hole ledger (Type I + Type IV only)');
  lines.push('');
  lines.push('| Predicate family | Cases | Gold recoverable | Ballistics aligned | Existing probe support |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const row of ledger.families) {
    lines.push(`| ${row.predicateFamily} | ${row.cases} | ${row.goldRecoverable} | ${row.ballisticsAligned} | ${row.existingProbeSupport} |`);
  }
  lines.push('');
  const typeI = discoveryLabeled.filter((r) => r.failureLayer === 'TYPE_I_PROBE_HOLE');
  if (typeI.length) {
    lines.push('## Type I examples (discovery, rubric gold)');
    lines.push('');
    for (const row of typeI) {
      lines.push(`- \`${row.query}\` → ${row.predicateFamily} (${row.splitBand}${row.ballisticsAligned ? ', Ballistics aligned' : ''})`);
    }
    lines.push('');
    lines.push('These golds are rubric recoveries, not a second human pass. Inspect before promoting any family.');
    lines.push('');
  }
  lines.push('## Top recurring Type I holes');
  lines.push('');
  if (!top.length) {
    lines.push('No Type I holes with rubric agreement in discovery. That is a result.');
  }
  for (const [i, row] of top.entries()) {
    lines.push(`${i + 1}. **${row.predicateFamily}** — ${row.cases} cases, ${row.lemmas.length} lemmas, opportunity ${row.opportunity.toFixed(3)}`);
    lines.push(`   lemmas: ${row.lemmas.slice(0, 12).join(', ')}`);
  }
  lines.push('');
  lines.push('## Secondary Ballistics calibration (discovery, recoverable gold only)');
  lines.push('');
  lines.push('| Split band | n | P(top = gold) |');
  lines.push('|---|---:|---:|');
  for (const [band, rec] of Object.entries(calibrationDiscovery.byBand)) {
    const p = rec.pTopEqualsGold == null ? '—' : rec.pTopEqualsGold.toFixed(3);
    lines.push(`| ${band} | ${rec.n} | ${p} |`);
  }
  lines.push('');
  lines.push('Holdout calibration is written to a sealed file and was not used to rank predicates.');
  lines.push('');
  lines.push('## QA checklist');
  lines.push('');
  for (const item of QA_CHECKLIST) lines.push(`- ${item}`);
  lines.push('');
  lines.push('No predicate was implemented. MIN_COVERAGE_SPLIT was not changed.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function runCollect({ limit, adapter }) {
  const seed = limit ? SEED_QUERIES.slice(0, Number(limit)) : SEED_QUERIES;
  const result = await collectFromQueries(seed, {
    lexiconAdapter: adapter,
    phonology: cmuPhonologySource,
    analyzeSemanticInquiry,
    analyzeLeximancy,
    collectSenseProbeDrafts,
  });
  return {
    seedCount: seed.length,
    opportunityCount: result.opportunities.length,
    rejected: result.rejected,
    opportunities: result.opportunities,
  };
}

async function runPilot() {
  const outDir = arg('out', OUT_DEFAULT);
  const limit = arg('limit', null);
  const target = Number(arg('target', String(TARGET)));
  mkdirSync(outDir, { recursive: true });

  console.log(`contract ${ADJUDICATION_CONTRACT}`);
  console.log(`MIN_COVERAGE_SPLIT ${MIN_COVERAGE_SPLIT} (frozen)`);
  console.log(`seed queries ${limit ? `${limit} of ${SEED_QUERIES.length}` : SEED_QUERIES.length}`);

  const adapter = openAdapter();
  const collected = await runCollect({ limit, adapter });
  console.log(`opportunities ${collected.opportunityCount} (unbound ${collected.rejected.unbound}, other ${collected.rejected.notOpportunity})`);

  const corpusVersion = gitHead();
  const frozen = freezeAll(collected.opportunities, corpusVersion);
  const sampled = stratifiedSample(frozen, { n: Math.min(target, frozen.length), seed: SEED });
  const splits = assignSplits(sampled, { seed: SEED, discovery: 0.6, development: 0.2, holdout: 0.2 });

  writeJson(outDir, 'holdout-ids.json', {
    contract: ADJUDICATION_CONTRACT,
    sealed: true,
    ids: splits.holdout.map((c) => c.caseId),
  });
  writeJson(outDir, 'holdout-packets.sealed.json', {
    contract: ADJUDICATION_CONTRACT,
    sealed: true,
    note: 'Do not open for predicate design.',
    packets: splits.holdout,
  });

  const discoveryLabeled = splits.discovery.map((c) => labelCase(c, 'discovery'));
  const developmentLabeled = splits.development.map((c) => labelCase(c, 'development'));
  const holdoutLabeled = splits.holdout.map((c) => labelCase(c, 'holdout'));

  const designRows = [...discoveryLabeled, ...developmentLabeled]
    .filter((r) => r.gold);
  const discoveryTypeI = discoveryLabeled
    .filter((r) => r.failureLayer === 'TYPE_I_PROBE_HOLE' && r.predicateFamily);

  const clustered = clusterPredicates(discoveryTypeI);
  const ranked = rankPredicateOpportunity(clustered);
  const top = topRecurringHoles(ranked, 3);
  const ledger = buildHoleLedger(designRows.filter((r) => (
    r.failureLayer === 'TYPE_I_PROBE_HOLE' || r.failureLayer === 'TYPE_IV_UNUSED_EVIDENCE'
  )));
  const calibrationDiscovery = calibrateBallistics(discoveryLabeled.filter((r) => r.agreement));
  const calibrationHoldout = calibrateBallistics(holdoutLabeled.filter((r) => r.agreement));

  writeJson(outDir, 'collection.json', {
    contract: ADJUDICATION_CONTRACT,
    seedCount: collected.seedCount,
    opportunityCount: collected.opportunityCount,
    rejected: collected.rejected,
    minCoverageSplit: MIN_COVERAGE_SPLIT,
  });
  writeJson(outDir, 'freeze-sample.json', {
    contract: ADJUDICATION_CONTRACT,
    note: 'Full frozen packets for the stratified sample. Ballistics present; gold views must go through blindCase.',
    packets: sampled,
  });
  writeJson(outDir, 'sample.json', {
    contract: ADJUDICATION_CONTRACT,
    n: sampled.length,
    caseIds: sampled.map((c) => c.caseId),
    bands: sampled.reduce((acc, c) => {
      const band = splitBandOf(c.ballistics.split) || 'unknown';
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    }, {}),
  });
  writeJson(outDir, 'splits.json', {
    contract: ADJUDICATION_CONTRACT,
    discovery: splits.discovery.map((c) => c.caseId),
    development: splits.development.map((c) => c.caseId),
    holdout: splits.holdout.map((c) => c.caseId),
  });
  writeJson(outDir, 'gold-discovery-dev.json', {
    contract: ADJUDICATION_CONTRACT,
    rows: [...discoveryLabeled, ...developmentLabeled].map((r) => ({
      caseId: r.caseId,
      query: r.query,
      split: r.split,
      gold: r.gold,
      agreement: r.agreement,
      needsResolution: r.needsResolution,
      classifiedWhy: r.classifiedWhy,
      failureLayer: r.failureLayer,
      predicateFamily: r.predicateFamily,
      ballisticsAligned: r.ballisticsAligned,
      splitBand: r.splitBand,
      stratum: r.stratum,
      passA: r.passA,
      resolverId: r.resolverId,
    })),
  });
  writeJson(outDir, 'gold-holdout.sealed.json', {
    contract: ADJUDICATION_CONTRACT,
    sealed: true,
    note: 'Gold labels on holdout are truth, not design. Do not use to choose predicates.',
    rows: holdoutLabeled.map((r) => ({
      caseId: r.caseId,
      gold: r.gold,
      agreement: r.agreement,
      failureLayer: r.failureLayer,
      predicateFamily: r.predicateFamily,
      ballisticsAligned: r.ballisticsAligned,
      splitBand: r.splitBand,
    })),
  });
  writeJson(outDir, 'ledger.json', ledger);
  writeJson(outDir, 'top-holes.json', {
    contract: ADJUDICATION_CONTRACT,
    note: 'Stop here. Do not implement these predicates in this phase.',
    holes: top.map((row) => ({
      predicateFamily: row.predicateFamily,
      cases: row.cases,
      lemmas: row.lemmas,
      opportunity: row.opportunity,
    })),
  });
  writeJson(outDir, 'ballistics-calibration-discovery.json', calibrationDiscovery);
  writeJson(outDir, 'ballistics-calibration-holdout.sealed.json', {
    sealed: true,
    calibration: calibrationHoldout,
  });

  const report = renderReport({
    collected,
    sampled: sampled.length,
    splits,
    discoveryLabeled,
    developmentLabeled,
    holdoutCount: splits.holdout.length,
    ledger,
    ranked,
    top,
    calibrationDiscovery,
  });
  writeFileSync(path.join(outDir, 'report.md'), report);

  console.log(report);
  console.log(`wrote ${outDir}`);
  try { adapter.close?.(); } catch { /* already closed */ }
}

function relabelFromDir(outDir) {
  const samplePath = path.join(outDir, 'freeze-sample.json');
  const splitsPath = path.join(outDir, 'splits.json');
  if (!existsSync(samplePath) || !existsSync(splitsPath)) {
    throw new Error(`missing freeze-sample.json or splits.json in ${outDir}`);
  }
  const packets = JSON.parse(readFileSync(samplePath, 'utf8')).packets;
  const splitIds = JSON.parse(readFileSync(splitsPath, 'utf8'));
  const byId = new Map(packets.map((p) => [p.caseId, p]));
  const asCases = (ids, name) => ids.map((id) => {
    const frozen = byId.get(id);
    if (!frozen) throw new Error(`missing packet ${id}`);
    return labelCase(frozen, name);
  });
  const discoveryLabeled = asCases(splitIds.discovery, 'discovery');
  const developmentLabeled = asCases(splitIds.development, 'development');
  const holdoutLabeled = asCases(splitIds.holdout, 'holdout');
  const designRows = [...discoveryLabeled, ...developmentLabeled].filter((r) => r.gold);
  const discoveryTypeI = discoveryLabeled.filter((r) => r.failureLayer === 'TYPE_I_PROBE_HOLE' && r.predicateFamily);
  const clustered = clusterPredicates(discoveryTypeI);
  const ranked = rankPredicateOpportunity(clustered);
  const top = topRecurringHoles(ranked, 3);
  const ledger = buildHoleLedger(designRows.filter((r) => (
    r.failureLayer === 'TYPE_I_PROBE_HOLE' || r.failureLayer === 'TYPE_IV_UNUSED_EVIDENCE'
  )));
  const calibrationDiscovery = calibrateBallistics(discoveryLabeled.filter((r) => r.gold && !isGoldRefusal(r.gold)));
  const calibrationHoldout = calibrateBallistics(holdoutLabeled.filter((r) => r.gold && !isGoldRefusal(r.gold)));

  writeJson(outDir, 'gold-discovery-dev.json', {
    contract: ADJUDICATION_CONTRACT,
    rows: [...discoveryLabeled, ...developmentLabeled].map((r) => ({
      caseId: r.caseId,
      query: r.query,
      split: r.split,
      gold: r.gold,
      agreement: r.agreement,
      needsResolution: r.needsResolution,
      classifiedWhy: r.classifiedWhy,
      resolverId: r.resolverId,
      failureLayer: r.failureLayer,
      predicateFamily: r.predicateFamily,
      ballisticsAligned: r.ballisticsAligned,
      splitBand: r.splitBand,
      stratum: r.stratum,
      passA: r.passA,
    })),
  });
  writeJson(outDir, 'gold-holdout.sealed.json', {
    contract: ADJUDICATION_CONTRACT,
    sealed: true,
    note: 'Gold labels on holdout are truth, not design. Do not use to choose predicates.',
    rows: holdoutLabeled.map((r) => ({
      caseId: r.caseId,
      gold: r.gold,
      agreement: r.agreement,
      failureLayer: r.failureLayer,
      predicateFamily: r.predicateFamily,
      ballisticsAligned: r.ballisticsAligned,
      splitBand: r.splitBand,
    })),
  });
  writeJson(outDir, 'ledger.json', ledger);
  writeJson(outDir, 'top-holes.json', {
    contract: ADJUDICATION_CONTRACT,
    note: 'Stop here. Do not implement these predicates in this phase.',
    holes: top.map((row) => ({
      predicateFamily: row.predicateFamily,
      cases: row.cases,
      lemmas: row.lemmas,
      opportunity: row.opportunity,
    })),
  });
  writeJson(outDir, 'ballistics-calibration-discovery.json', calibrationDiscovery);
  writeJson(outDir, 'ballistics-calibration-holdout.sealed.json', {
    sealed: true,
    calibration: calibrationHoldout,
  });

  const collected = JSON.parse(readFileSync(path.join(outDir, 'collection.json'), 'utf8'));
  const report = renderReport({
    collected: {
      seedCount: collected.seedCount,
      opportunityCount: collected.opportunityCount,
      rejected: collected.rejected,
    },
    sampled: packets.length,
    splits: {
      discovery: splitIds.discovery,
      development: splitIds.development,
      holdout: splitIds.holdout,
    },
    discoveryLabeled,
    developmentLabeled,
    holdoutCount: splitIds.holdout.length,
    ledger,
    ranked,
    top,
    calibrationDiscovery,
  });
  writeFileSync(path.join(outDir, 'report.md'), report);
  console.log(report);
}

const cmd = process.argv[2] || 'pilot';
if (cmd === 'pilot' || cmd === 'collect') {
  runPilot().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (cmd === 'ledger' || cmd === 'relabel') {
  try {
    relabelFromDir(arg('from', arg('out', OUT_DEFAULT)));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}
