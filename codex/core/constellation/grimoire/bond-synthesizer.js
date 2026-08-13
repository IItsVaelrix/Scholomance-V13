/**
 * THEORETICAL BOND SYNTHESIZER — "semantic island of stability" v0.
 *
 * Does NOT read the human BONDS table to invent reactions.
 * Generates candidates from:
 *   - a finite atom/phrase type inventory
 *   - English directionality priors
 *   - content-head / endocentricity / closed-class laws
 *   - a small set of construction SCHEMAS (physics), not a hand list of 68 tuples
 *
 * The rediscovery experiment asks: how many human constructions fall inside
 * this theoretically generated cloud? ~40+ / ~68 ⇒ laws are viable compression.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/grimoire/bond-synthesizer
 */

/** Chart categories the theory knows about (not read from BONDS). */
export const ATOM_INVENTORY = Object.freeze([
  // lexical / phrase
  'N', 'NC', 'NP', 'NPO', 'V', 'VP', 'ADJ', 'ADV', 'PROPN',
  // closed class
  'DET', 'P', 'CONJ', 'AUX', 'COP', 'MODAL', 'TO', 'SUB', 'REL', 'THAN',
  'POSS', 'PRT', 'COMMA', 'PUNCT',
  // derived / intermediate phrase labels the physics allows naming
  'PP', 'S', 'SBAR', 'INF', 'RELC', 'PART',
  'CONJNP', 'CONJVP', 'CONJS',
  'NPCOMMA', 'SCOMMA', 'FRONTED', 'APPOS', 'GEN', 'THANP', 'INV',
]);

/** Typically dependents when combining with content (UD content-head prior). */
export const FUNCTION_TYPES = Object.freeze(new Set([
  'DET', 'P', 'CONJ', 'AUX', 'COP', 'MODAL', 'TO', 'SUB', 'REL', 'THAN',
  'POSS', 'PRT', 'COMMA', 'PUNCT',
]));

/** Content / open-class projectors. */
export const CONTENT_TYPES = Object.freeze(new Set([
  'N', 'NP', 'NPO', 'V', 'VP', 'ADJ', 'ADV', 'PROPN', 'S', 'SBAR', 'INF',
  'RELC', 'PART', 'PP', 'APPOS',
]));

/**
 * English linear order priors: function usually LEFT of its host in these pairs.
 * Format: [leftType, rightType] means "this order is licensed".
 */
const ORDER_PRIORS = [
  ['DET', 'N'],
  ['P', 'NP'],
  ['P', 'NPO'],
  ['ADJ', 'N'],
  ['ADV', 'ADJ'],
  ['ADV', 'VP'],
  ['POSS', 'N'],
  ['AUX', 'VP'],
  ['MODAL', 'VP'],
  ['COP', 'VP'],
  ['COP', 'ADJ'],
  ['COP', 'NP'],
  ['COP', 'INF'],
  ['COP', 'SBAR'],
  ['TO', 'VP'],
  ['SUB', 'S'],
  ['REL', 'VP'],
  ['REL', 'S'],
  ['THAN', 'NP'],
  ['CONJ', 'NP'],
  ['CONJ', 'VP'],
  ['CONJ', 'S'],
  ['V', 'NP'],
  ['V', 'NPO'],
  ['V', 'PP'],
  ['V', 'ADJ'],
  ['V', 'INF'],
  ['V', 'SBAR'],
  ['V', 'PRT'],
  ['VP', 'PP'],
  ['VP', 'ADV'],
  ['VP', 'PRT'],
  ['VP', 'THANP'],
  ['NP', 'VP'],
  ['NP', 'PP'],
  ['NP', 'RELC'],
  ['NP', 'INF'],
  ['NP', 'PART'],
  ['NP', 'POSS'],
  ['NP', 'COMMA'],
  ['NP', 'PUNCT'],
  ['ADJ', 'THANP'],
  ['ADJ', 'INF'],
  ['S', 'SBAR'],
  ['S', 'COMMA'],
  ['S', 'PUNCT'],
  ['SBAR', 'S'],
  ['SBAR', 'COMMA'],
  ['PP', 'S'],
  ['PP', 'COMMA'],
  ['ADV', 'S'],
  ['ADV', 'COMMA'],
  ['FRONTED', 'S'],
  ['MODAL', 'NP'],
  ['AUX', 'NP'],
  ['COP', 'NP'], // inversion: Is he …  (also COP+NP predicative — both generated)
  ['INV', 'VP'],
  ['INV', 'ADJ'],
  ['INV', 'NP'],
  ['GEN', 'N'],
  ['NPCOMMA', 'NP'],
  ['APPOS', 'COMMA'],
  ['SCOMMA', 'S'],
];

