import { describe, it, expect } from 'vitest';
import {
  FORM64_SLOT_NAMES,
  REALIZATION64_SLOT_NAMES,
  SCD128_WIRE_LENGTH,
  BANK_WIRE_LENGTH,
  BLOCK_HEX_LENGTH,
  FORM64_VERSION_PREFIX,
  REALIZATION64_VERSION_PREFIX,
  SCD128_REGEX,
  FORM64_REGEX,
  REALIZATION64_REGEX,
} from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.constants.js';
import {
  createSlotRecord,
  createBankPacket,
  verifyBankPacket,
  parseSCD128Wire,
  assembleArtPacket,
} from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.packet.js';
import { assertNoBlockCollisions } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

describe('SCD128 Physical Wire & Bank Packets', () => {
  function makeDummySlots(bank) {
    const names = bank === 'form' ? FORM64_SLOT_NAMES : REALIZATION64_SLOT_NAMES;
    return names.map((name, idx) =>
      createSlotRecord({
        slot: name,
        position: idx,
        canonicalCategory: 'test_category',
        parameters: { paramA: idx * 10, flag: true },
        evidenceRefs: [`ref-${idx}`],
        confidence: 'authored',
        canonicalDerivation: 'test',
        bank,
      })
    );
  }

  it('generates valid FORM64 packet with 81 prefix and exactly 64 hex characters', () => {
    const slots = makeDummySlots('form');
    const packet = createBankPacket({
      bank: 'form',
      adapterFamily: 'tree',
      slots,
      evidenceDigest: 'EVIDENCE_DIGEST_A',
    });

    expect(packet.contract).toBe('SCD128-FORM64-v1');
    expect(packet.schemaVersion).toBe(1);
    expect(packet.checksum64).toHaveLength(BANK_WIRE_LENGTH);
    expect(packet.checksum64.startsWith(FORM64_VERSION_PREFIX)).toBe(true);
    expect(FORM64_REGEX.test(packet.checksum64)).toBe(true);
    expect(verifyBankPacket(packet).ok).toBe(true);
  });

  it('generates valid REALIZATION64 packet with 91 prefix and exactly 64 hex characters', () => {
    const slots = makeDummySlots('realization');
    const packet = createBankPacket({
      bank: 'realization',
      adapterFamily: 'tree',
      slots,
      evidenceDigest: 'EVIDENCE_DIGEST_B',
    });

    expect(packet.contract).toBe('SCD128-REALIZATION64-v1');
    expect(packet.schemaVersion).toBe(1);
    expect(packet.checksum64).toHaveLength(BANK_WIRE_LENGTH);
    expect(packet.checksum64.startsWith(REALIZATION64_VERSION_PREFIX)).toBe(true);
    expect(REALIZATION64_REGEX.test(packet.checksum64)).toBe(true);
    expect(verifyBankPacket(packet).ok).toBe(true);
  });

  it('assembles SCD128ArtPacket with exactly 128 uppercase hex characters', () => {
    const form = createBankPacket({
      bank: 'form',
      adapterFamily: 'tree',
      slots: makeDummySlots('form'),
    });
    const realization = createBankPacket({
      bank: 'realization',
      adapterFamily: 'tree',
      slots: makeDummySlots('realization'),
    });

    const art = assembleArtPacket({ form, realization, sourceProvenance: { author: 'Angel' } });
    expect(art.contract).toBe('SCD128-ART-v1');
    expect(art.checksum128).toHaveLength(SCD128_WIRE_LENGTH);
    expect(art.checksum128).toBe(form.checksum64 + realization.checksum64);
    expect(SCD128_REGEX.test(art.checksum128)).toBe(true);

    const parsed = parseSCD128Wire(art.checksum128);
    expect(parsed.formChecksum64).toBe(form.checksum64);
    expect(parsed.realizationChecksum64).toBe(realization.checksum64);
    expect(parsed.blocks).toHaveLength(16);
    expect(parsed.blocks.every((b) => b.length === BLOCK_HEX_LENGTH)).toBe(true);
  });

  it('fails closed if two different slot digests collide at the 8-character block', () => {
    const collidingSlots = [
      { slot: 'A', blockHex: '12345678', digest256: 'AAAA' + '0'.repeat(60) },
      { slot: 'B', blockHex: '12345678', digest256: 'BBBB' + '0'.repeat(60) },
    ];
    expect(() => assertNoBlockCollisions(collidingSlots)).toThrow(/collision/i);
  });
});
