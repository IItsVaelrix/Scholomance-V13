/* @vitest-environment node */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

function createCookieJar() {
  const cookies = new Map();

  return {
    capture(response) {
      const setCookieHeader = response.headers['set-cookie'];
      const values = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : (setCookieHeader ? [setCookieHeader] : []);

      for (const value of values) {
        if (typeof value !== 'string') continue;
        const pair = value.split(';', 1)[0];
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex <= 0) continue;
        const name = pair.slice(0, separatorIndex).trim();
        const cookieValue = pair.slice(separatorIndex + 1).trim();
        if (!name) continue;
        cookies.set(name, cookieValue);
      }
    },
    getCookieHeader() {
      if (cookies.size === 0) return '';
      return [...cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    },
  };
}

describe('[Server] index route integration', () => {
  let fastify;
  let userPersistence;
  let userDbPath;
  let collabDbPath;
  let audioStoragePath;
  let lexiconDbPath;
  let fetchMock;
  let originalFetch;
  const previousEnv = {};

  async function requestWithJar(cookieJar, options) {
    const headers = { ...(options.headers || {}) };
    const cookieHeader = cookieJar.getCookieHeader();
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
    const response = await fastify.inject({
      ...options,
      headers,
      payload,
    });
    cookieJar.capture(response);
    return response;
  }

  async function getCsrfToken(cookieJar) {
    const response = await requestWithJar(cookieJar, {
      method: 'GET',
      url: '/auth/csrf-token',
    });
    expect(response.statusCode).toBe(200);
    return response.json().token;
  }

  async function registerAndLogin(cookieJar, seed) {
    const normalizedSeed = String(seed).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-12);
    const username = `p3_${normalizedSeed}`;
    const email = `${username}@test.local`;
    const password = 'Password123!';

    const registerToken = await getCsrfToken(cookieJar);
    const registerResponse = await requestWithJar(cookieJar, {
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': registerToken,
      },
      payload: JSON.stringify({ 
        username, 
        email, 
        password,
        captchaId: 'test-id',
        captchaAnswer: 'test-answer'
      }),
    });
    expect(registerResponse.statusCode).toBe(201);

    const loginToken = await getCsrfToken(cookieJar);
    const loginResponse = await requestWithJar(cookieJar, {
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': loginToken,
      },
      payload: JSON.stringify({ username, password }),
    });
    expect(loginResponse.statusCode).toBe(200);
    return { username, email };
  }

  beforeAll(async () => {
    for (const key of [
      'USER_DB_PATH',
      'COLLAB_DB_PATH',
      'AUDIO_STORAGE_PATH',
      'NODE_ENV',
      'ENABLE_COLLAB_API',
      'ENABLE_REDIS_SESSIONS',
      'SCHOLOMANCE_DICT_API_URL',
      'SCHOLOMANCE_DICT_PATH',
    ]) {
      previousEnv[key] = process.env[key];
    }

    const tempBase = path.join(os.tmpdir(), `scholomance-index-integration-${Date.now()}-${process.pid}`);
    userDbPath = `${tempBase}-user.sqlite`;
    collabDbPath = `${tempBase}-collab.sqlite`;
    audioStoragePath = `${tempBase}-audio`;
    lexiconDbPath = `${tempBase}-missing-lexicon.sqlite`;
    mkdirSync(audioStoragePath, { recursive: true });
    process.env.USER_DB_PATH = userDbPath;
    process.env.COLLAB_DB_PATH = collabDbPath;
    process.env.AUDIO_STORAGE_PATH = audioStoragePath;
    process.env.SCHOLOMANCE_DICT_PATH = lexiconDbPath;
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_COLLAB_API = 'true';
    process.env.ENABLE_REDIS_SESSIONS = 'false';
    process.env.SCHOLOMANCE_DICT_API_URL = 'http://dict.local/api/lexicon';

    originalFetch = global.fetch;
    fetchMock = vi.fn(async (url) => {
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    global.fetch = fetchMock;

    const mod = await import('../../codex/server/index.js?test=index-route-integration');
    fastify = mod.fastify;
    userPersistence = (await import('../../codex/server/user.persistence.js')).persistence;
    await fastify.ready();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url) => {
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
  });

  afterAll(async () => {
    if (fastify) {
      await fastify.close();
    }
    try {
      const userPersistence = await import('../../codex/server/user.persistence.js');
      userPersistence.persistence?.close?.();
    } catch {
      // Best-effort cleanup
    }
    try {
      const collabPersistence = await import('../../codex/server/collab/collab.persistence.js');
      collabPersistence.collabPersistence?.close?.();
    } catch {
      // Best-effort cleanup
    }

    for (const basePath of [userDbPath, collabDbPath]) {
      if (!basePath) continue;
      for (const suffix of ['', '-wal', '-shm']) {
        const candidate = `${basePath}${suffix}`;
        if (existsSync(candidate)) {
          try {
            rmSync(candidate, { force: true });
          } catch {
            // Ignore cleanup errors in tests.
          }
        }
      }
    }

    if (audioStoragePath && existsSync(audioStoragePath)) {
      try {
        rmSync(audioStoragePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors in tests.
      }
    }

    for (const key of Object.keys(previousEnv)) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }

    if (originalFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/nonexistent',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({
      message: 'Route not found',
      path: '/api/nonexistent',
    });
  });

  it('requires a session for lexicon routes and allows guest-session access', async () => {
    const unauthorized = await fastify.inject({
      method: 'GET',
      url: '/api/lexicon/lookup/arcana',
    });
    expect(unauthorized.statusCode).toBe(401);

    const jar = createCookieJar();
    const csrfTokenResponse = await requestWithJar(jar, {
      method: 'GET',
      url: '/auth/csrf-token',
    });
    expect(csrfTokenResponse.statusCode).toBe(200);
    expect(typeof csrfTokenResponse.json().token).toBe('string');

    const lookupResponse = await requestWithJar(jar, {
      method: 'GET',
      url: '/api/lexicon/lookup/arcana',
    });
    expect(lookupResponse.statusCode).toBe(200);
    expect(lookupResponse.json()).toEqual({
      word: 'arcana',
      definition: null,
      entries: [],
      synonyms: [],
      antonyms: [],
      rhymes: [],
      rhymeFamily: null,
      lore: { seed: 'arcana' },
    });

    const batchResponse = await requestWithJar(jar, {
      method: 'POST',
      url: '/api/lexicon/lookup-batch',
      headers: { 'content-type': 'application/json' },
      payload: { words: ['arcana', 'banana'] },
    });
    expect(batchResponse.statusCode).toBe(200);
    expect(batchResponse.json()).toEqual({ families: {} });
  });

  it('supports auth, progression, and scroll routes end-to-end', async () => {
    const jar = createCookieJar();
    const seed = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const user = await registerAndLogin(jar, seed);

    const meResponse = await requestWithJar(jar, {
      method: 'GET',
      url: '/auth/me',
    });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().user.email).toBe(user.email);

    const progressionToken = await getCsrfToken(jar);
    const saveProgressionResponse = await requestWithJar(jar, {
      method: 'POST',
      url: '/api/progression',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': progressionToken,
      },
      payload: JSON.stringify({
        xp: 42,
        unlockedSchools: ['SONIC', 'VISUAL'],
      }),
    });
    expect(saveProgressionResponse.statusCode).toBe(200);
    expect(saveProgressionResponse.json().xp).toBe(42);

    const progressionResponse = await requestWithJar(jar, {
      method: 'GET',
      url: '/api/progression',
    });
    expect(progressionResponse.statusCode).toBe(200);
    expect(progressionResponse.json().xp).toBe(42);

    const scrollId = `phase3-scroll-${Date.now()}`;
    const saveScrollToken = await getCsrfToken(jar);
    const saveScrollResponse = await requestWithJar(jar, {
      method: 'POST',
      url: `/api/scrolls/${scrollId}`,
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': saveScrollToken,
      },
      payload: JSON.stringify({
        title: 'Phase 3 Scroll',
        content: 'Integration route coverage.',
      }),
    });
    expect(saveScrollResponse.statusCode).toBe(200);
    expect(saveScrollResponse.json().id).toBe(scrollId);

    const listScrollsResponse = await requestWithJar(jar, {
      method: 'GET',
      url: '/api/scrolls',
    });
    expect(listScrollsResponse.statusCode).toBe(200);
    expect(listScrollsResponse.json().some((scroll) => scroll.id === scrollId)).toBe(true);

    const deleteScrollToken = await getCsrfToken(jar);
    const deleteScrollResponse = await requestWithJar(jar, {
      method: 'DELETE',
      url: `/api/scrolls/${scrollId}`,
      headers: {
        'x-csrf-token': deleteScrollToken,
      },
    });
    expect(deleteScrollResponse.statusCode).toBe(200);
    expect(deleteScrollResponse.json()).toEqual({ ok: true });

    const resetProgressionToken = await getCsrfToken(jar);
    const resetProgressionResponse = await requestWithJar(jar, {
      method: 'DELETE',
      url: '/api/progression',
      headers: {
        'x-csrf-token': resetProgressionToken,
      },
    });
    expect(resetProgressionResponse.statusCode).toBe(200);
    expect(resetProgressionResponse.json().xp).toBe(0);
  });

  it('queues verification mail and can resend it for unverified accounts', async () => {
    const jar = createCookieJar();
    const seed = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const username = `mail_${seed.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-12)}`;
    const email = `${username}@test.local`;
    const password = 'Password123!';

    const registerToken = await getCsrfToken(jar);
    const registerResponse = await requestWithJar(jar, {
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': registerToken,
      },
      payload: JSON.stringify({
        username,
        email,
        password,
        captchaId: 'test-id',
        captchaAnswer: 'test-answer',
      }),
    });
    expect(registerResponse.statusCode).toBe(201);

    const initialUser = await userPersistence.users.findByEmail(email);
    const initialToken = initialUser.verificationToken;
    const initialMessages = await userPersistence.mail.getAll({ statuses: ['queued'] });
    const verificationMessages = initialMessages.filter((message) => message.recipient === email && message.templateKey === 'verify-email');
    expect(verificationMessages).toHaveLength(1);

    const resendToken = await getCsrfToken(jar);
    const resendResponse = await requestWithJar(jar, {
      method: 'POST',
      url: '/auth/resend-verification',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': resendToken,
      },
      payload: JSON.stringify({ email }),
    });
    expect(resendResponse.statusCode).toBe(200);

    const updatedUser = await userPersistence.users.findByEmail(email);
    expect(updatedUser.verificationToken).not.toBe(initialToken);
    const updatedMessages = await userPersistence.mail.getAll({ statuses: ['queued'] });
    const resentMessages = updatedMessages.filter((message) => message.recipient === email && message.templateKey === 'verify-email');
    expect(resentMessages).toHaveLength(2);
  });

  it('queues password reset mail and accepts the reset token', async () => {
    const jar = createCookieJar();
    const seed = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const user = await registerAndLogin(jar, seed);
    const persistedUser = await userPersistence.users.findByEmail(user.email);
    await userPersistence.users.verifyUser(persistedUser.id);

    const forgotToken = await getCsrfToken(jar);
    const forgotResponse = await requestWithJar(jar, {
      method: 'POST',
      url: '/auth/forgot-password',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': forgotToken,
      },
      payload: JSON.stringify({ email: user.email }),
    });
    expect(forgotResponse.statusCode).toBe(200);

    const queuedMessages = await userPersistence.mail.getAll({ statuses: ['queued'] });
    const queuedReset = queuedMessages.find((message) => message.recipient === user.email && message.templateKey === 'password-reset');
    expect(queuedReset).toBeTruthy();

    const resetUrlMatch = queuedReset.textBody.match(/https?:\/\/\S+/);
    expect(resetUrlMatch).toBeTruthy();
    const resetUrl = new URL(resetUrlMatch[0]);
    const resetPasswordToken = resetUrl.searchParams.get('token');
    expect(typeof resetPasswordToken).toBe('string');
    expect(resetPasswordToken.length).toBeGreaterThan(20);

    const resetCsrfToken = await getCsrfToken(jar);
    const newPassword = 'ResetPassword123!';
    const resetResponse = await requestWithJar(jar, {
      method: 'POST',
      url: '/auth/reset-password',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': resetCsrfToken,
      },
      payload: JSON.stringify({
        token: resetPasswordToken,
        password: newPassword,
      }),
    });
    expect(resetResponse.statusCode).toBe(200);

    const loginJar = createCookieJar();
    const loginCsrfToken = await getCsrfToken(loginJar);
    const loginResponse = await requestWithJar(loginJar, {
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': loginCsrfToken,
      },
      payload: JSON.stringify({
        username: user.username,
        password: newPassword,
      }),
    });
    expect(loginResponse.statusCode).toBe(200);
  });

  it('enforces collab auth and allows authenticated collab status access', async () => {
    const unauthenticatedResponse = await fastify.inject({
      method: 'GET',
      url: '/collab/status',
    });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const jar = createCookieJar();
    const seed = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    await registerAndLogin(jar, seed);

    const authenticatedResponse = await requestWithJar(jar, {
      method: 'GET',
      url: '/collab/status',
    });
    expect(authenticatedResponse.statusCode).toBe(200);
    const payload = authenticatedResponse.json();
    expect(payload).toHaveProperty('online_agents');
    expect(payload).toHaveProperty('total_tasks');
    expect(payload).toHaveProperty('running_pipelines');
  });

  it('supports upload routes and tracks upload failures', async () => {
    const missingFileResponse = await fastify.inject({
      method: 'POST',
      url: '/api/upload',
    });
    expect(missingFileResponse.statusCode).toBe(400);
    expect(missingFileResponse.json()).toEqual({ message: 'No file' });

    const boundary = '----phase3-upload-boundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="phase3-track.mp3"',
      'Content-Type: audio/mpeg',
      '',
      'FAKEAUDIO',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const uploadResponse = await fastify.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(uploadResponse.statusCode).toBe(200);
    expect(uploadResponse.json().filename).toBe('phase3-track.mp3');

    const listResponse = await fastify.inject({
      method: 'GET',
      url: '/api/audio-files',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().some((file) => file.name === 'phase3-track.mp3')).toBe(true);
  });

  it('exposes live/ready health and metrics with word-lookup counters', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === 'http://dict.local/api/lexicon/lookup/arcana') {
        return {
          ok: true,
          async json() {
            return {
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
              lore: null,
            };
          },
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });

    const liveResponse = await fastify.inject({
      method: 'GET',
      url: '/health/live',
    });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.json().status).toBe('live');

    const readyResponse = await fastify.inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json().ready).toBe(true);

    const lookupResponse = await fastify.inject({
      method: 'GET',
      url: '/api/word-lookup/arcana',
    });
    expect(lookupResponse.statusCode).toBe(200);
    expect(lookupResponse.json().source).toBe('scholomance-merged');

    const metricsJar = createCookieJar();
    await registerAndLogin(metricsJar, `metrics_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    const metricsResponse = await requestWithJar(metricsJar, {
      method: 'GET',
      url: '/metrics',
    });
    expect(metricsResponse.statusCode).toBe(200);
    const metrics = metricsResponse.json();
    expect(metrics.readiness.ready).toBe(true);
    expect(metrics.counters).toMatchObject({
      authFailures: expect.any(Number),
      rateLimitHits: expect.any(Number),
      wordLookupRequests: expect.any(Number),
      wordLookupCacheHits: expect.any(Number),
      wordLookupCacheHitRatio: expect.any(Number),
      uploadFailures: expect.any(Number),
    });
    expect(metrics.counters.wordLookupRequests).toBeGreaterThan(0);
  });
});
