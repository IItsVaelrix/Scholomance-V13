// Canonical Career Graph SQLite builder (Gate B).
//
// Reads normalized source CSVs (see README.md "Normalized interchange format"),
// loads them into the canonical schema with FTS5, enforces referential
// integrity (no orphan relations), seals provenance + a deterministic build
// checksum, and returns a sealed build report.
//
// Determinism law: concepts and relations are inserted in sorted-id order, the
// checksum is computed over sorted row content + schema + policy, and no
// timestamps or randomness participate.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { parseCsv } from './lib/csv.mjs';
import {
  applyCareerGraphSchema,
  CAREER_GRAPH_SCHEMA_POLICY,
} from './schema.sql.js';

/** Columns of the normalized interchange format. */
export const NORMALIZED_COLUMNS = Object.freeze([
  'record_type',
  'namespace',
  'external_id',
  'kind',
  'preferred_label',
  'description',
  'from_concept_id',
  'predicate',
  'to_concept_id',
  'requirement_kind',
  'importance',
  'level',
  'source_release',
  'source_record_id',
]);

const VALID_KINDS = new Set(['occupation', 'skill']);
const VALID_RECORD_TYPES = new Set(['concept', 'relation']);

/**
 * Build a canonical concept id from a namespace and external id.
 * @param {string} namespace
 * @param {string} externalId
 */
export function conceptId(namespace, externalId) {
  return `${namespace}:${externalId}`;
}

/**
 * Read and parse every `*.csv` normalized source file in a directory.
 * Files are processed in sorted order for determinism.
 *
 * @param {string} sourcesDir
 * @returns {Promise<{ concepts: object[], relations: object[] }>}
 */
export async function loadNormalizedSources(sourcesDir) {
  const entries = (await readdir(sourcesDir)).filter((f) => f.endsWith('.csv'));
  entries.sort();
  const concepts = [];
  const relations = [];
  for (const file of entries) {
    const text = await readFile(join(sourcesDir, file), 'utf-8');
    for (const row of parseCsv(text)) {
      const recordType = (row.record_type || '').trim();
      if (!VALID_RECORD_TYPES.has(recordType)) {
        throw new Error(
          `CAREER_GRAPH_BAD_RECORD_TYPE:${file}:${recordType || 'empty'}`
        );
      }
      if (recordType === 'concept') concepts.push(row);
      else relations.push(row);
    }
  }
  return { concepts, relations };
}

function normalizeConceptRow(row, file) {
  const namespace = (row.namespace || '').trim();
  const externalId = (row.external_id || '').trim();
  const kind = (row.kind || '').trim();
  const preferredLabel = (row.preferred_label || '').trim();
  if (!namespace || !externalId) {
    throw new Error(`CAREER_GRAPH_CONCEPT_MISSING_ID:${file}:${externalId}`);
  }
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`CAREER_GRAPH_BAD_KIND:${file}:${kind}`);
  }
  if (!preferredLabel) {
    throw new Error(`CAREER_GRAPH_MISSING_LABEL:${file}:${externalId}`);
  }
  return {
    id: conceptId(namespace, externalId),
    namespace,
    external_id: externalId,
    kind,
    preferred_label: preferredLabel,
    description: (row.description || '').trim(),
    source_release: (row.source_release || '').trim() || namespace,
  };
}

