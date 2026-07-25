// Career Graph shard verifier (Gate C).
//
// Reads manifest.json and verifies, for every shard: SQLite integrity,
// referential integrity (no orphan relations within the shard), and the
// sealed checksum. Also verifies the residency law (core + universal pinned,
// at most three family shards resident) and that shared concepts keep an
// identical identity across every shard that contains them.

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { computeBuildChecksum } from './build-database.mjs';
import { RESIDENCY_POLICY } from './build-shards.mjs';

// ────────────────────────────────────────────────────────────────────────────
// COVERAGE LAW — a structurally valid graph is not automatically a useful one.
//
// This pipeline once shipped 1018 occupations with 5 relations: an ingest
// column-name mismatch dropped every O*NET skill row, and integrity, checksum,
// residency and orphan checks all passed over the result, because each of them
// only asks whether the edges that exist are well-formed. None of them asks
// whether the edges exist at all.
//
//   - `requiresSkillEdgesPerOccupationSource`: any source release that
//     contributed occupation concepts must also contribute at least one
//     requires_skill edge. Structural, no magic number: it catches a whole
//     source silently ingesting nothing, which is the failure that occurred.
//   - `minSkilledOccupationRatio`: the fraction of occupations carrying at
//     least one requires_skill edge. O*NET 30.3 rates ~88% of SOC codes
//     (894/1016), so the floor sits well below the real value and trips on a
//     mapping regression rather than on normal source gaps.
// ────────────────────────────────────────────────────────────────────────────
export const COVERAGE_POLICY = Object.freeze({
  requiresSkillEdgesPerOccupationSource: true,
  minSkilledOccupationRatio: 0.5,
});

/**
 * Verify a single shard database against its manifest entry.
 *
 * @param {{ shardPath: string, expectedChecksum: string, policy: string }} args
 * @returns {{ shardPath: string, ok: boolean, errors: string[], conceptCount: number, relationCount: number, concepts: object[], relations: object[] }}
 */
export function verifyShardFile({ shardPath, expectedChecksum, policy }) {
  const errors = [];
  const db = new Database(shardPath, { readonly: true });
  let concepts = [];
  let relations = [];
  let conceptCount = 0;
  let relationCount = 0;
  try {
    const integrity = db.pragma('integrity_check');
    if (!(Array.isArray(integrity) && integrity[0]?.integrity_check === 'ok')) {
      errors.push(`SHARD_INTEGRITY_FAILED:${shardPath}`);
    }

    conceptCount = db.prepare('SELECT count(*) n FROM career_concept').get().n;
    relationCount = db.prepare('SELECT count(*) n FROM career_relation').get().n;
    concepts = db.prepare('SELECT * FROM career_concept ORDER BY id').all();
    relations = db.prepare('SELECT * FROM career_relation ORDER BY id').all();

    // Referential integrity within the shard.
    const ids = new Set(concepts.map((c) => c.id));
    let orphans = 0;
    for (const r of relations) {
      if (!ids.has(r.from_concept_id) || !ids.has(r.to_concept_id)) orphans += 1;
    }
    if (orphans > 0) errors.push(`SHARD_ORPHAN_RELATIONS:${shardPath}:${orphans}`);

    // Sealed checksum.
    const checksum = computeBuildChecksum({
      schemaPolicy: db.prepare("SELECT value FROM career_build_meta WHERE key='schema_policy'").get()?.value,
      policy: `${policy}#shard=${db.prepare("SELECT value FROM career_build_meta WHERE key='shard_id'").get()?.value}`,
      concepts,
      relations,
    });
    if (checksum !== expectedChecksum) {
      errors.push(`SHARD_CHECKSUM_MISMATCH:${shardPath}:${checksum}`);
    }
  } finally {
    db.close();
  }
  return { shardPath, ok: errors.length === 0, errors, conceptCount, relationCount, concepts, relations };
}

/**
 * Apply the coverage law to the union of every shard's concepts and relations.
 *
 * Separated from I/O so it is directly testable against synthetic graphs.
 *
 * @param {{ concepts: object[], relations: object[] }} graph
 * @returns {{ errors: string[], stats: object }}
 */
