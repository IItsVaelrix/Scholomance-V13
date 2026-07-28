/**
 * SQLite schema — PDR §13.1
 * Required tables: worlds, rooms, players, entities, domain_events, world_snapshots, scene_manifests
 */

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS worlds (
  world_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  ruleset_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(world_id),
  revision INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description_key TEXT NOT NULL,
  exit_ids TEXT NOT NULL DEFAULT '[]',
  occupant_ids TEXT NOT NULL DEFAULT '[]',
  entity_ids TEXT NOT NULL DEFAULT '[]',
  flags TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(world_id),
  display_name TEXT NOT NULL,
  room_id TEXT NOT NULL,
  inventory_ids TEXT NOT NULL DEFAULT '[]',
  connection_state TEXT NOT NULL DEFAULT 'disconnected'
);

CREATE TABLE IF NOT EXISTS entities (
  entity_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(world_id),
  entity_type TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  location_type TEXT NOT NULL,
  location_id TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS domain_events (
  event_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(world_id),
  room_id TEXT,
  sequence INTEGER NOT NULL,
  world_revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  ruleset_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_world_seq ON domain_events(world_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_room ON domain_events(room_id);

CREATE TABLE IF NOT EXISTS world_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(world_id),
  sequence INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scene_manifests (
  manifest_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  world_id TEXT NOT NULL REFERENCES worlds(world_id),
  room_revision INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
`;
