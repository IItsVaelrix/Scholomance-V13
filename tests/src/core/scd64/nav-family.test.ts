/**
 * Tests: SCD64 NAV Family — the fourth domain on the eight-slot wire.
 *
 * A NAV record encodes one act of looking: which tool, at what, why, and
 * what the target looked like at the time. See PDR §9.3/§9.4
 * (docs/scholomance-encyclopedia/PDR-archive/2026-08-26-toolcall-episodic-ledger-pdr.md).
 */

import { describe, it, expect } from 'vitest';
import { NAV_FAMILIES, MEMORY_FAMILIES, ART_FAMILIES, BUG_FAMILIES, SCD64_GLOSSARY } from '../../../../src/core/scd64/glossary';
import { NAV_SLOT_ALIASES, SCD64_SLOT_NAMES } from '../../../../src/core/scd64/constants';
import navHex from '../../../../divtube_downloader/tui/services/nav_hex.json';

describe('NAV families', () => {
  it('every family fills all eight slots in wire order', () => {
    for (const [name, family] of Object.entries(NAV_FAMILIES)) {
      const slots = family.canonicals.map((c: any) => c.slot);
      expect(slots, name).toEqual([...SCD64_SLOT_NAMES]);
    }
  });

  it('aliases cover every slot', () => {
    expect(Object.keys(NAV_SLOT_ALIASES).sort()).toEqual([...SCD64_SLOT_NAMES].sort());
  });

  it('version bytes collide with no other domain', () => {
    const others = [BUG_FAMILIES, ART_FAMILIES, MEMORY_FAMILIES].flatMap(
      (reg) => Object.values(reg).flatMap((f: any) => [f.versionByte, f.predictedVersionByte]),
    );
    for (const [name, f] of Object.entries(NAV_FAMILIES)) {
      expect(others, `${name} versionByte`).not.toContain((f as any).versionByte);
      expect(others, `${name} predictedVersionByte`).not.toContain((f as any).predictedVersionByte);
    }
  });

  it('nav_hex.json is current — the Python side reads THIS artifact', () => {
    // Without this, Python can silently tag episodes with a stale hex and the
    // decoder would explain them as the wrong intent.
    const live: Record<string, string> = {};
    for (const e of SCD64_GLOSSARY) {
      if ((e as any).domain === 'NAV' && e.slotIndex === 0) live[e.family] = e.hexCode;
    }
    expect(navHex).toEqual(live);
  });
});
