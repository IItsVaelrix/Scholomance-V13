#!/usr/bin/env node
/**
 * Seeds `codex/core/pixelbrain/amp-substrate/pilot-relevance/*.json` for the
 * `item` pipeline (and re-homes the pre-existing `symmetry-amp` pilot to
 * `cross-cutting`). Re-runnable and idempotent — the only sanctioned way to
 * produce a record's checksum is `createAmpRelevanceRecord`, so this script,
 * not hand-edited JSON, is the source of truth for these files.
 *
 * Predicates are measured directly from item-foundry.js's real current gates
 * (see docs/superpowers/specs/2026-09-04-amp-relevance-full-wiring-design.md
 * §6.1 for the call-order table this script's `order` values come from).
 *
 *   node scripts/seed-amp-item-pipeline-records.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAmpRelevanceRecord } from '../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PILOT_DIR = join(HERE, '../codex/core/pixelbrain/amp-substrate/pilot-relevance');

const RECORDS = [
  {
    pipeline: 'item', ampId: 'holyfire-motif-amp', order: 1, version: '2.0.0',
    description: 'Deterministic flame emission for holy-paladin swords; must run before template construction so motif cells join the silhouette (item-foundry.js:322-335).',
    concept: 'material-fx',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'weapon' },
      { field: 'archetype', op: 'eq', value: 'sword' },
      { anyOf: [
        { field: 'parts.profile', op: 'eq', value: 'weapon.sword.holyfire_motif' },
        { field: 'parts.id', op: 'eq', value: ['holyFire', 'holy_fire'] },
      ] },
    ],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'shield-rim-amp', order: 4, version: '2.0.0',
    description: 'Outer border, gold/bronze frame, rim thickness, corner highlights; gated on class:armor + archetype:kite_shield (item-foundry.js:381).',
    concept: 'structural',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'eq', value: 'kite_shield' },
    ],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'shield-volume-amp', order: 5, version: '2.0.0',
    description: 'Curved face shading, center plane, side shadows, rim cast shadows; gated on class:armor + archetype:kite_shield (item-foundry.js:382).',
    concept: 'lighting',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'eq', value: 'kite_shield' },
    ],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'chestplate-amp', order: 8, version: '2.0.0',
    description: 'Chestplate trim/plate templating; gated on class:armor + archetype includes chestplate (item-foundry.js:385).',
    concept: 'structural',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'includes', value: 'chestplate' },
    ],
    requires: [],
  },
  {
    pipeline: 'cross-cutting', ampId: 'symmetry-amp', order: 1, version: '1.0.1',
    description: 'Coordinate mirroring; called from nl-compile.js, scdl/passes/expand-symmetry.pass.js, scene-graph-renderer.js and others — genuinely cross-cutting, not item-pipeline specific.',
    concept: 'structural',
    appliesTo: [],
    requires: [],
  },
];

for (const fields of RECORDS) {
  const record = createAmpRelevanceRecord(fields);
  writeFileSync(join(PILOT_DIR, `${record.ampId}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[seed] wrote ${record.pipeline}/${record.ampId}.json  ${record.checksum.slice(0, 12)}…`);
}
