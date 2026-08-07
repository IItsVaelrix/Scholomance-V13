/**
 * CONSTELLATION — pure discovery plan builder
 *
 * Maps a DiscoveryParse into generators, hard constraints, mode, and scorer profile.
 * No I/O.
 *
 * Spec: docs/superpowers/specs/2026-08-07-constellationos-poetic-discovery-design.md §4.x
 */

/**
 * @typedef {{
 *   status: 'ok'|'refuse',
 *   relation: 'resemble'|'rhyme'|'near'|'opposite'|'unknown',
 *   seeds: string[],
 *   modifiers: string[],
 *   constraints: { rhymeWith: string|null },
 * }} DiscoveryParse
 *
 * @typedef {{ type: 'semantic'|'antonym'|'rhyme', seed: string }} Generator
 * @typedef {{ type: 'rhymeWith', token: string }} PlanConstraint
 *
 * @typedef {{
 *   mode: 'semantic'|'rhyme'|'semantic+rhyme',
 *   generators: Generator[],
 *   constraints: PlanConstraint[],
 *   scorerProfile: 'semantic'|'rhyme-forward',
 *   modifiers: string[],
 *   seeds: string[],
 *   relation: DiscoveryParse['relation'],
 * }} DiscoveryPlan
 */

/**
 * Build a candidate generation plan from a discovery parse.
 *
 * @param {DiscoveryParse|null|undefined} parse
 * @returns {DiscoveryPlan|null}
 */
export function buildDiscoveryPlan(parse) {
  if (!parse || parse.status !== 'ok') return null;

  const seeds = Array.isArray(parse.seeds) ? parse.seeds : [];
  const relation = parse.relation || 'unknown';
  const modifiers = Array.isArray(parse.modifiers) ? [...parse.modifiers] : [];
  const rhymeWith =
    parse.constraints && parse.constraints.rhymeWith != null
      ? String(parse.constraints.rhymeWith)
      : null;

  /** @type {Generator[]} */
  const generators = [];

  if (relation === 'opposite') {
    for (const seed of seeds) {
      generators.push({ type: 'antonym', seed });
    }
  } else if (relation === 'rhyme') {
    const seed = rhymeWith || seeds[0];
    if (seed) generators.push({ type: 'rhyme', seed });
  } else {
    // resemble / near / default → semantic gen per seed
    for (const seed of seeds) {
      generators.push({ type: 'semantic', seed });
    }
  }

  /** @type {PlanConstraint[]} */
  const constraints = [];
  // constraints.rhymeWith always becomes a hard constraint when non-null
  if (rhymeWith) {
    constraints.push({ type: 'rhymeWith', token: rhymeWith });
  }

  const hasSemanticOrAntonym = generators.some(
    (g) => g.type === 'semantic' || g.type === 'antonym',
  );
  const hasRhymeGen = generators.some((g) => g.type === 'rhyme');
  const hasRhymeConstraint = constraints.some((c) => c.type === 'rhymeWith');

  /** @type {DiscoveryPlan['mode']} */
  let mode;
  if (hasSemanticOrAntonym && hasRhymeConstraint) {
    mode = 'semantic+rhyme';
  } else if (hasRhymeGen && !hasSemanticOrAntonym) {
    mode = 'rhyme';
  } else {
    mode = 'semantic';
  }

  /** @type {DiscoveryPlan['scorerProfile']} */
  let scorerProfile = 'semantic';
  if (
    mode === 'rhyme' ||
    (relation === 'rhyme' && !generators.some((g) => g.type === 'semantic'))
  ) {
    scorerProfile = 'rhyme-forward';
  }

  return {
    mode,
    generators,
    constraints,
    scorerProfile,
    modifiers,
    seeds: [...seeds],
    relation,
  };
}
