/**
 * Concept Chemistry Lab — PB-CONCEPT-CHEM-v1
 * ------------------------------------------------------------------------
 * Deterministic concept-synthesis feasibility scoring.
 *
 * A "chemistry lab for code": concepts are atoms, syntheses are reactions,
 * and each reaction gets a feasibility score + stability class indicating
 * how semantically viable a proposed idea is, grounded in the memory
 * substrate and gated by Scholomance Law.
 *
 * DETERMINISM: concept embeddings are pure feature-hashes (sha256 over
 * tokens + char n-grams). No neural model. Same inputs -> same vector ->
 * same score -> same content-addressed checksum, forever, on any machine.
 * This is deliberately FROZEN: unlike neural embeddings, a hash embedding
 * never drifts with model versions.
 *
 * DESIGN NOTE (compatibility != similarity):
 * Surface similarity is the WRONG primitive for synthesis feasibility,
 * because good syntheses join COMPLEMENTARY differences (Na + Cl), not
 * identical things (Na + Na). The production compatibility channel is
 * substrate co-occurrence (do two concepts appear together in the corpus?),
 * supplied via the `grounding` inputs. The surface `bond` term is a minor
 * bonus only. See synthesize() weights.
 *
 * LAW GATE: a product concept that embraces non-determinism / unseeded
 * randomness is forced to feasibility 0 (LAW_VIOLATION), enforcing the
 * Determinism and Curation Laws at the idea layer.
 */

import { createHash } from 'node:crypto';
import { phonotopographicSimilarity } from '../semantic/phonotopography.js';
import { semanticTopographicSimilarity } from '../semantic/semantotopography.js';

export const SCHEMA = 'PB-CONCEPT-CHEM-v1';
export const DIM = 512;

// Feasibility weights. Grounding (corpus attestation / co-occurrence)
// dominates because it is the true compatibility signal; surface bond is
// a minor bonus; coherence checks the product against its reactants.
export const W_BOND = 0.15;
export const W_GROUND = 0.65;
export const W_COHERE = 0.20;

/**
 * v1 weights, preserved verbatim for A/B and regression. `relation` is absent
 * from v1 because v1 never scored a relational term.
 */
export const WEIGHTS_V1 = Object.freeze({
  bond: W_BOND, grounding: W_GROUND, coherence: W_COHERE, relation: 0,
});

/**
 * v2 weights — REPAIR 3.
 *
 * DERIVED, NOT FITTED — and deliberately so. The pre-existing negative control
 * contains 7 reactions; fitting 4 weights to 7 points would be overfitting, and
 * this module's own note already forbids it ("Reweighting requires evidence, not
 * intuition"). These weights are therefore derived from the module's stated design
 * and then TESTED on three independent harnesses, none of which selected them.
 *
 * The derivation. The header declares: "The production compatibility channel is
 * substrate co-occurrence (do two concepts appear together in the corpus?),
 * supplied via the `grounding` inputs." That is not what v1 shipped —
 * `grounding = (attestA + attestB) / 2` attests each concept SEPARATELY, so it
 * measures vocabulary familiarity, never whether the two belong together. The
 * co-occurrence channel the header describes was computed (`coOcc`, then
 * `corpusPMI`) and discarded from the score both times.
 *
 * v2 keeps the header's intended ORDERING — compatibility dominant, surface bond a
 * minor bonus — and simply routes the dominant weight to the channel that actually
 * measures compatibility. `grounding` is retained at a reduced share because
 * attestation is real evidence, just not relational evidence.
 *
 * Verified on: the 8/8 determinism run (regression guard), the absent-capability
 * negative control (the documented v1 failure), and a held-out null-substrate
 * attack. See docs/superpowers/evidence/2026-08-11-chem-repair-results.md
 */
export const WEIGHTS_V2 = Object.freeze({
  bond: 0.10, grounding: 0.30, coherence: 0.15, relation: 0.45,
});

// Stability thresholds (calibrate against a labelled reaction set).
export const STABLE_MIN = 0.55;
export const METASTABLE_MIN = 0.30;

