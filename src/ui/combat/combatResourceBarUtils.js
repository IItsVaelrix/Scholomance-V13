/**
 * Pure helpers for combat HUD resource bars.
 * @param {number|null|undefined} current
 * @param {number|null|undefined} max
 * @returns {number} ratio in [0, 1]
 */
export function computeResourceBarRatio(current, max) {
  const ceiling = Number(max);
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 0;
  const value = Number(current);
  const safe = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, safe / ceiling));
}