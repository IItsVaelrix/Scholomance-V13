/**
 * Tests: SCD64 ART Family — Art domain glossary and wire compatibility
 * PDR §17.1: Art family and wire compatibility
 */

import { describe, it, expect } from 'vitest';
import { BUG_FAMILIES, ART_FAMILIES, SCD64_GLOSSARY, buildSCD64Glossary } from '../../../../src/core/scd64/glossary';
import { SCD64_SLOT_NAMES, ART_SLOT_ALIASES, SCD64_REGEX } from '../../../../src/core/scd64/constants';

// ─── ART Family Structure ────────────────────────────────────────────────────

describe('ART_FAMILIES', () => {
  it('defines three art families', () => {
    expect(Object.keys(ART_FAMILIES)).toEqual([
      'ART_GENE_CURATION',
      'ART_PROJECTION_DRIFT',
      'ART_FEEL_WARNING',
    ]);
  });

  it('each family has domain ART and eight canonicals', () => {
    for (const [name, family] of Object.entries(ART_FAMILIES)) {
      expect(family.domain).toBe('ART');
      expect(family.canonicals.length).toBe(8);
      expect(family.versionByte).toMatch(/^A\d$/);
      expect(family.predictedVersionByte).toMatch(/^F\d$/);
    }
  });

  it('each family uses all eight wire slots', () => {
    for (const family of Object.values(ART_FAMILIES)) {
      const slots = family.canonicals.map((c) => c.slot);
      expect(slots).toEqual([...SCD64_SLOT_NAMES]);
    }
  });
});

// ─── ART Slot Aliases ────────────────────────────────────────────────────────

describe('ART_SLOT_ALIASES', () => {
  it('maps all eight wire slots to art-domain aliases', () => {
    for (const slot of SCD64_SLOT_NAMES) {
      expect(ART_SLOT_ALIASES[slot]).toBeDefined();
      expect(typeof ART_SLOT_ALIASES[slot]).toBe('string');
    }
  });

  it('preserves the physical eight-slot wire contract', () => {
    expect(SCD64_SLOT_NAMES.length).toBe(8);
    expect(Object.keys(ART_SLOT_ALIASES).length).toBe(8);
  });
});

// ─── Glossary Integration ────────────────────────────────────────────────────

describe('SCD64_GLOSSARY', () => {
  it('includes both bug families and art families', () => {
    const bugEntries = SCD64_GLOSSARY.filter((e) => !e.domain || e.domain !== 'ART');
    const artEntries = SCD64_GLOSSARY.filter((e) => e.domain === 'ART');

    // 6 bug families × 8 slots = 48
    expect(bugEntries.length).toBe(48);
    // 3 art families × 8 slots = 24
    expect(artEntries.length).toBe(24);
    expect(SCD64_GLOSSARY.length).toBe(72);
  });

  it('art entries carry artSlotAlias', () => {
    const artEntries = SCD64_GLOSSARY.filter((e) => e.domain === 'ART');
    for (const entry of artEntries) {
      expect(entry.artSlotAlias).toBeDefined();
      expect(typeof entry.artSlotAlias).toBe('string');
    }
  });

  it('art entries have valid hex codes', () => {
    const artEntries = SCD64_GLOSSARY.filter((e) => e.domain === 'ART');
    for (const entry of artEntries) {
      expect(entry.hexCode).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it('art ART_CLASS entries carry version byte prefix', () => {
    const artClassEntries = SCD64_GLOSSARY.filter(
      (e) => e.domain === 'ART' && e.slotName === 'BUGCLASS'
    );
    expect(artClassEntries.length).toBe(3);
    for (const entry of artClassEntries) {
      expect(entry.hexCode.slice(0, 2)).toMatch(/^A\d$/);
      expect(entry.versionByte).toMatch(/^A\d$/);
    }
  });

  it('art entries have categoryChecksum', () => {
    const artEntries = SCD64_GLOSSARY.filter((e) => e.domain === 'ART');
    for (const entry of artEntries) {
      expect(entry.categoryChecksum).toMatch(/^[0-9A-F]{16}$/);
    }
  });
});

// ─── Wire Compatibility ──────────────────────────────────────────────────────

describe('wire compatibility', () => {
  it('existing bug-family output remains byte-identical after ART addition', () => {
    // Rebuild glossary and verify bug entries are unchanged
    const rebuilt = buildSCD64Glossary();
    const bugEntriesOriginal = SCD64_GLOSSARY.filter((e) => !e.domain || e.domain !== 'ART');
    const bugEntriesRebuilt = rebuilt.filter((e) => !e.domain || e.domain !== 'ART');

    expect(bugEntriesRebuilt.length).toBe(bugEntriesOriginal.length);
    for (let i = 0; i < bugEntriesOriginal.length; i++) {
      expect(bugEntriesRebuilt[i].hexCode).toBe(bugEntriesOriginal[i].hexCode);
      expect(bugEntriesRebuilt[i].family).toBe(bugEntriesOriginal[i].family);
      expect(bugEntriesRebuilt[i].slotName).toBe(bugEntriesOriginal[i].slotName);
    }
  });

  it('SCD64_REGEX still validates 64-char hex', () => {
    expect(SCD64_REGEX.test('A'.repeat(64))).toBe(true);
    expect(SCD64_REGEX.test('G'.repeat(64))).toBe(false);
    expect(SCD64_REGEX.test('A'.repeat(63))).toBe(false);
  });
});
