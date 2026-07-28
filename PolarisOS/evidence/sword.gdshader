shader_type canvas_item;

// Canonical uniforms from Scholomance clock and spells
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_resonance;
uniform int u_school;
uniform float u_vowel_density;
uniform vec3 u_palette0;

// Custom uniforms defined in packet
uniform vec3 u_rim_color;
uniform float u_spec_power;

// User-written pbMain contract
// Sword — specular blade highlight + diffuse body + rim light.
// Deterministic: all lighting derives from fixed light direction + u_time shimmer.
const vec3 LIGHT_DIR = normalize(vec3(-0.6, -0.7, 0.4)); // upper-left key light
const vec3 SPEC_COLOR = vec3(0.95, 0.97, 1.0);           // cool white specular
const vec3 RIM_COLOR = vec3(0.55, 0.65, 0.85);           // steel-blue rim
const float SPEC_POWER = 32.0;
const float RIM_POWER = 3.0;

// Blade region in UV: x in [0.33, 0.67], y in [0.0, 0.625] (rows 0-19 of 32)
float bladeMask(vec2 uv) {
  float bx = smoothstep(0.30, 0.36, uv.x) * (1.0 - smoothstep(0.64, 0.70, uv.x));
  float by = 1.0 - smoothstep(0.58, 0.65, uv.y);
  return bx * by;
}

// Fuller groove: narrow dark channel down the blade center
float fullerMask(vec2 uv) {
  float fx = smoothstep(0.40, 0.43, uv.x) * (1.0 - smoothstep(0.57, 0.60, uv.x));
  float fy = smoothstep(0.08, 0.12, uv.y) * (1.0 - smoothstep(0.55, 0.60, uv.y));
  return fx * fy;
}

vec4 pbMain(vec2 uv, float time, float resonance) {
  // Surface normal approximation: blade faces viewer, slight bevel at edges
  float blade = bladeMask(uv);
  float fuller = fullerMask(uv);

  // Bevel normal: edges tilt outward
  float bevelX = (uv.x - 0.5) * 4.0;
  vec3 N = normalize(vec3(bevelX * blade * 0.3, 0.0, 1.0));

  // Diffuse
  float diff = max(dot(N, LIGHT_DIR), 0.0) * 0.6 + 0.4;

  // Specular (Blinn-Phong)
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(LIGHT_DIR + V);
  float spec = pow(max(dot(N, H), 0.0), SPEC_POWER) * blade;

  // Animated shimmer along blade length (subtle, resonance-driven)
  float shimmer = sin(uv.y * 40.0 - time * 2.0) * 0.5 + 0.5;
  spec *= (0.7 + 0.3 * shimmer * resonance);

  // Rim light (Fresnel approximation)
  float rim = pow(1.0 - max(dot(N, V), 0.0), RIM_POWER) * blade;

  // Fuller darkening
  float groove = 1.0 - fuller * 0.4;

  vec3 color = vec3(diff * groove);
  color += SPEC_COLOR * spec * 0.8;
  color += RIM_COLOR * rim * 0.3;

  float alpha = max(spec * 0.9, max(rim * 0.4, 0.0));
  return vec4(color, clamp(alpha, 0.0, 1.0));
}

void fragment() {
    // Call user-authored pbMain with normalized UV coordinates
    COLOR = pbMain(UV, u_time, u_resonance);
}