/**
 * Endocentric result law: when the head child is type H, result often H
 * (or a declared projection of H).
 */
const PROJECTIONS = Object.freeze({
  N: ['N', 'NP'],
  NP: ['NP', 'S'],
  V: ['V', 'VP'],
  VP: ['VP', 'S'],
  ADJ: ['ADJ'],
  ADV: ['ADV'],
  S: ['S'],
  PP: ['PP'],
  SBAR: ['SBAR', 'S'],
  INF: ['INF', 'VP', 'NP', 'ADJ'],
  RELC: ['RELC', 'NP'],
  PART: ['PART', 'NP'],
  NPO: ['NPO', 'VP', 'PP'],
});

/**
 * Predict head index from content-head + English order.
 * @returns {0|1}
 */
export function predictHead(left, right, result) {
  const lFn = FUNCTION_TYPES.has(left);
  const rFn = FUNCTION_TYPES.has(right);

  // Coordination complete: first conjunct heads (UD technical head).
  if (right.startsWith('CONJ') && left === result) return 0;
  if (left === 'CONJ' && right === result) return 1; // discourse-initial And S
  if (left === 'CONJ') return 1; // CONJ + X → bridge headed by X

  // Inversion complete: predicate heads the clause.
  if (left === 'INV') return 1;

  // Clause: subject + predicate → S roots on predicate.
  if (left === 'NP' && right === 'VP' && result === 'S') return 1;

  // Fronted adjunct + matrix.
  if ((left === 'PP' || left === 'ADV' || left === 'FRONTED' || left === 'SBAR')
    && right === 'S' && result === 'S') return 1;

  // Function left of content → content heads.
  if (lFn && !rFn) return 1;
  // Content left of function (postmodifiers, punct) → content heads.
  if (!lFn && rFn) return 0;

  // Both content: head is the child whose type equals result, else left.
  if (result === right && result !== left) return 1;
  if (result === left) return 0;
  // Verbal host takes complement.
  if (left === 'V' || left === 'VP') return 0;
  if (right === 'V' || right === 'VP') return 1;
  return 0;
}

/**
 * Predict result type from head child + projections.
 */
