// Career Graph shard builder (Gate C).
//
// Emits a pinned `core` shard, a pinned `universal` bridge shard, and one
// `family-<SOC>` shard per SOC major group from the canonical database.
// Shared concepts are DUPLICATED into shards without changing identity (the
// same concept id + label appears in every shard that needs it).
//
// Residency law (declared in manifest.json, enforced at runtime by
// src/lib/career/graph/shard-cache.ts): core + universal are always pinned;
// at most three family shards may be resident at once.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { applyCareerGraphSchema, CAREER_GRAPH_SCHEMA_POLICY } from './schema.sql.js';
import { computeBuildChecksum } from './build-database.mjs';

export const RESIDENCY_POLICY = Object.freeze({
  pinned: Object.freeze(['core', 'universal']),
  maxFamilyShards: 3,
});

/** Derive the SOC major group (2-digit) from an O*NET occupation external id. */
export function socMajorGroup(externalId) {
  const m = /^(\d{2})-/.exec(externalId || '');
  return m ? m[1] : null;
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Load all concepts and relations from a canonical database into memory.
 * @param {string} databasePath
 */
export function loadCanonicalGraph(databasePath) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const concepts = db
      .prepare('SELECT * FROM career_concept ORDER BY id')
      .all();
    const relations = db
      .prepare('SELECT * FROM career_relation ORDER BY id')
      .all();
    return { concepts, relations };
  } finally {
    db.close();
  }
}

/**
 * Compute the shard partitioning from an in-memory canonical graph.
 *
 * @param {{ concepts: object[], relations: object[] }} graph
 * @returns {{
 *   core: { concepts: object[], relations: object[] },
 *   universal: { concepts: object[], relations: object[] },
 *   families: Record<string, { concepts: object[], relations: object[] }>,
 * }}
 */
export function computeShardPartition(graph) {
  const { concepts, relations } = graph;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const occupations = concepts.filter((c) => c.kind === 'occupation');
  const occupationIds = new Set(occupations.map((c) => c.id));

  // Relations that connect an occupation to a skill.
  const skillRelations = relations.filter(
    (r) => r.predicate === 'requires_skill' && occupationIds.has(r.from_concept_id)
  );

  // Skills referenced by any occupation (the universal bridge layer).
  const bridgeSkillIds = new Set();
  for (const r of skillRelations) {
    const to = byId.get(r.to_concept_id);
    if (to && to.kind === 'skill') bridgeSkillIds.add(to.id);
  }

  // --- core: occupation backbone + every relation + referenced skills ---
  const coreConceptIds = new Set(occupationIds);
  for (const r of relations) {
    for (const endpoint of [r.from_concept_id, r.to_concept_id]) {
      const c = byId.get(endpoint);
      if (c) coreConceptIds.add(c.id);
    }
  }
  const core = {
    concepts: concepts.filter((c) => coreConceptIds.has(c.id)),
    relations: relations.slice(),
  };

  // --- universal: bridge skill concepts only (no relations, no orphans) ---
  const universal = {
    concepts: concepts.filter((c) => bridgeSkillIds.has(c.id)),
    relations: [],
  };

  // --- families: one shard per SOC major group ---
  const families = {};
  for (const occ of occupations) {
    const group = socMajorGroup(occ.external_id);
    if (!group) continue; // non-SOC occupations live only in core
    if (!families[group]) families[group] = { concepts: [], relations: [] };
  }
  for (const occ of occupations) {
    const group = socMajorGroup(occ.external_id);
    if (!group) continue;
    families[group].concepts.push(occ);
  }
  for (const r of skillRelations) {
    const from = byId.get(r.from_concept_id);
    if (!from) continue;
    const group = socMajorGroup(from.external_id);
    if (!group) continue;
    families[group].relations.push(r);
    const to = byId.get(r.to_concept_id);
    if (to && to.kind === 'skill') families[group].concepts.push(to);
  }
  // De-duplicate family concepts by id (a skill may be referenced twice).
  for (const group of Object.keys(families)) {
    const seen = new Set();
    families[group].concepts = families[group].concepts.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    families[group].concepts.sort((a, b) => (a.id < b.id ? -1 : 1));
    families[group].relations.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  return { core, universal, families };
}

/**
 * Write a single shard SQLite database containing the given subset.
 *
 * @returns {{ shardId: string, outputPath: string, checksum: string, conceptCount: number, relationCount: number }}
 */
function writeShard({ shardId, outputPath, concepts, relations, policy }) {
  const checksum = computeBuildChecksum({
    schemaPolicy: CAREER_GRAPH_SCHEMA_POLICY,
    policy: `${policy}#shard=${shardId}`,
    concepts,
    relations,
  });

  // Synchronous rm via Database overwrite: open fresh after deleting.
  const db = new Database(outputPath);
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
      'INSERT INTO career_search_fts (concept_id, kind, search_text) VALUES (?, ?, ?)'
    );
    const conceptIds = new Set(concepts.map((c) => c.id));
    const tx = db.transaction(() => {
      for (const c of concepts) {
        insertConcept.run(c);
        insertFts.run(
          c.id,
          c.kind,
          [c.preferred_label, c.description, c.external_id].filter(Boolean).join(' ')
        );
      }
      for (const r of relations) {
        if (conceptIds.has(r.from_concept_id) && conceptIds.has(r.to_concept_id)) {
          insertRelation.run(r);
        }
      }
    });
    tx();

    const setMeta = db.prepare(
      'INSERT INTO career_build_meta (key, value) VALUES (?, ?)'
    );
    setMeta.run('shard_id', shardId);
    setMeta.run('schema_policy', CAREER_GRAPH_SCHEMA_POLICY);
    setMeta.run('build_policy', policy);
    setMeta.run('shard_checksum', checksum);

    const conceptCount = db.prepare('SELECT count(*) n FROM career_concept').get().n;
    const relationCount = db.prepare('SELECT count(*) n FROM career_relation').get().n;
    return { shardId, outputPath, checksum, conceptCount, relationCount };
  } finally {
    db.close();
  }
}