function normalizeRelationRow(row, file) {
  const namespace = (row.namespace || '').trim();
  const fromId = (row.from_concept_id || '').trim();
  const toId = (row.to_concept_id || '').trim();
  const predicate = (row.predicate || '').trim();
  const sourceRecordId = (row.source_record_id || '').trim();
  if (!fromId || !toId || !predicate) {
    throw new Error(`CAREER_GRAPH_RELATION_INCOMPLETE:${file}:${sourceRecordId}`);
  }
  if (predicate === 'same_as') {
    // Crosswalks are mapped_to, never same_as (identity law).
    throw new Error(`CAREER_GRAPH_FORBIDDEN_PREDICATE:${file}:same_as`);
  }
  if (!sourceRecordId) {
    throw new Error(`CAREER_GRAPH_RELATION_MISSING_RECORD_ID:${file}`);
  }
  const importance = row.importance === '' ? null : Number(row.importance);
  const level = row.level === '' ? null : Number(row.level);
  return {
    id: `${namespace || 'relation'}:${sourceRecordId}`,
    from_concept_id: fromId,
    predicate,
    to_concept_id: toId,
    requirement_kind: (row.requirement_kind || '').trim() || null,
    importance: importance == null || Number.isNaN(importance) ? null : importance,
    level: level == null || Number.isNaN(level) ? null : level,
    source_release: (row.source_release || '').trim() || namespace || 'unknown',
    source_record_id: sourceRecordId,
  };
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute the deterministic build checksum over schema policy, graph policy,
 * and the sorted concept + relation row content.
 *
 * @param {{ schemaPolicy: string, policy: string, concepts: object[], relations: object[] }} args
 */
export function computeBuildChecksum({ schemaPolicy, policy, concepts, relations }) {
  const conceptLines = concepts
    .map(
      (c) =>
        [c.id, c.namespace, c.external_id, c.kind, c.preferred_label, c.description, c.source_release].join(
          '\u0001'
        )
    )
    .sort();
  const relationLines = relations
    .map(
      (r) =>
        [
          r.id,
          r.from_concept_id,
          r.predicate,
          r.to_concept_id,
          r.requirement_kind ?? '',
          r.importance ?? '',
          r.level ?? '',
          r.source_release,
          r.source_record_id,
        ].join('\u0001')
    )
    .sort();
  const payload = [
    `schema=${schemaPolicy}`,
    `policy=${policy}`,
    `concepts=${conceptLines.length}`,
    ...conceptLines,
    `relations=${relationLines.length}`,
    ...relationLines,
  ].join('\n');
  return sha256Hex(payload);
}

/**
 * Build the canonical Career Graph SQLite database.
 *
 * @param {{
 *   sources: string,
 *   outputPath: string,
 *   policy?: string,
 *   strict?: boolean,
 * }} args
 * @returns {Promise<{
 *   outputPath: string,
 *   policy: string,
 *   schemaPolicy: string,
 *   conceptCount: number,
 *   relationCount: number,
 *   mappedToCount: number,
 *   ftsCount: number,
 *   orphanRelations: number,
 *   sourceReleases: string[],
 *   checksum: string,
 *   integrityOk: boolean,
 * }>}
 */
export async function buildCareerGraph({
  sources,
  outputPath,
  policy = 'career-graph-build-v1',
  strict = true,
}) {
  const sourcesDir = resolve(sources);
  const outPath = resolve(outputPath);
  const { concepts: rawConcepts, relations: rawRelations } =
    await loadNormalizedSources(sourcesDir);

  const concepts = rawConcepts.map((r) => normalizeConceptRow(r, sourcesDir));
  const relations = rawRelations.map((r) => normalizeRelationRow(r, sourcesDir));

  // Deterministic canonical order.
  concepts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  relations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Reject duplicate concept ids.
  const conceptIds = new Set();
  for (const c of concepts) {
    if (conceptIds.has(c.id)) {
      throw new Error(`CAREER_GRAPH_DUPLICATE_CONCEPT:${c.id}`);
    }
    conceptIds.add(c.id);
  }

  // Referential integrity: count orphan relations.
  let orphanRelations = 0;
  const orphanExamples = [];
  for (const r of relations) {
    const fromOk = conceptIds.has(r.from_concept_id);
    const toOk = conceptIds.has(r.to_concept_id);
    if (!fromOk || !toOk) {
      orphanRelations += 1;
      if (orphanExamples.length < 5) {
        orphanExamples.push(
          `${r.id}(${r.from_concept_id}->${r.to_concept_id})`
        );
      }
    }
  }

  const checksum = computeBuildChecksum({
    schemaPolicy: CAREER_GRAPH_SCHEMA_POLICY,
    policy,
    concepts,
    relations,
  });

  const sourceReleases = Array.from(
    new Set([
      ...concepts.map((c) => c.source_release),
      ...relations.map((r) => r.source_release),
    ])
  ).sort();

  if (strict && orphanRelations > 0) {
    throw new Error(
      `CAREER_GRAPH_ORPHAN_RELATION:count=${orphanRelations}:examples=${orphanExamples.join(',')}`
    );
  }

  // Write the database fresh.
  await mkdir(dirname(outPath), { recursive: true });
  await rm(outPath, { force: true });

  const db = new Database(outPath);
  try {
    db.pragma('journal_mode = MEMORY');
    applyCareerGraphSchema(db);

    const insertConcept = db.prepare(
      `INSERT INTO career_concept
        (id, namespace, external_id, kind, preferred_label, description, source_release)
       VALUES (@id, @namespace, @external_id, @kind, @preferred_label, @description, @source_release)`
    );
    const insertRelation = db.prepare(
      `INSERT INTO career_relation
        (id, from_concept_id, predicate, to_concept_id, requirement_kind, importance, level, source_release, source_record_id)
       VALUES (@id, @from_concept_id, @predicate, @to_concept_id, @requirement_kind, @importance, @level, @source_release, @source_record_id)`
    );
    const insertFts = db.prepare(
      `INSERT INTO career_search_fts (concept_id, kind, search_text) VALUES (?, ?, ?)`
    );

    const tx = db.transaction(() => {
      for (const c of concepts) {
        insertConcept.run(c);
        const searchText = [c.preferred_label, c.description, c.external_id]
          .filter(Boolean)
          .join(' ');
        insertFts.run(c.id, c.kind, searchText);
      }
      for (const r of relations) {
        // Only insert non-orphan relations into the sealed graph.
        if (conceptIds.has(r.from_concept_id) && conceptIds.has(r.to_concept_id)) {
          insertRelation.run(r);
        }
      }
    });
    tx();

    const integrity = db.pragma('integrity_check');
    const integrityOk =
      Array.isArray(integrity) &&
      integrity.length === 1 &&
      integrity[0].integrity_check === 'ok';
    if (!integrityOk) {
      throw new Error(`CAREER_GRAPH_INTEGRITY_FAILED:${JSON.stringify(integrity)}`);
    }

    const conceptCount = db.prepare('SELECT count(*) n FROM career_concept').get().n;
    const relationCount = db.prepare('SELECT count(*) n FROM career_relation').get().n;
    const mappedToCount = db
      .prepare("SELECT count(*) n FROM career_relation WHERE predicate='mapped_to'")
      .get().n;
    const ftsCount = db.prepare('SELECT count(*) n FROM career_search_fts').get().n;

    const setMeta = db.prepare(
      'INSERT INTO career_build_meta (key, value) VALUES (?, ?)'
    );
    setMeta.run('schema_policy', CAREER_GRAPH_SCHEMA_POLICY);
    setMeta.run('build_policy', policy);
    setMeta.run('build_checksum', checksum);
    setMeta.run('concept_count', String(conceptCount));
    setMeta.run('relation_count', String(relationCount));
    setMeta.run('source_releases', sourceReleases.join(','));

    return {
      outputPath: outPath,
      policy,
      schemaPolicy: CAREER_GRAPH_SCHEMA_POLICY,
      conceptCount,
      relationCount,
      mappedToCount,
      ftsCount,
      orphanRelations,
      sourceReleases,
      checksum,
      integrityOk,
    };
  } finally {
    db.close();
  }
}

// CLI entry: node scripts/career-graph/build-database.mjs <sourcesDir> <outputPath> [policy]
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const [, , sourcesArg, outputArg, policyArg] = process.argv;
  if (!sourcesArg || !outputArg) {
    console.error(
      'usage: node scripts/career-graph/build-database.mjs <sourcesDir> <outputPath> [policy]'
    );
    process.exit(2);
  }
  const report = await buildCareerGraph({
    sources: sourcesArg,
    outputPath: outputArg,
    policy: policyArg,
  });
  console.log(
    `CAREER_GRAPH_BUILT concepts=${report.conceptCount} relations=${report.relationCount} mapped_to=${report.mappedToCount} fts=${report.ftsCount} orphans=${report.orphanRelations} checksum=${report.checksum}`
  );
}
