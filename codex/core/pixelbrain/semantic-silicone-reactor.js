/**
 * Semantic Silicone Reactor — PB-SEMANTIC-SILICONE-CYCLOTRON-REPORT-v1
 *
 * Cyclotron-driven semantic silicone synthesis test engine.
 *
 * Implements electromagnetism principles, relativistic/cyclotron kinematics,
 * slingshot trajectory acceleration, high-energy collision-induced transmutation,
 * critical phase boundary modeling via orbital intersection kinematics,
 * compact DMT cyclic ring catalysis (direct D3/D4/D5 cyclosiloxane assembly),
 * graph-theoretic molecular validation, Macrophage screening, complete feature-based
 * Semantic Concept Grounding (all licensed species ports included), paired synthesis
 * benchmarking, decoupled physical vs semantic PPSP quench sweeps, and 2x2 Factorial
 * Causal Ablation analysis (isolating Topology vs Treatment kappa).
 *
 * PURE CORE — zero filesystem, zero network, zero process state, zero I/O.
 * 100% deterministic via mulberry32 PRNG and sha256 checksum sealing.
 *
 * @module codex/core/pixelbrain/semantic-silicone-reactor
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from './bytecode-error.js';
import {
  conceptVector,
  cosine,
} from './concept-chemistry.js';

export const SEMANTIC_SILICONE_ATOM_CONTRACT = 'PB-SEMANTIC-SILICONE-ATOM-v1';
export const SEMANTIC_SILICONE_MOLECULE_CONTRACT = 'PB-SEMANTIC-SILICONE-MOLECULE-v1';
export const SEMANTIC_SILICONE_CYCLOTRON_REPORT_CONTRACT = 'PB-SEMANTIC-SILICONE-CYCLOTRON-REPORT-v1';
export const SEMANTIC_SILICONE_PPSP_CONTRACT = 'PB-SEMANTIC-SILICONE-PPSP-v1';
export const SEMANTIC_SILICONE_CAUSAL_ABLATION_CONTRACT = 'PB-SEMANTIC-SILICONE-CAUSAL-ABLATION-v1';
export const SEMANTIC_SILICONE_RING_ISOLATION_CONTRACT = 'PB-SEMANTIC-SILICONE-RING-ISOLATION-v1';
export const SEMANTIC_SILICONE_SCHEMA_VERSION = '1.0.0';

/** Physical and simulation constants */
export const COULOMB_CONSTANT = 8.9875517923e9; // N·m²/C² (normalized scale)
export const TRANSMUTATION_THRESHOLD_ENERGY = 45.0; // Energy units required to shatter and transmute
export const MAX_SAFE_ROTATIONAL_SPEED = 280.0; // rad/s beyond which centrifugal shear dismantles bonds
export const MIN_TRANSMUTATION_SPIN = 35.0; // rad/s onset of the critical phase transition region

/**
 * Verdict thresholds. Declared here with their provenance so a verdict that flips
 * between runs is attributable to the data and not to a moved bar.
 *
 * PPSP_PERSISTENCE_MIN_MARGIN — set 2026-08-15. The PPSP verdict was previously
 *   `dmtArm.ppspRatio >= 0.50`, which never looked at the control arm and so could
 *   not tell "the treatment persists" from "everything persists". It is now a
 *   required MARGIN over control, in percentage points.
 * MIN_FACTORIAL_CELL_COUNT — the 2x2 ran with n=19 in one cell; below this the
 *   verdict is stamped __UNDERPOWERED rather than silently reported.
 * CAUSAL_EFFECT_EPSILON — effects smaller than this are not given a direction.
 */
export const PPSP_PERSISTENCE_MIN_MARGIN = 5.0;
export const MIN_FACTORIAL_CELL_COUNT = 20;
export const CAUSAL_EFFECT_EPSILON = 2.0;

export const CYCLOTRON_REGIMES = Object.freeze({
  SUB_CRITICAL: 'SUB_CRITICAL',
  CRITICAL_TRANSITION: 'CRITICAL_TRANSITION',
  RESONANT_SELF_ASSEMBLY: 'RESONANT_SELF_ASSEMBLY',
  HYPER_ROTATIONAL_TEAR: 'HYPER_ROTATIONAL_TEAR',
});

export const MOLECULAR_TOPOLOGIES = Object.freeze({
  LINEAR_SILOXANE_CHAIN: 'LINEAR_SILOXANE_CHAIN',
  CYCLIC_SILOXANE_RING: 'CYCLIC_SILOXANE_RING',
  CROSSLINKED_ELASTOMER_NETWORK: 'CROSSLINKED_ELASTOMER_NETWORK',
  UNSTABLE_CLUSTER: 'UNSTABLE_CLUSTER',
});

/** Ring strain energies for siloxane rings of order k (k = number of Si-O units) */
export const SILOXANE_RING_STRAIN = Object.freeze({
  3: 14.0, // D3: 6-membered Si3O3 ring, moderate angle strain
  4: 3.0,  // D4: 8-membered Si4O4 ring, puckered, optimal Si-O-Si bond angle ~143 deg
  5: 6.5,  // D5: 10-membered Si5O5 ring, slight conformational flexibility
  6: 11.0, // D6: 12-membered ring, higher entropic penalty
});

/**
 * Standard Transmuted Silicone Species Definitions
 */
export const SILICONE_SPECIES = Object.freeze({
  SILICON_CORE: Object.freeze({
    speciesId: 'si-core',
    name: 'Silicon Core Cation',
    element: 'Si',
    valence: 4,
    charge: 2.0,
    mass: 28.085,
    electronegativity: 1.90,
    radius: 1.11, // Angstrom
    offers: Object.freeze(['silicon-valence', 'd-orbital-acceptor']),
    seeks: Object.freeze(['oxygen-bridge', 'methyl-ligand', 'organo-group']),
  }),
  OXYGEN_BRIDGE: Object.freeze({
    speciesId: 'o-bridge',
    name: 'Bridging Oxygen Anion',
    element: 'O',
    valence: 2,
    charge: -2.0,
    mass: 15.999,
    electronegativity: 3.44,
    radius: 0.66,
    offers: Object.freeze(['oxygen-bridge', 'lone-pair-donor']),
    seeks: Object.freeze(['silicon-valence']),
  }),
  METHYL_LIGAND: Object.freeze({
    speciesId: 'ch3-ligand',
    name: 'Methyl Hydrophobic Ligand',
    element: 'CH3',
    valence: 1,
    charge: -0.5,
    mass: 15.035,
    electronegativity: 2.55,
    radius: 1.20,
    offers: Object.freeze(['methyl-ligand', 'hydrophobic-shield']),
    seeks: Object.freeze(['silicon-valence']),
  }),
  SILOXANE_UNIT: Object.freeze({
    speciesId: 'sio-dimer',
    name: 'Siloxane Repeat Unit',
    element: 'SiO',
    valence: 2,
    charge: 0.0,
    mass: 44.084,
    electronegativity: 2.67,
    radius: 1.60,
    offers: Object.freeze(['siloxane-chain', 'chain-extension']),
    seeks: Object.freeze(['siloxane-chain', 'chain-extension']),
  }),
  CROSSLINK_JUNCTION: Object.freeze({
    speciesId: 'si-trifunctional',
    name: 'Trifunctional T-Silicone Junction',
    element: 'Si-T3',
    valence: 3,
    charge: 1.0,
    mass: 31.08,
    electronegativity: 2.10,
    radius: 1.25,
    offers: Object.freeze(['crosslink-junction', 'silicon-valence']),
    seeks: Object.freeze(['oxygen-bridge']),
  }),
  ENDCAP_TRIMETHYL: Object.freeze({
    speciesId: 'si-m3-cap',
    name: 'Trimethylsilyl End-Cap',
    element: 'Si(CH3)3',
    valence: 1,
    charge: 0.0,
    mass: 73.19,
    electronegativity: 2.30,
    radius: 1.80,
    offers: Object.freeze(['chain-cap', 'inert-boundary']),
    seeks: Object.freeze(['oxygen-bridge', 'silicon-valence']),
  }),
});

/** Canonical Silicone Ports Dictionary covering all licensed species */
export const CANONICAL_SILICONE_OFFERS = Object.freeze([
  'silicon-valence',
  'd-orbital-acceptor',
  'oxygen-bridge',
  'lone-pair-donor',
  'methyl-ligand',
  'hydrophobic-shield',
  'siloxane-chain',
  'chain-extension',
  'crosslink-junction',
  'chain-cap',
  'inert-boundary',
]);

export const CANONICAL_SILICONE_SEEKS = Object.freeze([
  'oxygen-bridge',
  'silicon-valence',
  'methyl-ligand',
  'organo-group',
  'siloxane-chain',
  'chain-extension',
]);

export const CANONICAL_TARGET_SUBSTRATE = `offers: ${CANONICAL_SILICONE_OFFERS.join(' ')} seeks: ${CANONICAL_SILICONE_SEEKS.join(' ')}`;

/**
 * Negative-control population for grounding. A POPULATION, not a single string:
 * a control fitted to one remembered attack only proves that attack is patched.
 * Drawn from semantic spaces with no chemical overlap.
 */
export const GROUNDING_NOISE_CONTROLS = Object.freeze([
  'culinary recipe tomato basil pasta baking flour dessert soup',
  'theatrical stage opera vocal tenor aria orchestra overture drama',
  'macroeconomic inflation liquidity interest monetary currency exchange deficit',
  'phonetic babble blorp zorp quux fnord xyzzy widget foobar plugh',
  'botanical flora chlorophyll photosynthesis pollen stamen petal nectar',
]);

