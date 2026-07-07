/**
 * SVG-PATH-BUILDER
 * Converts cell-boundary-tracer output to SVG string fragments.
 * No DOM dependency — pure string concatenation.
 */

/**
 * Build an SVG `d` attribute string from tracer output.
 *
 * @param {{ vertices: [number,number][], segments: object[] }} traceResult
 * @param {{ smooth?: boolean, scale?: number }} [options]
 * @returns {string}  SVG path `d` value, or '' if no vertices
 */
export function buildPath(traceResult, options = {}) {
  const { smooth = true, scale = 8 } = options;
  const { vertices = [], segments = [] } = traceResult;

  if (vertices.length === 0) return '';

  const s = scale;

  if (!smooth || segments.length === 0) {
    const [sx, sy] = vertices[0];
    const parts = [`M ${sx * s},${sy * s}`];
    for (let i = 1; i < vertices.length; i++) {
      const [x, y] = vertices[i];
      parts.push(`L ${x * s},${y * s}`);
    }
    parts.push('Z');
    return parts.join(' ');
  }

  const [sx, sy] = segments[0].p1;
  const parts = [`M ${sx * s},${sy * s}`];
  for (const seg of segments) {
    const [cp1x, cp1y] = seg.cp1;
    const [cp2x, cp2y] = seg.cp2;
    const [p2x, p2y]   = seg.p2;
    parts.push(
      `C ${(cp1x * s).toFixed(2)},${(cp1y * s).toFixed(2)} ` +
      `${(cp2x * s).toFixed(2)},${(cp2y * s).toFixed(2)} ` +
      `${p2x * s},${p2y * s}`
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Build a `<path .../>` element string.
 */
export function buildPathElement({ d, fill = 'none', stroke, strokeWidth, className, opacity, filter }) {
  if (!d) return '';
  const attrs = [];
  if (className)   attrs.push(`class="${className}"`);
  attrs.push(`fill="${fill}"`);
  if (stroke)      attrs.push(`stroke="${stroke}"`);
  if (strokeWidth != null) attrs.push(`stroke-width="${strokeWidth}"`);
  if (strokeWidth != null) attrs.push(`stroke-linejoin="round" stroke-linecap="round"`);
  if (opacity != null) attrs.push(`opacity="${opacity}"`);
  if (filter) attrs.push(`filter="${filter}"`);
  attrs.push(`d="${d}"`);
  return `<path ${attrs.join(' ')}/>`;
}

/**
 * Build any SVG element string: `<tag attrs...>children</tag>` or self-closing.
 * attrs values are plain strings/numbers — no escaping (internal use only).
 */
export function buildSVGElement(tag, attrs = {}, children = '') {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  if (!children && children !== 0) return `<${tag} ${attrStr}/>`;
  return `<${tag} ${attrStr}>${children}</${tag}>`;
}

/**
 * Direct math/vector points to SVG path (no rasterization).
 * Implements "Geometry Generation: Translate evaluated math output into vector primitives".
 * Supports polyline (default) or simple smooth approximation.
 * Pure, deterministic, respects precision.
 */
export function pointsToSVGPath(points = [], options = {}) {
  if (!points || points.length === 0) return '';

  const { smooth = false, scale = 1, precision = 2, close = false } = options;
  const s = scale;

  // Simple polyline from points (core vector primitive)
  const first = points[0];
  let d = `M ${(first.x * s).toFixed(precision)},${(first.y * s).toFixed(precision)}`;

  if (!smooth || points.length < 3) {
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      d += ` L ${(p.x * s).toFixed(precision)},${(p.y * s).toFixed(precision)}`;
    }
  } else {
    // Light Catmull-Rom approximation using consecutive points as control hints (pure math)
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const cp1x = p0.x * s + (p1.x - p0.x) * s * 0.3;
      const cp1y = p0.y * s + (p1.y - p0.y) * s * 0.3;
      const cp2x = p2.x * s - (p2.x - p1.x) * s * 0.3;
      const cp2y = p2.y * s - (p2.y - p1.y) * s * 0.3;
      d += ` C ${cp1x.toFixed(precision)},${cp1y.toFixed(precision)} ${cp2x.toFixed(precision)},${cp2y.toFixed(precision)} ${(p1.x * s).toFixed(precision)},${(p1.y * s).toFixed(precision)}`;
    }
    const last = points[points.length - 1];
    d += ` L ${(last.x * s).toFixed(precision)},${(last.y * s).toFixed(precision)}`;
  }

  if (close) d += ' Z';
  return d;
}
