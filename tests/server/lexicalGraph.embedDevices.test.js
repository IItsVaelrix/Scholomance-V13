import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLexicalGraph } from '../../codex/core/lexical-graph/migrate.js';
import { seedLiteraryDevices } from '../../codex/core/lexical-graph/seedDevices.js';
import { embedDevices } from '../../codex/core/lexical-graph/embedDevices.js';
import {
  DEVICE_EMBEDDING_KIND,
  DEVICE_EMBEDDING_VERSION,
  DEVICE_EMBEDDING_DIMENSIONS,
} from '../../codex/core/lexical-graph/types.js';

const callCounter = vi.hoisted(() => ({ count: 0, failOnCall: -1 }));

vi.mock('../../codex/core/lexical-graph/deviceEmbed.js', async () => {
  const actual = await vi.importActual('../../codex/core/lexical-graph/deviceEmbed.js');
  return {
    ...actual,
    buildDeviceEmbeddingBlob: (canonicalText, definition) => {
      callCounter.count += 1;
      if (callCounter.count === callCounter.failOnCall) {
        throw new Error('injected mid-run failure');
      }
      return actual.buildDeviceEmbeddingBlob(canonicalText, definition);
    },
  };
});

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T01:00:00.000Z';

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
  db.close();
}

describe('[Server] lexicalGraph.embedDevices', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    callCounter.count = 0;
    callCounter.failOnCall = -1;
  });

  function openSeededFixture() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-embed-devices-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const db = new Database(dbPath);
    migrateLexicalGraph(db, { timestamp: NOW });
    seedLiteraryDevices(db, { timestamp: NOW });
    return db;
  }

  it('throws PB-ERR-v1-VALUE when caller timestamp is missing', () => {
    const db = openSeededFixture();
    expect(() => embedDevices(db, {})).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => embedDevices(db)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => embedDevices(db, { timestamp: '  ' })).toThrow(/PB-ERR-v1-VALUE/);
    db.close();
  });

  it('gives every device a complete embedding tuple', () => {
    const db = openSeededFixture();
    const { embedded } = embedDevices(db, { timestamp: NOW });
    expect(embedded).toBe(10);

    const rows = db.prepare(`SELECT * FROM lexical_entry WHERE type = 'device'`).all();
    expect(rows.length).toBe(10);

    for (const row of rows) {
      expect(row.embedding_kind).toBe(DEVICE_EMBEDDING_KIND);
      expect(row.embedding_version).toBe(DEVICE_EMBEDDING_VERSION);
      expect(row.embedding_dimensions).toBe(DEVICE_EMBEDDING_DIMENSIONS);
      expect(row.embedding_source).toBe('generated_device');
      expect(Buffer.isBuffer(row.embeddings_tq)).toBe(true);
      expect(row.embeddings_tq.length).toBeGreaterThan(0);
    }

    db.close();
  });

  it('produces a byte-identical blob for the same text on re-run', () => {
    const db = openSeededFixture();
    embedDevices(db, { timestamp: NOW });
    const before = db
      .prepare(`SELECT embeddings_tq FROM lexical_entry WHERE type = 'device' ORDER BY id LIMIT 1`)
      .get().embeddings_tq;

    // Re-running should be a no-op (already-embedded rows are left untouched).
    const { embedded: embeddedOnRerun } = embedDevices(db, { timestamp: LATER });
    expect(embeddedOnRerun).toBe(0);

    const after = db
      .prepare(`SELECT embeddings_tq FROM lexical_entry WHERE type = 'device' ORDER BY id LIMIT 1`)
      .get().embeddings_tq;

    expect(Buffer.compare(before, after)).toBe(0);
    db.close();
  });

  it('produces a byte-identical blob when re-derived from scratch for the same text', () => {
    const dbA = openSeededFixture();
    embedDevices(dbA, { timestamp: NOW });
    const blobA = dbA
      .prepare(`SELECT embeddings_tq FROM lexical_entry WHERE type = 'device' ORDER BY id LIMIT 1`)
      .get().embeddings_tq;
    dbA.close();

    const dbB = openSeededFixture();
    embedDevices(dbB, { timestamp: LATER });
    const blobB = dbB
      .prepare(`SELECT embeddings_tq FROM lexical_entry WHERE type = 'device' ORDER BY id LIMIT 1`)
      .get().embeddings_tq;
    dbB.close();

    expect(Buffer.compare(blobA, blobB)).toBe(0);
  });

  it('stamps lexical_graph_embedding_kind/version/dimensions in meta', () => {
    const db = openSeededFixture();
    embedDevices(db, { timestamp: NOW });

    const kind = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_embedding_kind'`).get();
    const version = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_embedding_version'`).get();
    const dimensions = db.prepare(`SELECT value FROM meta WHERE key = 'lexical_graph_embedding_dimensions'`).get();

    expect(kind.value).toBe(DEVICE_EMBEDDING_KIND);
    expect(version.value).toBe(DEVICE_EMBEDDING_VERSION);
    expect(dimensions.value).toBe(String(DEVICE_EMBEDDING_DIMENSIONS));

    db.close();
  });

  it('fails the whole transaction (no partial embeddings) when a write fails mid-run', () => {
    const db = openSeededFixture();

    const original = db.prepare(`SELECT id FROM lexical_entry WHERE type = 'device' ORDER BY id`).all();
    expect(original.length).toBe(10);

    // Fail on the 5th device out of 10 — proves earlier successful updates
    // in this run are rolled back, not just that nothing ever started.
    callCounter.failOnCall = 5;

    expect(() => embedDevices(db, { timestamp: NOW })).toThrow(/injected mid-run failure/);

    const rows = db.prepare(`SELECT * FROM lexical_entry WHERE type = 'device'`).all();
    expect(rows.length).toBe(10);
    for (const row of rows) {
      expect(row.embeddings_tq).toBeNull();
      expect(row.embedding_kind).toBeNull();
    }

    db.close();
  });
});
