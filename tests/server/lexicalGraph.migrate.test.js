import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLexicalGraph } from '../../codex/core/lexical-graph/migrate.js';
import { LEXICAL_GRAPH_SCHEMA_VERSION } from '../../codex/core/lexical-graph/types.js';

const OVERLAY_TABLES = [
  'lexical_entry',
  'lexical_relation',
  'literary_device',
  'lexical_entry_fts_map',
  'lemma_form',
];

const LEMMA_MANIFEST_KEYS = [
  'lemma_form_version',
  'lemma_form_status',
  'lemma_form_source_digest',
  'lemma_form_expected_lemma_count',
  'lemma_form_indexed_lemma_count',
];

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

  const entries = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url)
    VALUES (?, ?, ?, 'English', ?, ?, ?, ?, ?, ?)
  `);
  entries.run(
    1,
    'Arcana',
    'arcana',
    'noun',
    'AA R K AA N AH',
    null,
    JSON.stringify([{ glosses: ['Secret knowledge'] }]),
    'oewn',
    'https://en-word.net/',
  );
  entries.run(
    2,
    'Banana',
    'banana',
    'noun',
    'B AH N AE N AH',
    null,
    JSON.stringify([{ glosses: ['A yellow fruit'] }]),
    'oewn',
    'https://en-word.net/',
  );

  db.close();
}

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T01:00:00.000Z';

describe('[Server] lexicalGraph.migrate', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function openFixture() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-migrate-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    return new Database(dbPath);
  }

  it('throws PB-ERR-v1-VALUE when caller timestamp is missing', () => {
    const db = openFixture();
    expect(() => migrateLexicalGraph(db, {})).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => migrateLexicalGraph(db)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => migrateLexicalGraph(db, { timestamp: '   ' })).toThrow(/PB-ERR-v1-VALUE/);
    db.close();
  });

  it('creates overlay tables and FTS5 virtual table without touching entry rows', () => {
    const db = openFixture();
    const before = db.prepare('SELECT COUNT(*) AS n FROM entry').get().n;

    migrateLexicalGraph(db, { timestamp: NOW });

    const tableNames = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${OVERLAY_TABLES.map(() => '?').join(',')})`)
      .all(...OVERLAY_TABLES)
      .map((row) => row.name)
      .sort();
    expect(tableNames).toEqual([...OVERLAY_TABLES].sort());

    const ftsTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lexical_entry_fts'`)
      .get();
    expect(ftsTable).toBeTruthy();

    const after = db.prepare('SELECT COUNT(*) AS n FROM entry').get().n;
    expect(after).toBe(before);

    const headwords = db.prepare('SELECT headword FROM entry ORDER BY id').all().map((row) => row.headword);
    expect(headwords).toEqual(['Arcana', 'Banana']);

    db.close();
  });

  it('stamps meta lexical_graph_schema_version', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    const row = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_schema_version'`).get();
    expect(row.value).toBe(LEXICAL_GRAPH_SCHEMA_VERSION);

    db.close();
  });

  it('creates a multi-candidate lemma relation without claiming a built manifest', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    const insert = db.prepare(`
      INSERT INTO lemma_form (
        surface_lower, lemma_lower, pos, transform_id, source,
        irregular, morphological_confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const ax = ['axes', 'ax', 'noun', 'noun.plural.x_to_es', 'LEMMA_FORM_v1', 0, 0.85];
    expect(() => insert.run(...ax)).not.toThrow();
    expect(() => insert.run(...ax)).toThrow();
    expect(() => insert.run(
      'axes', 'axis', 'noun', 'noun.plural.is_to_es', 'LEMMA_FORM_v1', 0, 0.85,
    )).not.toThrow();

    const candidates = db.prepare(`
      SELECT lemma_lower, pos FROM lemma_form
      WHERE surface_lower = 'axes'
      ORDER BY lemma_lower, pos
    `).all();
    expect(candidates).toEqual([
      { lemma_lower: 'ax', pos: 'noun' },
      { lemma_lower: 'axis', pos: 'noun' },
    ]);

    const manifest = db.prepare(`
      SELECT key FROM meta
      WHERE key IN (${LEMMA_MANIFEST_KEYS.map(() => '?').join(',')})
    `).all(...LEMMA_MANIFEST_KEYS);
    expect(manifest).toEqual([]);

    db.close();
  });

  it('is idempotent across repeated migrations', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });
    expect(() => migrateLexicalGraph(db, { timestamp: LATER })).not.toThrow();

    const row = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_schema_version'`).get();
    expect(row.value).toBe(LEXICAL_GRAPH_SCHEMA_VERSION);

    const tableCount = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'lexical_entry'`)
      .get().n;
    expect(tableCount).toBe(1);

    db.close();
  });

  it('rejects a partial embedding tuple via the all-or-nothing CHECK', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    const insertPartial = db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, embeddings_tq, embedding_kind,
        created_at, updated_at
      ) VALUES (
        'le:word:1', 'word', 'Arcana', 'arcana', 1,
        '[]', '[]', ?, NULL,
        ?, ?
      )
    `);
    expect(() => insertPartial.run(Buffer.from([1, 2, 3]), NOW, NOW)).toThrow();

    const insertComplete = db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, embeddings_tq, embedding_kind,
        embedding_version, embedding_dimensions, embedding_source,
        created_at, updated_at
      ) VALUES (
        'le:word:2', 'word', 'Banana', 'banana', 2,
        '[]', '[]', ?, 'legacy_turboquant',
        'unknown', 256, 'copied_from_entry',
        ?, ?
      )
    `);
    expect(() => insertComplete.run(Buffer.from([1, 2, 3]), NOW, NOW)).not.toThrow();

    db.close();
  });

  it('rejects definitions_json object masquerading as an array', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    const insert = db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json,
        created_at, updated_at
      ) VALUES (
        'le:word:1', 'word', 'Arcana', 'arcana', 1,
        ?, '[]',
        ?, ?
      )
    `);
    expect(() => insert.run('{}', NOW, NOW)).toThrow();
    expect(() => insert.run('[]', NOW, NOW)).not.toThrow();

    db.close();
  });

  it('rejects emotional_profile_json array masquerading as an object', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    const insert = db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, emotional_profile_json,
        created_at, updated_at
      ) VALUES (
        'le:word:1', 'word', 'Arcana', 'arcana', 1,
        '[]', '[]', ?,
        ?, ?
      )
    `);
    expect(() => insert.run('[]', NOW, NOW)).toThrow();
    expect(() => insert.run('{}', NOW, NOW)).not.toThrow();

    db.close();
  });

  it('enforces the type/entry_id coupling CHECK', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    const insertWordNoEntry = db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, created_at, updated_at
      ) VALUES ('le:word:9', 'word', 'x', 'x', NULL, '[]', '[]', ?, ?)
    `);
    expect(() => insertWordNoEntry.run(NOW, NOW)).toThrow();

    const insertDeviceWithEntry = db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, created_at, updated_at
      ) VALUES ('le:device:antithesis', 'device', 'Antithesis', 'antithesis', 1, '[]', '[]', ?, ?)
    `);
    expect(() => insertDeviceWithEntry.run(NOW, NOW)).toThrow();

    db.close();
  });

  it('enforces relation enum and strength bounds on lexical_relation', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });

    db.prepare(`
      INSERT INTO lexical_entry (id, type, canonical_text, canonical_lower, entry_id, definitions_json, provenance_json, created_at, updated_at)
      VALUES ('le:word:1', 'word', 'Arcana', 'arcana', 1, '[]', '[]', ?, ?)
    `).run(NOW, NOW);
    db.prepare(`
      INSERT INTO lexical_entry (id, type, canonical_text, canonical_lower, entry_id, definitions_json, provenance_json, created_at, updated_at)
      VALUES ('le:word:2', 'word', 'Banana', 'banana', 2, '[]', '[]', ?, ?)
    `).run(NOW, NOW);

    const insertRelation = db.prepare(`
      INSERT INTO lexical_relation (source_id, target_id, relation, strength) VALUES (?, ?, ?, ?)
    `);
    expect(() => insertRelation.run('le:word:1', 'le:word:2', 'not_a_real_relation', 0.5)).toThrow();
    expect(() => insertRelation.run('le:word:1', 'le:word:2', 'synonym', 1.5)).toThrow();
    expect(() => insertRelation.run('le:word:1', 'le:word:2', 'synonym', -0.1)).toThrow();
    expect(() => insertRelation.run('le:word:1', 'le:word:2', 'synonym', 0.8)).not.toThrow();

    db.close();
  });

  it('cascades lexical_entry deletion when the backing entry row is deleted', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });
    db.pragma('foreign_keys = ON');

    db.prepare(`
      INSERT INTO lexical_entry (id, type, canonical_text, canonical_lower, entry_id, definitions_json, provenance_json, created_at, updated_at)
      VALUES ('le:word:1', 'word', 'Arcana', 'arcana', 1, '[]', '[]', ?, ?)
    `).run(NOW, NOW);

    db.prepare('DELETE FROM entry WHERE id = 1').run();

    const remaining = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry WHERE id = 'le:word:1'`).get().n;
    expect(remaining).toBe(0);

    db.close();
  });

  it('enforces the lexical_entry_fts_map foreign key to lexical_entry', () => {
    const db = openFixture();
    migrateLexicalGraph(db, { timestamp: NOW });
    db.pragma('foreign_keys = ON');

    const insertOrphanMap = db.prepare(`INSERT INTO lexical_entry_fts_map (rowid, entry_id) VALUES (1, 'le:word:missing')`);
    expect(() => insertOrphanMap.run()).toThrow();

    db.close();
  });
});