// Built once at module load. These inputs never vary per molecule, and rebuilding
// them inside the loop cost six conceptVector calls per evaluation — with the quench
// sweep that is ~12,000 rebuilds per run, which timed the PPSP suite out at 5s.
const GROUNDING_TARGET_VECTOR = conceptVector(CANONICAL_TARGET_SUBSTRATE);
const GROUNDING_NOISE_VECTORS = Object.freeze(GROUNDING_NOISE_CONTROLS.map(conceptVector));

export const DEFAULT_SILICONE_PRECURSORS = Object.freeze([
  Object.freeze({
    id: 'silane-donor-1',
    label: 'Monomeric Silane Reagent',
    domain: 'synthesis',
    mass: 32.12,
    charge: 1.0,
    offers: ['silane-flux', 'raw-silicon'],
    seeks: ['oxidant-stream'],
    evidence: ['codex/core/pixelbrain/concept-chemistry.js'],
  }),
  Object.freeze({
    id: 'silicate-carrier-1',
    label: 'Activated Silicate Carrier',
    domain: 'synthesis',
    mass: 60.08,
    charge: 1.0,
    offers: ['silicate-source'],
    seeks: ['halosilane-donor'],
    evidence: ['codex/core/constellation/element-phase.js'],
  }),
  Object.freeze({
    id: 'oxygen-plasma-1',
    label: 'High-Field Oxygen Plasma Ion',
    domain: 'vector',
    mass: 16.00,
    charge: -1.0,
    offers: ['activated-oxygen', 'plasma-flux'],
    seeks: ['raw-silicon', 'silane-flux'],
    evidence: ['codex/core/constellation/resonance-beacon.js'],
  }),
  Object.freeze({
    id: 'methyl-chloride-donor-1',
    label: 'Methyl Radical Reservoir',
    domain: 'synthesis',
    mass: 50.49,
    charge: 0.5,
    offers: ['methyl-group', 'alkyl-carrier'],
    seeks: ['silicon-radical'],
    evidence: ['codex/core/pixelbrain/semantic-valence-cyclotron.js'],
  }),
  Object.freeze({
    id: 'dimethyldichlorosilane-1',
    label: 'Dimethyldichlorosilane Feedstock',
    domain: 'synthesis',
    mass: 129.06,
    charge: 1.0,
    offers: ['monomer-feed', 'reactive-si-center'],
    seeks: ['hydrolysis-agent', 'activated-oxygen'],
    evidence: ['codex/core/pixelbrain/quark-chamber/slingshot.js'],
  }),
]);

export const DEFAULT_SILICONE_BRIDGES = Object.freeze([
  Object.freeze({ from: 'silane-flux', to: 'silicon-valence', relation: 'ignites', strength: 0.95 }),
  Object.freeze({ from: 'activated-oxygen', to: 'oxygen-bridge', relation: 'ionizes', strength: 0.98 }),
  Object.freeze({ from: 'methyl-group', to: 'methyl-ligand', relation: 'grafts', strength: 0.90 }),
  Object.freeze({ from: 'silicate-source', to: 'siloxane-chain', relation: 'catalyzes', strength: 0.88 }),
  Object.freeze({ from: 'reactive-si-center', to: 'crosslink-junction', relation: 'branches', strength: 0.92 }),
]);

function fail(message, context = {}, category = ERROR_CATEGORIES.VALUE) {
  const error = new BytecodeError(
    category,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.ARTIFACT,
    category === ERROR_CATEGORIES.RANGE ? ERROR_CODES.OUT_OF_BOUNDS : ERROR_CODES.INVALID_VALUE,
    { subsystem: 'semantic-silicone-reactor', message, ...context },
  );
  error.message = message;
  throw error;
}

