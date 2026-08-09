/**
 * RESULT CONSERVATION LAW
 *
 * Affinity says whether L and R may bond.
 * Headship says which child survives.
 * Projection says what the survivor is allowed to *become*.
 *
 * C is not a free search variable. It is derived:
 *
 *   (L, R) → operation → head → licensed transition → C
 *
 * The non-head may alter the head's *state*, but may not arbitrarily alter
 * the head's *identity*. Modification preserves projection level; saturation
 * advances it; special constructions require an explicit schema.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/grimoire/projection-laws
 */

/** @typedef {'preserve'|'advance'|'special'} OperationKind */

/**
 * Licensed projection transitions: headType + operation → resultType.
 * Only these (head, operation, result) triples are physical.
 */
export const PROJECTION_TRANSITIONS = Object.freeze([
  // ── PRESERVE (modify / absorb — same projection level) ──
  { head: 'N', operation: 'modify', result: 'N', kind: 'preserve' },
  { head: 'NP', operation: 'modify', result: 'NP', kind: 'preserve' },
  { head: 'V', operation: 'modify', result: 'V', kind: 'preserve' },
  { head: 'VP', operation: 'modify', result: 'VP', kind: 'preserve' },
  { head: 'ADJ', operation: 'modify', result: 'ADJ', kind: 'preserve' },
  { head: 'ADV', operation: 'modify', result: 'ADV', kind: 'preserve' },
  { head: 'S', operation: 'modify', result: 'S', kind: 'preserve' },
  { head: 'PP', operation: 'modify', result: 'PP', kind: 'preserve' },
  { head: 'SBAR', operation: 'modify', result: 'SBAR', kind: 'preserve' },
  { head: 'INF', operation: 'modify', result: 'INF', kind: 'preserve' },

  { head: 'S', operation: 'punct-absorb', result: 'S', kind: 'preserve' },
  { head: 'NP', operation: 'punct-absorb', result: 'NP', kind: 'preserve' },
  { head: 'VP', operation: 'punct-absorb', result: 'VP', kind: 'preserve' },
  { head: 'PP', operation: 'punct-absorb', result: 'PP', kind: 'preserve' },
  { head: 'ADJ', operation: 'punct-absorb', result: 'ADJ', kind: 'preserve' },

  { head: 'VP', operation: 'auxiliary', result: 'VP', kind: 'preserve' },
  { head: 'V', operation: 'particle', result: 'V', kind: 'preserve' },
  { head: 'VP', operation: 'particle', result: 'VP', kind: 'preserve' },

  // ── ADVANCE (saturation — next licensed state on the spine) ──
  { head: 'N', operation: 'determine', result: 'NP', kind: 'advance' },
  { head: 'PROPN', operation: 'determine', result: 'NP', kind: 'advance' },
  { head: 'PRON', operation: 'determine', result: 'NP', kind: 'advance' },
  { head: 'NC', operation: 'determine', result: 'NP', kind: 'advance' }, // legal but DET+NC forest-toxic
  { head: 'N', operation: 'possess', result: 'N', kind: 'preserve' }, // POSS+N stack like amod
  { head: 'NC', operation: 'compound', result: 'NC', kind: 'preserve' },
  { head: 'N', operation: 'compound', result: 'N', kind: 'preserve' },
  { head: 'PROPN', operation: 'compound', result: 'N', kind: 'advance' },
  { head: 'V', operation: 'object-saturate', result: 'VP', kind: 'advance' },
  { head: 'VP', operation: 'subject-saturate', result: 'S', kind: 'advance' },
  // Case: UD head is the nominal; P is the non-head that wraps it into PP.
  { head: 'NP', operation: 'case-wrap', result: 'PP', kind: 'advance' },
  { head: 'NPO', operation: 'case-wrap', result: 'PP', kind: 'advance' },
  { head: 'ADJ', operation: 'predicate-of-cop', result: 'VP', kind: 'advance' },
  { head: 'NP', operation: 'predicate-of-cop', result: 'VP', kind: 'advance' },
  { head: 'INF', operation: 'predicate-of-cop', result: 'VP', kind: 'advance' },
  { head: 'SBAR', operation: 'predicate-of-cop', result: 'VP', kind: 'advance' },
  { head: 'VP', operation: 'infinitive-mark', result: 'INF', kind: 'advance' },
  { head: 'S', operation: 'subordinate-mark', result: 'SBAR', kind: 'advance' },

  // Comparative host preserves level after than-phrase attaches.
  { head: 'ADJ', operation: 'compare', result: 'ADJ', kind: 'preserve' },
  { head: 'VP', operation: 'compare', result: 'VP', kind: 'preserve' },
  { head: 'NP', operation: 'than-standard', result: 'THANP', kind: 'advance' },

  // Infinitival complement: host keeps its projection (V→VP already advanced by object path;
  // V+INF is object-like saturation of V).
  { head: 'V', operation: 'infinitive-complement', result: 'VP', kind: 'advance' },
  { head: 'NP', operation: 'infinitive-modifier', result: 'NP', kind: 'preserve' },
  { head: 'ADJ', operation: 'infinitive-modifier', result: 'ADJ', kind: 'preserve' },

  // Clause embedding under verb.
  { head: 'V', operation: 'clausal-complement', result: 'VP', kind: 'advance' },

  // Adjuncts on S: matrix projects S.
  { head: 'S', operation: 'front-attach', result: 'S', kind: 'preserve' },
]);

