/**
 * VRI Renderer — Deterministic passes that collapse a VRI scene into RGBA.
 *
 * Pass order:
 *   1. Geometry pass (SDF coverage + base color)
 *   2. Texture field pass (procedural grain per material)
 *   3. Mark pass (stamps, strokes)
 *   4. Lighting pass (key, rim, ambient, point)
 *   5. Atmosphere pass (fog, grading)
 *   6. Palette quantization (snap procedural colour to the material ramp)
 *   7. Raster patch pass (authored pixels, last and unquantized)
 *
 * All passes are pure functions of (scene, scale) → RGBA buffer.
 * No I/O. No randomness. Identical inputs → identical pixels.
 *
 * @bytecode PB-VRI-RENDER-v1
 */

import { LAYER_TYPES, BLEND_MODES, LIGHT_KINDS, QUANTIZATION_MODES } from './vri-schema.js';

// ─── Capability manifest ─────────────────────────────────────────────────────
//
// The single source of truth for what this renderer actually executes.
// The schema declares a superset: a field can be constructed, checksummed and
// carried through the scene without any pass reading it. Anything absent here
// is inert — the compiler consults this manifest so a carried-but-unexecuted
// declaration becomes a reported diagnostic instead of silence.
//
// Adding a pass? Add its capability here in the same commit, or the compiler
// will keep telling authors the feature does nothing.

export const RENDERER_CAPABILITIES = Object.freeze({
  version: 'PB-VRI-RENDER-v1',

  /** Layer types with a dedicated pass. */
  layerTypes: Object.freeze([
    LAYER_TYPES.GEOMETRY,
    LAYER_TYPES.TEXTURE_FIELD,
    LAYER_TYPES.MARK,
    LAYER_TYPES.RASTER_PATCH,
  ]),

  /** Blend modes with a dedicated branch in applyBlend(). */
  blendModes: Object.freeze([
    BLEND_MODES.NORMAL,
    BLEND_MODES.MULTIPLY,
    BLEND_MODES.SCREEN,
    BLEND_MODES.OVERLAY,
    BLEND_MODES.ADDITIVE,
    BLEND_MODES.SOFT_LIGHT,
  ]),

  /** Light kinds that contribute illumination in the lighting pass. */
  lightKinds: Object.freeze([
    LIGHT_KINDS.POINT,
    LIGHT_KINDS.DIRECTIONAL,
    LIGHT_KINDS.RIM,
    LIGHT_KINDS.AMBIENT,
  ]),

  /** Atmosphere sub-passes that are executed. */
  atmosphere: Object.freeze(['fog', 'grading']),

  /** Ordered dithering between adjacent ramp anchors during quantization. */
  orderedDither: true,

  /** Palette quantization modes with a dedicated pass. */
  quantizationModes: Object.freeze([
    QUANTIZATION_MODES.OFF,
    QUANTIZATION_MODES.LUMINANCE_BAND,
    QUANTIZATION_MODES.NEAREST_ANCHOR,
  ]),

  /** Texture coordinate spaces with a dedicated evaluation frame. */
  textureSpaces: Object.freeze(['object', 'surface', 'world', 'screen']),

  /**
   * Layer/payload fields the renderer reads. Anything a constructor accepts
   * that is not listed here is carried but never consulted.
   */
  layerFields: Object.freeze([
    'id', 'type', 'blendMode', 'opacity', 'payload',
  ]),

  /** Payload fields that are carried but never read by any pass. */
  inertFields: Object.freeze([
    'maskRef',            // no clipping pass
    'depthBand',          // layers render in array order, never sorted
    'coverageMode',       // coverage is chosen by strokeHalfWidth presence
    'aaWidth',            // edge width is derived from scale, not authored
    'partFilter',         // only materialFilter is honoured
    'strokeWidth',        // marks fill whole cells
    'taperStart',
    'taperEnd',
    'mark.width',         // per-mark width is ignored; pressure drives alpha
    'mark.kind',          // all mark kinds render identically
    'light.angle',        // no spot cone
  ]),
});

