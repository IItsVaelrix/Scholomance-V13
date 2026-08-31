/**
 * pixel-art-shaders.js — form-aware shading for pixel-art parts.
 *
 * The shader has to match the FORM it is shading:
 *
 *   - a limb is a TUBE. Shade it across its cross-section, never down its
 *     length. The classic pixel-art column pattern, lit from the left, is
 *     `outline | highlight | body | shadow | outline`. Banding a tube by y
 *     (which is what character-foundry.js's whole-body pass does, correctly,
 *     for a whole-body silhouette) puts vertical racing stripes on a limb.
 *   - a head is a MASS. Shade it radially against the light vector.
 *
 * A flat fill with a 1px edge line is neither, and reads as matte / finger-
 * painted: it has no value structure to describe volume.
 *
 * These shaders take a 5-tier ramp so the caller controls hue. Pulling colours
 * straight from a material-registry ramp instead will recolour the subject to
 * that material's hue (void_cloth is navy, not purple) — take the VALUE
 * STRUCTURE from the shader and the HUES from the subject's own palette.
 */

/** @typedef {{void:string, deep:string, body:string, frost:string, hi:string}} Ramp */

/** Group cells into rows, each sorted left-to-right. */
function byRow(cells) {
  const rows = new Map();
  for (const c of cells) {
    if (!rows.has(c.y)) rows.set(c.y, []);
    rows.get(c.y).push(c);
  }
  for (const r of rows.values()) r.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Cylinder shading across each row's width, light from the left.
 *
 * Rows narrower than 4px are all rim and would shade to mud, so they drop the
 * outlines and keep a readable highlight/body/shadow instead.
 *
 * @param {Array<{x:number,y:number}>} cells part occupancy
 * @param {Ramp} ramp
 * @param {{specular?: boolean}} [options] specular adds a short hot run in the
 *   upper third so the highlight starts and stops instead of striping the
 *   full length of the limb.
 * @returns {Array<{x:number,y:number,color:string}>}
 */
export function shadeCylinder(cells, ramp, { specular = true } = {}) {
  const rows = byRow(cells);
  const ys = [...rows.keys()].sort((a, b) => a - b);
  if (!ys.length) return [];
  const yTop = ys[0];
  const yBot = ys[ys.length - 1];
  const out = [];

  for (const y of ys) {
    const row = rows.get(y);
    const w = row.length;
    row.forEach((c, i) => {
      let tier;
      if (w <= 3) {
        tier = i === 0 ? 'frost' : i === w - 1 ? 'deep' : 'body';
      } else if (i === 0 || i === w - 1) {
        tier = 'void';
      } else {
        const u = (i - 1) / Math.max(1, w - 3);
        tier = u < 0.28 ? 'frost' : u < 0.68 ? 'body' : 'deep';
      }
      const t = (y - yTop) / Math.max(1, yBot - yTop);
      if (specular && tier === 'frost' && t > 0.12 && t < 0.42) tier = 'hi';
      out.push({ x: c.x, y: c.y, color: ramp[tier] });
    });
  }
  return out;
}

/**
 * Radial shading for a head or other rounded mass, light from the upper-left.
 * The rim is selective (selout): on the lit side it lifts to `deep` rather
 * than staying pure outline, so the silhouette isn't uniformly black.
 *
 * @param {Array<{x:number,y:number}>} cells
 * @param {Ramp} ramp
 * @param {{lightX?:number, lightY?:number}} [options]
 */
export function shadeMass(cells, ramp, { lightX = -0.7, lightY = -0.7 } = {}) {
  if (!cells.length) return [];
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(1, (maxX - minX) / 2);
  const ry = Math.max(1, (maxY - minY) / 2);

  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  const isRim = (c) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !set.has(`${c.x + dx},${c.y + dy}`));

  return cells.map((c) => {
    const nx = (c.x - cx) / rx;
    const ny = (c.y - cy) / ry;
    const dot = nx * lightX + ny * lightY;
    if (isRim(c)) return { x: c.x, y: c.y, color: dot > 0.45 ? ramp.deep : ramp.void };
    const tier = dot > 0.62 ? 'hi' : dot > 0.25 ? 'frost' : dot > -0.35 ? 'body' : 'deep';
    return { x: c.x, y: c.y, color: ramp[tier] };
  });
}
