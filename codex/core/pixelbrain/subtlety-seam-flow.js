/**
 * LENS II — SEAM-FLOW (Coherence) for the Subtlety Fingerprint APM (PDR §6).
 *
 * Watches how fingerprints *compose* across the dataflow lattice. Distributed
 * tracing follows calls; Seam-Flow follows DATA OWNERSHIP. It reconstructs,
 * from observed fingerprints, which unit emitted / consumed / mutated each
 * field — the same consumes/emits/mutates vocabulary as seam-contract.js
 * (validateSeam), promoted from a compose-time gate to a runtime trace.
 *
 * Detects, in production traffic:
 *   - dangling input      (consumed a field nobody emitted, not a base input)
 *   - write-write race    (two units mutate the same field, no merge contract)
 *   - ownership collision (two units emit the same field)
 *
 * Dead tissue (PDR §6.3): an emitted field no downstream fingerprint consumes.
 * Runtime observation is NOT omniscient, so findings carry a confidence class,
 * never a bare assertion: confirmed-dead | unobserved | conditionally-consumed |
 * externally-exposed | reserved.
 */

/** Base inputs are never "dangling" — they enter the lattice from outside. */
function isBaseInput(key) {
  return (
    key.startsWith('spec.') ||
    key.startsWith('silhouette.') ||
    key.startsWith('construction.') ||
    key.startsWith('template.')
  );
}

/**
 * Build a live dataflow graph from a set of fingerprint packets.
 * Each packet contributes its unitId + { consumes, emits, mutates }.
 *
 * Returns:
 *   {
 *     units: [{ unitId, consumes, emits, mutates, mergeContract }],
 *     fieldOwners: Map<field, unitId[]>,   // who emits each field
 *     fieldMutators: Map<field, unitId[]>, // who mutates each field
 *     fieldConsumers: Map<field, unitId[]>,// who consumes each field
 *   }
 */
export function buildDataflowGraph(fingerprints) {
  const units = [];
  const fieldOwners = new Map();
  const fieldMutators = new Map();
  const fieldConsumers = new Map();

  const push = (map, field, unitId) => {
    if (!map.has(field)) map.set(field, []);
    if (!map.get(field).includes(unitId)) map.get(field).push(unitId);
  };

  // A graph node is a UNIT, not an observation. The same unit is fingerprinted
  // once per occurrence, so N readings of one crash unit must still collapse to
  // one node — otherwise every downstream check that iterates `units` reports
  // the same structural finding N times, scaling noise with crash frequency.
  // Seam vocabulary is unioned across readings: a unit's contract is everything
  // it has been observed to touch.
  const unitsById = new Map();
  const absorb = (list, values) => {
    for (const value of values) if (!list.includes(value)) list.push(value);
  };

  for (const fp of fingerprints || []) {
    const unitId = fp.identity?.unitId;
    const seam = fp.fingerprint || {};
    const consumes = seam.consumes || [];
    const emits = seam.emits || [];
    const mutates = seam.mutates || [];
    let unit = unitsById.get(unitId);
    if (!unit) {
      unit = { unitId, consumes: [], emits: [], mutates: [], mergeContract: null };
      unitsById.set(unitId, unit);
      units.push(unit);
    }
    absorb(unit.consumes, consumes);
    absorb(unit.emits, emits);
    absorb(unit.mutates, mutates);
    unit.mergeContract = unit.mergeContract || fp.mergeContract || null;
    for (const f of emits) push(fieldOwners, f, unitId);
    for (const f of mutates) push(fieldMutators, f, unitId);
    for (const f of consumes) push(fieldConsumers, f, unitId);
  }

  return { units, fieldOwners, fieldMutators, fieldConsumers };
}

/**
 * Detect runtime seam violations from a dataflow graph. Mirrors validateSeam's
 * three checks but reconstructed from observed ownership rather than a declared
 * route. Returns { ok, violations: [{ code, field, units, message }] }.
 */
export function detectSeamViolations(graph) {
  const violations = [];
  const { units, fieldOwners, fieldMutators } = graph;

  // Dangling input: consumed but emitted by nobody and not a base input.
  for (const unit of units) {
    for (const field of unit.consumes) {
      if (isBaseInput(field)) continue;
      if (!fieldOwners.has(field)) {
        violations.push({
          code: 'SUBTLETY_SEAM_DANGLING_INPUT',
          field,
          units: [unit.unitId],
          message: `Unit '${unit.unitId}' consumes '${field}' which no unit emitted.`,
        });
      }
    }
  }

  // Ownership collision: a field emitted by 2+ units.
  for (const [field, owners] of fieldOwners) {
    if (owners.length > 1) {
      violations.push({
        code: 'SUBTLETY_SEAM_OWNERSHIP_COLLISION',
        field,
        units: owners,
        message: `Field '${field}' is emitted by ${owners.length} units: ${owners.join(', ')}.`,
      });
    }
  }

  // Write-write race: a field mutated by 2+ units without a merge contract.
  for (const [field, mutators] of fieldMutators) {
    if (mutators.length > 1) {
      const hasMerge = units.some((u) => mutators.includes(u.unitId) && u.mergeContract);
      if (!hasMerge) {
        violations.push({
          code: 'SUBTLETY_SEAM_WRITE_WRITE_RACE',
          field,
          units: mutators,
          message: `Field '${field}' is mutated by ${mutators.length} units without an ordered merge contract: ${mutators.join(', ')}.`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Detect dead tissue: emitted fields with no observed downstream consumer.
 * `opts` calibrates confidence (runtime observation is not omniscient):
 *   {
 *     externalFields: [],    // consumed by a client/outside the traced lattice
 *     reservedFields: [],    // reserved for a future contract version
 *     conditionalFields: [], // consumed only on a branch the corpus may not have hit
 *     corpusCoverage: 0..1,  // fraction of the route's branches the corpus exercised
 *     evidenceCount: N,      // how many sampled requests observed (non-)consumption
 *   }
 * Returns { candidates: [{ field, owner, deadTissue: { status, evidenceCount, corpusCoverage } }] }.
 */
export function detectDeadTissue(graph, opts = {}) {
  const {
    externalFields = [],
    reservedFields = [],
    conditionalFields = [],
    corpusCoverage = 0,
    evidenceCount = 0,
  } = opts;
  const { fieldOwners, fieldConsumers } = graph;
  const candidates = [];

  for (const [field, owners] of fieldOwners) {
    if (isBaseInput(field)) continue;
    const consumed = fieldConsumers.has(field);
    if (consumed) continue; // genuinely consumed → not dead tissue

    let status;
    if (externalFields.includes(field)) status = 'externally-exposed';
    else if (reservedFields.includes(field)) status = 'reserved';
    else if (conditionalFields.includes(field)) status = 'conditionally-consumed';
    else if (corpusCoverage >= 1 && evidenceCount > 0) status = 'confirmed-dead';
    else status = 'unobserved';

    candidates.push({
      field,
      owner: owners[0] ?? null,
      deadTissue: { status, evidenceCount, corpusCoverage },
    });
  }

  return { candidates };
}
