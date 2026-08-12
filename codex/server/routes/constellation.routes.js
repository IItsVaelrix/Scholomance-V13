import { buildConstellationPage } from '../services/constellationPage.service.js';

const MAX_QUERY_GRAPHEMES = 600;
const CONTROL_CHARS = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/;

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo,
 *   wordnetGraph?, corpusVectors?, scaleOrders? }} opts
 */
export async function constellationRoutes(fastify, opts) {
  const deps = {
    lexiconAdapter: opts.lexiconAdapter,
    rhymeQueryEngine: opts.rhymeQueryEngine,
    rhymeLexiconRepo: opts.rhymeLexiconRepo,
    // Optional. Absent => leximancy looks up the surface form only, exactly as
    // it did before morphological expansion existed.
    lemmaAdapter: opts.lemmaAdapter ?? null,
    // Optional. Absent => the scaleField channel reports itself unavailable and
    // every other channel renders exactly as before.
    wordnetGraph: opts.wordnetGraph ?? null,
    corpusVectors: opts.corpusVectors ?? null,
    scaleOrders: opts.scaleOrders ?? null,
  };
  // Evaluated per request: cmudict finishes loading after the routes register.
  const isPhonologyReady = typeof opts.isPhonologyReady === 'function'
    ? opts.isPhonologyReady
    : () => false;

  fastify.get('/api/constellation/page', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const query = typeof request.query?.query === 'string' ? request.query.query : '';
      const trimmed = query.trim();
      if (!trimmed) {
        return reply.status(400).send({ error: 'query is required' });
      }
      if ([...query].length > MAX_QUERY_GRAPHEMES) {
        return reply.status(400).send({ error: 'query too long' });
      }
      if (CONTROL_CHARS.test(query)) {
        return reply.status(400).send({ error: 'query contains control characters' });
      }
      try {
        const packet = await buildConstellationPage(
          query,
          { ...deps, phonologyReady: isPhonologyReady() },
        );
        return packet;
      } catch (error) {
        fastify.log?.error?.({ err: error }, '[ConstellationRoute] page build failed');
        return reply.status(500).send({ error: 'constellation page build failed' });
      }
    },
  });
}