// ─── Utilities ───────────────────────────────────────────────────────────────

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/** Light kinds that actually contribute illumination in pass 4. */
const ILLUMINATING_LIGHT_KINDS = new Set(RENDERER_CAPABILITIES.lightKinds);

/** Rim lights are deliberately weaker than their nominal intensity. */
const RIM_FALLOFF = 0.6;

/**
 * How strongly a cell's in-plane normal tilts its surface away from the viewer.
 *
 * SCDL geometry is flat: a coordinate's `normal` is the in-plane direction of the
 * edge it sits on, not a surface orientation in space. Lighting it with a 2D dot
 * product treats every cell as a vertical wall facing some compass direction, so
 * for any single light roughly half the cells face away and receive nothing —
 * which is why bounding the lighting turned whole scenes black.
 *
 * Instead the in-plane normal is treated as *relief*: a perturbation of a surface
 * that fundamentally faces the viewer, N = normalize(nx·relief, ny·relief, 1).
 * At 0 every cell is flat-lit; at 1 the edges sculpt hard. 0.6 reads as raised
 * form without any face going fully dark.
 */
const NORMAL_RELIEF = 0.6;

/**
 * Lift a light's 2D to-light vector into 3D, matching how SCDL's `sphere` op
 * treats `light lx ly`: the out-of-plane component is the magnitude of the
 * in-plane part, giving the classic "upper-left and toward the viewer" key.
 */