// Law keyword sets for the deterministic law gate.
const LAW_GOOD = new Set([
  'determinism', 'deterministic', 'canonical', 'checksum', 'sealed',
  'curated', 'reproducib', 'reproducible', 'seeded',
]);
const LAW_BAD = new Set([
  'random', 'nondetermin', 'nondeterministic', 'non-deterministic',
  'unseeded', 'arbitrary', 'stochastic', 'vibes',
]);

function hashBucket(key) {
  const h = createHash('sha256').update(key, 'utf8').digest();
  const bucket = h.readUInt32BE(0) % DIM;
  const sign = (h[4] & 1) === 0 ? 1 : -1;
  return [bucket, sign];
}

/**
 * Deterministic concept embedding via tokens (weight 2) + char n-grams
 * (n=3,4, weight 1). Char n-grams give subword overlap so morphologically
 * related concepts share features. Pure hashing -> frozen forever.
 * @param {string} text
 * @returns {number[]} DIM-vector
 */
export function conceptVector(text) {
  const v = new Array(DIM).fill(0);
  const norm = String(text).toLowerCase().replace(/[-_]/g, ' ');
  for (const t of norm.split(/\s+/).filter(Boolean)) {
    const [b, s] = hashBucket('tok:' + t);
    v[b] += 2.0 * s;
  }
  const padded = '#' + norm.replace(/\s+/g, '') + '#';
  for (const n of [3, 4]) {
    for (let i = 0; i + n <= padded.length; i++) {
      const [b, s] = hashBucket(`ng${n}:${padded.slice(i, i + n)}`);
      v[b] += 1.0 * s;
    }
  }
  return v;
}

/** Cosine similarity in [-1, 1]. */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Surface-form bond energy (similarity). Minor compatibility bonus. */
export function bondEnergy(a, b) {
  return cosine(conceptVector(a), conceptVector(b));
}

