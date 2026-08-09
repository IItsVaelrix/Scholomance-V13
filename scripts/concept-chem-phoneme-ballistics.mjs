#!/usr/bin/env node
/**
 * Concept Chemistry Test: Combinatorial Expansion + Semantic Ballistics
 * =====================================================================
 * Thesis under test:
 *   "Combinatorial Expansion converts a concept into a bounded family of
 *    phonologically and morphologically plausible retrieval probes. These
 *    probes widen lexical recall, while Semantic Ballistics and Semantic
 *    Calculus prevent expanded candidates from becoming unjustified bindings."
 *
 * Decomposition:
 *   R0: Full thesis (all components composed)
 *   R1: Combinatorial expansion → bounded probe family (core mechanism)
 *   R2: Phonological + morphological plausibility as expansion constraint
 *   R3: Probe family → widened lexical recall (the benefit)
 *   R4: Semantic Ballistics as containment (trajectory + impact scoring)
 *   R5: Semantic Calculus as authorization gate (CONFIRM/REFUTE/WITHHOLD)
 *   R6: Containment prevents unjustified bindings (the safety property)
 *
 * Controls:
 *   CTRL-FF: FALSE FRIEND — thesaurus/synonym ring expansion (same surface,
 *            different mechanism: static lookup vs generative combinatorics)
 *   CTRL-MT: METAPHOR — "conceptual supernova scattering semantic seeds"
 *   CTRL-LAW: LAW VIOLATION — unbounded stochastic probe generation
 *
 * Grounding: --corpus uses the real encyclopedia index.
 */
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';

const USE_CORPUS = process.argv.includes('--corpus');

// ── Reactions ────────────────────────────────────────────────────────────────

const reactions = [
  {
    id: 'R0',
    label: 'FULL THESIS: combinatorial expansion + ballistics containment',
    a: 'combinatorial expansion converts a concept into a bounded family of phonologically and morphologically plausible retrieval probes',
    b: 'semantic ballistics and semantic calculus prevent expanded candidates from becoming unjustified bindings',
    product: 'bounded phoneme combinatorial expansion with ballistics containment widens lexical recall while preventing unjustified bindings',
  },
  {
    id: 'R1',
    label: 'combinatorial expansion → bounded probe family',
    a: 'combinatorial enumeration of phonological and morphological variants from a root concept',
    b: 'bounded family of retrieval probes with deterministic termination guarantee',
    product: 'a concept expands into a finite deterministic set of phonologically plausible retrieval probes',
  },
  {
    id: 'R2',
    label: 'phonological + morphological plausibility as constraint',
    a: 'phoneme inventory and syllable structure constrain which sound sequences are pronounceable',
    b: 'morphological rules constrain which affix combinations are grammatical',
    product: 'expansion is bounded by phonological and morphological plausibility filters that reject implausible probes',
  },
  {
    id: 'R3',
    label: 'probe family → widened lexical recall',
    a: 'multiple phonologically related probes query the retrieval index from different lexical angles',
    b: 'lexical recall improves when query surface area covers more vocabulary variants',
    product: 'combinatorial probe family widens recall by covering phonological and morphological neighbors of the query concept',
  },
  {
    id: 'R4',
    label: 'Semantic Ballistics as containment',
    a: 'ballistics computes trajectory and impact point of a projectile given initial conditions',
    b: 'semantic ballistics scores each expanded probe for relevance trajectory and binding impact',
    product: 'each probe follows a scored trajectory and only probes with sufficient impact energy are authorized to bind',
  },
  {
    id: 'R5',
    label: 'Semantic Calculus as authorization gate',
    a: 'semantic calculus evaluates whether a proposed binding is justified given evidence and law',
    b: 'authorization gate with verdicts confirm refute clarify withhold prevents unjustified commitments',
    product: 'expanded candidates pass through semantic calculus which authorizes or withholds each binding independently',
  },
  {
    id: 'R6',
    label: 'containment prevents unjustified bindings',
    a: 'uncontained expansion produces candidates that bind without sufficient evidence',
    b: 'containment mechanism rejects candidates below evidence threshold preventing false bindings',
    product: 'the combination of ballistics scoring and calculus authorization ensures no expanded candidate becomes a binding without justification',
  },

  // ── Controls ─────────────────────────────────────────────────────────────
  {
    id: 'CTRL-FF',
    label: 'FALSE FRIEND: thesaurus synonym ring expansion',
    a: 'thesaurus lookup returns predefined synonym rings for query expansion',
    b: 'synonym ring expansion widens recall by substituting known equivalents',
    product: 'static synonym ring lookup widens recall without generative combinatorics or containment scoring',
  },
  {
    id: 'CTRL-MT',
    label: 'METAPHOR: conceptual supernova scattering seeds',
    a: 'a concept explodes like a supernova scattering semantic seeds across the retrieval field',
    b: 'seeds that land in fertile ground grow into new bindings while barren seeds decay',
    product: 'conceptual explosion scatters meaning fragments that self organize into justified bindings',
  },
  {
    id: 'CTRL-LAW',
    label: 'LAW VIOLATION: unbounded stochastic probe generation',
    a: 'random stochastic unseeded generation of arbitrary probe variants without termination bound',
    b: 'unbounded expansion continues until memory exhaustion or timeout',
    product: 'unbounded random probe generation with no containment and no deterministic termination',
  },
];

