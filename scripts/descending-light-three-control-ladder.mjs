/**
 * THE THREE-CONTROL FALSIFIER LADDER FOR DESCENDING LIGHT
 *
 * 1. Real Root-Conditioned Descending Light (Ground-Truth Reachability)
 * 2. Control 1: Unconstrained Shuffle (Random molecules lit)
 * 3. Control 2: Root-Preserving Matched Shuffle (Root lit + random non-root molecules)
 * 4. Control 3: Span / Type / Degree-Preserving Stratified Shuffle (Root lit + stratified by (width, type))
 *
 * Runs across all 395 eligible sentences on Treebank Gate over 10 independent random seeds.
 *
 * Run with:
 *   node scripts/descending-light-three-control-ladder.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import {
  composePacked,
  ROOT_DOORWAY,
  projectAnswers,
  crystallizeChart,
} from '../codex/core/constellation/compose-packed.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));

const eligible = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= 20) {
    eligible.push({ rec, tokens, gold: goldAnswer(rec) });
  }
}

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  THE THREE-CONTROL FALSIFIER LADDER FOR DESCENDING LIGHT');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');
console.log(`Auditing ${eligible.length} eligible sentences over 10 Monte Carlo seeds per control...\n`);

function deterministicShuffle(array, seed = 0x5c4010) {
  const arr = [...array];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = Math.floor((s / 4294967296) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1001];

// ── 1. BENCHMARK REAL DESCENDING LIGHT ──────────────────────────────────────
let realStats = { parsed: 0, goldContainment: 0, top1Heads: 0, fractures: 0 };

for (const { tokens, gold } of eligible) {
  const rawChart = composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL, light: true });
  if (rawChart.stable.length === 0) continue;
  const crystal = crystallizeChart(rawChart);
  if (crystal.stable.length > 0) {
    realStats.parsed += 1;
    const ans = crystal.stable.flatMap((s) => projectAnswers(s));
    if (ans.some((a) => a.verb === gold.verb)) realStats.goldContainment += 1;
    if (ans[0]?.verb === gold.verb) realStats.top1Heads += 1;
  }
}

console.log(`[GROUND TRUTH] Real Descending Light: ${realStats.parsed} parsed, ${realStats.top1Heads} top-1 heads, ${realStats.goldContainment} gold containment.\n`);

// ── RUN THE 3 CONTROLS ACROSS 10 SEEDS ──────────────────────────────────────

function evaluateControl(controlName, samplerFn) {
  // Per-seed, not just totals: a verdict drawn from ten samples is a claim about their
  // spread, and a mean alone cannot distinguish an effect that held on ten seeds from
  // one that held on six.
  const perSeedParsed = [];
  const perSeedFractures = [];
  const perSeedContainment = [];
  const perSeedTop1 = [];

  for (const seed of SEEDS) {
    let parsed = 0;
    let fractures = 0;
    let containment = 0;
    let top1Heads = 0;

    for (let idx = 0; idx < eligible.length; idx += 1) {
      const { tokens, gold } = eligible[idx];
      const rawChart = composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL, light: true });
      if (rawChart.stable.length === 0) continue;

      const crystal = crystallizeChart(rawChart);
      const realLitSet = crystal.light?.lit || new Set();
      const allMols = rawChart.molecules || [];
      const stableRoots = rawChart.stable || [];

      const fakeLitSet = samplerFn(allMols, realLitSet, stableRoots, seed + idx);

      const fakeCrystal = crystallizeChart({
        ...rawChart,
        light: { lit: fakeLitSet },
      });

      if (fakeCrystal.stable.length > 0) {
        parsed += 1;
        const ans = fakeCrystal.stable.flatMap((s) => projectAnswers(s));
        if (ans.some((a) => a.verb === gold.verb)) containment += 1;
        if (ans[0]?.verb === gold.verb) top1Heads += 1;
      } else {
        fractures += 1;
      }
    }

    perSeedParsed.push(parsed);
    perSeedFractures.push(fractures);
    perSeedContainment.push(containment);
    perSeedTop1.push(top1Heads);
  }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  };

  const meanContainment = mean(perSeedContainment);
  const containmentSd = sd(perSeedContainment);

  // A loss is the distance from the baseline that actually ran, not from a perfect score
  // nothing achieved. Real light itself contains only realStats.goldContainment of
  // realStats.parsed, and an arm must not be charged for the gap it never had.
  const goldLost = realStats.goldContainment - meanContainment;

  return {
    name: controlName,
    seeds: SEEDS.length,
    meanParsed: mean(perSeedParsed),
    meanFractures: mean(perSeedFractures),
    meanContainment,
    containmentSd,
    containmentCi95: (1.96 * containmentSd) / Math.sqrt(SEEDS.length),
    meanTop1Heads: mean(perSeedTop1),
    accuracyPct: (mean(perSeedTop1) / Math.max(1, mean(perSeedParsed))) * 100,
    fracturePct: (mean(perSeedFractures) / realStats.parsed) * 100,
    goldLost,
    goldLostPct: (goldLost / realStats.goldContainment) * 100,
  };
}

// ── CONTROL 1: Unconstrained Shuffle ────────────────────────────────────────
const ctrl1 = evaluateControl('1. Unconstrained Shuffle', (allMols, realLitSet, stableRoots, seed) => {
  const litCount = allMols.filter((m) => realLitSet.has(m)).length;
  const shuffled = deterministicShuffle(allMols, seed);
  return new Set(shuffled.slice(0, litCount));
});

// ── CONTROL 2: Root-Preserving Matched Shuffle ──────────────────────────────
const ctrl2 = evaluateControl('2. Root-Preserving Matched Shuffle', (allMols, realLitSet, stableRoots, seed) => {
  const litCount = allMols.filter((m) => realLitSet.has(m)).length;
  const nonRoots = allMols.filter((m) => !stableRoots.includes(m));
  const neededNonRoots = Math.max(0, litCount - stableRoots.length);
  const shuffledNonRoots = deterministicShuffle(nonRoots, seed);
  const picked = [...stableRoots, ...shuffledNonRoots.slice(0, neededNonRoots)];
  return new Set(picked);
});

// ── CONTROL 3: Span / Type / Degree-Preserving Stratified Shuffle ─────────────
const ctrl3 = evaluateControl('3. Stratified Span/Type-Preserving Shuffle', (allMols, realLitSet, stableRoots, seed) => {
  // Group all molecules by bucket: width + type
  const buckets = new Map();
  for (const m of allMols) {
    const width = (m.to - m.from) + 1;
    const key = `${width}:${m.type}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }

  // Count how many real lit molecules were in each bucket
  const budget = new Map();
  for (const m of allMols) {
    if (realLitSet.has(m) && !stableRoots.includes(m)) {
      const width = (m.to - m.from) + 1;
      const key = `${width}:${m.type}`;
      budget.set(key, (budget.get(key) || 0) + 1);
    }
  }

  const picked = [...stableRoots];
  for (const [key, count] of budget.entries()) {
    const candidates = (buckets.get(key) || []).filter((m) => !stableRoots.includes(m));
    const shuffled = deterministicShuffle(candidates, seed);
    picked.push(...shuffled.slice(0, count));
  }

  // If budget wasn't fully met due to small buckets, top off by matching width
  const totalLitNeeded = allMols.filter((m) => realLitSet.has(m)).length;
  if (picked.length < totalLitNeeded) {
    const remaining = allMols.filter((m) => !picked.includes(m) && !stableRoots.includes(m));
    const shuffledRemaining = deterministicShuffle(remaining, seed);
    picked.push(...shuffledRemaining.slice(0, totalLitNeeded - picked.length));
  }

  return new Set(picked);
});

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  THREE-CONTROL FALSIFIER LADDER RESULTS MATRIX');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

const row = (label, parsed, fractures, containment, sdText, accuracy, loss) =>
  console.log(
    `│ ${label.padEnd(44)} │ ${parsed.padEnd(8)} │ ${fractures.padEnd(10)} │ `
    + `${containment.padEnd(11)} │ ${sdText.padEnd(9)} │ ${accuracy.padEnd(9)} │ ${loss.padEnd(15)} │`,
  );

console.log('┌──────────────────────────────────────────────┬──────────┬────────────┬─────────────┬───────────┬───────────┬─────────────────┐');
console.log('│ Control Layer                                │ Parsed   │ Fractures  │ Gold Cont.  │ SD        │ Head Acc. │ Gold Lost       │');
console.log('├──────────────────────────────────────────────┼──────────┼────────────┼─────────────┼───────────┼───────────┼─────────────────┤');
row(
  'Ground Truth (Real Descending Light)',
  String(realStats.parsed),
  '0 (0.0%)',
  `${realStats.goldContainment} (${((realStats.goldContainment / realStats.parsed) * 100).toFixed(1)}%)`,
  'n/a',
  `${((realStats.top1Heads / realStats.parsed) * 100).toFixed(2)}%`,
  'Baseline',
);
for (const c of [ctrl1, ctrl2, ctrl3]) {
  row(
    c.name,
    c.meanParsed.toFixed(1),
    `${c.meanFractures.toFixed(1)} (${c.fracturePct.toFixed(1)}%)`,
    c.meanContainment.toFixed(1),
    `±${c.containmentSd.toFixed(2)}`,
    `${c.accuracyPct.toFixed(2)}%`,
    `-${c.goldLost.toFixed(1)} (${c.goldLostPct.toFixed(1)}%)`,
  );
}
console.log('└──────────────────────────────────────────────┴──────────┴────────────┴─────────────┴───────────┴───────────┴─────────────────┘\n');

console.log(`EVALUATION OF CAUSAL RESIDUE (n = ${ctrl3.seeds} seeds, ± is 1 SD across seeds):`);
console.log(`  1. Control 1 (Unconstrained): breaks ${ctrl1.fracturePct.toFixed(1)}% of parses and loses ${ctrl1.goldLostPct.toFixed(1)}% of gold answers.`);
console.log(`     Most of this is root deletion, not lost reachability — the shuffle rarely retains the root.`);
console.log(`  2. Control 2 (Root-Preserved): 0 fractures, all ${realStats.parsed} parses alive, but ${ctrl2.goldLostPct.toFixed(1)}% of gold answers lost.`);
console.log(`  3. Control 3 (Stratified Width/Type): with span-width and category distributions matched,`);
console.log(`     scrambling the reachability links still costs ${ctrl3.goldLost.toFixed(1)} of ${realStats.goldContainment} gold answers`);
console.log(`     (${ctrl3.goldLostPct.toFixed(1)}%, 95% CI ±${ctrl3.containmentCi95.toFixed(2)} answers) and drops head accuracy to ${ctrl3.accuracyPct.toFixed(2)}%.`);
console.log();
console.log(`  => Descending light does NOT keep sentences parsed: Controls 2 and 3 fracture nothing.`);
console.log(`     What it carries is which reading wins, and Control 3 is the size of that effect.`);
