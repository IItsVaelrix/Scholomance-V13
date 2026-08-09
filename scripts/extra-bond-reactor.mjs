/**
 * BLIND REACTOR — score every synthesizer EXTRA against protect floors.
 *
 * Do not hand-pick. Each candidate that is NOT already in ACTIVE_CONSTRUCTIONS
 * is collided on DEV. Survivors are re-collided on TEST. Only then inspect.
 *
 * Usage:
 *   node scripts/extra-bond-reactor.mjs
 *
 * Protect floors (relative to baseline, absolute rates):
 *   local contiguous span recall  ≥ baseline − 0.5 pp
 *   nsubj span recall             ≥ baseline − 0.5 pp
 *   mean events / sentence        ≤ baseline × 1.50
 *   max events on any sentence    ≤ max(baselineMax × 2, baselineMax + 5000)
 *
 * Survival (must also improve something real on DEV):
 *   root-span count ↑ OR gold-in-ensemble count ↑ OR coverage count ↑
 *   (at least +1 absolute on the improved metric)
 *
 * Held-out: same protect floors vs TEST baseline; must not reverse the gain
 * (root/ensemble/coverage not below test baseline).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import { ACTIVE_CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import { synthesizeBonds } from '../codex/core/constellation/grimoire/bond-synthesizer.js';
import { measure, protectOk, improves } from '../codex/core/constellation/grimoire/reactor.js';
import { loadPosMap, loadSplit, ROOT } from './lib/constellation-corpus.mjs';

// ── main ───────────────────────────────────────────────────────────────────
const posMap = loadPosMap();
const goldSigs = new Set(
  ACTIVE_CONSTRUCTIONS.map((c) => `${c.left}|${c.right}|${c.result}`),
);
const extras = synthesizeBonds({ mode: 'full' }).filter((c) => !goldSigs.has(c.signature));

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  EXTRA-BOND REACTOR — blind stability screen                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  extras to collide: ${extras.length}`);
console.log(`  baseline BONDS:    ${BONDS.length}`);

const devRecs = loadSplit('dev');
const testRecs = loadSplit('test');

console.log('\n  measuring DEV baseline …');
const devBase = measure(devRecs, posMap, BONDS);
console.log(
  `  DEV base: cov=${(devBase.coverage * 100).toFixed(1)}% root=${devBase.rootBuilt}`
  + ` ens=${devBase.goldInEnsemble} span=${(devBase.spanRecall * 100).toFixed(1)}%`
  + ` nsubj=${(devBase.nsubjRecall * 100).toFixed(1)}% events̄=${devBase.meanEvents.toFixed(1)}`,
);

console.log('  measuring TEST baseline …');
const testBase = measure(testRecs, posMap, BONDS);
console.log(
  `  TEST base: cov=${(testBase.coverage * 100).toFixed(1)}% root=${testBase.rootBuilt}`
  + ` ens=${testBase.goldInEnsemble} span=${(testBase.spanRecall * 100).toFixed(1)}%`
  + ` nsubj=${(testBase.nsubjRecall * 100).toFixed(1)}% events̄=${testBase.meanEvents.toFixed(1)}`,
);

const died = [];
const exploded = [];
const noGain = [];
const devSurvivors = [];

console.log('\n  ── DEV collisions ──\n');
let i = 0;
for (const cand of extras) {
  i += 1;
  const trialBonds = [...BONDS, [cand.left, cand.right, cand.result, cand.head]];
  const m = measure(devRecs, posMap, trialBonds);
  const prot = protectOk(devBase, m);
  const gain = improves(devBase, m);

  const row = {
    candidate: cand,
    dev: m,
    protect: prot,
    gain,
  };

  process.stdout.write(
    `  [${String(i).padStart(2)}/${extras.length}] ${cand.signature.padEnd(22)} h=${cand.head}  `,
  );

  if (!prot.ok) {
    const boom = prot.reasons.some((r) => r.startsWith('meanEvents') || r.startsWith('maxEvents') || r === 'threw');
    if (boom) {
      exploded.push(row);
      console.log('EXPLODE/DIE', prot.reasons[0]);
    } else {
      died.push(row);
      console.log('PROTECT-FAIL', prot.reasons[0]);
    }
    continue;
  }
  if (!gain.ok) {
    noGain.push(row);
    console.log('NO-GAIN');
    continue;
  }
  devSurvivors.push(row);
  console.log('SURVIVE', gain.gains.join(','));
}

console.log(`\n  DEV summary: survive=${devSurvivors.length} no-gain=${noGain.length}`
  + ` protect-fail=${died.length} explode=${exploded.length}`);

// Held-out
const heldOutPass = [];
const heldOutFail = [];

if (devSurvivors.length > 0) {
  console.log('\n  ── TEST collisions (DEV survivors only) ──\n');
  for (const row of devSurvivors) {
    const cand = row.candidate;
    const trialBonds = [...BONDS, [cand.left, cand.right, cand.result, cand.head]];
    const m = measure(testRecs, posMap, trialBonds);
    const prot = protectOk(testBase, m);
    // Must not lose absolute root/ensemble/coverage vs test baseline
    const notWorse = m.rootBuilt >= testBase.rootBuilt
      && m.goldInEnsemble >= testBase.goldInEnsemble
      && m.parsed >= testBase.parsed;
    const pass = prot.ok && notWorse;
    const out = { ...row, test: m, testProtect: prot, testNotWorse: notWorse, heldOutPass: pass };
    process.stdout.write(`  ${cand.signature.padEnd(22)}  `);
    if (pass) {
      heldOutPass.push(out);
      console.log(
        'PASS',
        `root ${testBase.rootBuilt}→${m.rootBuilt}`,
        `ens ${testBase.goldInEnsemble}→${m.goldInEnsemble}`,
        `cov ${testBase.parsed}→${m.parsed}`,
      );
    } else {
      heldOutFail.push(out);
      console.log(
        'FAIL',
        !prot.ok ? prot.reasons[0] : 'regressed vs test baseline',
      );
    }
  }
}

console.log('\n══ HELD-OUT SURVIVORS (synthesized nuclei) ══\n');
if (heldOutPass.length === 0) {
  console.log('  (none)\n');
} else {
  for (const row of heldOutPass) {
    const c = row.candidate;
    console.log(`  ⚛️  ${c.signature}  head=${c.head}  law=${c.law}`);
    console.log(
      `      DEV  root ${devBase.rootBuilt}→${row.dev.rootBuilt}`
      + ` ens ${devBase.goldInEnsemble}→${row.dev.goldInEnsemble}`
      + ` cov ${devBase.parsed}→${row.dev.parsed}`
      + ` spanΔ ${((row.dev.spanRecall - devBase.spanRecall) * 100).toFixed(2)}pp`,
    );
    console.log(
      `      TEST root ${testBase.rootBuilt}→${row.test.rootBuilt}`
      + ` ens ${testBase.goldInEnsemble}→${row.test.goldInEnsemble}`
      + ` cov ${testBase.parsed}→${row.test.parsed}`
      + ` spanΔ ${((row.test.spanRecall - testBase.spanRecall) * 100).toFixed(2)}pp`,
    );
    console.log('');
  }
}

// Write evidence WITHOUT linguistic interpretation of losers beyond counts
const md = `# Extra-Bond Reactor — Blind Screen — 2026-08-08

**Protocol:** all synthesizer extras (not in ACTIVE_CONSTRUCTIONS) collided on DEV;
survivors re-collided on TEST. No hand-picking.

**Candidates:** ${extras.length}  
**Baseline BONDS:** ${BONDS.length}

## Protect floors

- contiguous span recall ≥ baseline − 0.5 pp  
- nsubj span recall ≥ baseline − 0.5 pp  
- mean events ≤ 1.5 × baseline  
- max events ≤ max(2× baseline max, baseline max + 5000)  

## Survival on DEV

Must pass protect **and** improve at least one of: rootBuilt, goldInEnsemble, parsed (absolute +1).

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | ${(devBase.coverage * 100).toFixed(1)}% (${devBase.parsed}/${devBase.n}) | ${(testBase.coverage * 100).toFixed(1)}% (${testBase.parsed}/${testBase.n}) |
| Root built | ${devBase.rootBuilt} | ${testBase.rootBuilt} |
| Gold-in-ensemble | ${devBase.goldInEnsemble}/${devBase.scoreable} | ${testBase.goldInEnsemble}/${testBase.scoreable} |
| Span recall | ${(devBase.spanRecall * 100).toFixed(2)}% | ${(testBase.spanRecall * 100).toFixed(2)}% |
| nsubj recall | ${(devBase.nsubjRecall * 100).toFixed(2)}% | ${(testBase.nsubjRecall * 100).toFixed(2)}% |
| Mean events | ${devBase.meanEvents.toFixed(1)} | ${testBase.meanEvents.toFixed(1)} |

## DEV funnel

| Bucket | n |
|---|---|
| Input extras | ${extras.length} |
| Protect fail (non-explosion) | ${died.length} |
| Explode / throw | ${exploded.length} |
| No gain | ${noGain.length} |
| **DEV survivors** | **${devSurvivors.length}** |
| Held-out FAIL | ${heldOutFail.length} |
| **Held-out PASS (synthesized nuclei)** | **${heldOutPass.length}** |

## Held-out survivors

${heldOutPass.length === 0 ? '_None._\n' : heldOutPass.map((row) => {
    const c = row.candidate;
    return `### \\\`${c.signature}\\\` head=${c.head}

- law: ${c.law}
- DEV: root ${devBase.rootBuilt}→${row.dev.rootBuilt}, ens ${devBase.goldInEnsemble}→${row.dev.goldInEnsemble}, cov ${devBase.parsed}→${row.dev.parsed}
- TEST: root ${testBase.rootBuilt}→${row.test.rootBuilt}, ens ${testBase.goldInEnsemble}→${row.test.goldInEnsemble}, cov ${testBase.parsed}→${row.test.parsed}
`;
  }).join('\n')}

## DEV survivors that failed TEST

${heldOutFail.length === 0 ? '_None._\n' : heldOutFail.map((row) =>
    `- \\\`${row.candidate.signature}\\\` — ${!row.testProtect.ok ? row.testProtect.reasons.join('; ') : 'regressed vs test baseline'}`).join('\n')}

## Top DEV gains among protect-pass (whether or not held-out)

${devSurvivors.slice().sort((a, b) =>
    (b.dev.rootBuilt - devBase.rootBuilt) - (a.dev.rootBuilt - devBase.rootBuilt)
    || (b.dev.goldInEnsemble - devBase.goldInEnsemble) - (a.dev.goldInEnsemble - devBase.goldInEnsemble),
  ).slice(0, 15).map((row) =>
    `- \\\`${row.candidate.signature}\\\` rootΔ=${row.dev.rootBuilt - devBase.rootBuilt} ensΔ=${row.dev.goldInEnsemble - devBase.goldInEnsemble} covΔ=${row.dev.parsed - devBase.parsed}`,
  ).join('\n') || '_none_'}

## Protocol note

Linguistic interpretation of survivors belongs **after** this table, not before.
Do not promote to Grimoire without a status stamp and a second human review of theory.

## Repro

\`\`\`bash
node scripts/extra-bond-reactor.mjs
\`\`\`
`;

const outPath = path.resolve(ROOT, 'docs/superpowers/evidence/2026-08-08-extra-bond-reactor.md');
writeFileSync(outPath, md);
console.log(`\n── evidence ──\n   ${outPath}\n`);
console.log(`══ COUNT ══  held-out synthesized nuclei: ${heldOutPass.length}\n`);