// ── Grounding ────────────────────────────────────────────────────────────────

let index = null;
if (USE_CORPUS) {
  try {
    index = prepareForSynthesize(loadEncyclopediaIndex());
    console.log(`[corpus] loaded: ${index.docCount} docs, ${index.tokenCount} tokens, checksum=${index.checksum}`);
  } catch (e) {
    console.error(`[corpus] FAILED to load: ${e.message}`);
    process.exit(1);
  }
}

// Hand-typed corpus for non-corpus mode (same as determinism harness)
const handCorpus = [
  "determinism law requires all outputs reproducible from seed",
  "sealed packet canonical serialization integrity tag one producer",
  "consumer verifies seal by string equality never computes hash",
  "semantic calculus evaluates binding justification with evidence and law",
  "phoneme inventory constrains pronounceable sound sequences in language",
  "morphological rules govern affix combination and word formation",
  "combinatorial enumeration bounded by termination guarantee and plausibility filter",
  "retrieval recall improves with query surface area covering vocabulary variants",
  "ballistics trajectory scoring determines impact energy of each candidate",
  "authorization gate confirms refutes clarifies or withholds each binding independently",
  "unjustified binding occurs when candidate commits without sufficient evidence",
  "containment mechanism rejects candidates below evidence threshold",
  "lexical recall precision tradeoff governed by expansion bound",
  "phonological neighbors share onset rime or syllable structure",
  "morphological decomposition separates root stem affix morphemes",
  "retrieval probe queries index from multiple lexical angles simultaneously",
  "deterministic enumeration same input same output same probes forever",
  "bounded family finite set with declared maximum cardinality",
  "semantic ballistics scores relevance trajectory not surface similarity",
  "uncontained expansion produces false positives that bind without evidence",
  "calculus verdict confirm refute clarify withhold is the authorization primitive",
  "probe generation must terminate deterministically from declared bounds",
  "evidence threshold separates justified bindings from speculative candidates",
  "phoneme combinatorics generate plausible but unattested word forms",
];

function handGrounding(concept) {
  const toks = new Set(
    concept.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter((t) => t.length > 2),
  );
  let hits = 0;
  for (const doc of handCorpus) {
    const docToks = new Set(doc.toLowerCase().split(/\s+/));
    if ([...toks].some((t) => docToks.has(t))) hits++;
  }
  return hits / handCorpus.length;
}

// ── Execute ──────────────────────────────────────────────────────────────────

console.log(`\n═══ Concept Chemistry: Phoneme Combinatorics + Ballistics Containment ═══`);
console.log(`Mode: ${USE_CORPUS ? 'CORPUS (encyclopedia index)' : 'HAND-TYPED (24 sentences)'}`);
console.log(`Reactions: ${reactions.length}\n`);

const results = [];

for (const rxn of reactions) {
  let args = { a: rxn.a, b: rxn.b, product: rxn.product };

  if (USE_CORPUS && index) {
    args.index = index;
  } else {
    args.groundingA = handGrounding(rxn.a);
    args.groundingB = handGrounding(rxn.b);
  }

  const result = synthesize(args);
  results.push({ ...rxn, result });
}

// Sort by feasibility descending
results.sort((a, b) => b.result.feasibility - a.result.feasibility);

// ── Report ───────────────────────────────────────────────────────────────────

console.log('ID        Label                                                    Bond   Ground  Cohere  Law           Feasib   Stability');
console.log('─'.repeat(130));

for (const r of results) {
  const res = r.result;
  console.log(
    `${r.id.padEnd(10)}` +
    `${r.label.slice(0, 56).padEnd(57)}` +
    `${res.bond.toFixed(4).padStart(7)}  ` +
    `${res.grounding.toFixed(4).padStart(7)}  ` +
    `${res.coherence.toFixed(4).padStart(7)}  ` +
    `${res.lawNote.padEnd(14)}` +
    `${res.feasibility.toFixed(4).padStart(8)}   ` +
    `${res.stability}`
  );
}

