import { describe, expect, it, vi } from 'vitest';
import { naturalLanguageAmp } from '../../../codex/core/verseir-amplifier/plugins/naturalLanguageAmp.js';

const fakeAdapter = (neighborsByWord) => ({
  meansLike: vi.fn(async (word) => neighborsByWord[word] ?? []),
});

// A prompt whose only content word is OOV (no closed-vocab subject match).
const OOV_PROMPT = 'a glitchcore vibe';

describe('naturalLanguageAmp OOV subject resolution', () => {
  it('resolves an OOV subject when a dictionary adapter is supplied', async () => {
    const adapter = fakeAdapter({ glitchcore: ['noise', 'dragon', 'phoenix'] });
    const result = await naturalLanguageAmp.analyze({
      verseIR: { rawText: OOV_PROMPT },
      options: { dictionaryAdapter: adapter },
    });

    expect(result.payload.entities.SUBJECT).toContain('dragon');
    expect(result.payload.oovResolutions).toEqual([
      { original: 'glitchcore', resolvedTo: 'dragon', via: 'datamuse:meansLike' },
    ]);
    expect(adapter.meansLike).toHaveBeenCalledWith('glitchcore');
  });

  it('is a no-op (no network) when no adapter is supplied', async () => {
    const result = await naturalLanguageAmp.analyze({
      verseIR: { rawText: OOV_PROMPT },
      options: {},
    });

    expect(result.payload.entities.SUBJECT).toEqual([]);
    expect(result.payload.oovResolutions).toEqual([]);
  });

  it('honors explicit direct NLU mode for short editor prompts', async () => {
    const result = await naturalLanguageAmp.analyze({
      verseIR: { rawText: OOV_PROMPT },
      options: { nluMode: 'direct' },
    });

    expect(result.payload.mode).toBe('direct');
    expect(result.payload.generatedVerse).toBeNull();
  });

  it('does not call the adapter when a subject already matched', async () => {
    const adapter = fakeAdapter({ glitchcore: ['dragon'] });
    const result = await naturalLanguageAmp.analyze({
      verseIR: { rawText: 'a glitchcore knight' },
      options: { dictionaryAdapter: adapter },
    });

    expect(result.payload.entities.SUBJECT).toContain('knight');
    expect(result.payload.oovResolutions).toEqual([]);
    expect(adapter.meansLike).not.toHaveBeenCalled();
  });
});
