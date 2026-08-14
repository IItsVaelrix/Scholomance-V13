import { buildConstellationPage } from '../services/constellationPage.service.js';

const MAX_QUERY_GRAPHEMES = 600;
/**
 * C0/C1 control characters, deliberately excluding the whitespace a pasted line
 * legitimately carries (U+0009-U+000D: tab, newline, CR).
 *
 * `no-control-regex` exists to catch control characters that got into a pattern
 * by accident. Here they are the SUBJECT of the pattern — matching them is the
 * whole job — so the rule is firing on the one case it was never meant to catch.
 * Disabled with its reason stated, the way the two sibling files in this feature
 * disable their own rules, rather than left as a standing error that makes
 * `npm run lint` red for everyone.
 */
// eslint-disable-next-line no-control-regex -- the control characters are the deny-list
const CONTROL_CHARS = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/;

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo,
 *   wordnetGraph?, corpusVectors?, scaleOrders? }} opts
 */
export async function constellationRoutes(fastify, opts) {
  /**
   * Corpus identity for the page bytecode (PDR §16): built once from the
   * corpus_meta table — books/tokens/window/rows identify the corpus content
   * deterministically (the `built` timestamp is excluded on purpose; it would
   * re-key every page on a rebuild with identical content). Absent corpus =>
   * null => 'corpus:off' inside the hash.
   */
  let corpusChecksum = null;
  try {
    const stats = opts.corpusVectors?.stats?.();
    if (stats?.available) {
      corpusChecksum = `corpus:${stats.books}:${stats.tokens}:${stats.window}:${stats.rows}`;
    }
  } catch {
    corpusChecksum = null;
  }

  const deps = {
    lexiconAdapter: opts.lexiconAdapter,
    rhymeQueryEngine: opts.rhymeQueryEngine,
    rhymeLexiconRepo: opts.rhymeLexiconRepo,
    corpusChecksum,
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
          // coalesce: concurrent identical queries share one in-flight analysis
          // (Runtime concern — the route only declares it, never implements it).
          { ...deps, phonologyReady: isPhonologyReady(), coalesce: true },
        );
        return packet;
      } catch (error) {
        fastify.log?.error?.({ err: error }, '[ConstellationRoute] page build failed');
        return reply.status(500).send({ error: 'constellation page build failed' });
      }
    },
  });
}