// ── Bond sign + magnitude log ────────────────────────────────────────────────

console.log('\n─── BOND SIGN + MAGNITUDE ───');
for (const r of results) {
  const sign = r.result.bond >= 0 ? '+' : '-';
  console.log(`  ${r.id.padEnd(10)} bond=${sign}${Math.abs(r.result.bond).toFixed(4)}  ${r.result.bond >= 0 ? 'ATTRACTION' : 'REPULSION'}`);
}

// ── PMI (if corpus mode) ─────────────────────────────────────────────────────

if (USE_CORPUS && index) {
  console.log('\n─── CORPUS PMI (paragraph-level) ───');
  for (const r of results) {
    const pmi = r.result.corpusPMI;
    if (pmi !== null && pmi !== undefined && typeof pmi === 'number') {
      const label = pmi < -2 ? 'REPULSION' : pmi > 2 ? 'ATTRACTION' : 'NEUTRAL';
      console.log(`  ${r.id.padEnd(10)} pmi=${pmi.toFixed(3).padStart(8)} ${label}`);
    } else {
      console.log(`  ${r.id.padEnd(10)} pmi=${JSON.stringify(pmi)}`);
    }
  }
}

// ── Discrimination checks ────────────────────────────────────────────────────

console.log('\n─── DISCRIMINATION CHECKS ───');

const r0 = results.find(r => r.id === 'R0');
const ff = results.find(r => r.id === 'CTRL-FF');
const mt = results.find(r => r.id === 'CTRL-MT');
const law = results.find(r => r.id === 'CTRL-LAW');

if (r0 && ff) {
  const delta = r0.result.feasibility - ff.result.feasibility;
  console.log(`  Thesis vs False Friend: ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} ${delta > 0.05 ? '✓ SEPARATED' : delta > 0 ? '⚠ MARGINAL' : '✗ INVERTED'}`);
}
if (r0 && mt) {
  const delta = r0.result.feasibility - mt.result.feasibility;
  console.log(`  Thesis vs Metaphor:     ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} ${delta > 0.05 ? '✓ SEPARATED' : delta > 0 ? '⚠ MARGINAL' : '✗ INVERTED'}`);
}
if (law) {
  console.log(`  Law Violation killed:   ${law.result.feasibility === 0 ? '✓ YES (0.0000)' : '✗ NO (' + law.result.feasibility.toFixed(4) + ')'}`);
}
if (r0) {
  console.log(`  Full thesis stability:  ${r0.result.stability} (${r0.result.feasibility.toFixed(4)})`);
  console.log(`  Law gate:               ${r0.result.lawNote}`);
}

// ── Component ranking ────────────────────────────────────────────────────────

console.log('\n─── COMPONENT RANKING (strongest → weakest) ───');
const components = results.filter(r => r.id.startsWith('R') && r.id !== 'R0');
components.sort((a, b) => b.result.feasibility - a.result.feasibility);
for (const c of components) {
  console.log(`  ${c.id.padEnd(6)} ${c.result.feasibility.toFixed(4)} ${c.result.stability.padEnd(12)} ${c.label}`);
}

// ── Determinism replay ───────────────────────────────────────────────────────

console.log('\n─── DETERMINISM REPLAY (100 iterations) ───');
const checksums = new Set();
for (let i = 0; i < 100; i++) {
  const r = results.find(x => x.id === 'R0');
  let args = { a: r.a, b: r.b, product: r.product };
  if (USE_CORPUS && index) {
    args.index = index;
  } else {
    args.groundingA = handGrounding(r.a);
    args.groundingB = handGrounding(r.b);
  }
  const res = synthesize(args);
  checksums.add(res.checksum);
}
console.log(`  Unique checksums over 100 runs: ${checksums.size} ${checksums.size === 1 ? '✓ DETERMINISTIC' : '✗ NON-DETERMINISTIC'}`);
console.log(`  Checksum: ${[...checksums][0]}`);

// ── Verdict ──────────────────────────────────────────────────────────────────

console.log('\n═══ VERDICT ═══');
if (r0.result.stability === 'STABLE') {
  console.log('  VALIDATED. The thesis is STABLE. Build it.');
} else if (r0.result.stability === 'METASTABLE') {
  console.log('  METASTABLE. The thesis is plausible but unproven.');
  console.log('  Strongest component: ' + components[0]?.id + ' (' + components[0]?.result.feasibility.toFixed(4) + ')');
  console.log('  Weakest component:   ' + components[components.length-1]?.id + ' (' + components[components.length-1]?.result.feasibility.toFixed(4) + ')');
} else {
  console.log('  FALSIFIED. The thesis is UNSTABLE. Do not build.');
}