function _toLight3(direction) {
  const dx = direction?.[0] ?? 0;
  const dy = direction?.[1] ?? 0;
  const inPlane = Math.hypot(dx, dy);
  const dz = inPlane === 0 ? 1 : inPlane;
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

/** Surface normal for a flat SCDL cell, as relief over a viewer-facing plane. */
function _surfaceNormal(cell) {
  const n = cell.normal || [0, 0];
  const nx = (n[0] || 0) * NORMAL_RELIEF;
  const ny = (n[1] || 0) * NORMAL_RELIEF;
  const len = Math.hypot(nx, ny, 1) || 1;
  return [nx / len, ny / len, 1 / len];
}

/**
 * What this light delivers to an unsculpted, viewer-facing surface.
 *
 * This is the exposure reference: a flat cell renders at exactly its authored
 * colour, and relief shades away from — or brightens above — that baseline. Using
 * the theoretical maximum instead would render every flat asset darker than it was
 * painted, since a flat cell never faces the key head-on.
 */
function _maxContribution(light) {
  switch (light.kind) {
    case LIGHT_KINDS.DIRECTIONAL:
      return light.intensity * _toLight3(light.direction)[2];
    case LIGHT_KINDS.RIM:
      return light.intensity * RIM_FALLOFF;
    case LIGHT_KINDS.POINT:
    case LIGHT_KINDS.AMBIENT:
    default:
      return light.intensity;
  }
}

/** Scalar illumination this light delivers to one cell at one sub-pixel. */
function _lightContribution(light, cell, worldX, worldY) {
  switch (light.kind) {
    case LIGHT_KINDS.POINT: {
      const dx = worldX - light.position[0];
      const dy = worldY - light.position[1];
      const d2 = dx * dx + dy * dy;
      return light.intensity * Math.exp(-d2 / (light.radius * light.radius));
    }
    case LIGHT_KINDS.DIRECTIONAL: {
      // Lambertian: dot(N, toLight) in three dimensions.
      //
      // `direction` is a **to-light** vector — it points at the source, which is
      // why the default key pairs `position` in the upper-left with a direction of
      // [-0.447, -0.537], also pointing up-left. It is the same convention SCDL's
      // `sphere ... light -1 -1` uses. This used to negate it, lighting only the
      // surfaces facing *away* from the key: on `shrine-bell` that meant 20% of
      // cells received any key light instead of 80%. Additive lighting hid it,
      // because a cell receiving zero light kept its full albedo and looked
      // deliberately unlit rather than wrong.
      const N = _surfaceNormal(cell);
      const L = _toLight3(light.direction);
      const dot = Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
      return light.intensity * dot;
    }
    case LIGHT_KINDS.RIM: {
      // Fresnel-like: stronger at grazing angles
      const N = _surfaceNormal(cell);
      const L = _toLight3(light.direction);
      const dot = N[0] * L[0] + N[1] * L[1] + N[2] * L[2];
      return light.intensity * Math.pow(1 - Math.abs(dot), 2) * RIM_FALLOFF;
    }
    case LIGHT_KINDS.AMBIENT:
      return light.intensity;
    default:
      // Unreachable: ILLUMINATING_LIGHT_KINDS gates the caller.
      return 0;
  }
}

// ─── Ordered dither ──────────────────────────────────────────────────────────
//
// A ramp is discrete, so a pixel landing between two anchors has to pick one.
// Rounding picks the nearer and produces hard banding; ordered dithering picks
// probabilistically by screen position, so a region 40% of the way between two
// anchors gets the brighter one in 40% of its pixels. That is how pixel art
// makes gradients inside a small palette, and it is deterministic -- position
// decides, not chance.

const BAYER_4X4 = Object.freeze([
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]);

/** Ordered threshold in [0,1) for an output pixel. */
function bayerThreshold(px, py) {
  return BAYER_4X4[((py % 4) + 4) % 4][((px % 4) + 4) % 4] / 16;
}

// ─── Palette quantization ────────────────────────────────────────────────────

/**
 * Luma-weighted squared RGB distance.
 *
 * A ramp is primarily a luminance sequence, so weighting by Rec.709 coefficients
 * keeps selection stable along the ramp's dominant axis. It stays a full RGB
 * distance rather than pure luminance matching, because some ramps carry
 * deliberate hue moves whose bright anchors are not their most luminant ones —
 * `rune_glow` ends on a saturated colour darker than its own frost step, and a
 * luminance-only match would send those pixels to the wrong end of the ramp.
 */
function rampDistanceSq(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return 0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db;
}

/**
 * Precompute per-material ramps as RGB triples, so the inner loop does no
 * string parsing. Materials whose ramp is empty are omitted, which is how
 * passthrough materials such as `source` keep their authored colour.
 */
function buildRampTable(quantization) {
  const table = new Map();
  for (const [material, colors] of Object.entries(quantization?.ramps || {})) {
    const rgb = [];
    for (const hex of colors) rgb.push(hexToRGB(hex));
    if (rgb.length === 0) continue;
    const lum = rgb.map(([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
    table.set(material, { rgb, lum, lo: Math.min(...lum), hi: Math.max(...lum) });
  }
  return table;
}

/**
 * Continuous ramp position for a pixel's luminance, over the absolute [0,1]
 * range. Callers resolve the fractional part — by rounding, or by dithering.
 */
function rampPosition(r, g, b, ramp) {
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return Math.max(0, Math.min(1, L)) * (ramp.rgb.length - 1);
}

/**
 * Ramp index for a pixel's luminance, mapped over the absolute [0,1] range.
 *
 * Deliberately NOT normalised against the ramp's own luminance span. Doing that
 * looks equivalent for a ramp covering most of the range (`sapphire` spans
 * 0.02-0.96) but collapses a narrow one: every pixel brighter than 0.15 would
 * land on `abyss`'s top anchor and the object would lose all form. Absolute
 * mapping means a value sketch distributes across whatever ramp it is given —
 * an abyss-material object renders dark but still legible.
 */
function rampIndexByLuminance(r, g, b, ramp, px, py, dither) {
  const pos = rampPosition(r, g, b, ramp);
  const last = ramp.rgb.length - 1;
  if (!dither) return Math.max(0, Math.min(last, Math.round(pos)));
  const base = Math.floor(pos);
  const frac = pos - base;
  const idx = frac > bayerThreshold(px, py) ? base + 1 : base;
  return Math.max(0, Math.min(last, idx));
}

/** Ramp index whose colour is nearest in luma-weighted RGB. Dither does not
 *  apply: nearest-anchor preserves hue, so there is no ordered axis to dither
 *  along. */
function rampIndexByDistance(r, g, b, ramp) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ramp.rgb.length; i++) {
    const d = rampDistanceSq(r, g, b, ramp.rgb[i][0], ramp.rgb[i][1], ramp.rgb[i][2]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function hexToRGB(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

// ─── Texture Engine (multi-octave vector harmonic interferometry) ────────────

function evaluateTexture(s, d, kappa, payload) {
  const { frequency, crossFrequency, amplitude, direction, octaves, lacunarity, persistence, curvatureModulation, envelopeSigma } = payload;
  if (!amplitude) return 0;

  const flowFreq = frequency * (1.0 + Math.abs(kappa || 0) * (curvatureModulation || 1.5));
  let sum = 0;
  let amp = 1.0;
  let freq = flowFreq;
  let cf = crossFrequency;

  for (let o = 0; o < (octaves || 3); o++) {
    const wave = Math.sin(s * freq * Math.PI * 2 + d * cf * Math.PI * 2 + direction + o * 1.7);
    sum += wave * amp;
    amp *= (persistence || 0.45);
    freq *= (lacunarity || 2.13);
    cf *= 1.87;
  }

  const envelope = Math.exp(-(d * d) / (2 * (envelopeSigma || 2.2)));
  return amplitude * (sum / (1 + (persistence || 0.45))) * envelope;
}

// ─── Blend mode application ──────────────────────────────────────────────────

function applyBlend(base, layer, mode, opacity) {
  let r, g, b;
  const [br, bg, bb] = base;
  const [lr, lg, lb] = layer;

  switch (mode) {
    case BLEND_MODES.MULTIPLY:
      r = br * lr / 255; g = bg * lg / 255; b = bb * lb / 255;
      break;
    case BLEND_MODES.SCREEN:
      r = 255 - (255 - br) * (255 - lr) / 255;
      g = 255 - (255 - bg) * (255 - lg) / 255;
      b = 255 - (255 - bb) * (255 - lb) / 255;
      break;
    case BLEND_MODES.OVERLAY:
      r = br < 128 ? 2 * br * lr / 255 : 255 - 2 * (255 - br) * (255 - lr) / 255;
      g = bg < 128 ? 2 * bg * lg / 255 : 255 - 2 * (255 - bg) * (255 - lg) / 255;
      b = bb < 128 ? 2 * bb * lb / 255 : 255 - 2 * (255 - bb) * (255 - lb) / 255;
      break;
    case BLEND_MODES.ADDITIVE:
      r = br + lr; g = bg + lg; b = bb + lb;
      break;
    case BLEND_MODES.SOFT_LIGHT:
      r = lr < 128 ? br - (255 - 2 * lr) * br * (255 - br) / (255 * 255) : br + (2 * lr - 255) * (Math.sqrt(br / 255) * 255 - br) / 255;
      g = lg < 128 ? bg - (255 - 2 * lg) * bg * (255 - bg) / (255 * 255) : bg + (2 * lg - 255) * (Math.sqrt(bg / 255) * 255 - bg) / 255;
      b = lb < 128 ? bb - (255 - 2 * lb) * bb * (255 - bb) / (255 * 255) : bb + (2 * lb - 255) * (Math.sqrt(bb / 255) * 255 - bb) / 255;
      break;
    default: // NORMAL
      r = lr; g = lg; b = lb;
  }

  // Apply opacity
  return [
    clamp255(br * (1 - opacity) + r * opacity),
    clamp255(bg * (1 - opacity) + g * opacity),
    clamp255(bb * (1 - opacity) + b * opacity),
  ];
}

// ─── Main Renderer ───────────────────────────────────────────────────────────

/**
 * Render a VRI scene to RGBA at the given scale.
 *
 * @param {object} scene - VRI scene from compileVRI()
 * @param {number} scale - Output scale (1 = native, 4 = 4×, 8 = 8×)
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
export function renderVRI(scene, scale = 4) {
  const W = scene.width * scale;
  const H = scene.height * scale;
  const buf = new Uint8Array(W * H * 4); // RGBA, starts transparent black

  // Build spatial index of geometry cells for texture/mark/light lookups
  const cellMap = new Map();
  const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
  if (geoLayer) {
    for (const c of geoLayer.payload.coordinates) {
      cellMap.set(`${c.x},${c.y}`, c);
    }
  }

  // ── Pass 1: Geometry (base color + SDF coverage AA) ─────────────────────
  if (geoLayer) {
    for (const cell of geoLayer.payload.coordinates) {
      const cx = cell.snappedX ?? cell.x;
      const cy = cell.snappedY ?? cell.y;
      if (cx < 0 || cx >= scene.width || cy < 0 || cy >= scene.height) continue;

      const [br, bg, bb] = hexToRGB(cell.color);
      const sd = cell.signedDistance;
      const normal = cell.normal;
      const hw = cell.strokeHalfWidth;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = cx * scale + sx;
          const py = cy * scale + sy;
          const idx = (py * W + px) * 4;

          let coverage = 1.0;
          if (sd !== undefined && sd !== null) {
            const u = (sx + 0.5) / scale;
            const v = (sy + 0.5) / scale;
            const localSD = sd + (
              (u - 0.5) * (normal ? normal[0] : 0) +
              (v - 0.5) * (normal ? normal[1] : 0)
            );
            const edge = 0.5 / scale;
            if (hw != null) {
              coverage = smoothstep(edge, -edge, Math.abs(localSD) - hw);
            } else {
              coverage = smoothstep(-edge, edge, -localSD);
            }
          }

          if (coverage > 0.01) {
            buf[idx] = br;
            buf[idx + 1] = bg;
            buf[idx + 2] = bb;
            buf[idx + 3] = clamp255(255 * coverage);
          }
        }
      }
    }
  }

  // ── Pass 2: Texture fields ──────────────────────────────────────────────
  for (const layer of scene.layers) {
    if (layer.type !== LAYER_TYPES.TEXTURE_FIELD) continue;
    const p = layer.payload;
    const matFilter = p.materialFilter ? new Set(p.materialFilter) : null;
    // Fix #4: respect coordinateSpace
    const coordSpace = p.coordinateSpace || 'object';

    for (const cell of (geoLayer?.payload.coordinates || [])) {
      if (matFilter && !matFilter.has(cell.material)) continue;
      const cx = cell.snappedX ?? cell.x;
      const cy = cell.snappedY ?? cell.y;
      if (cx < 0 || cx >= scene.width || cy < 0 || cy >= scene.height) continue;

      const tangent = cell.tangent;
      const arcLen = cell.arcLength || 1;
      const kappa = cell.curvature || 0;
      const sd = cell.signedDistance || 0;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = cx * scale + sx;
          const py = cy * scale + sy;
          const idx = (py * W + px) * 4;
          if (buf[idx + 3] === 0) continue; // skip transparent

          const u = (sx + 0.5) / scale;
          const v = (sy + 0.5) / scale;

          let s, d;

          switch (coordSpace) {
            case 'object':
              // Texture follows the part's local surface frame.
              // Bark grain runs along the tangent; metal striations follow the arc.
              if (tangent) {
                const tx = tangent[0], ty = tangent[1];
                const nx = cell.normal ? cell.normal[0] : -ty;
                const ny = cell.normal ? cell.normal[1] : tx;
                s = (cell.t || 0) * arcLen + (u - 0.5) * tx + (v - 0.5) * ty;
                d = sd + (u - 0.5) * nx + (v - 0.5) * ny;
              } else {
                s = cx + u;
                d = cy + v;
              }
              break;

            case 'world':
              // Texture is fixed in canvas space (dirt, clouds, fog).
              // Does NOT follow object transforms — two trees share the same field.
              s = cx + u;
              d = cy + v;
              break;

            case 'surface':
              // Texture aligns to the flow direction of the surface (water).
              // Uses tangent for flow direction but canvas-space for position.
              if (tangent) {
                const tx = tangent[0], ty = tangent[1];
                s = (cx + u) * tx + (cy + v) * ty;
                d = (cx + u) * -ty + (cy + v) * tx;
              } else {
                s = cx + u;
                d = cy + v;
              }
              break;

            case 'screen':
              // Texture is fixed in output-pixel space (grading overlays).
              s = px / scale;
              d = py / scale;
              break;

            default:
              s = cx + u;
              d = cy + v;
          }

          const grain = evaluateTexture(s, d, kappa, p);
          if (Math.abs(grain) < 0.01) continue;

          // Bound the luminance excursion when a bound is declared. Unbounded
          // grain silently reassigns ramp bands once quantization is active.
          let mod = grain * 35;
          if (p.maxLuminanceDelta != null) {
            const cap = p.maxLuminanceDelta * 255;
            mod = Math.max(-cap, Math.min(cap, mod));
          }
          const base = [buf[idx], buf[idx + 1], buf[idx + 2]];
          const texColor = [
            clamp255(base[0] + mod),
            clamp255(base[1] + mod * 0.85),
            clamp255(base[2] + mod * 0.7),
          ];
          const blended = applyBlend(base, texColor, layer.blendMode, layer.opacity);
          buf[idx] = blended[0];
          buf[idx + 1] = blended[1];
          buf[idx + 2] = blended[2];
        }
      }
    }
  }

  // ── Pass 3: Marks ───────────────────────────────────────────────────────
  for (const layer of scene.layers) {
    if (layer.type !== LAYER_TYPES.MARK) continue;
    const p = layer.payload;
    const [mr, mg, mb] = hexToRGB(p.color);

    for (const mark of p.marks) {
      const mx = Math.round(mark.x);
      const my = Math.round(mark.y);
      if (mx < 0 || mx >= scene.width || my < 0 || my >= scene.height) continue;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = mx * scale + sx;
          const py = my * scale + sy;
          const idx = (py * W + px) * 4;

          const pressure = mark.pressure ?? p.pressure;
          const alpha = pressure * layer.opacity;
          if (alpha < 0.01) continue;

          const base = [buf[idx], buf[idx + 1], buf[idx + 2]];
          const blended = applyBlend(base, [mr, mg, mb], layer.blendMode, alpha);
          buf[idx] = blended[0];
          buf[idx + 1] = blended[1];
          buf[idx + 2] = blended[2];
          buf[idx + 3] = Math.max(buf[idx + 3], clamp255(255 * alpha));
        }
      }
    }
  }

  // ── Pass 4: Lighting ────────────────────────────────────────────────────
  //
  // Light MODULATES the surface colour; it does not add to it.
  //
  // This pass used to do `buf += lightColour * contribution`, clamped at 255.
  // With the default key light (white, intensity 0.7) that adds up to +178 per
  // channel, so a mid-grey surface reached 306 and clipped to pure white. The
  // measured result across the shrine-demo library: 51% of `sword`'s pixels
  // rendered brighter than its own brightest authored colour, and 17-29% of the
  // night backgrounds were blown to near-white. Worse, the three channels clip at
  // different times, so clipping is what actually destroyed hue: an iron part
  // authored at #241708 rendered a warm mid-grey, and `material iron` became
  // invisible in the output unless quantization was switched on to snap it back.
  //
  // The model here: the authored colour is what a **fully lit** surface looks
  // like. Illumination is accumulated per channel, normalised against the scene's
  // maximum achievable illumination, and multiplied into the albedo. Light can
  // therefore take value away to express form, but can never invent value the
  // author did not paint, and a per-channel multiply by a near-neutral factor
  // leaves hue ratios intact.
  const lights = scene.lights.filter(l => ILLUMINATING_LIGHT_KINDS.has(l.kind));
  if (lights.length > 0) {
    // Reference exposure: what an unsculpted, viewer-facing surface receives.
    //
    // Scalar, not per-channel — a per-channel reference would divide a coloured
    // light straight back out and render every scene as if lit by white. The
    // scalar is each light's strongest channel rather than its luminance: under a
    // luminance reference a pure red light (luminance 0.21) would scale the red
    // channel by 4.7x and blow it out, whereas the strongest channel makes a
    // coloured light behave like a filter that holds its own channel steady.
    let reference = 0;
    for (const light of lights) {
      const [r, g, b] = hexToRGB(light.color);
      reference += _maxContribution(light) * (Math.max(r, g, b) / 255);
    }
    if (reference < 1e-6) reference = 1;

    const affectsByLight = new Map(
      lights.map(l => [l, l.affects?.length ? new Set(l.affects) : null]),
    );

    // One entry per lit cell. Overlapping parts previously put two coordinates on
    // the same pixel and got lit twice; painter order says the later one wins.
    const litCells = new Map();
    for (const cell of (geoLayer?.payload.coordinates || [])) {
      const cx = cell.snappedX ?? cell.x;
      const cy = cell.snappedY ?? cell.y;
      if (cx < 0 || cx >= scene.width || cy < 0 || cy >= scene.height) continue;
      litCells.set(`${cx},${cy}`, cell);
    }

    for (const cell of litCells.values()) {
      const cx = cell.snappedX ?? cell.x;
      const cy = cell.snappedY ?? cell.y;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = cx * scale + sx;
          const py = cy * scale + sy;
          const idx = (py * W + px) * 4;
          if (buf[idx + 3] === 0) continue;

          const worldX = cx + (sx + 0.5) / scale;
          const worldY = cy + (sy + 0.5) / scale;

          let ir = 0, ig = 0, ib = 0;
          let governed = 0;
          for (const light of lights) {
            // A non-empty affects list is an allow-list. A cell with no material
            // is not on it.
            const allow = affectsByLight.get(light);
            if (allow && !allow.has(cell.material)) continue;
            governed += 1;

            const contribution = _lightContribution(light, cell, worldX, worldY);
            if (contribution < 0.001) continue;

            const [lr, lg, lb] = hexToRGB(light.color);
            ir += (lr / 255) * contribution;
            ig += (lg / 255) * contribution;
            ib += (lb / 255) * contribution;
          }

          // A cell no light is allowed to touch keeps its authored colour. This
          // distinction only matters once lighting multiplies: "excluded from every
          // light" has to mean untouched, while "lit, but facing away" still goes
          // dark. Collapsing the two would paint every targeted light's non-targets
          // solid black.
          if (governed === 0) continue;

          buf[idx] = clamp255(buf[idx] * (ir / reference));
          buf[idx + 1] = clamp255(buf[idx + 1] * (ig / reference));
          buf[idx + 2] = clamp255(buf[idx + 2] * (ib / reference));
        }
      }
    }
  }

  // ── Pass 5: Atmosphere ──────────────────────────────────────────────────
  const atmo = scene.atmosphere;
  if (atmo?.fog) {
    const [fr, fg, fb] = hexToRGB(atmo.fog.color || '#1A1A2E');
    const density = atmo.fog.density ?? 0.3;
    const near = atmo.fog.near ?? 0;
    const far = atmo.fog.far ?? scene.height;

    for (let py = 0; py < H; py++) {
      const worldY = py / scale;
      const fogFactor = smoothstep(near, far, worldY) * density;
      if (fogFactor < 0.01) continue;

      for (let px = 0; px < W; px++) {
        const idx = (py * W + px) * 4;
        if (buf[idx + 3] === 0) continue;
        buf[idx] = clamp255(buf[idx] * (1 - fogFactor) + fr * fogFactor);
        buf[idx + 1] = clamp255(buf[idx + 1] * (1 - fogFactor) + fg * fogFactor);
        buf[idx + 2] = clamp255(buf[idx + 2] * (1 - fogFactor) + fb * fogFactor);
      }
    }
  }

  if (atmo?.grading) {
    const g = atmo.grading;
    const contrast = g.contrast ?? 1.0;
    const saturation = g.saturation ?? 1.0;

    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] === 0) continue;
      let r = buf[i], gr = buf[i + 1], b = buf[i + 2];

      // Contrast
      r = clamp255((r - 128) * contrast + 128);
      gr = clamp255((gr - 128) * contrast + 128);
      b = clamp255((b - 128) * contrast + 128);

      // Saturation
      const lum = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      r = clamp255(lum + (r - lum) * saturation);
      gr = clamp255(lum + (gr - lum) * saturation);
      b = clamp255(lum + (b - lum) * saturation);

      buf[i] = r; buf[i + 1] = gr; buf[i + 2] = b;
    }
  }

  // ── Pass 6: Palette quantization ────────────────────────────────────────
  // Snap procedural colour back onto each material's authored ramp. This runs
  // after every generative pass — geometry, texture, marks, lighting, fog and
  // grading all compute in continuous RGB, so quantizing earlier would simply
  // be undone by whatever ran next.
  //
  // It runs *before* raster patches on purpose: patches are curated pixels,
  // and a machine pass must not re-colour a colour a human chose. The scene
  // carries its own ramps, so this stays a pure function of the scene.
  const quantization = scene.quantization;
  const quantMode = quantization?.mode;
  if (quantMode === QUANTIZATION_MODES.LUMINANCE_BAND || quantMode === QUANTIZATION_MODES.NEAREST_ANCHOR) {
    const useLuminance = quantMode === QUANTIZATION_MODES.LUMINANCE_BAND;
    const dither = useLuminance && quantization.dither !== false;
    const rampTable = buildRampTable(quantization);

    if (rampTable.size > 0) {
      for (const cell of (geoLayer?.payload.coordinates || [])) {
        const ramp = rampTable.get(cell.material);
        if (!ramp) continue; // unknown or passthrough material — leave authored

        const cx = cell.snappedX ?? cell.x;
        const cy = cell.snappedY ?? cell.y;
        if (cx < 0 || cx >= scene.width || cy < 0 || cy >= scene.height) continue;

        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const idx = ((cy * scale + sy) * W + (cx * scale + sx)) * 4;
            if (buf[idx + 3] === 0) continue;

            const i = useLuminance
              // Dither in LOGICAL cell space, not output pixel space. Using
              // output coordinates would put 256 dither samples inside one
              // logical cell at 8x and one at 1x, so the pattern would change
              // with output size -- destroying the scale-invariance that
              // quantization exists to provide.
              ? rampIndexByLuminance(buf[idx], buf[idx + 1], buf[idx + 2], ramp,
                cx, cy, dither)
              : rampIndexByDistance(buf[idx], buf[idx + 1], buf[idx + 2], ramp);
            buf[idx] = ramp.rgb[i][0];
            buf[idx + 1] = ramp.rgb[i][1];
            buf[idx + 2] = ramp.rgb[i][2];
          }
        }
      }
    }
  }

  // ── Pass 7: Raster patches (authored pixels, last word) ─────────────────
  // Gene coordinates are in logical space (0..scene.width-1, 0..scene.height-1).
  // Scale them to fill the full cell block in the output framebuffer.
  for (const layer of scene.layers) {
    if (layer.type !== LAYER_TYPES.RASTER_PATCH) continue;
    const p = layer.payload;

    for (const pixel of p.pixels) {
      // Snap to the logical cell grid before scaling. An unrounded coordinate
      // produces a fractional buffer index, and a fractional index on a
      // Uint8Array writes nowhere — patches at e.g. x=3.1 vanished silently,
      // while x=3.5 painted a partial, scale-dependent block. The mark pass
      // has always rounded; this makes the raster pass agree with it.
      const lx = Math.round(pixel.x);
      const ly = Math.round(pixel.y);
      if (lx < 0 || lx >= scene.width || ly < 0 || ly >= scene.height) continue;
      const [pr, pg, pb] = hexToRGB(pixel.color);
      const alpha = (pixel.alpha ?? 1.0) * layer.opacity;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = lx * scale + sx;
          const py = ly * scale + sy;
          const idx = (py * W + px) * 4;

          if (alpha >= 1.0) {
            buf[idx] = pr; buf[idx + 1] = pg; buf[idx + 2] = pb; buf[idx + 3] = 255;
          } else {
            buf[idx] = clamp255(buf[idx] * (1 - alpha) + pr * alpha);
            buf[idx + 1] = clamp255(buf[idx + 1] * (1 - alpha) + pg * alpha);
            buf[idx + 2] = clamp255(buf[idx + 2] * (1 - alpha) + pb * alpha);
            buf[idx + 3] = Math.max(buf[idx + 3], clamp255(255 * alpha));
          }
        }
      }
    }
  }

  return { width: W, height: H, data: buf };
}
