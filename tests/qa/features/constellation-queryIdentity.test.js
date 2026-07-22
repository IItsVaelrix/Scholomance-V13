import { describe, it, expect } from 'vitest';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

describe('resolveQueryIdentity', () => {
  it('classifies a single word', () => {
    const id = resolveQueryIdentity('  Gravity ');
    expect(id.normalized).toBe('gravity');
    expect(id.kind).toBe('word');
    expect(id.tokenCount).toBe(1);
    expect(id.graphemeCount).toBe(7);
    expect(id.primaryContentToken).toBe('gravity');
  });

  it('classifies a phrase and skips stopwords for the content token', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(id.kind).toBe('phrase');
    expect(id.tokenCount).toBe(5);
    // last non-stopword content token
    expect(id.primaryContentToken).toBe('morning');
  });

  it('classifies multiline input', () => {
    const id = resolveQueryIdentity('first line\nsecond line');
    expect(id.kind).toBe('multiline');
  });

  it('counts unicode graphemes, not code units', () => {
    const id = resolveQueryIdentity('café');
    expect(id.graphemeCount).toBe(4);
  });

  it('returns null content token when the query is all stopwords', () => {
    const id = resolveQueryIdentity('the of and');
    expect(id.primaryContentToken).toBeNull();
  });
});
