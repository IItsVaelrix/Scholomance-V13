/**
 * Deterministic identity utilities for ATS document parsing and analysis.
 * Uses DJB2 hash algorithm for stable, content-derived hashes.
 */

export function stableHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit signed integer
  }
  return (hash >>> 0).toString(16);
}

export function makeBlockId(
  page: number | undefined,
  sourceOrder: number,
  text: string
): string {
  return `block:${page ?? 0}:${sourceOrder}:${stableHash(text)}`;
}

export function makeSectionId(
  kind: string,
  rawStart: number,
  rawEnd: number
): string {
  return `section:${kind}:${rawStart}:${rawEnd}`;
}

export function makeSuggestionId(
  type: string,
  targetKey: string,
  evidencePayload: string
): string {
  return `suggestion:${type}:${targetKey}:${stableHash(evidencePayload)}`;
}
