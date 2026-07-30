#!/usr/bin/env node
/**
 * Concept Chemistry: adjudicate the hypothesis
 *
 *   "Plug the VRI bridge into BytecodeHealth as an intermediary interpolation
 *    layer, so it can guide animation generation with a level of determinism
 *    it would not get otherwise."
 *
 * The claim has two separable bonds, and they can fail independently:
 *
 *   1. VRI is the right substrate for deterministic animation interpolation.
 *   2. BytecodeHealth is the right thing to plug that interpolation INTO.
 *
 * A single verdict on the sentence would hide which half carries it, so the
 * hypothesis is decomposed and ranked against rival wirings of the same goal.
 *
 * Controls are load-bearing. The decisive one is control/false-friend-polarity:
 * the identical claim wired to the RED path (BytecodeError) instead of the
 * green one. It shares nearly all surface vocabulary with the hypothesis and is
 * a category error. If the hypothesis cannot separate from it, the hypothesis
 * is being carried by vocabulary rather than content, and this run proves
 * nothing.
 *
 * ORDINAL ONLY. Scores are comparable within this run and never across
 * question domains. STABLE_MIN is not a gate here — the controls are.
 */
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';

const USE_CORPUS = process.argv.includes('--corpus');

// Substrate: facts read out of the two subsystems under discussion, plus the
// governing laws. Descriptive only — no document here states or denies the
// hypothesis, because a corpus that contains the answer cannot test it.
const corpus = [
  // ── VRI (codex/core/pixelbrain/vixel/) ──────────────────────────────────
  "vri vixel render ir the layer between scdl scene semantics and final raster",
  "scdl says what exists vri says how it looks",
  "vri scene layered lit textured mark bearing description collapsed into pixels at any scale",
  "vri compiler lowers scdl packet art genes shader into a vri scene",
  "vri compiler pure function deterministic no input output",
  "vri content addressed checksum hashes the full canonical scene",
  "vri layer types geometry texture field mark light atmosphere composite raster patch",
  "vri renderer collapses scene into rgba raster at a requested scale",
  "art gene binding channels geometry contour lighting atmosphere palette",
  "quantization spec luminance band absolute mapping material name carries hue",
  "deterministic material texture light and contour passes",

  // ── BytecodeHealth (codex/core/diagnostic/BytecodeHealth.js) ────────────
  "bytecode health green path signal emitted when a diagnostic check passes cleanly",
  "bytecode health is the complement to bytecode error forming a diagnostic channel",
  "health payload carries code cell id check id module id context timestamp checksum",
  "health checksum computed over stable fields with timestamp excluded",
  "health determinism contract same input same output one hundred pass required",
  "diagnostic cells emit health payloads that agents query consume and act upon",
  "encode module health archived codes logic incomplete severity constants",
  "health snapshot normalized through the bytecode health adapter",

  // ── governing laws and measured facts already on the books ──────────────
  "determinism law requires all outputs reproducible from seed",
  "one producer consumer verifies seal by string equality never computes hash",
  "render receipt is evidence of what an engine actually drew not a seal",
  "checks that cannot fail enforce the defect golden id blind to recolour",
  "declared but unimplemented bloom masks hard light no solver call",
  "simulation cache frame state depends on the previous frame trajectory",
  "chained digest frame by frame so divergence localizes to the first bad frame",
  "monotonic gate rejects stale or reordered frames",
  "floating point addition is non associative so summation order matters",
  "interpolation produces intermediate state between two declared endpoints",
  "animation is an ordered sequence of frames indexed in time",
  "content addressed packet identity is stable across sessions",
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
  // ── the hypothesis as stated, decomposed ────────────────────────────────
  {
    id: "H/vri-into-health",
    group: "hypothesis",
    a: "vri render ir as an intermediary interpolation layer between animation keyframes",
    b: "bytecode health green path signal emitted when a diagnostic check passes",
    product: "vri interpolation plugged into the health channel to guide animation generation",
  },
  {
    id: "H/health-supplies-determinism",
    group: "hypothesis",
    a: "animation generation lacking determinism it would not otherwise have",
    b: "health determinism contract same input same output one hundred pass required",
    product: "the health channel supplies the determinism the animation generator lacks",
  },

  // ── rival wirings of the same goal ──────────────────────────────────────
  {
    id: "A/vri-keyframe-lerp",
    group: "alternative",
    a: "interpolation produces intermediate state between two declared endpoints",
    b: "vri content addressed checksum hashes the full canonical scene",
    product: "frame n reproducible from two sealed vri endpoint scenes and a declared parameter",
  },
  {
    id: "A/vri-interpolation-standalone",
    group: "alternative",
    a: "vri compiler is a pure deterministic function with no input output",
    b: "animation is an ordered sequence of frames indexed in time",
    product: "vri itself is the interpolation layer and determinism follows from its purity",
  },
  {
    id: "A/health-attests-not-generates",
    group: "alternative",
    a: "render receipt is evidence of what an engine actually drew not a seal",
    b: "bytecode health payload emitted after a check passes carrying a stable checksum",
    product: "health attests the determinism of frames vri already produced rather than producing them",
  },
  {
    // Governance: the health channel is neither producing frames nor merely
    // recording them. It ADMITS them — and can refuse. This is the reading the
    // first run did not test, and it is structurally different from both:
    // an attestation cannot fail, a gate can.
    id: "A/health-as-admission-gate",
    group: "alternative",
    a: "health payload emitted only when a check passes carrying a stable checksum",
    b: "constraint infeasibility deterministic refusal never partial solving",
    product: "the health signal is the admission gate that refuses a frame failing its determinism check",
  },
  {
    id: "A/health-gates-interpolation",
    group: "alternative",
    a: "interpolation produces intermediate state between two declared endpoints",
    b: "monotonic gate rejects stale or reordered frames",
    product: "each interpolated frame must earn a health payload before it is admitted to the sequence",
  },
  {
    id: "A/chained-receipt-animation",
    group: "alternative",
    a: "animation frame state may depend on the previous frame trajectory",
    b: "chained digest frame by frame so divergence localizes to the first bad frame",
    product: "animation frames carry a chained receipt so a bad frame localizes instead of hiding",
  },

  // ── controls: the bar this run must clear ───────────────────────────────
  {
    id: "control/nonsense",
    group: "control",
    a: "deterministic animation interpolation",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "animation determinism as a pastry glaze",
  },
  {
    id: "control/law-violation",
    group: "control",
    a: "deterministic animation interpolation",
    b: "unseeded wall clock timestamp sampled at render time",
    product: "interpolate frames from the wall clock and resample until it looks right",
  },
  {
    // THE decisive control. Identical surface vocabulary to H/vri-into-health,
    // polarity flipped to the red path. A category error by construction.
    id: "control/false-friend-polarity",
    group: "control",
    a: "vri render ir as an intermediary interpolation layer between animation keyframes",
    b: "bytecode error red path signal emitted when a diagnostic check fails",
    product: "vri interpolation plugged into the error channel to guide animation generation",
  },
  {
    // Known-false in this repo by direct measurement: EXR headers carry a
    // wall-clock timestamp, so a file-level hash fails 100% of the time.
    id: "control/false-friend-file-hash",
    group: "control",
    a: "verifying that two rendered frames are identical",
    b: "hash the encoded image file on disk and compare the digests",
    product: "file level image hash as the determinism check for rendered animation frames",
  },
];

