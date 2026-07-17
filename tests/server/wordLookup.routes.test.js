import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

function jsonResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

describe('[Server] wordLookup.routes', () => {
  const originalServerUrl = process.env.SCHOLOMANCE_DICT_API_URL;
  const originalViteUrl = process.env.VITE_SCHOLOMANCE_DICT_API_URL;
  const originalFetch = global.fetch;
  let wordLookupRoutes;

  beforeAll(async () => {
    process.env.SCHOLOMANCE_DICT_API_URL = 'http://dict.local/api/lexicon';
    delete process.env.VITE_SCHOLOMANCE_DICT_API_URL;
    const mod = await import('../../codex/server/routes/wordLookup.routes.js?test=wordlookup-routes');
    wordLookupRoutes = mod.wordLookupRoutes;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalServerUrl === undefined) {
      delete process.env.SCHOLOMANCE_DICT_API_URL;
    } else {
      process.env.SCHOLOMANCE_DICT_API_URL = originalServerUrl;
    }

    if (originalViteUrl === undefined) {
      delete process.env.VITE_SCHOLOMANCE_DICT_API_URL;
    } else {
      process.env.VITE_SCHOLOMANCE_DICT_API_URL = originalViteUrl;
    }
  });

  async function buildApp() {
    const app = Fastify({ logger: false });
    app.decorate('redis', null);
    await app.register(wordLookupRoutes);
    return app;
  }

  it('uses Scholomance local lookup and reports scholomance-local source', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/arcana') {
        return jsonResponse({
          word: 'arcana',
          definition: {
            text: 'Secret knowledge',
            partOfSpeech: 'noun',
            source: 'scholomance',
          },
          entries: [],
          synonyms: ['mysteries'],
          antonyms: [],
          rhymes: [],
          lore: { school: 'Divination' },
        });
      }
      throw new Error(`Unexpected fetch URL: ${href}`);
    });
    global.fetch = fetchMock;

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/word-lookup/arcana',
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.source).toBe('scholomance-local');
    expect(payload.data.definition.text).toBe('Secret knowledge');
    expect(payload.data.definitions).toEqual(['Secret knowledge']);
    expect(payload.data.synonyms).toEqual(['mysteries']);
    // Local dict + one Datamuse rel_nry supplement (local dict omits slantRhymes).
    // The full external-API path (Free Dictionary + rel_syn/rel_rhy/rel_ant) is
    // NOT invoked — local lookup is preferred.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain('/api/lexicon/lookup/arcana');
    expect(urls[1]).toContain('https://api.datamuse.com/words?rel_nry=arcana');
    expect(urls.some((url) => url.includes('dictionaryapi.dev'))).toBe(false);
    expect(urls.some((url) => url.includes('rel_rhy='))).toBe(false);
    expect(urls.some((url) => url.includes('rel_syn='))).toBe(false);
  });

  it('falls back to external APIs when local lookup misses', async () => {
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
      throw new Error(`Unexpected fetch URL: ${href}`);
    });
    global.fetch = fetchMock;

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/word-lookup/hello',
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.source).toBe('external-api');
    expect(payload.data.definition.text).toBe('A greeting');
    expect(payload.data.pronunciation).toBe('/həˈləʊ/');
  });

  it('returns local data even without definition text when synonyms exist', async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'http://dict.local/api/lexicon/lookup/runes') {
        return jsonResponse({
          word: 'runes',
          definition: null,
          entries: [],
          synonyms: ['glyphs', 'sigils'],
          antonyms: [],
          rhymes: [],
          lore: null,
        });
      }
      throw new Error(`Unexpected fetch URL: ${href}`);
    });
    global.fetch = fetchMock;

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/word-lookup/runes',
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.source).toBe('scholomance-local');
    expect(payload.data.definition).toBeNull();
    expect(payload.data.synonyms).toEqual(['glyphs', 'sigils']);
  });
});
