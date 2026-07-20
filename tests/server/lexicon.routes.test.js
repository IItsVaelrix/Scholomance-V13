import Fastify from 'fastify';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import csrf from '@fastify/csrf-protection';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from '../../codex/server/routes/auth.routes.js';
import { lexiconRoutes } from '../../codex/server/routes/lexicon.routes.js';

function createCookieJar() {
  const cookies = new Map();
  return {
    capture(response) {
      const setCookie = response.headers['set-cookie'];
      const values = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
      for (const value of values) {
        if (typeof value !== 'string') continue;
        const pair = value.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator <= 0) continue;
        const name = pair.slice(0, separator).trim();
        const cookieValue = pair.slice(separator + 1).trim();
        if (!name) continue;
        cookies.set(name, cookieValue);
      }
    },
    header() {
      if (cookies.size === 0) return '';
      return [...cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    },
  };
}

async function requestWithJar(app, jar, options) {
  const headers = { ...(options.headers || {}) };
  const cookieHeader = jar.header();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  let payload = options.payload;
  const contentType = headers['content-type'] || headers['Content-Type'];
  if (
    typeof contentType === 'string' &&
    contentType.toLowerCase().includes('application/json') &&
    payload &&
    typeof payload === 'object' &&
    !Buffer.isBuffer(payload)
  ) {
    payload = JSON.stringify(payload);
  }
  const response = await app.inject({
    ...options,
    headers,
    payload,
  });
  jar.capture(response);
  return response;
}

function createAdapterMocks() {
  const entry = {
    id: 1,
    headword: 'Arcana',
    pos: 'noun',
    ipa: 'AA R K AA N AH',
    etymology: null,
    senses: [{ glosses: ['Secret knowledge'] }],
    source: 'oewn',
    sourceUrl: 'https://en-word.net/',
  };

  return {
    lookupWord: vi.fn(() => [entry]),
    lookupSynonyms: vi.fn(() => [{ lemma: 'mystery', pos: ['noun'] }]),
    lookupAntonyms: vi.fn(() => [{ lemma: 'banality', pos: ['noun'] }]),
    lookupRhymes: vi.fn(() => ({ family: 'AA', words: ['banana'] })),
    batchLookupFamilies: vi.fn(() => ({ ARCANA: 'AA' })),
    batchValidateWords: vi.fn(() => ['arcana']),
    searchEntries: vi.fn(() => [entry]),
    suggestEntries: vi.fn(() => [{ headword: 'Arcana', pos: 'noun' }]),
    extractGloss: vi.fn(() => 'Secret knowledge'),
  };
}

async function createApp(adapter) {
  const app = Fastify({ logger: false });
  app.register(fastifyCookie);
  app.register(fastifySession, {
    secret: '12345678901234567890123456789012',
    cookieName: 'scholomance.sid',
    saveUninitialized: false,
    cookie: {
      secure: false,
      path: '/',
      httpOnly: true,
    },
  });
  app.register(csrf, { sessionPlugin: '@fastify/session' });
  app.register(rateLimit, { global: false });
  app.register(authRoutes, { prefix: '/auth' });
  app.register(lexiconRoutes, { prefix: '/api/lexicon', adapter });
  await app.ready();
  return app;
}

