import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLexicalGraph } from '../../../codex/core/lexical-graph/migrate.js';
import { syncLexicalEntryFts, deleteLexicalEntry } from '../../../codex/core/lexical-graph/ftsSync.js';

const NOW = '2026-07-18T00:00:00.000Z';

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

  db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, senses_json, source)
    VALUES (1, 'Arcana', 'arcana', 'English', 'noun', '[]', 'oewn')
  `).run();

  db.close();
}

describe('[Core] lexicalGraph.ftsSync', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function openFixture() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-ftssync-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const db = new Database(dbPath);
    migrateLexicalGraph(db, { timestamp: NOW });
    return db;
  }

  function insertWord(db, { id, canonicalText, definitions }) {
    db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, created_at, updated_at
      ) VALUES (?, 'word', ?, ?, 1, ?, '[]', ?, ?)
    `).run(id, canonicalText, canonicalText.toLowerCase(), JSON.stringify(definitions), NOW, NOW);
  }

  function insertDevice(db, { id, canonicalText, aliases, definition }) {
    db.prepare(`
      INSERT INTO lexical_entry (
        id, type, canonical_text, canonical_lower, entry_id,
        definitions_json, provenance_json, created_at, updated_at
      ) VALUES (?, 'device', ?, ?, NULL, '[]', '[]', ?, ?)
    `).run(id, canonicalText, canonicalText.toLowerCase(), NOW, NOW);

    db.prepare(`
      INSERT INTO literary_device (
        id, name, aliases_json, definition, detection_signals_json,
        purposes_json, compatible_structures_json, examples_json
      ) VALUES (?, ?, ?, ?, '[]', '[]', '[]', '[]')
    `).run(id, canonicalText, JSON.stringify(aliases), definition);
  }

  it('finds canonical text via FTS MATCH after insert + sync', () => {
    const db = openFixture();
    insertWord(db, { id: 'le:word:1', canonicalText: 'Grief Ceiling', definitions: [{ text: 'a felt limit on sorrow' }] });

    syncLexicalEntryFts(db, 'le:word:1');

    const hit = db
      .prepare(`SELECT canonical_text FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'ceiling'`)
      .get();
    expect(hit).toBeTruthy();
    expect(hit.canonical_text).toBe('Grief Ceiling');

    db.close();
  });

  it('makes new content searchable and old phrase not searchable after update + re-sync', () => {
    const db = openFixture();
    insertWord(db, { id: 'le:word:1', canonicalText: 'Arcana', definitions: [{ text: 'ancient secret knowledge' }] });
    syncLexicalEntryFts(db, 'le:word:1');

    let hit = db
      .prepare(`SELECT rowid FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'secret'`)
      .get();
    expect(hit).toBeTruthy();

    db.prepare(`UPDATE lexical_entry SET definitions_json = ? WHERE id = ?`)
      .run(JSON.stringify([{ text: 'mysterious phonemic residue' }]), 'le:word:1');
    syncLexicalEntryFts(db, 'le:word:1');

    hit = db
      .prepare(`SELECT rowid FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'phonemic'`)
      .get();
    expect(hit).toBeTruthy();

    const stale = db
      .prepare(`SELECT rowid FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'secret'`)
      .get();
    expect(stale).toBeUndefined();

    const mapRows = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry_fts_map`).get().n;
    expect(mapRows).toBe(1);

    db.close();
  });

  it('joins literary_device aliases + definition into FTS content for device entries', () => {
    const db = openFixture();
    insertDevice(db, {
      id: 'le:device:antithesis',
      canonicalText: 'Antithesis',
      aliases: ['antithetical pairing'],
      definition: 'a rhetorical opposition of contrasting ideas',
    });

    syncLexicalEntryFts(db, 'le:device:antithesis');

    const byAlias = db
      .prepare(`SELECT rowid FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'antithetical'`)
      .get();
    expect(byAlias).toBeTruthy();

    const byDefinition = db
      .prepare(`SELECT rowid FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'contrasting'`)
      .get();
    expect(byDefinition).toBeTruthy();

    db.close();
  });

  it('deleteLexicalEntry removes the FTS row and entry; map is gone; no orphan FTS rowid', () => {
    const db = openFixture();
    insertWord(db, { id: 'le:word:1', canonicalText: 'Arcana', definitions: [{ text: 'ancient secret knowledge' }] });
    syncLexicalEntryFts(db, 'le:word:1');

    const mapRow = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = ?`).get('le:word:1');
    expect(mapRow).toBeTruthy();

    deleteLexicalEntry(db, 'le:word:1');

    const entry = db.prepare(`SELECT id FROM lexical_entry WHERE id = ?`).get('le:word:1');
    expect(entry).toBeUndefined();

    const map = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = ?`).get('le:word:1');
    expect(map).toBeUndefined();

    const orphanFts = db.prepare(`SELECT rowid FROM lexical_entry_fts WHERE rowid = ?`).get(mapRow.rowid);
    expect(orphanFts).toBeUndefined();

    db.close();
  });

  it('deleting via deleteLexicalEntry only (no prior FTS delete call) stays safe and leaves no orphan rows', () => {
    const db = openFixture();
    insertWord(db, { id: 'le:word:1', canonicalText: 'Banana', definitions: [{ text: 'a yellow fruit' }] });
    syncLexicalEntryFts(db, 'le:word:1');

    expect(() => deleteLexicalEntry(db, 'le:word:1')).not.toThrow();

    const ftsCount = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry_fts`).get().n;
    expect(ftsCount).toBe(0);
    const mapCount = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry_fts_map`).get().n;
    expect(mapCount).toBe(0);

    expect(() => deleteLexicalEntry(db, 'le:word:missing')).not.toThrow();

    db.close();
  });
});
