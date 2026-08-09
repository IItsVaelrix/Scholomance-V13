/**
 * GAP-TARGETED GRAMMAR SIMULATION
 *
 * 1. Mine coverage-gap adjacent pairs (no spanning S)
 * 2. Propose bonds only via Result Conservation or named gap constructions
 * 3. Blind reactor: DEV protect + gain + PURITY → TEST holdout
 * 4. Report synthesized nuclei for Grimoire review (do not auto-merge)
 *
 * WHY THERE IS A PURITY GATE AND A CONTROL ARM
 *
 * The 2026-08-08 run put 16 of 17 candidates through the gain gate — 94%
 * survival, 0 protect failures, 0 explosions — and the construction autopsy then
 * refused the top four. On a 22%-covered chart, "adding a glue law raises
 * coverage or root" is close to a tautology, so `improves()` alone is not a
 * filter. It never was; nothing in the run could have shown that.
 *
 * Two additions make the funnel mean something:
 *
 *   PURITY — of the firings that materially produced the gain, what share sit on
 *     a real gold edge, and do they sit on the *same* edge?
 *     purity = licensed share × Simpson concentration.
 *
 *   CONTROLS — type-shuffled bonds with no grammatical motivation, reacted
 *     through the identical gate. Their purity distribution *is* the bar. A
 *     threshold nobody derived from a control is a number someone picked.
 *
 * Usage:
 *   node scripts/gap-grammar-simulation.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { buildGapSimulationSlate } from '../codex/core/constellation/grimoire/gap-simulation.js';
import { autopsyBond } from '../codex/core/constellation/grimoire/construction-families.js';
import {
  measure,
  protectOk,
  improves,
  observedTypes,
  fireability,
  shuffledControls,
  percentile,
  productiveTypes,
} from '../codex/core/constellation/grimoire/reactor.js';
import { loadPosMap, loadSplit, EVIDENCE_DIR } from './lib/constellation-corpus.mjs';

const DATE = '2026-08-08';
const CONTROL_COUNT = 24;
const CONTROL_SEED = 20260808;
/** A candidate must clear this percentile of the control purity distribution. */
const CONTROL_BAR_PCT = 0.95;

const num = (x) => (x == null ? 'n/a' : x.toFixed(3));
const pct = (x) => (x == null ? 'n/a' : `${(100 * x).toFixed(1)}%`);

// ── main ───────────────────────────────────────────────────────────────────
const posMap = loadPosMap();
const devRecs = loadSplit('dev');
const testRecs = loadSplit('test');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  GAP GRAMMAR SIMULATION — coverage-targeted discovery        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('  Mining coverage-gap adjacent pairs (DEV, unparsed only) …');
const slate = buildGapSimulationSlate(devRecs, posMap, { topPairs: 50, minCount: 8 });
console.log(`  unlicensed gap pair types (top): ${slate.gaps.length}`);
console.log(`  pairs with no proposal:         ${slate.rejectedPairs.length}`);
console.log(`  candidates to react:            ${slate.candidates.length}\n`);

console.log('  Top gap pairs:\n');
for (const g of slate.gaps.slice(0, 15)) {
  console.log(`    ${String(g.n).padStart(4)}  ${g.pair.padEnd(14)}  ${(g.examples[0] || '').slice(0, 55)}`);
}

const bondSig = new Set(BONDS.map((b) => `${b[0]}|${b[1]}|${b[2]}`));
const real = slate.candidates.filter((c) => !bondSig.has(c.signature));
console.log(`\n  after removing existing BONDS: ${real.length} to collide`);

// ── control arm ────────────────────────────────────────────────────────────
console.log('  Observing chart types under the base grammar …');
const observed = observedTypes(devRecs, posMap, BONDS);
const exclude = new Set([
  ...BONDS.map((b) => `${b[0]}|${b[1]}|${b[2]}|${b[3]}`),
  ...real.map((c) => `${c.left}|${c.right}|${c.result}|${c.head}`),
]);
const productive = productiveTypes(BONDS, LIFTS);
const controls = shuffledControls([...observed], exclude, {
  count: CONTROL_COUNT,
  seed: CONTROL_SEED,
  // Results restricted to productive types so a control has the same chance of
  // scoring coverage as a candidate — otherwise the gate flatters itself.
  resultTypes: [...productive],
});
console.log(
  `  observed types: ${observed.size}   productive types: ${productive.size}`
  + `   shuffled controls: ${controls.length}\n`,
);

