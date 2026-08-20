/**
 * CHLOROPLAST-CYCLOTRON TELEMETRY WIRE & CLOSED-LOOP FIELD CONTROLLER
 *
 * Establishes the indirect Telemetry Bus where local chloroplasts publish pure
 * measurements, and the Cyclotron aggregates them into global observables to
 * dynamically reorient the parsing field without rewriting grammar rules.
 *
 * ARCHITECTURAL STACK:
 * Chloroplasts → Local Measurements → Telemetry Field → Cyclotron → Global Field Orientation
 *
 * Contracts:
 * - PB-CHLOROPLAST-LOCAL-MEASUREMENT-v1
 * - PB-TELEMETRY-FIELD-OBSERVABLES-v1
 * - PB-CYCLOTRON-FIELD-ORIENTATION-v1
 * - PB-CHLOROPLAST-CYCLOTRON-TELEMETRY-v1
 *
 * Pure core: zero I/O, zero clock, zero randomness, 100% deterministic.
 *
 * @module codex/core/constellation/chloroplast-cyclotron-wire
 */

import { createHash } from 'node:crypto';
import { calculateCyclotronKinematics } from '../pixelbrain/semantic-silicone-reactor.js';
import { composePacked, ROOT_DOORWAY } from './compose-packed.js';
import { spectralCosineSimilarity } from './perturbation-beam.js';
import { admitSpectralResponse } from './spectral-rejections.js';

export const CHLOROPLAST_CYCLOTRON_CONTRACT = 'PB-CHLOROPLAST-CYCLOTRON-TELEMETRY-v1';
export const CHLOROPLAST_CYCLOTRON_SCHEMA_VERSION = '1.0.0';

