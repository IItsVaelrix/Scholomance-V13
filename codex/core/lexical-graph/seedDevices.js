// codex/core/lexical-graph/seedDevices.js
// Offline ops write path — exempt from server SQLite write-queue (see .eslintrc).
//
// Loads the curated literary-device catalog (codex/data/literary-devices/)
// and writes it into the lexical-graph overlay: one `lexical_entry`
// (type='device') + `literary_device` row per device, FTS sync, and
// `lexical_relation` edges for every declared relation (bidirectional
// unless `symmetric: false`). `literary_device` never stores edge lists —
// `lexical_relation` is the sole edge authority. See:
// docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { canonicalizeLower, deviceLexicalId } from './canonicalize.js';
import { syncLexicalEntryFts } from './ftsSync.js';
import { validateSeed } from './seedValidate.js';
import { LITERARY_DEVICE_SEED_VERSION } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_PATH = path.resolve(__dirname, '../../data/literary-devices/seed.v1.json');

function loadSeed(seedPath) {
  let raw;
  try {
    raw = readFileSync(seedPath, 'utf8');
  } catch {
    throw new Error(`PB-ERR-v1-VALUE: seed file not found: ${seedPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`PB-ERR-v1-VALUE: seed file is not valid JSON: ${seedPath}`);
  }

  return validateSeed(parsed);
}

/**
 * Seeds the curated literary-device catalog into the lexical-graph overlay.
 * One transaction: validation failure or any write failure rolls back
 * everything (no partial devices, no partial relations).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ timestamp: string, seedPath?: string }} options
 * @returns {{ seeded: number }}
 */
export function seedLiteraryDevices(db, { timestamp, seedPath = DEFAULT_SEED_PATH } = {}) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    throw new Error('PB-ERR-v1-VALUE: seed-devices requires caller timestamp');
  }

  db.pragma('foreign_keys = ON');

  const seed = loadSeed(seedPath);

  const upsertEntry = db.prepare(`
    INSERT INTO lexical_entry (
      id, type, canonical_text, canonical_lower, entry_id,
      definitions_json, provenance_json, created_at, updated_at
    ) VALUES (
      @id, 'device', @canonical_text, @canonical_lower, NULL,
      @definitions_json, @provenance_json, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      canonical_text = excluded.canonical_text,
      canonical_lower = excluded.canonical_lower,
      definitions_json = excluded.definitions_json,
      provenance_json = excluded.provenance_json,
      updated_at = excluded.updated_at
  `);

  const upsertDevice = db.prepare(`
    INSERT INTO literary_device (
      id, name, aliases_json, definition, detection_signals_json,
      purposes_json, compatible_structures_json, examples_json
    ) VALUES (
      @id, @name, @aliases_json, @definition, @detection_signals_json,
      @purposes_json, @compatible_structures_json, @examples_json
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      aliases_json = excluded.aliases_json,
      definition = excluded.definition,
      detection_signals_json = excluded.detection_signals_json,
      purposes_json = excluded.purposes_json,
      compatible_structures_json = excluded.compatible_structures_json,
      examples_json = excluded.examples_json
  `);

  const upsertRelation = db.prepare(`
    INSERT INTO lexical_relation (source_id, target_id, relation, strength)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, relation) DO UPDATE SET strength = excluded.strength
  `);

  const stampMeta = db.prepare(`
    INSERT INTO meta(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = db.transaction(() => {
    const idBySlug = new Map();

    for (const device of seed.devices) {
      idBySlug.set(device.slug, deviceLexicalId(device.slug));
    }

    for (const device of seed.devices) {
      const id = idBySlug.get(device.slug);

      upsertEntry.run({
        id,
        canonical_text: device.name,
        canonical_lower: canonicalizeLower(device.name),
        definitions_json: JSON.stringify([{ text: device.definition }]),
        provenance_json: JSON.stringify(device.definitionsProvenance),
        created_at: timestamp,
        updated_at: timestamp,
      });

      upsertDevice.run({
        id,
        name: device.name,
        aliases_json: JSON.stringify(device.aliases),
        definition: device.definition,
        detection_signals_json: JSON.stringify(device.detectionSignals),
        purposes_json: JSON.stringify(device.purposes),
        compatible_structures_json: JSON.stringify(device.compatibleStructures ?? []),
        examples_json: JSON.stringify(device.examples),
      });

      syncLexicalEntryFts(db, id);
    }

    for (const device of seed.devices) {
      const sourceId = idBySlug.get(device.slug);
      for (const relation of device.relations ?? []) {
        const targetId = idBySlug.get(relation.targetSlug);
        if (!targetId) {
          throw new Error(
            `PB-ERR-v1-STATE: seed relation on ${device.slug} targets unknown device slug: ${relation.targetSlug}`,
          );
        }
        upsertRelation.run(sourceId, targetId, relation.relation, relation.strength);
        if (relation.symmetric !== false) {
          upsertRelation.run(targetId, sourceId, relation.relation, relation.strength);
        }
      }
    }

    stampMeta.run('literary_device_seed_version', seed.seedVersion || LITERARY_DEVICE_SEED_VERSION);

    return { seeded: seed.devices.length };
  });

  return tx();
}
