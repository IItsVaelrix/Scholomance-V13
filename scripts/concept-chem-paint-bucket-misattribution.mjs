#!/usr/bin/env node
/**
 * Concept Chemistry: mathematical paint buckets that detect misattributed
 * colour via phosphorylation cascade.
 *
 * Prior art established by reading the tree first (this idea is NOT greenfield):
 *
 *   codex/core/pixelbrain/qbit-phosphorylation.js — an APPROVED, implemented
 *     interactive paint gate. buildKinase(material, sdfDescriptor) +
 *     phosphorylate(layer, x, y, kinase). COLLAPSE_THRESHOLD = 0.51. Returns
 *     { committed, reason, confidence } with reasons MISSING_SUBSTRATE,
 *     INVALID_REACTION, LOW_CONFIDENCE.
 *   codex/core/shared/truesight/color/chroma.kinase.js — the TrueSight twin,
 *     where every grey token must declare WHY it is grey.
 *
 * So "phosphorylation gates paint" already exists. Three things in the
 * proposal are not obviously covered, and they fail independently:
 *
 *   DETECTION — the existing gate is PROSPECTIVE (refuse a bad paint at write
 *               time). Detecting colour ALREADY misattributed is retrospective
 *               audit, a different operation on a different corpus.
 *   CASCADE   — the existing path is ONE kinase call. A cascade is multi-stage
 *               amplification, where each stage activates the next.
 *   BUCKETS   — flood-fill regions as the unit of attribution rather than
 *               individual cells.
 *
 * The real defect this would target is on the books: texture noise reassigning
 * ramp bands, read library-wide as specular gloss, with NO test able to fail on
 * it. That is misattributed colour that presents as a design choice.
 *
 * DECISIVE CONTROL: control/false-friend-confidence conflates LOW_CONFIDENCE
 * with WRONG. The existing gate's confidence measures SDF/material substrate
 * match — not whether an attribution is correct. If the detection claim cannot
 * separate from that conflation, the proposal is just rereading the existing
 * gate's confidence field and calling it detection.
 *
 * POLARITY CONTROL: a cascade AMPLIFIES. The control attenuates. Amplification
 * is the entire content of the word; if they do not separate, "cascade" is
 * decoration.
 *
 * ORDINAL ONLY. Controls set the bar.
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
  // ── what already exists ─────────────────────────────────────────────────
  "qbit phosphorylation is an interactive paint gate over a material and an sdf descriptor",
  "build kinase returns a call and a threshold or an invalid substrate reason",
  "phosphorylate commits a paint only when confidence meets the collapse threshold",
  "the gate returns committed false with reason missing substrate invalid reaction or low confidence",
  "collapse threshold zero point five one",
  "a kinase must be pure and must not be re run on redo",
  "chroma kinase makes every grey token declare why it is grey",
  "the chroma stamp records the reason a colour was resolved",
  "material thresholds map a continuous value onto a discrete band",
  "quantization assigns a luminance band to an authored value sketch",
  "the material name carries the hue and the authored hex is a value sketch",

  // ── the defect class this targets ───────────────────────────────────────
  "texture noise reassigned ramp bands and read as specular gloss library wide",
  "a defect that presents as a design choice passes every test",
  "no test could fail on the reassigned band because the output looked intentional",
  "checks that cannot fail enforce the defect",
  "declared but unimplemented features pass every test",
  "an attribution is wrong when the reason recorded does not produce the value observed",

  // ── mechanism vocabulary ────────────────────────────────────────────────
  "a signalling cascade amplifies one activation into many downstream activations",
  "each stage of a cascade activates the next stage",
  "amplification increases the magnitude of a signal at every stage",
  "a single gate evaluates once and returns a verdict",
  "flood fill assigns a region of connected cells a single value",
  "a region is the unit of attribution rather than a single cell",
  "retrospective audit examines artefacts already produced",
  "a prospective gate refuses an operation before it is committed",
  "confidence measures substrate match not correctness of attribution",

  // ── governing laws ──────────────────────────────────────────────────────
  "determinism law requires all outputs reproducible from seed",
  "a refusal must be observable or the gate admits everything",
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
  // ── the proposal, decomposed ────────────────────────────────────────────
  {
    id: "H/detect-misattributed-colour",
    group: "hypothesis",
    a: "an attribution is wrong when the reason recorded does not produce the value observed",
    b: "retrospective audit examines artefacts already produced",
    product: "audit painted regions for colour whose recorded reason does not reproduce it",
  },
  {
    id: "H/cascade-amplifies-detection",
    group: "hypothesis",
    a: "a signalling cascade amplifies one activation into many downstream activations",
    b: "phosphorylate commits a paint only when confidence meets the collapse threshold",
    product: "one detected misattribution amplifies into every region sharing its reason",
  },
  {
    id: "H/bucket-is-the-unit",
    group: "hypothesis",
    a: "flood fill assigns a region of connected cells a single value",
    b: "a region is the unit of attribution rather than a single cell",
    product: "the paint bucket rather than the cell is what carries and is audited for attribution",
  },

  // ── rivals grounded in existing machinery ───────────────────────────────
  {
    id: "A/extend-existing-gate-reasons",
    group: "alternative",
    a: "the gate returns committed false with reason missing substrate invalid reaction or low confidence",
    b: "an attribution is wrong when the reason recorded does not produce the value observed",
    product: "add a misattribution reason to the existing paint gate taxonomy",
  },
  {
    id: "A/chroma-stamp-precedent",
    group: "alternative",
    a: "the chroma stamp records the reason a colour was resolved",
    b: "retrospective audit examines artefacts already produced",
    product: "stamp every painted region with its reason so an audit can replay it later",
  },
  {
    id: "A/replay-the-reason",
    group: "alternative",
    a: "the material name carries the hue and the authored hex is a value sketch",
    b: "an attribution is wrong when the reason recorded does not produce the value observed",
    product: "recompute the colour from the declared material and refuse any region that disagrees",
  },
  {
    id: "A/single-kinase-no-cascade",
    group: "alternative",
    a: "a single gate evaluates once and returns a verdict",
    b: "build kinase returns a call and a threshold or an invalid substrate reason",
    product: "one kinase call per region with a reason code and no amplification stage",
  },

  // ── controls ────────────────────────────────────────────────────────────
  {
    id: "control/nonsense",
    group: "control",
    a: "detecting misattributed colour in painted regions",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "colour attribution audit as a pastry glaze",
  },
  {
    id: "control/law-violation",
    group: "control",
    a: "a kinase must be pure and must not be re run on redo",
    b: "re run the kinase on every redo and take whichever answer appears",
    product: "resolve the colour again on redo and let the newest result win",
  },
  {
    // DECISIVE: is detection more than rereading the existing confidence field?
    id: "control/false-friend-confidence",
    group: "control",
    a: "confidence measures substrate match not correctness of attribution",
    b: "phosphorylate commits a paint only when confidence meets the collapse threshold",
    product: "a region scoring below the collapse threshold is a misattributed colour",
  },
  {
    // POLARITY: a cascade amplifies. This one damps.
    id: "control/false-friend-polarity",
    group: "control",
    a: "a signalling cascade attenuates one activation into fewer downstream activations",
    b: "phosphorylate commits a paint only when confidence meets the collapse threshold",
    product: "one detected misattribution damps out before reaching regions sharing its reason",
  },
];

console.log('═══ CONCEPT CHEMISTRY: PAINT BUCKETS × MISATTRIBUTION CASCADE ═══\n');

let corpusIndex = null;
if (USE_CORPUS) {
  corpusIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
  console.log('Grounding: ENCYCLOPEDIA CORPUS via grounding-index.js\n');
} else {
  console.log(`Grounding: hand-authored corpus, ${corpus.length} documents\n`);
}

const results = reactions.map((r) => {
  if (USE_CORPUS) {
    return { ...r, ...synthesize({ a: r.a, b: r.b, product: r.product, index: corpusIndex }) };
  }
  return {
    ...r,
    ...synthesize({
      a: r.a, b: r.b, product: r.product,
      groundingA: groundingScore(r.a), groundingB: groundingScore(r.b),
    }),
  };
});

results.sort((a, b) => b.feasibility - a.feasibility);

for (const r of results) {
  const bar = '█'.repeat(Math.round(r.feasibility * 40));
  console.log(`${r.stability.padEnd(12)} ${r.feasibility.toFixed(4)}  ${bar}`);
  console.log(`  ${r.id}  [${r.group}]`);
  const sign = r.bondSign ?? (r.bond > 0 ? '+' : r.bond < 0 ? '-' : '0');
  const pmi = r.corpusPMI ? `pmi=${r.corpusPMI.meanPMI.toFixed(3)}(${r.corpusPMI.signal})` : 'pmi=n/a';
  console.log(`  bond=${sign}${(r.bondMagnitude ?? Math.abs(r.bond)).toFixed(4)} ground=${r.grounding} cohere=${r.coherence} ${pmi} law=${r.lawNote}`);
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
    console.log(`    ${d > 0 ? 'CLEARS' : 'BELOW '} ${r.id.padEnd(34)} ${r.feasibility.toFixed(4)} (${d >= 0 ? '+' : ''}${d.toFixed(4)})`);
  }
  console.log('');
}

const det = results.find((r) => r.id === 'H/detect-misattributed-colour');
const conf = results.find((r) => r.id === 'control/false-friend-confidence');
const cas = results.find((r) => r.id === 'H/cascade-amplifies-detection');
const pol = results.find((r) => r.id === 'control/false-friend-polarity');

console.log('═══ DECISIVE SEPARATIONS ═══\n');
const s1 = det.feasibility - conf.feasibility;
console.log(`  detection (reason does not reproduce value)  ${det.feasibility.toFixed(4)}`);
console.log(`  conflation (low confidence means wrong)      ${conf.feasibility.toFixed(4)}`);
console.log(`  separation                                   ${s1 >= 0 ? '+' : ''}${s1.toFixed(4)}`);
console.log(
  Math.abs(s1) < 0.02
    ? '  → NOT SEPARATED. Detection is a reread of the existing confidence field.'
    : s1 > 0
      ? '  → separated: detection is a distinct claim from the confidence conflation.'
      : '  → separated AGAINST detection.',
);

const s2 = cas.feasibility - pol.feasibility;
console.log(`\n  cascade (amplifies)                          ${cas.feasibility.toFixed(4)}`);
console.log(`  anti-cascade (attenuates)                    ${pol.feasibility.toFixed(4)}`);
console.log(`  separation                                   ${s2 >= 0 ? '+' : ''}${s2.toFixed(4)}`);
console.log(
  Math.abs(s2) < 0.02
    ? '  → NOT SEPARATED. "Cascade" is decoration; amplification is doing no work.'
    : s2 > 0
      ? '  → separated: amplification is load-bearing.'
      : '  → separated AGAINST the cascade.',
);

console.log(`\n  highest overall: ${results[0].id} ${results[0].feasibility.toFixed(4)} [${results[0].group}]`);

console.log('\n═══ SEMANTIC CALCULUS ADJUDICATION ═══\n');
console.log(formatChemGate(adjudicateChemistry(results)));
console.log('');
