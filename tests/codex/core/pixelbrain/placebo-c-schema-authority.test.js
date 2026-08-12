import { describe, it, expect } from 'vitest';
import {
  authorize,
  PLACEBO_C_CONTRACT,
} from '../../../../codex/core/pixelbrain/placebo-c-schema-authority.js';

const goodArtifact = {
  contract: 'PB-TEST-v1',
  schemaVersion: '1.0.0',
  body: { ok: true },
};
const goodEvent = { code: 'CONTENT_DRIFT', severity: 'error' };

describe('PLACEBO-C schema+authority', () => {
  it('happy path AUTHORITATIVE when schema and diagnostic event hold', () => {
    const out = authorize({ artifact: goodArtifact, diagnosticEvent: goodEvent });
    expect(out.contract).toBe(PLACEBO_C_CONTRACT);
    expect(out.schemaVerdict).toBe('PASS');
    expect(out.authoritativeVerdict).toBe('AUTHORITATIVE');
  });

  it('is deterministic', () => {
    const input = { artifact: goodArtifact, diagnosticEvent: goodEvent };
    expect(authorize(input)).toEqual(authorize(input));
  });

  it('refuses non-object input', () => {
    expect(() => authorize(null)).toThrow(/input must be an object/);
  });

  it('REFUSED when artifact schema is stripped', () => {
    const out = authorize({ artifact: { body: 1 }, diagnosticEvent: goodEvent });
    expect(out.schemaVerdict).toBe('FAIL');
    expect(out.authoritativeVerdict).toBe('REFUSED');
    expect(out.reason).toBe('SCHEMA_FAIL');
  });

  it('REFUSED when diagnostic event is absent (perturbation of authority inputs)', () => {
    const out = authorize({ artifact: goodArtifact, diagnosticEvent: null });
    expect(out.schemaVerdict).toBe('PASS');
    expect(out.authoritativeVerdict).toBe('REFUSED');
    expect(out.reason).toBe('NO_DIAGNOSTIC_EVENT');
  });

  it('does not mutate inputs', () => {
    const artifact = { ...goodArtifact };
    const diagnosticEvent = { ...goodEvent };
    const before = JSON.stringify({ artifact, diagnosticEvent });
    authorize({ artifact, diagnosticEvent });
    expect(JSON.stringify({ artifact, diagnosticEvent })).toBe(before);
  });
});
