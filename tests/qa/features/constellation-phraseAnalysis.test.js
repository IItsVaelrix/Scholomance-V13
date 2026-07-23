import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  selectHeadToken,
  detectCompounds,
  assignTokenRoles,
  detectPhraseDevices,
  analyzePhraseStructure,
} from '../../../codex/core/constellation/phraseAnalysis.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

// ─── classifyIntent ──────────────────────────────────────────────────

describe('classifyIntent', () => {
  it('classifies a literary phrase as "literary"', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(classifyIntent(id)).toBe('literary');
  });

  it('classifies a meta-query with relativizer', () => {
    const id = resolveQueryIdentity('words that rhyme with gravity but feel spiritual');
    expect(classifyIntent(id)).toBe('meta-query');
  });

  it('classifies a meta-query with two signal words', () => {
    const id = resolveQueryIdentity('find words similar to darkness');
    expect(classifyIntent(id)).toBe('meta-query');
  });

  it('classifies a craft instruction', () => {
    const id = resolveQueryIdentity('make this phrase more sonic');
    expect(classifyIntent(id)).toBe('craft-instruction');
  });

  it('classifies a comparison request', () => {
    const id = resolveQueryIdentity('compare the cadence of these two lines');
    expect(classifyIntent(id)).toBe('comparison');
  });

  it('classifies a single word as literary', () => {
    const id = resolveQueryIdentity('gravity');
    expect(classifyIntent(id)).toBe('literary');
  });

  it('classifies empty input as literary', () => {
    expect(classifyIntent({ tokens: [], normalized: '' })).toBe('literary');
  });
});

// ─── selectHeadToken ─────────────────────────────────────────────────

describe('selectHeadToken', () => {
  it('returns null for empty tokens', () => {
    expect(selectHeadToken([], new Map())).toBeNull();
  });

  it('returns null for all-stopword tokens', () => {
    expect(selectHeadToken(['the', 'of', 'and'], new Map())).toBeNull();
  });

  it('falls back to last content token without freqMap', () => {
    expect(selectHeadToken(['the', 'bright', 'wound', 'of', 'morning'])).toBe('morning');
  });

  it('selects the rarest content token when freqMap is provided', () => {
    const freqMap = new Map([
      ['bright', 500],
      ['wound', 40],   // rarest
      ['morning', 300],
    ]);
    expect(selectHeadToken(['the', 'bright', 'wound', 'of', 'morning'], freqMap)).toBe('wound');
  });

  it('breaks ties toward the last (rightmost) content token', () => {
    const freqMap = new Map([
      ['bright', 100],
      ['wound', 100],
      ['morning', 100],
    ]);
    // All equal freq → last content token wins
    expect(selectHeadToken(['bright', 'wound', 'morning'], freqMap)).toBe('morning');
  });

  it('treats unknown words (not in freqMap) as maximally rare', () => {
    const freqMap = new Map([
      ['bright', 500],
      ['morning', 300],
    ]);
    // "wound" not in freqMap → Infinity → rarest
    expect(selectHeadToken(['bright', 'wound', 'morning'], freqMap)).toBe('wound');
  });
});

// ─── detectCompounds ─────────────────────────────────────────────────

describe('detectCompounds', () => {
  it('detects adj+noun bigrams', () => {
    const compounds = detectCompounds(['the', 'bright', 'wound', 'of', 'morning']);
    expect(compounds).toContain('bright wound');
  });

  it('detects multiple compounds', () => {
    const compounds = detectCompounds(['silent', 'silver', 'sea']);
    // "silent" is adj, "silver" is also adj → "silent silver" is adj+adj, NOT a compound
    // "silver" is adj, "sea" is noun → "silver sea" IS a compound
    expect(compounds).toContain('silver sea');
    expect(compounds).not.toContain('silent silver');
  });

  it('returns empty for single tokens', () => {
    expect(detectCompounds(['morning'])).toEqual([]);
  });

  it('skips stopword pairs', () => {
    expect(detectCompounds(['the', 'of'])).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(detectCompounds([])).toEqual([]);
  });
});