/** Deterministic SHA-256 serializer. */
export function sha256Hex(data) {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * 1. LOCAL CHLOROPLAST MEASUREMENT EMISSION
 *
 * Emits pure local physical/optical measurements from an atom's chloroplast.
 * Sends NO semantic conclusions.
 *
 * @param {object} atom
 * @param {object} [trace]
 * @returns {Readonly<{
 *   aura: string,
 *   span: [number, number],
 *   irradiance_in: number,
 *   absorption: number,
 *   voltage: number,
 *   resonance: number,
 *   damping: number,
 *   coupling_count: number,
 *   refusal_count: number,
 *   spectral_response: object|null,
 *   trace_energy: number
 * }>}
 */
export function emitChloroplastLocalMeasurement(atom, trace = null) {
  const cp = atom?.chloroplast || {};
  const wonCells = atom?.wonCells || [];
  const cells = cp.cells || [];

  const irradiance_in = Number((cp.irradiance ?? 0).toFixed(4));
  const voltage = Number((atom?.charge ?? cp.voltage ?? 0).toFixed(4));
  const absorption = Number((cells.reduce((acc, c) => acc + (c.voltage || 0), 0)).toFixed(4));
  const resonance = Number((absorption / Math.max(1, cells.length)).toFixed(4));
  const damping = cp.damping ?? 1.0;
  const coupling_count = wonCells.length;
  const refusal_count = cp.refusals?.length ?? 0;
  const trace_energy = Number((trace?.energy ?? 0).toFixed(4));
  const spectral_response = admitSpectralResponse(
    atom?.spectralVector || null,
    'chloroplast-local-measurement',
  );

  return Object.freeze({
    aura: atom?.nucleus?.aura || `atom-${atom?.from ?? 0}`,
    span: Object.freeze([atom?.from ?? 0, atom?.to ?? atom?.from ?? 0]),
    irradiance_in,
    absorption,
    voltage,
    resonance,
    damping,
    coupling_count,
    refusal_count,
    spectral_response,
    trace_energy,
  });
}

/**
 * 2. TELEMETRY FIELD BUS AGGREGATION
 *
 * Collects local measurements published onto the shared telemetry field
 * and calculates global observables for the Cyclotron.
 *
 * @param {Array<object>} measurements List of local measurements
 * @returns {Readonly<{
 *   contract: string,
 *   atomCount: number,
 *   meanResonance: number,
 *   resonanceVariance: number,
 *   hotspots: ReadonlyArray<object>,
 *   deadZones: ReadonlyArray<object>,
 *   longRangeCorrelations: ReadonlyArray<object>,
 *   unresolvedValencePressure: number,
 *   darkMatterTraceDensity: number,
 *   measurements: ReadonlyArray<object>
 * }>}
 */
export function aggregateTelemetryField(measurements = []) {
  const list = Array.isArray(measurements) ? measurements : [];
  const n = list.length;
  if (n === 0) {
    return Object.freeze({
      contract: 'PB-TELEMETRY-FIELD-OBSERVABLES-v1',
      atomCount: 0,
      meanResonance: 0,
      resonanceVariance: 0,
      hotspots: Object.freeze([]),
      deadZones: Object.freeze([]),
      longRangeCorrelations: Object.freeze([]),
      unresolvedValencePressure: 0,
      darkMatterTraceDensity: 0,
      measurements: Object.freeze([]),
    });
  }

  const resonances = list.map((m) => m.resonance);
  const meanResonance = Number((resonances.reduce((a, b) => a + b, 0) / n).toFixed(4));
  const variance = Number((resonances.reduce((acc, r) => acc + ((r - meanResonance) ** 2), 0) / n).toFixed(4));

  const hotspots = [];
  const deadZones = [];
  let unresolvedValencePressure = 0;
  let totalTraceEnergy = 0;

  for (const m of list) {
    totalTraceEnergy += m.trace_energy;
    // Hotspot: High voltage / absorption but ZERO winning couplings (high unresolved tension)
    if (m.absorption > 0.5 && m.coupling_count === 0) {
      hotspots.push(Object.freeze({ span: m.span, aura: m.aura, voltage: m.voltage }));
      unresolvedValencePressure += m.absorption;
    }
    // Dead Zone: 0 irradiance or underexcited
    if (m.irradiance_in === 0) {
      deadZones.push(Object.freeze({ span: m.span, aura: m.aura }));
    }
  }

  // Detect long-range correlated spectra across the telemetry field
  const longRangeCorrelations = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      const mA = list[i];
      const mB = list[j];
      if (mA.spectral_response && mB.spectral_response) {
        const sim = spectralCosineSimilarity(mA.spectral_response, mB.spectral_response);
        if (sim >= 0.85) {
          longRangeCorrelations.push(Object.freeze({
            spanA: mA.span,
            spanB: mB.span,
            sim,
          }));
        }
      }
    }
  }

  const darkMatterTraceDensity = Number((totalTraceEnergy / n).toFixed(4));

  return Object.freeze({
    contract: 'PB-TELEMETRY-FIELD-OBSERVABLES-v1',
    atomCount: n,
    meanResonance,
    resonanceVariance: variance,
    hotspots: Object.freeze(hotspots),
    deadZones: Object.freeze(deadZones),
    longRangeCorrelations: Object.freeze(longRangeCorrelations),
    unresolvedValencePressure: Number(unresolvedValencePressure.toFixed(4)),
    darkMatterTraceDensity,
    measurements: Object.freeze(list),
  });
}

/**
 * 3. CYCLOTRON CLOSED-LOOP FIELD ORIENTATION UPDATE
 *
 * Ingests the Telemetry Field and computes field orientation updates:
 * - Damping hotspots to suppress combinatorial explosion
 * - Boosting dead-zones to stimulate lawful exploration
 * - Up-weighting long-range correlated spans
 *
 * @param {object} telemetryField Aggregated observables
 * @param {number} sentenceLength Total token span count
 * @returns {Readonly<{
 *   fieldBias: ReadonlyArray<number>,
 *   magneticDamping: ReadonlyArray<number>,
 *   resonanceFocus: ReadonlyArray<number>,
 *   cyclotronVerdict: string
 * }>}
 */
