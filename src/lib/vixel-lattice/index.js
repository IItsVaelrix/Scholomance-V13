/**
 * VIXEL LATTICE — Public API
 *
 * The composition boundary where pixel art and vector art become concurrent
 * within the QBIT Lattice field. Neither medium is subordinate. Each vixel
 * carries dual-medium identity: pixel-state (color, material) and
 * vector-state (curve provenance, normals, curvature).
 *
 * Usage:
 *   import { fuseToVixelField, evaluateVixelFeel } from './vixel-lattice/index.js';
 *
 *   const field = fuseToVixelField(scdlPacket, wandVectorPaths);
 *   const report = evaluateVixelFeel(field);
 *   console.log(report.spatialAwareness, report.vixelDiagnostics);
 *
 * @bytecode VIXEL-LATTICE-v1
 */

export {
  VIXEL_SCHEMA_VERSION,
  validatePixelState,
  validateVectorState,
  validateVixelField,
} from './vixel-schema.js';

export {
  fuseToVixelField,
  diffVixelFields,
} from './vixel-fusion.js';

export {
  vixelFieldToSpatialField,
  evaluateVixelFeel,
  diffVixelFeel,
} from './vixel-feel-adapter.js';
