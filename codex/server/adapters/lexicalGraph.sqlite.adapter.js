// codex/server/adapters/lexicalGraph.sqlite.adapter.js
//
// Read-only adapter for the lexical-graph overlay tables
// (`lexical_entry`, `lexical_relation`, `literary_device`,
// `lexical_entry_fts`) added to `scholomance_dict.sqlite`. Writes happen
// only through `scripts/lexical-graph.mjs` (migrate/mirror/seed/embed);
// this module never mutates the database. Mirrors the connection/degraded
// patterns of `lexicon.sqlite.adapter.js` without importing its internals.
// See docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md.

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolveDatabasePath } from '../utils/pathResolution.js';
import { canonicalizeLower, wordLexicalId } from '../../core/lexical-graph/canonicalize.js';
import { sanitizeFtsQuery } from '../../core/lexical-graph/ftsQuery.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const EMPTY_PAGE = Object.freeze({ results: [], nextCursor: null });

function toBoundedLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function parseJsonArray(json) {
  if (typeof json !== 'string') return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(json) {
  if (typeof json !== 'string') return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor, isValid) {
  if (typeof cursor !== 'string' || !cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeFtsCursor(cursor) {
  return decodeCursor(
    cursor,
    (parsed) => typeof parsed?.rank === 'number' && typeof parsed?.rowid === 'number',
  );
}

function decodeIdCursor(cursor) {
  return decodeCursor(cursor, (parsed) => typeof parsed?.id === 'number' && Number.isFinite(parsed.id));
}

function decodeDeviceIdCursor(cursor) {
  return decodeCursor(cursor, (parsed) => typeof parsed?.id === 'string' && parsed.id.length > 0);
}

function toLexicalEntry(row) {
  if (!row) return null;
  const entry = {
    id: row.id,
    type: row.type,
    canonicalText: row.canonical_text,
    definitions: parseJsonArray(row.definitions_json),
    emotionalProfile: parseJsonObject(row.emotional_profile_json),
    semanticCoordinates: parseJsonObject(row.semantic_coordinates_json),
    register: parseJsonArray(row.register_json),
    domains: parseJsonArray(row.domains_json),
    provenance: parseJsonArray(row.provenance_json),
    entryId: row.entry_id ?? null,
  };
  if (row.phonemes_json) entry.phonemes = parseJsonArray(row.phonemes_json);
  if (typeof row.syllable_count === 'number') entry.syllableCount = row.syllable_count;
  if (typeof row.stress_pattern === 'string') entry.stressPattern = row.stress_pattern;
  entry.embedding = row.embeddings_tq
    ? {
        blob: row.embeddings_tq,
        kind: row.embedding_kind,
        version: row.embedding_version,
        dimensions: row.embedding_dimensions,
        source: row.embedding_source,
      }
    : null;
  return entry;
}

function toLexicalRelation(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    relation: row.relation,
    strength: row.strength,
    context: row.context_json ? parseJsonArray(row.context_json) : undefined,
  };
}

function toLiteraryDeviceShell(entryRow, deviceRow) {
  return {
    id: entryRow.id,
    name: deviceRow.name,
    aliases: parseJsonArray(deviceRow.aliases_json),
    definition: deviceRow.definition,
    detectionSignals: parseJsonArray(deviceRow.detection_signals_json),
    purposes: parseJsonArray(deviceRow.purposes_json),
    compatibleStructures: parseJsonArray(deviceRow.compatible_structures_json),
    examples: parseJsonArray(deviceRow.examples_json),
  };
}

function createEmptyAdapter(resolvedPath, logger) {
  const logWait = () =>
    logger.warn?.(
      `[LexicalGraphAdapter] Dictionary DB not ready at ${resolvedPath}. Lexical graph routes will return empty results.`,
    );

  return {
    getEntryById() { logWait(); return null; },
    getEntryByCanonical() { logWait(); return []; },
    getEntryByEntryId() { logWait(); return null; },
    searchFts() { logWait(); return { ...EMPTY_PAGE }; },
    listRelations() { logWait(); return { ...EMPTY_PAGE }; },
    getLiteraryDevice() { logWait(); return null; },
    listLiteraryDevices() { logWait(); return { ...EMPTY_PAGE }; },
    getEmbedding() { logWait(); return null; },
    close() {},
    __unsafe: { connected: false, dbPath: resolvedPath },
  };
}

export function createLexicalGraphAdapter(dbPath, options = {}) {
  const logger = options.log ?? console;
  if (!dbPath) {
    return createEmptyAdapter(null, logger);
  }
  const resolvedPath = resolveDatabasePath(dbPath, 'scholomance_dict.sqlite');

  let db = null;
  let stmts = null;
  let hasFts = false;

  function tableExists(name) {
    return Boolean(
      db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`)
        .get(name),
    );
  }

  function tryConnect() {
    // Only treat as connected when prepare of overlay stmts succeeded.
    // A prior failed open can leave `db` open with null `stmts`; returning
    // true here made listLiteraryDevices 500 on missing lexical_entry.
    if (db && db.open && stmts) return true;
    if (!resolvedPath || !existsSync(resolvedPath)) return false;

    try {
      if (db) {
        try {
          if (db.open) db.close();
        } catch {
          // ignore close errors on a half-open handle
        }
        db = null;
        stmts = null;
        hasFts = false;
      }

      db = new Database(resolvedPath, { readonly: true, fileMustExist: true });
      db.pragma('query_only = ON');
      db.pragma('busy_timeout = 5000');

      stmts = {
        entryById: db.prepare(`SELECT * FROM lexical_entry WHERE id = ?`),
        entryByEntryId: db.prepare(`SELECT * FROM lexical_entry WHERE entry_id = ?`),
        literaryDeviceById: db.prepare(`SELECT * FROM literary_device WHERE id = ?`),
      };
      hasFts = tableExists('lexical_entry_fts') && tableExists('lexical_entry_fts_map');
      if (!hasFts) {
        logger.warn?.(
          { dbPath: resolvedPath },
          '[LexicalGraphAdapter] lexical_entry_fts missing — searchFts degrades to empty (run lexical-graph migrate).',
        );
      }

      logger.info?.({ dbPath: resolvedPath }, '[LexicalGraphAdapter] Connected to dictionary DB.');
      return true;
    } catch (error) {
      logger.warn?.({ err: error.message, dbPath: resolvedPath }, '[LexicalGraphAdapter] Failed to open dictionary DB.');
      try {
        if (db?.open) db.close();
      } catch {
        // ignore
      }
      db = null;
      stmts = null;
      hasFts = false;
      return false;
    }
  }

  tryConnect();

  function getEntryById(id) {
    if (!tryConnect()) return null;
    if (typeof id !== 'string' || !id) return null;
    return toLexicalEntry(stmts.entryById.get(id));
  }

  function getEntryByCanonical(text, type, limit = DEFAULT_LIMIT) {
    if (!tryConnect()) return [];
    const lower = canonicalizeLower(text);
    if (!lower) return [];
    const boundedLimit = toBoundedLimit(limit, DEFAULT_LIMIT);
    const rows = type
      ? db
          .prepare(`SELECT * FROM lexical_entry WHERE canonical_lower = ? AND type = ? ORDER BY id ASC LIMIT ?`)
          .all(lower, type, boundedLimit)
      : db
          .prepare(`SELECT * FROM lexical_entry WHERE canonical_lower = ? ORDER BY id ASC LIMIT ?`)
          .all(lower, boundedLimit);
    return rows.map(toLexicalEntry);
  }

  function getEntryByEntryId(entryId) {
    if (!tryConnect()) return null;
    let id;
    try {
      id = wordLexicalId(entryId);
    } catch {
      return null;
    }
    return toLexicalEntry(stmts.entryById.get(id)) ?? toLexicalEntry(stmts.entryByEntryId.get(Number(entryId)));
  }

  function searchFts(query, { types, limit, cursor } = {}) {
    if (!tryConnect()) return { ...EMPTY_PAGE };
    if (!hasFts) return { ...EMPTY_PAGE };
    const sanitized = sanitizeFtsQuery(query);
    if (!sanitized) return { ...EMPTY_PAGE };

    const boundedLimit = toBoundedLimit(limit, DEFAULT_LIMIT);
    const decodedCursor = decodeFtsCursor(cursor);

    const typeList = Array.isArray(types) ? types.filter((t) => typeof t === 'string' && t) : [];
    const typeClause = typeList.length > 0 ? `AND e.type IN (${typeList.map(() => '?').join(',')})` : '';
    const cursorClause = decodedCursor
      ? `AND (bm25(lexical_entry_fts) > ? OR (bm25(lexical_entry_fts) = ? AND f.rowid > ?))`
      : '';

    const params = [sanitized, ...typeList];
    if (decodedCursor) params.push(decodedCursor.rank, decodedCursor.rank, decodedCursor.rowid);
    params.push(boundedLimit + 1);

    const rows = db
      .prepare(
        `
        SELECT m.entry_id AS id, bm25(lexical_entry_fts) AS rank, f.rowid AS rowid
        FROM lexical_entry_fts f
        JOIN lexical_entry_fts_map m ON m.rowid = f.rowid
        JOIN lexical_entry e ON e.id = m.entry_id
        WHERE lexical_entry_fts MATCH ?
          ${typeClause}
          ${cursorClause}
        ORDER BY rank ASC, f.rowid ASC
        LIMIT ?
      `,
      )
      .all(...params);

    const hasMore = rows.length > boundedLimit;
    const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;
    const results = pageRows.map((row) => toLexicalEntry(stmts.entryById.get(row.id))).filter(Boolean);
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ rank: last.rank, rowid: last.rowid }) : null;

    return { results, nextCursor };
  }

  function listRelations(sourceId, { relation, limit, cursor } = {}) {
    if (!tryConnect()) return { ...EMPTY_PAGE };
    if (typeof sourceId !== 'string' || !sourceId) return { ...EMPTY_PAGE };

    const boundedLimit = toBoundedLimit(limit, DEFAULT_LIMIT);
    const decodedCursor = decodeIdCursor(cursor);

    const relationClause = typeof relation === 'string' && relation ? `AND relation = ?` : '';
    const cursorClause = decodedCursor ? `AND id > ?` : '';

    const params = [sourceId];
    if (relationClause) params.push(relation);
    if (cursorClause) params.push(decodedCursor.id);
    params.push(boundedLimit + 1);

    const rows = db
      .prepare(
        `
        SELECT id, source_id, target_id, relation, strength, context_json
        FROM lexical_relation
        WHERE source_id = ?
          ${relationClause}
          ${cursorClause}
        ORDER BY id ASC
        LIMIT ?
      `,
      )
      .all(...params);

    const hasMore = rows.length > boundedLimit;
    const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;
    const results = pageRows.map(toLexicalRelation);
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ id: last.id }) : null;

    return { results, nextCursor };
  }

  function hydrateRelationTargets(id, relation) {
    const targets = [];
    let cursor = null;
    // Device catalogs are small; loop through pages internally so callers
    // get the full hydrated list without leaking pagination concerns.
    for (let guard = 0; guard < 1000; guard += 1) {
      const page = listRelations(id, { relation, limit: MAX_LIMIT, cursor });
      for (const rel of page.results) targets.push(rel.targetId);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return targets;
  }

  function getLiteraryDevice(id) {
    if (!tryConnect()) return null;
    if (typeof id !== 'string' || !id) return null;
    const entryRow = stmts.entryById.get(id);
    if (!entryRow || entryRow.type !== 'device') return null;
    const deviceRow = stmts.literaryDeviceById.get(id);
    if (!deviceRow) return null;

    const shell = toLiteraryDeviceShell(entryRow, deviceRow);
    shell.relatedDevices = hydrateRelationTargets(id, 'related_device');
    shell.commonlyConfusedWith = hydrateRelationTargets(id, 'commonly_confused_with');
    return shell;
  }

  function listLiteraryDevices({ confuseWith, limit, cursor } = {}) {
    if (!tryConnect()) return { ...EMPTY_PAGE };

    const boundedLimit = toBoundedLimit(limit, DEFAULT_LIMIT);
    const decodedCursor = decodeDeviceIdCursor(cursor);
    const cursorClause = decodedCursor ? `AND le.id > ?` : '';

    let rows;
    if (typeof confuseWith === 'string' && confuseWith) {
      const params = [confuseWith];
      if (decodedCursor) params.push(decodedCursor.id);
      params.push(boundedLimit + 1);
      rows = db
        .prepare(
          `
          SELECT le.id AS id
          FROM lexical_relation r
          JOIN lexical_entry le ON le.id = r.target_id
          WHERE r.source_id = ? AND r.relation = 'commonly_confused_with'
            ${cursorClause}
          ORDER BY le.id ASC
          LIMIT ?
        `,
        )
        .all(...params);
    } else {
      const params = [];
      if (decodedCursor) params.push(decodedCursor.id);
      params.push(boundedLimit + 1);
      rows = db
        .prepare(
          `
          SELECT le.id AS id
          FROM lexical_entry le
          JOIN literary_device ld ON ld.id = le.id
          WHERE le.type = 'device'
            ${cursorClause}
          ORDER BY le.id ASC
          LIMIT ?
        `,
        )
        .all(...params);
    }

    const hasMore = rows.length > boundedLimit;
    const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;
    const results = pageRows.map((row) => getLiteraryDevice(row.id)).filter(Boolean);
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ id: last.id }) : null;

    return { results, nextCursor };
  }

  function getEmbedding(id) {
    if (!tryConnect()) return null;
    if (typeof id !== 'string' || !id) return null;
    const row = db
      .prepare(
        `SELECT embeddings_tq, embedding_kind, embedding_version, embedding_dimensions, embedding_source
         FROM lexical_entry WHERE id = ?`,
      )
      .get(id);
    if (!row || !row.embeddings_tq) return null;

    return {
      blob: row.embeddings_tq,
      kind: row.embedding_kind,
      version: row.embedding_version,
      dimensions: row.embedding_dimensions,
      source: row.embedding_source,
      comparable: row.embedding_version !== 'unknown',
    };
  }

  function close() {
    if (db && db.open) db.close();
  }

  return {
    getEntryById,
    getEntryByCanonical,
    getEntryByEntryId,
    searchFts,
    listRelations,
    getLiteraryDevice,
    listLiteraryDevices,
    getEmbedding,
    close,
    __unsafe: {
      get connected() { return !!(db && db.open); },
      get dbPath() { return resolvedPath; },
    },
  };
}
