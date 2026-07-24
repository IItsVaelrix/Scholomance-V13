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

/**
 * Verify a single shard database against its manifest entry.
 *
 * @param {{ shardPath: string, expectedChecksum: string, policy: string }} args
 * @returns {{ shardPath: string, ok: boolean, errors: string[], conceptCount: number, relationCount: number, concepts: object[] }}
 */
export function verifyShardFile({ shardPath, expectedChecksum, policy }) {
  const errors = [];
  const db = new Database(shardPath, { readonly: true });
  let concepts = [];
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
    const relations = db.prepare('SELECT * FROM career_relation ORDER BY id').all();

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
  return { shardPath, ok: errors.length === 0, errors, conceptCount, relationCount, concepts };
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
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    shardCount: manifest.shards.length,
    residency,
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
    console.log(`CAREER_SHARDS_VERIFIED shards=${result.shardCount}`);
  } else {
    console.error(`CAREER_SHARDS_INVALID\n${result.errors.join('\n')}`);
    process.exit(1);
  }
}
