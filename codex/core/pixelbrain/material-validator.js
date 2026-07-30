/**
 * Material Validator — compartment and self-consistency laws.
 *
 * A material id is a foreign key that several subsystems each resolve against
 * their own table. Nothing forced those tables to agree, so a species could be
 * fully real to one and nonexistent to another. This checks that they agree.
 *
 * Modelled on GEM reconstruction QC, taking the reconstruction half and leaving
 * the simulation half: compartment gap analysis and self-consistency are
 * mechanical and total; there is no flux to solve for in a registry.
 *
 * Scope limit, and it is deliberate: ramps are **authored**, not discovered. A
 * human may restyle `darksteel` tomorrow and be right. This validator can only
 * check **internal consistency** — does a species agree with itself, do the
 * tables agree about it — never **correctness**. It reports; it does not
 * adjudicate taste.
 *
 * Every exception must be a declared property of the species (`emissive: true`),
 * never an allowance inside a law. A checker that accumulates special cases is
 * a checker that eventually gets disabled.
 *
 * @bytecode PB-MATERIAL-VALIDATE-v1
 */

import { MATERIAL_PALETTES, MATERIAL_SHADER_INDEX, MATERIAL_GRAIN } from './material-registry.js';
import { MATERIAL_TO_TEXTURE } from './vixel/vri-compiler.js';

export const MATERIAL_VALIDATOR_CONTRACT = 'PB-MATERIAL-VALIDATE-v1';

export const LAWS = Object.freeze({
  DEAD_END: 'dead-end',
  RAMP_ORDER: 'ramp-order',
  DUPLICATE_SPECIES: 'duplicate-species',
  CATEGORY_COHERENCE: 'category-coherence',
});

export const SEVERITY = Object.freeze({ ERROR: 'error', WARN: 'warn' });

/**
 * Compartment kinds.
 *
 * TOTAL  — every species must appear. Absence is a dead end.
 * SPARSE — the compartment encodes an optional capability; absence is legal.
 *
 * The distinction is load-bearing. Treating `texture` as total reports 46 dead
 * ends, 41 of them legitimate (no `hair_*`, `skin_*`, `eye_*` or `cloth_*`
 * species has a procedural texture, by design) and the five real ones drown.
 */
export const COMPARTMENT_KIND = Object.freeze({ TOTAL: 'total', SPARSE: 'sparse' });

export const DEFAULT_COMPARTMENTS = Object.freeze({
  palette: { kind: COMPARTMENT_KIND.TOTAL, keys: () => Object.keys(MATERIAL_PALETTES) },
  shader: { kind: COMPARTMENT_KIND.TOTAL, keys: () => Object.keys(MATERIAL_SHADER_INDEX) },
  grain: { kind: COMPARTMENT_KIND.SPARSE, keys: () => Object.keys(MATERIAL_GRAIN) },
  texture: { kind: COMPARTMENT_KIND.SPARSE, keys: () => Object.keys(MATERIAL_TO_TEXTURE) },
});

const HEX = /^#[0-9A-Fa-f]{6}$/;

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function anchorsOf(definition) {
  return Object.entries(definition?.anchors || {}).filter(([, hex]) => typeof hex === 'string' && HEX.test(hex));
}

/**
 * Validate the material registry against the compartment and consistency laws.
 *
 * @param {object} [options]
 * @param {object} [options.compartments] - override DEFAULT_COMPARTMENTS
 * @param {object} [options.palettes] - override MATERIAL_PALETTES (for testing)
 * @param {string[]} [options.exempt] - species exempt from all laws
 * @returns {{ ok, contract, findings, summary }}
 */
