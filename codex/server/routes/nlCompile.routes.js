/**
 * Natural-Language → PixelBrain compile route.
 *
 * Wires the deterministic compile() spine (codex/core/pixelbrain/nl-compile.js)
 * to an HTTP boundary. Compilation runs server-side, where the phoneme engine
 * and NLU microprocessors are authoritative — the frontend consumes the
 * canonical packet + checksum rather than recomputing anything (COLOR_DRAGON).
 */

import { z } from 'zod';
import { compilePromptToAsset } from '../../core/pixelbrain/nl-compile.js';

const MAX_PROMPT_LENGTH = 2000;
const COMPILE_TIMEOUT_MS = 15_000;

const compileBodySchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_LENGTH),
  mode: z.enum(['live_fast', 'balanced', 'deep_truesight']).optional(),
});

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function nlCompileRoutes(fastify, _opts) {
  fastify.post('/api/pixelbrain/compile', {
    config: {
      rateLimit: { max: process.env.NODE_ENV === 'production' ? 30 : 300, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const parsed = compileBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Compile timeout: exceeded 15 seconds')), COMPILE_TIMEOUT_MS);
      });

      try {
        const result = await Promise.race([
          compilePromptToAsset(parsed.data.prompt, { mode: parsed.data.mode }),
          timeoutPromise,
        ]);
        reply.header('X-PixelBrain-Checksum', result.checksum);
        return {
          source: 'nl-compile',
          checksum: result.checksum,
          intent: result.intent,
          params: result.params,
          digest: result.digest,
          packet: result.packet,
        };
      } catch (error) {
        fastify.log?.error?.({ err: error }, '[NLCompileRoute] compile failed');
        return reply.status(500).send({ error: 'Compilation failed' });
      }
    },
  });
}
