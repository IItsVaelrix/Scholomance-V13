// codex/core/lexical-graph/ftsSync.js
// Offline ops write path — exempt from server SQLite write-queue (see .eslintrc).
//
// Shared FTS5 sync/delete helpers for `lexical_entry_fts` + its
// `lexical_entry_fts_map`. Adapter and scripts must both route through these
// so writes cannot diverge. See:
// docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md

function parseJsonArray(json) {
  if (typeof json !== 'string') return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractDefinitionTexts(definitionsJson) {
  return parseJsonArray(definitionsJson)
    .map((entry) => (entry && typeof entry === 'object' ? entry.text : entry))
    .filter((text) => typeof text === 'string' && text.trim().length > 0);
}

function buildFtsContent(db, row) {
  const parts = [row.canonical_text, ...extractDefinitionTexts(row.definitions_json)];

  if (row.type === 'device') {
    const device = db
      .prepare(`SELECT aliases_json, definition FROM literary_device WHERE id = ?`)
      .get(row.id);
    if (device) {
      const aliases = parseJsonArray(device.aliases_json).filter((alias) => typeof alias === 'string');
      parts.push(...aliases);
      if (typeof device.definition === 'string' && device.definition.trim()) {
        parts.push(device.definition);
      }
    }
  }

  return parts.filter((part) => typeof part === 'string' && part.length > 0).join(' ');
}

/**
 * Rebuilds the FTS5 row (and map, if missing) for one `lexical_entry`.
 * No-op if the entry does not exist.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} entryId
 */
export function syncLexicalEntryFts(db, entryId) {
  const row = db
    .prepare(`SELECT id, canonical_text, definitions_json, type FROM lexical_entry WHERE id = ?`)
    .get(entryId);
  if (!row) return;

  const content = buildFtsContent(db, row);

  const map = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = ?`).get(entryId);
  if (map) {
    db.prepare(`UPDATE lexical_entry_fts SET canonical_text = ?, content = ? WHERE rowid = ?`).run(
      row.canonical_text,
      content,
      map.rowid,
    );
  } else {
    const info = db
      .prepare(`INSERT INTO lexical_entry_fts(canonical_text, content) VALUES (?, ?)`)
      .run(row.canonical_text, content);
    db.prepare(`INSERT INTO lexical_entry_fts_map(rowid, entry_id) VALUES (?, ?)`).run(
      info.lastInsertRowid,
      entryId,
    );
  }
}

/**
 * Deletes one `lexical_entry` and its FTS shadow, in the mandatory order:
 * FTS virtual row first, then the graph entry (map cascades via FK, and is
 * also deleted explicitly for safety when the FTS row was already gone).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} entryId
 */
export function deleteLexicalEntry(db, entryId) {
  const map = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = ?`).get(entryId);
  if (map) {
    db.prepare(`DELETE FROM lexical_entry_fts WHERE rowid = ?`).run(map.rowid);
  }
  db.prepare(`DELETE FROM lexical_entry WHERE id = ?`).run(entryId);
  db.prepare(`DELETE FROM lexical_entry_fts_map WHERE entry_id = ?`).run(entryId);
}
