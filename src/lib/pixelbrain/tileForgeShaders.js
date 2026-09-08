export const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y; // Flip Y for canvas texture coordinates
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FS_SOURCE = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform int u_mode; // 0=off, 1=day, 2=twilight, 3=night, 4=prismatic
uniform float u_glow;
uniform float u_warmth;
uniform vec2 u_resolution;

void main() {
  vec4 base = texture2D(u_texture, v_uv);
  if (u_mode == 0) {
    gl_FragColor = base;
    return;
  }

  // Emissive detection: identify glowing crystals, flowers, and rims
  float isCyan = step(0.65, base.b) * step(0.55, base.g);
  float isMagenta = step(0.65, base.r) * step(0.65, base.b) * (1.0 - step(0.6, base.g));
  float isEmerald = step(0.7, base.g) * (1.0 - step(0.8, base.b));
  float isBright = step(0.82, max(base.r, max(base.g, base.b)));
  float emissive = max(max(isCyan, isMagenta), max(isEmerald, isBright));

  float pulse = 0.85 + 0.35 * sin(u_time * 3.0 + v_uv.x * 15.0 + v_uv.y * 15.0);

  // Optical bloom 4-tap neighbor sample
  vec2 px = 2.0 / u_resolution;
  vec4 s1 = texture2D(u_texture, v_uv + vec2(px.x, 0.0));
  vec4 s2 = texture2D(u_texture, v_uv - vec2(px.x, 0.0));
  vec4 s3 = texture2D(u_texture, v_uv + vec2(0.0, px.y));
  vec4 s4 = texture2D(u_texture, v_uv - vec2(0.0, px.y));

  float neighborEmissive = (
    step(0.75, max(s1.r, max(s1.g, s1.b))) +
    step(0.75, max(s2.r, max(s2.g, s2.b))) +
    step(0.75, max(s3.r, max(s3.g, s3.b))) +
    step(0.75, max(s4.r, max(s4.g, s4.b)))
  ) * 0.25;

  vec3 bloom = (base.rgb * emissive * pulse + (s1.rgb + s2.rgb + s3.rgb + s4.rgb) * 0.25 * neighborEmissive) * u_glow;
  vec3 col = base.rgb;

  // Atmosphere grading passes
  if (u_mode == 1) {
    // Day Glade: Warm golden sunlight & crisp contrast
    col += vec3(0.06, 0.04, -0.02) * u_warmth;
    col = mix(col, col * 1.05, 0.5);
    col += bloom * 0.6;
  } else if (u_mode == 2) {
    // Twilight Amber: Purple dusk shadows with warm amber rims
    col = mix(col, vec3(col.r * 1.15, col.g * 0.82, col.b * 1.3), 0.4);
    if (base.r > 0.45 && base.g > 0.35) {
      col += vec3(0.12, 0.06, 0.0) * u_warmth;
    }
    col += bloom * 1.0;
  } else if (u_mode == 3) {
    // Night Bioluminescent: Abyssal darkness with vivid glowing crystal/spore nodes
    col *= vec3(0.28, 0.38, 0.68);
    col += bloom * 2.2;
  } else if (u_mode == 4) {
    // Prismatic Glacial: Crystalline icy shimmer
    float shimmer = sin(v_uv.y * 40.0 + u_time * 2.0) * 0.04;
    col = vec3(col.r * 0.9 + shimmer, col.g * 1.08, col.b * 1.25);
    col += bloom * 1.4;
  }

  // Soft dimetric edge vignette
  float dist = distance(v_uv, vec2(0.5));
  col *= smoothstep(0.85, 0.35, dist * 0.7);

  gl_FragColor = vec4(col, base.a);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

export function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link failed: ${info}`);
  }
  return prog;
}
