// src/db/adapter.ts
// Unified PersistenceAdapter — bridges all root SQLite instances
import Database from 'better-sqlite3';

const DB_FILES = {
  abyss: './abyss.sqlite',
  scholomance: './scholomance_memory.sqlite',
  oracle: './oracle_memory.sqlite',
  divtube: './divtube_memory.db',
};

type StoreName = keyof typeof DB_FILES;

const connections = new Map<StoreName, any>();

export function getStore(name: StoreName) {
  if (!connections.has(name)) {
    const db = new Database(DB_FILES[name], { fileMustExist: false });
    db.pragma('journal_mode = WAL');
    connections.set(name, db);
  }
  return connections.get(name);
}

export function migrate(name: StoreName, sql: string) {
  const db = getStore(name);
  db.exec(sql);
}

export function closeAll() {
  for (const db of connections.values()) db.close();
  connections.clear();
}
