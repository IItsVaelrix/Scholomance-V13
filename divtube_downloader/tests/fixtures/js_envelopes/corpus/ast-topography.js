/**
 * AST TOPOGRAPHY ENGINE — Syntactic Topography Source Map
 *
 * The third inventory for the topography engine family.
 *
 *   phonotopography    text → phonemes (CMU dictionary)     → 256-dim vector
 *   semantotopography  text → semantic primitives (authored) → 256-dim vector
 *   ast-topography     source → syntactic facts (Babel)      → 256-dim vector
 *
 *   Band 0 (dims   0– 63): Syntactic kind distribution
 *   Band 1 (dims  64–127): Kind-sequence bigrams (nesting-weighted)
 *   Band 2 (dims 128–191): Structural topology (bucketed, never scalar)
 *   Band 3 (dims 192–255): Module signature — imports, hooks, receivers
 *
 * WHY AN AST INVENTORY BEATS AN AUTHORED ONE. Phonotopography works because CMU
 * is a real dictionary; the geometry is incidental. Semantotopography hand-authors
 * 40 primitives, which cannot cover English, so it falls back to a deterministic
 * hash — measured over 68,480 WordNet lemmas, that collapses the vocabulary into
 * 1,473 distinct classes (1.24% of random pairs bit-identical) and assigns
 * semantic content at random to anything it does not know.
 *
 * A parser has no out-of-vocabulary path. Every construct has an exact kind, and
 * source that will not parse yields `null` — a declared absence the caller can
 * see, the same contract as `SkillScores.semantic: number | null` in
 * `src/lib/career/graph/contracts.ts`. A resolver that always resolves is a check
 * that cannot fail; this one is allowed to say no.
 *
 * THE BAND LAW. Every band encodes in DIRECTION — which dims fire — never in
 * magnitude. Per-band L2 normalization discards magnitude by construction, so a
 * scalar written to a fixed dim is a value these vectors cannot carry: it gives
 * every input the same band direction and the band then reads ~1.0 for unrelated
 * material. Ratios select a BUCKET and the bucket index is the signal.
 *
 * Pure, deterministic, zero I/O — the caller supplies `{ path, content }`.
 */

import { parseSourceFacts } from '../../services/cleri-probe/babel-facts.adapter.js';

export const AST_BAND_COUNT = 4;
const BAND_WIDTH = 64;
const DIM = AST_BAND_COUNT * BAND_WIDTH;

// ── The closed inventory ─────────────────────────────────────────────────────
// Every entry is a kind Babel assigns, not a label anyone invented. Order is
// the dimension order and must stay stable: dim N means the same thing forever.

const FACT_KINDS = Object.freeze([
  'fact:function',
  'fact:call',
  'fact:effect',
  'fact:catch',
  'fact:binding',
  'fact:write',
  'fact:memberRead',
  'fact:externalRequest',
  'fact:guard',
  'fact:concurrentCallback',
  'fact:comment'
]);

const BINDING_KINDS = Object.freeze([
  'bind:import',
  'bind:const',
  'bind:let',
  'bind:var',
  'bind:param',
  'bind:function',
  'bind:class',
  'bind:other'
]);

const ARGUMENT_KINDS = Object.freeze([
  'arg:ArrowFunctionExpression',
  'arg:FunctionExpression',
  'arg:Identifier',
  'arg:StringLiteral',
  'arg:NumericLiteral',
  'arg:BooleanLiteral',
  'arg:NullLiteral',
  'arg:ObjectExpression',
  'arg:ArrayExpression',
  'arg:MemberExpression',
  'arg:CallExpression',
  'arg:TemplateLiteral',
  'arg:SpreadElement',
  'arg:ThisExpression',
  'arg:other'
]);

const SHAPE_KINDS = Object.freeze([
  'shape:effectWithCleanup',
  'shape:effectWithoutCleanup',
  'shape:catchEmpty',
  'shape:catchRethrows',
  'shape:callWithReceiver',
  'shape:callBare'
]);

/**
 * THE ONE PLACE THIS INVENTORY IS NOT PURELY PARSER-DERIVED, AND ITS FENCE.
 *
 * Some pathologies have no distinguishing fact kind: `Math.random()` is just a
 * `fact:call` whose callee happens to matter. Callee names are an OPEN
 * vocabulary, and hashing them into the inventory would rebuild
 * semantotopography's step-4 fallback one layer up — the exact failure this
 * engine exists to avoid.
 *
 * So the list is closed, and closed by a CRITERION rather than by taste:
 *
 *   a callee that introduces NONDETERMINISM into an otherwise pure path.
 *
 * A closed list without a stated criterion grows by ad-hoc addition until it is
 * open again. This one a reviewer can adjudicate: either the callee makes the
 * same input produce a different output, or it does not belong. Anything not on
 * this list yields no `callee:` kind at all — `resolveAstKinds` drops it rather
 * than minting a slot for it.
 */