const toReact = [...real, ...controls];

console.log('  DEV baseline …');
const devBase = measure(devRecs, posMap, BONDS);
const fmt = (m) =>
  `cov=${(m.coverage * 100).toFixed(1)}% (${m.parsed}) root=${m.rootBuilt} ens=${m.goldInEnsemble}`
  + ` span=${(m.spanRecall * 100).toFixed(2)}% nsubj=${(m.nsubjRecall * 100).toFixed(2)}%`
  + ` events̄=${m.meanEvents.toFixed(1)}`;
console.log(`  ${fmt(devBase)}`);
console.log('  TEST baseline …');
const testBase = measure(testRecs, posMap, BONDS);
console.log(`  ${fmt(testBase)}`);

// Abort budget = the events floor itself, so an aborted trial is one the floor
// would have rejected anyway. Saves minutes per chart-detonating candidate.
const devEventsBudget = devBase.meanEvents * 1.5 * devRecs.length;
const testEventsBudget = testBase.meanEvents * 1.5 * testRecs.length;
console.log(`  events budget: DEV ${Math.round(devEventsBudget).toLocaleString()}`
  + `  TEST ${Math.round(testEventsBudget).toLocaleString()}`);

// ── DEV reactor: fireability → protect → gain → purity ─────────────────────
const results = [];
const baseCharts = new Map();
console.log('\n  ── DEV reactor ──\n');
let i = 0;
for (const cand of toReact) {
  i += 1;
  // Siblings are drawn from the candidate's own arm — a control must not be
  // rescued by a real proposal, nor a real proposal by a control.
  const fire = fireability(cand, observed, cand.control ? controls : real);
  let fate;
  let m = null;
  let prot = null;
  let gain = null;
  let autopsy = null;

  if (!fire.fireable) {
    fate = 'UNFIREABLE';
  } else {
    const bonds = [...BONDS, [cand.left, cand.right, cand.result, cand.head]];
    m = measure(devRecs, posMap, bonds, { eventsBudget: devEventsBudget });
    prot = protectOk(devBase, m);
    gain = improves(devBase, m);
    if (!prot.ok) {
      fate = prot.reasons.some((r) => r.includes('events') || r === 'threw')
        ? 'EXPLODE' : 'PROTECT-FAIL';
      gain = null; // an aborted sweep has no comparable metrics
    } else if (!gain.ok) {
      fate = 'NO-GAIN';
    } else {
      fate = 'GAINED'; // purity verdict assigned after the control bar exists
    }
  }

  const tag = cand.control ? 'ctrl' : 'cand';
  const line = `  [${String(i).padStart(2)}/${toReact.length}] ${tag} ${cand.signature.padEnd(18)}`
    + ` ${fate.padEnd(12)}`
    + (!m
      ? ` missing=${fire.missing.join(',')}${fire.pairedOnly ? ' (paired-only)' : ''}`
      : m.budgetExceeded
        ? ' aborted past the events floor'
        : ` Δr=${m.rootBuilt - devBase.rootBuilt}`
          + ` Δe=${m.goldInEnsemble - devBase.goldInEnsemble}`
          + ` Δc=${m.parsed - devBase.parsed}`
          + ` Δsp=${((m.spanRecall - devBase.spanRecall) * 100).toFixed(2)}`)
    + (prot && !prot.ok ? `  ${prot.reasons.join(',')}` : '');

  if (fate === 'GAINED') {
    process.stdout.write(`${line}  autopsy…`);
    autopsy = autopsyBond(cand, devRecs, posMap, BONDS, { baseCharts });
    console.log(` purity=${num(autopsy.purity)} (${autopsy.firingsOnGains} firings)`);
  } else {
    console.log(line);
  }

  results.push({ cand, fire, dev: m, prot, gain, autopsy, fate });
}

