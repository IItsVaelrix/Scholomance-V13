/**
 * Tutorial Forest — WebGL Foliage Wind Flutter Shader
 *
 * Simulates organic canopy flutter by applying a height-attenuated horizontal
 * displacement in the GLSL fragment stage.
 *
 * In dimetric RPG sprites the trunk base (bottom of sprite) has attenuation = 0,
 * keeping it firmly anchored to the earth, while the upper branches and leaves
 * drift with the wind.
 *
 * The dominant term `uWindLean` is supplied by the SHARED forest wind field
 * (world/windField.js), so every tree on screen leans the same way at the same
 * instant. This shader deliberately has no per-tree oscillator phase: the old
 * `uPhase` uniform gave each canopy a private clock, which made neighbours lean
 * in opposite directions and read as twenty-four separate winds rather than one.
 *
 * The residual `leafFlutter` term is a within-canopy shimmer keyed on uv.x. It
 * is high frequency and sub-pixel, so it adds life to a single crown without
 * desynchronizing crowns from each other.
 */

import { sampleWindShear } from '../world/windField.js';

export const FOLIAGE_WIND_FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uWindStrength;
uniform float uWindLean;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;

  // Height attenuation: textures upload with UNPACK_FLIP_Y_WEBGL, so uv.y = 1 is
  // the top of the sprite (crown) and uv.y = 0 is the bottom (trunk base). The
  // factor therefore vanishes at the roots and peaks at the canopy.
  float h = clamp(uv.y, 0.0, 1.0);
  float heightFactor = pow(h, 1.8);

  // Shared forest lean: identical for every tree at a given instant.
  float lean = uWindLean * heightFactor * uWindStrength;

  // Sub-pixel within-canopy shimmer. Amplitude is held well below the lean so it
  // can never overpower the coherent direction of the wind.
  float t = uTime * 2.6;
  float leafFlutter = sin(t * 2.8 + uv.x * 24.0) * 0.004 * heightFactor * uWindStrength;

  vec2 displacedUV = uv + vec2(lean + leafFlutter, 0.0);

  // Clamp instead of discarding: a hard transparent discard deleted the outer
  // canopy columns at peak gust, chewing the silhouette on every swing. The
  // quad is exactly sprite-sized, so any shear samples outside it; holding the
  // edge texel keeps the crown whole while it drifts.
  vec2 sampleUV = clamp(displacedUV, vec2(0.0, 0.0), vec2(1.0, 1.0));
  gl_FragColor = texture2D(uMainSampler, sampleUV);
}
`;

/**
 * Creates a foliage wind shader game object for a tree or large flora sprite.
 *
 * Uniforms are pushed through the per-render `setupUniforms` callback with exact
 * GLSL names (Phaser 4 matches them literally). The lean is sampled live from the
 * scene's shared wind field using this tree's tile coordinates, and the gust
 * clock is quantized so canopy flutter steps between authored states rather than
 * sliding smoothly.
 *
 * @param {object} scene - The Tutorial Forest scene (must expose `windField`).
 * @param {string} textureKey - Sprite texture to draw.
 * @param {number} x - World x.
 * @param {number} y - World y.
 * @param {number} width - Sprite width in pixels.
 * @param {number} height - Sprite height in pixels.
 * @param {{tx?: number, ty?: number}} tile - Tile coords, used only to place this
 *   tree along the shared traveling gust wave. Never as a private phase.
 */
export function createFoliageWindShader(scene, textureKey, x, y, width, height, tile = {}) {
  if (!scene?.add?.shader) return null;

  try {
    // fragmentSource is passed directly: the Phaser 4 shader cache stores
    // BaseShader instances (`.glsl`), not raw strings, so caching a plain string
    // would silently fall back to the default fragment program.
    const shader = scene.add.shader({
      fragmentSource: FOLIAGE_WIND_FRAG_SRC,
      setupUniforms: (setUniform) => {
        const now = scene.time?.now || 0;
        const stepped = Math.floor(now / 90) * 0.12;
        const field = scene.windField;
        setUniform('uMainSampler', 0);
        setUniform('uTime', stepped);
        setUniform('uWindStrength', scene.windEnabled ? 1.0 : 0.0);
        // Shared field, sampled at this tree's tile: coherent across the forest.
        setUniform('uWindLean', sampleWindShear(field, now, tile?.tx, tile?.ty, width));
      },
    }, x, y, width, height, [textureKey]);

    if (shader) shader.setOrigin(0.5, 0.95);
    return shader || null;
  } catch (err) {
    console.warn('[FoliageWindShader] WebGL shader creation failed, falling back to sprite:', err);
    return null;
  }
}
