// codex/core/lexical-graph/seedValidate.js
//
// Schema validation for the literary-device seed catalog
// (codex/data/literary-devices/seed.v1.json). Pure, no I/O, no SQLite.
// The seeder must reject the whole transaction if this throws — every
// definition and example requires a license/provenance, every detection
// signal must be schema-valid and machine-addressable. See:
// docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md

const VALID_DETECTION_KINDS = new Set([
  'token_repeat',
  'syntactic_parallel',
  'semantic_opposition',
  'comparison_marker',
  'line_position',
  'semantic_incongruity',
  'custom',
]);

const VALID_SIGNAL_SCOPES = new Set(['token', 'line', 'stanza', 'document']);

const VALID_RELATION_KINDS = new Set([
  'synonym',
  'antonym',
  'rhymes_with',
  'sounds_like',
  'symbolizes',
  'evokes',
  'intensifies',
  'contrasts_with',
  'commonly_follows',
  'example_of',
  'used_with',
  'commonly_confused_with',
  'related_device',
]);

// Confuse-set that must never assert `contrasts_with` between its members —
// only `commonly_confused_with` (bidirectional, written by the seeder).
const CONFUSE_ONLY_SET = new Set(['antithesis', 'juxtaposition', 'paradox', 'oxymoron']);

function fail(message) {
  throw new Error(`PB-ERR-v1-VALUE: ${message}`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}

function validateProvenance(list, slug) {
  const label = `devices.${slug}.definitionsProvenance`;
  assertArray(list, label);
  if (list.length === 0) fail(`${label} must be non-empty`);
  list.forEach((item, i) => {
    assertPlainObject(item, `${label}[${i}]`);
    assertNonEmptyString(item.source, `${label}[${i}].source`);
    assertNonEmptyString(item.license, `${label}[${i}].license`);
  });
}

function validateDetectionSignals(list, slug) {
  const label = `devices.${slug}.detectionSignals`;
  assertArray(list, label);
  if (list.length === 0) fail(`${label} must be non-empty`);
  list.forEach((signal, i) => {
    const item = `${label}[${i}]`;
    assertPlainObject(signal, item);
    assertNonEmptyString(signal.id, `${item}.id`);
    assertNonEmptyString(signal.kind, `${item}.kind`);
    if (!VALID_DETECTION_KINDS.has(signal.kind)) {
      fail(`${item}.kind is not a recognized DetectionSignalKind: ${signal.kind}`);
    }
    assertNonEmptyString(signal.description, `${item}.description`);
    if (typeof signal.weight !== 'number' || !Number.isFinite(signal.weight)) {
      fail(`${item}.weight must be a finite number`);
    }
    assertPlainObject(signal.parameters, `${item}.parameters`);
    if (signal.scope !== undefined && !VALID_SIGNAL_SCOPES.has(signal.scope)) {
      fail(`${item}.scope must be one of token/line/stanza/document`);
    }
  });
}

function validatePurposes(list, slug) {
  const label = `devices.${slug}.purposes`;
  assertArray(list, label);
  if (list.length === 0) fail(`${label} must be non-empty`);
  list.forEach((purpose, i) => {
    const item = `${label}[${i}]`;
    assertPlainObject(purpose, item);
    assertNonEmptyString(purpose.id, `${item}.id`);
    assertNonEmptyString(purpose.description, `${item}.description`);
  });
}

function validateCompatibleStructures(list, slug) {
  const label = `devices.${slug}.compatibleStructures`;
  assertArray(list, label);
  list.forEach((structure, i) => assertNonEmptyString(structure, `${label}[${i}]`));
}

function validateExamples(list, slug) {
  const label = `devices.${slug}.examples`;
  assertArray(list, label);
  if (list.length === 0) fail(`${label} must be non-empty`);
  list.forEach((example, i) => {
    const item = `${label}[${i}]`;
    assertPlainObject(example, item);
    assertNonEmptyString(example.text, `${item}.text`);
    assertNonEmptyString(example.license, `${item}.license`);
    if (example.source !== undefined) assertNonEmptyString(example.source, `${item}.source`);
    if (example.note !== undefined) assertNonEmptyString(example.note, `${item}.note`);
  });
}

function validateRelations(list, slug, knownSlugs) {
  const label = `devices.${slug}.relations`;
  assertArray(list, label);
  list.forEach((relation, i) => {
    const item = `${label}[${i}]`;
    assertPlainObject(relation, item);
    assertNonEmptyString(relation.targetSlug, `${item}.targetSlug`);
    assertNonEmptyString(relation.relation, `${item}.relation`);
    if (!VALID_RELATION_KINDS.has(relation.relation)) {
      fail(`${item}.relation is not a recognized LexicalRelationKind: ${relation.relation}`);
    }
    if (typeof relation.strength !== 'number' || relation.strength < 0 || relation.strength > 1) {
      fail(`${item}.strength must be a number between 0 and 1`);
    }
    if (relation.symmetric !== undefined && typeof relation.symmetric !== 'boolean') {
      fail(`${item}.symmetric must be a boolean when present`);
    }
    if (knownSlugs && !knownSlugs.has(relation.targetSlug)) {
      fail(`${item}.targetSlug references unknown device slug: ${relation.targetSlug}`);
    }
  });
}

function validateConfuseSetUsesConfusionOnly(devices) {
  for (const device of devices) {
    if (!CONFUSE_ONLY_SET.has(device.slug)) continue;
    for (const relation of device.relations ?? []) {
      if (CONFUSE_ONLY_SET.has(relation.targetSlug) && relation.relation === 'contrasts_with') {
        fail(
          `devices.${device.slug}.relations: contrasts_with is not allowed within the ` +
            `antithesis/juxtaposition/paradox/oxymoron confuse-set (target ${relation.targetSlug}); ` +
            'use commonly_confused_with instead',
        );
      }
    }
  }
}

/**
 * Validates a parsed literary-device seed document. Throws
 * `PB-ERR-v1-VALUE` on any schema violation (missing license, malformed
 * detection signal, unknown relation target, confuse-set misuse, etc).
 * Returns the same object unmodified on success.
 *
 * @param {unknown} seed
 * @returns {{ seedVersion: string, devices: object[] }}
 */
export function validateSeed(seed) {
  assertPlainObject(seed, 'seed');
  assertNonEmptyString(seed.seedVersion, 'seed.seedVersion');
  assertArray(seed.devices, 'seed.devices');
  if (seed.devices.length === 0) fail('seed.devices must be non-empty');

  const slugs = new Set();
  seed.devices.forEach((device, i) => {
    const label = `devices[${i}]`;
    assertPlainObject(device, label);
    assertNonEmptyString(device.slug, `${label}.slug`);
    if (slugs.has(device.slug)) fail(`duplicate device slug: ${device.slug}`);
    slugs.add(device.slug);
  });

  for (const device of seed.devices) {
    const { slug } = device;
    assertNonEmptyString(device.name, `devices.${slug}.name`);
    assertArray(device.aliases, `devices.${slug}.aliases`);
    device.aliases.forEach((alias, i) => assertNonEmptyString(alias, `devices.${slug}.aliases[${i}]`));
    assertNonEmptyString(device.definition, `devices.${slug}.definition`);
    validateProvenance(device.definitionsProvenance, slug);
    validateDetectionSignals(device.detectionSignals, slug);
    validatePurposes(device.purposes, slug);
    validateCompatibleStructures(device.compatibleStructures ?? [], slug);
    validateExamples(device.examples, slug);
    validateRelations(device.relations ?? [], slug, slugs);
  }

  validateConfuseSetUsesConfusionOnly(seed.devices);

  return seed;
}