export function mulberry32(seed) {
  let t = Number(seed) >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sha256Hex(data) {
  const serialized = typeof data === 'string' ? data : canonicalStringify(data);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Calculate cyclotron kinematics for a charged atom in a magnetic/RF field.
 */
export function calculateCyclotronKinematics({
  mass = 28.085,
  charge = 1.0,
  magneticField = 2.5,
  rfVoltage = 50.0,
  angularVelocity = 120.0,
  radius = 0.85,
  turns = 50,
}) {
  const m = Math.max(0.1, Number(mass) || 1.0);
  const q = Math.abs(Number(charge) || 1.0);
  const B = Math.max(0.01, Number(magneticField) || 0.1);
  const omega = Math.max(0, Number(angularVelocity) || 0);
  const r = Math.max(0.01, Number(radius) || 0.1);
  const V_rf = Math.max(0, Number(rfVoltage) || 0);
  const N = Math.max(1, Math.round(Number(turns) || 1));

  const resonanceFrequency = (q * B * 1000.0) / m;
  const velocity = omega * r;
  const orbitalEnergy = 0.5 * m * (velocity ** 2);
  const rfGain = N * (q * 0.1) * (V_rf * 0.2);
  const totalRotationalEnergy = orbitalEnergy + rfGain;
  const centrifugalForce = m * (omega ** 2) * r;
  const magneticLorentzForce = q * velocity * B * 10.0;
  const orbitalStability = magneticLorentzForce / Math.max(0.001, centrifugalForce);

  return Object.freeze({
    resonanceFrequency: Number(resonanceFrequency.toFixed(4)),
    velocity: Number(velocity.toFixed(4)),
    orbitalEnergy: Number(orbitalEnergy.toFixed(4)),
    rfGain: Number(rfGain.toFixed(4)),
    totalRotationalEnergy: Number(totalRotationalEnergy.toFixed(4)),
    centrifugalForce: Number(centrifugalForce.toFixed(4)),
    magneticLorentzForce: Number(magneticLorentzForce.toFixed(4)),
    orbitalStability: Number(orbitalStability.toFixed(4)),
  });
}

/**
 * Slingshot trajectory collision calculation between two atoms inside the cyclotron.
 */
export function calculateSlingshotCollision({
  atomA,
  atomB,
  angularVelocity = 120.0,
  radius = 0.85,
  magneticField = 2.5,
  slingshotFactor = 1.65,
  dmtIntensity = 0.0,
  rng = null,
}) {
  if (!atomA || !atomB) fail('Both atomA and atomB are required for collision');

  const massA = Number(atomA.mass) || 28.0;
  const massB = Number(atomB.mass) || 16.0;
  const chargeA = Number(atomA.charge) || 1.0;
  const chargeB = Number(atomB.charge) || -1.0;

  const kinA = calculateCyclotronKinematics({
    mass: massA,
    charge: chargeA,
    magneticField,
    angularVelocity,
    radius,
  });
  const kinB = calculateCyclotronKinematics({
    mass: massB,
    charge: chargeB,
    magneticField,
    angularVelocity,
    radius,
  });

  const reducedMass = (massA * massB) / (massA + massB);

  // Vector collision angle theta in [0, pi]
  const theta = rng ? rng() * Math.PI : Math.PI;
  const cosTheta = Math.cos(theta);

  // Vector relative velocity: v_rel = sqrt(v_A^2 + v_B^2 - 2*v_A*v_B*cos(theta)) * slingshot
  const vA = kinA.velocity;
  const vB = kinB.velocity;
  const rawRelVelocity = Math.sqrt(Math.max(0.01, (vA ** 2) + (vB ** 2) - 2 * vA * vB * cosTheta));
  const boost = Math.max(1.0, Number(slingshotFactor) || 1.0);
  const relativeVelocity = rawRelVelocity * boost;

  // Center-of-mass collision energy
  const collisionEnergy = 0.5 * reducedMass * ((relativeVelocity / 35.0) ** 2);

  // Coulomb barrier between reactants
  const baseCoulombBarrier = (chargeA * chargeB > 0)
    ? 15.0 * Math.abs(chargeA * chargeB)
    : -15.0 * Math.abs(chargeA * chargeB);

  // DMT Perturbation reduces effective barrier via quantum-semantic tunneling
  const dmtDamping = Math.max(0, Math.min(1.0, Number(dmtIntensity) || 0));
  const effectiveBarrierThreshold = Math.max(15.0, TRANSMUTATION_THRESHOLD_ENERGY * (1.0 - 0.25 * dmtDamping));

  const netImpactEnergy = Math.max(0, collisionEnergy - baseCoulombBarrier);
  const overcomesBarrier = netImpactEnergy >= effectiveBarrierThreshold;

  return Object.freeze({
    reducedMass: Number(reducedMass.toFixed(4)),
    relativeVelocity: Number(relativeVelocity.toFixed(4)),
    collisionAngleRad: Number(theta.toFixed(4)),
    collisionEnergy: Number(collisionEnergy.toFixed(4)),
    coulombBarrier: Number(baseCoulombBarrier.toFixed(4)),
    effectiveBarrierThreshold: Number(effectiveBarrierThreshold.toFixed(4)),
    netImpactEnergy: Number(netImpactEnergy.toFixed(4)),
    overcomesBarrier,
  });
}

/**
 * Transmutes atoms upon high-speed slingshot collision.
 */
export function transmuteAtomsOnCollision({
  atomA,
  atomB,
  collisionEnergy,
  dmtIntensity = 0.0,
  rng,
}) {
  const dmt = Math.max(0, Math.min(1.0, Number(dmtIntensity) || 0));
  const effectiveBarrier = Math.max(15.0, TRANSMUTATION_THRESHOLD_ENERGY * (1.0 - 0.25 * dmt));

  if (collisionEnergy < effectiveBarrier) {
    return {
      transmuted: false,
      reason: 'SUB_CRITICAL_COLLISION_ENERGY',
      daughterAtoms: [],
    };
  }

  const excessEnergyRatio = Math.min(3.0, (collisionEnergy - effectiveBarrier) / 50.0);
  const daughterCount = 2 + Math.floor(rng() * (2 + excessEnergyRatio * 2));
  const daughters = [];

  const speciesPool = [
    SILICONE_SPECIES.SILICON_CORE,
    SILICONE_SPECIES.OXYGEN_BRIDGE,
    SILICONE_SPECIES.METHYL_LIGAND,
    SILICONE_SPECIES.SILOXANE_UNIT,
    SILICONE_SPECIES.CROSSLINK_JUNCTION,
    SILICONE_SPECIES.ENDCAP_TRIMETHYL,
  ];

  // Guaranteed core + oxygen bridge in high-energy collision
  daughters.push(createDaughterAtom(SILICONE_SPECIES.SILICON_CORE, 0, atomA.id, dmt, rng));
  daughters.push(createDaughterAtom(SILICONE_SPECIES.OXYGEN_BRIDGE, 1, atomB.id, dmt, rng));

  for (let i = 2; i < daughterCount; i += 1) {
    let pick;
    if (dmt > 0.3) {
      const roll = rng();
      if (roll < 0.60) pick = SILICONE_SPECIES.SILOXANE_UNIT;
      else if (roll < 0.80) pick = SILICONE_SPECIES.OXYGEN_BRIDGE;
      else if (roll < 0.95) pick = SILICONE_SPECIES.SILICON_CORE;
      else pick = SILICONE_SPECIES.METHYL_LIGAND;
    } else {
      pick = speciesPool[Math.floor(rng() * speciesPool.length)];
    }
    daughters.push(createDaughterAtom(pick, i, `${atomA.id}_${atomB.id}`, dmt, rng));
  }

  return Object.freeze({
    transmuted: true,
    reason: dmt > 0 ? 'DMT_PERMITTED_HYPER_COLLISION' : 'HIGH_ENERGY_SLINGSHOT_FISSION_FUSION',
    reactantA: atomA.id,
    reactantB: atomB.id,
    collisionEnergy: Number(collisionEnergy.toFixed(4)),
    daughterAtoms: Object.freeze(daughters),
  });
}

function createDaughterAtom(species, index, parentId, dmtIntensity, rng) {
  const chargeDrift = (rng() - 0.5) * (0.1 + dmtIntensity * 0.10);
  const netCharge = Number((species.charge + chargeDrift).toFixed(3));
  const uniqueToken = Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0');
  return Object.freeze({
    contract: SEMANTIC_SILICONE_ATOM_CONTRACT,
    id: `${species.speciesId}-${uniqueToken}-${index + 1}`,
    speciesId: species.speciesId,
    name: species.name,
    element: species.element,
    valence: species.valence,
    charge: netCharge,
    mass: species.mass,
    electronegativity: species.electronegativity,
    radius: species.radius,
    polarity: netCharge > 0 ? 'positive' : netCharge < 0 ? 'negative' : 'neutral',
    offers: Object.freeze([...species.offers]),
    seeks: Object.freeze([...species.seeks]),
    dmtExcited: dmtIntensity > 0.3,
  });
}

/**
 * Calculates electromagnetic bonding and stability between two daughter atoms in the spinning field.
 */
export function calculateElectromagneticBond({
  atomA,
  atomB,
  distance = 1.64,
  angularVelocity = 120.0,
}) {
  const q1 = Number(atomA.charge) || 0;
  const q2 = Number(atomB.charge) || 0;
  const d = Math.max(0.5, Number(distance) || 1.64);
  const omega = Math.max(0, Number(angularVelocity) || 0);

  const isOpposite = (q1 * q2) < 0;
  const electrostaticPotential = (q1 * q2) / d;

  const aOffersBSeeks = (atomA.offers || []).some((off) => (atomB.seeks || []).includes(off));
  const bOffersASeeks = (atomB.offers || []).some((off) => (atomA.seeks || []).includes(off));
  const valenceMatches = (aOffersBSeeks ? 1 : 0) + (bOffersASeeks ? 1 : 0);

  let baseBondStrength = 0;
  if (valenceMatches > 0) {
    baseBondStrength = 25.0 * valenceMatches;
  }
  if (isOpposite) {
    baseBondStrength += Math.abs(electrostaticPotential) * 15.0;
  }

  const massA = atomA.mass || 28.0;
  const massB = atomB.mass || 16.0;
  const reducedMass = (massA * massB) / (massA + massB);
  const centrifugalTearForce = 0.5 * reducedMass * ((omega / 100.0) ** 2) * (d * 1.5);

  const netBindingEnergy = baseBondStrength - centrifugalTearForce;
  const isBondStable = netBindingEnergy > 5.0;

  return Object.freeze({
    distance: Number(d.toFixed(3)),
    electrostaticPotential: Number(electrostaticPotential.toFixed(4)),
    valenceMatches,
    baseBondStrength: Number(baseBondStrength.toFixed(4)),
    centrifugalTearForce: Number(centrifugalTearForce.toFixed(4)),
    netBindingEnergy: Number(netBindingEnergy.toFixed(4)),
    isBondStable,
    isAttractive: isOpposite || valenceMatches > 0,
  });
}

/**
 * Validates the physical graph topology of a molecule.
 */
export function validateMolecularGraph(molecule) {
  if (!molecule || typeof molecule !== 'object') {
    return Object.freeze({ valid: false, reason: 'NULL_OR_NON_OBJECT' });
  }

  const atoms = Array.isArray(molecule.atoms) ? molecule.atoms : [];
  const bonds = Array.isArray(molecule.bonds) ? molecule.bonds : [];
  const mass = Number(molecule.molecularWeight) || 0;

  if (atoms.length < 2 || mass <= 0 || bonds.length < 1) {
    return Object.freeze({ valid: false, reason: 'INSUFFICIENT_ATOMS_OR_MASS' });
  }

  const atomMap = new Map();
  const degrees = new Map();
  for (const a of atoms) {
    if (!a || !a.id || typeof a.mass !== 'number' || a.mass <= 0) {
      return Object.freeze({ valid: false, reason: 'INVALID_ATOM_PAYLOAD' });
    }
    atomMap.set(a.id, a);
    degrees.set(a.id, 0);
  }

  const adj = new Map();
  for (const a of atoms) adj.set(a.id, []);

  for (const b of bonds) {
    if (!b || !atomMap.has(b.from) || !atomMap.has(b.to) || b.from === b.to) {
      return Object.freeze({ valid: false, reason: 'INVALID_BOND_ENDPOINTS' });
    }
    degrees.set(b.from, degrees.get(b.from) + 1);
    degrees.set(b.to, degrees.get(b.to) + 1);
    adj.get(b.from).push(b.to);
    adj.get(b.to).push(b.from);
  }

  let totalValence = 0;
  let radicalDefects = 0;
  for (const a of atoms) {
    const deg = degrees.get(a.id);
    const maxVal = Math.max(1, Number(a.valence) || 1);
    totalValence += maxVal;
    if (deg > maxVal) {
      return Object.freeze({ valid: false, reason: 'EXCEEDED_MAX_VALENCE' });
    }
    radicalDefects += (maxVal - deg);
  }

  let hasCycle = false;
  let cycleLength = 0;
  const visited = new Set();

  function dfsCycle(curr, parent, path) {
    visited.add(curr);
    path.push(curr);
    for (const neighbor of adj.get(curr)) {
      if (neighbor === parent) continue;
      if (path.includes(neighbor)) {
        hasCycle = true;
        const startIdx = path.indexOf(neighbor);
        cycleLength = path.length - startIdx;
        return;
      }
      if (!visited.has(neighbor)) {
        dfsCycle(neighbor, curr, path);
        if (hasCycle) return;
      }
    }
    path.pop();
  }

  if (atoms.length > 0) {
    dfsCycle(atoms[0].id, null, []);
  }

  const netCharge = atoms.reduce((sum, a) => sum + (Number(a.charge) || 0), 0);
  const valenceFulfillment = totalValence > 0 ? Number((1.0 - (radicalDefects / totalValence)).toFixed(4)) : 0;

  return Object.freeze({
    valid: true,
    atomCount: atoms.length,
    bondCount: bonds.length,
    hasCycle,
    cycleLength,
    netCharge: Number(netCharge.toFixed(3)),
    valenceFulfillment,
    radicalDefects,
  });
}

/**
 * Evaluates a molecule through the Macrophage structural immune screen.
 */
export function evaluateMacrophageScreen(molecule) {
  const graph = validateMolecularGraph(molecule);
  if (!graph.valid) {
    return Object.freeze({ passed: false, rejectionReason: graph.reason });
  }

  if (graph.atomCount > 16 && !graph.hasCycle) {
    return Object.freeze({ passed: false, rejectionReason: 'OVERGROWN_UNSTABILIZED_CHAIN' });
  }

  if (graph.radicalDefects > graph.atomCount * 2) {
    return Object.freeze({ passed: false, rejectionReason: 'UNSTABLE_RADICAL_EXCESS' });
  }

  if (Math.abs(graph.netCharge) > 3.0) {
    return Object.freeze({ passed: false, rejectionReason: 'EXCESSIVE_POLAR_CHARGE' });
  }

  return Object.freeze({ passed: true, rejectionReason: null });
}

/**
 * Feature-based Semantic Concept Grounding.
 * Uses complete canonical silicone domain vocabulary (including all siloxane-chain ports).
 */
export function evaluateSemanticGrounding(molecule, _options = {}) {
  const graph = validateMolecularGraph(molecule);
  if (!graph.valid) {
    return Object.freeze({
      grounded: false,
      contrastiveScore: 0.0,
      targetCosine: 0.0,
      maxNoiseCosine: 0.0,
      rejectionReason: 'INVALID_PHYSICAL_GRAPH',
    });
  }

  const allOffers = [];
  const allSeeks = [];
  for (const a of molecule.atoms || []) {
    if (Array.isArray(a.offers)) allOffers.push(...a.offers);
    if (Array.isArray(a.seeks)) allSeeks.push(...a.seeks);
  }

  const uniqueOffers = Array.from(new Set(allOffers)).sort().join(' ');
  const uniqueSeeks = Array.from(new Set(allSeeks)).sort().join(' ');

  const featureText = `offers: ${uniqueOffers} seeks: ${uniqueSeeks} valence_ratio: ${graph.valenceFulfillment}`;

  const vMol = conceptVector(featureText);
  const targetCosine = Math.max(0, cosine(GROUNDING_TARGET_VECTOR, vMol));

  let maxNoiseCosine = 0;
  for (const vNoise of GROUNDING_NOISE_VECTORS) {
    const noiseCos = Math.max(0, cosine(vNoise, vMol));
    if (noiseCos > maxNoiseCosine) maxNoiseCosine = noiseCos;
  }

  const contrastiveScore = Number((targetCosine - maxNoiseCosine).toFixed(4));
  const grounded = targetCosine >= 0.45 && targetCosine > (maxNoiseCosine * 1.8) && graph.valenceFulfillment >= 0.40;

  return Object.freeze({
    grounded,
    targetCosine: Number(targetCosine.toFixed(4)),
    maxNoiseCosine: Number(maxNoiseCosine.toFixed(4)),
    contrastiveScore,
    valenceFulfillment: graph.valenceFulfillment,
  });
}

/**
 * Calculates centrifugal stress and bond breakage under angular velocity omega.
 */
export function calculateCentrifugalBreakage(molecule, omega = 80.0) {
  const graph = validateMolecularGraph(molecule);
  if (!graph.valid) return Object.freeze({ isStable: false, brokenBonds: 999 });

  const w = Math.max(0, Number(omega) || 0);
  if (w === 0) {
    return Object.freeze({ isStable: true, brokenBonds: 0, quenchSpin: 0 });
  }

  const isRing = graph.hasCycle;
  let brokenBonds = 0;

  const totalMass = Number(molecule.molecularWeight) || 30.0;
  const bondCount = molecule.bonds?.length || 1;

  for (let i = 0; i < bondCount; i += 1) {
    const b = molecule.bonds[i];
    const baseStrength = Number(b.strength) || 25.0;

    let tearStress;
    if (isRing) {
      const ringRadius = 0.85 * (graph.cycleLength / 8.0);
      tearStress = 0.5 * 10.0 * ((w / 100.0) ** 2) * (ringRadius * 1.2) * 5.0;
    } else {
      const fraction = (i + 1) / (bondCount + 1);
      const m1 = totalMass * fraction;
      const m2 = totalMass * (1.0 - fraction);
      const reduced = (m1 * m2) / totalMass;
      const armLength = 0.85 * (fraction + 0.2);
      tearStress = 0.5 * reduced * ((w / 100.0) ** 2) * (armLength * 1.5) * 6.5;
    }

    if (tearStress >= baseStrength) {
      brokenBonds += 1;
    }
  }

  const isStable = brokenBonds === 0;

  return Object.freeze({
    isStable,
    brokenBonds,
    quenchSpin: w,
  });
}

/**
 * Assembles transmuted daughter atoms into structured silicone molecules.
 */
export function assembleSiliconeMolecules({
  transmutedAtoms = [],
  angularVelocity = 120.0,
  _radius = 0.85,
  dmtIntensity = 0.0,
  rng = mulberry32(0x5111c0),
}) {
  if (!Array.isArray(transmutedAtoms) || transmutedAtoms.length < 2) {
    return Object.freeze([]);
  }

  const dmt = Math.max(0, Math.min(1.0, Number(dmtIntensity) || 0));
  const pool = [...transmutedAtoms];
  const molecules = [];
  let molIndex = 1;

  const siloxaneDimers = pool.filter((a) => a.speciesId === 'sio-dimer');
  const siliconCores = pool.filter((a) => a.speciesId === 'si-core' || a.speciesId === 'si-trifunctional');
  const oxygenBridges = pool.filter((a) => a.speciesId === 'o-bridge');
  const ligands = pool.filter((a) => a.speciesId === 'ch3-ligand' || a.speciesId === 'si-m3-cap');

  let availableDimers = [...siloxaneDimers];
  let availableCores = [...siliconCores];
  let availableBridges = [...oxygenBridges];
  let availableLigands = [...ligands];

  // 1. Siloxane Ring Assembly (Direct D3, D4, D5 cyclosiloxanes)
  // Baseline thermal cyclization occurs at ~20% probability, amplified up to ~85% under DMT catalysis
  const cyclizationProb = 0.35 + 0.55 * dmt;
  while (availableDimers.length >= 3) {
    if (rng() <= cyclizationProb) {
      const kOrder = (availableDimers.length >= 4 && rng() > 0.35)
        ? (availableDimers.length >= 5 && rng() > 0.60 ? 5 : 4)
        : 3;

      if (availableDimers.length < kOrder) break;

      const ringUnits = availableDimers.splice(0, kOrder);
      const ringAtoms = [...ringUnits];
      const bonds = [];
      let totalBinding = 0;
      let netCentrifugal = 0;
      let netElectrostatic = 0;

      for (let i = 0; i < ringUnits.length; i += 1) {
        const uA = ringUnits[i];
        const uB = ringUnits[(i + 1) % ringUnits.length];
        const bond = calculateElectromagneticBond({ atomA: uA, atomB: uB, angularVelocity });

        bonds.push({ from: uA.id, to: uB.id, bond: 'Cyclic-Siloxane-Perimeter', strength: bond.netBindingEnergy });
        totalBinding += bond.netBindingEnergy;
        netCentrifugal += bond.centrifugalTearForce;
        netElectrostatic += bond.electrostaticPotential;
      }

      const totalMass = ringAtoms.reduce((sum, a) => sum + (Number(a.mass) || 0), 0);
      const stabilityScore = Math.max(0, Math.min(1.0, totalBinding / Math.max(1, bonds.length * 35.0)));
      const isThermallyStable = totalBinding > 0 && netCentrifugal < totalBinding;

      molecules.push(Object.freeze({
        contract: SEMANTIC_SILICONE_MOLECULE_CONTRACT,
        moleculeId: `mol-silicone-${molIndex++}`,
        name: `Cyclic Siloxane Ring D${kOrder}`,
        topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
        atomCount: ringAtoms.length,
        atomIds: Object.freeze(ringAtoms.map((a) => a.id)),
        atoms: Object.freeze(ringAtoms),
        molecularWeight: Number(totalMass.toFixed(3)),
        bondCount: bonds.length,
        bonds: Object.freeze(bonds),
        stabilityScore: Number(stabilityScore.toFixed(4)),
        totalBindingEnergy: Number(totalBinding.toFixed(4)),
        netElectrostaticPotential: Number(netElectrostatic.toFixed(4)),
        netCentrifugalStress: Number(netCentrifugal.toFixed(4)),
        isThermallyStable,
        dmtSynthesized: dmt > 0,
      }));
    } else {
      availableDimers.shift();
    }
  }

  // 2. Linear and Crosslinked Network Assembly
  while (availableCores.length >= 2 && availableBridges.length >= 1) {
    const chainAtoms = [];
    const bonds = [];
    let netElectrostatic = 0;
    let netCentrifugal = 0;
    let totalBinding = 0;

    let current = availableCores.shift();
    chainAtoms.push(current);

    const maxChainLength = 3 + Math.floor(rng() * 4);

    while (availableCores.length > 0 && availableBridges.length > 0 && chainAtoms.length < maxChainLength) {
      const bridge = availableBridges.shift();
      const nextCore = availableCores.shift();

      const bond1 = calculateElectromagneticBond({ atomA: current, atomB: bridge, angularVelocity });
      const bond2 = calculateElectromagneticBond({ atomA: bridge, atomB: nextCore, angularVelocity });

      if (bond1.isBondStable && bond2.isBondStable) {
        chainAtoms.push(bridge, nextCore);
        bonds.push({ from: current.id, to: bridge.id, bond: 'Si-O-covalent', strength: bond1.netBindingEnergy });
        bonds.push({ from: bridge.id, to: nextCore.id, bond: 'O-Si-covalent', strength: bond2.netBindingEnergy });

        netElectrostatic += bond1.electrostaticPotential + bond2.electrostaticPotential;
        netCentrifugal += bond1.centrifugalTearForce + bond2.centrifugalTearForce;
        totalBinding += bond1.netBindingEnergy + bond2.netBindingEnergy;
        current = nextCore;
      } else {
        break;
      }
    }

    for (const core of chainAtoms.filter((a) => a.speciesId === 'si-core' || a.speciesId === 'si-trifunctional')) {
      if (availableLigands.length > 0) {
        const lig = availableLigands.shift();
        const bond = calculateElectromagneticBond({ atomA: core, atomB: lig, angularVelocity });
        if (bond.isBondStable) {
          chainAtoms.push(lig);
          bonds.push({ from: core.id, to: lig.id, bond: 'Si-C-polar', strength: bond.netBindingEnergy });
          netElectrostatic += bond.electrostaticPotential;
          netCentrifugal += bond.centrifugalTearForce;
          totalBinding += bond.netBindingEnergy;
        }
      }
    }

    if (chainAtoms.length >= 3 && bonds.length >= 2) {
      const coreCount = chainAtoms.filter((a) => a.speciesId === 'si-core' || a.speciesId === 'si-trifunctional').length;
      const kOrder = Math.max(3, Math.min(6, coreCount));

      const baseStrain = SILOXANE_RING_STRAIN[kOrder] || 15.0;
      const effectiveStrain = baseStrain * (1.0 - 0.60 * dmt);

      const firstCore = chainAtoms.find((a) => a.speciesId === 'si-core' || a.speciesId === 'si-trifunctional');
      const lastCore = current;
      const tipCoulombAttraction = (firstCore && lastCore && firstCore.charge * lastCore.charge < 0)
        ? Math.abs((firstCore.charge * lastCore.charge) / 1.64) * 15.0 * (1.0 + 0.50 * dmt)
        : 0;
      const closureDrive = 0.5 * 10.0 * ((angularVelocity / 50.0) ** 2) * 0.15 + tipCoulombAttraction;
      const canFormRing = coreCount >= 3 && coreCount <= 6 && closureDrive >= effectiveStrain;

      let topology = MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN;
      let name = `Linear Poly-Siloxane Chain [n=${coreCount}]`;

      if (canFormRing && firstCore && lastCore && availableBridges.length > 0) {
        const closingBridge = availableBridges.shift();
        const bondTail = calculateElectromagneticBond({ atomA: lastCore, atomB: closingBridge, angularVelocity });
        const bondHead = calculateElectromagneticBond({ atomA: closingBridge, atomB: firstCore, angularVelocity });

        if (bondTail.isBondStable && bondHead.isBondStable) {
          chainAtoms.push(closingBridge);
          topology = MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING;
          name = `Cyclic Siloxane Ring D${kOrder}`;
          bonds.push({ from: lastCore.id, to: closingBridge.id, bond: 'Cyclic-Ring-Closure-Tail', strength: bondTail.netBindingEnergy });
          bonds.push({ from: closingBridge.id, to: firstCore.id, bond: 'Cyclic-Ring-Closure-Head', strength: bondHead.netBindingEnergy });
          netElectrostatic += bondTail.electrostaticPotential + bondHead.electrostaticPotential;
          netCentrifugal += bondTail.centrifugalTearForce + bondHead.centrifugalTearForce;
          totalBinding += bondTail.netBindingEnergy + bondHead.netBindingEnergy;
        }
      } else if (chainAtoms.filter((a) => a.speciesId === 'si-trifunctional').length >= 2) {
        topology = MOLECULAR_TOPOLOGIES.CROSSLINKED_ELASTOMER_NETWORK;
        name = 'Crosslinked Silicone Elastomer Network';
      }

      const totalMass = chainAtoms.reduce((sum, a) => sum + (Number(a.mass) || 0), 0);
      const stabilityScore = Math.max(0, Math.min(1.0, totalBinding / Math.max(1, bonds.length * 40.0)));
      const isThermallyStable = totalBinding > 0 && netCentrifugal < totalBinding;

      molecules.push(Object.freeze({
        contract: SEMANTIC_SILICONE_MOLECULE_CONTRACT,
        moleculeId: `mol-silicone-${molIndex++}`,
        name,
        topology,
        atomCount: chainAtoms.length,
        atomIds: Object.freeze(chainAtoms.map((a) => a.id)),
        atoms: Object.freeze(chainAtoms),
        molecularWeight: Number(totalMass.toFixed(3)),
        bondCount: bonds.length,
        bonds: Object.freeze(bonds),
        stabilityScore: Number(stabilityScore.toFixed(4)),
        totalBindingEnergy: Number(totalBinding.toFixed(4)),
        netElectrostaticPotential: Number(netElectrostatic.toFixed(4)),
        netCentrifugalStress: Number(netCentrifugal.toFixed(4)),
        isThermallyStable,
        dmtSynthesized: dmt > 0,
      }));
    }
  }

  return Object.freeze(molecules);
}

/**
 * Runs the full Semantic Silicone Cyclotron Simulation.
 */
export function runSemanticSiliconeCyclotron(options = {}) {
  const seed = Number(options.seed ?? 0x5111c0) >>> 0;
  const trialCount = Math.max(1, Math.min(100_000, Number(options.trialCount ?? 100)));
  const angularVelocity = Number(options.angularVelocity ?? 140.0);
  const magneticField = Number(options.magneticField ?? 2.5);
  const rfVoltage = Number(options.rfVoltage ?? 60.0);
  const radius = Number(options.radius ?? 0.85);
  const dmtIntensity = Math.max(0, Math.min(1.0, Number(options.dmtIntensity ?? 0.0)));
  const precursors = Array.isArray(options.precursors) && options.precursors.length > 0
    ? options.precursors
    : DEFAULT_SILICONE_PRECURSORS;

  const rng = mulberry32(seed);

  let regime = CYCLOTRON_REGIMES.RESONANT_SELF_ASSEMBLY;
  if (angularVelocity < MIN_TRANSMUTATION_SPIN) {
    regime = CYCLOTRON_REGIMES.SUB_CRITICAL;
  } else if (angularVelocity >= MIN_TRANSMUTATION_SPIN && angularVelocity <= 95.0) {
    regime = CYCLOTRON_REGIMES.CRITICAL_TRANSITION;
  } else if (angularVelocity > MAX_SAFE_ROTATIONAL_SPEED) {
    regime = CYCLOTRON_REGIMES.HYPER_ROTATIONAL_TEAR;
  }

  const globalKinematics = calculateCyclotronKinematics({
    mass: 28.085,
    charge: 1.0,
    magneticField,
    rfVoltage,
    angularVelocity,
    radius,
  });

  const collisions = [];
  const allTransmutedAtoms = [];
  let totalTransmutations = 0;
  let totalCollisions = 0;

  for (let trial = 0; trial < trialCount; trial += 1) {
    const idxA = Math.floor(rng() * precursors.length);
    let idxB = Math.floor(rng() * precursors.length);
    if (idxA === idxB && precursors.length > 1) {
      idxB = (idxA + 1) % precursors.length;
    }

    const atomA = precursors[idxA];
    const atomB = precursors[idxB];

    const colResult = calculateSlingshotCollision({
      atomA,
      atomB,
      angularVelocity,
      radius,
      magneticField,
      slingshotFactor: 1.5 + rng() * 0.4,
      dmtIntensity,
      rng,
    });

    totalCollisions += 1;

    if (colResult.overcomesBarrier && regime !== CYCLOTRON_REGIMES.SUB_CRITICAL) {
      const transResult = transmuteAtomsOnCollision({
        atomA,
        atomB,
        collisionEnergy: colResult.netImpactEnergy,
        dmtIntensity,
        rng,
      });

      if (transResult.transmuted) {
        totalTransmutations += 1;
        allTransmutedAtoms.push(...transResult.daughterAtoms);
        if (collisions.length < 20) {
          collisions.push({
            trial,
            reactantA: atomA.id,
            reactantB: atomB.id,
            impactEnergy: colResult.netImpactEnergy,
            daughterCount: transResult.daughterAtoms.length,
          });
        }
      }
    }
  }

  let rawMolecules = [];
  if (regime !== CYCLOTRON_REGIMES.SUB_CRITICAL && regime !== CYCLOTRON_REGIMES.HYPER_ROTATIONAL_TEAR && allTransmutedAtoms.length >= 2) {
    rawMolecules = assembleSiliconeMolecules({
      transmutedAtoms: allTransmutedAtoms,
      angularVelocity,
      _radius: radius,
      dmtIntensity,
      rng,
    });
  }

  const screenedMolecules = [];
  for (const mol of rawMolecules) {
    const macrophage = evaluateMacrophageScreen(mol);
    const grounding = evaluateSemanticGrounding(mol);
    screenedMolecules.push(Object.freeze({
      ...mol,
      macrophagePassed: macrophage.passed,
      macrophageRejection: macrophage.rejectionReason,
      semanticGrounded: grounding.grounded,
      semanticContrastiveScore: grounding.contrastiveScore,
    }));
  }

  let verdict = 'NO_TRANSMUTATION_SUB_CRITICAL';
  if (regime === CYCLOTRON_REGIMES.HYPER_ROTATIONAL_TEAR) {
    verdict = 'MOLECULES_TORN_BY_CENTRIFUGAL_FORCE';
  } else if (screenedMolecules.length > 0) {
    verdict = 'STABLE_SILICONE_MOLECULES_FORMED';
  } else if (totalTransmutations > 0) {
    verdict = 'TRANSMUTATION_ACHIEVED_NO_STABLE_ASSEMBLY';
  }

  const linearCount = screenedMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN).length;
  const cyclicCount = screenedMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING).length;
  const networkCount = screenedMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.CROSSLINKED_ELASTOMER_NETWORK).length;

  const reportBody = {
    contract: SEMANTIC_SILICONE_CYCLOTRON_REPORT_CONTRACT,
    schemaVersion: SEMANTIC_SILICONE_SCHEMA_VERSION,
    configuration: Object.freeze({
      seed,
      trialCount,
      angularVelocity,
      magneticField,
      rfVoltage,
      radius,
      dmtIntensity,
      precursorCount: precursors.length,
    }),
    regime,
    verdict,
    cyclotronKinematics: globalKinematics,
    transmutationSummary: Object.freeze({
      occurred: totalTransmutations > 0,
      totalCollisions,
      totalTransmutations,
      transmutationRate: totalCollisions > 0 ? Number((totalTransmutations / totalCollisions).toFixed(4)) : 0,
      totalDaughterAtomsGenerated: allTransmutedAtoms.length,
      sampleCollisions: Object.freeze(collisions),
    }),
    molecularAssembly: Object.freeze({
      totalMoleculesFormed: screenedMolecules.length,
      linearChains: linearCount,
      cyclicRings: cyclicCount,
      networks: networkCount,
      molecules: Object.freeze(screenedMolecules),
    }),
    lawsVerified: Object.freeze([
      'COULOMB_ELECTROSTATIC_ATTRACTION_DRIVES_SILOXANE_BONDING',
      'ROTATIONAL_SLINGSHOT_ASSIST_POWERS_TRANSMUTATION',
      'CENTRIFUGAL_FORCE_BOUNDS_MOLECULAR_STABILITY_WINDOW',
    ]),
  };

  const checksum = `silicone-cyclotron1:${sha256Hex(reportBody)}`;
  return Object.freeze({
    ...reportBody,
    checksum,
  });
}

