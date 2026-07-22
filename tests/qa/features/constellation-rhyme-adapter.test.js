import { describe, it, expect } from 'vitest';
import { analyzeRhyme, cadenceFamilyFromStress } from '../../../codex/server/services/constellation/rhymeAstrology.adapter.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

const engine = {
  async query({ mode }) {
    return {
      topMatches: [{ token: 'mourning', overallScore: 0.7 }, { token: 'warning', overallScore: 0.6 }],
      constellations: [{
        dominantVowelFamily: ['AO'],
        dominantStressPattern: 'x / x',
        members: ['mooring', 'warning'],
        cohesionScore: 0.5,
        densityScore: 0.4,
      }],
      diagnostics: { queryTimeMs: 1, cacheHit: false, candidateCount: 2 },
      _mode: mode,
    };
  },
};
const repo = { lookupNodeByNormalized: (t) => (t === 'morning' ? { phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'] } : null) };

describe('analyzeRhyme', () => {
  it('maps engine output to panel fields with backend phonemes', async () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const r = await analyzeRhyme(engine, repo, id);
    expect(r.phonemes).toEqual(['M', 'AO1', 'R', 'N', 'IH0', 'NG']);
    expect(r.stress).toBe('x / x');
    expect(r.dominantVowelFamily).toBe('AO');
    expect(r.exactRhymes).toEqual(['mooring', 'warning']);
    expect(r.slantRhymes).toContain('mourning');
  });

  it('derives a cadence family label from the stress contour', () => {
    expect(cadenceFamilyFromStress('x / x /')).toBe('iambic-adjacent');
    expect(cadenceFamilyFromStress('/ x / x')).toBe('trochaic-adjacent');
    expect(cadenceFamilyFromStress('')).toBe('unmetered');
  });

  it('returns empty phonemes (not fabricated) when the repo has no node', async () => {
    const id = resolveQueryIdentity('zzzq');
    const r = await analyzeRhyme(engine, { lookupNodeByNormalized: () => null }, id);
    expect(r.phonemes).toEqual([]);
  });
});
