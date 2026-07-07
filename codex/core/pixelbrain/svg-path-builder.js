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