/**
 * Sweeps across angular velocities to map the critical phase transition curve and topological shift under DMT.
 */
export function sweepCriticalPhaseBoundary({
  spinValues = [20, 40, 55, 65, 75, 85, 95, 110, 130, 150],
  trialsPerSpin = 150,
  seed = 0x5111c0,
  dmtIntensity = 0.0,
} = {}) {
  const curve = [];
  for (const spin of spinValues) {
    const report = runSemanticSiliconeCyclotron({
      angularVelocity: spin,
      trialCount: trialsPerSpin,
      seed: seed ^ Math.imul(spin, 0x9e3779b9),
      dmtIntensity,
    });
    curve.push(Object.freeze({
      spin,
      regime: report.regime,
      transmutationRate: report.transmutationSummary.transmutationRate,
      transmutationPercent: Number((report.transmutationSummary.transmutationRate * 100).toFixed(1)),
      totalMolecules: report.molecularAssembly.totalMoleculesFormed,
      linearChains: report.molecularAssembly.linearChains,
      cyclicRings: report.molecularAssembly.cyclicRings,
      networks: report.molecularAssembly.networks,
      verdict: report.verdict,
    }));
  }
  return Object.freeze(curve);
}

/**
 * Evaluates survival of a molecule under non-zero quench spin omega_quench.
 */
