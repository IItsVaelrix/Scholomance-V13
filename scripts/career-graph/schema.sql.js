// Canonical Career Graph SQLite schema (Gate B).
//
// Law:
//  - `career_concept` holds every namespaced node (occupation or skill).
//  - `career_relation` is the SOLE edge store. Crosswalks use predicate
//    `mapped_to`, never `same_as`. O*NET and ESCO identities stay distinct.
//  - `career_search_fts` is the FTS5 retrieval surface (law before vectors).
//  - `career_build_meta` seals provenance, policy, and the build checksum.

export const CAREER_GRAPH_SCHEMA_POLICY = 'career-graph-schema-v1';

export const CAREER_CONCEPT_DDL = `
CREATE TABLE career_concept (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  preferred_label TEXT NOT NULL,
  description TEXT,
  source_release TEXT NOT NULL
) STRICT;
`;

export const CAREER_RELATION_DDL = `
CREATE TABLE career_relation (
  id TEXT PRIMARY KEY,
  from_concept_id TEXT NOT NULL REFERENCES career_concept(id),
  predicate TEXT NOT NULL,
  to_concept_id TEXT NOT NULL REFERENCES career_concept(id),
  requirement_kind TEXT,
  importance REAL,
  level REAL,
  source_release TEXT NOT NULL,
  source_record_id TEXT NOT NULL
) STRICT;
`;

export const CAREER_SEARCH_FTS_DDL = `
CREATE VIRTUAL TABLE career_search_fts USING fts5(
  concept_id UNINDEXED,
  kind UNINDEXED,
  search_text,
  tokenize='unicode61 remove_diacritics 2'
);
`;

export const CAREER_BUILD_META_DDL = `
CREATE TABLE career_build_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
`;

export const CAREER_GRAPH_DDL = [
  CAREER_CONCEPT_DDL,
  CAREER_RELATION_DDL,
  CAREER_SEARCH_FTS_DDL,
  CAREER_BUILD_META_DDL,
].join('\n');

/**
 * Apply the full Career Graph schema to an open better-sqlite3 database.
 * @param {import('better-sqlite3').Database} db
 */
export function applyCareerGraphSchema(db) {
  db.exec(CAREER_GRAPH_DDL);
}
