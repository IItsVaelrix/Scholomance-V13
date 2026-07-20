import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  analysisCacheKey,
  lexicalAnalyzeRoutes,
} from '../../codex/server/routes/lexicalAnalyze.routes.js';
import { resolveAnalysisContext } from '../../codex/core/lexical-analysis/context.js';

const versions = Object.freeze({
  morphologyVersion: 'LEMMA_FORM_v1',
  lexiconVersion: '2',
  embeddingKind: 'phonosemantic_mock',
  embeddingVersion: 'tq-js-v1',
  embeddingDimensions: 256,
  latticeMapVersion: 'candidate-lattice-v1',
  rankingFormulaVersion: 'LEMMA_RANK_v1',
});

function build(service, routeVersions = versions) {
  const app = Fastify();
  app.register(lexicalAnalyzeRoutes, {
    prefix: '/api/lexical',
    service,
    versions: routeVersions,
  });
  return app;
}

const payloads = [
  { scope: 'word', surface: 'saw' },
  { scope: 'selection', surface: 'saw', selection: 'I saw it' },
  { scope: 'line', surface: 'saw', containingLine: 'I saw it' },
  {
    scope: 'local',
    surface: 'saw',
    containingLine: 'I saw it',
    neighboringLines: ['before', 'after'],
  },
  { scope: 'document', surface: 'saw', documentContext: 'I saw it\nThen I left.' },
];

describe('POST /api/lexical/analyze', () => {
  it.each(payloads)('resolves and forwards the strict $scope context', async (contextInput) => {
    const analyze = vi.fn((context) => ({ context: {
      version: context.version,
      scope: context.scope,
      contextHash: context.contextHash,
    } }));
    const app = build({ analyze });
    const response = await app.inject({
      method: 'POST',
      url: '/api/lexical/analyze',
      payload: { context: contextInput },
    });

    expect(response.statusCode).toBe(200);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0]).toEqual(resolveAnalysisContext(contextInput));
    await app.close();
  });

  it.each([
    { context: { scope: 'word', surface: 'saw', documentContext: 'secret' } },
    { context: { scope: 'line', surface: 'saw', containingLine: '' } },
    {
      context: {
        scope: 'local',
        surface: 'saw',
        containingLine: 'line',
        neighboringLines: ['1', '2', '3', '4', '5'],
      },
    },
    { context: { scope: 'document', surface: 'saw', documentContext: 'x'.repeat(20_001) } },
    { query: 'legacy-unscoped-request' },
  ])('rejects invalid or scope-escalating payloads with PB VALUE', async (payload) => {
    const analyze = vi.fn();
    const app = build({ analyze });
    const response = await app.inject({
      method: 'POST',
      url: '/api/lexical/analyze',
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('PB-ERR-v1-VALUE');
    expect(analyze).not.toHaveBeenCalled();
    await app.close();
  });

  it('caches by server context hash and all engine versions', async () => {
    const analyze = vi.fn((context) => ({ contextHash: context.contextHash }));
    const app = build({ analyze });
    const request = {
      method: 'POST',
      url: '/api/lexical/analyze',
      payload: { context: { scope: 'line', surface: 'saw', containingLine: 'I saw it' } },
    };

    const first = await app.inject(request);
    const second = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(analyze).toHaveBeenCalledTimes(1);

    const context = resolveAnalysisContext(request.payload.context);
    expect(analysisCacheKey(context, versions)).not.toBe(analysisCacheKey(context, {
      ...versions,
      rankingFormulaVersion: 'LEMMA_RANK_v2',
    }));
    await app.close();
  });
});
