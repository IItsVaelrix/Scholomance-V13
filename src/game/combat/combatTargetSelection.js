/**
 * Player-selected combat target helpers (Tab cycle + right-click).
 *
 * Scene authority stores selectedCombatTargetId; this module keeps ordering
 * and weave merge logic pure and testable.
 */

/**
 * @param {import('./weave-scene-targets.js').SceneTarget} target
 * @param {number} playerTx
 * @param {number} playerTy
 */
export function manhattanTargetDistance(target, playerTx, playerTy) {
  const tx = Number(target.tx ?? 0);
  const ty = Number(target.ty ?? 0);
  return Math.abs(tx - playerTx) + Math.abs(ty - playerTy);
}

/**
 * @param {import('./weave-scene-targets.js').SceneContextSnapshot} [sceneContext]
 * @param {object} [options]
 * @param {number} [options.playerTx]
 * @param {number} [options.playerTy]
 * @param {(targetId: string) => boolean} [options.isAlive]
 */
export function listTargetableCombatants(sceneContext, {
  playerTx = 0,
  playerTy = 0,
  isAlive = () => true,
} = {}) {
  const combatants = (sceneContext?.targets || []).filter((entry) => entry.kind === 'combatant');
  return combatants
    .filter((entry) => isAlive(entry.id))
    .sort((a, b) => {
      const distA = manhattanTargetDistance(a, playerTx, playerTy);
      const distB = manhattanTargetDistance(b, playerTx, playerTy);
      const rankA = distA + (a.inRange ? 0 : 1000);
      const rankB = distB + (b.inRange ? 0 : 1000);
      if (rankA !== rankB) return rankA - rankB;
      return a.id.localeCompare(b.id);
    });
}

/**
 * @param {string | null | undefined} currentId
 * @param {string[]} orderedIds
 * @returns {string | null}
 */
export function cycleCombatTargetId(currentId, orderedIds) {
  if (!orderedIds.length) return null;
  if (!currentId) return orderedIds[0];
  const index = orderedIds.indexOf(currentId);
  if (index === -1) return orderedIds[0];
  return orderedIds[(index + 1) % orderedIds.length];
}

/**
 * Apply the player's selected combatant when the weave did not name one explicitly.
 *
 * @param {object} resolvedTargets
 * @param {string | null | undefined} selectedTargetId
 * @param {import('./weave-scene-targets.js').SceneContextSnapshot} [sceneContext]
 * @param {object} [options]
 * @param {(targetId: string) => boolean} [options.canAttack]
 */
export function mergeSelectedCombatTarget(
  resolvedTargets,
  selectedTargetId,
  sceneContext,
  { canAttack } = {},
) {
  if (!selectedTargetId || !sceneContext) return resolvedTargets;
  if (resolvedTargets?.namedTargetId) return resolvedTargets;

  const target = sceneContext.targets.find((entry) => entry.id === selectedTargetId);
  if (target?.kind !== 'combatant') return resolvedTargets;
  if (
    canAttack
    && resolvedTargets?.primaryTargetId
    && !canAttack(selectedTargetId)
  ) {
    return resolvedTargets;
  }

  const selectionClause = {
    objectToken: null,
    nameToken: 'SELECTED',
    resolvedTarget: {
      id: selectedTargetId,
      confidence: 1,
      reason: 'player_selected',
    },
    alternatives: [],
  };

  return {
    ...resolvedTargets,
    primaryTargetId: selectedTargetId,
    selectedTargetId,
    clauses: [...(resolvedTargets.clauses || []), selectionClause],
  };
}