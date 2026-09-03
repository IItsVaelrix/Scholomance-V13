import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

describe('[Server] character catalog routes', () => {
  let userPersistence;
  let characterCatalogRoutes;
  let app;
  let dbPath;
  let testUser;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `character_catalog_routes_test_${Date.now()}.sqlite`);
    process.env.USER_DB_PATH = dbPath;
    delete process.env.TURSO_USER_DB_URL;

    ({ userPersistence } = await import('../../../codex/server/user.persistence.js'));
    ({ characterCatalogRoutes } = await import('../../../codex/server/routes/characterCatalog.routes.js'));

    testUser = await userPersistence.users.createUser(
      'route_user', 'route@example.com', 'hash', 'verify-tok'
    );

    app = Fastify();
    app.decorateRequest('session', null);
    app.addHook('onRequest', (request, _reply, done) => {
      request.session = { user: { id: testUser.id } };
      done();
    });
    await app.register(characterCatalogRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    try { userPersistence?.close?.(); } catch { /* already closed */ }
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch { /* not present */ }
    }
  });

  it('GET returns an empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/character/catalog' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, characters: [] });
  });

  it('POST saves a character', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/character/catalog',
      payload: {
        id: 'char_route_1',
        name: 'Test Character',
        controls: { seed: 42 },
        specJson: '{"contract":"CHARACTER-SPEC-v1"}',
        specHash: 'hash1',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().character.name).toBe('Test Character');
  });

  it('POST rejects an invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/character/catalog',
      payload: { id: '', name: '', specJson: '', specHash: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE removes the character', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/character/catalog/char_route_1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    const list = await app.inject({ method: 'GET', url: '/api/character/catalog' });
    expect(list.json().characters).toEqual([]);
  });

  it('DELETE on a missing id returns 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/character/catalog/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
