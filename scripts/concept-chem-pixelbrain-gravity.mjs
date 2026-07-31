#!/usr/bin/env node
/**
 * Concept Chemistry: does PixelBrain need gravity?
 *
 * The proposal: a propagation field that ATTRACTS the energy of the QBIT
 * lattice, enabling data parsing at the semantic level via meaning buckets
 * for pixels.
 *
 * Two separable claims, which can fail independently:
 *
 *   MECHANISM — the field must pull energy toward attractors, rather than
 *               radiate it from seeds as it does today.
 *   SEMANTICS — the resulting buckets should carry MEANING, where today they
 *               carry MATERIAL identity.
 *
 * Established by reading the code before composing any reaction (the corpus
 * below is descriptive, never evaluative):
 *
 *   codex/core/pixelbrain/qbit-field.js already implements propagate() with
 *   GAUSSIAN, INVERSE_SQUARE (seedEnergy / (dist^2 + 1) — the Newtonian
 *   kernel) and PHI_ATTENUATION, and assignMaterial() already buckets a
 *   continuous energy value into a discrete identity via MATERIAL_THRESHOLDS.
 *   src/core/compose/layout/qbit-lattice.ts mirrors both.
 *
 * So a propagation field exists and identity bucketing exists. The open
 * questions are direction (emissive vs attractive) and what the bucket means.
 *
 * The decisive control is control/false-friend-polarity: the identical claim
 * with attraction replaced by repulsion. Gravity's whole content is its sign.
 * If the run cannot separate those two, it is scoring vocabulary.
 *
 * ORDINAL ONLY. Controls set the bar; STABLE_MIN is not a gate.
 */
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';
import {
  computeControlBar,
  formatControlReport,
} from '../codex/core/pixelbrain/calibration/control-gate.js';
import {
  adjudicateChemistry,
  formatChemGate,
} from '../codex/core/pixelbrain/calibration/chem-gate.js';

const USE_CORPUS = process.argv.includes('--corpus');

const corpus = [
  // ── what qbit-field.js actually does ────────────────────────────────────
  "qbit field propagate energy from seed points using an attenuation model",
  "inverse square attenuation seed energy divided by distance squared plus one",
  "gaussian attenuation seed energy times exponential of negative distance times decay",
  "phi attenuation seed energy divided by distance raised to two over golden ratio",
  "assign material identity by threshold from a continuous energy value",
  "material thresholds earth stone granite crystal at zero quarter half seven tenths",
  "energy value below zero returns no material air",
  "propagate with octree for sparse volumes",
  "eight energy types resonant photonic structural thermal kinetic entropic shielding radiant",
  "qbit lattice grid deterministic spatial addressing every cell has a coordinate",
  "lattice seed emits energy into the grid with a radius and an attenuation",
  "gradient computation spatial derivative for layout decisions",
  "chunked world volume energy field across chunk borders",

  // ── the semantic layer as it exists ─────────────────────────────────────
  "semantic calculus sealed intent intermediate representation for agents",
  "turboquant quantized semantic buckets from formation formulas",
  "a kind is what was said a verdict is what may happen two axes never one enum",
  "no kind exists without a gene that computes it",
  "meanings determined by versioned formation formulas not by vocabulary",

  // ── physics vocabulary available to the question ────────────────────────
  "gravitational potential well attracts mass toward a centre",
  "field direction determines whether energy flows outward or inward",
  "conservative field line integral depends only on endpoints",
  "energy conservation invariant quantity preserved across transport",
  "superposition of fields sums contributions from every source",
  "sign of a source term distinguishes a sink from an emitter",
  "quantization maps a continuous value onto a discrete band",

  // ── governing laws ──────────────────────────────────────────────────────
  "determinism law requires all outputs reproducible from seed",
  "checks that cannot fail enforce the defect",
  "declared but unimplemented features pass every test",
  "content addressed packet identity stable across sessions",
];

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
  // ── the proposal as stated ──────────────────────────────────────────────
  {
    id: "H/gravity-attracts-lattice-energy",
    group: "hypothesis",
    a: "a propagation field that attracts the energy of the qbit lattice toward a centre",
    b: "gravitational potential well attracts mass toward a centre",
    product: "pixel energy accumulates toward attractors instead of radiating from seeds",
  },
  {
    id: "H/meaning-buckets-for-pixels",
    group: "hypothesis",
    a: "assign material identity by threshold from a continuous energy value",
    b: "turboquant quantized semantic buckets from formation formulas",
    product: "the energy threshold bucket carries semantic meaning rather than material identity",
  },

  // ── rival readings grounded in what already exists ──────────────────────
  {
    id: "A/inverse-square-is-already-the-kernel",
    group: "alternative",
    a: "inverse square attenuation seed energy divided by distance squared plus one",
    b: "gravitational potential well attracts mass toward a centre",
    product: "the newtonian kernel is already implemented so gravity adds no new law",
  },
  {
    id: "A/attractor-is-a-signed-seed",
    group: "alternative",
    a: "sign of a source term distinguishes a sink from an emitter",
    b: "lattice seed emits energy into the grid with a radius and an attenuation",
    product: "an attractor is a seed with a negative source term requiring no new field",
  },
  {
    id: "A/semantic-binding-not-a-new-field",
    group: "alternative",
    a: "turboquant quantized semantic buckets from formation formulas",
    b: "assign material identity by threshold from a continuous energy value",
    product: "bind the existing energy field to the existing semantic quantizer rather than adding a field",
  },
  {
    id: "A/meaning-needs-a-second-axis",
    group: "alternative",
    a: "a kind is what was said a verdict is what may happen two axes never one enum",
    b: "material thresholds earth stone granite crystal at zero quarter half seven tenths",
    product: "material identity and semantic identity are two axes so one threshold table cannot carry both",
  },
  {
    id: "A/superposition-gives-basins",
    group: "alternative",
    a: "superposition of fields sums contributions from every source",
    b: "quantization maps a continuous value onto a discrete band",
    product: "overlapping seed fields already form basins that quantize into buckets without attraction",
  },

  // ── controls ────────────────────────────────────────────────────────────
  {
    id: "control/nonsense",
    group: "control",
    a: "pixel energy propagation field",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "semantic pixel buckets as a pastry glaze",
  },
  {
    id: "control/law-violation",
    group: "control",
    a: "pixel energy propagation field",
    b: "unseeded random resampling until the field looks right",
    product: "attract energy by rerolling the field until the picture is pleasing",
  },
  {
    // THE decisive control: gravity's entire content is its sign. Same
    // sentence, attraction replaced by repulsion.
    id: "control/false-friend-polarity",
    group: "control",
    a: "a propagation field that repels the energy of the qbit lattice away from a centre",
    b: "gravitational potential well attracts mass toward a centre",
    product: "pixel energy is pushed away from attractors instead of radiating from seeds",
  },
  {
    // Plausible conflation: thresholds already produce named buckets, so it is
    // tempting to say meaning is already carried. Names are not meanings.
    id: "control/false-friend-names-are-meanings",
    group: "control",
    a: "material thresholds earth stone granite crystal at zero quarter half seven tenths",
    b: "meanings determined by versioned formation formulas not by vocabulary",
    product: "the material names already are the semantic buckets so nothing needs adding",
  },
];

