import crypto from 'node:crypto';
import { BUG_FAMILIES, ART_FAMILIES, MEMORY_FAMILIES, NAV_FAMILIES } from './glossary';

/**
 * Resolve a family name across every domain registry on the eight-slot wire.
 *
 * Bug families are searched FIRST so their resolution — and therefore every hex
 * value they have ever produced — is unchanged by the addition of a domain.
 * ART, MEMORY, and NAV reuse the same physical contract, so once resolved they
 * derive through the identical code path below. NAV is appended, not
 * prepended, so nothing about bug/art/memory resolution changes.
 */
function resolveFamily(name: string): any {
  const registries: Record<string, any>[] = [BUG_FAMILIES, ART_FAMILIES, MEMORY_FAMILIES, NAV_FAMILIES];
  for (const registry of registries) {
    const hit = registry[name];
    if (hit) return hit;
  }
  return undefined;
}

export function generateSCD64(bugFamily: string, isPredicted: boolean = false): string {
  const family = resolveFamily(bugFamily);
  if (!family) {
    throw new Error(`[SCD64] Unknown family: ${bugFamily}`);
  }

  const deriveHex = (canonical: string, isBugClass: boolean) => {
    const hash = crypto.createHash('sha256').update(canonical).digest('hex').toUpperCase();
    if (isBugClass) {
      return (isPredicted ? family.predictedVersionByte : family.versionByte) + hash.slice(0, 6);
    }
    return hash.slice(0, 8);
  };

  const slots = family.canonicals.map((entry: any) => {
    const isBug = entry.slot === 'BUGCLASS';
    return deriveHex(entry.canonical, isBug);
  });

  return slots.join('');
}