describe('[Server] lexicon.routes', () => {
  let app;
  let adapter;

  beforeEach(async () => {
    adapter = createAdapterMocks();
    app = await createApp(adapter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('returns 401 for lexicon routes without a session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/lexicon/lookup/arcana',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Unauthorized: Session required.');
  });

  it('allows guest sessions minted via /auth/csrf-token and serves all endpoints', async () => {
    const jar = createCookieJar();
    const csrfResponse = await requestWithJar(app, jar, {
      method: 'GET',
      url: '/auth/csrf-token',
    });
    expect(csrfResponse.statusCode).toBe(200);
    expect(typeof csrfResponse.json().token).toBe('string');

    const lookup = await requestWithJar(app, jar, {
      method: 'GET',
      url: '/api/lexicon/lookup/arcana',
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toEqual({
      word: 'arcana',
      definition: {
        text: 'Secret knowledge',
        partOfSpeech: 'noun',
        source: 'oewn',
      },
      entries: [expect.objectContaining({ headword: 'Arcana' })],
      synonyms: ['mystery'],
      antonyms: ['banality'],
      rhymes: ['banana'],
      // The local dict now COMPUTES its own near rhymes (same rhyme tail, different
      // nucleus) instead of begging Datamuse's rel_nry, which answered "strid",
      // "scrid", "clwyd" for "blood". Empty here because the fixture adapter has no
      // lookupSlantRhymes — the route must still emit the key rather than omit it.
      slantRhymes: [],
      rhymeFamily: 'AA',
      lore: { seed: 'arcana' },
    });

    const search = await requestWithJar(app, jar, {
      method: 'GET',
      url: '/api/lexicon/search?q=secret&limit=10',
    });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toEqual({
      query: 'secret',
      results: [
        {
          headword: 'Arcana',
          pos: 'noun',
          definition: 'Secret knowledge',
          source: 'oewn',
        },
      ],
    });

    const suggest = await requestWithJar(app, jar, {
      method: 'GET',
      url: '/api/lexicon/suggest?prefix=ar&limit=10',
    });
    expect(suggest.statusCode).toBe(200);
    expect(suggest.json()).toEqual({
      prefix: 'ar',
      results: [{ headword: 'Arcana', pos: 'noun' }],
    });

    const lookupBatch = await requestWithJar(app, jar, {
      method: 'POST',
      url: '/api/lexicon/lookup-batch',
      headers: { 'content-type': 'application/json' },
      payload: { words: ['arcana'] },
    });
    expect(lookupBatch.statusCode).toBe(200);
    expect(lookupBatch.json()).toEqual({
      families: { ARCANA: 'AA' },
    });

    const validateBatch = await requestWithJar(app, jar, {
      method: 'POST',
      url: '/api/lexicon/validate-batch',
      headers: { 'content-type': 'application/json' },
      payload: { words: ['arcana'] },
    });
    expect(validateBatch.statusCode).toBe(200);
    expect(validateBatch.json()).toEqual({
      valid: ['arcana'],
    });
  });

  it('returns 400 for validation failures', async () => {
    const jar = createCookieJar();
    await requestWithJar(app, jar, {
      method: 'GET',
      url: '/auth/csrf-token',
    });

    const badLookup = await requestWithJar(app, jar, {
      method: 'GET',
      url: '/api/lexicon/lookup/%20',
    });
    expect(badLookup.statusCode).toBe(400);
    expect(badLookup.json().error).toBe('Invalid request');

    const badLimit = await requestWithJar(app, jar, {
      method: 'GET',
      url: '/api/lexicon/search?q=secret&limit=101',
    });
    expect(badLimit.statusCode).toBe(400);
    expect(badLimit.json().error).toBe('Invalid request');

    const tooManyWords = await requestWithJar(app, jar, {
      method: 'POST',
      url: '/api/lexicon/validate-batch',
      headers: { 'content-type': 'application/json' },
      payload: { words: new Array(501).fill('arcana') },
    });
    expect(tooManyWords.statusCode).toBe(400);
    expect(tooManyWords.json().error).toBe('Invalid request');
  });

  it('applies stricter per-session rate limits on batch routes', async () => {
    const jar = createCookieJar();
    await requestWithJar(app, jar, {
      method: 'GET',
      url: '/auth/csrf-token',
    });

    let hitRateLimit = false;
    for (let index = 0; index < 40; index += 1) {
      const response = await requestWithJar(app, jar, {
        method: 'POST',
        url: '/api/lexicon/lookup-batch',
        headers: { 'content-type': 'application/json' },
        payload: { words: ['arcana'] },
      });
      if (response.statusCode === 429) {
        hitRateLimit = true;
        break;
      }
    }
    expect(hitRateLimit).toBe(true);
  });
});
