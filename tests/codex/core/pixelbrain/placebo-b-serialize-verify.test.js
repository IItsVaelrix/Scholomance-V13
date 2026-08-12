import { describe, it, expect } from 'vitest';
import {
  serializeAndVerify,
  PLACEBO_B_CONTRACT,
} from '../../../../codex/core/pixelbrain/placebo-b-serialize-verify.js';

describe('PLACEBO-B serialize+verify', () => {
  it('happy path PASSes a contract-bearing structure', () => {
    const out = serializeAndVerify({
      contract: 'PB-TEST-v1',
      schemaVersion: '1.0.0',
      x: 1,
    });
    expect(out.contract).toBe(PLACEBO_B_CONTRACT);
    expect(out.schemaVerdict).toBe('PASS');
    expect(out.findings).toEqual([]);
    expect(typeof out.artifact).toBe('string');
  });

  it('is deterministic', () => {
    const s = { contract: 'PB-TEST-v1', schemaVersion: '1.0.0' };
    expect(serializeAndVerify(s)).toEqual(serializeAndVerify(s));
  });

  it('refuses non-object structure', () => {
    expect(() => serializeAndVerify(null)).toThrow(/structure must be an object/);
  });

  it('FAILs when contract fields are stripped (perturbation)', () => {
    const out = serializeAndVerify({ payload: true });
    expect(out.schemaVerdict).toBe('FAIL');
    expect(out.findings).toContain('NO_CONTRACT');
    expect(out.findings).toContain('NO_SCHEMA_VERSION');
  });

  it('does not mutate input', () => {
    const input = { contract: 'PB-TEST-v1', schemaVersion: '1.0.0', k: 2 };
    const before = JSON.stringify(input);
    serializeAndVerify(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
