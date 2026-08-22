/**
 * Tests: SCD64 MEMORY Family — L1 structural conformance for the MemoryIR domain.
 *
 * The third domain on the eight-slot wire contract, after bug families and ART.
 * L1 asks only: does a memory record encode, parse, and compare as a well-formed
 * SCD64? It does NOT ask whether two models mean the same thing by a slot — that
 * is L2 transport, deliberately out of scope here.
 *
 * The two drift cases this domain exists to make unrepresentable:
 *   MODALITY   "prefer modular edits" collapsing into "never refactor"
 *   CLAIM_KIND "measured together" collapsing into "is the cause of"
 * Both must land in DIFFERENT wire blocks, which is asserted below.
 */

import { describe, it, expect } from 'vitest';
import {
  BUG_FAMILIES,
  ART_FAMILIES,
  MEMORY_FAMILIES,
  SCD64_GLOSSARY,
  buildSCD64Glossary,
} from '../../../../src/core/scd64/glossary';
import {
  SCD64_SLOT_NAMES,
  MEMORY_SLOT_ALIASES,
  SCD64_REGEX,
} from '../../../../src/core/scd64/constants';
import { generateSCD64 } from '../../../../src/core/scd64/generateSCD64FromSlots';
import { parseSCD64 } from '../../../../src/core/scd64/parseSCD64';
import { compareSCD64ByBlocks } from '../../../../src/core/scd64/compareSCD64';

// ─── Family structure ────────────────────────────────────────────────────────

describe('MEMORY_FAMILIES', () => {
  it('defines three memory families', () => {
    expect(Object.keys(MEMORY_FAMILIES)).toEqual([
      'MEM_RULE_MANDATORY',
      'MEM_PREF_DEFEASIBLE',
      'MEM_CLAIM_REFUTED',
    ]);
  });

  it('each family has domain MEMORY and eight canonicals', () => {
    for (const family of Object.values(MEMORY_FAMILIES)) {
      expect(family.domain).toBe('MEMORY');
      expect(family.canonicals.length).toBe(8);
      expect(family.versionByte).toMatch(/^B\d$/);
      expect(family.predictedVersionByte).toMatch(/^C\d$/);
    }
  });

  it('each family uses all eight wire slots in wire order', () => {
    for (const family of Object.values(MEMORY_FAMILIES)) {
      expect(family.canonicals.map((c) => c.slot)).toEqual([...SCD64_SLOT_NAMES]);
    }
  });
});

// ─── Slot aliases ────────────────────────────────────────────────────────────

describe('MEMORY_SLOT_ALIASES', () => {
  it('maps all eight wire slots to memory-domain aliases', () => {
    for (const slot of SCD64_SLOT_NAMES) {
      expect(typeof MEMORY_SLOT_ALIASES[slot]).toBe('string');
    }
    expect(Object.keys(MEMORY_SLOT_ALIASES).length).toBe(8);
  });

  it('names the two slots the drift cases live in', () => {
    expect(MEMORY_SLOT_ALIASES.BUGCLASS).toBe('CLAIM_KIND');
    expect(MEMORY_SLOT_ALIASES.INVARIANT).toBe('MODALITY');
    expect(MEMORY_SLOT_ALIASES.VERDICT).toBe('UNBINDS_IF');
  });
});

// ─── Glossary integration ────────────────────────────────────────────────────

describe('SCD64_GLOSSARY with MEMORY', () => {
  it('adds 24 memory entries without disturbing the existing 72', () => {
    const memory = SCD64_GLOSSARY.filter((e) => e.domain === 'MEMORY');
    expect(memory.length).toBe(24);
    expect(SCD64_GLOSSARY.length).toBe(96);
  });

  it('memory entries carry memorySlotAlias and valid hex', () => {
    const entries = SCD64_GLOSSARY.filter((e) => e.domain === 'MEMORY');
    // Without this the loop below passes on an empty array and proves nothing.
    expect(entries.length).toBe(24);
    for (const entry of entries) {
      expect(typeof entry.memorySlotAlias).toBe('string');
      expect(entry.hexCode).toMatch(/^[0-9A-F]{8}$/);
      expect(entry.categoryChecksum).toMatch(/^[0-9A-F]{16}$/);
      expect(entry.fixedForever).toBe(true);
    }
  });

  it('CLAIM_KIND entries carry the memory version byte prefix', () => {
    const claimKind = SCD64_GLOSSARY.filter(
      (e) => e.domain === 'MEMORY' && e.slotName === 'BUGCLASS',
    );
    expect(claimKind.length).toBe(3);
    for (const entry of claimKind) {
      expect(entry.hexCode.slice(0, 2)).toMatch(/^B\d$/);
    }
  });
});

