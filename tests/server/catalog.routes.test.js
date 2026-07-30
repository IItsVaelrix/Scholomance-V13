/* @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'node:fs';

describe('[Server] catalog routes integration', () => {
  let fastify;
  let userDbPath;

  beforeAll(async () => {
    const tempBase = path.join(os.tmpdir(), `scholomance-catalog-routes-${Date.now()}-${process.pid}`);
    userDbPath = `${tempBase}-user.sqlite`;
    process.env.USER_DB_PATH = userDbPath;
    delete process.env.TURSO_USER_DB_URL;
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_COLLAB_API = 'false';
    process.env.ENABLE_REDIS_SESSIONS = 'false';

    const mod = await import('../../codex/server/index.js?test=catalog-routes');
    fastify = mod.fastify;
    await fastify.ready();
  // Booting the real Fastify server runs DB migrations plus the world seed.
  // Measured ~6s alone; four of these suites boot concurrently, which exceeds
  // vitest's 10s default hookTimeout on a slower machine. Not contention --
  // each suite gets its own temp DB -- just genuinely more work than 10s.
  }, 60_000);

  afterAll(async () => {
    if (fastify) {
      await fastify.close();
    }
    try {
      const userPersistence = await import('../../codex/server/user.persistence.js');
      await userPersistence.userPersistence?.close?.();
    } catch {
      // ignore
    }

    if (userDbPath) {
      for (const suffix of ['', '-wal', '-shm']) {
        const candidate = `${userDbPath}${suffix}`;
        if (fs.existsSync(candidate)) {
          try { fs.rmSync(candidate, { force: true }); } catch { /* ignore */ }
        }
      }
    }
  });

  it('resolves track ID by streamUrl', async () => {
    const { catalogPersistence } = await import('../../codex/server/catalog.persistence.js');
    const { userPersistence } = await import('../../codex/server/user.persistence.js');

    const user = await userPersistence.users.createUser(
      'route_test_artist', 'route_test@example.com', 'pwd', null
    );
    const artist = await catalogPersistence.artists.create({
      userId: user.id,
      handle: 'route-test-artist',
      displayName: 'Route Test Artist',
    });
    const release = await catalogPersistence.releases.create({
      artistId: artist.id,
      slug: 'route-test-release',
      title: 'Route Test Release',
      visibility: 'public',
    });
    const track = await catalogPersistence.tracks.create({
      releaseId: release.id,
      position: 1,
      title: 'Route Test Track',
      streamUrl: 'https://test-cdn.local/track.mp3',
    });

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/catalog/tracks/resolve?streamUrl=${encodeURIComponent('https://test-cdn.local/track.mp3')}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ trackId: track.id });

    const resNotFound = await fastify.inject({
      method: 'GET',
      url: `/api/catalog/tracks/resolve?streamUrl=https://nonexistent.com`,
    });
    expect(resNotFound.statusCode).toBe(404);
  });
});
