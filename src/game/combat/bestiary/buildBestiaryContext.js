/**
 * @param {import('./combatBestiary.types.js').BestiaryRuntimeContext} [overrides]
 * @returns {import('./combatBestiary.types.js').BestiaryRuntimeContext}
 */
export function buildBestiaryRuntimeContext(overrides = {}) {
  const enemyId = overrides.enemyId || overrides.target?.id || overrides.record?.id || null;
  return {
    enemyId,
    target: overrides.target || null,
    record: overrides.record || null,
    entity: overrides.entity || null,
    entitySnapshot: overrides.entitySnapshot || null,
  };
}

/**
 * @param {import('../weave-scene-targets.js').SceneContextSnapshot} [sceneContext]
 * @param {string} enemyId
 * @param {object} [entitySnapshot]
 */
export function buildBestiaryContextFromScene(sceneContext, enemyId, entitySnapshot = null) {
  const target = sceneContext?.targets?.find((entry) => entry.id === enemyId) || null;
  return buildBestiaryRuntimeContext({
    enemyId,
    target,
    entitySnapshot,
  });
}