// ── the bar comes from the controls, not from a chosen constant ────────────
const controlRows = results.filter((r) => r.cand.control);
const candRows = results.filter((r) => !r.cand.control);
const controlPurities = controlRows
  .filter((r) => r.autopsy?.purity != null)
  .map((r) => r.autopsy.purity);
const purityBar = percentile(controlPurities, CONTROL_BAR_PCT);
const controlMax = controlPurities.length ? Math.max(...controlPurities) : null;

for (const r of results) {
  if (r.fate !== 'GAINED') continue;
  if (r.autopsy?.purity == null) { r.fate = 'NO-FIRINGS'; continue; }
  if (purityBar == null) { r.fate = 'SURVIVE'; continue; }
  r.fate = r.autopsy.purity > purityBar ? 'SURVIVE' : 'GAIN-IMPURE';
}

const fatesOf = (rows) => {
  const m = new Map();
  for (const r of rows) m.set(r.fate, (m.get(r.fate) || 0) + 1);
  return m;
};
const candFates = fatesOf(candRows);
const ctrlFates = fatesOf(controlRows);
const rate = (m, total) => (total ? (m.get('SURVIVE') || 0) / total : 0);

// Vacuity check: what the OLD gain-only gate would have passed.
const gainOnly = (rows) => rows.filter(
  (r) => r.gain?.ok && r.prot?.ok,
).length;

console.log('\n  ── funnel ──\n');
console.log(`                       candidates(${candRows.length})   controls(${controlRows.length})`);
for (const f of ['UNFIREABLE', 'EXPLODE', 'PROTECT-FAIL', 'NO-GAIN', 'NO-FIRINGS', 'GAIN-IMPURE', 'SURVIVE']) {
  console.log(`    ${f.padEnd(14)} ${String(candFates.get(f) || 0).padStart(10)}${String(ctrlFates.get(f) || 0).padStart(14)}`);
}
console.log(
  `\n  gain-only gate would pass: candidates ${gainOnly(candRows)}/${candRows.length}`
  + ` (${(100 * gainOnly(candRows) / Math.max(candRows.length, 1)).toFixed(0)}%),`
  + ` controls ${gainOnly(controlRows)}/${controlRows.length}`
  + ` (${(100 * gainOnly(controlRows) / Math.max(controlRows.length, 1)).toFixed(0)}%)`,
);
console.log(
  `  purity bar (p${CONTROL_BAR_PCT * 100} of ${controlPurities.length} scored controls): ${num(purityBar)}`
  + `   control max: ${num(controlMax)}`,
);
console.log(
  `  after purity:              candidates ${(100 * rate(candFates, candRows.length)).toFixed(0)}%,`
  + ` controls ${(100 * rate(ctrlFates, controlRows.length)).toFixed(0)}%`,
);

// ── TEST holdout ───────────────────────────────────────────────────────────
const devSurvivors = candRows.filter((r) => r.fate === 'SURVIVE');
const held = [];
if (devSurvivors.length) {
  console.log('\n  ── TEST holdout ──\n');
  for (const row of devSurvivors) {
    const c = row.cand;
    const bonds = [...BONDS, [c.left, c.right, c.result, c.head]];
    const m = measure(testRecs, posMap, bonds, { eventsBudget: testEventsBudget });
    const prot = protectOk(testBase, m);
    const notWorse = m.rootBuilt >= testBase.rootBuilt
      && m.goldInEnsemble >= testBase.goldInEnsemble
      && m.parsed >= testBase.parsed;
    const pass = prot.ok && notWorse;
    held.push({ ...row, test: m, testProtect: prot, pass });
    console.log(
      `  ${c.signature.padEnd(18)} ${pass ? 'PASS' : 'FAIL '}`
      + `  root ${testBase.rootBuilt}→${m.rootBuilt}`
      + ` ens ${testBase.goldInEnsemble}→${m.goldInEnsemble}`
      + ` cov ${testBase.parsed}→${m.parsed}`
      + (!pass ? `  ${!prot.ok ? prot.reasons.join(',') : 'regress'}` : ''),
    );
  }
}

