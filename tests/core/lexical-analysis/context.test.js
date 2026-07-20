import { describe, expect, it } from 'vitest';
import {
  canonicalContextBytes,
  resolveAnalysisContext,
} from '../../../codex/core/lexical-analysis/context.js';

describe('ANALYSIS_CONTEXT_v1', () => {
  it('hashes NFC and LF-equivalent line contexts identically', () => {
    const a = resolveAnalysisContext({
      scope: 'line',
      surface: 'café',
      containingLine: 'I saw cafe\u0301\r\n',
    });
    const b = resolveAnalysisContext({
      scope: 'line',
      surface: 'café',
      containingLine: 'I saw café\n',
    });

    expect(a.contextHash).toBe(b.contextHash);
    expect(a.contextHash).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
  });

  it('rejects fields outside the selected scope, including a client hash', () => {
    expect(() => resolveAnalysisContext({
      scope: 'word',
      surface: 'saw',
      documentContext: 'secret draft',
    })).toThrow(/PB-ERR-v1-VALUE/);

    expect(() => resolveAnalysisContext({
      scope: 'word',
      surface: 'saw',
      contextHash: 'client-authored',
    })).toThrow(/PB-ERR-v1-VALUE/);
  });

  it('preserves neighbor order in local hashes', () => {
    const base = { scope: 'local', surface: 'saw', containingLine: 'I saw it' };
    const a = resolveAnalysisContext({ ...base, neighboringLines: ['before', 'after'] });
    const b = resolveAnalysisContext({ ...base, neighboringLines: ['after', 'before'] });

    expect(a.contextHash).not.toBe(b.contextHash);
  });

  it('enforces document and neighbor limits without truncation', () => {
    expect(() => resolveAnalysisContext({
      scope: 'document',
      surface: 'saw',
      documentContext: 'x'.repeat(20_001),
    })).toThrow(/PB-ERR-v1-VALUE/);

    expect(() => resolveAnalysisContext({
      scope: 'local',
      surface: 'saw',
      containingLine: 'x',
      neighboringLines: ['1', '2', '3', '4', '5'],
    })).toThrow(/PB-ERR-v1-VALUE/);
  });

  it('serializes only normalized lawful fields in deterministic order', () => {
    expect(canonicalContextBytes({
      scope: 'selection',
      surface: '  saw  ',
      selection: 'I\r\nsaw it',
    })).toBe(JSON.stringify({
      version: 'ANALYSIS_CONTEXT_v1',
      scope: 'selection',
      surface: 'saw',
      selection: 'I\nsaw it',
    }));
  });
});
