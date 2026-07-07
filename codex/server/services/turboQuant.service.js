import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

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

// Simple seeded PRNG for pseudo-deterministic sequence generation
function seededRandom(seed) {
  let h = 0xdeadbeef;
  for(let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function generateSentenceFromSeed(queryTokens) {
  const db = getTurboQuantDB();
  if (!db) return null;

  try {
    let w1 = '__START1__';
    let w2 = '__START2__';

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
    // Create a deterministic RNG seeded by the query tokens
    const random = seededRandom(queryTokens.join('-'));

    while (safety < 30) {
      // Fetch all possible next words to perform deterministic weighted random
      const rows = db.prepare("SELECT w3, weight FROM memory_cells WHERE w1 = ? AND w2 = ? ORDER BY w3 ASC").all(w1, w2);

      if (!rows || rows.length === 0) break;

      // Determine the next word deterministically
      let totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
      let randVal = random() * totalWeight;
      let nextWord = null;
      for (const row of rows) {
        randVal -= row.weight;
        if (randVal <= 0) {
          nextWord = row.w3;
          break;
        }
      }

      if (!nextWord || nextWord === '__END__') break;

      words.push(nextWord);
      w1 = w2;
      w2 = nextWord;
      safety++;
    }

    if (words.length > 1) {
      const sentence = words.join(' ');
      return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
    }
  } catch (err) {
    console.warn('[Oracle] TurboQuant generation failed.', err);
  }

  return null;
}