console.log('═══ CONCEPT CHEMISTRY: VRI × BYTECODEHEALTH FOR ANIMATION DETERMINISM ═══\n');

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
    return { ...r, groundingA: NaN, groundingB: NaN, ...res };
  }
  const gA = groundingScore(r.a);
  const gB = groundingScore(r.b);
  const res = synthesize({ a: r.a, b: r.b, product: r.product, groundingA: gA, groundingB: gB });
  return { ...r, groundingA: gA, groundingB: gB, ...res };
});

results.sort((a, b) => b.feasibility - a.feasibility);

for (const r of results) {
  const bar = '█'.repeat(Math.round(r.feasibility * 40));
  console.log(`${r.stability.padEnd(12)} ${r.feasibility.toFixed(4)}  ${bar}`);
  console.log(`  ${r.id}  [${r.group}]`);
  const sign = r.bondSign ?? (r.bond > 0 ? '+' : r.bond < 0 ? '-' : '0');
  const mag = (r.bondMagnitude ?? Math.abs(r.bond)).toFixed(4);
  const pmi = r.corpusPMI
    ? `pmi=${r.corpusPMI.meanPMI.toFixed(3)}(${r.corpusPMI.signal})`
    : 'pmi=n/a';
  console.log(`  bond=${sign}${mag} ground=${r.grounding} cohere=${r.coherence} ${pmi} law=${r.lawNote}`);
  console.log(`  checksum=${r.checksum}`);
  console.log('');
}