const nuclei = held.filter((h) => h.pass);
console.log(`\n══ SYNTHESIZED NUCLEI ══  ${nuclei.length}\n`);
for (const row of nuclei) {
  const c = row.cand;
  console.log(`  ⚛️  ${c.signature}  head=${c.head}  purity=${num(row.autopsy.purity)}`);
  console.log(`      ${c.law || ''}  status=${c.status || '?'}  dominant=${row.autopsy.dominant}`);
  console.log('');
}

// ── evidence ───────────────────────────────────────────────────────────────
const fateRow = (r) => {
  const a = r.autopsy;
  const scored = r.dev && !r.dev.budgetExceeded;
  return `| \`${r.cand.signature}\` | ${r.cand.head} | ${r.fate} `
    + `| ${scored ? r.dev.parsed - devBase.parsed : '—'} `
    + `| ${scored ? r.dev.rootBuilt - devBase.rootBuilt : '—'} `
    + `| ${scored ? r.dev.goldInEnsemble - devBase.goldInEnsemble : '—'} `
    + `| ${a ? pct(a.licensedShare) : '—'} | ${a ? num(a.concentration) : '—'} `
    + `| ${a ? num(a.purity) : '—'} | ${a?.dominant || '—'} |`;
};

const md = `# Gap Grammar Simulation — ${DATE}

**Goal:** Discover new grammatical chemical laws targeting **coverage** gaps.
**Method:** Mine unlicensed adjacent pairs on unparsed DEV sentences → propose only
via Result Conservation or named gap constructions → blind DEV/TEST reactor with a
**purity gate calibrated by a shuffled control arm**.

## Pipeline

\`\`\`
coverage failures
    → unlicensed adjacent maximal pairs
    → propose (projection | named gap construction)
    → fireability (can it fire at all?)
    → DEV protect floors + gain
    → autopsy purity  vs  shuffled-control bar
    → TEST holdout
    → nuclei (for human Grimoire review — not auto-merged)
\`\`\`

## Why a control arm

The gain gate cannot fail. On a ${(devBase.coverage * 100).toFixed(0)}%-covered chart
almost any adjacency law raises root or coverage, so a funnel reporting
"SURVIVE 16 / NO-GAIN 1" was reporting the sparsity of the chart, not the merit of
the candidates. ${controls.length} type-shuffled bonds — drawn from the same type
inventory, with no grammatical motivation whatsoever — are reacted through the
identical gate. **Their scores are the bar.**

| Gate | Candidates passing | Controls passing |
|---|---|---|
| gain only (protect floors + any metric up) | ${gainOnly(candRows)}/${candRows.length} (${(100 * gainOnly(candRows) / Math.max(candRows.length, 1)).toFixed(0)}%) | ${gainOnly(controlRows)}/${controlRows.length} (${(100 * gainOnly(controlRows) / Math.max(controlRows.length, 1)).toFixed(0)}%) |
| gain + purity > control p${CONTROL_BAR_PCT * 100} | ${candFates.get('SURVIVE') || 0}/${candRows.length} (${(100 * rate(candFates, candRows.length)).toFixed(0)}%) | ${ctrlFates.get('SURVIVE') || 0}/${controlRows.length} (${(100 * rate(ctrlFates, controlRows.length)).toFixed(0)}%) |

If the two columns of a row are close, that row's gate is not measuring grammar.

## Purity

\`purity = licensed share × Simpson concentration\`, computed over the firings that
**materially** produced coverage gain (no spanning S without the bond, spanning S
with it).

- **licensed share** — fraction of firings with a real gold dependency edge
  crossing the bond. A bond that invents constituents scores low here.
- **concentration** — Σpᵢ² over licensed families. A bond that joins a different
  relation every time scores low here, even when every firing is licensed.

| | |
|---|---|
| Controls with a measurable purity | ${controlPurities.length} / ${controls.length} |
| Control purity p${CONTROL_BAR_PCT * 100} (**the bar**) | **${num(purityBar)}** |
| Control purity max | ${num(controlMax)} |

## Gap mining (DEV, no spanning S)

Top unlicensed pairs:

| Count | Pair |
|---|---|
${slate.gaps.slice(0, 20).map((g) => `| ${g.n} | \`${g.pair}\` |`).join('\n')}

