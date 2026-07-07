/**
 * Maps weave bridge legality into a grammar factor for compendium tiers.
 */

const CLAUSE_PENALTIES = Object.freeze({
  legal: 1,
  inverted: 0.5,
  unfocused: 0.85,
  dangling: 0.75,
  collapsed: 0.25,
  inert: 0.6,
});

/**
 * @param {object|null|undefined} bridge
 * @param {string} [tierId]
 * @returns {number}
 */
export function computeGrammarFactor(bridge, tierId = '') {
  if (!bridge) return 0.6;
  if (bridge.collapsed) return tierId === 'LEXICAL_RARITY' ? 0.25 : 0.25;

  const clauses = bridge.clauses || [];
  if (!clauses.length) {
    return bridge.syntax?.legalOrder > 0 ? 0.9 : 0.7;
  }

  let worst = 1;
  for (const clause of clauses) {
    const penalty = CLAUSE_PENALTIES[clause.legality] ?? 0.8;
    worst = Math.min(worst, penalty);
  }

  if (tierId === 'LEXICAL_RARITY' && worst <= 0.5) {
    return 0.25;
  }

  return worst;
}

/**
 * @param {object|null|undefined} syntacticalChess
 * @returns {number}
 */
export function computeVerbosityPenalty(syntacticalChess) {
  const diagnostics = syntacticalChess?.diagnostics || [];
  const hasVerbosityFault = diagnostics.some((line) => (
    String(line).toUpperCase().includes('VERBOSITY')
    || String(line).toUpperCase().includes('BLOAT')
  ));
  return hasVerbosityFault ? 0.5 : 1;
}