export function validateMaterialRegistry(options = {}) {
  const {
    compartments = DEFAULT_COMPARTMENTS,
    palettes = MATERIAL_PALETTES,
    // `source` is the passthrough species: no anchors by design, exempt from ramp laws.
    exempt = ['source'],
  } = options;

  const exemptSet = new Set(exempt);
  const findings = [];
  const add = (law, severity, species, detail, extra = {}) =>
    findings.push({ law, severity, species, detail, ...extra });

  const sets = {};
  for (const [name, spec] of Object.entries(compartments)) sets[name] = new Set(spec.keys());
  const totals = Object.entries(compartments)
    .filter(([, s]) => s.kind === COMPARTMENT_KIND.TOTAL)
    .map(([n]) => n);

  const allSpecies = new Set(Object.values(sets).flatMap(s => [...s]));

  // ── Law 1: dead end — present somewhere, absent from a total compartment ──
  for (const species of [...allSpecies].sort()) {
    if (exemptSet.has(species)) continue;
    const missing = totals.filter(t => !sets[t].has(species));
    if (missing.length === 0) continue;
    const declaredIn = Object.keys(sets).filter(n => sets[n].has(species));
    add(LAWS.DEAD_END, SEVERITY.ERROR, species,
      `declared in [${declaredIn.join(', ')}] but missing from total compartment(s) [${missing.join(', ')}]`,
      { missingFrom: missing, declaredIn });
  }

  // ── Law 2: ramp order — anchors are an energy ramp, dark to bright ────────
  // qbit-phosphorylation indexes Object.values(anchors) by SDF depth, rim to
  // core, so insertion order IS the energy axis. A species that genuinely emits
  // off the thermal ordering must declare `emissive: true`.
  for (const [species, definition] of Object.entries(palettes)) {
    if (exemptSet.has(species)) continue;
    if (definition?.rules?.passthrough) continue;
    if (definition?.emissive === true) continue;

    const anchors = anchorsOf(definition);
    if (anchors.length < 2) continue;

    const inversions = [];
    for (let i = 1; i < anchors.length; i++) {
      const prev = luminance(anchors[i - 1][1]);
      const curr = luminance(anchors[i][1]);
      if (curr < prev) {
        inversions.push({
          from: anchors[i - 1][0], to: anchors[i][0],
          fromLuminance: Number(prev.toFixed(3)), toLuminance: Number(curr.toFixed(3)),
        });
      }
    }
    if (inversions.length > 0) {
      add(LAWS.RAMP_ORDER, SEVERITY.ERROR, species,
        `anchor order is not dark-to-bright: ${inversions.map(v => `${v.from}(${v.fromLuminance}) > ${v.to}(${v.toLuminance})`).join(', ')}`
        + '. Declare `emissive: true` if this species deliberately emits off the thermal ordering.',
        { inversions });
    }
  }

  // ── Law 3: duplicate species — distinct ids, identical ramps ──────────────
  const byRamp = new Map();
  for (const [species, definition] of Object.entries(palettes)) {
    if (exemptSet.has(species)) continue;
    const anchors = anchorsOf(definition);
    if (anchors.length === 0) continue;
    const key = anchors.map(([, hex]) => hex.toUpperCase()).join(',');
    if (!byRamp.has(key)) byRamp.set(key, []);
    byRamp.get(key).push(species);
  }
  for (const [, group] of byRamp) {
    if (group.length < 2) continue;
    const sorted = [...group].sort();
    add(LAWS.DUPLICATE_SPECIES, SEVERITY.WARN, sorted[0],
      `identical ramp to ${sorted.slice(1).join(', ')} — distinct species or a spelling that acquired its own identity?`,
      { group: sorted });
  }

  // ── Law 4: category coherence — a base family agrees about its category ───
  // Derived from the registry rather than a hand-declared taxonomy: species
  // sharing a name token must share a category. This needs no vocabulary of
  // mine and so cannot be tuned to fit.
  // A *family* is a token whose members overwhelmingly agree on a category.
  // A *trait* is a token that crosses categories by design — `void` spans all
  // four and darkens the ramp in each, so grouping by it proves nothing. Only
  // families can testify about a category, so dominance is required before a
  // token is allowed to accuse anything.
  const FAMILY_DOMINANCE = 0.75;
  const FAMILY_MIN_MEMBERS = 3;

  const byToken = new Map();
  for (const [species, definition] of Object.entries(palettes)) {
    if (exemptSet.has(species)) continue;
    for (const token of species.split('_')) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push({ species, category: definition.category });
    }
  }

  const families = new Map(); // token -> { category, members }
  for (const [token, members] of byToken) {
    if (members.length < FAMILY_MIN_MEMBERS) continue;
    const counts = new Map();
    for (const m of members) counts.set(m.category, (counts.get(m.category) || 0) + 1);
    const [topCat, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topN / members.length < FAMILY_DOMINANCE) continue; // a trait, not a family
    families.set(token, {
      category: topCat,
      members: members.filter(m => m.category === topCat).map(m => m.species),
    });
  }

  for (const [species, definition] of Object.entries(palettes)) {
    if (exemptSet.has(species)) continue;
    const owning = species.split('_')
      .filter(t => families.has(t))
      .map(t => ({ token: t, ...families.get(t) }));

    // A species in two families with different categories is inherently
    // ambiguous — `eye_void_glow` is both an `eye` (organic) and a `glow`
    // (flame), and neither reading is wrong. Only an unambiguous member can
    // be said to disagree with its family.
    const distinctCats = new Set(owning.map(f => f.category));
    if (owning.length !== 1 || distinctCats.size !== 1) continue;

    const family = owning[0];
    if (definition.category === family.category) continue;
    add(LAWS.CATEGORY_COHERENCE, SEVERITY.WARN, species,
      `categorised '${definition.category}' while ${family.members.length} other '${family.token}' species are '${family.category}' (${family.members.join(', ')})`,
      { token: family.token, category: definition.category, familyCategory: family.category });
  }

  const errors = findings.filter(f => f.severity === SEVERITY.ERROR);
  return Object.freeze({
    ok: errors.length === 0,
    contract: MATERIAL_VALIDATOR_CONTRACT,
    findings: Object.freeze(findings),
    summary: Object.freeze({
      species: allSpecies.size,
      errors: errors.length,
      warnings: findings.length - errors.length,
      byLaw: Object.fromEntries(
        Object.values(LAWS).map(law => [law, findings.filter(f => f.law === law).length]),
      ),
    }),
  });
}

/** Render a report for terminal output. */
export function formatMaterialReport(result) {
  const lines = [`${result.contract} — ${result.ok ? 'PASS' : 'FAIL'}`,
    `  species ${result.summary.species}  errors ${result.summary.errors}  warnings ${result.summary.warnings}`];
  for (const law of Object.values(LAWS)) {
    const group = result.findings.filter(f => f.law === law);
    if (group.length === 0) continue;
    lines.push('', `  ${law} (${group.length})`);
    for (const f of group) lines.push(`    [${f.severity}] ${f.species}: ${f.detail}`);
  }
  return lines.join('\n');
}