export function evaluateQuenchSurvival(molecule, quenchSpin = 80.0) {
  const breakAnalysis = calculateCentrifugalBreakage(molecule, quenchSpin);
  const macrophage = evaluateMacrophageScreen(molecule);
  const grounding = evaluateSemanticGrounding(molecule);

  return Object.freeze({
    moleculeId: molecule.moleculeId,
    name: molecule.name,
    topology: molecule.topology,
    atomCount: molecule.atomCount,
    quenchSpin: Number(quenchSpin.toFixed(1)),
    isStableUnderQuench: breakAnalysis.isStable,
    brokenBonds: breakAnalysis.brokenBonds,
    macrophagePassed: macrophage.passed,
    macrophageRejection: macrophage.rejectionReason,
    semanticGrounded: grounding.grounded,
    contrastiveScore: grounding.contrastiveScore,
    isPersistent: breakAnalysis.isStable && macrophage.passed && grounding.grounded,
  });
}

/**
 * Measures Post-Perturbation Semantic Persistence (PPSP) with PAIRED SYNTHESIS.
 */
export function measurePostPerturbationPersistence({
  synthesisSpin = 85.0,
  dmtIntensity = 0.75,
  quenchSpin = 80.0,
  trialCount = 200,
  seed = 0x5111c0,
} = {}) {
  const rng = mulberry32(seed);
  const precursors = DEFAULT_SILICONE_PRECURSORS;

  // 1. Generate canonical shared daughter atom inventory via cyclotron collisions
  const canonicalDaughterAtoms = [];
  for (let trial = 0; trial < trialCount; trial += 1) {
    const idxA = Math.floor(rng() * precursors.length);
    let idxB = Math.floor(rng() * precursors.length);
    if (idxA === idxB && precursors.length > 1) {
      idxB = (idxA + 1) % precursors.length;
    }

    const colResult = calculateSlingshotCollision({
      atomA: precursors[idxA],
      atomB: precursors[idxB],
      angularVelocity: synthesisSpin,
      slingshotFactor: 1.5 + rng() * 0.4,
      dmtIntensity: 0.0,
      rng,
    });

    if (colResult.overcomesBarrier) {
      const transResult = transmuteAtomsOnCollision({
        atomA: precursors[idxA],
        atomB: precursors[idxB],
        collisionEnergy: colResult.netImpactEnergy,
        dmtIntensity: 0.0,
        rng,
      });

      if (transResult.transmuted) {
        canonicalDaughterAtoms.push(...transResult.daughterAtoms);
      }
    }
  }

  // 2. Paired Assembly from identical daughter atom pool
  const controlMolecules = assembleSiliconeMolecules({
    transmutedAtoms: canonicalDaughterAtoms,
    angularVelocity: synthesisSpin,
    dmtIntensity: 0.0,
    rng: mulberry32(seed ^ 0x101),
  });

  const dmtMolecules = assembleSiliconeMolecules({
    transmutedAtoms: canonicalDaughterAtoms,
    angularVelocity: synthesisSpin,
    dmtIntensity,
    rng: mulberry32(seed ^ 0x101),
  });

  const evaluateArm = (molecules, label) => {
    const evaluations = molecules.map((mol) => evaluateQuenchSurvival(mol, quenchSpin));
    const persistentCount = evaluations.filter((e) => e.isPersistent).length;
    const stableCount = evaluations.filter((e) => e.isStableUnderQuench).length;
    const macrophageCount = evaluations.filter((e) => e.macrophagePassed).length;
    const groundedCount = evaluations.filter((e) => e.semanticGrounded).length;
    const ppspRatio = molecules.length > 0 ? Number((persistentCount / molecules.length).toFixed(4)) : 0;
    const physicalStabilityRatio = molecules.length > 0 ? Number((stableCount / molecules.length).toFixed(4)) : 0;

    return Object.freeze({
      arm: label,
      discoveredMolecules: molecules.length,
      quenchStableCount: stableCount,
      physicalStabilityPercent: Number((physicalStabilityRatio * 100).toFixed(2)),
      macrophagePassedCount: macrophageCount,
      groundedCount,
      persistentCount,
      ppspRatio,
      ppspPercent: Number((ppspRatio * 100).toFixed(2)),
      topologicalDistribution: Object.freeze({
        linearChains: molecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN).length,
        cyclicRings: molecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING).length,
        networks: molecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.CROSSLINKED_ELASTOMER_NETWORK).length,
      }),
      evaluations: Object.freeze(evaluations),
    });
  };

  const controlArm = evaluateArm(controlMolecules, 'CONTROL (κ=0.0)');
  const dmtArm = evaluateArm(dmtMolecules, `+DMT (κ=${dmtIntensity})`);

  // Quench survival sweep across quench spins [0, 40, 80, 120, 160, 200, 240]
  const quenchSpins = [0, 40, 80, 120, 160, 200, 240];
  const quenchSurvivalCurve = quenchSpins.map((spin) => {
    const cEvaluations = controlMolecules.map((mol) => evaluateQuenchSurvival(mol, spin));
    const dEvaluations = dmtMolecules.map((mol) => evaluateQuenchSurvival(mol, spin));

    const cPhysStable = cEvaluations.filter((e) => e.isStableUnderQuench).length;
    const dPhysStable = dEvaluations.filter((e) => e.isStableUnderQuench).length;
    const cPersistent = cEvaluations.filter((e) => e.isPersistent).length;
    const dPersistent = dEvaluations.filter((e) => e.isPersistent).length;

    const cPhysRatio = controlArm.discoveredMolecules > 0 ? cPhysStable / controlArm.discoveredMolecules : 0;
    const dPhysRatio = dmtArm.discoveredMolecules > 0 ? dPhysStable / dmtArm.discoveredMolecules : 0;
    const cRatio = controlArm.discoveredMolecules > 0 ? cPersistent / controlArm.discoveredMolecules : 0;
    const dRatio = dmtArm.discoveredMolecules > 0 ? dPersistent / dmtArm.discoveredMolecules : 0;

    return Object.freeze({
      quenchSpin: spin,
      controlPhysicalStabilityPercent: Number((cPhysRatio * 100).toFixed(1)),
      dmtPhysicalStabilityPercent: Number((dPhysRatio * 100).toFixed(1)),
      controlSurvivalPercent: Number((cRatio * 100).toFixed(1)),
      dmtSurvivalPercent: Number((dRatio * 100).toFixed(1)),
    });
  });

  const resultBody = {
    contract: SEMANTIC_SILICONE_PPSP_CONTRACT,
    schemaVersion: SEMANTIC_SILICONE_SCHEMA_VERSION,
    configuration: Object.freeze({
      seed,
      trialCount,
      synthesisSpin,
      dmtIntensity,
      quenchSpin,
      canonicalDaughterAtomsCount: canonicalDaughterAtoms.length,
    }),
    controlArm,
    dmtArm,
    quenchSurvivalCurve: Object.freeze(quenchSurvivalCurve),
    ...(() => {
      // The verdict is COMPARATIVE. A DMT-only threshold cannot distinguish
      // "the treatment persists" from "everything persists", and it reported
      // PERSISTENCE_CONFIRMED off a bar the control arm was never measured against.
      const marginPp = Number(((dmtArm.ppspRatio - controlArm.ppspRatio) * 100).toFixed(2));
      // Two-proportion z on the arm counts, so a margin arrives with its own noise floor.
      const n1 = controlArm.discoveredMolecules || 0;
      const n2 = dmtArm.discoveredMolecules || 0;
      const x1 = controlArm.persistentCount || 0;
      const x2 = dmtArm.persistentCount || 0;
      let z = 0;
      if (n1 > 0 && n2 > 0) {
        const pooled = (x1 + x2) / (n1 + n2);
        const se = Math.sqrt(pooled * (1 - pooled) * ((1 / n1) + (1 / n2)));
        z = se > 0 ? Number(((x2 / n2 - x1 / n1) / se).toFixed(3)) : 0;
      }
      const significant = Math.abs(z) >= 1.96;
      let verdict;
      if (marginPp >= PPSP_PERSISTENCE_MIN_MARGIN && significant) {
        verdict = 'DMT_PERSISTENCE_ADVANTAGE';
      } else if (marginPp <= -PPSP_PERSISTENCE_MIN_MARGIN && significant) {
        verdict = 'DMT_PERSISTENCE_PENALTY';
      } else {
        verdict = 'NO_SEPARATION_FROM_CONTROL';
      }
      return {
        comparison: Object.freeze({
          controlPpspPercent: controlArm.ppspPercent,
          dmtPpspPercent: dmtArm.ppspPercent,
          marginPp,
          z,
          significantAt95: significant,
          minMarginRequired: PPSP_PERSISTENCE_MIN_MARGIN,
        }),
        verdict,
      };
    })(),
  };

  const checksum = `silicone-ppsp1:${sha256Hex(resultBody)}`;
  return Object.freeze({
    ...resultBody,
    checksum,
  });
}

