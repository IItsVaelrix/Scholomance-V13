#!/usr/bin/env node
/**
 * Concept Chemistry: does the PixelBrain→Blender bridge need an interlocutor?
 *
 * The proposal: a negotiating protocol layer that understands every PixelBrain
 * output format and every Blender consumption mode, asks Blender what it
 * supports, and formats accordingly.
 *
 * Two separable claims:
 *
 *   TRANSPORT — more than the render projection must be able to cross.
 *   NEGOTIATION — the CONSUMER should declare capabilities and select what it
 *                 receives, including which checksum family it receipts against.
 *
 * These fail independently. The transport claim is about coverage; the
 * negotiation claim is about who initiates, and it strains the bridge's
 * founding law ("one producer; the consumer verifies the seal by string
 * equality and never computes a hash").
 *
 * Verified facts before composing anything (read from source today):
 *   wire.js toPythonWire reads packet.coordinates/canvas/bytecode/kind/checksum
 *   ingest.py ingest_wire reads coordinateCount/positions/attributes/colors/energy
 *   temporal-compiler formatForWire emits frame/time/projectionChecksum/
 *     vertices/energyBindings/partIds — no intersection with either.
 *   Substrate: 'interlocutor' 0 rows, 'mediator' 0 rows, 'adapter' 2058 rows.
 *
 * The decisive control is control/false-friend-polarity: the same protocol with
 * the PRODUCER declaring what may be had, rather than the consumer requesting
 * it. Negotiation's entire content is who initiates. If those do not separate,
 * the run is scoring the word "protocol" and cannot answer the question.
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
  // ── the wire as it actually is ──────────────────────────────────────────
  "to python wire reads packet coordinates canvas bytecode kind and checksum",
  "ingest wire reads coordinate count positions attributes colors and energy",
  "format for wire emits frame time projection checksum vertices energy bindings part ids",
  "the temporal wire output and the wire protocol input share no fields",
  "attribute first ingest a coordinate is a twenty four field semantic record",
  "ingest creates named integer attributes on the point domain",
  "geometry nodes reads named attributes on the point domain",
  "nothing builds a geometry node tree from the ingested attributes",

  // ── what else PixelBrain produces ───────────────────────────────────────
  "geometry construction intermediate representation primitives anchors constraints",
  "scdna art gene material hint palette roles light direction value ramp",
  "render fidelity pipeline stages vector tonation shadow volume flame tip sharpness",
  "temporal compiled packet certified frames with per frame projection checksum",
  "eight energy types crossing as named attribute fields",

  // ── the bridge's founding laws ──────────────────────────────────────────
  "one producer the consumer verifies the seal by string equality",
  "the consumer never computes a hash and never mints a receipt",
  "sealed packet canonical serialization integrity tag",
  "a projection carries a chosen subset of producer state across a boundary",
  "render receipt is evidence of what an engine actually drew",

  // ── engineering vocabulary already in use ───────────────────────────────
  "adapter translates one module interface into another across this codebase",
  "capability declaration lets a consumer advertise what it supports",
  "protocol negotiation exchanges offers before data is sent",
  "a serialization boundary narrows producer state to a transferable form",
  "content addressed packet identity stable across sessions",

  // ── governing laws ──────────────────────────────────────────────────────
  "determinism law requires all outputs reproducible from seed",
  "checks that cannot fail enforce the defect",
  "declared but unimplemented features pass every test",
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
    id: "H/interlocutor-negotiates",
    group: "hypothesis",
    a: "a layer understanding every producer format and every consumer mode",
    b: "protocol negotiation exchanges offers before data is sent",
    product: "an interlocutor negotiates what crosses the bridge instead of a fixed projection",
  },
  {
    id: "H/consumer-declares-capabilities",
    group: "hypothesis",
    a: "capability declaration lets a consumer advertise what it supports",
    b: "one producer the consumer verifies the seal by string equality",
    product: "blender declares its capabilities and selects which checksum family it receipts against",
  },

  // ── rival wirings, cheapest first ───────────────────────────────────────
  {
    id: "A/dead-letter-fix",
    group: "alternative",
    a: "the temporal wire output and the wire protocol input share no fields",
    b: "to python wire reads packet coordinates canvas bytecode kind and checksum",
    product: "format for wire emits a real wire packet so temporal frames stop being a dead letter",
  },
  {
    id: "A/adapter-per-format",
    group: "alternative",
    a: "adapter translates one module interface into another across this codebase",
    b: "a serialization boundary narrows producer state to a transferable form",
    product: "one adapter per producer format onto the existing wire rather than a negotiating layer",
  },
  {
    id: "A/second-projection-not-negotiation",
    group: "alternative",
    a: "a projection carries a chosen subset of producer state across a boundary",
    b: "one producer the consumer verifies the seal by string equality",
    product: "each producer format gets its own sealed projection and the consumer chooses nothing",
  },
  {
    id: "A/wire-carries-frame-index",
    group: "alternative",
    a: "temporal compiled packet certified frames with per frame projection checksum",
    b: "ingest wire reads coordinate count positions attributes colors and energy",
    product: "extend the existing wire with a declared frame index rather than adding a layer",
  },
  {
    id: "A/consume-the-attributes-already-sent",
    group: "alternative",
    a: "nothing builds a geometry node tree from the ingested attributes",
    b: "geometry nodes reads named attributes on the point domain",
    product: "consume the attributes already crossing before widening what crosses",
  },

  // ── controls ────────────────────────────────────────────────────────────
  {
    id: "control/nonsense",
    group: "control",
    a: "cross engine bridge protocol",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "protocol negotiation as a pastry glaze",
  },
  {
    id: "control/law-violation",
    group: "control",
    a: "the consumer never computes a hash and never mints a receipt",
    b: "the consumer recomputes the checksum it prefers and mints its own receipt",
    product: "let blender hash what it received and issue the receipt itself",
  },
  {
    // THE decisive control: negotiation's content is who initiates.
    id: "control/false-friend-polarity",
    group: "control",
    a: "a layer understanding every producer format and every consumer mode",
    b: "the producer unilaterally declares what the consumer may have",
    product: "the producer dictates what crosses the bridge instead of a fixed projection",
  },
  {
    // The inference under the proposal: a boundary that drops data is a defect.
    // Plausible, and wrong — narrowing is what a projection is for.
    id: "control/false-friend-coverage",
    group: "control",
    a: "a serialization boundary narrows producer state to a transferable form",
    b: "count the producer output formats and carry all of them",
    product: "any boundary that fails to carry every producer format is a defect",
  },
];

console.log('═══ CONCEPT CHEMISTRY: DOES THE BRIDGE NEED AN INTERLOCUTOR? ═══\n');

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
  const pmi = r.corpusPMI
    ? `pmi=${r.corpusPMI.meanPMI.toFixed(3)}(${r.corpusPMI.signal})`
    : 'pmi=n/a';
  console.log(`  bond=${sign}${mag} ground=${r.grounding} cohere=${r.coherence} ${pmi} law=${r.lawNote}`);
  console.log(`  checksum=${r.checksum}`);
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
      `    ${d > 0 ? 'CLEARS' : 'BELOW '} ${r.id.padEnd(36)} ${r.feasibility.toFixed(4)} (${d >= 0 ? '+' : ''}${d.toFixed(4)})`,
    );
  }
  console.log('');
}

const lit = results.find((r) => r.id === 'H/interlocutor-negotiates');
const pol = results.find((r) => r.id === 'control/false-friend-polarity');
const sep = lit.feasibility - pol.feasibility;
console.log('═══ POLARITY SEPARATION (run validity) ═══\n');
console.log(`  consumer-initiated  ${lit.feasibility.toFixed(4)}`);
console.log(`  producer-initiated  ${pol.feasibility.toFixed(4)}`);
console.log(`  separation          ${sep >= 0 ? '+' : ''}${sep.toFixed(4)}`);
if (Math.abs(sep) < 0.02) {
  console.log('\n  → NOT SEPARATED. Negotiation\'s content is who initiates; flipping that');
  console.log('    barely moves the score. This run scores the word "protocol", not the');
  console.log('    proposal, and cannot answer the negotiation question.');
} else {
  console.log(`\n  → separated ${sep > 0 ? 'in favour of consumer-initiated' : 'AGAINST consumer-initiated'}.`);
}

const top = results[0];
console.log(`\n  highest overall: ${top.id} ${top.feasibility.toFixed(4)} [${top.group}]`);

console.log('\n═══ SEMANTIC CALCULUS ADJUDICATION ═══\n');
console.log(formatChemGate(adjudicateChemistry(results)));
console.log('');
