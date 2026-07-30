#!/usr/bin/env node
/**
 * Concept Chemistry: extrapolate a determinism instrument for the three
 * Blender-bridge hazards that the six-variant CPU measurement did NOT settle:
 *
 *   motion blur      — integration over the shutter interval
 *   geometry nodes    — pure DAG evaluation
 *   simulation caches — integration ACROSS frames
 *
 * Thesis under test: physics-oriented energy-distribution concepts supply the
 * matching instrument, and they do NOT supply the same one for all three.
 *
 * Controls are load-bearing. If the nonsense, law-violation, and false-friend
 * controls do not come out UNSTABLE, this run has proved nothing.
 */
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';

// Substrate: the measured determinism facts, the governing laws, and the
// registry entries this design already rests on.
const corpus = [
  "determinism law requires all outputs reproducible from seed",
  "cycles cpu path tracer pixel identical run to run fixed seed",
  "thread count invariant one four eight identical pixel payload",
  "open exr header timestamp render duration container metadata differs",
  "canonical pixel projection float32 dump strips metadata",
  "adaptive sampling inert declared input changed output unchanged",
  "open image denoise deterministic reproducible changes pixels",
  "scd64 eight slot checksum independent sha256 derivation per slot",
  "slot independence disjoint canonical string localization not metric",
  "monotonic clock lamport timestamp revision gate sequence never decreases",
  "sealed packet canonical serialization integrity tag one producer",
  "consumer verifies seal by string equality never computes hash",
  "float32 truncation bpy property consumer cannot rehash state",
  "topological sort dependency dag deterministic evaluation order",
  "constraint infeasibility deterministic refusal never partial solving",
  "monte carlo integration accumulates energy samples over a measure",
  "floating point addition non associative summation order matters",
  "simulation cache frame state depends on previous frame trajectory",
  "motion blur integrates radiance over shutter time interval",
  "geometry nodes pure function evaluation no persistent state",
  "energy conservation invariant quantity preserved across transport",
  "checks that cannot fail enforce the defect golden id blind to recolour",
  "declared but unimplemented bloom masks hard light no solver call",
  "render receipt evidence of what an engine actually drew not a seal",
];

// Grounding: fraction of corpus docs sharing tokens with the concept.
// Same function as concept-chem-thesis.mjs so scores are comparable.
function groundingScore(concept) {
  const toks = new Set(
    concept.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter((t) => t.length > 2),
  );
  let hits = 0;
  for (const doc of corpus) {
    const docToks = new Set(doc.toLowerCase().split(/\s+/));
    if ([...toks].some((t) => docToks.has(t))) hits++;
  }
  return hits / corpus.length;
}

const reactions = [
  // ── motion blur ───────────────────────────────────────────────────────────
  {
    id: "blur/temporal-quadrature",
    hazard: "motion blur",
    a: "motion blur integrates radiance over the shutter time interval",
    b: "monte carlo quadrature over a measure with seeded sample distribution",
    product: "motion blur as a seeded stateless integration reproducible from seed and shutter bounds",
  },
  {
    id: "blur/conservative-field",
    hazard: "motion blur",
    a: "motion blur accumulates energy within a single frame",
    b: "conservative vector field line integral depends only on endpoints",
    product: "shutter integral is path independent so checksum the endpoint state not the trajectory",
  },
  {
    id: "blur/summation-order",
    hazard: "motion blur",
    a: "motion blur sums many time samples into one pixel",
    b: "floating point addition is non associative so summation order changes the sum",
    product: "pin the accumulation order so the energy sum is bitwise reproducible",
  },

  // ── geometry nodes ────────────────────────────────────────────────────────
  {
    id: "geonodes/pure-dag",
    hazard: "geometry nodes",
    a: "geometry nodes evaluate a directed acyclic graph of pure operations",
    b: "topological sort dependency dag deterministic evaluation order",
    product: "geometry node tree is a pure function reproducible from its input hash",
  },
  {
    id: "geonodes/phase-space",
    hazard: "geometry nodes",
    a: "geometry nodes distribute points and instances across a domain",
    b: "phase space volume preserved under liouville theorem energy distribution",
    product: "point distribution as a conserved phase space measure checksummed by its invariant",
  },
  {
    id: "geonodes/seeded-field",
    hazard: "geometry nodes",
    a: "geometry nodes random value node scatters with a seed",
    b: "seeded pseudorandom field sampled deterministically at each domain element",
    product: "scatter reproducible when seed and element index are both declared inputs",
  },

  // ── simulation caches ─────────────────────────────────────────────────────
  {
    id: "sim/dissipative-hysteresis",
    hazard: "simulation caches",
    a: "simulation cache frame state depends on the previous frame trajectory",
    b: "dissipative non conservative field with hysteresis path dependent state",
    product: "simulation state is path dependent so the trajectory must be checksummed not the endpoint",
  },
  {
    id: "sim/markov-chain",
    hazard: "simulation caches",
    a: "simulation cache advances one frame from the previous frame state",
    b: "markov property memoryless transition frame depends only on prior frame",
    product: "chain a rolling checksum frame by frame so divergence localizes to the first bad frame",
  },
  {
    id: "sim/monotonic-gate",
    hazard: "simulation caches",
    a: "simulation cache frames must be consumed in order never out of sequence",
    b: "monotonic clock lamport timestamp revision gate sequence never decreases",
    product: "cache frame index as a monotonic gate rejecting stale or reordered frames",
  },
  {
    id: "sim/energy-conservation",
    hazard: "simulation caches",
    a: "simulation redistributes energy among particles across frames",
    b: "energy conservation invariant quantity preserved across transport",
    product: "checksum the conserved total energy as a cheap invariant independent of per particle order",
  },

  // ── controls: these MUST come out UNSTABLE ────────────────────────────────
  {
    id: "control/nonsense",
    hazard: "control",
    a: "simulation cache determinism",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "render determinism as a pastry glaze",
  },
  {
    id: "control/law-violation",
    hazard: "control",
    a: "simulation cache determinism",
    b: "random non deterministic unseeded stochastic generation",
    product: "determinism by unseeded random resampling until it looks right",
  },
  {
    id: "control/false-friend",
    hazard: "control",
    a: "render output divergence measurement",
    b: "checksum hamming distance as a semantic similarity metric for clustering",
    product: "cluster renders by checksum distance to find which are visually alike",
  },
];

