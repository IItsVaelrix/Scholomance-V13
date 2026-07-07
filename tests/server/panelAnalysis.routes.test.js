import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { panelAnalysisRoutes } from '../../codex/server/routes/panelAnalysis.routes.js';

describe('[Server] panelAnalysis.routes', () => {
  async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(panelAnalysisRoutes);
    return app;
  }

  it('returns unified panel analysis payload', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: {
        text: [
          'Stars carve scars in silent skies',
          'Fires rise where desire replies',
        ].join('\n'),
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.source).toBe('server-analysis');
    expect(payload.data).toBeTruthy();
    expect(payload.data.scoreData).toBeTruthy();
    expect(typeof payload.data.scoreData.totalScore).toBe('number');
    expect(Array.isArray(payload.data.scoreData.traces)).toBe(true);
    expect(typeof payload.data.scoreData.traces[0]?.commentary).toBe('string');
    expect(Array.isArray(payload.data.analysis.rhymeGroups)).toBe(true);
    expect(Array.isArray(payload.data.scheme.groups)).toBe(true);
    expect(Array.isArray(payload.data.vowelSummary.families)).toBe(true);
    expect(Number(response.headers['x-analysis-duration-ms'])).toBeGreaterThanOrEqual(0);
    expect(Number(response.headers['x-analysis-cache-ttl-ms'])).toBeGreaterThan(0);
  });

  it('caches repeated requests in-memory', async () => {
    const app = await buildApp();
    const text = [
      'Ash and ember answer air',
      'Glass remembers every prayer',
    ].join('\n');

    const first = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: { text },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: { text },
    });

    await app.close();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(Number(first.headers['x-analysis-duration-ms'])).toBeGreaterThanOrEqual(0);
    expect(Number(second.headers['x-analysis-duration-ms'])).toBeGreaterThanOrEqual(0);
    expect(second.body).toBe(first.body);
  });

  it('rejects invalid body payload', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: {},
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload.error).toBe('Invalid request');
    expect(Array.isArray(payload.details)).toBe(true);
  });

  it('returns empty panel payload for empty text', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: { text: '' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.source).toBe('server-analysis');
    expect(payload.data.analysis).toBe(null);
    expect(payload.data.scheme).toBe(null);
    expect(payload.data.meter).toBe(null);
    expect(payload.data.scoreData).toBe(null);
    expect(Array.isArray(payload.data.literaryDevices)).toBe(true);
    expect(payload.data.emotion).toBe('Neutral');
    expect(payload.data.vowelSummary).toEqual({
      families: [],
      totalWords: 0,
      uniqueWords: 0,
    });
  });

  it('handles very long text payloads within max limit', async () => {
    const app = await buildApp();
    const longText = 'word '.repeat(10000).trim();

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: { text: longText },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.source).toBe('server-analysis');
    expect(payload.data).toBeTruthy();
    expect(payload.data.scoreData).toBeTruthy();
  }, 20000);

  it('includes syntax summary and connection syntax metadata when enabled', async () => {
    const previous = process.env.ENABLE_SYNTAX_RHYME_LAYER;
    process.env.ENABLE_SYNTAX_RHYME_LAYER = 'true';

    try {
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/analysis/panels',
        payload: {
          text: [
            'Silver light in lucid air',
            'Crimson night with answered prayer',
          ].join('\n'),
        },
      });

      await app.close();

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.data.analysis.syntaxSummary).toBeTruthy();
      expect(payload.data.analysis.syntaxSummary.tokenCount).toBeGreaterThan(0);
      const firstConnection = payload.data.analysis.allConnections[0];
      expect(firstConnection?.syntax).toBeTruthy();
      expect(typeof firstConnection?.syntax?.gate).toBe('string');
      expect(Array.isArray(firstConnection?.syntax?.reasons)).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.ENABLE_SYNTAX_RHYME_LAYER;
      } else {
        process.env.ENABLE_SYNTAX_RHYME_LAYER = previous;
      }
    }
  });

  it('closes panel analysis service when app shuts down', async () => {
    const close = vi.fn();
    const analyzePanels = vi.fn().mockResolvedValue({
      analysis: null,
      scheme: null,
      meter: null,
      literaryDevices: [],
      emotion: 'Neutral',
      scoreData: null,
      vowelSummary: {
        families: [],
        totalWords: 0,
        uniqueWords: 0,
      },
      rhymeAstrology: null,
    });

    const app = Fastify({ logger: false });
    await app.register(panelAnalysisRoutes, {
      panelAnalysisService: {
        analyzePanels,
        close,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis/panels',
      payload: { text: 'embers drift' },
    });

    expect(response.statusCode).toBe(200);
    expect(analyzePanels).toHaveBeenCalledTimes(1);

    await app.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
