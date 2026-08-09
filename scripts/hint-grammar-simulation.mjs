/**
 * HINT GRAMMAR SIMULATION — bonds the table implies but does not state.
 *
 * Expectation: ≥5 held-out nuclei under Result Conservation + protect floors.
 *
 * ONE CANDIDATE AT A TIME CANNOT FIND A TWO-BOND CONSTRUCTION.
 *
 * The reactor adds a single candidate to the baseline and asks whether anything
 * improved. For the second half of a paired construction the answer is *always*
 * no, and not for an empirical reason: with no bridge in the baseline, nothing
 * produces the bridge type, so the completion cannot fire once. The 2026-08-08
 * run recorded `ADJ+CONJADJ→ADJ` as NO-GAIN on exactly those grounds, promoted
 * its bridge `CONJ+ADJ→CONJADJ` alone, and shipped a dead end — a bond whose
 * product no other bond consumes, which therefore could never reach a spanning
 * `S`. Measured as a pair the two gain on both splits.
 *
 * So this run separates three verdicts that used to be one:
 *
 *   UNFIREABLE   — consumes a type the base grammar never builds. Structural.
 *   PAIRED-ONLY  — unfireable alone, but a sibling candidate supplies the type.
 *                  Re-reacted as a pair before any verdict is recorded.
 *   NO-GAIN      — fired, and nothing improved. The only honest negative.
 *
 * Usage:
 *   node scripts/hint-grammar-simulation.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { buildHintSlate } from '../codex/core/constellation/grimoire/hint-simulation.js';
import {
  measure,
  protectOk,
  improves,
  observedTypes,
  fireability,
  deadEndBonds,
} from '../codex/core/constellation/grimoire/reactor.js';
import { loadPosMap, loadSplit, EVIDENCE_DIR } from './lib/constellation-corpus.mjs';

const DATE = '2026-08-08';
const tuple = (c) => [c.left, c.right, c.result, c.head];

const posMap = loadPosMap();
const devRecs = loadSplit('dev');
const testRecs = loadSplit('test');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  HINT SIMULATION — implied but unstated bonds                ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const { candidates, liftHints } = buildHintSlate();
console.log(`  active BONDS:     ${BONDS.length}`);
console.log(`  hint candidates:  ${candidates.length}`);
console.log(`  lift hints:       ${liftHints.length}`);
console.log('\n  candidates:\n');
for (const c of candidates) {
  console.log(`    ${c.signature.padEnd(20)} h=${c.head}  ${c.hint || c.law}`);
}

console.log('\n  Observing chart types under the base grammar …');
const observed = observedTypes(devRecs, posMap, BONDS);
console.log(`  observed types: ${observed.size}`);

const fmt = (m) =>
  `cov=${(m.coverage * 100).toFixed(1)}% (${m.parsed}) root=${m.rootBuilt}`
  + ` ens=${m.goldInEnsemble} span=${(m.spanRecall * 100).toFixed(2)}%`
  + ` nsubj=${(m.nsubjRecall * 100).toFixed(2)}%`;

console.log('\n  DEV baseline …');
const devBase = measure(devRecs, posMap, BONDS);
console.log(`  ${fmt(devBase)}`);
console.log('  TEST baseline …');
const testBase = measure(testRecs, posMap, BONDS);
console.log(`  ${fmt(testBase)}`);

// ── DEV reactor: fireability first ─────────────────────────────────────────
const results = [];
console.log('\n  ── DEV reactor (single candidates) ──\n');
let i = 0;
for (const cand of candidates) {
  i += 1;
  const fire = fireability(cand, observed, candidates);
  if (!fire.fireable) {
    const structural = fire.pairedOnly ? 'PAIRED-ONLY' : 'UNFIREABLE';
    results.push({ cand, fire, dev: null, prot: null, gain: null, fate: structural });
    console.log(
      `  [${String(i).padStart(2)}/${candidates.length}] ${cand.signature.padEnd(18)}`
      + ` ${structural.padEnd(12)} missing=${fire.missing.join(',')}`,
    );
    continue;
  }
  const m = measure(devRecs, posMap, [...BONDS, tuple(cand)]);
  const prot = protectOk(devBase, m);
  const gain = improves(devBase, m);
  let fate = 'NO-GAIN';
  if (!prot.ok) {
    fate = prot.reasons.some((r) => r.includes('events') || r === 'threw') ? 'EXPLODE' : 'PROTECT-FAIL';
  } else if (gain.ok) fate = 'SURVIVE';
  results.push({ cand, fire, dev: m, prot, gain, fate });
  console.log(
    `  [${String(i).padStart(2)}/${candidates.length}] ${cand.signature.padEnd(18)} ${fate.padEnd(12)}`
    + ` Δr=${m.rootBuilt - devBase.rootBuilt} Δe=${m.goldInEnsemble - devBase.goldInEnsemble}`
    + ` Δc=${m.parsed - devBase.parsed} Δsp=${((m.spanRecall - devBase.spanRecall) * 100).toFixed(2)}`
    + (gain.ok ? `  ${gain.gains.join(',')}` : '')
    + (!prot.ok ? `  ${prot.reasons.join(',')}` : ''),
  );
}

// ── paired trials: the construction, not the half ──────────────────────────
const pairedRows = results.filter((r) => r.fate === 'PAIRED-ONLY');
const pairs = [];
if (pairedRows.length) {
  console.log('\n  ── DEV reactor (paired trials) ──\n');
  for (const row of pairedRows) {
    const suppliers = candidates.filter(
      (c) => c !== row.cand && row.fire.missing.includes(c.result),
    );
    if (!suppliers.length) continue;
    const members = [row.cand, ...suppliers];
    const label = members.map((c) => c.signature).join(' + ');
    const m = measure(devRecs, posMap, [...BONDS, ...members.map(tuple)]);
    const prot = protectOk(devBase, m);
    const gain = improves(devBase, m);
    let fate = 'NO-GAIN';
    if (!prot.ok) {
      fate = prot.reasons.some((r) => r.includes('events') || r === 'threw') ? 'EXPLODE' : 'PROTECT-FAIL';
    } else if (gain.ok) fate = 'SURVIVE';
    pairs.push({ members, label, dev: m, prot, gain, fate });
    console.log(
      `  ${label.padEnd(42)} ${fate.padEnd(12)}`
      + ` Δr=${m.rootBuilt - devBase.rootBuilt} Δe=${m.goldInEnsemble - devBase.goldInEnsemble}`
      + ` Δc=${m.parsed - devBase.parsed} Δsp=${((m.spanRecall - devBase.spanRecall) * 100).toFixed(2)}`,
    );
  }
}

const countFate = (f) => results.filter((r) => r.fate === f).length;
const devSurvivors = results.filter((r) => r.fate === 'SURVIVE');
const pairSurvivors = pairs.filter((p) => p.fate === 'SURVIVE');

console.log(
  `\n  DEV: survive=${devSurvivors.length} paired-survive=${pairSurvivors.length}`
  + ` no-gain=${countFate('NO-GAIN')} unfireable=${countFate('UNFIREABLE')}`
  + ` paired-only=${countFate('PAIRED-ONLY')}`
  + ` protect=${countFate('PROTECT-FAIL')} explode=${countFate('EXPLODE')}`,
);

// ── TEST holdout ───────────────────────────────────────────────────────────
const trials = [
  ...devSurvivors.map((r) => ({ kind: 'single', label: r.cand.signature, members: [r.cand], row: r })),
  ...pairSurvivors.map((p) => ({ kind: 'pair', label: p.label, members: p.members, row: p })),
];

const held = [];
if (trials.length) {
  console.log('\n  ── TEST holdout ──\n');
  for (const t of trials) {
    const m = measure(testRecs, posMap, [...BONDS, ...t.members.map(tuple)]);
    const prot = protectOk(testBase, m);
    const notWorse = m.rootBuilt >= testBase.rootBuilt
      && m.goldInEnsemble >= testBase.goldInEnsemble
      && m.parsed >= testBase.parsed;
    const pass = prot.ok && notWorse;
    held.push({ ...t, test: m, pass });
    console.log(
      `  ${t.label.padEnd(42)} ${pass ? 'PASS' : 'FAIL'}`
      + `  root ${testBase.rootBuilt}→${m.rootBuilt}`
      + ` ens ${testBase.goldInEnsemble}→${m.goldInEnsemble}`
      + ` cov ${testBase.parsed}→${m.parsed}`,
    );
  }
}

const nuclei = held.filter((h) => h.pass)
  .sort((a, b) => (b.row.dev.parsed - a.row.dev.parsed)
    || (b.row.dev.rootBuilt - a.row.dev.rootBuilt));

console.log('\n══ HELD-OUT NUCLEI (hint simulation) ══\n');
if (!nuclei.length) console.log('  none\n');
for (const row of nuclei) {
  console.log(`  ⚛️  ${row.label}${row.kind === 'pair' ? '   [PAIR]' : ''}`);
  console.log(
    `      DEV  cov ${devBase.parsed}→${row.row.dev.parsed} root ${devBase.rootBuilt}→${row.row.dev.rootBuilt}`
    + ` ens ${devBase.goldInEnsemble}→${row.row.dev.goldInEnsemble}`,
  );
  console.log(
    `      TEST cov ${testBase.parsed}→${row.test.parsed} root ${testBase.rootBuilt}→${row.test.rootBuilt}`
    + ` ens ${testBase.goldInEnsemble}→${row.test.goldInEnsemble}`,
  );
  console.log('');
}
console.log(`  count: ${nuclei.length}  (target ≥5: ${nuclei.length >= 5 ? 'YES' : 'NO'})\n`);

// ── promotion hazard: would promoting a survivor create a dead end? ────────
const hazards = [];
for (const row of nuclei) {
  const trial = [...BONDS, ...row.members.map(tuple)];
  const dead = deadEndBonds(trial, LIFTS).map((d) => d.signature);
  const introduced = dead.filter((s) => row.members.some((c) => c.signature === s));
  if (introduced.length) hazards.push({ label: row.label, introduced });
}
if (hazards.length) {
  console.log('  ⚠ PROMOTION HAZARD — these survivors would land as dead ends:\n');
  for (const h of hazards) console.log(`    ${h.label} → ${h.introduced.join(', ')}`);
  console.log('');
}

// ── evidence ───────────────────────────────────────────────────────────────
const md = `# Hint Grammar Simulation — ${DATE}

**Question:** Which bonds do our existing laws *hint at* but not apply?
**Prediction:** ≥5 held-out nuclei.

## Method

Pattern completion from the live BONDS / projection table:

1. Punct-absorb parity
2. Coordination parity
3. NC ports for N-laws
4. Projection extras
5. Host extensions (S+PP, S+ADV, VP+INF, …)
6. Missing construction schemas

Then fireability → DEV protect floors + gain → paired retry → TEST holdout.

## Fireability comes before gain

A candidate that consumes a type the base grammar never builds cannot fire once,
so its zero is structural, not empirical. Reporting it as \`NO-GAIN\` is how the
second half of a two-bond construction gets discarded while its first half —
which scores a cosmetic span bump — gets promoted as a dead end.

| Fate | Meaning |
|---|---|
| \`UNFIREABLE\` | consumes a type nothing in the base grammar produces |
| \`PAIRED-ONLY\` | unfireable alone, but a sibling candidate supplies the type — re-reacted as a pair |
| \`NO-GAIN\` | fired, and nothing improved (the only honest negative) |

## Candidates: ${candidates.length}

${candidates.map((c) => `- \`${c.signature}\` h=${c.head} — ${c.hint}`).join('\n')}

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | ${(devBase.coverage * 100).toFixed(1)}% (${devBase.parsed}) | ${(testBase.coverage * 100).toFixed(1)}% (${testBase.parsed}) |
| Root | ${devBase.rootBuilt} | ${testBase.rootBuilt} |
| Ensemble | ${devBase.goldInEnsemble} | ${testBase.goldInEnsemble} |
| Span / nsubj | ${(devBase.spanRecall * 100).toFixed(2)}% / ${(devBase.nsubjRecall * 100).toFixed(2)}% | ${(testBase.spanRecall * 100).toFixed(2)}% / ${(testBase.nsubjRecall * 100).toFixed(2)}% |

## DEV funnel

| Fate | n |
|---|---|
| SURVIVE (single) | ${devSurvivors.length} |
| SURVIVE (paired) | ${pairSurvivors.length} |
| NO-GAIN | ${countFate('NO-GAIN')} |
| UNFIREABLE | ${countFate('UNFIREABLE')} |
| PAIRED-ONLY (retried as pairs) | ${countFate('PAIRED-ONLY')} |
| PROTECT-FAIL | ${countFate('PROTECT-FAIL')} |
| EXPLODE | ${countFate('EXPLODE')} |

${pairs.length ? `## Paired trials

| Pair | Fate | Δcov | Δroot | Δens |
|---|---|---|---|---|
${pairs.map((p) => `| \`${p.label}\` | ${p.fate} | ${p.dev.parsed - devBase.parsed} | ${p.dev.rootBuilt - devBase.rootBuilt} | ${p.dev.goldInEnsemble - devBase.goldInEnsemble} |`).join('\n')}
` : ''}
## Held-out nuclei (${nuclei.length})

${nuclei.length === 0 ? '_None._' : nuclei.map((row, idx) => `### ${idx + 1}. \`${row.label}\`${row.kind === 'pair' ? ' **[PAIR]**' : ''}

- **hint:** ${row.members.map((c) => c.hint).filter(Boolean).join('; ') || '_n/a_'}
- DEV: cov ${devBase.parsed}→${row.row.dev.parsed} (Δ${row.row.dev.parsed - devBase.parsed}), root ${devBase.rootBuilt}→${row.row.dev.rootBuilt} (Δ${row.row.dev.rootBuilt - devBase.rootBuilt}), ens ${devBase.goldInEnsemble}→${row.row.dev.goldInEnsemble} (Δ${row.row.dev.goldInEnsemble - devBase.goldInEnsemble}), spanΔ ${((row.row.dev.spanRecall - devBase.spanRecall) * 100).toFixed(2)}pp
- TEST: cov ${testBase.parsed}→${row.test.parsed} (Δ${row.test.parsed - testBase.parsed}), root ${testBase.rootBuilt}→${row.test.rootBuilt} (Δ${row.test.rootBuilt - testBase.rootBuilt}), ens ${testBase.goldInEnsemble}→${row.test.goldInEnsemble} (Δ${row.test.goldInEnsemble - testBase.goldInEnsemble})
`).join('\n')}

## Promotion hazards

${hazards.length
    ? hazards.map((h) => `- \`${h.label}\` would land a dead end: ${h.introduced.map((s) => `\`${s}\``).join(', ')}`).join('\n')
    : '_None — no surviving nucleus would land a bond whose result type nothing consumes._'}

## Verdict

**${nuclei.length >= 5 ? `CONFIRMED — ${nuclei.length} held-out nuclei (≥5).` : `UNDER TARGET — ${nuclei.length} nuclei (wanted ≥5).`}**

These are still **empirical survivors for review**, not auto-promoted Grimoire law.
A survivor that gains but has no autopsy purity behind it is a coverage hammer;
run \`scripts/construction-autopsy.mjs\` before stamping one.

## Repro

\`\`\`bash
node scripts/hint-grammar-simulation.mjs
\`\`\`
`;

const out = path.resolve(EVIDENCE_DIR, `${DATE}-hint-grammar-simulation.md`);
writeFileSync(out, md);
console.log(`── evidence ── ${path.relative(process.cwd(), out)}\n`);
