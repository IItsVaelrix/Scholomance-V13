/**
 * REACTOR — Result-Conservation-legal extras only.
 *
 * Candidates = synthesizeByProjection() − ACTIVE_CONSTRUCTIONS
 * (C already derived; no free-C isotopes.)
 *
 * Same protect floors + held-out protocol as extra-bond-reactor.mjs.
 *
 * Usage:
 *   node scripts/conservation-legal-reactor.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import { ACTIVE_CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import { synthesizeByProjection } from '../codex/core/constellation/grimoire/projection-laws.js';
import { measure, protectOk, improves } from '../codex/core/constellation/grimoire/reactor.js';
import { loadPosMap, loadSplit, ROOT } from './lib/constellation-corpus.mjs';

const posMap = loadPosMap();
const goldSigs = new Set(
  ACTIVE_CONSTRUCTIONS.map((c) => `${c.left}|${c.right}|${c.result}`),
);
const candidates = synthesizeByProjection().filter((c) => !goldSigs.has(c.signature));

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  CONSERVATION-LEGAL REACTOR                                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  candidates (projection extras only): ${candidates.length}`);
for (const c of candidates) {
  console.log(`    ${c.signature}  h=${c.head}  ${c.law}`);
}

const devRecs = loadSplit('dev');
const testRecs = loadSplit('test');

console.log('\n  DEV baseline …');
const devBase = measure(devRecs, posMap, BONDS);
console.log(
  `  cov=${(devBase.coverage * 100).toFixed(1)}% root=${devBase.rootBuilt}`
  + ` ens=${devBase.goldInEnsemble} span=${(devBase.spanRecall * 100).toFixed(2)}%`
  + ` nsubj=${(devBase.nsubjRecall * 100).toFixed(2)}% events̄=${devBase.meanEvents.toFixed(1)}`,
);

console.log('  TEST baseline …');
const testBase = measure(testRecs, posMap, BONDS);
console.log(
  `  cov=${(testBase.coverage * 100).toFixed(1)}% root=${testBase.rootBuilt}`
  + ` ens=${testBase.goldInEnsemble} span=${(testBase.spanRecall * 100).toFixed(2)}%`
  + ` nsubj=${(testBase.nsubjRecall * 100).toFixed(2)}% events̄=${testBase.meanEvents.toFixed(1)}`,
);

const rows = [];
console.log('\n  ── DEV collisions ──\n');
for (const cand of candidates) {
  const bonds = [...BONDS, [cand.left, cand.right, cand.result, cand.head]];
  const m = measure(devRecs, posMap, bonds);
  const prot = protectOk(devBase, m);
  const gain = improves(devBase, m);
  let fate = 'NO-GAIN';
  if (!prot.ok) {
    fate = prot.reasons.some((r) => r.includes('Events') || r === 'threw')
      ? 'EXPLODE'
      : 'PROTECT-FAIL';
  } else if (gain.ok) {
    fate = 'SURVIVE';
  }
  rows.push({ cand, dev: m, prot, gain, fate });
  console.log(
    `  ${cand.signature.padEnd(18)} h=${cand.head}  ${fate}`
    + (gain.ok ? `  ${gain.gains.join(',')}` : '')
    + (!prot.ok ? `  ${prot.reasons[0]}` : ''),
  );
  console.log(
    `    Δroot=${m.rootBuilt - devBase.rootBuilt}`
    + ` Δens=${m.goldInEnsemble - devBase.goldInEnsemble}`
    + ` Δcov=${m.parsed - devBase.parsed}`
    + ` Δspan=${((m.spanRecall - devBase.spanRecall) * 100).toFixed(2)}pp`
    + ` events̄=${m.meanEvents.toFixed(1)}`,
  );
}

const devSurvivors = rows.filter((r) => r.fate === 'SURVIVE');
console.log(`\n  DEV survivors: ${devSurvivors.length}/${candidates.length}`);

const held = [];
if (devSurvivors.length) {
  console.log('\n  ── TEST collisions ──\n');
  for (const row of devSurvivors) {
    const cand = row.cand;
    const bonds = [...BONDS, [cand.left, cand.right, cand.result, cand.head]];
    const m = measure(testRecs, posMap, bonds);
    const prot = protectOk(testBase, m);
    const notWorse = m.rootBuilt >= testBase.rootBuilt
      && m.goldInEnsemble >= testBase.goldInEnsemble
      && m.parsed >= testBase.parsed;
    const pass = prot.ok && notWorse;
    held.push({ ...row, test: m, testProtect: prot, pass });
    console.log(
      `  ${cand.signature.padEnd(18)} ${pass ? 'PASS' : 'FAIL'}`
      + `  root ${testBase.rootBuilt}→${m.rootBuilt}`
      + ` ens ${testBase.goldInEnsemble}→${m.goldInEnsemble}`
      + ` cov ${testBase.parsed}→${m.parsed}`,
    );
    if (!pass) {
      console.log(`    ${!prot.ok ? prot.reasons.join('; ') : 'regressed vs test baseline'}`);
    }
  }
}

const nuclei = held.filter((h) => h.pass);
console.log('\n══ SYNTHESIZED NUCLEI (held-out) ══\n');
if (!nuclei.length) {
  console.log('  none\n');
} else {
  for (const row of nuclei) {
    const c = row.cand;
    console.log(`  ⚛️  ${c.signature}  head=${c.head}  ${c.law}`);
    console.log(
      `      DEV  root ${devBase.rootBuilt}→${row.dev.rootBuilt}`
      + ` ens ${devBase.goldInEnsemble}→${row.dev.goldInEnsemble}`
      + ` cov ${devBase.parsed}→${row.dev.parsed}`,
    );
    console.log(
      `      TEST root ${testBase.rootBuilt}→${row.test.rootBuilt}`
      + ` ens ${testBase.goldInEnsemble}→${row.test.goldInEnsemble}`
      + ` cov ${testBase.parsed}→${row.test.parsed}`,
    );
    console.log('');
  }
}

// Linguistic note AFTER measurement (protocol)
const notes = {
  'COP|VP|VP':
    'Projection-legal auxiliary path; chart currently omits this (deprecated cop-vp-mislabel). '
    + 'Be already emits AUX, so AUX+VP covers progressive/passive — this extra is largely redundant.',
  'PP|PUNCT|PP':
    'Punct-absorb on PP: seatbelt for prepositional fragments with terminal marks. '
    + 'Symmetric to S+PUNCT / NP+PUNCT already in the chart.',
  'VP|PUNCT|VP':
    'Punct-absorb on VP: seatbelt for bare/imperative VP roots with terminal marks before S lift.',
};

const md = `# Conservation-Legal Reactor — 2026-08-08

**Candidates:** only \`synthesizeByProjection() − ACTIVE_CONSTRUCTIONS\`  
**Count:** ${candidates.length} (not the free-C 78)

## Candidates

${candidates.map((c) => `- \\\`${c.signature}\\\` head=${c.head} — ${c.law}`).join('\n')}

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | ${(devBase.coverage * 100).toFixed(1)}% (${devBase.parsed}) | ${(testBase.coverage * 100).toFixed(1)}% (${testBase.parsed}) |
| Root | ${devBase.rootBuilt} | ${testBase.rootBuilt} |
| Ensemble | ${devBase.goldInEnsemble} | ${testBase.goldInEnsemble} |
| Span / nsubj | ${(devBase.spanRecall * 100).toFixed(2)}% / ${(devBase.nsubjRecall * 100).toFixed(2)}% | ${(testBase.spanRecall * 100).toFixed(2)}% / ${(testBase.nsubjRecall * 100).toFixed(2)}% |
| Mean events | ${devBase.meanEvents.toFixed(1)} | ${testBase.meanEvents.toFixed(1)} |

## DEV outcomes

| Signature | Fate | Δroot | Δens | Δcov | Δspan pp |
|---|---|---|---|---|---|
${rows.map((r) => {
    const m = r.dev;
    return `| \\\`${r.cand.signature}\\\` | ${r.fate} | ${m.rootBuilt - devBase.rootBuilt} | ${m.goldInEnsemble - devBase.goldInEnsemble} | ${m.parsed - devBase.parsed} | ${((m.spanRecall - devBase.spanRecall) * 100).toFixed(2)} |`;
  }).join('\n')}

## Held-out

| Signature | Result |
|---|---|
${held.length === 0 ? '| _(no DEV survivors)_ | |' : held.map((r) =>
    `| \\\`${r.cand.signature}\\\` | ${r.pass ? '**PASS**' : 'FAIL'} |`).join('\n')}

## Synthesized nuclei

${nuclei.length === 0 ? '_None._' : nuclei.map((r) => {
    const c = r.cand;
    const note = notes[c.signature] || '';
    return `### \\\`${c.signature}\\\`

- head=${c.head}, law=${c.law}
- DEV: root ${devBase.rootBuilt}→${r.dev.rootBuilt}, ens ${devBase.goldInEnsemble}→${r.dev.goldInEnsemble}, cov ${devBase.parsed}→${r.dev.parsed}
- TEST: root ${testBase.rootBuilt}→${r.test.rootBuilt}, ens ${testBase.goldInEnsemble}→${r.test.goldInEnsemble}, cov ${testBase.parsed}→${r.test.parsed}
${note ? `\n_${note}_\n` : ''}`;
  }).join('\n')}

## Verdict

${nuclei.length === 0
    ? 'No conservation-legal extra survived as a productive held-out nucleus. Projection physics already saturates the active chart for these pairs; remaining gains are elsewhere (closure families, not free result types).'
    : `${nuclei.length} held-out nucleus/nuclei under Result Conservation + protect floors. Inspect theory before Grimoire promotion.`}

## Repro

\`\`\`bash
node scripts/conservation-legal-reactor.mjs
\`\`\`
`;

const outPath = path.resolve(ROOT, 'docs/superpowers/evidence/2026-08-08-conservation-legal-reactor.md');
writeFileSync(outPath, md);
console.log(`\n── evidence ──\n   ${outPath}\n`);
console.log(`══ COUNT ══  held-out nuclei: ${nuclei.length}\n`);
