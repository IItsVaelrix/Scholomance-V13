import { isDTCGToken, type DTCGDictionary, type DTCGToken, type DTCGTokenGroup } from './index';
import { TokenResolver } from './index';

function cloneDict(dict: DTCGDictionary): DTCGDictionary {
  return JSON.parse(JSON.stringify(dict)) as DTCGDictionary;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function applyDerivedTransforms(suite: DTCGDictionary): DTCGDictionary {
  const next = cloneDict(suite);
  const resolver = new TokenResolver(next);

  function walk(group: DTCGTokenGroup): void {
    for (const [key, value] of Object.entries(group)) {
      if (isDTCGToken(value)) {
        const transform = value.$extensions?.['compose.transform'];
        if (transform === 'glow-from-accent' || transform === 'focus-ring') {
          const baseRef = typeof value.$value === 'string' ? value.$value : '{color.accent.primary}';
          const base = String(resolver.resolve(baseRef.startsWith('{') ? baseRef : `{${baseRef}}`));
          const opacityPath =
            transform === 'glow-from-accent'
              ? '{color.glow.accent-opacity}'
              : '{color.glow.focus-opacity}';
          const opacity = Number(resolver.resolve(opacityPath));
          const rgb = hexToRgb(base);
          if (rgb) {
            (group[key] as DTCGToken).$value = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
          }
        }
      } else {
        walk(value as DTCGTokenGroup);
      }
    }
  }

  for (const group of Object.values(next)) {
    walk(group);
  }
  return next;
}
