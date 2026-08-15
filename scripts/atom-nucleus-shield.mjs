#!/usr/bin/env node
/**
 * ATOM NUCLEUS / AURA SHIELD
 *
 * Prereg: docs/superpowers/evidence/2026-08-14-PREREG-atom-nucleus.md
 *   node scripts/atom-nucleus-shield.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT = 'docs/superpowers/evidence/2026-08-14-atom-nucleus-shield.json';

const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const baseline = JSON.parse(readFileSync(path.join(FIXTURES, 'treebank-gate-baseline.json'), 'utf8'));
const clausePos = new Map([
  ['old', ['a']], ['men', ['n']], ['ran', ['v']],
  ['round', ['n', 'v', 'a', 'r']],
]);

function nucleusCoverage(chart) {
  const nodes = chart.molecules || [];
  const sealed = nodes.filter((n) => n.nucleus && /^aura1:[0-9a-f]{8}$/.test(n.nucleus.aura));
  return { nodes: nodes.length, sealed: sealed.length };
}

function arm(name, extraOptions) {
  const started = Date.now();
  const gate = runTreebank({
    records,
    posMap,
    parser: 'packed',
    maxTokens: baseline.run.maxTokens,
    options: extraOptions,
  });
  const uranium = composePacked(
    Array.from({ length: 8 }, () => 'round'),
    clausePos,
    { roots: ['S', 'NP', 'VP'], ...extraOptions },
  );
  const clause = composePacked(['old', 'men', 'ran'], clausePos, extraOptions);
  return {
    arm: name,
    coverage: gate.report.coverage,
    containment: gate.report.containment,
    parsed: gate.rows.filter((r) => r.outcome[0] === 'P').length,
    grammarFailure: gate.report.ablation.grammar,
    droppedThrew: gate.droppedThrew,
    uraniumEvents: uranium.events,
    uraniumRecPres: uranium.reactions.recursivePreservative,
    uraniumPreservative: uranium.reactions.preservative,
    uraniumConstructive: uranium.reactions.constructive,
    uraniumNuclei: nucleusCoverage(uranium),
    clauseHasS: clause.stable.some((m) => m.type === 'S'),
    ms: Date.now() - started,
  };
}

console.log('measuring OPEN vs SHIELDED…');
const open = arm('OPEN', { disableAura: true });
const shielded = arm('SHIELDED', {});

const predictions = {
  P1: {
    hold: shielded.uraniumRecPres < open.uraniumRecPres,
    note: `rec-pres ${shielded.uraniumRecPres} < ${open.uraniumRecPres}`,
  },
  P2: {
    hold: shielded.coverage >= open.coverage - 0.05,
    note: `coverage ${shielded.coverage.toFixed(4)} vs OPEN ${open.coverage.toFixed(4)}`,
  },
  P3: {
    hold: shielded.clauseHasS === true,
    note: `old men ran S=${shielded.clauseHasS}`,
  },
  P4: {
    hold: shielded.uraniumNuclei.sealed === shielded.uraniumNuclei.nodes
      && shielded.uraniumNuclei.nodes > 0,
    note: `sealed ${shielded.uraniumNuclei.sealed}/${shielded.uraniumNuclei.nodes}`,
  },
};

const stable = Object.values(predictions).every((p) => p.hold);
const report = {
  contract: 'PB-ATOM-NUCLEUS-SHIELD-v1',
  prereg: 'docs/superpowers/evidence/2026-08-14-PREREG-atom-nucleus.md',
  open,
  shielded,
  predictions,
  stable,
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`OPEN     cov=${(open.coverage * 100).toFixed(2)}% parsed=${open.parsed} Urec=${open.uraniumRecPres} Uev=${open.uraniumEvents}`);
console.log(`SHIELDED cov=${(shielded.coverage * 100).toFixed(2)}% parsed=${shielded.parsed} Urec=${shielded.uraniumRecPres} Uev=${shielded.uraniumEvents}`);
for (const [k, v] of Object.entries(predictions)) {
  console.log(`${k} ${v.hold ? 'HOLD' : 'FAIL'}  ${v.note}`);
}
console.log(`STABLE_SILICONE=${stable}`);
console.log(`wrote ${OUT}`);
