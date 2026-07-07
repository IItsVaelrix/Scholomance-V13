import { describe, expect, it, vi } from 'vitest';
import { createWordLookupService } from '../../codex/server/services/wordLookup.service.js';

function jsonResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

function makeWordSeries(prefix, count) {
  return Array.from({ length: count }, (_, index) => {
    const ch = String.fromCharCode(97 + (index % 26));
    const cycle = Math.floor(index / 26);
    return cycle > 0 ? `${prefix}${ch}${cycle}` : `${prefix}${ch}`;
  });
}

describe('[Server] WordLookupService', () => {
  it('returns manual override entries without network lookups', async () => {
    const fetchMock = vi.fn();

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('Worcestershire');
    expect(result.source).toBe('manual-override');
    expect(result.word).toBe('worcestershire');
    expect(result.data?.definitions?.[0]).toContain('West Midlands');
    expect(result.data?.pronunciation).toBe('/WUH-ster-sheer/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers Scholomance dictionary when available', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/arcana') {
        return jsonResponse({
          definition: { text: 'Secret knowledge', partOfSpeech: 'noun' },
          entries: [],
          synonyms: ['mysteries'],
          antonyms: [],
          rhymes: [],
        });
      }
      if (href.startsWith('https://api.datamuse.com/words?rel_nry=arcana')) {
        // Slant-rhyme supplement: local dict omits slantRhymes, so the
        // service fetches from Datamuse and merges.
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('Arcana');
    expect(result.source).toBe('scholomance-merged');
    expect(result.word).toBe('arcana');
    expect(result.data?.definition?.text).toBe('Secret knowledge');
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain('/api/lexicon/lookup/arcana');
    expect(urls.some((url) => url.includes('https://api.datamuse.com/words?rel_nry=arcana'))).toBe(true);
  });

  it('falls back to external APIs when local misses', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/hello') {
        return jsonResponse({}, false);
      }
      if (href === 'https://api.dictionaryapi.dev/api/v2/entries/en/hello') {
        return jsonResponse([
          {
            meanings: [
              {
                partOfSpeech: 'interjection',
                definitions: [{ definition: 'A greeting' }],
              },
            ],
            phonetics: [{ text: '/həˈləʊ/' }],
          },
        ]);
      }
      if (href.startsWith('https://api.datamuse.com/words?rel_syn=hello')) {
        return jsonResponse([]);
      }
      if (href.startsWith('https://api.datamuse.com/words?rel_rhy=hello')) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('hello');
    expect(result.source).toBe('external-api');
    expect(result.data?.definition?.text).toBe('A greeting');
    expect(result.data?.pronunciation).toBe('/həˈləʊ/');
  });

  it('serves cache hits from redis before network', async () => {
    const redis = {
      get: vi.fn(async () => JSON.stringify({ word: 'CACHED', definition: null })),
      setEx: vi.fn(async () => {}),
    };
    const fetchMock = vi.fn();

    const service = createWordLookupService({
      redis,
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('cached');
    expect(result.source).toBe('redis-cache');
    expect(result.data).toEqual({ word: 'CACHED', definition: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  it('caps CODEx-judged suggestions at top 15 per group', async () => {
    const synonyms = makeWordSeries('ally', 24);
    const antonyms = makeWordSeries('foe', 24);
    const rhymes = makeWordSeries('echo', 24);
    const slantRhymes = makeWordSeries('near', 24);

    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/ember') {
        return jsonResponse({
          definition: { text: 'A burning coal', partOfSpeech: 'noun' },
          entries: [],
          synonyms,
          antonyms,
          rhymes,
          slantRhymes,
        });
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('ember');
    expect(result.source).toBe('scholomance-merged');
    expect(result.data?.synonyms).toHaveLength(15);
    expect(result.data?.antonyms).toHaveLength(15);
    expect(result.data?.rhymes).toHaveLength(15);
    expect(result.data?.slantRhymes).toHaveLength(15);
  });

  it('uses available max when fewer than 15 suggestions exist', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/orbit') {
        return jsonResponse({
          definition: { text: 'Path around a body', partOfSpeech: 'noun' },
          entries: [],
          synonyms: ['cycle', 'circuit', 'loop', 'arc'],
          antonyms: ['stillness', 'stasis'],
          rhymes: ['morbid', 'forbid', 'sorbid'],
          slantRhymes: ['orchid'],
        });
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('orbit');
    expect(result.source).toBe('scholomance-merged');
    expect(result.data?.synonyms).toHaveLength(4);
    expect(result.data?.antonyms).toHaveLength(2);
    expect(result.data?.rhymes).toHaveLength(3);
    expect(result.data?.slantRhymes).toHaveLength(1);
  });

  it('keeps Scholomance lexicon rhymes authoritative when local phoneme keys disagree', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/perfect') {
        return jsonResponse({
          definition: { text: 'Complete or exact', partOfSpeech: 'adjective' },
          entries: [],
          synonyms: [],
          antonyms: [],
          rhymes: ['act', 'sect'],
          rhymeFamily: 'AE',
        });
      }
      if (href.startsWith('https://api.datamuse.com/words?rel_nry=perfect')) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL: ${href}`);
    });
    const phonemeEngine = {
      ensureAuthorityBatch: vi.fn(async () => {}),
      primeG2PBatch: vi.fn(async () => {}),
      analyzeWord: vi.fn((word) => {
        const key = String(word || '').trim().toUpperCase();
        if (key === 'PERFECT') return { rhymeKey: 'EH-KT', phonemes: ['P', 'ER0', 'F', 'EH1', 'K', 'T'] };
        if (key === 'ACT') return { rhymeKey: 'AE-KT', phonemes: ['AE1', 'K', 'T'] };
        if (key === 'SECT') return { rhymeKey: 'EH-KT', phonemes: ['S', 'EH1', 'K', 'T'] };
        return { rhymeKey: 'ZZ-open', phonemes: ['Z'] };
      }),
    };

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      phonemeEngine,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('perfect');
    expect(result.source).toBe('scholomance-merged');
    expect(result.data?.rhymes).toEqual(expect.arrayContaining(['act', 'sect']));
    expect(result.data?.rhymes).toHaveLength(2);
    expect(result.data?.slantRhymes ?? []).not.toContain('act');
  });

  it('supplements slant rhymes from Datamuse when the local dict omits them', async () => {
    // Simulates the real Scholomance pipeline: /api/lexicon/lookup returns
    // rhymes + synonyms but no slantRhymes key at all. The service must
    // call Datamuse rel_nry and merge the result so the Shadow Echo channel
    // is not perpetually empty.
    const datamuseSlants = makeWordSeries('ember', 12);
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/ember') {
        return jsonResponse({
          definition: { text: 'A glowing coal', partOfSpeech: 'noun' },
          entries: [],
          synonyms: ['coal', 'cinder'],
          antonyms: [],
          rhymes: makeWordSeries('ember', 18),
          // No slantRhymes / nearRhymes — this is the real bug surface.
        });
      }
      if (href.startsWith('https://api.datamuse.com/words?rel_nry=ember')) {
        return jsonResponse(datamuseSlants.map((word) => ({ word })));
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('ember');
    expect(result.source).toBe('scholomance-merged');
    expect(result.data?.rhymes?.length).toBeGreaterThan(0);
    expect(result.data?.slantRhymes).toEqual(expect.arrayContaining(datamuseSlants));
    expect(result.data?.slantRhymes.length).toBeLessThanOrEqual(15);

    const calledDatamuse = fetchMock.mock.calls.some(([url]) =>
      String(url).startsWith('https://api.datamuse.com/words?rel_nry=ember')
    );
    expect(calledDatamuse).toBe(true);
  });

  it('keeps slantRhymes empty when both local dict and Datamuse return nothing', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/zzzqxqv') {
        return jsonResponse({
          definition: { text: 'Obscure term', partOfSpeech: 'noun' },
          entries: [],
          synonyms: [],
          antonyms: [],
          rhymes: ['aabbcc', 'ddeeff'],
        });
      }
      if (href.startsWith('https://api.datamuse.com/words?rel_nry=zzzqxqv')) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('zzzqxqv');
    expect(result.source).toBe('scholomance-merged');
    expect(result.data?.slantRhymes ?? []).toHaveLength(0);
  });

  it('preserves local-dict slantRhymes when present', async () => {
    const localSlants = ['orchid', 'torrid', 'horrid'];
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/orbit') {
        return jsonResponse({
          definition: { text: 'Path around a body', partOfSpeech: 'noun' },
          entries: [],
          synonyms: ['cycle'],
          antonyms: [],
          rhymes: ['morbid'],
          slantRhymes: localSlants,
        });
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const service = createWordLookupService({
      fetchImpl: fetchMock,
      scholomanceDictApiUrl: 'http://dict.local/api/lexicon',
    });

    const result = await service.lookupWord('orbit');
    expect(result.source).toBe('scholomance-merged');
    expect(result.data?.slantRhymes).toEqual(expect.arrayContaining(localSlants));
  });
});
