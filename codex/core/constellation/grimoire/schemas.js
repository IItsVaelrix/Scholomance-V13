/**
 * GRIMOIRE / CONSTRUCTION REGISTRY — schemas.
 *
 * The registry is the parser's building code: finite construction laws this
 * system currently knows. Not a database of English; a declarative constitution.
 *
 * Ontological status (not merely audit colour):
 *   grammar       — internal structure claims linguistic truth
 *   scaffold      — parser assembly; no linguistic ontology claim
 *   approximation — real phenomenon, knowingly collapsed distinctions
 *   deprecated    — known-wrong representation being migrated away
 *
 * Invariant for consumers (phrasing, semantics):
 *   Scaffolds may help construct meaning, but semantic interpretation must
 *   never infer linguistic facts merely from scaffold identity.
 *
 * PURE AND ZERO-I/O.
 */

export const CONSTRUCTION_STATUS = Object.freeze({
  GRAMMAR: 'grammar',
  SCAFFOLD: 'scaffold',
  APPROXIMATION: 'approximation',
  DEPRECATED: 'deprecated',
});

export const CONSTRUCTION_STATUSES = Object.freeze(Object.values(CONSTRUCTION_STATUS));

/** Families scale the grammar as patches of reality, not one giant English table. */
export const CONSTRUCTION_FAMILIES = Object.freeze([
  'determination',
  'adposition',
  'verb',
  'clause',
  'participial',
  'modifier',
  'compound',
  'auxiliary',
  'copular',
  'relative',
  'coordination',
  'nonfinite',
  'subordination',
  'comparative',
  'possession',
  'punctuation',
  'inversion',
  'complement',
]);

/**
 * @typedef {object} Construction
 * @property {string} id
 * @property {string} family
 * @property {string} left
 * @property {string} right
 * @property {string} result
 * @property {0|1} head
 * @property {'grammar'|'scaffold'|'approximation'|'deprecated'} status
 * @property {string} [relation]      UD-ish relation when status is grammar
 * @property {string} [construction]  finer label (progressive, subject-gap, …)
 * @property {{left?: string, right?: string}} [roles]
 * @property {string} [note]
 * @property {string} [limitation]    required spirit for approximation
 * @property {string[]} [flags]
 * @property {{C?: 'G'|'Y'|'R', R?: 'G'|'Y'|'R', H?: 'G'|'Y'|'R', X?: 'G'|'Y'|'R'}} [grades]
 */

/**
 * Freeze a construction after light validation. Throws if the constitution is malformed.
 * @param {Construction} def
 * @returns {Readonly<Construction>}
 */
export function defineConstruction(def) {
  if (!def || typeof def !== 'object') throw new Error('construction required');
  const {
    id, family, left, right, result, head, status,
  } = def;
  if (!id || typeof id !== 'string') throw new Error(`construction missing id: ${JSON.stringify(def)}`);
  if (!family || typeof family !== 'string') throw new Error(`${id}: missing family`);
  if (!left || !right || !result) throw new Error(`${id}: missing pattern fields`);
  if (head !== 0 && head !== 1) throw new Error(`${id}: head must be 0 or 1`);
  if (!CONSTRUCTION_STATUSES.includes(status)) {
    throw new Error(`${id}: invalid status ${status}`);
  }
  if (status === CONSTRUCTION_STATUS.APPROXIMATION && !def.limitation && !def.note) {
    throw new Error(`${id}: approximation needs limitation or note`);
  }
  return Object.freeze({
    ...def,
    flags: Object.freeze([...(def.flags || [])]),
    roles: def.roles ? Object.freeze({ ...def.roles }) : undefined,
    grades: def.grades ? Object.freeze({ ...def.grades }) : undefined,
  });
}

/**
 * Project the dumb 4-tuple the chart consumes.
 * @param {Construction} c
 * @returns {[string, string, string, 0|1]}
 */
export function toBond(c) {
  return [c.left, c.right, c.result, c.head];
}

/**
 * Default anatomy grades from ontological status when grades are omitted.
 */
export function defaultGrades(status) {
  switch (status) {
    case CONSTRUCTION_STATUS.GRAMMAR:
      return { C: 'G', R: 'G', H: 'G', X: 'G' };
    case CONSTRUCTION_STATUS.SCAFFOLD:
      return { C: 'Y', R: 'Y', H: 'G', X: 'G' };
    case CONSTRUCTION_STATUS.APPROXIMATION:
      return { C: 'Y', R: 'Y', H: 'G', X: 'Y' };
    case CONSTRUCTION_STATUS.DEPRECATED:
      return { C: 'Y', R: 'Y', H: 'Y', X: 'R' };
    default:
      return { C: 'Y', R: 'Y', H: 'Y', X: 'Y' };
  }
}

/**
 * Anatomy row projection (compatible with bond-anatomy consumers).
 * @param {Construction} c
 */
export function toAnatomyRow(c) {
  const base = defaultGrades(c.status);
  const g = { ...base, ...(c.grades || {}) };
  return {
    left: c.left,
    right: c.right,
    result: c.result,
    head: c.head,
    C: g.C,
    R: g.R,
    H: g.H,
    X: g.X,
    note: c.limitation
      ? `${c.note || c.id} — LIMIT: ${c.limitation}`
      : (c.note || c.id),
    flags: [
      ...(c.flags || []),
      `status:${c.status}`,
      `family:${c.family}`,
      c.id,
    ],
    id: c.id,
    family: c.family,
    status: c.status,
    relation: c.relation,
    construction: c.construction,
  };
}

/**
 * Validate the full registry: unique ids, unique bond signatures, heads, status.
 * @param {Construction[]} constructions
 */
export function validateConstructions(constructions) {
  if (!Array.isArray(constructions) || constructions.length === 0) {
    throw new Error('CONSTRUCTIONS must be a non-empty array');
  }
  const ids = new Set();
  const signatures = new Set();
  for (const c of constructions) {
    if (ids.has(c.id)) throw new Error(`duplicate construction id: ${c.id}`);
    ids.add(c.id);
    const sig = `${c.left}|${c.right}|${c.result}`;
    if (signatures.has(sig)) {
      throw new Error(`duplicate bond signature ${sig} (id ${c.id})`);
    }
    signatures.add(sig);
    if (c.head !== 0 && c.head !== 1) {
      throw new Error(`${c.id}: head must be 0|1`);
    }
    if (!CONSTRUCTION_STATUSES.includes(c.status)) {
      throw new Error(`${c.id}: bad status`);
    }
  }
}

/**
 * Invariant helper for semantic consumers.
 * @param {Construction|object} c
 */
export function isScaffold(c) {
  return c && c.status === CONSTRUCTION_STATUS.SCAFFOLD;
}

export function isGrammar(c) {
  return c && c.status === CONSTRUCTION_STATUS.GRAMMAR;
}

export function isApproximation(c) {
  return c && c.status === CONSTRUCTION_STATUS.APPROXIMATION;
}

/**
 * Semantic firewall: may this structure be treated as a linguistic claim?
 * Scaffolds → never. Approximations → only with the limitation in view.
 * Grammar → yes. Deprecated → no.
 */
export function mayClaimLinguisticFact(c) {
  if (!c) return false;
  return c.status === CONSTRUCTION_STATUS.GRAMMAR;
}
