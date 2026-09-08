/**
 * Tutorial Forest — WebGL Foliage Wind Flutter Shader
 *
 * Simulates organic canopy flutter by applying a height-attenuated horizontal
 * sine wave displacement in the GLSL fragment stage.
 *
 * In dimetric RPG sprites, the trunk base (bottom of sprite) has attenuation = 0,
 * keeping it firmly anchored to the earth, while the upper branches and leaves
 * flutter freely with gusts of forest wind.
 */

export const FOLIAGE_WIND_FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uWindStrength;
uniform float uPhase;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;

  // Height attenuation: in WebGL texture coords, y=1 is top, y=0 is bottom
  // For standard sprites, top of canopy is near y=1
  float h = clamp(uv.y, 0.0, 1.0);
  float heightFactor = pow(h, 1.8);

  // Organic wind gusts: combined primary sway + high-frequency leaf flutter
  float t = uTime * 2.6 + uPhase;
  float sway = sin(t + uv.y * 6.0) * 0.028 * heightFactor * uWindStrength;
  float leafFlutter = sin(t * 2.8 + uv.x * 24.0) * 0.010 * heightFactor * uWindStrength;

  vec2 displacedUV = uv + vec2(sway + leafFlutter, 0.0);

  if (displacedUV.x < 0.0 || displacedUV.x > 1.0 || displacedUV.y < 0.0 || displacedUV.y > 1.0) {
    gl_FragColor = vec4(0.0);
  } else {
    gl_FragColor = texture2D(uMainSampler, displacedUV);
  }
}
`;

/**
 * Creates a foliage wind shader game object for a tree or large flora sprite.
 */
export function createFoliageWindShader(scene, textureKey, x, y, width, height, phase = 0) {
  if (!scene?.add?.shader) return null;

  try {
    const key = 'foliage_wind_frag';
    if (scene.cache?.shader && !scene.cache.shader.has(key)) {
      scene.cache.shader.add(key, FOLIAGE_WIND_FRAG_SRC);
    }

    if (scene.cache?.shader?.has(key)) {
      const shader = scene.add.shader(key, x, y, width, height, [textureKey]);
      if (shader) {
        shader.setOrigin(0.5, 0.95);
        if (typeof shader.setUniform === 'function') {
          shader.setUniform('uWindStrength.value', scene.windEnabled ? 1.0 : 0.0);
          shader.setUniform('uPhase.value', phase);
        }
        return shader;
      }
    }

    const shader = scene.add.shader({
      fragmentSource: FOLIAGE_WIND_FRAG_SRC,
      setupUniforms: (setUniform) => {
        const t = (scene.time?.now || 0) * 0.001;
        const wind = scene.windEnabled ? 1.0 : 0.0;
        setUniform('uMainSampler', 0);
        setUniform('uTime', t);
        setUniform('uWindStrength', wind);
        setUniform('uPhase', phase);
      },
    }, x, y, width, height, [textureKey]);

    if (shader) shader.setOrigin(0.5, 0.95);
    return shader;
  } catch (err) {
    console.warn('[FoliageWindShader] WebGL shader creation failed, falling back to sprite:', err);
    return null;
  }
}
