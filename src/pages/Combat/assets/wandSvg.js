/**
 * wandSvg.js — WAND → SVG asset emitter (Combat surface)
 *
 * Drives the in-house Wand/PixelBrain formula engine to author combat art.
 * A "formula" is evaluated to a deterministic coordinate point-cloud; we trace
 * those coordinates into SVG paths, then apply painterly treatment: linear /
 * radial gradient fills, soft blur shadows, neon glow, and bilateral mirroring.
 * The result is a base64 data-URI texture loaded by the isometric Phaser scene.
 *
 * LAW: this is a UI-layer *consumer*. It calls the sanctioned engine adapter
 * (src/lib/engine.adapter.js) — it never reimplements the pixelbrain core.
 */

import { evaluateFormula } from '../../../lib/engine.adapter.js';

/** Trace a coordinate cloud into an SVG path `d` string. */
export function coordsToPath(coords, { close = false } = {}) {
  if (!coords || coords.length === 0) return '';
  const pts = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${round(c.x)} ${round(c.y)}`);
  return pts.join(' ') + (close ? ' Z' : '');
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function esc(str) {
  return String(str).replace(/[<>&"']/g, (ch) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function mirrorCoords(coords, cx) {
  return coords.map((c) => ({ ...c, x: 2 * cx - c.x }));
}

function gradientDef(id, g) {
  const stops = (g.stops || []).map((s) => {
    const [offset, color, opacity = 1] = Array.isArray(s) ? s : [s.offset, s.color, s.opacity];
    return `<stop offset="${round(offset)}" stop-color="${esc(color)}" stop-opacity="${round(opacity)}"/>`;
  }).join('');
  if (g.type === 'radial') {
    const { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = g;
    const focal = fx !== undefined ? ` fx="${round(fx)}" fy="${round(fy ?? cy)}"` : '';
    return `<radialGradient id="${id}" cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}"${focal}>${stops}</radialGradient>`;
  }
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = g;
  return `<linearGradient id="${id}" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}">${stops}</linearGradient>`;
}

/**
 * Render one or more Wand formula layers into a standalone SVG string.
 *
 * @typedef {object} LayerSpec
 * @property {object} formula            Wand formula ({ coordinateFormula, ... }).
 * @property {string} [stroke]           Stroke color.
 * @property {number} [strokeWidth=2]
 * @property {string} [fill='none']      Solid fill color (ignored if gradient set).
 * @property {object} [gradient]         { type:'linear'|'radial', stops:[[off,color,op]], ... } → fill.
 * @property {number} [opacity=1]
 * @property {boolean} [close=false]
 * @property {boolean} [mirror=false]    Append a vertically-mirrored copy.
 * @property {number} [glow=0]           Additive neon glow blur radius.
 * @property {number} [blur=0]           Soft blur (for shadows / volume), non-additive.
 * @property {string} [linecap='round']
 */
export function renderWandSvg({ width, height, background, layers = [] }) {
  const cx = width / 2;
  const defs = [];
  const bodies = [];

  layers.forEach((layer, i) => {
    const {
      formula, stroke, strokeWidth = 2, fill = 'none', gradient,
      opacity = 1, close = false, mirror = false, glow = 0, blur = 0,
      linecap = 'round',
    } = layer;

    const coords = evaluateFormula(formula, { width, height });
    if (!coords || coords.length === 0) return;

    let d = coordsToPath(coords, { close });
    if (mirror) d += ' ' + coordsToPath(mirrorCoords(coords, cx), { close });

    let fillVal = fill;
    if (gradient) {
      const gid = `grad${i}`;
      defs.push(gradientDef(gid, gradient));
      fillVal = `url(#${gid})`;
    }

    let filterAttr = '';
    if (glow > 0) {
      const fid = `glow${i}`;
      defs.push(
        `<filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%">` +
        `<feGaussianBlur stdDeviation="${round(glow)}" result="b"/>` +
        `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      );
      filterAttr = ` filter="url(#${fid})"`;
    } else if (blur > 0) {
      const fid = `blur${i}`;
      defs.push(`<filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${round(blur)}"/></filter>`);
      filterAttr = ` filter="url(#${fid})"`;
    }

    const strokeAttr = stroke
      ? ` stroke="${esc(stroke)}" stroke-width="${round(strokeWidth)}" stroke-linecap="${esc(linecap)}" stroke-linejoin="round"`
      : '';
    bodies.push(`<path d="${d}" fill="${esc(fillVal)}"${strokeAttr} opacity="${round(opacity)}"${filterAttr}/>`);
  });

  const bg = background ? `<rect width="${width}" height="${height}" fill="${esc(background)}"/>` : '';
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${defsBlock}${bg}${bodies.join('')}</svg>`
  );
}

/**
 * Encode an SVG string as a base64 data URI. Phaser's SVG loader decodes data
 * URIs with atob(), so it requires base64 (not percent-encoded) payloads.
 */
export function svgToDataUri(svg) {
  let b64;
  if (typeof btoa === 'function') {
    b64 = btoa(unescape(encodeURIComponent(svg)));
  } else {
    b64 = globalThis.Buffer.from(svg, 'utf8').toString('base64');
  }
  return 'data:image/svg+xml;base64,' + b64;
}

export function renderWandSvgUri(spec) {
  return svgToDataUri(renderWandSvg(spec));
}
