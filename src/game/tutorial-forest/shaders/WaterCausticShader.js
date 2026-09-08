/**
 * Tutorial Forest — WebGL Water Caustic Shader
 *
 * Runs a custom GLSL fragment shader simulating real-time dual-sine wave
 * interference, caustic refraction lines, and specular sparkle across
 * the sacred lotus pond.
 *
 * Diamond masking conforms organically to the 2:1 dimetric isometric tile grid.
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
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  float t = uTime * 2.2;

  // Dual-sine caustic interference pattern
  float w1 = sin(uv.x * 28.0 + t + sin(uv.y * 20.0 + t * 0.8));
  float w2 = cos(uv.y * 26.0 - t * 1.3 + cos(uv.x * 24.0 + t * 0.9));
  float w3 = sin((uv.x + uv.y) * 18.0 + t * 1.6);
  
  // Caustic web lines
  float causticVal = pow(clamp((w1 + w2 + w3) / 3.0 + 0.38, 0.0, 1.0), 3.2);

  // Specular surface sparkle
  float sparkle = pow(clamp((w1 * w2) + 0.35, 0.0, 1.0), 7.0) * 1.4;

  // 2:1 Dimetric diamond boundary mask centered at (0.5, 0.5)
  vec2 d = abs(uv - vec2(0.5));
  float isoDist = (d.x * 2.0) + (d.y * 4.0);
  float mask = smoothstep(1.02, 0.94, isoDist);

  // Blend water body with caustics and highlights
  vec4 col = mix(uWaterBase, uCausticColor, causticVal * 0.7 + sparkle * 0.45);
  col.a *= mask;

  gl_FragColor = col;
}
`;

/**
 * Creates an isometric WebGL water caustic shader game object.
 */
export function createWaterCausticShader(scene, x, y, width = 80, height = 40) {
  if (!scene?.add?.shader) return null;

  try {
    const key = 'water_caustic_frag';
    if (scene.cache?.shader && !scene.cache.shader.has(key)) {
      scene.cache.shader.add(key, WATER_CAUSTIC_FRAG_SRC);
    }

    if (scene.cache?.shader?.has(key)) {
      const shader = scene.add.shader(key, x, y, width, height);
      if (shader) {
        shader.setOrigin(0.5, 0.5);
        if (typeof shader.setUniform === 'function') {
          shader.setUniform('uWaterBase.value', [0.03, 0.36, 0.46, 0.82]);
          shader.setUniform('uCausticColor.value', [0.38, 0.96, 0.88, 0.95]);
        }
        return shader;
      }
    }

    const shader = scene.add.shader({
      fragmentSource: WATER_CAUSTIC_FRAG_SRC,
      setupUniforms: (setUniform) => {
        const t = (scene.time?.now || 0) * 0.001;
        setUniform('uTime', t);
        setUniform('uWaterBase', [0.03, 0.36, 0.46, 0.82]);
        setUniform('uCausticColor', [0.38, 0.96, 0.88, 0.95]);
      },
    }, x, y, width, height);

    if (shader) shader.setOrigin(0.5, 0.5);
    return shader;
  } catch (err) {
    console.warn('[WaterCausticShader] WebGL shader creation failed, falling back:', err);
    return null;
  }
}
