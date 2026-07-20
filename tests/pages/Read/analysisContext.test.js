import { describe, expect, it } from 'vitest';
import { buildAnalysisContextInput } from '../../../src/pages/Read/analysisContext.js';

const source = {
  surface: 'saw',
  selection: 'I saw the light',
  lines: ['two before', 'one before', 'I saw the light', 'one after', 'two after', 'distant'],
  lineIndex: 2,
  documentContext: 'two before\none before\nI saw the light\none after\ntwo after\ndistant',
};

describe('buildAnalysisContextInput', () => {
  it('builds each discriminated scope with only lawful fields', () => {
    expect(buildAnalysisContextInput({ ...source, scope: 'word' }))
      .toEqual({ scope: 'word', surface: 'saw' });
    expect(buildAnalysisContextInput({ ...source, scope: 'selection' }))
      .toEqual({ scope: 'selection', surface: 'saw', selection: 'I saw the light' });
    expect(buildAnalysisContextInput({ ...source, scope: 'line' }))
      .toEqual({ scope: 'line', surface: 'saw', containingLine: 'I saw the light' });
    expect(buildAnalysisContextInput({ ...source, scope: 'document' }))
      .toEqual({ scope: 'document', surface: 'saw', documentContext: source.documentContext });
  });

  it('includes at most two nonblank neighbors on each side in document order', () => {
    expect(buildAnalysisContextInput({ ...source, scope: 'local' })).toEqual({
      scope: 'local',
      surface: 'saw',
      containingLine: 'I saw the light',
      neighboringLines: ['two before', 'one before', 'one after', 'two after'],
    });

    expect(buildAnalysisContextInput({
      ...source,
      scope: 'local',
      lines: ['before', '', 'I saw the light', '', 'after'],
    }).neighboringLines).toEqual(['before', 'after']);
  });

  it('rejects missing evidence instead of widening or truncating scope', () => {
    expect(() => buildAnalysisContextInput({ ...source, scope: 'selection', selection: '' }))
      .toThrow(/PB-ERR-v1-VALUE/);
    expect(() => buildAnalysisContextInput({ ...source, scope: 'local', lines: ['I saw'], lineIndex: 0 }))
      .toThrow(/PB-ERR-v1-VALUE/);
    expect(() => buildAnalysisContextInput({ ...source, scope: 'word', surface: '' }))
      .toThrow(/PB-ERR-v1-VALUE/);
  });

  it('returns frozen request records so distant edits cannot mutate a submitted envelope', () => {
    expect(Object.isFrozen(buildAnalysisContextInput({ ...source, scope: 'line' }))).toBe(true);
    expect(Object.isFrozen(buildAnalysisContextInput({ ...source, scope: 'local' }).neighboringLines))
      .toBe(true);
  });
});
