/**
 * Tutorial Forest — WebGL Atmosphere PostFX Pipeline
 *
 * Drives time-of-day grading via Phaser 4's native WebGL Camera FilterList.
 * Provides rich chromatic tuning and edge vignetting for:
 * - Day: High-clarity, subtle warmth, crisp contrast.
 * - Twilight: Warm amber/magenta color matrix shift, gentle vignette.
 * - Night: Deep bioluminescent nocturnal grading (muted reds, boosted indigo/cyan),
 *          amplifying the optical pop of the glowing lotus and arcane runes.
 */

export function setupCameraAtmosphere(camera) {
  if (!camera) return null;

  try {
    if (camera.postFX && typeof camera.postFX.addColorMatrix === 'function') {
      const cm = camera.postFX.addColorMatrix();
      const vig = typeof camera.postFX.addVignette === 'function'
        ? camera.postFX.addVignette(0.5, 0.5, 0.85, 0.45)
        : null;
      return { cm, vig };
    }
    if (camera.filters?.internal && typeof camera.filters.internal.addColorMatrix === 'function') {
      const cm = camera.filters.internal.addColorMatrix();
      const vig = typeof camera.filters.internal.addVignette === 'function'
        ? camera.filters.internal.addVignette(0.5, 0.5, 0.85, 0.45)
        : null;
      return { cm, vig };
    }
  } catch (err) {
    console.warn('[AtmospherePostFX] WebGL camera filter setup failed:', err);
  }
  return null;
}

export function applyCameraLightingMode(atmosphere, mode) {
  if (!atmosphere) return;

  const { cm, vig } = atmosphere;
  if (!cm) return;
  const targetCm = cm.colorMatrix || cm;

  if (mode === 'twilight') {
    if (typeof targetCm.reset === 'function') targetCm.reset();
    if (typeof targetCm.warm === 'function') targetCm.warm();
    if (typeof targetCm.saturate === 'function') targetCm.saturate(1.2);
    if (vig) {
      vig.radius = 0.78;
      vig.strength = 0.5;
    }
  } else if (mode === 'night') {
    if (typeof targetCm.reset === 'function') targetCm.reset();
    if (typeof targetCm.night === 'function') targetCm.night();
    if (typeof targetCm.saturate === 'function') targetCm.saturate(1.15);
    if (vig) {
      vig.radius = 0.70;
      vig.strength = 0.65;
    }
  } else {
    // day
    if (typeof targetCm.reset === 'function') targetCm.reset();
    if (typeof targetCm.saturate === 'function') targetCm.saturate(1.05);
    if (vig) {
      vig.radius = 0.88;
      vig.strength = 0.35;
    }
  }
}
