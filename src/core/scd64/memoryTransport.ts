import crypto from 'node:crypto';
import {
  SCD64_SLOT_NAMES,
  MEMORY_SLOT_ALIASES,
  MEMORY_SLOT_VOCAB,
  MEMORY_UNBOUND,
  CLAIM_KIND_VERSION_BYTE,
} from './constants';
import { MEMORY_FAMILIES } from './glossary';
import { compareSCD64ByBlocks } from './compareSCD64';

export type MemoryRecord = Record<string, string>;

export interface TransportResult {
  pass: boolean;
  relationship: string;
  similarity: number;
  /** Slots answered with a DIFFERENT value than the canonical one. */
  drifted: Array<{ slot: string; expected: string; got: string }>;
  /** Slots the reader declined to answer. Not errors — refusals. */
  abstained: string[];
  expectedWire: string;
  actualWire: string;
}

/**
 * Validate a record against the published vocabulary.
 *
 * Throws rather than coercing. A missing slot is NOT defaulted and an unknown
 * value is NOT snapped to the nearest legal one — either would let the harness
 * invent the answer it is supposed to be measuring
 * (SEMANTIC_KIND_THEORY_UNBOUND: no plausible defaults).
 */
function assertLegal(record: MemoryRecord): void {
  for (const slot of SCD64_SLOT_NAMES) {
    const alias = MEMORY_SLOT_ALIASES[slot as keyof typeof MEMORY_SLOT_ALIASES];
    const value = record[slot];
    if (value === undefined || value === null || value === '') {
      throw new Error(`[MemoryIR] missing slot ${slot} (${alias}) — records are not defaulted`);
    }
    if (!MEMORY_SLOT_VOCAB[slot].includes(value)) {
      throw new Error(
        `[MemoryIR] value "${value}" for ${slot} (${alias}) is outside the published vocabulary: `
        + MEMORY_SLOT_VOCAB[slot].join(' | '),
      );
    }
  }
}

/**
 * Build the 64-char wire value from a record's eight slot values.
 *
 * Derivation is byte-identical to `generateSCD64`: sha256 of `ALIAS:value`,
 * first 8 hex, with slot 0 carrying a version byte + 6 hex. The version byte
 * comes from CLAIM_KIND, so a record rebuilds from its values alone.
 */
export function memoryRecordToSCD64(record: MemoryRecord): string {
  assertLegal(record);
  return SCD64_SLOT_NAMES.map((slot) => {
    const alias = MEMORY_SLOT_ALIASES[slot as keyof typeof MEMORY_SLOT_ALIASES];
    const canonical = `${alias}:${record[slot]}`;
    const hash = crypto.createHash('sha256').update(canonical).digest('hex').toUpperCase();
    if (slot === 'BUGCLASS') {
      const versionByte = CLAIM_KIND_VERSION_BYTE[record[slot]];
      if (!versionByte) throw new Error(`[MemoryIR] no version byte for CLAIM_KIND "${record[slot]}"`);
      return versionByte + hash.slice(0, 6);
    }
    return hash.slice(0, 8);
  }).join('');
}

/** The canonical record for a family, as slot values. */
export function familyRecord(familyName: string): MemoryRecord {
  const family = (MEMORY_FAMILIES as any)[familyName];
  if (!family) throw new Error(`[MemoryIR] unknown memory family: ${familyName}`);
  return Object.fromEntries(
    family.canonicals.map((c: any) => [c.slot, c.canonical.split(':').slice(1).join(':')]),
  );
}

/**
 * Score one transport round-trip.
 *
 * `returned` is what came back after a memory was rendered to prose by one
 * reader and re-encoded by another. Pass is exact: all eight blocks identical.
 *
 * ABSTENTION IS NOT ERROR. A slot answered UNBOUND is reported in `abstained`
 * and deliberately kept OUT of `drifted` — "I could not map this" and "I mapped
 * it wrongly" are different failures with different fixes, and collapsing them
 * would hide which one the vocabulary caused.
 */
export function scoreTransport(familyName: string, returned: MemoryRecord): TransportResult {
  const expected = familyRecord(familyName);
  assertLegal(returned);

  const expectedWire = memoryRecordToSCD64(expected);
  const actualWire = memoryRecordToSCD64(returned);
  const comparison = compareSCD64ByBlocks(expectedWire, actualWire);

  const drifted: TransportResult['drifted'] = [];
  const abstained: string[] = [];
  for (const slot of SCD64_SLOT_NAMES) {
    const alias = MEMORY_SLOT_ALIASES[slot as keyof typeof MEMORY_SLOT_ALIASES];
    if (returned[slot] === MEMORY_UNBOUND && expected[slot] !== MEMORY_UNBOUND) {
      abstained.push(alias);
    } else if (returned[slot] !== expected[slot]) {
      drifted.push({ slot: alias, expected: expected[slot], got: returned[slot] });
    }
  }

  return {
    pass: comparison.relationship === 'IDENTICAL',
    relationship: comparison.relationship,
    similarity: comparison.similarity,
    drifted,
    abstained,
    expectedWire,
    actualWire,
  };
}
