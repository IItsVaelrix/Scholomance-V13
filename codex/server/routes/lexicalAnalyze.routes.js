// Submit-only poetic analysis over an explicit context envelope.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { resolveAnalysisContext } from '../../core/lexical-analysis/context.js';

const CACHE_TTL_MS = 5 * 60 * 1_000;
const CACHE_MAX = 500;

const surface = z.string().min(1).max(80);
const contextSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('word'),
    surface,
  }).strict(),
  z.object({
    scope: z.literal('selection'),
    surface,
    selection: z.string().min(1).max(1_000),
  }).strict(),
  z.object({
    scope: z.literal('line'),
    surface,
    containingLine: z.string().min(1).max(2_000),
  }).strict(),
  z.object({
    scope: z.literal('local'),
    surface,
    containingLine: z.string().min(1).max(2_000),
    neighboringLines: z.array(z.string().min(1).max(2_000)).min(1).max(4),
  }).strict(),
  z.object({
    scope: z.literal('document'),
    surface,
    documentContext: z.string().min(1).max(20_000),
  }).strict(),
]);
const bodySchema = z.object({ context: contextSchema }).strict();

export function analysisCacheKey(context, versions) {
  const material = JSON.stringify({
    contextHash: context.contextHash,
    morphologyVersion: versions.morphologyVersion,
    lexiconVersion: versions.lexiconVersion,
    embeddingKind: versions.embeddingKind,
    embeddingVersion: versions.embeddingVersion,
    embeddingDimensions: versions.embeddingDimensions,
    latticeMapVersion: versions.latticeMapVersion,
    rankingFormulaVersion: versions.rankingFormulaVersion,
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

export async function lexicalAnalyzeRoutes(fastify, opts) {
  const service = opts.service;
  const versions = Object.freeze({ ...opts.versions });
  const cache = new Map();

  fastify.post('/analyze', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'PB-ERR-v1-VALUE',
        message: 'Invalid Analyze context envelope.',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    let context;
    try {
      context = resolveAnalysisContext(parsed.data.context);
    } catch (error) {
      return reply.code(400).send({
        error: 'PB-ERR-v1-VALUE',
        message: error.message,
      });
    }

    const key = analysisCacheKey(context, versions);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.value;

    const result = await service.analyze(context);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { cachedAt: Date.now(), value: result });
    return result;
  });
}

export default lexicalAnalyzeRoutes;