export const NONDETERMINISM_CALLEES = Object.freeze([
  'Math.random',
  'Date.now',
  'performance.now',
  'crypto.randomUUID',
  'crypto.getRandomValues'
]);

const CALLEE_KINDS = Object.freeze(NONDETERMINISM_CALLEES.map(c => `callee:${c}`));
const CALLEE_KIND_SET = new Set(CALLEE_KINDS);

/**
 * Structural fence, enforced at module load rather than by review.
 *
 * Band 0 direct-indexes the inventory into 64 dims with no hashing, so an
 * inventory that outgrows the band would silently start aliasing — the aliasing
 * that band 3 was explicitly designed to avoid in phonotopography.
 */
export function assertInventoryFenced(inventory) {
  const seen = new Set();
  for (const kind of inventory) {
    if (seen.has(kind)) {
      throw new Error(`AST_INVENTORY_DUPLICATE: "${kind}" appears twice; dimensions must be unique.`);
    }
    seen.add(kind);
  }
  if (inventory.length > BAND_WIDTH) {
    throw new Error(
      `AST_INVENTORY_OVERFLOW: ${inventory.length} kinds exceed band 0's ${BAND_WIDTH} dimensions. ` +
      'Band 0 direct-indexes with no hashing; growing past the band would alias kinds onto each other.'
    );
  }
}

// Callee kinds are APPENDED, never inserted: the header contract is that dim N
// means the same thing forever, so vectors built before this list stay readable.
export const AST_INVENTORY = Object.freeze([
  ...FACT_KINDS,
  ...BINDING_KINDS,
  ...ARGUMENT_KINDS,
  ...SHAPE_KINDS,
  ...CALLEE_KINDS
]);

assertInventoryFenced(AST_INVENTORY);

export const AST_INDEX = new Map(AST_INVENTORY.map((kind, i) => [kind, i]));

// ── Deterministic hash ───────────────────────────────────────────────────────

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function bucketOf(ratio, bins) {
  return Math.max(0, Math.min(bins - 1, Math.floor(ratio * bins)));
}

function inventoryOr(prefix, value, fallback) {
  const key = `${prefix}:${value}`;
  return AST_INDEX.has(key) ? key : fallback;
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolve a source file to its ordered sequence of inventory kinds.
 *
 * Returns `null` when the parser refuses the source. That is the whole point:
 * there is no fallback that invents kinds for unparseable input.
 *
 * @param {{ path: string, content: string }} source
 * @returns {{ kinds: string[], facts: object } | null}
 */
export function resolveAstKinds(source) {
  let facts;
  try {
    facts = parseSourceFacts({ path: source?.path ?? '', content: source?.content ?? '' });
  } catch {
    return null;
  }
  if (!facts || facts.ok !== true) return null;

  // Ordered by source position so band 1 sees real adjacency, not map order.
  const positioned = [];
  const push = (kind, span, extra) => {
    positioned.push({ kind, line: Number(span?.startLine) || 0, extra });
  };

  for (const fn of facts.functions || []) push('fact:function', fn.span);

  for (const call of facts.calls || []) {
    push('fact:call', call.span, call);
    push(call.receiver ? 'shape:callWithReceiver' : 'shape:callBare', call.span);
    for (const arg of call.argumentKinds || []) {
      push(inventoryOr('arg', arg, 'arg:other'), call.span);
    }
    // Fenced: a callee outside NONDETERMINISM_CALLEES yields NO kind. There is
    // deliberately no `callee:other` bucket — one would turn "any call at all"
    // into a fired dimension and destroy the signal the list exists to carry.
    const calleeKind = `callee:${call.callee}`;
    if (CALLEE_KIND_SET.has(calleeKind)) push(calleeKind, call.span);
  }

  for (const effect of facts.effects || []) {
    push('fact:effect', effect.span, effect);
    push(
      effect.returnFunctionId || effect.returnsBindingName
        ? 'shape:effectWithCleanup'
        : 'shape:effectWithoutCleanup',
      effect.span
    );
  }

  for (const clause of facts.catchClauses || []) {
    push('fact:catch', clause.span, clause);
    // Field names are the parser's, verified against real output: a rethrow is
    // `throws: true` and an empty handler is an empty `bodyStatementKinds`.
    // Guessed names here fire never and read as a healthy inventory slot.
    if (clause.throws === true) push('shape:catchRethrows', clause.span);
    else if ((clause.bodyStatementKinds || []).length === 0) push('shape:catchEmpty', clause.span);
  }

  for (const binding of facts.bindings || []) {
    push('fact:binding', binding.span, binding);
    push(inventoryOr('bind', binding.kind, 'bind:other'), binding.span);
  }

  for (const write of facts.writes || []) push('fact:write', write.span);
  for (const read of facts.memberReads || []) push('fact:memberRead', read.span);
  for (const req of facts.externalRequests || []) push('fact:externalRequest', req.span);
  for (const guard of facts.guards || []) push('fact:guard', guard.span);
  for (const cb of facts.concurrentCallbacks || []) push('fact:concurrentCallback', cb.span);
  for (const comment of facts.comments || []) {
    positioned.push({ kind: 'fact:comment', line: Number(comment.startLine) || 0 });
  }

  positioned.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));

  return { kinds: positioned.map(p => p.kind), facts };
}

