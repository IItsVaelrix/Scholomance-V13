#!/usr/bin/env node
/**
 * SILICONE GRADUATED INTO CARBON, FEEDING THE GRIMOIRE
 *
 * Sandbox only. The standing constitution is not edited.
 * Prereg: docs/superpowers/evidence/2026-08-14-PREREG-silicone-carbon-feed.md
 *
 *   node scripts/silicone-carbon-feed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import { GAP_CONSTRUCTION_PROPOSALS } from '../codex/core/constellation/grimoire/gap-simulation.js';
import { mayClaimLinguisticFact } from '../codex/core/constellation/grimoire/schemas.js';
import {
  classifyConstruction,
  asCarbonAxiom,
  becomesCarbonAxiom,
  graduationQueue,
  feedBondTables,
  ELEMENT_PHASE,
} from '../codex/core/constellation/element-phase.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT_JSON = 'docs/superpowers/evidence/2026-08-14-silicone-carbon-feed.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-14-silicone-carbon-feed.md';

const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const baseline = JSON.parse(readFileSync(path.join(FIXTURES, 'treebank-gate-baseline.json'), 'utf8'));

const queue = graduationQueue(CONSTRUCTIONS);
const tables = feedBondTables(CONSTRUCTIONS, GAP_CONSTRUCTION_PROPOSALS);

const ontologyBefore = CONSTRUCTIONS.filter(mayClaimLinguisticFact).length;
const ontologyAfter = CONSTRUCTIONS.map((c) => (
  becomesCarbonAxiom(c) ? asCarbonAxiom(c) : c
)).filter(mayClaimLinguisticFact).length;

function runArm(name, bonds) {
  const started = Date.now();
  const run = runTreebank({
    records,
    posMap,
    senseMap: null,
    parser: 'packed',
    maxTokens: baseline.run.maxTokens,
    options: { bonds },
  });
  const uranium = composePacked(
    Array.from({ length: 8 }, () => 'round'),
    new Map([['round', ['n', 'v', 'a', 'r']]]),
    { bonds, roots: ['S', 'NP', 'VP'] },
  );
  return {
    arm: name,
    bonds: bonds.length,
    coverage: run.report.coverage,
    containment: run.report.containment,
    parsedBoth: run.report.ablation.bothFine,
    vagueOnly: run.report.ablation.overGenerated,
    taggingFailure: run.report.ablation.tagging,
    grammarFailure: run.report.ablation.grammar,
    parsed: run.rows.filter((row) => row.outcome[0] === 'P').length,
    analyzed: run.report.n,
    droppedThrew: run.droppedThrew,
    uraniumEvents: uranium.events,
    uraniumDerivations: uranium.molecules.reduce((n, m) => n + m.derivations.length, 0),
    uraniumRecursivePreservative: uranium.reactions.recursivePreservative,
    uraniumPreservative: uranium.reactions.preservative,
    uraniumConstructive: uranium.reactions.constructive,
    ms: Date.now() - started,
  };
}

console.log('feeding sandboxed Grimoire tables…');
const arms = [
  runArm('CARBON_ONLY', tables.CARBON_ONLY),
  runArm('GRADUATED', tables.GRADUATED),
  runArm('FULL', tables.FULL),
  runArm('OVERFEED', tables.OVERFEED),
];

const byName = Object.fromEntries(arms.map((a) => [a.arm, a]));
const full = byName.FULL;
const carbonOnly = byName.CARBON_ONLY;
const graduated = byName.GRADUATED;
const overfeed = byName.OVERFEED;

const pp = (a, b) => (a - b) * 100;
const parsedDelta = (a, b) => a.parsed - b.parsed;

const predictions = {
  P0: {
    hold: ontologyAfter > ontologyBefore && full.bonds === tables.FULL.length,
    note: `ontology ${ontologyBefore} → ${ontologyAfter}; FULL bonds=${full.bonds}`,
  },
  P1: {
    hold: pp(full.coverage, carbonOnly.coverage) >= 5
      || parsedDelta(full, carbonOnly) >= 15,
    note: `coverage ${carbonOnly.coverage.toFixed(4)} vs FULL ${full.coverage.toFixed(4)}; parsed ${carbonOnly.parsed} vs ${full.parsed}`,
  },
  P2: {
    hold: graduated.coverage > carbonOnly.coverage && graduated.coverage < full.coverage,
    note: `GRADUATED ${graduated.coverage.toFixed(4)} in (${carbonOnly.coverage.toFixed(4)}, ${full.coverage.toFixed(4)})`,
  },
  P3: {
    hold: overfeed.coverage >= full.coverage
      && overfeed.uraniumEvents >= full.uraniumEvents
      && overfeed.uraniumRecursivePreservative >= full.uraniumRecursivePreservative,
    note: `OVERFEED cov=${overfeed.coverage.toFixed(4)} ev=${overfeed.uraniumEvents} recPres=${overfeed.uraniumRecursivePreservative} vs FULL ${full.coverage.toFixed(4)} / ${full.uraniumEvents} / ${full.uraniumRecursivePreservative}`,
  },
  P4: {
    hold: carbonOnly.uraniumEvents < full.uraniumEvents
      && overfeed.uraniumEvents >= full.uraniumEvents,
    note: `uranium events C=${carbonOnly.uraniumEvents} F=${full.uraniumEvents} O=${overfeed.uraniumEvents}`,
  },
};

const promote = predictions.P2.hold
  && graduated.coverage >= full.coverage - 0.01
  && overfeed.uraniumRecursivePreservative <= full.uraniumRecursivePreservative
  && predictions.P0.hold;

const report = {
  contract: 'PB-SILICONE-CARBON-FEED-v1',
  prereg: 'docs/superpowers/evidence/2026-08-14-PREREG-silicone-carbon-feed.md',
  queue: queue.map((c) => ({
    id: c.id,
    status: c.status,
    signature: `${c.left}+${c.right}->${c.result}`,
    phaseBefore: classifyConstruction(c),
    phaseAfter: classifyConstruction(asCarbonAxiom(c)),
  })),
  ontology: { before: ontologyBefore, after: ontologyAfter },
  tableSizes: {
    CARBON_ONLY: tables.CARBON_ONLY.length,
    GRADUATED: tables.GRADUATED.length,
    FULL: tables.FULL.length,
    OVERFEED: tables.OVERFEED.length,
  },
  arms,
  predictions,
  promote,
};

writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

const line = (a) => `| ${a.arm} | ${a.bonds} | ${(a.coverage * 100).toFixed(2)}% | ${(a.containment * 100).toFixed(2)}% | ${a.parsed} | ${a.grammarFailure} | ${a.uraniumEvents} | ${a.uraniumRecursivePreservative} | ${a.droppedThrew} |`;

const md = `# RESULT — Silicone graduated into carbon, feeding the Grimoire

Prereg: \`docs/superpowers/evidence/2026-08-14-PREREG-silicone-carbon-feed.md\`
Machine: \`${OUT_JSON}\`
Repro: \`node scripts/silicone-carbon-feed.mjs\`

The standing Grimoire was not edited. Each arm is a sandboxed \`options.bonds\`.

## Graduation queue

${queue.length} silicone constructions become carbon if \`status\` is stamped \`grammar\`:

${queue.map((c) => `- \`${c.left}+${c.right}→${c.result}\` (\`${c.id}\`, was \`${c.status}\`)`).join('\n')}

Ontology (linguistic-fact claims): **${ontologyBefore} → ${ontologyAfter}**.

## Treebank gate + uranium probe

| Arm | Bonds | Coverage | Containment | Parsed | Grammar fail | U events | U rec-pres | Threw |
|---|---|---|---|---|---|---|---|---|
${arms.map(line).join('\n')}

FULL is today's constitution. CARBON-ONLY is the 11 axioms alone. GRADUATED is those axioms plus the queue. OVERFEED is FULL plus unlicensed gap proposals admitted as if they were grammar.

## Predictions

| # | Hold | Note |
|---|---|---|
${Object.entries(predictions).map(([k, v]) => `| ${k} | ${v.hold ? 'yes' : 'NO'} | ${v.note} |`).join('\n')}

## Promotion bar (prereg)

GRADUATED coverage within 1pp of FULL, OVERFEED does not raise uranium recursive-preservative firings, P0 holds.

**Promote the queue into the standing Grimoire: ${promote ? 'YES' : 'NO'}**
`;

writeFileSync(OUT_MD, md);

console.log(md);
for (const [k, v] of Object.entries(predictions)) {
  console.log(`${k} ${v.hold ? 'HOLD' : 'FAIL'}  ${v.note}`);
}
console.log(`PROMOTE=${promote}`);
console.log(`wrote ${OUT_JSON}`);