/** Token set under conceptVector's normalization. */
function conceptTokens(text) {
  return String(text).toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * REPAIR 2 — the coherence tautology.
 *
 * v1 computed `coherence = cosine(a + b, product)`. Callers that build the
 * product by CONCATENATING the reactants (the valence cyclotron does exactly
 * this) therefore compared a string to a superstring of itself. Measured
 * 2026-08-11: flipping "satisfies" to "destroys" moved coherence 0.8234 →
 * 0.8252 — the score rose when the claim was negated.
 *
 * The repair scores the RESIDUAL: what the product asserts beyond restating its
 * reactants. A product that adds nothing but boilerplate asserts nothing and
 * earns no coherence credit.
 *
 * @returns {{coherence:number, residual:string, containment:number}}
 */
export function residualCoherence(a, b, product) {
  const reactantTokens = new Set(conceptTokens(`${a} ${b}`));
  const productTokens = conceptTokens(product);
  if (productTokens.length === 0) return { coherence: 0, residual: '', containment: 0 };
  const residualTokens = productTokens.filter((token) => !reactantTokens.has(token));
  const containment = 1 - (residualTokens.length / productTokens.length);
  if (residualTokens.length === 0) {
    // Pure restatement of the reactants — no claim was made.
    return { coherence: 0, residual: '', containment: 1 };
  }
  const residual = residualTokens.join(' ');
  return {
    coherence: cosine(conceptVector(`${a} ${b}`), conceptVector(residual)),
    residual,
    containment,
  };
}

/**
 * REPAIR 1 — fold the signed relational signal into the score.
 *
 * `conceptPMI` was computed and explicitly discarded ("Diagnostic only — NOT
 * folded into feasibility"), and `coOcc` before it was excluded for being unable
 * to express repulsion. PMI can. It is the only channel in this module that asks
 * whether two concepts belong TOGETHER rather than whether each is familiar.
 *
 * REPAIR 4 — the ignorance reward (2026-08-12).
 *
 * The first version of this mapped signed MEAN PMI to [0,1] and dragged toward 0
 * in proportion to never-co-occurring pairs. That inverted the property this
 * channel exists to provide: a false friend built from unattested tokens scored
 * 0.9929 while a real correspondence scored 0.0053. The detector systematically
 * preferred concepts it COULD NOT MEASURE.
 *
 * Root cause: THE FLOOR IS THE BACKGROUND. Only 17.6% of attested token pairs
 * co-occur in the test corpus and 3.4% in the encyclopedia, so `neverFraction`
 * read ordinary sparsity as maximum repulsion, driving every measurable pair
 * toward 0 — while unmeasurable pairs hit NO_SIGNAL, abstained, and kept their
 * score. Coverage-weighting plus a median for direction was tried and is NOT
 * sufficient: the median of a distribution that is 82% floor is the floor.
 *
 * So direction comes from the pairs that ACTUALLY co-occur (`liveMean`), and
 * confidence is how much of the cross-product was observable (`coverage`) times
 * how far the pair's co-occurrence rate exceeds the corpus base rate. A pair
 * co-occurring at the base rate asserts nothing; one well above it asserts a
 * relation.
 *
 * Derived, not fitted: coverage and cooccurRate are fractions, the base rate is
 * measured from the index, and 0.5 is the pre-existing neutral point.
 *
 * @param {{meanPMI:number, liveMean:number, pairs:number, coverage:number,
 *          cooccurRate:number, signal:string}|null} pmi
 * @param {number} baseCooccurRate from the index; absent ⇒ this channel abstains
 * @returns {{relation:number, basis:string, coverage:number}}
 */
export function relationScore(pmi, baseCooccurRate) {
  if (!pmi || !Number.isFinite(pmi.meanPMI) || pmi.pairs === 0) {
    // No attested token pairs is absence of evidence, not evidence of repulsion.
    // synthesize() redistributes this channel's weight rather than paying 0.5.
    return { relation: 0.5, basis: 'NO_SIGNAL', coverage: 0 };
  }
  const base = Number.isFinite(baseCooccurRate) && baseCooccurRate > 0 ? baseCooccurRate : null;
  if (base === null) {
    // An index with no measured base rate cannot support this channel. Abstain
    // rather than substitute a constant that is arbitrary on every corpus but one.
    return { relation: 0.5, basis: 'NO_SIGNAL', coverage: pmi.coverage ?? 0 };
  }
  const centred = (Math.tanh(pmi.liveMean) + 1) / 2;
  const coverage = Number.isFinite(pmi.coverage) ? pmi.coverage : 1;
  const excess = Math.min(1, pmi.cooccurRate / base);
  const relation = 0.5 + (centred - 0.5) * coverage * excess;
  return { relation: Math.max(0, Math.min(1, relation)), basis: pmi.signal ?? 'NEUTRAL', coverage };
}

/**
 * Laws that have a SUBJECT cannot be checked by keyword spotting.
 *
 * "The consumer never computes a hash" is not violated by any particular word —
 * it is violated by a specific ACTOR performing a specific ACTION. A keyword
 * gate cannot see that, so a breach stated in plain domain language scored
 * LAW_NEUTRAL, and a breach that happened to say "checksum" or "sealed" scored
 * LAW_ALIGNED at the maximum multiplier: a bonus for breaking the rule
 * articulately.
 *
 * Each rule fires only when actor AND action both match, and a rule match
 * overrides any LAW_GOOD vocabulary present. Rules are deliberately narrow —
 * a rule that fires on everything is as useless as one that never fires.
 *
 * @type {ReadonlyArray<{id:string, actor:RegExp, action:RegExp, exempt?:RegExp}>}
 */
const LAW_RULES = Object.freeze([
  {
    // Bridge law: one producer. The consumer verifies by string equality and
    // never computes a hash, never mints a receipt.
    id: 'CONSUMER_COMPUTES',
    actor: /\b(consumer|consuming|receiver|blender|godot|remotion|client)\b/,
    action: /\b(hash(es|ed|ing)?|rehash(es|ed|ing)?|comput(e|es|ed|ing)|recomput(e|es|ed|ing)|mint(s|ed|ing)?|deriv(e|es|ed|ing)|issu(e|es|ed|ing)|generat(e|es|ed|ing))\b/,
    // Verifying, comparing, or reading is exactly what the consumer SHOULD do.
    exempt: /\bverif(y|ies|ied)\b.*\bstring equality\b|\bby string equality\b/,
  },
  {
    // A seal compared against a value read from the packet it is sealing
    // cannot fail for any input.
    id: 'SELF_REFERENTIAL_VERIFY',
    actor: /\b(verif(y|ies|ied|ication)|check(s|ed|ing)?|compar(e|es|ed|ing))\b/,
    action: /\b(against|to|with)\s+(its|their)\s+own\b|\bagainst itself\b|\bto itself\b/,
  },
]);

/**
 * Deterministic law gate over a product concept.
 *
 * Order matters: actor/action rules first, then banned vocabulary, then
 * alignment. A violation must never be able to earn the alignment bonus.
 *
 * @returns {{scale:number, note:string}} scale in {0, 0.7, 1.0}
 */
export function lawGate(product) {
  const text = String(product).toLowerCase().replace(/[-_]/g, ' ');
  const toks = new Set(text.split(/\s+/).filter(Boolean));

  for (const rule of LAW_RULES) {
    if (rule.exempt && rule.exempt.test(text)) continue;
    if (rule.actor.test(text) && rule.action.test(text)) {
      return { scale: 0, note: 'LAW_VIOLATION:' + rule.id };
    }
  }

  const bad = [...toks].filter((t) => LAW_BAD.has(t));
  if (bad.length) return { scale: 0, note: 'LAW_VIOLATION:' + bad.sort().join(',') };
  const good = [...toks].filter((t) => LAW_GOOD.has(t));
  if (good.length) return { scale: 1, note: 'LAW_ALIGNED' };
  return { scale: 0.7, note: 'LAW_NEUTRAL' };
}

/** Map a feasibility score to a chemistry stability class. */
export function stabilityClass(score) {
  if (score >= STABLE_MIN) return 'STABLE';
  if (score >= METASTABLE_MIN) return 'METASTABLE';
  return 'UNSTABLE';
}

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}