export function predictResults(left, right, headIndex) {
  const headType = headIndex === 1 ? right : left;
  const out = new Set();

  // Explicit clause formation.
  if (left === 'NP' && right === 'VP') out.add('S');
  if (left === 'INV' && (right === 'VP' || right === 'ADJ' || right === 'NP')) out.add('S');
  if ((left === 'PP' || left === 'ADV' || left === 'FRONTED' || left === 'SBAR') && right === 'S') {
    out.add('S');
  }

  // Coordination bridges.
  if (left === 'CONJ' && right === 'NP') out.add('CONJNP');
  if (left === 'CONJ' && right === 'VP') out.add('CONJVP');
  if (left === 'CONJ' && right === 'S') {
    out.add('CONJS');
    out.add('S'); // discourse-initial
  }
  if (left === 'NP' && right === 'CONJNP') out.add('NP');
  if (left === 'VP' && right === 'CONJVP') out.add('VP');
  if (left === 'S' && right === 'CONJS') out.add('S');

  // Relativizer / complementizer.
  if (left === 'REL' && right === 'VP') out.add('RELC');
  if (left === 'REL' && right === 'S') out.add('SBAR');
  if (left === 'NP' && right === 'RELC') out.add('NP');

  // Case / PP.
  if (left === 'P' && (right === 'NP' || right === 'NPO')) out.add('PP');

  // Determination.
  if (left === 'DET' && right === 'N') out.add('NP');

  // Infinitive.
  if (left === 'TO' && right === 'VP') out.add('INF');

  // Subordinator.
  if (left === 'SUB' && right === 'S') out.add('SBAR');

  // Comparative.
  if (left === 'THAN' && right === 'NP') out.add('THANP');

  // Possession genitive bridge.
  if (left === 'NP' && right === 'POSS') out.add('GEN');
  if (left === 'GEN' && right === 'N') out.add('NP');
  if (left === 'POSS' && right === 'N') out.add('N');

  // Participle isomer.
  if (left === 'V' && right === 'PP') {
    out.add('VP');
    out.add('PART');
  }
  if (left === 'NP' && right === 'PART') out.add('NP');

  // Comma scaffolds.
  if (right === 'COMMA') {
    if (left === 'ADV' || left === 'SBAR' || left === 'PP') out.add('FRONTED');
    if (left === 'NP') out.add('NPCOMMA');
    if (left === 'S') out.add('SCOMMA');
    if (left === 'APPOS') out.add('NP');
  }
  if (left === 'NPCOMMA' && right === 'NP') {
    out.add('APPOS');
    out.add('NP');
  }
  if (left === 'SCOMMA' && right === 'S') out.add('S');
  if (left === 'FRONTED' && right === 'S') out.add('S');

  // Inversion bridge.
  if ((left === 'MODAL' || left === 'AUX' || left === 'COP') && right === 'NP') {
    out.add('INV');
    // Also true copular predicate for COP+NP (is a doctor) → VP
    if (left === 'COP') out.add('VP');
  }

  // Punct absorb.
  if (right === 'PUNCT') {
    if (left === 'S') out.add('S');
    if (left === 'NP') out.add('NP');
  }

  // Aux + lexical predicate.
  if ((left === 'AUX' || left === 'MODAL' || left === 'COP') && right === 'VP') out.add('VP');
  if (left === 'COP' && (right === 'ADJ' || right === 'NP' || right === 'INF' || right === 'SBAR')) {
    out.add('VP');
  }

  // Verb complements / adjuncts.
  if (left === 'V') {
    if (['NP', 'NPO', 'PP', 'ADJ', 'INF', 'SBAR'].includes(right)) out.add('VP');
    if (right === 'PRT') out.add('V');
  }
  if (left === 'VP') {
    if (['PP', 'ADV', 'PRT', 'THANP'].includes(right)) out.add('VP');
  }

  // Modifier stacks.
  if (left === 'ADJ' && right === 'N') {
    out.add('N');
    out.add('NP');
  }
  if (left === 'ADV' && right === 'ADJ') out.add('ADJ');
  if (left === 'ADV' && right === 'VP') out.add('VP');
  if (left === 'NP' && right === 'PP') out.add('NP');
  if (left === 'ADJ' && right === 'THANP') out.add('ADJ');
  if (left === 'ADJ' && right === 'INF') out.add('ADJ');
  if (left === 'NP' && right === 'INF') out.add('NP');
  if (left === 'V' && right === 'INF') out.add('VP');

  // Subordinate attachment.
  if (left === 'S' && right === 'SBAR') out.add('S');
  if (left === 'SBAR' && right === 'S') out.add('S');

  // Default endocentric projections from head.
  const proj = PROJECTIONS[headType] || [headType];
  for (const p of proj) out.add(p);
  // Also allow head type itself.
  out.add(headType);

  return [...out];
}

function sig(l, r, result) {
  return `${l}|${r}|${result}`;
}

/**
 * Generate the theoretical candidate cloud.
 *
 * @param {{mode?: 'full'|'minimal'}} [options]
 *   full     — order priors + projection + schema families (default rediscovery)
 *   minimal  — only a handful of abstract schemas (harder, honest compression floor)
 * @returns {Array<{left: string, right: string, result: string, head: 0|1, law: string, signature: string}>}
 */