export function cyclotronComputeFieldOrientation(telemetryField, sentenceLength = 1, config = {}) {
  const n = Math.max(1, sentenceLength);
  const fieldBias = new Array(n).fill(1.0);
  const magneticDamping = new Array(n).fill(0.0);
  const resonanceFocus = new Array(n).fill(1.0);

  const enableDamping = config.enableDamping ?? true;
  const enableExcitation = config.enableExcitation ?? true;
  const enableFocus = config.enableFocus ?? true;

  const hotspots = telemetryField.hotspots || [];
  const deadZones = telemetryField.deadZones || [];
  const correlations = telemetryField.longRangeCorrelations || [];

  // 1. Damp hotspots
  if (enableDamping) {
    for (const h of hotspots) {
      const idx = h.span[0];
      if (idx >= 0 && idx < n) {
        magneticDamping[idx] += 0.35;
        fieldBias[idx] *= 0.75;
      }
    }
  }

  // 2. Stimulate dead-zones
  if (enableExcitation) {
    for (const d of deadZones) {
      const idx = d.span[0];
      if (idx >= 0 && idx < n) {
        fieldBias[idx] *= 1.25;
        resonanceFocus[idx] *= 1.20;
      }
    }
  }

  // 3. Focus resonant correlations
  if (enableFocus) {
    for (const c of correlations) {
      const i = c.spanA[0];
      const j = c.spanB[0];
      if (i >= 0 && i < n) resonanceFocus[i] *= 1.30;
      if (j >= 0 && j < n) resonanceFocus[j] *= 1.30;
    }
  }

  let cyclotronVerdict = 'EQUILIBRIUM';
  if (enableDamping && enableExcitation && hotspots.length > 0 && deadZones.length > 0) {
    cyclotronVerdict = 'HETEROGENEOUS_TENSION_BALANCED';
  } else if (enableDamping && hotspots.length > 0) {
    cyclotronVerdict = 'COLLISION_HOTSPOTS_DAMPED';
  } else if (enableExcitation && deadZones.length > 0) {
    cyclotronVerdict = 'DEAD_ZONES_EXCITED';
  }

  return Object.freeze({
    fieldBias: Object.freeze(fieldBias.map((v) => Number(v.toFixed(4)))),
    magneticDamping: Object.freeze(magneticDamping.map((v) => Number(v.toFixed(4)))),
    resonanceFocus: Object.freeze(resonanceFocus.map((v) => Number(v.toFixed(4)))),
    cyclotronVerdict,
  });
}

/**
 * 4. INTER-CHLOROPLAST MESH (INDIRECT PHOTONIC INTEGRATION)
 */
export function buildInterChloroplastMesh(atoms = [], options = {}) {
  const attenuationFactor = options.attenuationFactor ?? 0.15;
  const list = Array.isArray(atoms) ? atoms : [];
  let totalCells = 0;
  let totalIrradiance = 0;
  let totalVoltage = 0;
  const meshLinks = [];

  for (let i = 0; i < list.length; i += 1) {
    const atomA = list[i];
    const cpA = atomA.chloroplast || {};
    const cellsA = cpA.cells || [];
    totalCells += cellsA.length;
    totalIrradiance += cpA.irradiance || 0;
    totalVoltage += (atomA.charge ?? cpA.voltage ?? 0);

    for (let j = 0; j < list.length; j += 1) {
      if (i === j) continue;
      const atomB = list[j];
      const cpB = atomB.chloroplast || {};

      const dist = Math.abs((atomA.from ?? i) - (atomB.from ?? j)) || 1;
      const voltA = atomA.charge ?? cpA.voltage ?? 0;
      const voltB = atomB.charge ?? cpB.voltage ?? 0;

      if (voltA > 0 && voltB > 0) {
        const transmittedFlux = (voltA * voltB) / (1 + (dist * attenuationFactor));
        meshLinks.push(Object.freeze({
          fromIndex: i,
          toIndex: j,
          fromSpan: atomA.from ?? i,
          toSpan: atomB.from ?? j,
          distance: dist,
          transmittedFlux: Number(transmittedFlux.toFixed(4)),
          sourceAura: atomA.nucleus?.aura || null,
          targetAura: atomB.nucleus?.aura || null,
        }));
      }
    }
  }

  const interChloroplastFlux = meshLinks.reduce((acc, l) => acc + l.transmittedFlux, 0);
  const meanCellVoltage = totalCells > 0 ? (totalVoltage / totalCells) : 0;
  const phaseCoherence = totalVoltage > 0
    ? Math.min(1.0, Number((interChloroplastFlux / (totalVoltage * Math.max(1, list.length))).toFixed(4)))
    : 0;

  return Object.freeze({
    atomCount: list.length,
    totalCells,
    totalIrradiance: Number(totalIrradiance.toFixed(4)),
    totalVoltage: Number(totalVoltage.toFixed(4)),
    meshLinks: Object.freeze(meshLinks),
    interChloroplastFlux: Number(interChloroplastFlux.toFixed(4)),
    phaseCoherence,
    meanCellVoltage: Number(meanCellVoltage.toFixed(4)),
  });
}