/**
 * Pair → operation. Affinity + role of the non-head.
 * Format: `${left}+${right}` → { operation, head: 0|1 }
 *
 * Head is fixed here for clean pairs; construction chemistry overrides in schemas.
 */
export const PAIR_OPERATIONS = Object.freeze({
  // determination / case
  'DET+N': { operation: 'determine', head: 1 },
  'DET+PROPN': { operation: 'determine', head: 1 }, // fission daughter of DET+NP
  'DET+PRON': { operation: 'determine', head: 1 },
  'DET+NC': { operation: 'determine', head: 1 }, // projection-legal; not promoted (forest)
  'P+NP': { operation: 'case-wrap', head: 1 },
  'P+NPO': { operation: 'case-wrap', head: 1 },

  // clause / valence
  'NP+VP': { operation: 'subject-saturate', head: 1 },
  'V+NP': { operation: 'object-saturate', head: 0 },
  'V+NPO': { operation: 'object-saturate', head: 0 },
  'V+PP': { operation: 'object-saturate', head: 0 }, // also participial isomer is special
  'V+ADJ': { operation: 'object-saturate', head: 0 },
  'V+INF': { operation: 'infinitive-complement', head: 0 },
  'V+SBAR': { operation: 'clausal-complement', head: 0 },
  'V+PRT': { operation: 'particle', head: 0 },

  // VP adjuncts / secondary
  'VP+PP': { operation: 'modify', head: 0 },
  'VP+ADV': { operation: 'modify', head: 0 },
  'VP+PRT': { operation: 'particle', head: 0 },
  'VP+THANP': { operation: 'compare', head: 0 },
  'ADV+VP': { operation: 'modify', head: 1 },
  'ADV+ADJ': { operation: 'modify', head: 1 },
  'ADJ+N': { operation: 'modify', head: 1 },
  'NP+PP': { operation: 'modify', head: 0 },

  // aux / cop
  'AUX+VP': { operation: 'auxiliary', head: 1 },
  'MODAL+VP': { operation: 'auxiliary', head: 1 },
  'COP+VP': { operation: 'auxiliary', head: 1 }, // deprecated in chart; still a projection-legal form
  'COP+ADJ': { operation: 'predicate-of-cop', head: 1 },
  'COP+NP': { operation: 'predicate-of-cop', head: 1 },
  'COP+INF': { operation: 'predicate-of-cop', head: 1 },
  'COP+SBAR': { operation: 'predicate-of-cop', head: 1 },

  // nonfinite / subord
  'TO+VP': { operation: 'infinitive-mark', head: 1 },
  'SUB+S': { operation: 'subordinate-mark', head: 1 },
  'S+SBAR': { operation: 'modify', head: 0 },
  'SBAR+S': { operation: 'front-attach', head: 1 },
  'NP+INF': { operation: 'infinitive-modifier', head: 0 },
  'ADJ+INF': { operation: 'infinitive-modifier', head: 0 },

  // comparative
  'THAN+NP': { operation: 'than-standard', head: 1 },
  'ADJ+THANP': { operation: 'compare', head: 0 },

  // possession (simple)
  'POSS+N': { operation: 'possess', head: 1 },
  'NC+NC': { operation: 'compound', head: 1 },
  'PROPN+PROPN': { operation: 'compound', head: 1 },
  'PROPN+N': { operation: 'compound', head: 1 },
  'N+PROPN': { operation: 'compound', head: 1 },

  // punct absorb
  'S+PUNCT': { operation: 'punct-absorb', head: 0 },
  'NP+PUNCT': { operation: 'punct-absorb', head: 0 },
  'VP+PUNCT': { operation: 'punct-absorb', head: 0 },
  'PP+PUNCT': { operation: 'punct-absorb', head: 0 },
  'ADJ+PUNCT': { operation: 'punct-absorb', head: 0 },

  // fronting bare
  'PP+S': { operation: 'front-attach', head: 1 },
  'ADV+S': { operation: 'front-attach', head: 1 },
  'FRONTED+S': { operation: 'front-attach', head: 1 },
});