console.log('═══ ORDINAL VERDICT ═══\n');

const controls = results.filter((r) => r.group === 'control');
const bestControl = Math.max(...controls.map((r) => r.feasibility));
const bestControlId = controls.find((r) => r.feasibility === bestControl).id;
const polarity = results.find((r) => r.id === 'control/false-friend-polarity');

console.log('  controls:');
for (const c of controls) console.log(`    ${c.id.padEnd(32)} ${c.feasibility.toFixed(4)}`);
console.log(`\n  bar to clear: ${bestControlId} ${bestControl.toFixed(4)}\n`);

const hyp = results.filter((r) => r.group === 'hypothesis');
const alt = results.filter((r) => r.group === 'alternative');

console.log('  hypothesis as stated:');
for (const h of hyp) {
  const clears = h.feasibility > bestControl;
  console.log(
    `    ${clears ? 'CLEARS' : 'BELOW '} ${h.id.padEnd(32)} ${h.feasibility.toFixed(4)} ` +
      `(${(h.feasibility - bestControl >= 0 ? '+' : '') + (h.feasibility - bestControl).toFixed(4)} vs bar)`,
  );
}

console.log('\n  rival wirings:');
for (const a of alt) {
  const clears = a.feasibility > bestControl;
  console.log(
    `    ${clears ? 'CLEARS' : 'BELOW '} ${a.id.padEnd(32)} ${a.feasibility.toFixed(4)} ` +
      `(${(a.feasibility - bestControl >= 0 ? '+' : '') + (a.feasibility - bestControl).toFixed(4)} vs bar)`,
  );
}

// The polarity separation is the run's own validity check.
const litHyp = results.find((r) => r.id === 'H/vri-into-health');
const sep = litHyp.feasibility - polarity.feasibility;
console.log('\n═══ POLARITY SEPARATION (run validity) ═══\n');
console.log(`  H/vri-into-health              ${litHyp.feasibility.toFixed(4)}`);
console.log(`  control/false-friend-polarity  ${polarity.feasibility.toFixed(4)}`);
console.log(`  separation                     ${sep >= 0 ? '+' : ''}${sep.toFixed(4)}`);
if (Math.abs(sep) < 0.02) {
  console.log('\n  → NOT SEPARATED. The green/red polarity swap barely moves the score,');
  console.log('    so the hypothesis is being carried by shared vocabulary, not by');
  console.log('    what the health channel actually does. This run cannot validate it.');
} else if (sep > 0) {
  console.log('\n  → separated in the hypothesis\'s favour.');
} else {
  console.log('\n  → separated AGAINST the hypothesis: the red-path twin scores higher,');
  console.log('    which means the pairing is not discriminating on channel semantics.');
}

const bestAlt = alt[0];
const bestHyp = hyp[0];
console.log('\n═══ ANSWER ═══\n');
if (bestHyp.feasibility <= bestControl) {
  console.log('  DENIED. The hypothesis as stated ranks at or below a control.');
} else if (bestAlt && bestAlt.feasibility > bestHyp.feasibility) {
  console.log('  DENIED AS WIRED. The hypothesis clears the controls, but a rival');
  console.log(`  wiring of the same goal outranks it: ${bestAlt.id} (${bestAlt.feasibility.toFixed(4)})`);
  console.log(`  beats ${bestHyp.id} (${bestHyp.feasibility.toFixed(4)}).`);
} else {
  console.log('  VALIDATED against this run\'s controls and rivals.');
}
console.log('\n  Ordinal result only. Not a calibrated probability. The architectural');
console.log('  check in the accompanying report is what makes it falsifiable.');
