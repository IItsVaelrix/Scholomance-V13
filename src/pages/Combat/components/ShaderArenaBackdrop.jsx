/**
 * ShaderArenaBackdrop.jsx - PixelBrain shader battle-zone atmosphere.
 *
 * Runs a PB-SHADER-v1 packet on a dedicated WebGL2 <canvas> that sits *behind*
 * the Phaser board. Rendering through the engine adapter's raw-WebGL helpers
 * (compile/quad/resolve/render) keeps us off Phaser's pipeline API, so the
 * Phaser-3 → 4 PostFX migration can't break the arena floor.
 *
 * LAW: pure UI consumer of the sanctioned adapter - no pixelbrain core imports.
 */

import { useEffect, useRef } from 'react';
import {
  createShaderPacket,
  compileShaderProgram,
  createFullscreenQuad,
  disposeFullscreenQuad,
  resolveShaderUniforms,
  renderShaderFrame,
  disposeShaderProgram,
  DEFAULT_SHADER_UNIFORMS,
} from '../../../lib/pixelbrain.adapter.js';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion.js';
import { SCHOOL_PALETTE } from '../assets/combatAssets.js';

const SCHOOL_INDEX = { SONIC: 0, PSYCHIC: 1, VOID: 2, ALCHEMY: 3, WILL: 4, NECROMANCY: 5, ABJURATION: 6, DIVINATION: 7 };

// The VOID arena: a SOLID, opaque obsidian chamber - a stone floor receding to a
// horizon, veined with glowing amethyst fissures, a back wall, and a central
// singularity. Opaque alpha so the board reads as standing on real ground, not
// floating. School palette tints the amethyst; resonance drives the glow.
const ARENA_FRAGMENT = `
vec3 palette(float t, vec3 base) {
  vec3 a = base * 0.5;
  vec3 b = base * 0.5;
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.15, 0.30);
  return a + b * cos(6.28318 * (c * t + d));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// Ridged noise → sharp glowing fissure veins.
float ridge(vec2 p) {
  return 1.0 - abs(2.0 * fbm(p) - 1.0);
}

vec4 pbMain(vec2 uv, float time, float resonance) {
  vec3 amethyst = u_palette0 * 1.9 + vec3(0.12, 0.0, 0.22);
  vec3 obsidian = vec3(0.085, 0.075, 0.13);
  float horizon = 0.40;

  vec3 col;

  if (uv.y < horizon) {
    // ── BACK WALL: void gloom rising to the horizon ──
    float wy = uv.y / horizon;                       // 0 top .. 1 horizon
    col = mix(vec3(0.008, 0.008, 0.02), obsidian * 0.9, wy);
    float strata = fbm(vec2(uv.x * 7.0, uv.y * 4.0 + time * 0.02));
    col += obsidian * strata * 0.5 * wy;
    // Singularity: a dark core with a blazing accretion halo on the horizon.
    vec2 sc = vec2(0.5, horizon);
    float sd = distance((uv - sc) * vec2(1.5, 2.2), vec2(0.0));
    col += amethyst * smoothstep(0.34, 0.0, sd) * (0.6 + 0.4 * resonance);
    col *= 1.0 - smoothstep(0.05, 0.0, sd) * 0.9;    // dark singularity center
  } else {
    // ── FLOOR: obsidian stone in perspective, veined with amethyst ──
    float fy = (uv.y - horizon) / (1.0 - horizon);   // 0 horizon .. 1 near
    float persp = 1.0 / (fy * fy * 5.5 + 0.10);
    vec2 fp = vec2((uv.x - 0.5) * persp * 1.3, persp * 0.6 + time * 0.05);

    float stone = 0.6 * fbm(fp * 0.8) + 0.4 * fbm(fp * 2.1);
    col = mix(obsidian * 0.75, obsidian * 1.9, stone);

    // Receding flagstone grid.
    vec2 gl = abs(fract(vec2((uv.x - 0.5) * persp * 1.3, fp.y)) - 0.5);
    float grid = smoothstep(0.46, 0.5, max(gl.x, gl.y));
    col += amethyst * grid * 0.12 * clamp(fy, 0.0, 1.0);

    // Glowing amethyst fissures.
    float veins = smoothstep(0.82, 1.0, ridge(fp * 1.1));
    float pulse = 0.6 + 0.4 * sin(time * 1.4 + fp.y * 2.0);
    col += amethyst * veins * pulse * (0.7 + 0.7 * resonance) * clamp(fy * 1.4, 0.0, 1.0);

    // Fade into the horizon haze.
    col = mix(obsidian * 0.5, col, clamp(fy * 1.5, 0.0, 1.0));
  }

  // Horizon ground-glow seam.
  col += amethyst * smoothstep(0.025, 0.0, abs(uv.y - horizon)) * 0.5;

  // Chamber vignette.
  vec2 q = uv - 0.5; q.x *= 1.3;
  col *= smoothstep(1.15, 0.25, length(q));
  col *= 0.85 + 0.3 * resonance;

  return vec4(col, 1.0);   // OPAQUE - solid ground, never a hologram
}
`;

export default function ShaderArenaBackdrop({ school = 'SONIC', resonance = 0.55 }) {
  const canvasRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  // Keep latest props readable inside the RAF loop without re-init.
  const stateRef = useRef({ school, resonance });
  useEffect(() => { stateRef.current = { school, resonance }; }, [school, resonance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true });
    if (!gl) return; // No WebGL2 - CSS gradient shows through.

    let program;
    let quad;
    let raf = 0;
    let disposed = false;
    const start = performance.now();

    try {
      program = compileShaderProgram(gl, ARENA_FRAGMENT);
      quad = createFullscreenQuad(gl);
    } catch (err) {
      console.error('[ShaderArenaBackdrop] shader compile failed:', err);
      return;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const packet = createShaderPacket({
      id: 'combat-arena-floor',
      label: 'Combat Arena Floor',
      fragmentSource: ARENA_FRAGMENT,
      uniforms: DEFAULT_SHADER_UNIFORMS,
    });

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth));
      const h = Math.max(1, Math.floor(canvas.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const drawFrame = () => {
      resize();
      const { school: sch, resonance: res } = stateRef.current;
      const pal = SCHOOL_PALETTE[sch] || SCHOOL_PALETTE.SONIC;
      const elapsed = reducedMotion ? 0 : (performance.now() - start) / 1000;
      const runtimeState = {
        clock: { elapsedSeconds: elapsed },
        canvas: { size: [canvas.width, canvas.height] },
        spell: { schoolIndex: SCHOOL_INDEX[sch] ?? 0 },
        verse: { resonance: res, vowelDensity: 0.5 },
        palette: { 0: { rgb01: pal.primary } },
      };
      const resolved = resolveShaderUniforms(packet, runtimeState);
      renderShaderFrame(gl, program, quad, resolved);
    };

    if (reducedMotion) {
      drawFrame(); // single static frame
    } else {
      const loop = () => { drawFrame(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        disposeFullscreenQuad(gl, quad);
        disposeShaderProgram(gl, program);
      } catch { /* context may already be gone */ }
      void disposed;
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="shader-arena-backdrop"
      aria-hidden="true"
    />
  );
}
