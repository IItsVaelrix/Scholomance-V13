/**
 * Browser-side SQLite-WASM shard database.
 *
 * Loads a single Career Graph shard (core, universal, or a family) from its raw
 * `.sqlite` bytes into an in-memory SQLite-WASM connection via
 * `sqlite3_deserialize`, and exposes the read-only `SqlSelect` interface the
 * engine-agnostic `sqlite-graph-port` consumes. The same SQL that runs against
 * `better-sqlite3` in tests runs here unchanged.
 *
 * This module is browser-only (it initializes the WASM module) and is imported
 * exclusively by the Career Graph worker.
 */
import sqlite3InitModule, {
  type Sqlite3Static,
  type Database,
} from '@sqlite.org/sqlite-wasm';
import type { SqlSelect } from './sqlite-graph-port';

let sqlite3Promise: Promise<Sqlite3Static> | null = null;

/** Initialize the SQLite-WASM module once per worker. */
export function initSqlite(): Promise<Sqlite3Static> {
  if (!sqlite3Promise) {
    sqlite3Promise = sqlite3InitModule();
  }
  return sqlite3Promise;
}

export interface WasmShardDb {
  /** Read rows as plain objects — satisfies `SqlSelect`. */
  select: SqlSelect;
  /** Release the connection and its backing memory. */
  close(): void;
}

/**
 * Deserialize shard bytes into a fresh in-memory database.
 *
 * The bytes are copied into WASM memory and handed to SQLite with
 * `FREEONCLOSE | READONLY`: SQLite owns the buffer and frees it when the
 * connection closes, and the shard cannot be mutated (shards are sealed build
 * artifacts). A copy is required because the deserialized buffer becomes
 * SQLite-owned; the caller's `ArrayBuffer` is left untouched.
 */
export function openShardFromBytes(
  sqlite3: Sqlite3Static,
  bytes: Uint8Array
): WasmShardDb {
  const db: Database = new sqlite3.oo1.DB();
  const { wasm, capi } = sqlite3;

  const pData = wasm.allocFromTypedArray(bytes);
  const flags =
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY;
  const rc = capi.sqlite3_deserialize(
    db.pointer!,
    'main',
    pData,
    bytes.length,
    bytes.length,
    flags
  );
  if (rc !== 0) {
    // On failure SQLite did not take ownership; free the copy ourselves.
    wasm.dealloc(pData);
    db.close();
    throw new Error(`SHARD_DESERIALIZE_FAILED: sqlite3_deserialize rc=${rc}`);
  }

  const select: SqlSelect = (sql, params) =>
    db.selectObjects(sql, params as never[]) as Record<string, unknown>[];

  return {
    select,
    close: () => db.close(),
  };
}
