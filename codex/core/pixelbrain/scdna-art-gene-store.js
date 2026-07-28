/**
 * SCDNA Art-Gene Store — Append-Only Durable Memory Ledger
 *
 * Implements §8.8 (ArtMemoryRecord), §10.5 (durable ledger), §6.7.
 * JSONL append-only file. Idempotent by eventChecksum.
 * Queryable by composite key: { assetId, geneId, geneChecksum, projectionChecksum }.
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr-revised.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { checksumStableJSON, stableStringify } from './scdna-art-gene.js';

// ─── Ledger Path ─────────────────────────────────────────────────────────────

const DEFAULT_LEDGER_PATH = path.resolve(
  import.meta.dirname ?? '.',
  'art-gene-ledger.jsonl'
);

let _ledgerPath = DEFAULT_LEDGER_PATH;

/** Override the ledger path (for testing). */
export function setArtMemoryLedgerPath(p) {
  _ledgerPath = p;
}

export function getArtMemoryLedgerPath() {
  return _ledgerPath;
}

// ─── Record Validation (§8.8) ───────────────────────────────────────────────

const VALID_EVENT_TYPES = Object.freeze(['curation', 'projection', 'feel-warning', 'replay', 'motif-nomination']);
const VALID_CODES = Object.freeze([
  'PB-OK-v1-ART-GENE-CURATED',
  'PB-OK-v1-ART-PROJECTION-OK',
  'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
]);

/**
 * Validate an ArtMemoryRecord. Throws on invalid records.
 */
export function validateArtMemoryRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('ART_MEMORY_INVALID_RECORD: record must be an object');
  }
  if (record.contract !== 'PB-ART-MEMORY-v1') {
    throw new Error(`ART_MEMORY_INVALID_CONTRACT: expected PB-ART-MEMORY-v1, got '${record.contract}'`);
  }
  if (!record.eventId || typeof record.eventId !== 'string') {
    throw new Error('ART_MEMORY_MISSING_EVENT_ID');
  }
  if (!VALID_EVENT_TYPES.includes(record.eventType)) {
    throw new Error(`ART_MEMORY_INVALID_EVENT_TYPE: '${record.eventType}'`);
  }
  if (!VALID_CODES.includes(record.code)) {
    throw new Error(`ART_MEMORY_INVALID_CODE: '${record.code}'`);
  }
  if (!record.assetId || typeof record.assetId !== 'string') {
    throw new Error('ART_MEMORY_MISSING_ASSET_ID');
  }
  if (!record.geneId || typeof record.geneId !== 'string') {
    throw new Error('ART_MEMORY_MISSING_GENE_ID');
  }
  if (!record.geneChecksum || typeof record.geneChecksum !== 'string') {
    throw new Error('ART_MEMORY_MISSING_GENE_CHECKSUM');
  }
  if (!record.projectionChecksum || typeof record.projectionChecksum !== 'string') {
    throw new Error('ART_MEMORY_MISSING_PROJECTION_CHECKSUM');
  }
  if (!record.eventChecksum || typeof record.eventChecksum !== 'string') {
    throw new Error('ART_MEMORY_MISSING_EVENT_CHECKSUM');
  }
}

// ─── Record Factory ──────────────────────────────────────────────────────────

/**
 * Create a validated ArtMemoryRecord with a deterministic eventChecksum.
 *
 * @param {object} input
 * @returns {Readonly<ArtMemoryRecord>}
 */
export function createArtMemoryRecord(input) {
  const body = {
    contract: 'PB-ART-MEMORY-v1',
    eventId: input.eventId ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: input.eventType,
    code: input.code,
    assetId: input.assetId,
    geneId: input.geneId,
    geneChecksum: input.geneChecksum,
    projectionChecksum: input.projectionChecksum,
    approval: input.approval ?? null,
    payload: Object.freeze(input.payload ?? {}),
  };

  const eventChecksum = checksumStableJSON(body);

  const record = Object.freeze({ ...body, eventChecksum });
  validateArtMemoryRecord(record);
  return record;
}

// ─── Append (§10.5) ─────────────────────────────────────────────────────────

/**
 * Append a record to the ledger. Idempotent by eventChecksum.
 *
 * @param {Readonly<ArtMemoryRecord>} record
 * @returns {{ status: 'appended' | 'already-present', record }}
 */
export function appendArtMemoryRecord(record) {
  validateArtMemoryRecord(record);

  if (hasEventChecksum(record.eventChecksum)) {
    return { status: 'already-present', record };
  }

  fs.appendFileSync(
    _ledgerPath,
    `${stableStringify(record)}\n`,
    { encoding: 'utf8', flag: 'a' }
  );

  return { status: 'appended', record };
}

// ─── Query (§10.5) ──────────────────────────────────────────────────────────

/**
 * Query the ledger by optional filters. All filters are AND-combined.
 *
 * @param {object} [filters]
 * @param {string} [filters.assetId]
 * @param {string} [filters.geneId]
 * @param {string} [filters.geneChecksum]
 * @param {string} [filters.projectionChecksum]
 * @param {string} [filters.eventType]
 * @param {string} [filters.code]
 * @returns {ReadonlyArray<ArtMemoryRecord>}
 */
export function queryArtMemoryLedger(filters = {}) {
  if (!fs.existsSync(_ledgerPath)) return [];

  const text = fs.readFileSync(_ledgerPath, 'utf8');
  if (text.trim() === '') return [];

  return text
    .split('\n')
    .filter(Boolean)
    .map(parseAndValidateLedgerLine)
    .filter((record) => matchesFilters(record, filters));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasEventChecksum(checksum) {
  if (!fs.existsSync(_ledgerPath)) return false;

  const text = fs.readFileSync(_ledgerPath, 'utf8');
  if (text.trim() === '') return false;

  return text.split('\n').filter(Boolean).some((line) => {
    try {
      const record = JSON.parse(line);
      return record.eventChecksum === checksum;
    } catch {
      return false;
    }
  });
}

function parseAndValidateLedgerLine(line) {
  try {
    const record = JSON.parse(line);
    validateArtMemoryRecord(record);
    return Object.freeze(record);
  } catch (e) {
    // Malformed lines are skipped but logged
    console.warn(`[art-gene-store] Skipping malformed ledger line: ${e.message}`);
    return null;
  }
}

function matchesFilters(record, filters) {
  if (!record) return false;
  if (filters.assetId && record.assetId !== filters.assetId) return false;
  if (filters.geneId && record.geneId !== filters.geneId) return false;
  if (filters.geneChecksum && record.geneChecksum !== filters.geneChecksum) return false;
  if (filters.projectionChecksum && record.projectionChecksum !== filters.projectionChecksum) return false;
  if (filters.eventType && record.eventType !== filters.eventType) return false;
  if (filters.code && record.code !== filters.code) return false;
  return true;
}
