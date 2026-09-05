/**
 * SDF-EVALUATOR.js
 * Pure deterministic Signed Distance Field evaluator for PB-SDF-v1 (PDR 2026-06-12).
 * Evaluates at float points, returns signed distance (negative inside).
 * Used by SDFShapeAMP to quantize to integer lattice cells only.
 * Never stores floats in canonical coordinates.
 */
import { clamp01 } from './shared.js';

function vec2(x, y) { return { x: Number(x)||0, y: Number(y)||0 }; }
function length(v) { return Math.hypot(v.x, v.y); }
function dot(a, b) { return a.x*b.x + a.y*b.y; }
function sub(a, b) { return vec2(a.x-b.x, a.y-b.y); }
function add(a, b) { return vec2(a.x+b.x, a.y+b.y); }
function mul(v, s) { return vec2(v.x*s, v.y*s); }
function abs(v) { return vec2(Math.abs(v.x), Math.abs(v.y)); }
function max(a, b) { return vec2(Math.max(a.x, b.x), Math.max(a.y, b.y)); }
function min(a, b) { return vec2(Math.min(a.x, b.x), Math.min(a.y, b.y)); }

function rotate(p, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

function translate(p, t) { return sub(p, t); }

function scale(p, s) { return mul(p, 1 / (s || 1)); }

export function evaluateSDF(sdf, px, py) {
  if (!sdf || !sdf.primitives || !sdf.primitives.length) return Infinity;
  const p0 = vec2(px, py);
  // Apply global domain if any (for early out, but we still eval)
  let p = p0;
  // Evaluate tree bottom-up
  const values = [];
  for (let i = 0; i < sdf.primitives.length; i++) {
    let prim = sdf.primitives[i];
    let pp = p;
    if (prim.transform) {
      if (prim.transform.translate) pp = translate(pp, prim.transform.translate);
      if (prim.transform.rotate) pp = rotate(pp, prim.transform.rotate * Math.PI / 180);
      if (prim.transform.scale) pp = scale(pp, prim.transform.scale);
    }
    let d;
    const pr = prim.params || {};
    switch (prim.type) {
      case 'circle':
        d = length(sub(pp, pr.center || {x:0,y:0})) - (pr.radius || 0);
        break;
      case 'box': {
        const b = pr.size || {x:1,y:1};
        const q = sub(abs(sub(pp, pr.center || {x:0,y:0})), mul(b, 0.5));
        d = length(max(q, {x:0,y:0})) + Math.min(Math.max(q.x, q.y), 0);
        break;
      }
      case 'capsule': {
        const pa = pr.p1 || {x:0,y:0}, pb = pr.p2 || {x:0,y:1};
        const pa2 = sub(pp, pa), ba = sub(pb, pa);
        const h = clamp01( dot(pa2, ba) / dot(ba, ba) );
        d = length( sub( pa2 , mul(ba, h) ) ) - (pr.radius || 0);
        break;
      }
      case 'line': {
        const p1 = pr.p1 || {x:0,y:0}, p2 = pr.p2 || {x:1,y:0};
        const l = sub(p2, p1);
        const h2 = clamp01( dot( sub(pp,p1), l ) / dot(l,l) );
        d = length( sub( sub(pp,p1), mul(l, h2) ) );
        break;
      }
      case 'polygon': {
        // Simple even-odd or winding for dist? For simplicity use max dist to edges (approx)
        let minD = Infinity;
        const pts = Array.isArray(pr.points) ? pr.points : [];
        for (let j=0; j<pts.length; j++) {
          const a = pts[j];
          const bPt = pts[(j+1)%pts.length];
          const e = sub(bPt, a), w = sub(pp, a);
          const bProj = clamp01( dot(w,e)/dot(e,e) );
          const b2 = sub( w , mul(e, bProj) );
          minD = Math.min(minD, length(b2));
        }
        d = minD; // inside not computed precisely here; for lattice use negative if inside bbox etc. Simplified for demo.
        break;
      }
      default:
        d = length(sub(pp, pr.center || {x:0,y:0})) - (pr.radius || 1);
    }
    values.push(d);
  }
  // Now apply operations in order
  let result = values[0] !== undefined ? values[0] : Infinity;
  for (const op of (sdf.operations || [])) {
    const kids = op.children || [];
    if (!kids.length) continue;
    let a = values[kids[0]] !== undefined ? values[kids[0]] : result;
    for (let k=1; k<kids.length; k++) {
      const b = values[kids[k]] !== undefined ? values[kids[k]] : 0;
      const kk = op.k || 0;
      switch (op.op) {
        case 'union': a = Math.min(a, b); break;
        case 'subtract': a = Math.max(a, -b); break;
        case 'intersect': a = Math.max(a, b); break;
        case 'smoothUnion': {
          const h1 = Math.max(kk - Math.abs(a - b), 0) / kk;
          a = Math.min(a, b) - h1*h1*h1*kk/6;
          break;
        }
        case 'smoothSubtract': {
          const h2 = Math.max(kk - Math.abs(a + b), 0) / kk;
          a = Math.max(a, -b) + h2*h2*h2*kk/6;
          break;
        }
        default: a = Math.min(a, b);
      }
    }
    result = a;
  }
  return result;
}

export function sdfInside(sdf, x, y) {
  return evaluateSDF(sdf, x, y) <= 0;
}

/**
 * Numerical gradient of the SDF at (px, py) via central finite differences.
 * Returns a unit normal vector pointing outward (away from interior).
 * Safe at d≈0 (rim cells): clamps magnitude to avoid NaN.
 */
export function sdfGradient(sdf, px, py, eps = 0.5) {
  const dx = (evaluateSDF(sdf, px + eps, py) - evaluateSDF(sdf, px - eps, py)) / (2 * eps);
  const dy = (evaluateSDF(sdf, px, py + eps) - evaluateSDF(sdf, px, py - eps)) / (2 * eps);
  const len = Math.hypot(dx, dy) || 1;
  return { nx: dx / len, ny: dy / len };
}

export default { evaluateSDF, sdfInside, sdfGradient };