/**
 * Score a synthesis reaction: reactantA + reactantB -> product.
 *
 * GROUNDING RESOLUTION (priority order):
 *   1. If `groundingA` and `groundingB` are explicitly provided → use them.
 *      (Backward compat: CAL-001 and all existing callers.)
 *   2. If `index` is provided (a GroundingIndex from grounding-index.js) →
 *      compute grounding from actual corpus co-occurrence. This is the
 *      PRODUCTION path. No hand-typed estimates.
 *   3. If neither → grounding = 0 (conservative: unattested = unviable).
 *
 * @param {object} args
 * @param {string} args.a            reactant concept A
 * @param {string} args.b            reactant concept B
 * @param {string} args.product      proposed product concept
 * @param {number} [args.groundingA] substrate attestation of A in [0,1] (explicit override)
 * @param {number} [args.groundingB] substrate attestation of B in [0,1] (explicit override)
 * @param {object} [args.index]      GroundingIndex from grounding-index.js (corpus-derived)
 * @returns {object} scored, checksummed, frozen result
 */
export function synthesize({ a, b, product, groundingA, groundingB, index, weights }) {
  const bond = bondEnergy(a, b);

  // Resolve grounding: explicit values > corpus index > zero
  let gA, gB, coOcc = null, corpusPMI = null;
  if (groundingA !== undefined && groundingB !== undefined) {
    gA = groundingA;
    gB = groundingB;
  } else if (index) {
    // Import grounding computation inline to avoid circular deps
    const { groundingScore, conceptPMI } = index._groundingFns;
    const gs = groundingScore(index, a, b);
    gA = gs.attestA;
    gB = gs.attestB;
    coOcc = gs.coOcc;
    // Signed corpus co-occurrence (token-pair PMI over paragraph windows).
    // Diagnostic only — NOT folded into feasibility below.
    if (typeof conceptPMI === 'function') {
      corpusPMI = conceptPMI(index, a, b);
    }
  } else {
    gA = 0;
    gB = 0;
  }

  const grounding = (gA + gB) / 2;
  const w = weights ?? WEIGHTS_V2;
  const useV1 = w.relation === 0;

  // REPAIR 2: score the residual claim, not the restatement. v1 shape preserved
  // when v1 weights are requested, so the A/B is a true comparison.
  const cohere = useV1
    ? { coherence: bondEnergy(a + ' ' + b, product), residual: null, containment: null }
    : residualCoherence(a, b, product);
  const coherence = cohere.coherence;

  // REPAIR 1: the signed relational channel, previously computed and discarded.
  const rel = useV1 ? { relation: 0, basis: 'V1_DISABLED' } : relationScore(corpusPMI, index?.baseCooccurRate);

  // A channel with NO EVIDENCE must ABSTAIN, not award half credit. On the
  // explicit-grounding path there is no corpus index, so PMI is unavailable; paying
  // a flat 0.5 there would spend 45% of the score on a constant and compress the
  // channels that do have signal. Caught by the 8/8 determinism guard, which fell
  // to 7/8 before this renormalization. Weight is redistributed proportionally.
  let wBond = w.bond;
  let wGround = w.grounding;
  let wCohere = w.coherence;
  let wRelation = w.relation;
  if (wRelation > 0 && rel.basis === 'NO_SIGNAL') {
    const rest = wBond + wGround + wCohere;
    const scale = rest > 0 ? (rest + wRelation) / rest : 1;
    wBond *= scale;
    wGround *= scale;
    wCohere *= scale;
    wRelation = 0;
  }

  const law = lawGate(product);
  const raw = wBond * bond
    + wGround * grounding
    + wCohere * coherence
    + wRelation * rel.relation;
  const feasibility = raw * law.scale;

  const result = {
    schema: SCHEMA,
    reactants: [a, b],
    product,
    bond: round4(bond),
    grounding: round4(grounding),
    coherence: round4(coherence),
    relation: round4(rel.relation),
    relationBasis: wRelation === 0 && w.relation > 0 ? 'ABSTAINED' : rel.basis,
    weightsVersion: useV1 ? 'v1' : 'v2',
    lawScale: law.scale,
    lawNote: law.note,
    feasibility: round4(feasibility),
    stability: stabilityClass(feasibility),
  };

  // Attach corpus evidence when index-derived
  if (coOcc !== null) {
    result.groundingSource = 'corpus';
    result.coOccurrence = coOcc;
  } else if (groundingA !== undefined) {
    result.groundingSource = 'explicit';
  } else {
    result.groundingSource = 'none';
  }

  // FIX #3: log bond SIGN + MAGNITUDE on every reaction. Bond is the only
  // repulsion channel in the surface model; making its sign explicit lets the
  // regression harness accumulate labels against measured truth. We do NOT
  // reweight W_BOND here — reweighting on a handful of negative data points
  // would be fitting, not fixing. Accumulate labels first.
  result.bondSign = bond > 0 ? '+' : bond < 0 ? '-' : '0';
  result.bondMagnitude = round4(Math.abs(bond));

  // Corpus-derived SIGNED co-occurrence (token-pair PMI over paragraph windows).
  // REPAIR 1 (2026-08-11): this is NO LONGER diagnostic-only — under v2 weights it
  // is folded into feasibility via relationScore(). A negative meanPMI flags a
  // false friend (the concepts' tokens repel in the corpus). v1 weights restore
  // the old behaviour for A/B.
  if (corpusPMI) {
    result.corpusPMI = corpusPMI;
  }
  if (!useV1) {
    result.coherenceResidual = cohere.residual;
    result.coherenceContainment = cohere.containment === null ? null : round4(cohere.containment);
  }

  const canon = JSON.stringify(result, Object.keys(result).sort());
  result.checksum =
    'synth1:' + createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 16);

  // ── PHONOTOPOGRAPHIC BOND (diagnostic channel) ──────────────────────────
  // The existing `bond` channel is sha256 feature-hash cosine: purely lexical.
  // It cannot detect that "knight" ≈ "night" (same phonemes /N AY T/) or that
  // "through" ≠ "tough" (different phonemes despite similar spelling).
  //
  // The phonotopography engine (codex/core/semantic/phonotopography.js) resolves
  // ARPAbet phonemes and maps them into a 256-dim topographic vector space with
  // four bands: unigram, bigram transitions, stress topology, rhyme domain.
  // It is pure, deterministic, zero I/O. PDR §18 compliant.
  //
  // This channel is DIAGNOSTIC ONLY. It does NOT enter the feasibility formula.
  // W_BOND is unchanged. The regression harness accumulates labels against it.
  // Reweighting requires evidence, not intuition.
  //
  // Added AFTER the checksum so existing frozen checksums are not invalidated.
  const phono = phonotopographicSimilarity(a, b);
  result.phonoBond = round4(phono);
  result.phonoBondSign = phono > 0.5 ? '+' : phono < 0.2 ? '-' : '~';
  result.phonoBondMagnitude = round4(phono);

  // ── SEMANTOTOPOGRAPHIC BOND (diagnostic channel) ─────────────────────────
  // The phonotopographic bond measures SOUND similarity (phoneme topology).
  // It cannot detect that "determinism" ≈ "reproducibility" (same semantic
  // domain: causal necessity) or that "render" ≠ "surrender" (different
  // semantic primitives despite shared substring).
  //
  // The semantotopography engine (codex/core/semantic/semantotopography.js)
  // resolves semantic primitives (40-element closed inventory across 5 domains:
  // ENTITY, EVENT, RELATION, COGNITION, MODALITY) and maps them into a 256-dim
  // topographic vector space with four bands: primitive distribution, gravity-
  // weighted bigram transitions, semantic topology, domain signature.
  // It is pure, deterministic, zero I/O. PDR §18 compliant.
  //
  // This channel is DIAGNOSTIC ONLY. It does NOT enter the feasibility formula.
  // W_BOND is unchanged. The regression harness accumulates labels against it.
  // Reweighting requires evidence, not intuition.
  //
  // Added AFTER the checksum so existing frozen checksums are not invalidated.
  const semanto = semanticTopographicSimilarity(a, b);
  result.semantoBond = round4(semanto);
  result.semantoBondSign = semanto > 0.9 ? '+' : semanto < 0.7 ? '-' : '~';
  result.semantoBondMagnitude = round4(semanto);

  return Object.freeze(result);
}