// ─── Wire compatibility — the addition must move nothing ─────────────────────

describe('wire compatibility', () => {
  it('leaves every pre-existing glossary entry byte-identical', () => {
    const rebuilt = buildSCD64Glossary();
    const priorOf = (list: any[]) => list.filter((e) => e.domain !== 'MEMORY');
    const before = priorOf(SCD64_GLOSSARY);
    const after = priorOf(rebuilt);

    expect(after.length).toBe(72);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].hexCode).toBe(before[i].hexCode);
      expect(after[i].family).toBe(before[i].family);
    }
  });

  it('does not collide with a bug or art version byte', () => {
    const taken = new Set([
      ...Object.values(BUG_FAMILIES).map((f: any) => f.versionByte),
      ...Object.values(ART_FAMILIES).map((f: any) => f.versionByte),
    ]);
    for (const family of Object.values(MEMORY_FAMILIES)) {
      expect(taken.has(family.versionByte)).toBe(false);
    }
  });
});

// ─── L1 conformance: encode → parse → compare ────────────────────────────────

describe('L1 conformance', () => {
  it('every memory family encodes to a well-formed 64-char wire value', () => {
    for (const name of Object.keys(MEMORY_FAMILIES)) {
      const wire = generateSCD64(name);
      expect(wire).toMatch(SCD64_REGEX);
      expect(parseSCD64(wire)).toHaveLength(8);
    }
  });

  it('is deterministic — same family, same wire value', () => {
    for (const name of Object.keys(MEMORY_FAMILIES)) {
      expect(generateSCD64(name)).toBe(generateSCD64(name));
    }
  });

  it('compares IDENTICAL against itself', () => {
    const wire = generateSCD64('MEM_RULE_MANDATORY');
    expect(compareSCD64ByBlocks(wire, wire).relationship).toBe('IDENTICAL');
  });

  it('localizes a single-slot mutation by wire slot name', () => {
    const wire = generateSCD64('MEM_RULE_MANDATORY');
    const blocks = parseSCD64(wire);
    blocks[2] = 'DEADBEEF';                       // INVARIANT === MODALITY
    const result = compareSCD64ByBlocks(wire, blocks.join(''));

    expect(result.differentBlocks).toEqual(['INVARIANT']);
    expect(result.relationship).toBe('MUTATION');
  });
});

// ─── The property the domain exists for ──────────────────────────────────────

describe('drift is representable as a wire difference', () => {
  /**
   * A preference and a mandate are DIFFERENT MEMORIES, and the wire must say so.
   * In prose, "prefer modular edits" degrades to "never refactor" across a few
   * compressions with nothing to detect it. Here that degradation is a changed
   * hex block in a named slot.
   */
  it('separates a mandate from a preference in the MODALITY slot', () => {
    const mandate = generateSCD64('MEM_RULE_MANDATORY');
    const preference = generateSCD64('MEM_PREF_DEFEASIBLE');
    const result = compareSCD64ByBlocks(mandate, preference);

    expect(result.relationship).not.toBe('IDENTICAL');
    expect(result.differentBlocks).toContain('INVARIANT');   // MODALITY
    expect(result.differentBlocks).toContain('BUGCLASS');    // CLAIM_KIND
  });

  /**
   * "a and b were measured together" is not "a causes b". Collapsing the first
   * into the second cost an hour of this project's time on 2026-08-22.
   */
  it('separates a live claim from a refuted one in the CLAIM_KIND slot', () => {
    const rule = generateSCD64('MEM_RULE_MANDATORY');
    const refuted = generateSCD64('MEM_CLAIM_REFUTED');
    expect(compareSCD64ByBlocks(rule, refuted).differentBlocks).toContain('BUGCLASS');
  });
});