Pairs with no legal proposal: ${slate.rejectedPairs.length}

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | ${(devBase.coverage * 100).toFixed(1)}% (${devBase.parsed}) | ${(testBase.coverage * 100).toFixed(1)}% (${testBase.parsed}) |
| Root | ${devBase.rootBuilt} | ${testBase.rootBuilt} |
| Ensemble | ${devBase.goldInEnsemble} | ${testBase.goldInEnsemble} |
| Span / nsubj | ${(devBase.spanRecall * 100).toFixed(2)}% / ${(devBase.nsubjRecall * 100).toFixed(2)}% | ${(testBase.spanRecall * 100).toFixed(2)}% / ${(testBase.nsubjRecall * 100).toFixed(2)}% |

## DEV funnel

| Fate | Candidates | Controls |
|---|---|---|
${['UNFIREABLE', 'EXPLODE', 'PROTECT-FAIL', 'NO-GAIN', 'NO-FIRINGS', 'GAIN-IMPURE', 'SURVIVE']
    .map((f) => `| ${f} | ${candFates.get(f) || 0} | ${ctrlFates.get(f) || 0} |`).join('\n')}

\`UNFIREABLE\` means the candidate consumes a type the base grammar never builds,
so it could not fire once. That is a structural fact, not an empirical NO-GAIN —
and it is how the second half of a two-bond construction gets discarded.

## Candidates

| Bond | head | Fate | Δcov | Δroot | Δens | Licensed | Conc. | Purity | Dominant |
|---|---|---|---|---|---|---|---|---|---|
${candRows.map(fateRow).join('\n')}

## Controls (shuffled, seed ${CONTROL_SEED})

| Bond | head | Fate | Δcov | Δroot | Δens | Licensed | Conc. | Purity | Dominant |
|---|---|---|---|---|---|---|---|---|---|
${controlRows.map(fateRow).join('\n')}

## Held-out nuclei

${nuclei.length === 0 ? '_None._' : nuclei.map((row) => {
    const c = row.cand;
    const a = row.autopsy;
    return `### \`${c.signature}\` head=${c.head}

- law: ${c.law}
- status proposal: ${c.status || 'approximation'}
- rationale: ${c.rationale || '_n/a_'}
- gap count (unparsed adjacency): ${c.gapCount || 0}
- **purity ${num(a.purity)}** (licensed ${pct(a.licensedShare)} × concentration ${num(a.concentration)}), dominant family **${a.dominant}** (${pct(a.dominantShare)})
- DEV: cov ${devBase.parsed}→${row.dev.parsed} (Δ${row.dev.parsed - devBase.parsed}), root ${devBase.rootBuilt}→${row.dev.rootBuilt}, ens ${devBase.goldInEnsemble}→${row.dev.goldInEnsemble}, spanΔ ${((row.dev.spanRecall - devBase.spanRecall) * 100).toFixed(2)}pp
- TEST: cov ${testBase.parsed}→${row.test.parsed} (Δ${row.test.parsed - testBase.parsed}), root ${testBase.rootBuilt}→${row.test.rootBuilt}, ens ${testBase.goldInEnsemble}→${row.test.goldInEnsemble}, spanΔ ${((row.test.spanRecall - testBase.spanRecall) * 100).toFixed(2)}pp
`;
  }).join('\n')}

## DEV survivors that failed TEST

${held.filter((h) => !h.pass).map((h) =>
    `- \`${h.cand.signature}\` — ${!h.testProtect.ok ? h.testProtect.reasons.join(',') : 'regressed'}`).join('\n') || '_none_'}

## Interpretation

Nuclei here are **empirical survivors**, not Grimoire law until stamped. Purity
above the control bar means the bond's gain sits on real, consistent gold edges —
it does not mean the head convention, the status, or the name is right. Run
\`scripts/construction-autopsy.mjs\` on a survivor before promoting it, and
\`scripts/bond-ablation.mjs\` on it afterwards.

## Repro

\`\`\`bash
node scripts/gap-grammar-simulation.mjs
\`\`\`
`;

const out = path.resolve(EVIDENCE_DIR, `${DATE}-gap-grammar-simulation.md`);
writeFileSync(out, md);
console.log(`── evidence ── ${path.relative(process.cwd(), out)}\n`);