// ── The 256-dim vector ───────────────────────────────────────────────────────

/**
 * Generate a 256-dimensional AST topographic vector.
 *
 * @param {{ path: string, content: string }} source
 * @returns {Float32Array | null} null when the source does not parse
 */
export function generateAstTopographicVector(source) {
  const resolved = resolveAstKinds(source);
  if (!resolved) return null;

  const { kinds, facts } = resolved;
  const vec = new Float32Array(DIM);
  if (kinds.length === 0) return vec;

  // ── Band 0 (0–63): syntactic kind distribution ────────────────────────
  // Direct-indexed against the closed inventory. No hashing, no aliasing —
  // the property that makes phonotopography's band 0 trustworthy.
  for (const kind of kinds) {
    const idx = AST_INDEX.get(kind);
    if (idx !== undefined) vec[idx] += 1;
  }

  // ── Band 1 (64–127): kind-sequence bigrams ────────────────────────────
  // A `call` followed by a `catch` is not the same structure as a `catch`
  // followed by a `call`. Direction is carried by ordering the pair, so the
  // hash of "a>b" differs from "b>a" — the analogue of sonority transition.
  for (let i = 0; i < kinds.length - 1; i++) {
    vec[64 + (fnv1aHash(`${kinds[i]}>${kinds[i + 1]}`) % BAND_WIDTH)] += 1;
  }

  // ── Band 2 (128–191): structural topology, BUCKETED ───────────────────
  // Both sibling engines encoded topology as scalars in fixed dims and both
  // saturated at ~1.0 for unrelated inputs. Counts select buckets here.
  const fnCount = (facts.functions || []).length;
  const callCount = (facts.calls || []).length;
  const bindingCount = (facts.bindings || []).length;

  // Function count → 128–143 (one dim per function, 1..16)
  if (fnCount > 0) vec[128 + Math.min(fnCount, 16) - 1] += 2.0;

  // Calls per function → 144–151
  if (fnCount > 0) vec[144 + Math.min(7, Math.round(callCount / fnCount))] += 1.5;

  // Binding density → 152–159
  vec[152 + bucketOf(bindingCount / kinds.length, 8)] += 1.5;

  // Comment density → 160–167
  vec[160 + bucketOf((facts.comments || []).length / kinds.length, 8)] += 1.0;

  // Distinct-kind breadth → 168–183 (how much of the inventory this file uses)
  const distinctKinds = new Set(kinds).size;
  vec[168 + Math.min(distinctKinds, 16) - 1] += 1.5;

  // ── Band 3 (192–255): module signature ────────────────────────────────
  // What this file reaches OUT to: import sources, hook names, call receivers.
  // The analogue of the rhyme domain — what the unit resolves into.
  for (const binding of facts.bindings || []) {
    if (binding.kind === 'import' && binding.importSource) {
      vec[192 + (fnv1aHash(String(binding.importSource)) % 32)] += 2.0;
    }
  }
  for (const effect of facts.effects || []) {
    if (effect.hook) vec[224 + (fnv1aHash(String(effect.hook)) % 16)] += 2.0;
  }
  for (const call of facts.calls || []) {
    if (call.receiver) vec[240 + (fnv1aHash(String(call.receiver)) % 16)] += 1.5;
  }

  // ── Per-band normalization ────────────────────────────────────────────
  // Each band gets one vote; the global cosine is the mean of the four.
  for (let band = 0; band < AST_BAND_COUNT; band++) {
    const start = band * BAND_WIDTH;
    let norm = 0;
    for (let i = start; i < start + BAND_WIDTH; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 1e-10) {
      for (let i = start; i < start + BAND_WIDTH; i++) vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Similarity between two sources in [0, 1], or null when either does not parse.
 *
 * Null propagates deliberately. A caller that wants to treat an unparseable file
 * as "not similar" must say so; this function will not decide it for them.
 *
 * @param {{ path: string, content: string }} sourceA
 * @param {{ path: string, content: string }} sourceB
 * @returns {number | null}
 */
export function astTopographicSimilarity(sourceA, sourceB) {
  const a = generateAstTopographicVector(sourceA);
  const b = generateAstTopographicVector(sourceB);
  if (!a || !b) return null;

  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.min(1, Math.max(0, dot / AST_BAND_COUNT));
}
