import { describe, expect, it } from 'vitest';
import {
  candidateId,
  forwardLemmaForms,
} from '../../../codex/core/lexical-analysis/morphology.js';

const surfaces = (lemma, pos) => forwardLemmaForms(lemma, pos).map((row) => row.surface);

describe('LEMMA_FORM_v1 forward rules', () => {
  it('emits identity and ambiguous plural forms', () => {
    expect(surfaces('ax', 'n')).toContain('axes');
    expect(surfaces('axis', 'noun')).toContain('axes');
    expect(surfaces('leaf', 'n')).toContain('leaves');
    expect(surfaces('leave', 'verb')).toContain('leaves');
  });

  it('emits sourced irregulars without suppressing identity', () => {
    expect(surfaces('see', 'v')).toEqual(expect.arrayContaining(['see', 'saw']));
    expect(surfaces('go', 'v')).toContain('went');
    expect(surfaces('good', 'a')).toContain('better');
    expect(surfaces('well', 'r')).toContain('better');
  });

  it('normalizes POS identity and returns deterministic edge order', () => {
    expect(candidateId(' Leaf ', 'n')).toBe('leaf/noun');
    expect(candidateId('GOOD', 's')).toBe('good/adjective');

    const first = forwardLemmaForms('try', 'v');
    const second = forwardLemmaForms('TRY', 'verb');
    expect(second).toEqual(first);
    expect(first.map((row) => row.surface)).toEqual([...first]
      .map((row) => row.surface)
      .sort((left, right) => left.localeCompare(right)));
  });

  it('rejects unsupported or empty lemma identities', () => {
    expect(() => forwardLemmaForms('', 'noun')).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => forwardLemmaForms('leaf', 'preposition')).toThrow(/PB-ERR-v1-VALUE/);
  });
});
