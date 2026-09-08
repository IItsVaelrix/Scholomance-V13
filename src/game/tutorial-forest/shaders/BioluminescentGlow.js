/**
 * Tutorial Forest — WebGL Bioluminescent Glow System
 *
 * Utilizes Phaser 4's native WebGL Glow filter pipeline on emissive flora,
 * sacred lotus blossoms, mystical petroglyph runes, and the waymarker obelisk.
 *
 * Emissive shaders create soft optical blooming without washing out the
 * discrete pixel art core.
 */

/**
 * Applies a WebGL bioluminescent glow effect to a Phaser Game Object.
 * Falls back gracefully to tweened radial gradient glow if WebGL filter is unavailable.
 *
 * @param {Phaser.GameObjects.GameObject} target
 * @param {object} options
 * @returns {object|null} Filter controller or tween
 */
export function applyBioluminescentGlow(target, {
  color = 0x10b981,
  outerStrength = 6,
  innerStrength = 0.5,
  scale = 1.0,
  quality = 10,
  distance = 12,
} = {}) {
  if (!target) return null;

  // 1. Attempt Phaser Native WebGL PostFX (Phaser 3.60+ / Phaser 4 WebGL)
  if (target.postFX) {
    try {
      if (typeof target.postFX.addGlow === 'function') {
        const glow = target.postFX.addGlow(color, outerStrength, innerStrength, false, quality, distance);
        return { type: 'webgl_postfx', filter: glow };
      }
      if (typeof target.postFX.addBloom === 'function') {
        const bloom = target.postFX.addBloom(color, 1, 1, 1.2, 0.8);
        return { type: 'webgl_postfx', filter: bloom };
      }
    } catch (err) {
      console.warn('[BioluminescentGlow] postFX glow failed:', err);
    }
  }

  // 2. Attempt Phaser 4 Filters
  if (typeof target.enableFilters === 'function') {
    try {
      target.enableFilters();
      if (target.filters?.internal?.addGlow) {
        const glowFilter = target.filters.internal.addGlow(
          color,
          outerStrength,
          innerStrength,
          scale,
          false,
          quality,
          distance
        );
        return { type: 'webgl_filter', filter: glowFilter };
      }
    } catch (err) {
      console.warn('[BioluminescentGlow] WebGL filter enable failed:', err);
    }
  }

  // 2. Fallback: Tint pulsing tween
  if (target.scene?.tweens) {
    const tween = target.scene.tweens.add({
      targets: target,
      alpha: 0.88,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return { type: 'tween_fallback', tween };
  }

  return null;
}
