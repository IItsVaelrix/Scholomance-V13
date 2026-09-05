/**
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *
 *   node scripts/seed-amp-item-pipeline-records.mjs
 *
 * Isomorphic, browser-safe data module: the exact rows
 * `loadRelevanceRecordsSync()` (in load-relevance-records-sync.js) returns,
 * frozen and statically imported — zero `node:*` imports, at any syntax
 * level, so this module is safe for code the browser bundle reaches
 * (item-foundry.js -> src/lib/pixelbrain.adapter.js). The Node-only
 * directory reader this replaced for that path still exists, for tests and
 * regeneration validation only, as `loadRelevanceRecordsFromDir()` in
 * ./load-relevance-records-from-dir.js.
 *
 * Source of truth: this script's `RECORDS` array, run through
 * `createAmpRelevanceRecord()` — the tracked JSON files under
 * pilot-relevance/ are the human-readable/checksummed form of the same data,
 * written by this same script in the same run.
 *
 * @bytecode PB-AMP-RELEVANCE-v2
 */

export const GENERATED_RELEVANCE_RECORDS = Object.freeze([
  {
    pipeline: "item",
    ampId: "holyfire-motif-amp",
    order: 1,
    appliesToJson: "[{\"field\":\"class\",\"op\":\"eq\",\"value\":\"weapon\"},{\"field\":\"archetype\",\"op\":\"eq\",\"value\":\"sword\"},{\"anyOf\":[{\"field\":\"parts.profile\",\"op\":\"eq\",\"value\":\"weapon.sword.holyfire_motif\"},{\"field\":\"parts.id\",\"op\":\"eq\",\"value\":[\"holyFire\",\"holy_fire\"]}]}]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "shield-rim-amp",
    order: 4,
    appliesToJson: "[{\"field\":\"class\",\"op\":\"eq\",\"value\":\"armor\"},{\"field\":\"archetype\",\"op\":\"eq\",\"value\":\"kite_shield\"}]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "shield-volume-amp",
    order: 5,
    appliesToJson: "[{\"field\":\"class\",\"op\":\"eq\",\"value\":\"armor\"},{\"field\":\"archetype\",\"op\":\"eq\",\"value\":\"kite_shield\"}]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "chestplate-amp",
    order: 8,
    appliesToJson: "[{\"field\":\"class\",\"op\":\"eq\",\"value\":\"armor\"},{\"field\":\"archetype\",\"op\":\"includes\",\"value\":\"chestplate\"}]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "sketch-amp",
    order: 2,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "sdf-shape-amp",
    order: 3,
    appliesToJson: "[]",
    requiresJson: "[\"parts.sdf\"]",
  },
  {
    pipeline: "item",
    ampId: "heraldry-amp",
    order: 6,
    appliesToJson: "[]",
    requiresJson: "[\"heraldry\"]",
  },
  {
    pipeline: "item",
    ampId: "jewelry-amp",
    order: 7,
    appliesToJson: "[{\"anyOf\":[{\"field\":\"class\",\"op\":\"eq\",\"value\":[\"amulet\",\"ring\",\"jewelry\"]},{\"field\":\"parts.profile\",\"op\":\"includes\",\"value\":\"gem.\"},{\"field\":\"parts.id\",\"op\":\"includes\",\"value\":\"crystal\"},{\"field\":\"parts.id\",\"op\":\"includes\",\"value\":\"core\"}]}]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "geometry-amp",
    order: 9,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "region-fill-amp",
    order: 10,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "noise-fill-amp",
    order: 11,
    appliesToJson: "[]",
    requiresJson: "[\"parts.noise\"]",
  },
  {
    pipeline: "item",
    ampId: "selout-amp",
    order: 12,
    appliesToJson: "[]",
    requiresJson: "[\"light\"]",
  },
  {
    pipeline: "item",
    ampId: "pixel-aa-amp",
    order: 13,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "facet-amp",
    order: 14,
    appliesToJson: "[{\"field\":\"parts.shading\",\"op\":\"eq\",\"value\":\"faceted\"}]",
    requiresJson: "[\"light\"]",
  },
  {
    pipeline: "item",
    ampId: "square-sharpness-contrast-amp",
    order: 15,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "item",
    ampId: "volume-lift-amp",
    order: 16,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "cross-cutting",
    ampId: "symmetry-amp",
    order: 1,
    appliesToJson: "[]",
    requiresJson: "[]",
  },
  {
    pipeline: "terrain",
    ampId: "grass-amp",
    order: 1,
    appliesToJson: "[{\"field\":\"class\",\"op\":\"eq\",\"value\":\"terrain\"},{\"field\":\"archetype\",\"op\":\"eq\",\"value\":\"void_grove_grass\"}]",
    requiresJson: "[]",
  },
]);