/**
 * 2x2 Factorial Causal Ablation Assay:
 * Isolates whether physical quench resilience is caused by Cyclic Topology vs intrinsic treatment kappa.
 *
 * Evaluates 4 distinct groups from shared paired synthesis:
 * 1. Control Rings (kappa = 0, topology = CYCLIC_SILOXANE_RING)
 * 2. DMT Rings (kappa = 0.75, topology = CYCLIC_SILOXANE_RING)
 * 3. Control Chains (kappa = 0, topology = LINEAR_SILOXANE_CHAIN)
 * 4. DMT Chains (kappa = 0.75, topology = LINEAR_SILOXANE_CHAIN)
 */
export function runTopologicalCausalAblation({
  synthesisSpin = 85.0,
  dmtIntensity = 0.75,
  trialCount = 300,
  seed = 0x5111c0,
  quenchSpins = [0, 40, 80, 120, 160, 200, 240],
} = {}) {
  const rng = mulberry32(seed);
  const precursors = DEFAULT_SILICONE_PRECURSORS;

  // 1. Generate canonical shared daughter atom inventory via cyclotron collisions
  const canonicalDaughterAtoms = [];
  for (let trial = 0; trial < trialCount; trial += 1) {
    const idxA = Math.floor(rng() * precursors.length);
    let idxB = Math.floor(rng() * precursors.length);
    if (idxA === idxB && precursors.length > 1) {
      idxB = (idxA + 1) % precursors.length;
    }

    const colResult = calculateSlingshotCollision({
      atomA: precursors[idxA],
      atomB: precursors[idxB],
      angularVelocity: synthesisSpin,
      slingshotFactor: 1.5 + rng() * 0.4,
      dmtIntensity: 0.0,
      rng,
    });

    if (colResult.overcomesBarrier) {
      const transResult = transmuteAtomsOnCollision({
        atomA: precursors[idxA],
        atomB: precursors[idxB],
        collisionEnergy: colResult.netImpactEnergy,
        dmtIntensity: 0.0,
        rng,
      });

      if (transResult.transmuted) {
        canonicalDaughterAtoms.push(...transResult.daughterAtoms);
      }
    }
  }

  // 2. Paired Assembly
  const controlMolecules = assembleSiliconeMolecules({
    transmutedAtoms: canonicalDaughterAtoms,
    angularVelocity: synthesisSpin,
    dmtIntensity: 0.0,
    rng: mulberry32(seed ^ 0x101),
  });

  const dmtMolecules = assembleSiliconeMolecules({
    transmutedAtoms: canonicalDaughterAtoms,
    angularVelocity: synthesisSpin,
    dmtIntensity,
    rng: mulberry32(seed ^ 0x101),
  });

  // 3. Partition into 2x2 Factorial Cells
  const controlRings = controlMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING);
  const controlChains = controlMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN);
  const dmtRings = dmtMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING);
  const dmtChains = dmtMolecules.filter((m) => m.topology === MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN);

  const evaluateCell = (cellMolecules, label, topology, treatment) => {
    const totalCount = cellMolecules.length;
    const meanAtoms = totalCount > 0
      ? Number((cellMolecules.reduce((s, m) => s + m.atomCount, 0) / totalCount).toFixed(2))
      : 0;

    const survivalBySpin = quenchSpins.map((spin) => {
      const evals = cellMolecules.map((m) => evaluateQuenchSurvival(m, spin));
      const physStable = evals.filter((e) => e.isStableUnderQuench).length;
      const persistent = evals.filter((e) => e.isPersistent).length;
      const physPercent = totalCount > 0 ? Number(((physStable / totalCount) * 100).toFixed(1)) : 0;
      const ppspPercent = totalCount > 0 ? Number(((persistent / totalCount) * 100).toFixed(1)) : 0;
      return Object.freeze({
        spin,
        physStableCount: physStable,
        physStabilityPercent: physPercent,
        persistentCount: persistent,
        ppspPercent,
      });
    });

    return Object.freeze({
      label,
      topology,
      treatment,
      count: totalCount,
      meanAtomCount: meanAtoms,
      survivalBySpin: Object.freeze(survivalBySpin),
    });
  };

  const cellControlRings = evaluateCell(controlRings, 'Control Rings', 'CYCLIC_SILOXANE_RING', 'CONTROL (κ=0.0)');
  const cellDMTRings = evaluateCell(dmtRings, 'DMT Rings', 'CYCLIC_SILOXANE_RING', `+DMT (κ=${dmtIntensity})`);
  const cellControlChains = evaluateCell(controlChains, 'Control Chains', 'LINEAR_SILOXANE_CHAIN', 'CONTROL (κ=0.0)');
  const cellDMTChains = evaluateCell(dmtChains, 'DMT Chains', 'LINEAR_SILOXANE_CHAIN', `+DMT (κ=${dmtIntensity})`);

  // 4. Compute 2x2 Factorial Matrix & Causal Metrics at baseline operating spin omega = 80 rad/s
  const spin80Index = quenchSpins.indexOf(80) >= 0 ? quenchSpins.indexOf(80) : 2;

  const s_cRing = cellControlRings.survivalBySpin[spin80Index]?.physStabilityPercent ?? 0;
  const s_dRing = cellDMTRings.survivalBySpin[spin80Index]?.physStabilityPercent ?? 0;
  const s_cChain = cellControlChains.survivalBySpin[spin80Index]?.physStabilityPercent ?? 0;
  const s_dChain = cellDMTChains.survivalBySpin[spin80Index]?.physStabilityPercent ?? 0;

  const avgRingSurvival = Number(((s_cRing + s_dRing) / 2).toFixed(2));
  const avgChainSurvival = Number(((s_cChain + s_dChain) / 2).toFixed(2));
  const mainEffectTopology = Number((avgRingSurvival - avgChainSurvival).toFixed(2));

  const kappaEffectWithinRings = Number((s_dRing - s_cRing).toFixed(2));
  const kappaEffectWithinChains = Number((s_dChain - s_cChain).toFixed(2));

  // kappa's main effect, computed the SAME way as the topology main effect.
  // Reading |kappa| instead of its sign is how a harmful treatment prints as a
  // confirmation, so every branch below tests the signed value.
  const mainEffectKappa = Number((((s_dRing + s_dChain) / 2) - ((s_cRing + s_cChain) / 2)).toFixed(2));
  const interaction = Number((kappaEffectWithinRings - kappaEffectWithinChains).toFixed(2));

  // Direct standardisation. The arms carry different ring:chain mixes, so an
  // unmatched aggregate can favour the treatment purely by moving mass into the
  // stronger stratum. Score both arms at each arm's mix and see if the sign holds.
  const nCRing = cellControlRings.count;
  const nCChain = cellControlChains.count;
  const nDRing = cellDMTRings.count;
  const nDChain = cellDMTChains.count;
  const ringShare = (r, c) => ((r + c) > 0 ? r / (r + c) : 0);
  const pControlMix = ringShare(nCRing, nCChain);
  const pDmtMix = ringShare(nDRing, nDChain);
  const atMix = (p, ring, chain) => Number(((p * ring) + ((1 - p) * chain)).toFixed(2));

  const standardised = {
    controlMixRingShare: Number(pControlMix.toFixed(4)),
    dmtMixRingShare: Number(pDmtMix.toFixed(4)),
    atControlMix: Object.freeze({
      control: atMix(pControlMix, s_cRing, s_cChain),
      dmt: atMix(pControlMix, s_dRing, s_dChain),
      delta: Number((atMix(pControlMix, s_dRing, s_dChain) - atMix(pControlMix, s_cRing, s_cChain)).toFixed(2)),
    }),
    atDmtMix: Object.freeze({
      control: atMix(pDmtMix, s_cRing, s_cChain),
      dmt: atMix(pDmtMix, s_dRing, s_dChain),
      delta: Number((atMix(pDmtMix, s_dRing, s_dChain) - atMix(pDmtMix, s_cRing, s_cChain)).toFixed(2)),
    }),
  };
  const observedControl = atMix(pControlMix, s_cRing, s_cChain);
  const observedDmt = atMix(pDmtMix, s_dRing, s_dChain);
  standardised.observedDelta = Number((observedDmt - observedControl).toFixed(2));

  // The aggregate is only reportable when standardising does not change the story.
  const deltas = [standardised.observedDelta, standardised.atControlMix.delta, standardised.atDmtMix.delta];
  const signsAgree = deltas.every((d) => d > 0) || deltas.every((d) => d < 0);
  const interactionDominates = Math.abs(interaction) > Math.abs(mainEffectTopology)
    && Math.abs(interaction) > Math.abs(mainEffectKappa);

  const minCellCount = Math.min(nCRing, nCChain, nDRing, nDChain);
  const underpowered = minCellCount < MIN_FACTORIAL_CELL_COUNT;

  let causalVerdict;
  let aggregateReportable = true;
  let suppressionReason = null;

  if (interactionDominates) {
    // Neither main effect summarises a surface this bent.
    causalVerdict = 'INTERACTION_DOMINATES_MAIN_EFFECTS_NOT_SUMMARISABLE';
    aggregateReportable = false;
    suppressionReason = `|interaction| ${Math.abs(interaction)} exceeds both main effects`;
  } else if (!signsAgree) {
    // Observed gap does not survive holding composition constant.
    causalVerdict = 'COMPOSITION_ARTIFACT_NOT_TREATMENT_EFFECT';
    aggregateReportable = false;
    suppressionReason = `standardised deltas ${deltas.join(' / ')} do not share a sign`;
  } else if (mainEffectKappa < -CAUSAL_EFFECT_EPSILON) {
    causalVerdict = 'TREATMENT_HARMS_WITHIN_STRATA';
  } else if (mainEffectKappa > CAUSAL_EFFECT_EPSILON
    && kappaEffectWithinRings > 0 && kappaEffectWithinChains > 0) {
    causalVerdict = 'TREATMENT_HELPS_WITHIN_STRATA';
  } else if (Math.abs(mainEffectTopology) >= 20.0 && s_cRing > s_cChain && s_dRing > s_dChain) {
    causalVerdict = 'TOPOLOGY_IS_PRIMARY_CAUSAL_MECHANISM';
  } else {
    causalVerdict = 'NO_RESOLVABLE_EFFECT';
  }

  if (underpowered) {
    causalVerdict = `${causalVerdict}__UNDERPOWERED`;
  }

  const resultBody = {
    contract: SEMANTIC_SILICONE_CAUSAL_ABLATION_CONTRACT,
    schemaVersion: SEMANTIC_SILICONE_SCHEMA_VERSION,
    configuration: Object.freeze({
      seed,
      trialCount,
      synthesisSpin,
      dmtIntensity,
      quenchSpins: Object.freeze([...quenchSpins]),
      canonicalDaughterAtomsCount: canonicalDaughterAtoms.length,
    }),
    factorialCells: Object.freeze({
      controlRings: cellControlRings,
      dmtRings: cellDMTRings,
      controlChains: cellControlChains,
      dmtChains: cellDMTChains,
    }),
    causalAnalysisAtOperatingSpin80: Object.freeze({
      operatingSpin: 80.0,
      matrix: Object.freeze({
        controlRingsPhysicalSurvival: s_cRing,
        dmtRingsPhysicalSurvival: s_dRing,
        controlChainsPhysicalSurvival: s_cChain,
        dmtChainsPhysicalSurvival: s_dChain,
      }),
      effects: Object.freeze({
        avgRingSurvival,
        avgChainSurvival,
        mainEffectTopologyDelta: mainEffectTopology,
        mainEffectKappaDelta: mainEffectKappa,
        interactionDelta: interaction,
        kappaEffectWithinRingsDelta: kappaEffectWithinRings,
        kappaEffectWithinChainsDelta: kappaEffectWithinChains,
      }),
      standardisation: Object.freeze({
        ...standardised,
        atControlMix: standardised.atControlMix,
        atDmtMix: standardised.atDmtMix,
      }),
      cellCounts: Object.freeze({
        controlRings: nCRing,
        controlChains: nCChain,
        dmtRings: nDRing,
        dmtChains: nDChain,
        minCellCount,
        underpowered,
      }),
      aggregateReportable,
      suppressionReason,
      causalVerdict,
    }),
  };

  const checksum = `silicone-causal1:${sha256Hex(resultBody)}`;
  return Object.freeze({
    ...resultBody,
    checksum,
  });
}

