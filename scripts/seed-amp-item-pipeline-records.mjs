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
const GENERATED_FILE = join(HERE, '../codex/core/pixelbrain/amp-substrate/pilot-relevance.generated.js');

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
    pipeline: 'item', ampId: 'sketch-amp', order: 2, version: '1.0.0',
    description: 'Distance-transform shading template (sketchToSilhouette) — the base template pass every item goes through; item-foundry.js:374 calls it unconditionally.',
    concept: 'structural',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'sdf-shape-amp', order: 3, version: '1.0.0',
    description: 'Samples a signed-distance field at cell centers for parts that declare one; gated on parts.sdf presence (item-foundry.js:354-357).',
    concept: 'structural',
    appliesTo: [], requires: ['parts.sdf'],
  },
  {
    pipeline: 'item', ampId: 'heraldry-amp', order: 6, version: '1.0.0',
    description: 'Emblem stamping for shield faces/panels; both template and fill stages self-gate on spec.heraldry being a non-empty array (heraldry-amp.js:131,211).',
    concept: 'material-fx',
    appliesTo: [], requires: ['heraldry'],
  },
  {
    pipeline: 'item', ampId: 'jewelry-amp', order: 7, version: '1.0.0',
    description: 'Chains, gem settings, volume manipulation for jewelry; self-gates on spec.class in [amulet,ring,jewelry] OR any part with a gem.* profile / id containing crystal or core (jewelry-amp.js:8-9).',
    concept: 'material-fx',
    appliesTo: [{ anyOf: [
      { field: 'class', op: 'eq', value: ['amulet', 'ring', 'jewelry'] },
      { field: 'parts.profile', op: 'includes', value: 'gem.' },
      { field: 'parts.id', op: 'includes', value: 'crystal' },
      { field: 'parts.id', op: 'includes', value: 'core' },
    ] }],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'geometry-amp', order: 9, version: '1.0.0',
    description: 'Converts composed geometry into deterministic shader masks and construction diagnostics; item-foundry.js:387 calls it unconditionally for every item.',
    concept: 'structural',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'region-fill-amp', order: 10, version: '1.0.0',
    description: 'Color authority for the Item Foundry — every cell gets its part fill or outline color; item-foundry.js:407 calls it unconditionally.',
    concept: 'material-fx',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'noise-fill-amp', order: 11, version: '1.0.0',
    description: 'Modulates material intensity/variation on existing cells; gated on parts.noise presence (item-foundry.js:413-414).',
    concept: 'material-fx',
    appliesTo: [], requires: ['parts.noise'],
  },
  {
    pipeline: 'item', ampId: 'selout-amp', order: 12, version: '1.0.0',
    description: 'Modulates outline color by light orientation; self-gates on spec.light being present (selout-amp.js:10).',
    concept: 'outline',
    appliesTo: [], requires: ['light'],
  },
  {
    pipeline: 'item', ampId: 'pixel-aa-amp', order: 13, version: '1.0.0',
    description: 'Softens 1-cell silhouette stair-steps by recoloring inner corners; item-foundry.js:425 calls it unconditionally.',
    concept: 'outline',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'facet-amp', order: 14, version: '1.0.0',
    description: 'Partitions gem-class parts into planar regions with flat shading; self-gates on spec.light present AND at least one part with shading:"faceted" (facet-amp.js:19,26).',
    concept: 'lighting',
    appliesTo: [{ field: 'parts.shading', op: 'eq', value: 'faceted' }],
    requires: ['light'],
  },
  {
    pipeline: 'item', ampId: 'square-sharpness-contrast-amp', order: 15, version: '1.0.0',
    description: 'HD edge-sharpness/contrast pass over the final fill coordinates; item-foundry.js:434 calls it unconditionally for every item.',
    concept: 'outline',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'volume-lift-amp', order: 16, version: '1.0.0',
    description: 'Lifts 2D structural energy into a 3D voxel volume. NOT cutover-eligible: item-foundry.js only calls it as a fallback when opts.includeVolume !== false AND the class route did not already emit routeVolume (item-foundry.js:566-577) — both are call-time/computed state, not spec content selectActiveAmps can see. Registered for discovery only; its item-foundry.js call site is unchanged.',
    concept: 'structural',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'cross-cutting', ampId: 'symmetry-amp', order: 1, version: '1.0.1',
    description: 'Coordinate mirroring; called from nl-compile.js, scdl/passes/expand-symmetry.pass.js, scene-graph-renderer.js and others — genuinely cross-cutting, not item-pipeline specific.',
    concept: 'structural',
    appliesTo: [],
    requires: [],
  },
  {
    // NOTE on this record's honesty status, unlike the item-pipeline records
    // above: those predicates were MEASURED from a real, pre-existing gate
    // inside item-foundry.js. This one is DESIGNED — grass-amp.js and its
    // caller (generate-grass-blades.mjs) were both built in this same
    // session, so there was no prior scattered `if` to transcribe. The gate
    // below (class:terrain + archetype:void_grove_grass) is the real
    // condition the caller now checks before invoking GrassAMP, not a
    // retrofit — but it is a first-caller design, not a measurement.
    pipeline: 'terrain', ampId: 'grass-amp', order: 1, version: '1.0.0',
    description: 'Procedural grass blade geometry (root-to-tip shading, deterministic volume distribution, crisscrossing depth layers) for top-down ground tiles; see codex/core/pixelbrain/grass-amp.js. Gated on class:terrain + archetype:void_grove_grass (the terrain spec shape this pipeline\'s first real caller, generate-grass-blades.mjs, actually passes).',
    concept: 'material-fx',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'terrain' },
      { field: 'archetype', op: 'eq', value: 'void_grove_grass' },
    ],
    requires: [],
  },
];

