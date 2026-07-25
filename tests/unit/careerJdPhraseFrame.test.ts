import { describe, it, expect } from 'vitest';
import { toPastTense } from '../../src/lib/career/improve/jd-phrase-frame';

describe('toPastTense', () => {
  it('converts the base form', () => {
    expect(toPastTense('build')).toBe('built');
    expect(toPastTense('lead')).toBe('led');
    expect(toPastTense('design')).toBe('designed');
  });

  it('converts the gerund', () => {
    expect(toPastTense('building')).toBe('built');
    expect(toPastTense('managing')).toBe('managed');
  });

  it('accepts a form that is already past tense', () => {
    expect(toPastTense('built')).toBe('built');
    expect(toPastTense('delivered')).toBe('delivered');
  });

  it('is case insensitive and returns lowercase', () => {
    expect(toPastTense('Building')).toBe('built');
    expect(toPastTense('BUILD')).toBe('built');
  });

  it('returns null for a word that is not a known verb — fail closed', () => {
    expect(toPastTense('orchestration')).toBeNull();
    expect(toPastTense('kubernetes')).toBeNull();
    expect(toPastTense('modeling')).toBeNull();
    expect(toPastTense('')).toBeNull();
  });
});