export function synthesizeBonds(options = {}) {
  const mode = options.mode || 'full';
  const refined = new Map();

  const put = (left, right, result, law) => {
    if (!ATOM_INVENTORY.includes(left) || !ATOM_INVENTORY.includes(right)) return;
    if (!ATOM_INVENTORY.includes(result)) return;
    const head = predictHead(left, right, result);
    const signature = sig(left, right, result);
    if (refined.has(signature) && refined.get(signature).head !== head) return;
    refined.set(signature, { left, right, result, head, law, signature });
  };

  if (mode === 'minimal') {
    // ── Minimal physics: ~15 schema templates, no order-prior table ──
    put('DET', 'N', 'NP', 'min-det');
    put('P', 'NP', 'PP', 'min-case');
    put('P', 'NPO', 'PP', 'min-case');
    put('NP', 'VP', 'S', 'min-clause');
    for (const a of ['AUX', 'MODAL', 'COP']) put(a, 'VP', 'VP', 'min-aux');
    for (const p of ['ADJ', 'NP']) put('COP', p, 'VP', 'min-cop');
    for (const c of ['NP', 'NPO', 'PP', 'ADJ']) put('V', c, 'VP', 'min-vcomp');
    put('V', 'PRT', 'V', 'min-prt');
    put('ADJ', 'N', 'N', 'min-amod');
    put('ADV', 'ADJ', 'ADJ', 'min-advmod');
    put('ADV', 'VP', 'VP', 'min-advmod');
    put('VP', 'ADV', 'VP', 'min-advmod');
    put('NP', 'PP', 'NP', 'min-nmod');
    put('VP', 'PP', 'VP', 'min-obl');
    put('TO', 'VP', 'INF', 'min-inf');
    put('V', 'INF', 'VP', 'min-inf');
    put('S', 'PUNCT', 'S', 'min-punct');
    put('NP', 'PUNCT', 'NP', 'min-punct');
    // coordination as abstract X
    for (const [X, B] of [['NP', 'CONJNP'], ['VP', 'CONJVP'], ['S', 'CONJS']]) {
      put('CONJ', X, B, 'min-coord');
      put(X, B, X, 'min-coord');
    }
    return [...refined.values()].sort((a, b) => a.signature.localeCompare(b.signature));
  }

  // ── Full: licensed linear orders → endocentric / special results ──
  for (const [left, right] of ORDER_PRIORS) {
    const head = FUNCTION_TYPES.has(left) && !FUNCTION_TYPES.has(right) ? 1 : 0;
    const results = predictResults(left, right, head);
    for (const result of results) {
      put(left, right, result, 'order-prior+projection');
    }
  }

  // ── Coordination schema (phrase type X) ──
  for (const X of ['NP', 'VP', 'S']) {
    const bridge = X === 'NP' ? 'CONJNP' : X === 'VP' ? 'CONJVP' : 'CONJS';
    put('CONJ', X, bridge, 'coordination-bridge');
    put(X, bridge, X, 'coordination-complete');
  }

  // ── Comma scaffolds ──
  for (const left of ['ADV', 'SBAR', 'PP', 'NP', 'S', 'APPOS']) {
    for (const result of predictResults(left, 'COMMA', 0)) {
      put(left, 'COMMA', result, 'comma-scaffold');
    }
  }

  // ── Verb complement schema ──
  for (const comp of ['NP', 'NPO', 'PP', 'ADJ', 'INF', 'SBAR', 'PRT']) {
    for (const result of predictResults('V', comp, 0)) {
      put('V', comp, result, 'verb-complement');
    }
  }

  // ── Punct absorb ──
  for (const left of ['S', 'NP', 'VP', 'PP']) {
    for (const result of predictResults(left, 'PUNCT', 0)) {
      put(left, 'PUNCT', result, 'punct-absorb');
    }
  }

  return [...refined.values()].sort((a, b) => a.signature.localeCompare(b.signature));
}

/**
 * Compare theoretical cloud to a gold construction list.
 *
 * @param {Array<{left:string,right:string,result:string,head:number}>} gold
 * @param {ReturnType<typeof synthesizeBonds>} [candidates]
 */
export function rediscoveryReport(gold, candidates = synthesizeBonds()) {
  const goldBySig = new Map();
  for (const g of gold) {
    const signature = sig(g.left, g.right, g.result);
    goldBySig.set(signature, g);
  }
  const candBySig = new Map(candidates.map((c) => [c.signature, c]));

  const hit = [];
  const hitHeadMismatch = [];
  const miss = [];
  for (const [signature, g] of goldBySig) {
    const c = candBySig.get(signature);
    if (!c) {
      miss.push({ signature, gold: g });
      continue;
    }
    if (c.head === g.head) hit.push({ signature, gold: g, candidate: c });
    else hitHeadMismatch.push({ signature, gold: g, candidate: c });
  }

  const extra = [];
  for (const [signature, c] of candBySig) {
    if (!goldBySig.has(signature)) extra.push(c);
  }

  const nGold = goldBySig.size;
  const nHit = hit.length;
  const nHitAny = hit.length + hitHeadMismatch.length;

  return {
    nGold,
    nCandidates: candidates.length,
    nHitSignatureAndHead: nHit,
    nHitSignatureOnly: nHitAny,
    nMiss: miss.length,
    nHeadMismatch: hitHeadMismatch.length,
    nExtra: extra.length,
    recallSignature: nHitAny / Math.max(nGold, 1),
    recallFull: nHit / Math.max(nGold, 1),
    precisionSignature: nHitAny / Math.max(candidates.length, 1),
    precisionFull: nHit / Math.max(candidates.length, 1),
    hit,
    hitHeadMismatch,
    miss,
    extra: extra.slice(0, 50), // cap for reports
    extraTotal: extra.length,
    viableAt40: nHitAny >= 40,
    viableFullAt40: nHit >= 40,
  };
}