const generatedRows = [];

for (const fields of RECORDS) {
  const record = createAmpRelevanceRecord(fields);
  writeFileSync(join(PILOT_DIR, `${record.ampId}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[seed] wrote ${record.pipeline}/${record.ampId}.json  ${record.checksum.slice(0, 12)}…`);

  // Same row shape `loadRelevanceRecordsSync()` has always returned — generated
  // straight from this script's in-memory `RECORDS`/`createAmpRelevanceRecord()`
  // output, not re-read off the JSON files we just wrote.
  generatedRows.push({
    pipeline: record.pipeline,
    ampId: record.ampId,
    order: record.order,
    appliesToJson: JSON.stringify(record.appliesTo ?? []),
    requiresJson: JSON.stringify(record.requires ?? []),
  });
}

function formatRow(row) {
  return [
    '  {',
    `    pipeline: ${JSON.stringify(row.pipeline)},`,
    `    ampId: ${JSON.stringify(row.ampId)},`,
    `    order: ${row.order},`,
    `    appliesToJson: ${JSON.stringify(row.appliesToJson)},`,
    `    requiresJson: ${JSON.stringify(row.requiresJson)},`,
    '  },',
  ].join('\n');
}

const generatedSource = `/**
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *
 *   node scripts/seed-amp-item-pipeline-records.mjs
 *
 * Isomorphic, browser-safe data module: the exact rows
 * \`loadRelevanceRecordsSync()\` (in load-relevance-records-sync.js) returns,
 * frozen and statically imported — zero \`node:*\` imports, at any syntax
 * level, so this module is safe for code the browser bundle reaches
 * (item-foundry.js -> src/lib/pixelbrain.adapter.js). The Node-only
 * directory reader this replaced for that path still exists, for tests and
 * regeneration validation only, as \`loadRelevanceRecordsFromDir()\` in
 * ./load-relevance-records-from-dir.js.
 *
 * Source of truth: this script's \`RECORDS\` array, run through
 * \`createAmpRelevanceRecord()\` — the tracked JSON files under
 * pilot-relevance/ are the human-readable/checksummed form of the same data,
 * written by this same script in the same run.
 *
 * @bytecode PB-AMP-RELEVANCE-v2
 */

export const GENERATED_RELEVANCE_RECORDS = Object.freeze([
${generatedRows.map(formatRow).join('\n')}
]);
`;

writeFileSync(GENERATED_FILE, generatedSource);
console.log(`[seed] wrote ${generatedRows.length} rows to codex/core/pixelbrain/amp-substrate/pilot-relevance.generated.js`);
