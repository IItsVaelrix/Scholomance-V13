/**
 * SCDL V2 Read-Only Inspection Service (AGT-01)
 *
 * Provides comprehensive introspection into compiled SCDL v2 assets:
 * - Structured diagnostics (syntax, bindings, geometry, AMPs)
 * - Layer inventory (order, blend, opacity, cellCount, paintCount)
 * - Budget counters (candidateCells, rasterWrites, uniqueCells, generatedShapes)
 * - Full content digests (sourceDigest, buildDigest, packetDigest)
 * - Coordinate-to-provenance lookup table
 * - Selected active AMPs and evaluated catalog activation plan
 */

import { sha256Hex } from '../../sha256.js';
import { parseSCDLV2 } from './scdl-v2.parser.js';
import { analyzeSCDLV2 } from './scdl-v2.analyzer.js';
import { compileSCDLV2 } from './scdl-v2.compiler.js';

export const INSPECTION_CONTRACT = 'PB-SCDL-INSPECTION-v1';

/**
 * Inspects an SCDL v2 source text and produces a complete metadata inspection packet.
 *
 * @param {string} source - SCDL source string
 * @param {Object} [options] - Compiler options
 * @returns {Object} Inspection result packet
 */
export function inspectSCDLV2(source, options = {}) {
  const sourceText = String(source || '');
  const sourceDigest = sha256Hex(sourceText);
  const parsed = parseSCDLV2(sourceText);

  if (!parsed.ok) {
    return Object.freeze({
      contract: INSPECTION_CONTRACT,
      ok: false,
      assetId: null,
      version: 2,
      diagnostics: Object.freeze([...parsed.diagnostics]),
      layers: Object.freeze([]),
      budget: Object.freeze({ candidateCells: 0, rasterWrites: 0, uniqueCells: 0, generatedShapes: 0 }),
      digests: Object.freeze({ sourceDigest, buildDigest: null, packetDigest: null }),
      provenanceTable: Object.freeze([]),
      selectedAmps: Object.freeze([]),
      ampPlan: Object.freeze([]),
      getProvenance: () => null,
    });
  }

  const analyzed = analyzeSCDLV2(parsed.ast);
  const compiled = compileSCDLV2(sourceText, options);

  const assetId = compiled.analysis?.assetId || compiled.packet?.source?.id || analyzed.ir?.assetId || compiled.packet?.id || 'unknown';
  const canvas = compiled.packet?.canvas || analyzed.ir?.canvas || { width: 16, height: 16 };

  // Layer inventory
  const packageLayers = compiled.package?.layers || [];
  const layerInventory = [];

  for (const l of packageLayers) {
    const cells = l.cells || l.coordinates || [];
    layerInventory.push(Object.freeze({
      id: l.id,
      order: l.order,
      blend: l.blend || 'normal',
      opacity: l.opacity !== undefined ? l.opacity : 1,
      visible: l.visible !== false,
      cellCount: cells.length,
      paintCount: Array.isArray(l.paints) ? l.paints.length : 1,
    }));
  }

  // Provenance lookup
  const coords = compiled.packet?.geometry?.coordinates || compiled.packet?.coordinates || [];
  const provenanceMap = new Map();
  for (const c of coords) {
    provenanceMap.set(`${c.x},${c.y}`, Object.freeze({
      x: c.x,
      y: c.y,
      layerId: c.layerId || c.partId || 'Layer',
      paintId: c.paintId || null,
      featureKey: c.featureKey || null,
      color: c.color,
      ampChain: c.ampChain || (compiled.analysis?.activeAmpIds || []),
    }));
  }

  const packetDigest = compiled.packet ? sha256Hex(JSON.stringify(compiled.packet)) : null;
  const buildDigest = compiled.packet?.buildDigest || (compiled.packet ? sha256Hex(JSON.stringify(compiled.packet.geometry || {})) : null);

  const budget = Object.freeze({
    candidateCells: compiled.metrics?.candidateCells || coords.length,
    rasterWrites: compiled.metrics?.rasterWrites || coords.length,
    uniqueCells: compiled.metrics?.uniqueCells || coords.length,
    generatedShapes: compiled.metrics?.generatedShapes || 0,
  });

  return Object.freeze({
    contract: INSPECTION_CONTRACT,
    ok: Boolean(compiled.ok),
    assetId,
    version: 2,
    canvas: Object.freeze({ ...canvas }),
    layers: Object.freeze(layerInventory),
    budget,
    digests: Object.freeze({
      sourceDigest,
      buildDigest,
      packetDigest,
    }),
    diagnostics: Object.freeze([...(compiled.diagnostics || [])]),
    selectedAmps: Object.freeze([...(analyzed.ir?.selectedAmps || [])]),
    ampPlan: Object.freeze([...(analyzed.ir?.ampPlan || [])]),
    getProvenance(x, y) {
      return provenanceMap.get(`${x},${y}`) || null;
    },
    provenanceEntries: Object.freeze([...provenanceMap.values()]),
    provenanceTable: Object.freeze([...provenanceMap.values()]),
  });
}