console.log('═══ CONCEPT CHEMISTRY: BLENDER DETERMINISM HAZARDS ═══\n');
console.log(`Corpus: ${corpus.length} substrate documents\n`);

const results = reactions.map((r) => {
  const gA = groundingScore(r.a);
  const gB = groundingScore(r.b);
  const res = synthesize({ a: r.a, b: r.b, product: r.product, groundingA: gA, groundingB: gB });
  return { ...r, groundingA: gA, groundingB: gB, ...res };
});

results.sort((a, b) => b.feasibility - a.feasibility);

for (const r of results) {
  const bar = '█'.repeat(Math.round(r.feasibility * 40));
  console.log(`${r.stability.padEnd(12)} ${r.feasibility.toFixed(4)}  ${bar}`);
  console.log(`  ${r.id}  [${r.hazard}]`);
  console.log(`  bond=${r.bond} ground=${r.grounding} cohere=${r.coherence} law=${r.lawNote}`);
  console.log(`  gA=${r.groundingA.toFixed(3)} gB=${r.groundingB.toFixed(3)}  checksum=${r.checksum}`);
  console.log('');
}

console.log('═══ PER-HAZARD WINNER ═══\n');
for (const hazard of ['motion blur', 'geometry nodes', 'simulation caches']) {
  const top = results.filter((r) => r.hazard === hazard)[0];
  console.log(`${hazard.padEnd(18)} ${top.stability.padEnd(11)} ${top.feasibility.toFixed(4)}  ${top.id}`);
}

console.log('\n═══ CONTROL INTEGRITY ═══\n');
const controls = results.filter((r) => r.hazard === 'control');
const candidates = results.filter((r) => r.hazard !== 'control');

// "All controls scored UNSTABLE" is NOT a usable criterion: if the whole field
// is UNSTABLE, the controls are UNSTABLE for free and the run proves nothing.
// The criterion is SEPARATION — every control must score below every candidate.
const worstCandidate = Math.min(...candidates.map((r) => r.feasibility));
const bestControl = Math.max(...controls.map((r) => r.feasibility));
const margin = worstCandidate - bestControl;

for (const c of controls) {
  const outranked = candidates.filter((r) => r.feasibility < c.feasibility);
  console.log(
    `  ${c.id.padEnd(24)} ${c.stability.padEnd(11)} ${c.feasibility.toFixed(4)}` +
      (outranked.length
        ? `  ← OUTRANKS ${outranked.length} candidate(s): ${outranked.map((r) => r.id).join(', ')}`
        : '  (below all candidates)'),
  );
}

console.log(`\nworst candidate ${worstCandidate.toFixed(4)}  best control ${bestControl.toFixed(4)}  margin ${margin.toFixed(4)}`);

if (margin > 0) {
  console.log('\n✅ SEPARATED: every control scored below every candidate. Ranking is interpretable.');
} else {
  console.log('\n❌ NOT SEPARATED: a control outranked a real candidate.');
  console.log('   The ranking is NOT interpretable as evidence for any synthesis.');
  console.log('   Most likely cause: W_GROUND is 0.65 of the score and grounding is token');
  console.log('   overlap against a hand-authored corpus — i.e. the corpus author is');
  console.log('   grading their own reaction text. Fix the corpus, not the ranking.');
}