/**
 * 5. DIRECT STREAM TO CYCLOTRON KINEMATICS
 */
export function streamChloroplastToCyclotron(chloroplastMesh, cyclotronConfig = {}) {
  const mesh = chloroplastMesh || buildInterChloroplastMesh([]);
  const netCharge = Math.max(0.1, mesh.totalVoltage || 1.0);
  const effectiveMass = Math.max(1.0, (mesh.totalCells * 2.5) + (mesh.atomCount * 1.2));
  const rfVoltage = Math.max(10.0, (mesh.interChloroplastFlux * 5.0) + (cyclotronConfig.baseRfVoltage || 50.0));
  const magneticField = Math.max(0.5, (mesh.phaseCoherence * 3.0) + (cyclotronConfig.baseMagneticField || 2.0));
  const angularVelocity = (cyclotronConfig.angularVelocity || 120.0) * (1.0 + mesh.phaseCoherence * 0.5);
  const radius = cyclotronConfig.radius || 0.85;
  const turns = cyclotronConfig.turns || 50;

  const cyclotronKinematics = calculateCyclotronKinematics({
    mass: effectiveMass,
    charge: netCharge,
    magneticField,
    rfVoltage,
    angularVelocity,
    radius,
    turns,
  });

  const couplingEfficiency = mesh.totalIrradiance > 0
    ? Number((cyclotronKinematics.totalRotationalEnergy / (mesh.totalIrradiance * 100.0)).toFixed(4))
    : 0;

  const payload = {
    contract: CHLOROPLAST_CYCLOTRON_CONTRACT,
    schemaVersion: CHLOROPLAST_CYCLOTRON_SCHEMA_VERSION,
    telemetryType: 'CHLOROPLAST_TO_CYCLOTRON_DIRECT_STREAM',
    chloroplastTelemetry: {
      atomCount: mesh.atomCount,
      totalCells: mesh.totalCells,
      totalIrradiance: mesh.totalIrradiance,
      totalVoltage: mesh.totalVoltage,
      interChloroplastFlux: mesh.interChloroplastFlux,
      phaseCoherence: mesh.phaseCoherence,
      meanCellVoltage: mesh.meanCellVoltage,
      activeMeshLinksCount: mesh.meshLinks.length,
    },
    cyclotronKinematics,
    couplingEfficiency,
  };

  const checksum = `chloroplast-cyclotron-v1:${sha256Hex(payload)}`;

  return Object.freeze({
    ...payload,
    checksum,
  });
}

/**
 * 6. CLOSED-LOOP COMPOSITION HARNESS
 *
 * Runs closed-loop syntax composition where local chloroplast measurements
 * continuously inform the Cyclotron field orientation to steer agenda dequeueing.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {object} [options]
 * @returns {Readonly<object>}
 */
export function composeWithClosedLoopCyclotron(tokens, posMap, options = {}) {
  const roots = options.roots || ROOT_DOORWAY.ALL;

  // 1. Initial local ingestion pass to sample chloroplast states
  const baseChart = composePacked(tokens, posMap, { ...options, roots });
  const field = baseChart.field || [];
  const localMeasurements = [];
  for (const slot of field) {
    for (const atom of slot.atoms || []) {
      localMeasurements.push(emitChloroplastLocalMeasurement(atom));
    }
  }

  // 2. Aggregate observables on the Telemetry Bus
  const telemetryField = aggregateTelemetryField(localMeasurements);

  // 3. Cyclotron determines field orientation adjustments
  const fieldOrientation = cyclotronComputeFieldOrientation(
    telemetryField,
    tokens.length,
    options.cyclotronConfig || {},
  );

  // 4. Closed-loop guided composition with dynamic priority queue
  const guidedChart = composePacked(tokens, posMap, {
    ...options,
    roots,
    agenda: 'telemetry',
    fieldOrientation,
  });

  // 5. Compute inter-chloroplast mesh and stream cyclotron receipt
  const chloroplastMesh = buildInterChloroplastMesh(localMeasurements);
  const cyclotronReceipt = streamChloroplastToCyclotron(chloroplastMesh);

  return Object.freeze({
    ...guidedChart,
    telemetryField,
    fieldOrientation,
    chloroplastMesh,
    cyclotronReceipt,
  });
}

