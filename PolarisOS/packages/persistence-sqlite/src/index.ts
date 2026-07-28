/**
 * @polaris/persistence-sqlite
 *
 * SQLite WAL persistence adapter implementing PersistencePort.
 * Implements the transaction rule from PDR §13:
 *   verify revision → validate → append events → update state → commit → broadcast
 *
 * DEPENDENCY LAW:
 *   contracts ← world-runtime (PersistencePort interface) ← persistence-sqlite
 *
 * The kernel and runtime NEVER import this package. They depend on the interface.
 */

export { SqlitePersistence } from "./SqlitePersistence.js";
export { SCHEMA_SQL } from "./schema.js";
export type { PersistenceConfig } from "./SqlitePersistence.js";
