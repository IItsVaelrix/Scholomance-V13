/**
 * WORDNET GRAPH LOADER — the I/O half of wordnet-distance
 *
 * Reads the lexical graph out of scholomance_dict.sqlite into the plain Maps
 * that codex/core/semantic/wordnet-distance.js consumes. The metric stays pure;
 * this file is the only part that touches a database.
 *
 * Measured on the shipped dictionary: 120,630 synsets, 304,764 relation rows,
 * 152,286 single-word lemmas. The whole graph loads in ~1.5s and is small
 * enough to hold resident, so it is built once and cached per path.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { RELATEDNESS_RELS } from '../../core/semantic/wordnet-distance.js';

const cache = new Map();

/** Shape returned when the DB has no wordnet tables — every lookup reads "unknown". */
function emptyGraph() {
  return {
    sensesOf: new Map(),
    hypernymsOf: new Map(),
    posOf: new Map(),
    headsOf: new Map(),
    antonymsOf: new Map(),
    /** adjective head synset -> the NOUN attribute it ranges over, when named. */
    attributeOf: new Map(),
    /** adjective head synset -> the lemmas gathered at that pole. */
    clusterMembers: new Map(),
    stats: { synsets: 0, lemmas: 0, edges: 0, available: false },
  };
}

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Build the graph. Returns an empty graph (never throws) when the tables are
 * absent, so a pre-migration DB degrades to "WordNet cannot answer" rather than
 * taking a page build down.
 *
 * @param {string} dbPath
 * @param {{ cached?: boolean }} [options]
 * @returns {import('../../core/semantic/wordnet-distance.js').WordnetGraph}
 */
export function loadWordnetGraph(dbPath, options = {}) {
  const useCache = options.cached !== false;
  if (useCache && cache.has(dbPath)) return cache.get(dbPath);
  if (!dbPath || !existsSync(dbPath)) return emptyGraph();

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch {
    return emptyGraph();
  }

  try {
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
    );
    if (!tables.has('wordnet_synset') || !tables.has('wordnet_lemma') || !tables.has('wordnet_rel')) {
      return emptyGraph();
    }

    const graph = emptyGraph();
    graph.stats.available = true;

    for (const row of db.prepare('SELECT id, pos FROM wordnet_synset').iterate()) {
      graph.posOf.set(row.id, row.pos);
    }

    for (const row of db.prepare(
      "SELECT lemma_lower AS w, synset_id AS s FROM wordnet_lemma WHERE lemma_lower NOT LIKE '% %'",
    ).iterate()) {
      push(graph.sensesOf, row.w, row.s);
    }

    const relatedness = new Set(RELATEDNESS_RELS);
    for (const row of db.prepare(
      'SELECT synset_id AS a, rel, target_synset_id AS b FROM wordnet_rel',
    ).iterate()) {
      if (row.rel === 'antonym') {
        push(graph.antonymsOf, row.a, row.b);
        continue;
      }
      /**
       * `attribute` names the NOUN dimension an adjective ranges over — "the
       * magnitude of sound" for loud/soft. It is the one place WordNet says
       * outright that a cluster has a vertical, which is what separates a scale
       * from a palette of alternatives. Only 562 of 14,716 heads carry one, so
       * it is precise rather than broad.
       */
      if (row.rel === 'attribute') {
        push(graph.attributeOf, row.a, row.b);
        continue;
      }
      if (!relatedness.has(row.rel)) continue;

      // Hypernym direction is kept ORIENTED: Wu-Palmer walks upward only, and
      // an undirected parent link would let it descend into siblings and report
      // a subsumer that subsumes neither word.
      if (row.rel === 'hypernym' || row.rel === 'instance_hypernym') {
        push(graph.hypernymsOf, row.a, row.b);
      } else if (row.rel === 'hyponym' || row.rel === 'instance_hyponym') {
        push(graph.hypernymsOf, row.b, row.a);
      } else if (row.rel === 'similar') {
        /**
         * SATELLITE -> HEAD, DIRECTED BY PART OF SPEECH.
         *
         * WordNet's adjective clusters have one head (pos 'a') and many
         * satellites (pos 's'), and the head IS the cluster's identity.
         * Pushing this edge both ways was a measured bug: for a head lemma like
         * `dark` or `cold`, whose own synset is the head, headsOf then returned
         * all sixteen satellites and each was treated as a cluster of its own.
         * `scalesOf('dark')` reported 25 clusters keyed on satellites such as
         * "dark and dismal as of the rivers Acheron", and the real
         * "devoid of or deficient in light" cluster never appeared at all.
         *
         * A head belongs to its own cluster, which is why it is registered
         * against itself — otherwise the most important member of every scale
         * is the one member missing from it.
         */
        const aIsHead = graph.posOf.get(row.a) === 'a';
        const bIsHead = graph.posOf.get(row.b) === 'a';
        if (aIsHead && !bIsHead) {
          push(graph.headsOf, row.b, row.a);
          push(graph.headsOf, row.a, row.a);
        } else if (bIsHead && !aIsHead) {
          push(graph.headsOf, row.a, row.b);
          push(graph.headsOf, row.b, row.b);
        }
        // Neither or both marked head: the edge does not name a cluster, and
        // guessing an orientation would invent membership.
      }

      /**
       * `relatedOf` used to be built here, both directions per edge: 112,139
       * keys and 460,072 entries. Measured 2026-08-14, it cost 29.5MB of a
       * 92.7MB graph and NOTHING read it — the only other mention in the tree
       * was a JSDoc @property. On a 1GB machine whose live working set is
       * ~224MB, that was 13% of resident memory serving documentation.
       *
       * If an undirected neighbour index is wanted again, derive it on demand
       * rather than materialising it for every synset at boot.
       */
      graph.stats.edges += 1;
    }

    /**
     * Cluster membership by LEMMA, resolved after both edges and senses are
     * loaded. scale-structure orders words, not synset ids, so the satellite →
     * head edges are joined back through the lemma table here rather than at
     * every call site.
     */
    for (const [word, senses] of graph.sensesOf) {
      for (const sense of senses) {
        for (const head of graph.headsOf.get(sense) || []) {
          let set = graph.clusterMembers.get(head);
          if (!set) { set = new Set(); graph.clusterMembers.set(head, set); }
          set.add(word);
        }
      }
    }

    graph.stats.synsets = graph.posOf.size;
    graph.stats.lemmas = graph.sensesOf.size;
    graph.stats.clusters = graph.clusterMembers.size;
    graph.stats.scales = graph.attributeOf.size;

    if (useCache) cache.set(dbPath, graph);
    return graph;
  } catch {
    return emptyGraph();
  } finally {
    try { db.close(); } catch { /* already closed */ }
  }
}

/** Drop the resident graph — used by tests and by a DB swap. */
export function clearWordnetGraphCache() {
  cache.clear();
}