/**
 * Construction chemistry — named transitions that generic projection cannot invent.
 * These are explicit schemas; result is declared, not free-searched.
 */
export const CONSTRUCTION_SCHEMAS = Object.freeze([
  // coordination
  { left: 'CONJ', right: 'NP', result: 'CONJNP', head: 1, construction: 'coord-bridge', special: true },
  { left: 'CONJ', right: 'VP', result: 'CONJVP', head: 1, construction: 'coord-bridge', special: true },
  { left: 'CONJ', right: 'S', result: 'CONJS', head: 1, construction: 'coord-bridge', special: true },
  { left: 'NP', right: 'CONJNP', result: 'NP', head: 0, construction: 'coord-complete', special: true },
  { left: 'VP', right: 'CONJVP', result: 'VP', head: 0, construction: 'coord-complete', special: true },
  { left: 'S', right: 'CONJS', result: 'S', head: 0, construction: 'coord-complete', special: true },
  { left: 'CONJ', right: 'S', result: 'S', head: 1, construction: 'discourse-initial-and', special: true },

  // relative / participial
  { left: 'REL', right: 'VP', result: 'RELC', head: 1, construction: 'subject-gap-relative', special: true },
  { left: 'NP', right: 'RELC', result: 'NP', head: 0, construction: 'noun-relative', special: true },
  { left: 'REL', right: 'S', result: 'SBAR', head: 1, construction: 'that-complement', special: true },
  { left: 'V', right: 'PP', result: 'PART', head: 0, construction: 'participial-isomer', special: true },
  { left: 'NP', right: 'PART', result: 'NP', head: 0, construction: 'reduced-relative', special: true },

  // possession bridge
  { left: 'NP', right: 'POSS', result: 'GEN', head: 0, construction: 'genitive-bridge', special: true },
  { left: 'GEN', right: 'N', result: 'NP', head: 1, construction: 's-genitive', special: true },

  // comma scaffolds
  { left: 'ADV', right: 'COMMA', result: 'FRONTED', head: 0, construction: 'comma-front', special: true },
  { left: 'SBAR', right: 'COMMA', result: 'FRONTED', head: 0, construction: 'comma-front', special: true },
  { left: 'PP', right: 'COMMA', result: 'FRONTED', head: 0, construction: 'comma-front', special: true },
  { left: 'NP', right: 'COMMA', result: 'NPCOMMA', head: 0, construction: 'comma-np', special: true },
  { left: 'S', right: 'COMMA', result: 'SCOMMA', head: 0, construction: 'comma-s', special: true },
  { left: 'NPCOMMA', right: 'NP', result: 'APPOS', head: 0, construction: 'apposition', special: true },
  { left: 'NPCOMMA', right: 'NP', result: 'NP', head: 0, construction: 'np-list', special: true },
  { left: 'APPOS', right: 'COMMA', result: 'NP', head: 0, construction: 'appos-close', special: true },
  { left: 'SCOMMA', right: 'S', result: 'S', head: 0, construction: 'clausal-comma-conj', special: true },

  // inversion
  { left: 'MODAL', right: 'NP', result: 'INV', head: 1, construction: 'inv-bridge', special: true },
  { left: 'AUX', right: 'NP', result: 'INV', head: 1, construction: 'inv-bridge', special: true },
  { left: 'COP', right: 'NP', result: 'INV', head: 1, construction: 'inv-bridge', special: true },
  { left: 'INV', right: 'VP', result: 'S', head: 1, construction: 'inv-predicate', special: true },
  { left: 'INV', right: 'ADJ', result: 'S', head: 1, construction: 'inv-predicate', special: true },
  { left: 'INV', right: 'NP', result: 'S', head: 1, construction: 'inv-predicate', special: true },
]);

const TRANSITION_INDEX = new Map();
for (const t of PROJECTION_TRANSITIONS) {
  const key = `${t.head}|${t.operation}`;
  if (!TRANSITION_INDEX.has(key)) TRANSITION_INDEX.set(key, []);
  TRANSITION_INDEX.get(key).push(t);
}

/**
 * @param {string} headType
 * @param {string} operation
 * @returns {string[]} licensed result types
 */
