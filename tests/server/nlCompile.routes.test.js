import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { nlCompileRoutes } from '../../codex/server/routes/nlCompile.routes.js';

describe('[Server] nlCompile.routes', () => {
  async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(nlCompileRoutes);
    return app;
  }

  it('compiles a prompt into a checksummed asset packet', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pixelbrain/compile',
      payload: { prompt: 'a heroic golden sword' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('nl-compile');
    expect(body.checksum).toMatch(/^[0-9A-F]{8}$/);
    expect(res.headers['x-pixelbrain-checksum']).toBe(body.checksum);
    expect(body.packet).toBeDefined();
    await app.close();
  });

  it('is deterministic across requests (same prompt → same checksum)', async () => {
    const app = await buildApp();
    const post = () => app.inject({ method: 'POST', url: '/api/pixelbrain/compile', payload: { prompt: 'a dark fierce blade' } });
    const a = (await post()).json();
    const b = (await post()).json();
    expect(a.checksum).toBe(b.checksum);
    await app.close();
  });

  it('rejects an empty prompt with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/pixelbrain/compile', payload: { prompt: '' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
