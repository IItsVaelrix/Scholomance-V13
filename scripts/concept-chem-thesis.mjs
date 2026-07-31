#!/usr/bin/env node
/**
 * Concept Chemistry: Falsify or validate the thesis:
 * "We need a unifying theorem of Scholomance expressed as chemical formulas"
 */
import { synthesize, bondEnergy, lawGate } from '../codex/core/pixelbrain/concept-chemistry.js';

// The actual substrate: document titles/summaries from the encyclopedia
const corpus = [
  "determinism law requires all outputs reproducible from seed",
  "curation law requires human approval for stored knowledge",
  "vaelrix law 19 sections governing all scholomance operations",
  "pixelbrain pipeline stages scdl construction genes vri render",
  "defold bridge sealed packet cross engine verification",
  "concept chemistry feasibility scoring deterministic synthesis",
  "art gene binding channels geometry contour lighting atmosphere texture density palette",
  "construction solver geometric primitives constraints proportions ellipse conic ribbon capsule",
  "memory substrate persistent cross session knowledge accumulation",
  "agents codex claude gemini cursor specialized roles charter",
  "application binary interface versioned packet format content addressed checksum",
  "white paper instruction manual defold bridge runtime",
  "scene graph transforms instances vector operations part identity",
  "reference image silhouette mould scan sealed blueprint",
  "engineering rulebook mandatory quality gates production polish",
  "resonance law compile perception into deterministic memory",
  "schema contract all typescript schemas owned by codex",
  "overlay integrity truesight overlay contract",
  "unity cross domain synthesis documentation keeper",
  "production polish nine step pre commit ritual",
];

// Grounding: fraction of corpus docs that share tokens with the concept
function groundingScore(concept) {
  const toks = new Set(
    concept.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  );
  let hits = 0;
  for (const doc of corpus) {
    const docToks = new Set(doc.toLowerCase().split(/\s+/));
    const overlap = [...toks].filter(t => docToks.has(t));
    if (overlap.length > 0) hits++;
  }
  return hits / corpus.length;
}

const reactions = [
  {
    id: "thesis-core",
    a: "unifying theorem of institutional knowledge",
    b: "mathematical chemical formulas",
    product: "scholomance expressed as deterministic chemical synthesis notation"
  },
  {
    id: "laws-as-elements",
    a: "nineteen vaelrix laws governing operations",
    b: "periodic table of chemical elements with valence",
    product: "law elements with valence bonds and deterministic reaction rules"
  },
  {
    id: "pdrs-as-compounds",
    a: "problem diagnosis reports with symptoms and fixes",
    b: "molecular compounds with structural formulas",
    product: "PDR compounds with stoichiometric relationships and reaction yields"
  },
  {
    id: "pipeline-as-reaction-chain",
    a: "asset generation pipeline stages scdl construction genes vri render",
    b: "chemical reaction mechanisms with intermediates and rate constants",
    product: "pipeline stages as elementary reactions with deterministic rate constants"
  },
  {
    id: "substrate-as-solvent",
    a: "persistent memory substrate cross session accumulation",
    b: "chemical solvent enabling reactions with concentration",
    product: "substrate as reaction medium with concentration and activation energy"
  },
  {
    id: "agents-as-catalysts",
    a: "ai agents codex claude gemini cursor specialized roles",
    b: "chemical catalysts lowering activation energy substrate specificity",
    product: "agents as catalysts with substrate specificity and turnover number"
  },
  {
    id: "tests-as-equilibrium",
    a: "deterministic test suites reproducibility verification",
    b: "chemical equilibrium constants Le Chatelier principle",
    product: "test pass rate as equilibrium position with deterministic response"
  },
  {
    id: "abi-as-crystal",
    a: "application binary interface sealed packet versioned format",
    b: "crystallographic lattice with unit cell and space group",
    product: "sealed packets as unit cells in a deterministic crystal lattice"
  },
  {
    id: "nonsense-control",
    a: "unifying theorem of knowledge",
    b: "banana bread recipe with flour and sugar",
    product: "scholomance as pastry with frosting"
  },
  {
    id: "law-violation-control",
    a: "unifying theorem",
    b: "random non-deterministic unseeded generation",
    product: "scholomance as unseeded random stochastic prose"
  }
];

console.log('═══ CONCEPT CHEMISTRY: UNIFYING THEOREM THESIS ═══\n');
console.log(`Corpus: ${corpus.length} substrate documents\n`);

const results = reactions.map(r => {
  const gA = groundingScore(r.a);
  const gB = groundingScore(r.b);
  const res = synthesize({ a: r.a, b: r.b, product: r.product, groundingA: gA, groundingB: gB });
  return { id: r.id, groundingA: gA, groundingB: gB, ...res };
});

// Sort by feasibility descending
results.sort((a, b) => b.feasibility - a.feasibility);

for (const r of results) {
  const bar = '█'.repeat(Math.round(r.feasibility * 40));
  console.log(`${r.stability.padEnd(12)} ${r.feasibility.toFixed(4)}  ${bar}`);
  console.log(`  ${r.id}`);
  console.log(`  bond=${r.bond} ground=${r.grounding} cohere=${r.coherence} law=${r.lawNote}`);
  console.log(`  groundingA=${r.groundingA.toFixed(3)} groundingB=${r.groundingB.toFixed(3)}`);
  console.log(`  checksum=${r.checksum}`);
  console.log('');
}

// Verdict
const thesis = results.find(r => r.id === 'thesis-core');
const controls = results.filter(r => r.id.includes('control'));
const viable = results.filter(r => r.stability !== 'UNSTABLE' && !r.id.includes('control'));

console.log('═══ VERDICT ═══\n');
console.log(`Thesis core: ${thesis.stability} (${thesis.feasibility.toFixed(4)})`);
console.log(`Viable syntheses: ${viable.length}/${results.length - controls.length}`);
console.log(`Controls: ${controls.map(c => `${c.id}=${c.stability}`).join(', ')}`);

if (thesis.stability === 'STABLE') {
  console.log('\n✅ VALIDATED: The unifying theorem is a STABLE synthesis.');
} else if (thesis.stability === 'METASTABLE') {
  console.log('\n⚠️  CONDITIONALLY VALIDATED: The thesis is METASTABLE — viable but needs');
  console.log('   additional grounding (more corpus attestation) to reach STABLE.');
} else {
  console.log('\n❌ FALSIFIED: The thesis is UNSTABLE under current substrate grounding.');
}
