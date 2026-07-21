import { isDTCGToken, type DTCGDictionary, type DTCGTokenGroup } from './index';

export function collectTokenPaths(dict: DTCGDictionary): string[] {
  const paths: string[] = [];

  function walk(group: DTCGTokenGroup, prefix: string): void {
    for (const [key, value] of Object.entries(group)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isDTCGToken(value)) {
        paths.push(path);
      } else {
        walk(value as DTCGTokenGroup, path);
      }
    }
  }

  for (const [category, group] of Object.entries(dict)) {
    walk(group, category);
  }

  return paths.sort();
}

export function assertThemeParity(
  dark: DTCGDictionary,
  light: DTCGDictionary,
): { ok: true } | { ok: false; missingInDark: string[]; missingInLight: string[] } {
  const darkPaths = new Set(collectTokenPaths(dark));
  const lightPaths = new Set(collectTokenPaths(light));
  const missingInLight = [...darkPaths].filter((p) => !lightPaths.has(p));
  const missingInDark = [...lightPaths].filter((p) => !darkPaths.has(p));
  if (missingInDark.length || missingInLight.length) {
    return { ok: false, missingInDark, missingInLight };
  }
  return { ok: true };
}