export function verifyCoverage({ concepts, relations }) {
  const errors = [];

  const occupations = concepts.filter((c) => c.kind === 'occupation');
  const skillEdges = relations.filter((r) => r.predicate === 'requires_skill');
  const skilled = new Set(skillEdges.map((r) => r.from_concept_id));
  const skilledOccupations = occupations.filter((o) => skilled.has(o.id)).length;
  const ratio = occupations.length === 0 ? 0 : skilledOccupations / occupations.length;

  if (COVERAGE_POLICY.requiresSkillEdgesPerOccupationSource) {
    const edgeSources = new Set(skillEdges.map((r) => r.source_release));
    const occupationSources = [...new Set(occupations.map((c) => c.source_release))].sort();
    for (const release of occupationSources) {
      if (!edgeSources.has(release)) {
        errors.push(
          `COVERAGE_NO_SKILL_EDGES:${release} — contributed occupations but zero requires_skill relations`
        );
      }
    }
  }

  if (occupations.length > 0 && ratio < COVERAGE_POLICY.minSkilledOccupationRatio) {
    errors.push(
      `COVERAGE_FLOOR:skilledOccupationRatio=${ratio.toFixed(4)} ` +
      `(${skilledOccupations}/${occupations.length}) < ${COVERAGE_POLICY.minSkilledOccupationRatio}`
    );
  }

  return {
    errors,
    stats: {
      occupations: occupations.length,
      skilledOccupations,
      skilledOccupationRatio: ratio,
      skillEdges: skillEdges.length,
    },
  };
}

/**
 * Verify all shards described by a manifest directory.
 *
 * @param {string} shardDir directory containing manifest.json + shard files
 * @returns {Promise<{ ok: boolean, errors: string[], shardCount: number, residency: object }>}
 */
export async function verifyShards(shardDir) {
  const dir = resolve(shardDir);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8'));
  const errors = [];

  // Residency law.
  const residency = manifest.residency;
  if (!residency || residency.maxFamilyShards !== RESIDENCY_POLICY.maxFamilyShards) {
    errors.push(`RESIDENCY_LAW_VIOLATED:maxFamilyShards=${residency?.maxFamilyShards}`);
  }
  if (
    !residency ||
    !RESIDENCY_POLICY.pinned.every((p) => (residency.pinned || []).includes(p))
  ) {
    errors.push('RESIDENCY_LAW_VIOLATED:pinned-missing');
  }

  // Per-shard verification.
  const conceptIdentity = new Map(); // id -> canonical label
  // Shards overlap by design (shared concepts are duplicated), so the coverage
  // law runs over the de-duplicated union rather than per shard.
  const allConcepts = new Map();
  const allRelations = new Map();

  for (const entry of manifest.shards) {
    const shardPath = join(dir, entry.file);
    const result = verifyShardFile({
      shardPath,
      expectedChecksum: entry.checksum,
      policy: manifest.policy,
    });
    errors.push(...result.errors);

    // Shared concept identity must be identical across shards.
    for (const c of result.concepts) {
      const key = `${c.id}|${c.preferred_label}|${c.kind}`;
      if (conceptIdentity.has(c.id) && conceptIdentity.get(c.id) !== key) {
        errors.push(`SHARD_IDENTITY_DRIFT:${c.id}`);
      }
      conceptIdentity.set(c.id, key);
      allConcepts.set(c.id, c);
    }
    for (const r of result.relations) allRelations.set(r.id, r);
  }

  const coverage = verifyCoverage({
    concepts: [...allConcepts.values()],
    relations: [...allRelations.values()],
  });
  errors.push(...coverage.errors);

  return {
    ok: errors.length === 0,
    errors,
    shardCount: manifest.shards.length,
    residency,
    coverage: coverage.stats,
  };
}

// CLI: node scripts/career-graph/verify-shards.mjs <shardDir>
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const [, , dirArg] = process.argv;
  if (!dirArg) {
    console.error('usage: node scripts/career-graph/verify-shards.mjs <shardDir>');
    process.exit(2);
  }
  const result = await verifyShards(dirArg);
  if (result.ok) {
    const c = result.coverage;
    console.log(
      `CAREER_SHARDS_VERIFIED shards=${result.shardCount} ` +
      `occupations=${c.occupations} skilled=${c.skilledOccupations} ` +
      `(${(c.skilledOccupationRatio * 100).toFixed(1)}%) skillEdges=${c.skillEdges}`
    );
  } else {
    console.error(`CAREER_SHARDS_INVALID\n${result.errors.join('\n')}`);
    process.exit(1);
  }
}
