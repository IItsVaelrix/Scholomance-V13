/**
 * Semantic Calculus — SHADOW CAPTURE route (PDR §14, Phase 5 guinea pig).
 *
 * "Shadow: compile+seal+deposit Theory/Clarify in logs without executing Do.
 *  Build the gold corpus from these real intents."
 *
 * This endpoint EXECUTES NOTHING. It appends one JSONL row per real intent, with
 * the route and selection state it was uttered in.
 *
 * WHY THE STATE MATTERS: the synthetic Phase 0.5 corpus scored kappa 0.159 partly
 * because it captured naked strings. "open it" is unlabelable without knowing what
 * "it" was — one annotator held the app state in his head and one did not. A real
 * intent arrives WITH its state, which is the only thing that makes the corpus
 * groundable. §8.3's "1,000 naturally phrased UI intents" is unlabelable as
 * specified, and this is the fix.
 *
 * Compilation happens OFFLINE (bench/semantic-calculus/compile-shadow.mjs), not
 * here — the sealed compiler is .ts and this server is .js under node 20, which
 * cannot load it. The frontend gets its live kind from kind.ts via Vite instead.
 */

import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const CAPTURE_PATH = resolve(process.cwd(), 'bench/semantic-calculus/corpus/shadow-intents.jsonl');
const MAX_UTTERANCE = 500;

/**
 * The captured row. `state` is the whole point — an utterance without it is the
 * mistake the synthetic corpus made.
 */
const captureSchema = z.object({
  utterance: z.string().min(1).max(MAX_UTTERANCE),
  state: z.object({
    route: z.string().max(200),
    selection: z.string().max(200).nullable().optional(),
    panel: z.string().max(200).nullable().optional(),
  }),
  /** What kind.ts said in the browser. Recorded to detect frontend/backend drift. */
  clientKind: z.enum(['Do', 'Clarify', 'Probe', 'Theory', 'Hypothesis']).optional(),
  clientLaw: z.enum(['allow', 'clarify', 'block', 'escalate']).optional(),
  /**
   * REV 7 / P6 — the epistemic axis, captured because kappa_warrant cannot be
   * measured from rows that never recorded a warrant. Capturing kind alone made
   * the corpus able to answer only one of the three questions, so a system that
   * classified well and justified badly would have looked healthy forever.
   *
   * Sealed field names mirror EpistemicState exactly. If they drift from
   * types.ts, the corpus stops describing the compiler that produced it.
   */
  clientEpistemic: z
    .object({
      gap: z.enum(['none', 'command', 'concept', 'procedure', 'required_slot', 'evidence']),
      method: z.enum(['bound', 'underspecified', 'absent']),
      warrantRequired: z.array(z.enum(['lexicon', 'model', 'observation', 'human', 'gene'])).max(5),
      warrantPresent: z.array(z.enum(['lexicon', 'model', 'observation', 'human', 'gene'])).max(5),
    })
    .optional(),
  clientPhase: z.enum(['atomic', 'plan', 'report']).optional(),
  /**
   * F21 — WHO spoke. A corpus that records only the text cannot tell a human
   * request from an agent proposal when it is replayed, and those are different
   * acts under law: the utterance is the outermost authority path, and 'derived'
   * is not a trusted partition.
   *
   * Absent = undeclared = untrusted. There is no default-trusted path here
   * either; an old row without provenance is a row that did not say.
   */
  utteranceTrust: z.enum(['user', 'derived', 'untrusted']).optional(),
  utteranceTaint: z.array(z.string().max(200)).max(20).optional(),
  /** Optional human verdict: did the compiler get it right? */
  verdict: z.enum(['correct', 'wrong', 'unsure']).optional(),
  /**
   * The IDEAL phenotype. A 'wrong' verdict without this is an observed phenotype
   * with no ideal to measure against — phenotypic error is ideal MINUS observed,
   * so a bare complaint cannot be scored.
   */
  expectedKind: z.enum(['Do', 'Clarify', 'Probe', 'Theory', 'Hypothesis']).optional(),
  /** The ideal on the epistemic axis. Same argument as expectedKind. */
  expectedGap: z
    .enum(['none', 'command', 'concept', 'procedure', 'required_slot', 'evidence'])
    .optional(),
  /** The bounded question, if it asked one. Recorded to judge the question itself. */
  question: z.string().max(400).optional(),
  unresolved: z.array(z.object({ slot: z.string(), reason: z.string(), raw: z.string() })).optional(),
});

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function semanticShadowRoutes(fastify, _opts) {
  // Flag-gated at the route level: with the flag off, the surface does not exist.
  if (process.env.ENABLE_SEMANTIC_CALCULUS !== '1') {
    fastify.log?.info?.('[semantic-shadow] disabled (ENABLE_SEMANTIC_CALCULUS != 1)');
    return;
  }

  fastify.post('/api/semantic-calculus/shadow', {
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const parsed = captureSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid capture', details: parsed.error.issues });
      }

      const row = {
        id: `sh-${randomUUID()}`,
        ...parsed.data,
        // Wall-clock is fine HERE: this is corpus metadata, not a sealed act body.
        // Nothing in this file feeds the determinism input list (§3.2).
        capturedAt: new Date().toISOString(),
      };

      try {
        await mkdir(dirname(CAPTURE_PATH), { recursive: true });
        await appendFile(CAPTURE_PATH, JSON.stringify(row) + '\n', 'utf8');
      } catch (err) {
        request.log?.error?.({ err }, '[semantic-shadow] capture write failed');
        return reply.status(500).send({ error: 'capture failed' });
      }

      // NOTHING EXECUTES. The response says so explicitly, so no caller can mistake
      // a shadow capture for an authorized act.
      return reply.send({ captured: true, id: row.id, executed: false });
    },
  });

  fastify.get('/api/semantic-calculus/shadow', {
    handler: async (_request, reply) => {
      if (!existsSync(CAPTURE_PATH)) return reply.send({ count: 0, rows: [] });
      const raw = await readFile(CAPTURE_PATH, 'utf8');
      const rows = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return reply.send({ count: rows.length, rows: rows.slice(-50) });
    },
  });
}