console.log('═══ CONCEPT CHEMISTRY: DOES PIXELBRAIN NEED GRAVITY? ═══\n');

let corpusIndex = null;
if (USE_CORPUS) {
  corpusIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
  console.log('Grounding: ENCYCLOPEDIA CORPUS via grounding-index.js');
  console.log(`  docs=${corpusIndex.documentCount ?? '?'} tokens=${corpusIndex.tokenCount ?? '?'}\n`);
} else {
  console.log(`Grounding: hand-authored corpus, ${corpus.length} documents`);
  console.log('  (run with --corpus to grade against the real encyclopedia index)\n');
}

const results = reactions.map((r) => {
  if (USE_CORPUS) {
    const res = synthesize({ a: r.a, b: r.b, product: r.product, index: corpusIndex });
    return { ...r, ...res };
  }
  const gA = groundingScore(r.a);
  const gB = groundingScore(r.b);
  const res = synthesize({ a: r.a, b: r.b, product: r.product, groundingA: gA, groundingB: gB });
  return { ...r, ...res };
});

results.sort((a, b) => b.feasibility - a.feasibility);

for (const r of results) {
  const bar = '█'.repeat(Math.round(r.feasibility * 40));
  console.log(`${r.stability.padEnd(12)} ${r.feasibility.toFixed(4)}  ${bar}`);
  console.log(`  ${r.id}  [${r.group}]`);
  const sign = r.bondSign ?? (r.bond > 0 ? '+' : r.bond < 0 ? '-' : '0');
  console.log(`  bond=${sign}${(r.bondMagnitude ?? Math.abs(r.bond)).toFixed(4)} ground=${r.grounding} cohere=${r.coherence} law=${r.lawNote}`);
  console.log('');
}

console.log('═══ ORDINAL VERDICT ═══\n');
// Law controls are detectors for lawGate, not the floor. See control-gate.js.
const { bar: bestControl } = computeControlBar(results);
console.log(formatControlReport(results));

for (const group of ['hypothesis', 'alternative']) {
  console.log(`  ${group}:`);
  for (const r of results.filter((x) => x.group === group)) {
    const d = r.feasibility - bestControl;
    console.log(
      `    ${d > 0 ? 'CLEARS' : 'BELOW '} ${r.id.padEnd(38)} ${r.feasibility.toFixed(4)} (${d >= 0 ? '+' : ''}${d.toFixed(4)})`,
    );
  }
  console.log('');
}

const lit = results.find((r) => r.id === 'H/gravity-attracts-lattice-energy');
const pol = results.find((r) => r.id === 'control/false-friend-polarity');
const sep = lit.feasibility - pol.feasibility;
console.log('═══ POLARITY SEPARATION (run validity) ═══\n');
console.log(`  attracts  ${lit.feasibility.toFixed(4)}`);
console.log(`  repels    ${pol.feasibility.toFixed(4)}`);
console.log(`  separation ${sep >= 0 ? '+' : ''}${sep.toFixed(4)}`);
if (Math.abs(sep) < 0.02) {
  console.log('\n  → NOT SEPARATED. Gravity\'s entire content is its sign, and flipping it');
  console.log('    barely moves the score. This run is scoring vocabulary, not direction,');
  console.log('    and cannot answer the mechanism question.');
} else {
  console.log(`\n  → separated ${sep > 0 ? 'in favour of attraction' : 'AGAINST attraction'}.`);
}

console.log('\n═══ SEMANTIC CALCULUS ADJUDICATION ═══\n');
console.log(formatChemGate(adjudicateChemistry(results)));
console.log('');
