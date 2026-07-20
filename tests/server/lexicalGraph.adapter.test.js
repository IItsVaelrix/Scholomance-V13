import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLexicalGraph } from '../../codex/core/lexical-graph/migrate.js';
import { mirrorEntries } from '../../codex/core/lexical-graph/mirror.js';
import { seedLiteraryDevices } from '../../codex/core/lexical-graph/seedDevices.js';
import { embedDevices } from '../../codex/core/lexical-graph/embedDevices.js';
import { canonicalizeLower, deviceLexicalId } from '../../codex/core/lexical-graph/canonicalize.js';
import { createLexicalGraphAdapter } from '../../codex/server/adapters/lexicalGraph.sqlite.adapter.js';

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

  const insert = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url, embeddings_tq)
    VALUES (?, ?, ?, 'English', ?, ?, ?, ?, ?, ?, ?)
  `);

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

  db.close();
}

const ANTITHESIS_ID = deviceLexicalId('antithesis');
const JUXTAPOSITION_ID = deviceLexicalId('juxtaposition');

describe('[Server] lexicalGraph.sqlite.adapter', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function buildFixtureDbPath() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const db = new Database(dbPath);
    migrateLexicalGraph(db, { timestamp: NOW });
    mirrorEntries(db, { timestamp: NOW });
    seedLiteraryDevices(db, { timestamp: NOW });
    embedDevices(db, { timestamp: NOW });
    db.close();
    return dbPath;
  }

  it('getEntryByEntryId(1) resolves the mirrored word to le:word:1', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const entry = adapter.getEntryByEntryId(1);
    expect(entry).toBeTruthy();
    expect(entry.id).toBe('le:word:1');
    expect(entry.entryId).toBe(1);
    expect(entry.canonicalText).toBe('Grief');

    adapter.close();
  });

  it('getEntryById returns null for an unknown id', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    expect(adapter.getEntryById('le:word:999')).toBeNull();

    adapter.close();
  });

  it('getEntryByCanonical finds the mirrored word by canonical_lower, optionally filtered by type', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const byLower = adapter.getEntryByCanonical(canonicalizeLower('Grief'));
    expect(byLower).toHaveLength(1);
    expect(byLower[0].id).toBe('le:word:1');

    const filtered = adapter.getEntryByCanonical('Grief', 'device');
    expect(filtered).toEqual([]);

    adapter.close();
  });

  it('getLiteraryDevice hydrates commonlyConfusedWith and relatedDevices from lexical_relation', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const device = adapter.getLiteraryDevice(ANTITHESIS_ID);
    expect(device).toBeTruthy();
    expect(device.name).toBe('Antithesis');
    expect(device.commonlyConfusedWith).toContain(JUXTAPOSITION_ID);
    expect(device.relatedDevices).toContain(deviceLexicalId('volta'));
    expect(device.commonlyConfusedWith).not.toContain(deviceLexicalId('volta'));

    adapter.close();
  });

  it('getLiteraryDevice returns null for a non-device id', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    expect(adapter.getLiteraryDevice('le:word:1')).toBeNull();
    expect(adapter.getLiteraryDevice('le:device:not-real')).toBeNull();

    adapter.close();
  });

  it('listLiteraryDevices paginates by id with a stable cursor', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const firstPage = adapter.listLiteraryDevices({ limit: 4 });
    expect(firstPage.results).toHaveLength(4);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = adapter.listLiteraryDevices({ limit: 4, cursor: firstPage.nextCursor });
    expect(secondPage.results.length).toBeGreaterThan(0);

    const firstIds = new Set(firstPage.results.map((d) => d.id));
    const secondIds = new Set(secondPage.results.map((d) => d.id));
    for (const id of secondIds) {
      expect(firstIds.has(id)).toBe(false);
    }

    adapter.close();
  });

  it('listLiteraryDevices({ confuseWith }) restricts to devices confused with the given device', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const confused = adapter.listLiteraryDevices({ confuseWith: ANTITHESIS_ID, limit: 50 });
    const ids = confused.results.map((d) => d.id);
    expect(ids).toContain(JUXTAPOSITION_ID);
    expect(ids).not.toContain(ANTITHESIS_ID);

    adapter.close();
  });

  it('searchFts finds antithesis by name; disjoint two-page walk via composite rank+rowid cursor', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const hit = adapter.searchFts('antithesis');
    expect(hit.results.some((r) => r.id === ANTITHESIS_ID)).toBe(true);

    const firstPage = adapter.searchFts('a', { limit: 1 });
    expect(firstPage.results).toHaveLength(1);
    expect(typeof firstPage.nextCursor).toBe('string');

    const secondPage = adapter.searchFts('a', {
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.results).toHaveLength(1);
    expect(secondPage.results[0].id).not.toBe(firstPage.results[0].id);

    adapter.close();
  });

  it('searchFts returns empty results for an unmatched query', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const result = adapter.searchFts('zzzznonexistentzzzz');
    expect(result).toEqual({ results: [], nextCursor: null });

    adapter.close();
  });

  it('searchFts filters by types', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const wordOnly = adapter.searchFts('grief', { types: ['word'] });
    expect(wordOnly.results.every((r) => r.type === 'word')).toBe(true);
    expect(wordOnly.results.some((r) => r.id === 'le:word:1')).toBe(true);

    const deviceOnly = adapter.searchFts('grief', { types: ['device'] });
    expect(deviceOnly.results).toEqual([]);

    adapter.close();
  });

  it('listRelations paginates by relation id ascending with a stable id cursor', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const firstPage = adapter.listRelations(ANTITHESIS_ID, { limit: 2 });
    expect(firstPage.results.length).toBeGreaterThan(0);
    expect(firstPage.results.length).toBeLessThanOrEqual(2);

    if (firstPage.nextCursor) {
      const secondPage = adapter.listRelations(ANTITHESIS_ID, { limit: 2, cursor: firstPage.nextCursor });
      const firstIds = new Set(firstPage.results.map((r) => `${r.sourceId}|${r.targetId}|${r.relation}`));
      for (const rel of secondPage.results) {
        expect(firstIds.has(`${rel.sourceId}|${rel.targetId}|${rel.relation}`)).toBe(false);
      }
    }

    const filtered = adapter.listRelations(ANTITHESIS_ID, { relation: 'commonly_confused_with', limit: 50 });
    expect(filtered.results.every((r) => r.relation === 'commonly_confused_with')).toBe(true);
    expect(filtered.results.some((r) => r.targetId === JUXTAPOSITION_ID)).toBe(true);

    adapter.close();
  });

  it('getEmbedding returns a complete tuple with comparable=true for a generated device embedding', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    const embedding = adapter.getEmbedding(ANTITHESIS_ID);
    expect(embedding).toBeTruthy();
    expect(embedding.comparable).toBe(true);
    expect(embedding.version).not.toBe('unknown');
    expect(Buffer.isBuffer(embedding.blob) || embedding.blob instanceof Uint8Array).toBe(true);

    adapter.close();
  });

  it('getEmbedding marks comparable=false when version is the legacy unknown tuple', () => {
    const dbPath = buildFixtureDbPath();
    const db = new Database(dbPath);
    db.prepare(`
      UPDATE lexical_entry
      SET embeddings_tq = ?, embedding_kind = 'legacy_turboquant', embedding_version = 'unknown',
          embedding_dimensions = 4, embedding_source = 'copied_from_entry'
      WHERE id = 'le:word:1'
    `).run(Buffer.from([9, 9, 9, 9]));
    db.close();

    const adapter = createLexicalGraphAdapter(dbPath);
    const embedding = adapter.getEmbedding('le:word:1');
    expect(embedding).toBeTruthy();
    expect(embedding.version).toBe('unknown');
    expect(embedding.comparable).toBe(false);

    adapter.close();
  });

  it('getEmbedding returns null when no embedding is present', () => {
    const dbPath = buildFixtureDbPath();
    const adapter = createLexicalGraphAdapter(dbPath);

    expect(adapter.getEmbedding('le:word:1')).toBeNull();
    expect(adapter.getEmbedding('le:missing:id')).toBeNull();

    adapter.close();
  });

  it('degrades to empty results (no throw) when the DB file is missing', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-adapter-missing-'));
    const missingPath = path.join(tempDir, 'does-not-exist.sqlite');
    const adapter = createLexicalGraphAdapter(missingPath);

    expect(adapter.getEntryById('le:word:1')).toBeNull();
    expect(adapter.getEntryByCanonical('grief')).toEqual([]);
    expect(adapter.getEntryByEntryId(1)).toBeNull();
    expect(adapter.searchFts('grief')).toEqual({ results: [], nextCursor: null });
    expect(adapter.listRelations(ANTITHESIS_ID)).toEqual({ results: [], nextCursor: null });
    expect(adapter.getLiteraryDevice(ANTITHESIS_ID)).toBeNull();
    expect(adapter.listLiteraryDevices()).toEqual({ results: [], nextCursor: null });
    expect(adapter.getEmbedding(ANTITHESIS_ID)).toBeNull();
    expect(() => adapter.close()).not.toThrow();
  });

  it('searchFts degrades to empty (no throw) when lexical_entry exists but FTS tables are missing', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-adapter-no-fts-'));
    const dbPath = path.join(tempDir, 'no-fts.sqlite');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE lexical_entry (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        canonical_text TEXT NOT NULL,
        canonical_lower TEXT NOT NULL,
        definitions_json TEXT,
        emotional_profile_json TEXT,
        semantic_coordinates_json TEXT,
        register_json TEXT,
        domains_json TEXT,
        provenance_json TEXT,
        entry_id INTEGER,
        phonemes_json TEXT,
        syllable_count INTEGER,
        stress_pattern TEXT,
        embeddings_tq BLOB,
        embedding_kind TEXT,
        embedding_version TEXT,
        embedding_dimensions INTEGER,
        embedding_source TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE literary_device (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliases_json TEXT,
        definition TEXT,
        detection_signals_json TEXT,
        purposes_json TEXT,
        compatible_structures_json TEXT,
        examples_json TEXT
      );
    `);
    db.close();

    const adapter = createLexicalGraphAdapter(dbPath);
    expect(adapter.searchFts('antithesis')).toEqual({ results: [], nextCursor: null });
    expect(() => adapter.close()).not.toThrow();
  });

  it('does not 500 when overlay tables are missing after a failed connect (prod Leximancy path)', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-adapter-no-overlay-'));
    const dbPath = path.join(tempDir, 'legacy-only.sqlite');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE entry (
        id INTEGER PRIMARY KEY,
        headword TEXT NOT NULL,
        headword_lower TEXT NOT NULL
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    db.close();

    const adapter = createLexicalGraphAdapter(dbPath);
    // First call fails prepare of lexical_entry; second call must still degrade.
    expect(adapter.searchFts('leaves')).toEqual({ results: [], nextCursor: null });
    expect(adapter.listLiteraryDevices()).toEqual({ results: [], nextCursor: null });
    expect(adapter.getLiteraryDevice(ANTITHESIS_ID)).toBeNull();
    expect(adapter.getEntryById('le:word:1')).toBeNull();
    expect(() => adapter.close()).not.toThrow();
  });

  it('degrades to empty results when no dbPath is provided at all', () => {
    const adapter = createLexicalGraphAdapter(null);
    expect(adapter.getEntryById('le:word:1')).toBeNull();
    expect(adapter.listLiteraryDevices()).toEqual({ results: [], nextCursor: null });
    expect(() => adapter.close()).not.toThrow();
  });
});
