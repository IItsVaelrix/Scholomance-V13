/**
 * Browser-safe diagnostic constants.
 *
 * This module intentionally imports no Node built-ins so both Codex core and
 * UI adapters can share diagnostic literals without bundling server-only code.
 */

export const HEALTH_SEVERITY = Object.freeze({
  PASS: 'pass',
  INFO: 'info',
  ARCHIVED: 'archived',
  // RED-PATH: distress severity. A node that fails an invariant sheds a RED
  // exosome and seeds the QBIT field (see SPATIAL-IMMUNE-DIAGNOSTICS.md).
  RED: 'red',
  // CRITICAL: a corrupt render payload (e.g. an invalid #NaN color) that the
  // macrophage must engulf. Higher urgency than RED geometric distress.
  CRITICAL: 'critical',
});

export const HEALTH_CODES = Object.freeze({
  IMMUNE_PASS_COORD: 'PB-OK-v1-IMMUNE-PASS-COORD',
  LAYER_BOUNDARY_OK: 'PB-OK-v1-LAYER-BOUNDARY-OK',
  TEST_COVERAGE_PASS: 'PB-OK-v1-TEST-COVERAGE-PASS',
  FIXTURE_SHAPE_OK: 'PB-OK-v1-FIXTURE-SHAPE-OK',
  PROCESSOR_BRIDGE_CLEAN: 'PB-OK-v1-PROCESSOR-BRIDGE-CLEAN',
  CELL_SCAN_CLEAN: 'PB-OK-v1-CELL-SCAN-CLEAN',
  QUANT_FIDELITY_PASS: 'PB-OK-v1-QUANT-FIDELITY-PASS',
  // RED-PATH distress codes.
  TRUESIGHT_NODE_HEALTHY: 'PB-OK-v1-TRUESIGHT-NODE-HEALTHY',
  TRUESIGHT_NODE_DISTRESS: 'PB-RED-v1-TRUESIGHT-NODE-DISTRESS',
  // SPECTRAL/CHROMATIC sub-frequency: the VerseIR color pipeline.
  TRUESIGHT_CHROMA_OK: 'PB-OK-v1-TRUESIGHT-CHROMA-OK',
  TRUESIGHT_CHROMA_BLEED: 'PB-ERR-v1-TRUESIGHT-CHROMA-BLEED',
  // ─── ART DIRECTION (PDR Phase 4) ────────────────────────────────────────
  ART_GENE_CURATED: 'PB-OK-v1-ART-GENE-CURATED',
  ART_PROJECTION_OK: 'PB-OK-v1-ART-PROJECTION-OK',
  ART_FEEL_BELOW_THRESHOLD: 'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
  ART_MOTIF_NOMINATED: 'PB-OK-v1-ART-MOTIF-NOMINATED',
});

/**
 * Well-known diagnostic cell IDs.
 */
export const CELL_IDS = Object.freeze({
  IMMUNITY_SCAN: 'IMMUNITY_SCAN',
  LAYER_BOUNDARY: 'LAYER_BOUNDARY',
  TEST_COVERAGE: 'TEST_COVERAGE',
  FIXTURE_SHAPE: 'FIXTURE_SHAPE',
  PROCESSOR_BRIDGE: 'PROCESSOR_BRIDGE',
  CONNECTION_HEALTH: 'CONNECTION_HEALTH',
  LIFECYCLE: 'LIFECYCLE',
  DB_HEALTH: 'DB_HEALTH',
  VECTOR_FIDELITY: 'VECTOR_FIDELITY',
  // RED-PATH: the TrueSight annotation overlay (word hit-box lattice).
  TRUESIGHT_OVERLAY: 'TRUESIGHT_OVERLAY',
  // SPECTRAL: the VerseIR chroma engine (phoneme → OKLCh → hex color).
  VERSE_IR_RENDERER: 'VERSE_IR_RENDERER',
});