/**
 * RING CLOSURE ISOLATION — the one-variable test for ring resilience.
 *
 * The arm comparison cannot attribute survival to topology, because the arms
 * differ in bond strength AND composition at the same time. This holds a single
 * molecule fixed and removes exactly one bond: the one whose deletion breaks the
 * cycle. Same atoms, same remaining bond strengths, cyclic vs acyclic.
 *
 * Honest limit: an opened ring necessarily has one fewer bond, and the acyclic
 * stress model indexes by position over bondCount, so bond count is not perfectly
 * held. That is the physical counterfactual (an open ring IS one bond short), not
 * a controlled one; `bondsRemoved` is reported so the reader can weigh it.
 *
 * PURE AND ZERO-I/O.
 */
export function openRingCounterfactual(molecule) {
  const graph = validateMolecularGraph(molecule);
  if (!graph.valid || !graph.hasCycle) return null;
  const bonds = molecule.bonds || [];
  for (let i = 0; i < bonds.length; i += 1) {
    const trimmed = bonds.filter((_, j) => j !== i);
    const candidate = {
      ...molecule,
      bonds: Object.freeze(trimmed),
      bondCount: trimmed.length,
      topology: MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN,
    };
    const probe = validateMolecularGraph(candidate);
    if (probe.valid && !probe.hasCycle) {
      return Object.freeze({ ...candidate, removedBond: bonds[i], bondsRemoved: 1 });
    }
  }
  return null;
}

