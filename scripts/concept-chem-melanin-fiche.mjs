#!/usr/bin/env node
/**
 * Concept Chemistry: the melanin fiche.
 *
 * Proposal: one sealed carrier holding many COMPLETE projections (render,
 * construction IR, temporal frames, gene sheet) behind a manifest — and the
 * frames adapt to observed reads. Heavily-read frames get richer; untouched
 * frames thin out. The consumer never requests anything; its reading IS the
 * signal, the way skin darkens where light actually landed.
 *
 * Two separable claims:
 *
 *   CARRIER  — bundle many sealed projections behind one manifest.
 *   MELANIN  — adapt what is on the carrier from observed exposure.
 *
 * The run must answer one question above all others, so it gets a dedicated
 * control: is "responds to observed reads" actually distinct from "consumer
 * requests what it wants", or is it negotiation with a delay? If
 * H/melanin-exposure-response cannot separate from
 * control/false-friend-request, melanin collapses back into the interlocutor
 * that the previous run denied, and this idea is dead.
 *
 * The polarity control is the tanning bed: frames darkening from FORECAST
 * exposure rather than ACTUAL exposure. Melanin's whole content is that the
 * light already landed.
 *
 * The incumbent (A/second-projection-plain) is carried forward from the
 * previous run, where it won both corpora. A new idea has to beat the standing
 * answer, not just the controls.
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
  // ── measured facts about the bridge today ───────────────────────────────
  "a projection carries a chosen subset of producer state across a boundary",
  "one producer the consumer verifies the seal by string equality",
  "the consumer never computes a hash and never mints a receipt",
  "twenty four named attributes cross and land on the point domain",
  "nothing reads the ingested attributes so colour never reaches a pixel",
  "declared but unimplemented features pass every test",
  "checks that cannot fail enforce the defect",
  "format for wire emits a shape the wire protocol cannot read",
  "temporal compiled packet certified frames with per frame projection checksum",
  "geometry construction intermediate representation primitives anchors constraints",
  "scdna art gene material hint palette roles light direction value ramp",

  // ── carrier and index vocabulary ────────────────────────────────────────
  "a manifest lists what a carrier holds with a checksum per entry",
  "a sealed carrier bundles many complete documents behind one index",
  "random access to a frame by address without a round trip",
  "content addressed packet identity stable across sessions",
  "a root digest binds the frame digests it indexes",
  "shipping the carrier whole avoids a request response exchange",
  "fetching an entry on demand requires the consumer to ask first",

  // ── observed-usage vocabulary that already exists here ──────────────────
  "the memory store records an access count and a last access per row",
  "usage observed after the fact is not a request made in advance",
  "a signal derived from what already happened requires no round trip",
  "feedback adapts a future issue rather than the current exchange",

  // ── biological response vocabulary ──────────────────────────────────────
  "melanin is produced locally in response to light that already landed",
  "a response to exposure requires no signalling request to the source",
  "adaptation follows damage actually taken not damage forecast",
  "an immune response is triggered by an antigen actually encountered",
  "homeostasis adjusts state from measurement rather than from prediction",

  // ── governing laws ──────────────────────────────────────────────────────
  "determinism law requires all outputs reproducible from seed",
  "sealed packet canonical serialization integrity tag",
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
    id: "H/fiche-carrier",
    group: "hypothesis",
    a: "a sealed carrier bundles many complete documents behind one index",
    b: "a projection carries a chosen subset of producer state across a boundary",
    product: "one sealed carrier holds every projection behind a manifest with a checksum per frame",
  },
  {
    id: "H/melanin-exposure-response",
    group: "hypothesis",
    a: "melanin is produced locally in response to light that already landed",
    b: "the memory store records an access count and a last access per row",
    product: "frames thicken where they were actually read and thin where they were not",
  },

  // ── rivals, including the standing answer ───────────────────────────────
  {
    id: "A/second-projection-plain",
    group: "alternative",
    a: "a projection carries a chosen subset of producer state across a boundary",
    b: "one producer the consumer verifies the seal by string equality",
    product: "each producer format gets its own sealed projection and the consumer chooses nothing",
  },
  {
    id: "A/static-carrier-no-melanin",
    group: "alternative",
    a: "a sealed carrier bundles many complete documents behind one index",
    b: "shipping the carrier whole avoids a request response exchange",
    product: "bundle every projection once and never adapt what the carrier holds",
  },
  {
    id: "A/consume-before-widening",
    group: "alternative",
    a: "nothing reads the ingested attributes so colour never reaches a pixel",
    b: "twenty four named attributes cross and land on the point domain",
    product: "read the attributes already crossing before adding anything to the carrier",
  },
  {
    id: "A/lazy-frames-on-demand",
    group: "alternative",
    a: "fetching an entry on demand requires the consumer to ask first",
    b: "a manifest lists what a carrier holds with a checksum per entry",
    product: "ship the manifest first and fetch frames only when the consumer needs them",
  },

  // ── controls ────────────────────────────────────────────────────────────
  {
    id: "control/nonsense",
    group: "control",
    a: "a sealed multi projection carrier",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "the frame manifest as a pastry glaze",
  },
  {
    id: "control/law-violation",
    group: "control",
    a: "the consumer never computes a hash and never mints a receipt",
    b: "the consumer recomputes the digest it prefers and mints its own receipt",
    product: "let the consumer hash the carrier and issue the receipt itself",
  },
  {
    // THE question this run exists to answer. If melanin cannot separate from
    // this, it is the denied interlocutor wearing a biological name.
    id: "control/false-friend-request",
    group: "control",
    a: "the consumer declares which frames it wants before they are sent",
    b: "the memory store records an access count and a last access per row",
    product: "the consumer requests the frames it wants and the producer complies",
  },
  {
    // Polarity: melanin's content is that the light ALREADY LANDED.
    id: "control/false-friend-polarity",
    group: "control",
    a: "frames are enriched in advance for exposure that is forecast",
    b: "melanin is produced locally in response to light that already landed",
    product: "frames thicken where reads are predicted rather than where they occurred",
  },
];

console.log('═══ CONCEPT CHEMISTRY: THE MELANIN FICHE ═══\n');

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
  const mag = (r.bondMagnitude ?? Math.abs(r.bond)).toFixed(4);
  const pmi = r.corpusPMI ? `pmi=${r.corpusPMI.meanPMI.toFixed(3)}(${r.corpusPMI.signal})` : 'pmi=n/a';
  console.log(`  bond=${sign}${mag} ground=${r.grounding} cohere=${r.coherence} ${pmi} law=${r.lawNote}`);
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

const mel = results.find((r) => r.id === 'H/melanin-exposure-response');
const req = results.find((r) => r.id === 'control/false-friend-request');
const pol = results.find((r) => r.id === 'control/false-friend-polarity');
const incumbent = results.find((r) => r.id === 'A/second-projection-plain');

console.log('═══ THE DECISIVE SEPARATION ═══\n');
const sepReq = mel.feasibility - req.feasibility;
console.log(`  melanin (observed reads)     ${mel.feasibility.toFixed(4)}`);
console.log(`  request (consumer asks)      ${req.feasibility.toFixed(4)}`);
console.log(`  separation                   ${sepReq >= 0 ? '+' : ''}${sepReq.toFixed(4)}`);
if (Math.abs(sepReq) < 0.02) {
  console.log('  → NOT SEPARATED. Melanin is the denied interlocutor with a biological name.');
} else if (sepReq > 0) {
  console.log('  → separated: observed-response is a distinct idea from consumer-request.');
} else {
  console.log('  → separated AGAINST melanin: the request framing outranks it.');
}

const sepPol = mel.feasibility - pol.feasibility;
console.log(`\n  melanin (already landed)     ${mel.feasibility.toFixed(4)}`);
console.log(`  tanning bed (forecast)       ${pol.feasibility.toFixed(4)}`);
console.log(`  separation                   ${sepPol >= 0 ? '+' : ''}${sepPol.toFixed(4)}`);

console.log('\n═══ VS THE STANDING ANSWER ═══\n');
console.log(`  incumbent A/second-projection-plain  ${incumbent.feasibility.toFixed(4)}`);
for (const h of results.filter((r) => r.group === 'hypothesis')) {
  const d = h.feasibility - incumbent.feasibility;
  console.log(`  ${h.id.padEnd(34)} ${h.feasibility.toFixed(4)} (${d >= 0 ? '+' : ''}${d.toFixed(4)} vs incumbent)`);
}
console.log(`\n  highest overall: ${results[0].id} ${results[0].feasibility.toFixed(4)} [${results[0].group}]`);

console.log('\n═══ SEMANTIC CALCULUS ADJUDICATION ═══\n');
console.log(formatChemGate(adjudicateChemistry(results)));
console.log('');
