import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLexicalGraph } from '../../codex/core/lexical-graph/migrate.js';
import { mirrorEntries } from '../../codex/core/lexical-graph/mirror.js';
import { canonicalizeLower } from '../../codex/core/lexical-graph/canonicalize.js';

function createFixtureDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE entry (
      id INTEGER PRIMARY KEY,
      headword TEXT NOT NULL,
      headword_lower TEXT NOT NULL,
      lang TEXT NOT NULL,
      pos TEXT,
      ipa TEXT,
      etymology TEXT,
      senses_json TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      embeddings_tq BLOB
    );

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url, embeddings_tq)
    VALUES (?, ?, ?, 'English', ?, ?, ?, ?, ?, ?, ?)
  `);

  // Two distinct entry rows sharing the same headword ("grief") — the mirror
  // must produce two distinct le:word:<id> graph nodes, not one merged node.
  insert.run(
    1,
    'Grief',
    'grief',
    'noun',
    'G R IY F',
    null,
    JSON.stringify([{ glosses: ['Deep sorrow, especially at a death'] }]),
    'oewn',
    'https://en-word.net/',
    Buffer.from([1, 2, 3, 4]),
  );
  insert.run(
    2,
    'Grief',
    'grief',
    'noun',
    'G R IY F',
    null,
    JSON.stringify([{ glosses: ['A cause of sorrow or annoyance'] }]),
    'oewn',
    'https://en-word.net/',
    null,
  );

  db.close();
}

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T01:00:00.000Z';

describe('[Server] lexicalGraph.mirror', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function openFixture() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-mirror-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const db = new Database(dbPath);
    migrateLexicalGraph(db, { timestamp: NOW });
    return db;
  }

  it('throws PB-ERR-v1-VALUE when caller timestamp is missing', () => {
    const db = openFixture();
    expect(() => mirrorEntries(db, {})).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => mirrorEntries(db)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => mirrorEntries(db, { timestamp: '   ' })).toThrow(/PB-ERR-v1-VALUE/);
    db.close();
  });

  it('mirrors two same-headword entries into two distinct le:word:<id> nodes', () => {
    const db = openFixture();
    const { mirrored } = mirrorEntries(db, { timestamp: NOW });
    expect(mirrored).toBe(2);

    const rows = db.prepare(`SELECT id, canonical_text, canonical_lower, entry_id FROM lexical_entry ORDER BY id`).all();
    expect(rows.map((r) => r.id)).toEqual(['le:word:1', 'le:word:2']);
    expect(rows[0].entry_id).toBe(1);
    expect(rows[1].entry_id).toBe(2);
    for (const row of rows) {
      expect(row.canonical_lower).toBe(canonicalizeLower('Grief'));
    }

    db.close();
  });

  it('omits unverified legacy embeddings.tq by default (no invented dimensions)', () => {
    const db = openFixture();
    mirrorEntries(db, { timestamp: NOW });

    // entry_id=1 has a blob, but no verified turboquant version/dimensions
    // exist in meta, so the copy must be omitted entirely — never invented.
    const row = db.prepare(`SELECT embeddings_tq, embedding_kind, embedding_version, embedding_dimensions, embedding_source FROM lexical_entry WHERE entry_id = 1`).get();
    expect(row.embeddings_tq).toBeNull();
    expect(row.embedding_kind).toBeNull();
    expect(row.embedding_version).toBeNull();
    expect(row.embedding_dimensions).toBeNull();
    expect(row.embedding_source).toBeNull();

    db.close();
  });

  it('copies the legacy blob only once a verified version + dimensions exist in meta', () => {
    const db = openFixture();
    db.prepare(`INSERT INTO meta(key, value) VALUES ('turboquant_embedding_version', 'tq-legacy-v1')`).run();
    db.prepare(`INSERT INTO meta(key, value) VALUES ('turboquant_embedding_dimensions', '4')`).run();

    mirrorEntries(db, { timestamp: NOW });

    const row = db.prepare(`SELECT embeddings_tq, embedding_kind, embedding_version, embedding_dimensions, embedding_source FROM lexical_entry WHERE entry_id = 1`).get();
    expect(row.embeddings_tq).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(row.embedding_kind).toBe('legacy_turboquant');
    expect(row.embedding_version).toBe('tq-legacy-v1');
    expect(row.embedding_dimensions).toBe(4);
    expect(row.embedding_source).toBe('copied_from_entry');

    const policyRow = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_legacy_embedding_policy'`).get();
    expect(policyRow.value).toBe('verified:tq-legacy-v1');

    db.close();
  });

  it('stamps lexical_graph_mirrored_at and lexical_graph_legacy_embedding_policy meta', () => {
    const db = openFixture();
    mirrorEntries(db, { timestamp: NOW });

    const mirroredAt = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_mirrored_at'`).get();
    expect(mirroredAt.value).toBe(NOW);

    const policy = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_legacy_embedding_policy'`).get();
    expect(policy.value).toBe('omit_unverified');

    db.close();
  });

  it('is idempotent across repeated mirrors and never writes partial embedding tuples', () => {
    const db = openFixture();
    mirrorEntries(db, { timestamp: NOW });
    const countAfterFirst = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry`).get().n;

    expect(() => mirrorEntries(db, { timestamp: LATER })).not.toThrow();
    const countAfterSecond = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry`).get().n;
    expect(countAfterSecond).toBe(countAfterFirst);

    const rows = db.prepare(`SELECT embeddings_tq, embedding_kind, embedding_version, embedding_dimensions, embedding_source FROM lexical_entry`).all();
    for (const row of rows) {
      const allNull = row.embeddings_tq === null
        && row.embedding_kind === null
        && row.embedding_version === null
        && row.embedding_dimensions === null
        && row.embedding_source === null;
      const allPresent = row.embeddings_tq !== null
        && row.embedding_kind !== null
        && row.embedding_version !== null
        && row.embedding_dimensions !== null
        && row.embedding_source !== null;
      expect(allNull || allPresent).toBe(true);
    }

    const mirroredAt = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_mirrored_at'`).get();
    expect(mirroredAt.value).toBe(LATER);

    db.close();
  });

  it('leaves entry rows unchanged', () => {
    const db = openFixture();
    const before = db.prepare(`SELECT * FROM entry ORDER BY id`).all();

    mirrorEntries(db, { timestamp: NOW });

    const after = db.prepare(`SELECT * FROM entry ORDER BY id`).all();
    expect(after).toEqual(before);

    db.close();
  });

  it('maps senses_json glosses into definitions_json as [{ text }]', () => {
    const db = openFixture();
    mirrorEntries(db, { timestamp: NOW });

    const row = db.prepare(`SELECT definitions_json FROM lexical_entry WHERE entry_id = 1`).get();
    expect(JSON.parse(row.definitions_json)).toEqual([{ text: 'Deep sorrow, especially at a death' }]);

    db.close();
  });

  it('syncs the FTS shadow row for each mirrored entry', () => {
    const db = openFixture();
    mirrorEntries(db, { timestamp: NOW });

    const map = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = 'le:word:1'`).get();
    expect(map).toBeTruthy();

    const fts = db.prepare(`SELECT canonical_text, content FROM lexical_entry_fts WHERE rowid = ?`).get(map.rowid);
    expect(fts.canonical_text).toBe('Grief');
    expect(fts.content).toContain('Deep sorrow');

    db.close();
  });
});
