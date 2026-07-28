/**
 * Tests: SCDNA Art-Gene Store — Durable Memory Ledger
 * PDR §17.1: Durable append, idempotence, query, restart
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createArtMemoryRecord,
  appendArtMemoryRecord,
  queryArtMemoryLedger,
  validateArtMemoryRecord,
  setArtMemoryLedgerPath,
  getArtMemoryLedgerPath,
} from '../../../../codex/core/pixelbrain/scdna-art-gene-store.js';

// ─── Test Ledger Path ────────────────────────────────────────────────────────

let tmpDir;
let ledgerPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-gene-test-'));
  ledgerPath = path.join(tmpDir, 'test-ledger.jsonl');
  setArtMemoryLedgerPath(ledgerPath);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Record Creation ─────────────────────────────────────────────────────────

describe('createArtMemoryRecord', () => {
  it('creates a valid PB-ART-MEMORY-v1 record with eventChecksum', () => {
    const record = createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'shrine-brazier',
      geneId: 'brazier-rim-light',
      geneChecksum: 'scd64:abc123',
      projectionChecksum: 'scd64:def456',
      payload: { cellCount: 14 },
    });

    expect(record.contract).toBe('PB-ART-MEMORY-v1');
    expect(record.eventType).toBe('curation');
    expect(record.code).toBe('PB-OK-v1-ART-GENE-CURATED');
    expect(record.assetId).toBe('shrine-brazier');
    expect(record.geneId).toBe('brazier-rim-light');
    expect(record.eventChecksum).toMatch(/^scd64:/);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('refuses invalid event types', () => {
    expect(() => createArtMemoryRecord({
      eventType: 'deletion',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'x',
      geneId: 'y',
      geneChecksum: 'scd64:z',
      projectionChecksum: 'scd64:w',
    })).toThrow('ART_MEMORY_INVALID_EVENT_TYPE');
  });

  it('refuses invalid codes', () => {
    expect(() => createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-SOMETHING-ELSE',
      assetId: 'x',
      geneId: 'y',
      geneChecksum: 'scd64:z',
      projectionChecksum: 'scd64:w',
    })).toThrow('ART_MEMORY_INVALID_CODE');
  });

  it('refuses missing assetId', () => {
    expect(() => createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      geneId: 'y',
      geneChecksum: 'scd64:z',
      projectionChecksum: 'scd64:w',
    })).toThrow('ART_MEMORY_MISSING_ASSET_ID');
  });
});

// ─── Append and Idempotence ──────────────────────────────────────────────────

describe('appendArtMemoryRecord', () => {
  it('appends a record to the ledger', () => {
    const record = createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'shrine-brazier',
      geneId: 'brazier-rim-light',
      geneChecksum: 'scd64:abc',
      projectionChecksum: 'scd64:def',
    });

    const result = appendArtMemoryRecord(record);
    expect(result.status).toBe('appended');
    expect(fs.existsSync(ledgerPath)).toBe(true);

    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
  });

  it('is idempotent — re-emitting the same eventChecksum does not duplicate', () => {
    const record = createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'shrine-brazier',
      geneId: 'brazier-rim-light',
      geneChecksum: 'scd64:abc',
      projectionChecksum: 'scd64:def',
    });

    appendArtMemoryRecord(record);
    const result = appendArtMemoryRecord(record);

    expect(result.status).toBe('already-present');

    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
  });
});

// ─── Query ───────────────────────────────────────────────────────────────────

describe('queryArtMemoryLedger', () => {
  function seedLedger() {
    const r1 = createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'shrine-brazier',
      geneId: 'rim-light',
      geneChecksum: 'scd64:gene1',
      projectionChecksum: 'scd64:proj1',
    });
    const r2 = createArtMemoryRecord({
      eventType: 'projection',
      code: 'PB-OK-v1-ART-PROJECTION-OK',
      assetId: 'shrine-brazier',
      geneId: 'contour',
      geneChecksum: 'scd64:gene2',
      projectionChecksum: 'scd64:proj2',
    });
    const r3 = createArtMemoryRecord({
      eventType: 'feel-warning',
      code: 'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
      assetId: 'other-asset',
      geneId: 'rim-light',
      geneChecksum: 'scd64:gene3',
      projectionChecksum: 'scd64:proj3',
    });
    appendArtMemoryRecord(r1);
    appendArtMemoryRecord(r2);
    appendArtMemoryRecord(r3);
    return { r1, r2, r3 };
  }

  it('returns all records with no filters', () => {
    seedLedger();
    const all = queryArtMemoryLedger();
    expect(all.length).toBe(3);
  });

  it('filters by assetId', () => {
    seedLedger();
    const matches = queryArtMemoryLedger({ assetId: 'shrine-brazier' });
    expect(matches.length).toBe(2);
  });

  it('filters by geneId', () => {
    seedLedger();
    const matches = queryArtMemoryLedger({ geneId: 'rim-light' });
    expect(matches.length).toBe(2);
  });

  it('retrieves by complete causal identity (composite key)', () => {
    const { r1 } = seedLedger();
    const matches = queryArtMemoryLedger({
      assetId: r1.assetId,
      geneId: r1.geneId,
      geneChecksum: r1.geneChecksum,
      projectionChecksum: r1.projectionChecksum,
    });
    expect(matches.length).toBe(1);
    expect(matches[0].eventId).toBe(r1.eventId);
  });

  it('returns empty for non-existent ledger', () => {
    setArtMemoryLedgerPath(path.join(tmpDir, 'nonexistent.jsonl'));
    expect(queryArtMemoryLedger()).toEqual([]);
  });

  it('returns empty for empty ledger', () => {
    fs.writeFileSync(ledgerPath, '', 'utf8');
    expect(queryArtMemoryLedger()).toEqual([]);
  });
});

// ─── Restart Durability (§6.7) ───────────────────────────────────────────────

describe('restart durability', () => {
  it('records survive process restart (simulated by re-reading file)', () => {
    const record = createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'shrine-brazier',
      geneId: 'rim-light',
      geneChecksum: 'scd64:abc',
      projectionChecksum: 'scd64:def',
    });

    appendArtMemoryRecord(record);

    // Simulate restart: create a new query context reading the same file
    const matches = queryArtMemoryLedger({ assetId: 'shrine-brazier' });
    expect(matches.length).toBe(1);
    expect(matches[0].geneId).toBe('rim-light');
    expect(matches[0].eventChecksum).toBe(record.eventChecksum);
  });
});

// ─── Malformed Line Handling ─────────────────────────────────────────────────

describe('malformed line handling', () => {
  it('skips malformed lines without crashing', () => {
    fs.writeFileSync(ledgerPath, 'not-json\n{"broken": true}\n', 'utf8');

    const record = createArtMemoryRecord({
      eventType: 'curation',
      code: 'PB-OK-v1-ART-GENE-CURATED',
      assetId: 'test',
      geneId: 'test',
      geneChecksum: 'scd64:x',
      projectionChecksum: 'scd64:y',
    });
    appendArtMemoryRecord(record);

    const matches = queryArtMemoryLedger({ assetId: 'test' });
    expect(matches.length).toBe(1);
  });
});