export function isolateRingClosureEffect({
  molecules = [],
  quenchSpins = [40, 80, 120, 160, 200],
} = {}) {
  const pairs = [];
  for (const mol of molecules) {
    const opened = openRingCounterfactual(mol);
    if (opened) pairs.push({ closed: mol, opened });
  }

  const bySpin = quenchSpins.map((spin) => {
    let closedStable = 0;
    let openedStable = 0;
    let closedOnly = 0;
    let openedOnly = 0;
    for (const { closed, opened } of pairs) {
      const c = calculateCentrifugalBreakage(closed, spin).isStable;
      const o = calculateCentrifugalBreakage(opened, spin).isStable;
      if (c) closedStable += 1;
      if (o) openedStable += 1;
      if (c && !o) closedOnly += 1;
      if (o && !c) openedOnly += 1;
    }
    const n = pairs.length;
    // Paired binary data: the discordant counts ARE the test. Net marginals hide
    // which direction the disagreements ran.
    const discordant = closedOnly + openedOnly;
    return Object.freeze({
      spin,
      pairs: n,
      closedStable,
      openedStable,
      closedStablePercent: n > 0 ? Number(((closedStable / n) * 100).toFixed(1)) : 0,
      openedStablePercent: n > 0 ? Number(((openedStable / n) * 100).toFixed(1)) : 0,
      closureWins: closedOnly,
      closureLosses: openedOnly,
      discordant,
      exactBinomialP: exactTwoSidedSignP(closedOnly, discordant),
    });
  });

  const totalWins = bySpin.reduce((s, r) => s + r.closureWins, 0);
  const totalLosses = bySpin.reduce((s, r) => s + r.closureLosses, 0);
  const totalDiscordant = totalWins + totalLosses;

  let verdict;
  if (pairs.length === 0) {
    verdict = 'NO_CYCLIC_MOLECULES_TO_TEST';
  } else if (totalDiscordant === 0) {
    verdict = 'RING_CLOSURE_HAS_NO_EFFECT_ON_SURVIVAL';
  } else if (exactTwoSidedSignP(totalWins, totalDiscordant) >= 0.05) {
    verdict = 'RING_CLOSURE_EFFECT_NOT_SEPARATED_FROM_CHANCE';
  } else {
    verdict = totalWins > totalLosses ? 'RING_CLOSURE_IMPROVES_SURVIVAL' : 'RING_CLOSURE_HARMS_SURVIVAL';
  }

  return Object.freeze({
    contract: SEMANTIC_SILICONE_RING_ISOLATION_CONTRACT,
    schemaVersion: SEMANTIC_SILICONE_SCHEMA_VERSION,
    cyclicMoleculesTested: pairs.length,
    bySpin: Object.freeze(bySpin),
    pooled: Object.freeze({
      closureWins: totalWins,
      closureLosses: totalLosses,
      discordant: totalDiscordant,
      exactBinomialP: exactTwoSidedSignP(totalWins, totalDiscordant),
    }),
    verdict,
  });
}

/**
 * Exact two-sided sign test. Reported instead of a z-approximation because the
 * discordant counts here are small.
 */
export function exactTwoSidedSignP(successes, trials) {
  if (!Number.isFinite(trials) || trials <= 0) return 1;
  const k = Math.min(successes, trials - successes);
  let cumulative = 0;
  for (let i = 0; i <= k; i += 1) {
    let c = 1;
    for (let j = 0; j < i; j += 1) c = (c * (trials - j)) / (j + 1);
    cumulative += c;
  }
  return Math.min(1, Number(((2 * cumulative) / (2 ** trials)).toFixed(6)));
}

/**
 * Verifies the integrity of a Semantic Silicone Cyclotron Report.
 */
export function verifySemanticSiliconeReport(report) {
  if (!report || typeof report !== 'object') return false;
  if (report.contract !== SEMANTIC_SILICONE_CYCLOTRON_REPORT_CONTRACT) return false;
  if (report.schemaVersion !== SEMANTIC_SILICONE_SCHEMA_VERSION) return false;
  if (typeof report.checksum !== 'string' || !report.checksum.startsWith('silicone-cyclotron1:')) return false;

  const { checksum, ...body } = report;
  const expected = `silicone-cyclotron1:${sha256Hex(body)}`;
  return checksum === expected;
}
