import { z } from 'zod';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

const MAX_QUERY_LENGTH = 200; // max words
const DB_PATH = join(process.cwd(), 'oracle_memory.sqlite');

let turboQuantDB = null;
function getTurboQuantDB() {
  if (!turboQuantDB && existsSync(DB_PATH)) {
    try {
      turboQuantDB = new Database(DB_PATH, { readonly: true });
    } catch (err) {
      console.warn('[Oracle] Failed to mount TurboQuant Memory Cells:', err);
    }
  }
  return turboQuantDB;
}

const oracleQuerySchema = z.object({
  query: z.string().min(1).max(2000), // ~2000 chars covers 200 words safely
  telemetry: z.object({
    hhm: z.any().nullish(),
    tokenWeights: z.record(z.any()).nullish(),
    verseIR: z.any().nullish(),
    emotion: z.any().nullish()
  }).nullish()
});

/**
 * Parses user intent + telemetry and produces a conversational response.
 * (Local Heuristic NLP Engine - Zero API Cost)
 */
async function generateOracleDialogue(query, telemetry) {
  const queryWordCount = query.split(/\s+/).length;
  if (queryWordCount > MAX_QUERY_LENGTH) {
    throw new Error('Query exceeds 200 words.');
  }

  const queryLower = query.toLowerCase();

  // Extract CODEx Telemetry
  const emotionType = telemetry?.emotion?.primary || 'neutral';
  const syllableCount = telemetry?.verseIR?.metadata?.syllableCount || 0;

  // Basic NLP intent matching
  const wantsHelpWithRhythm = queryLower.includes('rhythm') || queryLower.includes('meter') || queryLower.includes('flow');
  const wantsHelpWithTone = queryLower.includes('tone') || queryLower.includes('feel') || queryLower.includes('heavy') || queryLower.includes('light');

  let responseText = '';

  // --- TURBOQUANT MEMORY CELL GENERATION ---
  const db = getTurboQuantDB();
  if (db) {
    try {
      // Find a seed word from the query
      const queryTokens = queryLower.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);

      let w1 = '__START1__';
      let w2 = '__START2__';

      // If we find a matching starting state in the DB with one of the user's words
      for (const token of queryTokens) {
        const row = db.prepare("SELECT w2 FROM memory_cells WHERE w1 = '__START2__' AND w2 = ? LIMIT 1").get(token);
        if (row) {
          w1 = '__START2__';
          w2 = token;
          break;
        }
      }

      const words = [];
      if (w2 !== '__START2__') words.push(w2);

      let safety = 0;
      while (safety < 30) {
        // Weighted random selection: Order by RANDOM() * weight
        const row = db.prepare("SELECT w3 FROM memory_cells WHERE w1 = ? AND w2 = ? ORDER BY RANDOM() * weight DESC LIMIT 1").get(w1, w2);

        if (!row || row.w3 === '__END__') break;

        words.push(row.w3);
        w1 = w2;
        w2 = row.w3;
        safety++;
      }

      if (words.length > 1) {
        // Capitalize first letter and add punctuation
        const sentence = words.join(' ');
        responseText = sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';

        // Add contextual prefix based on telemetry
        if (emotionType === 'aggressive') {
          responseText = "The archive burns: " + responseText;
        } else if (emotionType === 'melancholic') {
          responseText = "A sorrowful echo returns: " + responseText;
        }
      }
    } catch (err) {
      console.warn('[Oracle] TurboQuant generation failed, falling back to heuristic.', err);
    }
  }

  // --- HEURISTIC FALLBACK (If TurboQuant is missing or failed to generate) ---
  if (!responseText) {
    let responseParts = [];
    if (wantsHelpWithRhythm) {
      responseParts.push(`I hear the cadence of your query.`);
    } else if (wantsHelpWithTone) {
      responseParts.push(`The emotional resonance of your words is clear.`);
    } else {
      responseParts.push(`The archive receives your question.`);
    }

    if (emotionType === 'aggressive' || queryLower.includes('heavy')) {
      responseParts.push(`Your current verse burns with a heavy, aggressive current.`);
      if (wantsHelpWithTone) responseParts.push(`To soften this, seek words with elongated vowels and softer consonants.`);
    } else if (emotionType === 'melancholic' || queryLower.includes('sad')) {
      responseParts.push(`A sorrowful, flowing current runs through the phonetic structure you've built.`);
      if (wantsHelpWithRhythm) responseParts.push(`Consider breaking the meter to represent a sudden shift in this despair.`);
    } else {
      if (syllableCount > 50) {
        responseParts.push(`The verse is dense, carrying ${syllableCount} syllables of weight.`);
      } else if (syllableCount > 0) {
        responseParts.push(`The structure is sparse, leaving room for powerful phonetic anchors.`);
      } else {
        responseParts.push(`The mathematical shape of your verse is sound, but its soul remains hidden.`);
      }
    }

    responseParts.push(`Consider the forms below to anchor your next stanza.`);
    responseText = responseParts.join(' ');
  }

  // Simulated recommended tokens based on TF-IDF + Harkov weights
  const recommendedTokens = [];
  if (telemetry?.tokenWeights) {
    const sorted = Object.entries(telemetry.tokenWeights)
      .sort((a, b) => (b[1]?.document ?? 0) - (a[1]?.document ?? 0))
      .slice(0, 4);
    for (const [token] of sorted) {
      recommendedTokens.push(token);
    }
  }

  // Fallback tokens if no weights exist
  if (recommendedTokens.length === 0) {
    if (emotionType === 'aggressive') recommendedTokens.push('obsidian', 'fracture', 'iron');
    else if (emotionType === 'melancholic') recommendedTokens.push('hollow', 'drift', 'silence');
    else recommendedTokens.push('echo', 'resolve', 'bind');
  }

  return {
    responseText,
    recommendedTokens
  };
}

export async function oracleRoutes(fastify) {
  fastify.post('/query', {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const parsed = oracleQuerySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      try {
        const { query, telemetry } = parsed.data;
        const result = await generateOracleDialogue(query, telemetry);
        return { data: result };
      } catch (error) {
        return reply.status(500).send({
          error: 'Oracle divination failed',
          message: error.message
        });
      }
    },
  });
}
