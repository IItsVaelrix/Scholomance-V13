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

export const SCHEMA = 'PB-CONCEPT-CHEM-v1';
export const DIM = 512;

// Feasibility weights. Grounding (corpus attestation / co-occurrence)
// dominates because it is the true compatibility signal; surface bond is
// a minor bonus; coherence checks the product against its reactants.
export const W_BOND = 0.15;
export const W_GROUND = 0.65;
export const W_COHERE = 0.20;

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
export function synthesize({ a, b, product, groundingA, groundingB, index }) {
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
  const coherence = bondEnergy(a + ' ' + b, product);
  const law = lawGate(product);
  const raw = W_BOND * bond + W_GROUND * grounding + W_COHERE * coherence;
  const feasibility = raw * law.scale;

  const result = {
    schema: SCHEMA,
    reactants: [a, b],
    product,
    bond: round4(bond),
    grounding: round4(grounding),
    coherence: round4(coherence),
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

  // FIX #2: corpus-derived SIGNED co-occurrence (token-pair PMI over paragraph
  // windows). Diagnostic only — deliberately NOT part of the feasibility
  // formula. A negative meanPMI flags a false friend (the concepts' tokens
  // repel in the corpus). Correlate against measured truth before wiring in.
  if (corpusPMI) {
    result.corpusPMI = corpusPMI;
  }

  const canon = JSON.stringify(result, Object.keys(result).sort());
  result.checksum =
    'synth1:' + createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 16);
  return Object.freeze(result);
}

export const weights = Object.freeze({ W_BOND, W_GROUND, W_COHERE, STABLE_MIN, METASTABLE_MIN });
