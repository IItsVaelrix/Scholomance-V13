import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { constellationRoutes } from '../../codex/server/routes/constellation.routes.js';

const lexiconAdapter = {
  lookupWord: (w) => (w === 'morning' ? [{ pos: 'noun', senses: ['dawn'], source: 's' }] : []),
  extractGloss: (s) => s?.[0] || null,
  lookupSynonyms: () => [{ lemma: 'dawn' }],
  lookupAntonyms: () => [{ lemma: 'dusk' }],
};
const rhymeQueryEngine = {
  async query() {
    return {
      topMatches: [{ token: 'mourning', overallScore: 0.7 }],
      constellations: [{ dominantVowelFamily: ['AO'], dominantStressPattern: 'x /', members: ['warning'], cohesionScore: 0.5, densityScore: 0.4 }],
      diagnostics: { queryTimeMs: 1, cacheHit: false, candidateCount: 1 },
    };
  },
};
const rhymeLexiconRepo = { lookupNodeByNormalized: () => ({ phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'] }) };

async function buildApp() {
  const app = Fastify();
  await app.register(constellationRoutes, { lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo });
  await app.ready();
  return app;
}

describe('GET /api/constellation/page', () => {
  let app;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns a packet for a valid query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/constellation/page?query=morning' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.schema_id).toBe('scholomance/constellation-os-page-phase2');
    expect(body.rhymeAstrology.phonemes.length).toBeGreaterThan(0);
    expect(body.phraseGenome.syllables).toBe(2);
  });

  it('rejects an empty query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/constellation/page?query=' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an oversize query', async () => {
    const long = 'a'.repeat(601);
    const res = await app.inject({ method: 'GET', url: `/api/constellation/page?query=${long}` });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a query containing a control character', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/constellation/page?query=morning%01' });
    expect(res.statusCode).toBe(400);
  });
});

/**
 * Audit 2026-08-20: `getConstellationRuntimeStats` was exported and read by
 * nothing outside the test suite — telemetry written and never surfaced. The
 * runtime owns diagnostics (PDR), so the server has to offer them.
 */
describe('GET /api/constellation/runtime', () => {
  let app;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('reports the runtime counters', async () => {
    await app.inject({ method: 'GET', url: '/api/constellation/page?query=morning' });
    const res = await app.inject({ method: 'GET', url: '/api/constellation/runtime' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('constellation-runtime-1');
    expect(body.channelsRun).toBeGreaterThan(0);
    expect(typeof body.channelsDegraded).toBe('number');
    expect(typeof body.coalescedHits).toBe('number');
    expect(typeof body.inflightCoalesced).toBe('number');
  });

  it('carries no wall-clock, so it stays deterministic to read', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/constellation/runtime' });
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual([
      'channelsDegraded', 'channelsRun', 'coalescedHits', 'inflightCoalesced', 'version',
    ]);
  });
});
