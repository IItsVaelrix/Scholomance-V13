import { describe, it, expect } from 'vitest';
import {
  sealStructure,
  verifySealedPacket,
  PLACEBO_A_CONTRACT,
} from '../../../../codex/core/pixelbrain/placebo-a-serialize-packet.js';

const structure = {
  contract: 'PB-TEST-STRUCT-v1',
  schemaVersion: '1.0.0',
  payload: { n: 1 },
};

describe('PLACEBO-A serialize+packet', () => {
  it('happy path stamps contract and seals', () => {
    const out = sealStructure(structure);
    expect(out.contract).toBe(PLACEBO_A_CONTRACT);
    expect(out.checksum).toMatch(/^placeboa1:[0-9a-f]{64}$/);
    expect(typeof out.artifact).toBe('string');
    expect(out.sealedPacket.checksum).toBe(out.checksum);
  });

  it('is deterministic', () => {
    expect(sealStructure(structure)).toEqual(sealStructure(structure));
  });

  it('refuses non-object structure', () => {
    expect(() => sealStructure(null)).toThrow(/structure must be an object/);
    expect(() => sealStructure('x')).toThrow(/structure must be an object/);
  });

  it('detects post-seal structure perturbation', () => {
    const out = sealStructure(structure);
    const drifted = { ...structure, payload: { n: 99 } };
    expect(verifySealedPacket(out.sealedPacket, structure)).toBe(true);
    expect(verifySealedPacket(out.sealedPacket, drifted)).toBe(false);
  });

  it('does not mutate input structure', () => {
    const input = { ...structure, nested: { a: 1 } };
    const before = JSON.stringify(input);
    sealStructure(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