/**
 * Build all Career Graph shards from a canonical database.
 *
 * @param {{ databasePath: string, outputDir: string, policy?: string }} args
 * @returns {Promise<{ outputDir: string, policy: string, manifest: object, shards: object[] }>}
 */
export async function buildShards({ databasePath, outputDir, policy = 'career-graph-build-v1' }) {
  const dbPath = resolve(databasePath);
  const outDir = resolve(outputDir);
  await mkdir(outDir, { recursive: true });

  const graph = loadCanonicalGraph(dbPath);
  const partition = computeShardPartition(graph);

  const shards = [];

  const corePath = join(outDir, 'career-core.sqlite');
  await rm(corePath, { force: true });
  shards.push(
    writeShard({
      shardId: 'core',
      outputPath: corePath,
      concepts: partition.core.concepts,
      relations: partition.core.relations,
      policy,
    })
  );

  const universalPath = join(outDir, 'career-universal.sqlite');
  await rm(universalPath, { force: true });
  shards.push(
    writeShard({
      shardId: 'universal',
      outputPath: universalPath,
      concepts: partition.universal.concepts,
      relations: partition.universal.relations,
      policy,
    })
  );

  const familyGroups = Object.keys(partition.families).sort();
  for (const group of familyGroups) {
    const familyPath = join(outDir, `career-family-${group}.sqlite`);
    await rm(familyPath, { force: true });
    shards.push(
      writeShard({
        shardId: `family-${group}`,
        outputPath: familyPath,
        concepts: partition.families[group].concepts,
        relations: partition.families[group].relations,
        policy,
      })
    );
  }

  const manifest = {
    schemaPolicy: CAREER_GRAPH_SCHEMA_POLICY,
    policy,
    residency: RESIDENCY_POLICY,
    shards: shards.map((s) => ({
      shardId: s.shardId,
      file: `${s.shardId === 'core' ? 'career-core' : s.shardId === 'universal' ? 'career-universal' : `career-${s.shardId}`}.sqlite`,
      checksum: s.checksum,
      conceptCount: s.conceptCount,
      relationCount: s.relationCount,
    })),
    familyGroups,
    contentDigest: sha256Hex(
      shards.map((s) => `${s.shardId}:${s.checksum}`).sort().join('\n')
    ),
  };

  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  return { outputDir: outDir, policy, manifest, shards };
}

// CLI: node scripts/career-graph/build-shards.mjs <canonicalDb> <outputDir> [policy]
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const [, , dbArg, outArg, policyArg] = process.argv;
  if (!dbArg || !outArg) {
    console.error(
      'usage: node scripts/career-graph/build-shards.mjs <canonicalDb> <outputDir> [policy]'
    );
    process.exit(2);
  }
  const result = await buildShards({
    databasePath: dbArg,
    outputDir: outArg,
    policy: policyArg,
  });
  console.log(
    `CAREER_SHARDS_BUILT shards=${result.shards.length} families=${result.manifest.familyGroups.join(',') || 'none'} digest=${result.manifest.contentDigest}`
  );
}
