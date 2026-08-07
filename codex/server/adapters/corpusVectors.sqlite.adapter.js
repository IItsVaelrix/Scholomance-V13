/**
 * CORPUS VECTOR LOADER — the I/O half of corpus-distance
 *
 * Reads PPMI rows out of adjective_corpus.sqlite (built by
 * scripts/build-adjective-corpus.mjs) into the sparse Maps that
 * codex/core/semantic/corpus-distance.js consumes.
 *
 * Loads lazily per word rather than resident, because the row set is far larger
 * than the WordNet graph and a page only ever touches a handful of words. The
 * per-word cache means a repeated query costs one Map lookup.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const handles = new Map();

function open(dbPath) {
  if (handles.has(dbPath)) return handles.get(dbPath);
  if (!dbPath || !existsSync(dbPath)) {
    handles.set(dbPath, null);
    return null;
  }
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
    );
    if (!tables.has('ppmi')) {
      db.close();
      handles.set(dbPath, null);
      return null;
    }
    handles.set(dbPath, db);
    return db;
  } catch {
    handles.set(dbPath, null);
    return null;
  }
}

/**
 * A lazily-populated vector store with the Map interface corpus-distance wants.
 *
 * `get(word)` returns a sparse Map<context, ppmi>, or undefined when the corpus
 * never observed the word — which the metric reads as "unobserved", never as
 * "unrelated".
 *
 * @param {string} dbPath
 * @returns {{ get(word: string): Map<string, number>|undefined, stats(): object }}
 */
export function createCorpusVectors(dbPath) {
  const db = open(dbPath);
  const cache = new Map();
  const stmt = db ? db.prepare('SELECT context, value FROM ppmi WHERE word = ?') : null;

  return {
    get(word) {
      const w = String(word || '').trim().toLowerCase();
      if (!w) return undefined;
      if (cache.has(w)) return cache.get(w);
      if (!stmt) { cache.set(w, undefined); return undefined; }

      const rows = stmt.all(w);
      const vec = rows.length ? new Map(rows.map((r) => [r.context, r.value])) : undefined;
      cache.set(w, vec);
      return vec;
    },
    stats() {
      if (!db) return { available: false };
      const meta = Object.fromEntries(
        db.prepare('SELECT key, value FROM corpus_meta').all().map((r) => [r.key, r.value]),
      );
      return { available: true, ...meta };
    },
  };
}

/**
 * The prebuilt per-scale orderings, head -> rows ordered by rank.
 *
 * Small enough to hold resident — 2,814 words across 423 scales — unlike the
 * PPMI table, which is 14.8M rows and stays on disk behind a per-word lookup.
 *
 * @returns {Map<string, Array<{word: string, rank: number, relative: number, span: number}>>}
 */
export function loadScaleOrders(dbPath) {
  const db = open(dbPath);
  const out = new Map();
  if (!db) return out;
  try {
    for (const r of db.prepare(
      'SELECT head, word, rank, relative, span FROM scale_order ORDER BY head, rank',
    ).iterate()) {
      let rows = out.get(r.head);
      if (!rows) { rows = []; out.set(r.head, rows); }
      rows.push({ word: r.word, rank: r.rank, relative: r.relative, span: r.span });
    }
  } catch {
    // Pre-migration corpus: no orderings, which reads as "no scale measured".
  }
  return out;
}

/** Close and forget every open handle — used by tests and by a corpus swap. */
export function closeCorpusVectors() {
  for (const db of handles.values()) {
    try { db?.close(); } catch { /* already closed */ }
  }
  handles.clear();
}