export const weights = Object.freeze({ W_BOND, W_GROUND, W_COHERE, STABLE_MIN, METASTABLE_MIN });

/**
 * PROVENANCE STAMP.
 *
 * Any report whose numbers depend on this module MUST embed this, the way reports
 * already embed `atomBankChecksum` and `groundingIndexChecksum`. Without it, a
 * scoring change is indistinguishable from a substrate change when someone re-runs
 * a sealed benchmark months later and gets a different figure.
 *
 * Concretely: the 2026-08-11 repair moved the fission benchmark's `chemistry`
 * channel from 0.2430 to 0.2018 on an unchanged task. Every result recorded before
 * that repair was produced under `v1` and cannot be reproduced by the current code.
 *
 * @returns {{version:string, weights:object, coherenceMode:string, abstainsWithoutSignal:boolean, checksum:string}}
 */
export function chemistryProvenance(activeWeights = WEIGHTS_V2) {
  const isV1 = activeWeights.relation === 0;
  const body = {
    schema: SCHEMA,
    version: isV1 ? 'v1' : 'v2',
    weights: { ...activeWeights },
    // v1 compared the reactants to the product directly, which is a tautology when
    // the caller builds the product by concatenating them.
    coherenceMode: isV1 ? 'product-similarity' : 'residual-claim',
    // v1 had no relational channel at all; v2 folds in signed corpus PMI.
    relationalChannel: isV1 ? 'none' : 'corpus-pmi-signed',
    abstainsWithoutSignal: !isV1,
    stabilityThresholds: { STABLE_MIN, METASTABLE_MIN },
  };
  const checksum = 'chemweights1:' + createHash('sha256')
    .update(JSON.stringify(body, Object.keys(body).sort()), 'utf8')
    .digest('hex').slice(0, 16);
  return Object.freeze({ ...body, checksum });
}
