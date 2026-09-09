/**
 * Tutorial Forest — WebGL Water Surface Field
 *
 * One unified field over the whole region (not per-tile boxes): the pattern is
 * continuous in ground pixel space, lifted into the 2:1 dimetric plane so every
 * water tile shows the same specimen flowing across it, and the region's real
 * water_pond material mask activates it only inside the water silhouette.
 *
 * The surface reads as STILL water: faint wind ripple bands quantized to two
 * pixel states, no boiling. When the character steps on a shore "pressure
 * plate" (see TutorialForestScene.computeReflectionPlates), a mirrored ghost of
 * the character is meshed into the same field at slight opacity, sheared by the
 * same wind ripple, so the pond behaves like a mirror.
 */

export const WATER_CAUSTIC_FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uWaterBase;
uniform vec4 uCausticColor;
uniform sampler2D uMaskSampler;
uniform float uHasMask;
uniform sampler2D uGhostSampler;
uniform float uGhostEnabled;
uniform vec4 uGhostRect;
uniform float uGhostAlpha;
uniform float uGhostFlip;
varying vec2 outTexCoord;

void main() {
  // Mesh to the authored water silhouette pixel-by-pixel.
  float mask = 1.0;
  if (uHasMask > 0.5) {
    mask = texture2D(uMaskSampler, outTexCoord).r;
  }
  if (mask < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Integer pixel lattice so the field aligns with the water's pixel clusters.
  vec2 px = floor(outTexCoord * uResolution);
  float t = uTime * 2.2;

  // One continuous specimen across the dimetric plane of the tile grid.
  vec2 iso = vec2(px.x / 40.0 + px.y / 20.0, px.y / 20.0 - px.x / 40.0);

  // Still water: two faint wind ripple bands, quantized to pixel states.
  float w1 = sin(iso.x * 2.2 + t + sin(iso.y * 1.6 + t * 0.8));
  float w2 = cos(iso.y * 2.0 - t * 1.1 + cos(iso.x * 1.8 + t * 0.7));
  float ripple = clamp((w1 + w2) * 0.25 + 0.5, 0.0, 1.0);
  float rippleStep = floor(ripple * 2.0 + 0.5) / 2.0;

  vec4 col = mix(uWaterBase, uCausticColor, rippleStep * 0.22);

  // Mirror ghost: the character's reflection, clipped by the water mask and
  // sheared by the same wind ripple so it breathes with the surface.
  float ghostA = 0.0;
  vec3 ghostRgb = vec3(0.0);
  if (uGhostEnabled > 0.5 && uGhostRect.z > 0.0 && uGhostRect.w > 0.0) {
    vec2 g = vec2(
      (px.x - uGhostRect.x) / uGhostRect.z,
      (px.y - uGhostRect.y) / uGhostRect.w
    );
    if (g.x >= 0.0 && g.x <= 1.0 && g.y >= 0.0 && g.y <= 1.0) {
      g.x += (rippleStep - 0.5) * 0.06;
      // Water screen-below the Wanderer mirrors top-to-bottom; water screen-
      // above (pond beyond them) carries the mirror parity upright instead.
      float v = mix(g.y, 1.0 - g.y, uGhostFlip);
      vec4 gt = texture2D(uGhostSampler, vec2(clamp(g.x, 0.0, 1.0), clamp(v, 0.0, 1.0)));
      // Fade with distance from the waterline, whichever screen side it lies on.
      float depthFade = mix(1.0 - g.y * 0.55, 0.45 + 0.55 * g.y, uGhostFlip);
      ghostA = gt.a * uGhostAlpha * depthFade;
      ghostRgb = gt.rgb;
    }
  }

  // Accumulate premultiplied (Phaser blends ONE, ONE_MINUS_SRC_ALPHA).
  float waterA = col.a;
  vec3 premult = col.rgb * waterA + ghostRgb * ghostA;
  float outA = clamp(waterA + ghostA * (1.0 - waterA), 0.0, 1.0);
  gl_FragColor = vec4(premult, outA);
}
`;

/**
 * Creates the unified water surface field shader game object.
 *
 * @param {object} scene Phaser scene
 * @param {number} x Region origin X (world space)
 * @param {number} y Region origin Y (world space)
 * @param {number} width Region width in ground pixels
 * @param {number} height Region height in ground pixels
 * @param {string|null} maskTextureKey Water silhouette mask texture key
 */
export function createWaterCausticShader(scene, x, y, width = 80, height = 40, maskTextureKey = null) {
  if (!scene?.add?.shader) return null;

  try {
    // fragmentSource is passed directly: the Phaser 4 shader cache stores
    // BaseShader instances (`.glsl`), not raw strings, so caching a plain string
    // would silently fall back to the default fragment program.
    const shader = scene.add.shader({
      fragmentSource: WATER_CAUSTIC_FRAG_SRC,
      setupUniforms: (setUniform) => {
        // Slow stepped clock: still water that breathes, never boils.
        const now = scene.time?.now || 0;
        const stepped = Math.floor(now / 520) * 0.1;
        const refl = scene.waterReflection || null;
        setUniform('uTime', stepped);
        setUniform('uResolution', [width, height]);
        setUniform('uWaterBase', [0.03, 0.36, 0.46, 0.22]);
        setUniform('uCausticColor', [0.38, 0.96, 0.88, 0.5]);
        setUniform('uMaskSampler', 0);
        setUniform('uHasMask', maskTextureKey ? 1.0 : 0.0);
        setUniform('uGhostSampler', 1);
        setUniform('uGhostEnabled', refl?.enabled ? 1.0 : 0.0);
        setUniform('uGhostRect', refl ? [refl.x, refl.y, refl.w, refl.h] : [0, 0, 0, 0]);
        setUniform('uGhostAlpha', refl?.alpha ?? 0.26);
        setUniform('uGhostFlip', refl?.flip ? 1.0 : 0.0);
      },
    }, x, y, width, height, maskTextureKey ? [maskTextureKey, '__DEFAULT'] : undefined);

    return shader || null;
  } catch (err) {
    console.warn('[WaterCausticShader] WebGL shader creation failed, falling back:', err);
    return null;
  }
}
