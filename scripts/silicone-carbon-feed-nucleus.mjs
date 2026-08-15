#!/usr/bin/env node
/**
 * SILICONE FEED, REPLAYED UNDER NUCLEUS / AURA
 *
 * Same four Grimoire tables as silicone-carbon-feed.mjs. This time every
 * atom has a nucleus and silicone bonds consult the aura fingerprint.
 * FULL and OVERFEED also run with the barrier off so coverage/stability
 * can be compared to the unshielded feed.
 *
 *   node scripts/silicone-carbon-feed-nucleus.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import { GAP_CONSTRUCTION_PROPOSALS } from '../codex/core/constellation/grimoire/gap-simulation.js';
import { feedBondTables } from '../codex/core/constellation/element-phase.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT_JSON = 'docs/superpowers/evidence/2026-08-14-silicone-carbon-feed-nucleus.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-14-silicone-carbon-feed-nucleus.md';

const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const baseline = JSON.parse(readFileSync(path.join(FIXTURES, 'treebank-gate-baseline.json'), 'utf8'));
const tables = feedBondTables(CONSTRUCTIONS, GAP_CONSTRUCTION_PROPOSALS);
const uraniumPos = new Map([['round', ['n', 'v', 'a', 'r']]]);
const clausePos = new Map([['old', ['a']], ['men', ['n']], ['ran', ['v']]]);

function nucleusCoverage(chart) {
  const nodes = chart.molecules || [];
  const sealed = nodes.filter((n) => n.nucleus && /^aura1:[0-9a-f]{8}$/.test(n.nucleus.aura));
  return { nodes: nodes.length, sealed: sealed.length };
}

function runArm(name, bonds, extra = {}) {
  const started = Date.now();
  const run = runTreebank({
    records,
    posMap,
    senseMap: null,
    parser: 'packed',
    maxTokens: baseline.run.maxTokens,
    options: { bonds, ...extra },
  });
  const uranium = composePacked(
    Array.from({ length: 8 }, () => 'round'),
    uraniumPos,
    { bonds, roots: ['S', 'NP', 'VP'], ...extra },
  );
  const clause = composePacked(['old', 'men', 'ran'], clausePos, { bonds, ...extra });
  return {
    arm: name,
    aura: extra.disableAura ? 'open' : 'shielded',
    bonds: bonds.length,
    coverage: run.report.coverage,
    containment: run.report.containment,
    parsed: run.rows.filter((row) => row.outcome[0] === 'P').length,
    grammarFailure: run.report.ablation.grammar,
    droppedThrew: run.droppedThrew,
    uraniumEvents: uranium.events,
    uraniumRecursivePreservative: uranium.reactions.recursivePreservative,
    uraniumPreservative: uranium.reactions.preservative,
    uraniumConstructive: uranium.reactions.constructive,
    uraniumSealed: nucleusCoverage(uranium),
    clauseHasS: clause.stable.some((m) => m.type === 'S'),
    ms: Date.now() - started,
  };
}

console.log('replaying silicone feed under nucleus/aura…');

const arms = [
  runArm('CARBON_ONLY', tables.CARBON_ONLY),
  runArm('GRADUATED', tables.GRADUATED),
  runArm('FULL', tables.FULL),
  runArm('OVERFEED', tables.OVERFEED),
  runArm('FULL_OPEN', tables.FULL, { disableAura: true }),
  runArm('OVERFEED_OPEN', tables.OVERFEED, { disableAura: true }),
];

const by = Object.fromEntries(arms.map((a) => [a.arm, a]));
const full = by.FULL;
const fullOpen = by.FULL_OPEN;
const over = by.OVERFEED;
const overOpen = by.OVERFEED_OPEN;

const predictions = {
  P_COVERAGE: {
    hold: full.coverage >= fullOpen.coverage - 0.01 && full.parsed >= fullOpen.parsed - 2,
    note: `FULL shielded ${(full.coverage * 100).toFixed(2)}% / ${full.parsed} vs open ${(fullOpen.coverage * 100).toFixed(2)}% / ${fullOpen.parsed}`,
  },
  P_STABILITY: {
    hold: full.uraniumRecursivePreservative < fullOpen.uraniumRecursivePreservative,
    note: `FULL rec-pres ${full.uraniumRecursivePreservative} < open ${fullOpen.uraniumRecursivePreservative}`,
  },
  P_CLAUSE: {
    hold: full.clauseHasS === true,
    note: `old men ran S=${full.clauseHasS}`,
  },
  P_NUCLEUS: {
    hold: full.uraniumSealed.sealed === full.uraniumSealed.nodes && full.uraniumSealed.nodes > 0,
    note: `sealed ${full.uraniumSealed.sealed}/${full.uraniumSealed.nodes}`,
  },
  P_OVERFEED_STABLE: {
    hold: over.uraniumRecursivePreservative < overOpen.uraniumRecursivePreservative,
    note: `OVERFEED rec-pres ${over.uraniumRecursivePreservative} < open ${overOpen.uraniumRecursivePreservative}; cov ${(over.coverage * 100).toFixed(2)}% vs open ${(overOpen.coverage * 100).toFixed(2)}%`,
  },
};

const pass = Object.values(predictions).every((p) => p.hold);
const report = { contract: 'PB-SILICONE-CARBON-FEED-NUCLEUS-v1', arms, predictions, pass };
writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

const line = (a) => `| ${a.arm} | ${a.aura} | ${a.bonds} | ${(a.coverage * 100).toFixed(2)}% | ${(a.containment * 100).toFixed(2)}% | ${a.parsed} | ${a.uraniumEvents} | ${a.uraniumRecursivePreservative} | ${a.clauseHasS} |`;

const md = `# RESULT — Silicone feed replayed under nucleus / aura

Same four Grimoire tables as the unshielded feed. Every atom now carries a
nucleus; silicone bonds consult the aura fingerprint.

Machine: \`${OUT_JSON}\`
Repro: \`node scripts/silicone-carbon-feed-nucleus.mjs\`

| Arm | Aura | Bonds | Coverage | Containment | Parsed | U events | U rec-pres | old men ran |
|---|---|---|---|---|---|---|---|---|
${arms.map(line).join('\n')}

## Predictions

| # | Hold | Note |
|---|---|---|
${Object.entries(predictions).map(([k, v]) => `| ${k} | ${v.hold ? 'yes' : 'NO'} | ${v.note} |`).join('\n')}

**Coverage and stability together: ${pass ? 'YES' : 'NO'}**
`;

writeFileSync(OUT_MD, md);
console.log(md);
for (const [k, v] of Object.entries(predictions)) {
  console.log(`${k} ${v.hold ? 'HOLD' : 'FAIL'}  ${v.note}`);
}
console.log(`PASS=${pass}`);
console.log(`wrote ${OUT_JSON}`);