export function projectResult(headType, operation) {
  const rows = TRANSITION_INDEX.get(`${headType}|${operation}`) || [];
  return rows.map((r) => r.result);
}

/**
 * Is (head, operation, result) a licensed projection?
 */
export function isLicensedProjection(headType, operation, result) {
  return projectResult(headType, operation).includes(result);
}

/**
 * Look up pair affinity → operation + preferred head.
 * @returns {{operation: string, head: 0|1}|null}
 */
export function pairOperation(left, right) {
  return PAIR_OPERATIONS[`${left}+${right}`] || null;
}

/**
 * Derive a bond from L,R under Result Conservation (generic chemistry only).
 * Returns null if no affinity or no licensed projection.
 *
 * @returns {{left, right, result, head, operation, law, signature}|null}
 */
export function deriveBond(left, right) {
  const aff = pairOperation(left, right);
  if (!aff) return null;
  const { operation, head } = aff;
  const headType = head === 1 ? right : left;
  const results = projectResult(headType, operation);
  if (results.length === 0) return null;
  // Deterministic: single licensed result, or first listed if multiple.
  const result = results[0];
  return {
    left,
    right,
    result,
    head,
    operation,
    law: `project:${operation}`,
    signature: `${left}|${right}|${result}`,
    special: false,
  };
}

/**
 * All bonds derivable from projection physics + construction chemistry.
 * C is never free: each (L,R) yields at most the licensed results.
 */
export function synthesizeByProjection() {
  const out = new Map();

  // Generic pairs from affinity table.
  for (const key of Object.keys(PAIR_OPERATIONS)) {
    const [left, right] = key.split('+');
    const aff = PAIR_OPERATIONS[key];
    const headType = aff.head === 1 ? right : left;
    const results = projectResult(headType, aff.operation);
    for (const result of results) {
      const signature = `${left}|${right}|${result}`;
      out.set(signature, {
        left,
        right,
        result,
        head: aff.head,
        operation: aff.operation,
        law: `project:${aff.operation}`,
        signature,
        special: false,
      });
    }
  }

  // Construction chemistry (named).
  for (const s of CONSTRUCTION_SCHEMAS) {
    const signature = `${s.left}|${s.right}|${s.result}`;
    out.set(signature, {
      left: s.left,
      right: s.right,
      result: s.result,
      head: s.head,
      operation: `special:${s.construction}`,
      law: `construction:${s.construction}`,
      signature,
      special: true,
    });
  }

  // Participial isomer: V+PP also object-saturates to VP (generic) AND PART (special).
  // Generic already added V+PP→VP if listed; ensure VP path:
  if (!out.has('V|PP|VP')) {
    out.set('V|PP|VP', {
      left: 'V', right: 'PP', result: 'VP', head: 0,
      operation: 'object-saturate', law: 'project:object-saturate', signature: 'V|PP|VP', special: false,
    });
  }

  return [...out.values()].sort((a, b) => a.signature.localeCompare(b.signature));
}

/**
 * Filter an arbitrary candidate (e.g. old synthesizer extra) through Result Conservation.
 *
 * @returns {{ok: boolean, reason?: string, derived?: object}}
 */
export function conservesResult(candidate) {
  const { left, right, result, head } = candidate;
  const headType = head === 1 ? right : left;

  // Construction chemistry may declare the triple explicitly.
  for (const s of CONSTRUCTION_SCHEMAS) {
    if (s.left === left && s.right === right && s.result === result && s.head === head) {
      return {
        ok: true,
        derived: {
          left, right, result, head,
          operation: `special:${s.construction}`,
          law: `construction:${s.construction}`,
          signature: `${left}|${right}|${result}`,
          special: true,
        },
      };
    }
  }

  const aff = pairOperation(left, right);
  if (!aff) {
    return { ok: false, reason: 'no-pair-affinity' };
  }
  if (aff.head !== head) {
    return { ok: false, reason: `head-mismatch:affinity=${aff.head} candidate=${head}` };
  }
  if (!isLicensedProjection(headType, aff.operation, result)) {
    const licensed = projectResult(headType, aff.operation);
    return {
      ok: false,
      reason: `result-not-licensed: head=${headType} op=${aff.operation} got=${result} allowed=[${licensed.join(',')}]`,
    };
  }
  return {
    ok: true,
    derived: {
      left, right, result, head,
      operation: aff.operation,
      law: `project:${aff.operation}`,
      signature: `${left}|${right}|${result}`,
      special: false,
    },
  };
}
