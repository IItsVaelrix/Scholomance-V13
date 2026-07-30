/* @vitest-environment node */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';

describe('[Server] audio routes integration', () => {
  let fastify;
  let userDbPath;
  let collabDbPath;
  let audioStoragePath;
  let fetchMock;
  let originalFetch;
  const previousEnv = {};
  const ADMIN_TOKEN = 'test-audio-admin-token-1234';

  function audioAdminHeaders() {
    return { 'x-audio-admin-token': ADMIN_TOKEN };
  }

  beforeAll(async () => {
    for (const key of [
      'USER_DB_PATH',
      'COLLAB_DB_PATH',
      'AUDIO_STORAGE_PATH',
      'AUDIO_ADMIN_TOKEN',
      'NODE_ENV',
      'ENABLE_COLLAB_API',
      'ENABLE_REDIS_SESSIONS',
      'SCHOLOMANCE_DICT_API_URL',
    ]) {
      previousEnv[key] = process.env[key];
    }

    const tempBase = path.join(os.tmpdir(), `scholomance-audio-routes-${Date.now()}-${process.pid}`);
    userDbPath = `${tempBase}-user.sqlite`;
    collabDbPath = `${tempBase}-collab.sqlite`;
    audioStoragePath = `${tempBase}-audio`;
    mkdirSync(audioStoragePath, { recursive: true });
    process.env.USER_DB_PATH = userDbPath;
    process.env.COLLAB_DB_PATH = collabDbPath;
    process.env.AUDIO_STORAGE_PATH = audioStoragePath;
    process.env.AUDIO_ADMIN_TOKEN = ADMIN_TOKEN;
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_COLLAB_API = 'false';
    process.env.ENABLE_REDIS_SESSIONS = 'false';
    process.env.SCHOLOMANCE_DICT_API_URL = 'http://dict.local/api/lexicon';

    originalFetch = global.fetch;
    fetchMock = vi.fn(async (url) => {
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    global.fetch = fetchMock;

    const mod = await import('../../codex/server/index.js?test=audio-routes-integration');
    fastify = mod.fastify;
    await fastify.ready();
  // Booting the real Fastify server runs DB migrations plus the world seed.
  // Measured ~6s alone; four of these suites boot concurrently, which exceeds
  // vitest's 10s default hookTimeout on a slower machine. Not contention --
  // each suite gets its own temp DB -- just genuinely more work than 10s.
  }, 60_000);

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url) => {
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });

    // Clean up audio directory between tests
    for (const file of readdirSync(audioStoragePath)) {
      rmSync(path.join(audioStoragePath, file), { force: true });
    }
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
      const collabMod = await import('../../codex/server/collab/collab.persistence.js');
      collabMod.collabPersistence?.close?.();
    } catch {
      // Best-effort cleanup
    }

    for (const basePath of [userDbPath, collabDbPath]) {
      if (!basePath) continue;
      for (const suffix of ['', '-wal', '-shm']) {
        const candidate = `${basePath}${suffix}`;
        if (existsSync(candidate)) {
          try { rmSync(candidate, { force: true }); } catch { /* ignore */ }
        }
      }
    }

    if (audioStoragePath && existsSync(audioStoragePath)) {
      try { rmSync(audioStoragePath, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    global.fetch = originalFetch;
  });

  // -- GET /api/audio-files --

  describe('GET /api/audio-files', () => {
    it('rejects requests without admin token', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/api/audio-files' });
      expect(res.statusCode).toBe(401);
      expect(res.json().reason).toBe('missing_admin_token');
    });

    it('rejects requests with wrong admin token', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/audio-files',
        headers: { 'x-audio-admin-token': 'wrong' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().reason).toBe('invalid_admin_token');
    });

    it('returns empty array when no files exist', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/audio-files',
        headers: audioAdminHeaders(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('returns file metadata including size and uploadedAt', async () => {
      writeFileSync(path.join(audioStoragePath, 'track.mp3'), Buffer.alloc(1024));

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/audio-files',
        headers: audioAdminHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const files = res.json();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('track.mp3');
      expect(files[0].url).toBe('/audio/track.mp3');
      expect(files[0].size).toBe(1024);
      expect(typeof files[0].uploadedAt).toBe('string');
    });

    it('filters non-audio files from listing', async () => {
      writeFileSync(path.join(audioStoragePath, 'track.mp3'), Buffer.alloc(100));
      writeFileSync(path.join(audioStoragePath, 'readme.txt'), 'hello');
      writeFileSync(path.join(audioStoragePath, 'data.json'), '{}');

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/audio-files',
        headers: audioAdminHeaders(),
      });
      const files = res.json();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('track.mp3');
    });
  });

  // -- DELETE /api/audio-files/:filename --

  describe('DELETE /api/audio-files/:filename', () => {
    it('rejects requests without admin token', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/audio-files/track.mp3',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid filename', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/audio-files/not-audio.txt',
        headers: audioAdminHeaders(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Invalid filename');
    });

    it('returns 400 for path traversal attempts', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/audio-files/..%2F..%2Fpasswd.mp3',
        headers: audioAdminHeaders(),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent file', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/audio-files/missing.mp3',
        headers: audioAdminHeaders(),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('File not found');
    });

    it('deletes an existing audio file', async () => {
      const filePath = path.join(audioStoragePath, 'to_delete.mp3');
      writeFileSync(filePath, Buffer.alloc(512));
      expect(existsSync(filePath)).toBe(true);

      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/audio-files/to_delete.mp3',
        headers: audioAdminHeaders(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'Deleted', filename: 'to_delete.mp3' });
      expect(existsSync(filePath)).toBe(false);
    });
  });

  // -- PATCH /api/audio-files/:filename --

  describe('PATCH /api/audio-files/:filename', () => {
    it('rejects requests without admin token', async () => {
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/audio-files/track.mp3',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'renamed.mp3' }),
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid source filename', async () => {
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/audio-files/bad.txt',
        headers: { ...audioAdminHeaders(), 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'renamed.mp3' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when name is missing from body', async () => {
      writeFileSync(path.join(audioStoragePath, 'source.mp3'), Buffer.alloc(100));
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/audio-files/source.mp3',
        headers: { ...audioAdminHeaders(), 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing new name');
    });

    it('returns 404 when source file does not exist', async () => {
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/audio-files/ghost.mp3',
        headers: { ...audioAdminHeaders(), 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'new.mp3' }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 when target filename already exists', async () => {
      writeFileSync(path.join(audioStoragePath, 'a.mp3'), Buffer.alloc(100));
      writeFileSync(path.join(audioStoragePath, 'b.mp3'), Buffer.alloc(100));

      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/audio-files/a.mp3',
        headers: { ...audioAdminHeaders(), 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'b.mp3' }),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toBe('Target filename already exists');
    });

    it('renames an existing audio file', async () => {
      const sourcePath = path.join(audioStoragePath, 'old_name.mp3');
      const destPath = path.join(audioStoragePath, 'new_name.mp3');
      writeFileSync(sourcePath, Buffer.alloc(256));

      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/audio-files/old_name.mp3',
        headers: { ...audioAdminHeaders(), 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'New Name.mp3' }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toBe('Renamed');
      expect(body.oldFilename).toBe('old_name.mp3');
      expect(body.filename).toBe('new_name.mp3');
      expect(body.url).toBe('/audio/new_name.mp3');
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);
    });
  });

  // -- POST /api/upload (duplicate detection) --

  describe('POST /api/upload (duplicate detection)', () => {
    it('rejects upload when file already exists', async () => {
      writeFileSync(path.join(audioStoragePath, 'existing.mp3'), Buffer.alloc(100));

      const boundary = '----vitest-boundary';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="existing.mp3"',
        'Content-Type: audio/mpeg',
        '',
        'fake audio data',
        `--${boundary}--`,
      ].join('\r\n');

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/upload',
        headers: {
          ...audioAdminHeaders(),
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toBe('File already exists');
      expect(res.json().filename).toBe('existing.mp3');
    });
  });
});
