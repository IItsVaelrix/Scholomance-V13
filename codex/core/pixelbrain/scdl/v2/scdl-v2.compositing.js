export function parseColor(raw) {
  if (raw && typeof raw === 'object' && 'r' in raw && 'g' in raw && 'b' in raw) {
    return {
      r: Math.min(255, Math.max(0, Math.round(Number(raw.r)))),
      g: Math.min(255, Math.max(0, Math.round(Number(raw.g)))),
      b: Math.min(255, Math.max(0, Math.round(Number(raw.b)))),
      a: raw.a !== undefined ? Math.min(255, Math.max(0, Math.round(Number(raw.a)))) : 255,
    };
  }

  const str = String(raw).trim();
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(str);
  if (!match) {
    throw new TypeError(`Invalid color '${raw}'; expected #RRGGBB or #RRGGBBAA`);
  }
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}

export function formatColor({ r, g, b, a = 255 }) {
  const toHex = (n) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0');
  const rgb = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return a === 255 ? rgb : `${rgb}${toHex(a)}`;
}

export function applyOpacity(color, opacity = 1) {
  const parsed = parseColor(color);
  const numericOpacity = Number(opacity);
  const clamped = Number.isFinite(numericOpacity) ? Math.min(1, Math.max(0, numericOpacity)) : 1;
  return { ...parsed, a: Math.round(parsed.a * clamped) };
}

export function blendColors(srcColor, dstColor, mode = 'OVER') {
  const src = parseColor(srcColor);
  const dst = parseColor(dstColor);
  const m = String(mode).toUpperCase();

  switch (m) {
    case 'OVER': {
      const sA = src.a;
      const dA = dst.a;
      const invA = 255 - sA;
      const outA = sA + Math.round((dA * invA) / 255);
      if (outA === 0) return { r: 0, g: 0, b: 0, a: 0 };
      const outR = Math.min(255, Math.max(0, Math.round((src.r * sA + (dst.r * dA * invA) / 255) / outA)));
      const outG = Math.min(255, Math.max(0, Math.round((src.g * sA + (dst.g * dA * invA) / 255) / outA)));
      const outB = Math.min(255, Math.max(0, Math.round((src.b * sA + (dst.b * dA * invA) / 255) / outA)));
      return { r: outR, g: outG, b: outB, a: outA };
    }

    case 'ADD': {
      const outR = Math.min(255, src.r + dst.r);
      const outG = Math.min(255, src.g + dst.g);
      const outB = Math.min(255, src.b + dst.b);
      const outA = Math.min(255, src.a + dst.a);
      return { r: outR, g: outG, b: outB, a: outA };
    }

    case 'SUBTRACT': {
      const outR = Math.max(0, dst.r - src.r);
      const outG = Math.max(0, dst.g - src.g);
      const outB = Math.max(0, dst.b - src.b);
      return { r: outR, g: outG, b: outB, a: dst.a };
    }

    case 'MULTIPLY': {
      const outR = Math.round((src.r * dst.r) / 255);
      const outG = Math.round((src.g * dst.g) / 255);
      const outB = Math.round((src.b * dst.b) / 255);
      const outA = Math.round((src.a * dst.a) / 255);
      return { r: outR, g: outG, b: outB, a: outA };
    }

    case 'MASK_IN': {
      const outA = Math.round((src.a * dst.a) / 255);
      return { r: src.r, g: src.g, b: src.b, a: outA };
    }

    case 'MASK_OUT': {
      const outA = Math.round((src.a * (255 - dst.a)) / 255);
      return { r: src.r, g: src.g, b: src.b, a: outA };
    }

    case 'REPLACE':
      return { r: src.r, g: src.g, b: src.b, a: src.a };

    default:
      throw new RangeError(`Unsupported blend mode '${mode}'`);
  }
}