// ─── assignTokenRoles ────────────────────────────────────────────────

describe('assignTokenRoles', () => {
  it('assigns head, modifier, connector, specifier roles', () => {
    const roles = assignTokenRoles(['the', 'bright', 'wound', 'of', 'morning'], 'wound');
    expect(roles).toEqual([
      { token: 'the', role: 'connector' },
      { token: 'bright', role: 'modifier' },
      { token: 'wound', role: 'head' },
      { token: 'of', role: 'connector' },
      { token: 'morning', role: 'specifier' },
    ]);
  });

  it('handles null headToken', () => {
    const roles = assignTokenRoles(['the', 'of'], null);
    expect(roles.every((r) => r.role === 'connector')).toBe(true);
  });
});

// ─── detectPhraseDevices ─────────────────────────────────────────────

describe('detectPhraseDevices', () => {
  it('detects alliteration', () => {
    const id = resolveQueryIdentity('silent silver sea');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('alliteration');
  });

  it('detects sibilance', () => {
    const id = resolveQueryIdentity('silent silver sea');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('sibilance');
  });

  it('detects assonance', () => {
    // "bright" and "wound" don't share vowel nucleus, but "wound" and "morning"
    // don't either. Let's use a clear case: "deep sleep" shares 'ee'
    const id = resolveQueryIdentity('deep sleep');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('assonance');
  });

  it('detects consonance', () => {
    // "bright" and "wound" both end in 't'/'d' — no. Let's use "cold world" (both end in 'd')
    const id = resolveQueryIdentity('cold world');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('consonance');
  });

  it('detects imagery-candidate from compounds', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('imagery-candidate');
  });

  it('returns empty for single-token input', () => {
    const id = resolveQueryIdentity('morning');
    expect(detectPhraseDevices(id)).toEqual([]);
  });

  it('returns empty for all-stopword input', () => {
    const id = resolveQueryIdentity('the of and');
    expect(detectPhraseDevices(id)).toEqual([]);
  });
});

// ─── analyzePhraseStructure (orchestrator) ───────────────────────────

describe('analyzePhraseStructure', () => {
  it('produces a complete structure for a literary phrase', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const freqMap = new Map([
      ['bright', 500],
      ['wound', 40],
      ['morning', 300],
    ]);
    const result = analyzePhraseStructure(id, freqMap);

    expect(result.intent).toBe('literary');
    expect(result.headToken).toBe('wound'); // rarest
    expect(result.compounds).toContain('bright wound');
    expect(result.devices).toContain('imagery-candidate');
    expect(result.tokenRoles.length).toBe(5);
    expect(result.tokenRoles.find((r) => r.role === 'head')?.token).toBe('wound');
  });

  it('produces a meta-query intent for instruction-like input', () => {
    const id = resolveQueryIdentity('words that rhyme with gravity');
    const result = analyzePhraseStructure(id, new Map());
    expect(result.intent).toBe('meta-query');
  });

  it('is deterministic for the same input', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const freqMap = new Map([['bright', 500], ['wound', 40], ['morning', 300]]);
    const a = analyzePhraseStructure(id, freqMap);
    const b = analyzePhraseStructure(id, freqMap);
    expect(a).toEqual(b);
  });
});

// ─── resolveQueryIdentity integration ────────────────────────────────

describe('resolveQueryIdentity with phrase analysis', () => {
  it('includes intent field', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(id.intent).toBe('literary');
  });

  it('selects rarest head token when freqMap is provided', () => {
    const freqMap = new Map([
      ['bright', 500],
      ['wound', 40],
      ['morning', 300],
    ]);
    const id = resolveQueryIdentity('the bright wound of morning', freqMap);
    expect(id.primaryContentToken).toBe('wound');
  });

  it('falls back to last content token without freqMap', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(id.primaryContentToken).toBe('morning');
  });

  it('preserves backward compatibility for single words', () => {
    const id = resolveQueryIdentity('gravity');
    expect(id.kind).toBe('word');
    expect(id.primaryContentToken).toBe('gravity');
    expect(id.intent).toBe('literary');
  });
});
