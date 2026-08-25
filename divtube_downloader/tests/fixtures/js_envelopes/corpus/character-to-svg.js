/**
 * CHARACTER-TO-SVG
 * Converts applyCharacterFills() output into a styled SVG string.
 *
 * Input fills shape:
 *   { coordinates: [{ x, y, color, partId, isRim }], palette, partColors, diagnostics }
 *
 * Layers (bottom to top):
 *   1. pb-fills    — one <path> per partId, base fill color
 *   2. pb-shading  — one <path> per partId for the 1-cell inner shadow fringe
 *   3. pb-outlines — single <path> for all outline cells
 */

import { traceBoundary } from './cell-boundary-tracer.js';
import { buildPath, buildPathElement, buildSVGElement } from './svg-path-builder.js';
import { getPartProfileMeta } from './part-profile-library.js';

/**
 * Convert hex color to RGB, then to HSL, darken the lightness, and back to hex.
 * @param {string} hex   — e.g. "#aabbcc"
 * @param {number} amount — lightness reduction (0.0-1.0)
 * @returns {string} darkened hex color
 */
function darkenHex(hex, amount) {
  // Parse hex to RGB [0, 1]
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  let l = (max + min) / 2;

  // RGB to HSL
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // Darken lightness
  l = Math.max(0, l - amount);

  // HSL back to RGB
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  let nr, ng, nb;
  if (s === 0) {
    nr = ng = nb = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    nr = hue2rgb(p, q, h + 1 / 3);
    ng = hue2rgb(p, q, h);
    nb = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

/**
 * Convert a coordinate array to a Set of "x,y" keys for fast adjacency checks.
 */
function cellsToKeySet(cells) {
  const s = new Set();
  for (const c of cells) {
    s.add(`${c.x},${c.y}`);
  }
  return s;
}

/**
 * Get the fill color for a part — prefer non-outline cells, fall back to any cell.
 */
function getFillColor(cells) {
  const nonRim = cells.find((c) => !c.isRim);
  return (nonRim ?? cells[0])?.color ?? '#888888';
}

function buildContourPathElements(trace, pathOptions) {
  const contours = trace?.contours?.length ? trace.contours : [trace];
  return contours
    .map((contour) => buildPath(contour, { smooth: pathOptions.smooth, scale: 1 }))
    .filter(Boolean)
    .map((d) => buildPathElement({ ...pathOptions, d }));
}

function buildShaderDefs(enabled, scale = 1) {
  if (!enabled) return '';
  // Filter primitive values are in user-coordinate space (cell units after viewBox fix).
  // Divide pixel-magnitude values by scale so visual output is equivalent at any render size.
  // Turbulence baseFrequency scales inversely — multiply by scale for equivalent texture density.
  const s = scale;
  return [
    `<filter id="pb-shader-ink-shadow" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">`,
    `<feDropShadow dx="${(0.9/s).toFixed(4)}" dy="${(1.2/s).toFixed(4)}" stdDeviation="${(0.65/s).toFixed(4)}" flood-color="#05060a" flood-opacity="0.72"/>`,
    `</filter>`,
    `<filter id="pb-shader-ice-glow" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">`,
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${(1.35/s).toFixed(4)}" result="blur"/>`,
    `<feFlood flood-color="#42d9ff" flood-opacity="0.72" result="glowColor"/>`,
    `<feComposite in="glowColor" in2="blur" operator="in" result="glow"/>`,
    `<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>`,
    `</filter>`,
    `<filter id="pb-shader-crystal-rim" x="-45%" y="-45%" width="190%" height="190%" color-interpolation-filters="sRGB">`,
    `<feTurbulence type="fractalNoise" baseFrequency="${(0.9*s).toFixed(4)}" numOctaves="2" seed="14" result="noise"/>`,
    `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.82 0 0 0 0 0.96 0 0 0 0 1 0 0 0 0.38 0" result="spark"/>`,
    `<feBlend in="SourceGraphic" in2="spark" mode="screen"/>`,
    `</filter>`,
    `<filter id="pb-shader-melt-field" x="-50%" y="-20%" width="200%" height="160%" color-interpolation-filters="sRGB">`,
    `<feTurbulence type="fractalNoise" baseFrequency="${(0.045*s).toFixed(4)} ${(0.18*s).toFixed(4)}" numOctaves="2" seed="26" result="meltNoise"/>`,
    `<feDisplacementMap in="SourceGraphic" in2="meltNoise" scale="${(1.65/s).toFixed(4)}" xChannelSelector="R" yChannelSelector="G"/>`,
    `</filter>`,
  ].join('');
}

const SHADER_FILTERS = {
  'ice-glow':    'url(#pb-shader-ice-glow)',
  'crystal-rim': 'url(#pb-shader-crystal-rim)',
};

// Fallback shader map keyed by part slot name (e.g. 'halo', 'eyeGlow').
// This is the active resolver because cells carry partId = slot name, not full profile key.
// getPartProfileMeta() below is forward-looking: it fires when a spec uses the full profile
// key as part.id (e.g. { id: 'character.accessory.halo.ice' }). Until a profileOf map
// bridges slot name → profile key, keep this table in sync with metadata registrations
// in character-accessory-profiles.js and character-detail-profiles.js.
const PART_SHADER_FALLBACK = {
  eyeGlow: 'ice-glow', halo: 'ice-glow', wings: 'ice-glow', hairShine: 'ice-glow', cheekSigil: 'ice-glow',
  antenna: 'ice-glow', constellation: 'ice-glow',
  crown: 'crystal-rim', pendant: 'crystal-rim', robeTrim: 'crystal-rim', mantle: 'crystal-rim',
  visor: 'crystal-rim',
};

function shaderForPart(partId, enabled) {
  if (!enabled) return null;
  const meta = getPartProfileMeta(partId);
  const shaderKey = meta?.shader ?? PART_SHADER_FALLBACK[partId];
  return SHADER_FILTERS[shaderKey] ?? null;
}

/**
 * Convert character fills to an SVG string.
 *
 * @param {object} fills      — output of applyCharacterFills()
 * @param {object} spec       — CHARACTER-SPEC-v1
 * @param {object} [options]
 * @param {number} [options.scale=8]          — pixels per cell in output SVG
 * @param {boolean} [options.twoTone=true]    — render shadow fringe
 * @param {number} [options.strokeWidth=1.5]  — outline stroke width
 * @param {boolean} [options.smooth=true]     — Catmull-Rom smoothing
 * @param {boolean} [options.shaderEffects=true] — emit SVG filter shaders
 * @returns {string}  Complete SVG markup
 */
export function characterToSVG(fills, spec, options = {}) {
  const { scale = 8, twoTone = true, strokeWidth = 1.5, smooth = true, shaderEffects = true } = options;

  // Canvas dimensions in cell units; pixel output size = cell dims × scale
  const canvasW  = spec?.canvas?.width  ?? 32;
  const canvasH  = spec?.canvas?.height ?? 48;
  const svgWidth  = canvasW * scale;
  const svgHeight = canvasH * scale;

  // School class (e.g., "school-void", "school-sonic")
  const school = spec?.combatProfile?.school?.toLowerCase() ?? 'unknown';

  // Group coordinates by partId and collect all outline cells
  const partAllCells = new Map();  // partId → all cells (incl. rim)
  const partRimCells = new Map();  // partId → rim cells only
  const allRimCells = [];

  for (const cell of fills.coordinates || []) {
    if (!partAllCells.has(cell.partId)) {
      partAllCells.set(cell.partId, []);
      partRimCells.set(cell.partId, []);
    }
    partAllCells.get(cell.partId).push(cell);
    if (cell.isRim) {
      partRimCells.get(cell.partId).push(cell);
      allRimCells.push(cell);
    }
  }

  // ── Layer 1: fill paths ──────────────────────────────────────────────
  const fillPaths = [];
  for (const [partId, cells] of partAllCells) {
    if (cells.length === 0) continue;
    const fillColor = getFillColor(cells);
    const keySet = cellsToKeySet(cells);
    const trace = traceBoundary(keySet, { smooth });
    fillPaths.push(...buildContourPathElements(trace, {
      smooth,
      scale,
      fill: fillColor,
      className: `pb-part-${partId}`,
      filter: shaderForPart(partId, shaderEffects),
    }));
  }

  // ── Layer 2: shadow fringe ────────────────────────────────────────────────
  // Adjacency-based: cells touching the rim ring (inside the shape) get a
  // darkened overlay. Simpler than the slot-based approach (slotRanges from
  // region-fill-amp) in the original design spec — no AMP pipeline dependency.
  const shadowPaths = [];
  if (twoTone) {
    for (const [partId, cells] of partAllCells) {
      const rimCells = partRimCells.get(partId) || [];
      if (rimCells.length === 0) continue;

      const allKeySet = cellsToKeySet(cells);
      const rimKeySet = cellsToKeySet(rimCells);
      const fillColor = getFillColor(cells);

      // Collect cells that are NOT outline but ARE adjacent to an outline cell
      const shadowKeys = new Set();
      for (const key of rimKeySet) {
        const [x, y] = key.split(',').map(Number);
        // Check 4-adjacency (up, down, left, right)
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nk = `${x + dx},${y + dy}`;
          if (allKeySet.has(nk) && !rimKeySet.has(nk)) {
            shadowKeys.add(nk);
          }
        }
      }

      if (shadowKeys.size === 0) continue;

      const shadowColor = darkenHex(fillColor, 0.28);
      const trace = traceBoundary(shadowKeys, { smooth });
      shadowPaths.push(...buildContourPathElements(trace, {
        smooth,
        scale,
        fill: shadowColor,
        className: `pb-part-${partId}-shadow`,
        filter: shaderEffects ? 'url(#pb-shader-melt-field)' : null,
      }));
    }
  }

  // ── Layer 3: ink outline (all outline cells as one path) ──────────────
  let outlineLayerPaths = [];
  if (allRimCells.length > 0) {
    const rimColor = allRimCells[0]?.color ?? '#1a1a20';
    const rimKeySet = cellsToKeySet(allRimCells);
    const trace = traceBoundary(rimKeySet, { smooth });
    outlineLayerPaths = buildContourPathElements(trace, {
        smooth,
        scale,
        fill: 'none',
        stroke: rimColor,
        strokeWidth: strokeWidth / scale,
        className: 'pb-outline',
        filter: shaderEffects ? 'url(#pb-shader-ink-shadow)' : null,
    });
  }

  // ── Assemble ─────────────────────────────────────────────────────────
  const fillLayer = buildSVGElement('g', { class: 'pb-fills' }, fillPaths.join(''));

  const shadowLayer =
    twoTone && shadowPaths.length > 0
      ? buildSVGElement(
          'g',
          { class: 'pb-shading', opacity: '0.45' },
          shadowPaths.join('')
        )
      : '';

  const outlineLayer = buildSVGElement('g', { class: 'pb-outlines' }, outlineLayerPaths.join(''));

  return buildSVGElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${canvasW} ${canvasH}`,
      width: svgWidth,
      height: svgHeight,
      class: `pb-character school-${school}`,
    },
    buildShaderDefs(shaderEffects, scale) + fillLayer + shadowLayer + outlineLayer
  );
}
