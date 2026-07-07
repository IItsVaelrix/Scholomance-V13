/** Delay before defeated combatants are removed from the arena. */
export const DEFEATED_ENEMY_DISAPPEAR_MS = 10_000;

/**
 * Destroys sentinel torch / brazier visuals.
 *
 * @param {object|null} effect
 */
export function destroySentinelTorchEffect(effect) {
  if (!effect) return;
  effect.bobContainer?.destroy?.(true);
  effect.shadow?.destroy?.();
  effect.ambient?.destroy?.();
}

/**
 * Destroys portal warden rig visuals.
 *
 * @param {object|null} effect
 */
export function destroyPortalWardenEffect(effect) {
  if (!effect) return;
  effect.container?.destroy?.(true);
}