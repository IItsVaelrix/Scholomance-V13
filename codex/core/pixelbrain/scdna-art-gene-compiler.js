/**
 * SCDNA Art-Gene Compiler — Validate → Project → Preview → Approve → Commit
 *
 * Implements §6.1 (human authority), §6.3 (separate identities),
 * §10.4 (commit flow), §10.6 (deterministic preview), §10.7 (Feel gate).
 *
 * The compiler may NOT fabricate authority objects. Only the interactive
 * human gate may produce a validated ArtApprovalRecord.
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr-revised.md
 */

import crypto from 'node:crypto';
import {
  checksumStableJSON,
  stableStringify,
  PROJECTION_ALGO_VERSION,
  CONFLICT_POLICY_VERSION,
} from './scdna-art-gene.js';
import { projectGenes } from './scdl/passes/project-genes.pass.js';
import {
  createArtMemoryRecord,
  appendArtMemoryRecord,
} from './scdna-art-gene-store.js';

// ─── Preview Renderer Version ────────────────────────────────────────────────

export const PREVIEW_RENDERER_VERSION = '1.0.0';

// ─── Authority Validation (§6.1) ────────────────────────────────────────────

/**
 * Validate that an approval carries a genuine interactive human authority.
 * A nonempty approvedBy string is NOT sufficient.
 *
 * @param {object} approval
 * @throws {Error} ART_GENE_REQUIRES_HUMAN_APPROVAL
 */
export function validateApprovalAuthority(approval) {
  if (
    approval?.authority?.kind !== 'human' ||
    approval?.authority?.source !== 'interactive-human-gate' ||
    !approval?.authority?.actorId
  ) {
    throw new Error('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  }
}

// ─── Deterministic Preview (§10.6) ──────────────────────────────────────────

/**
 * Compute the two preview identities: model checksum and document checksum.
 *
 * @param {object} params
 * @param {{ width: number, height: number }} params.canvas
 * @param {ReadonlyArray<object>} params.cells
 * @param {string} params.paletteRoleMappingVersion
 * @returns {{ modelChecksum: string, documentChecksum: string, svgSource: string }}
 */
export function computePreviewChecksums({ canvas, cells, paletteRoleMappingVersion }) {
  // Model checksum: canonical cell array + palette mapping + canvas
  const modelChecksum = checksumStableJSON({
    canvas,
    cells: cells.map((c) => ({ x: c.x, y: c.y, color: c.color, role: c.role })),
    paletteRoleMappingVersion,
  });

  // Deterministic SVG source
  const svgSource = renderDeterministicArtPreviewSVG({
    canvas,
    cells,
    rendererVersion: PREVIEW_RENDERER_VERSION,
  });

  // Document checksum: SVG source bytes + renderer version
  const documentChecksum = checksumBytes(svgSource);

  return { modelChecksum, documentChecksum, svgSource };
}

/**
 * Render a deterministic SVG preview of projected cells.
 * Pure function — no randomness, no timestamps.
 */
export function renderDeterministicArtPreviewSVG({ canvas, cells, rendererVersion }) {
  const scale = 8;
  const w = canvas.width * scale;
  const h = canvas.height * scale;

  const rects = cells.map((cell) => {
    const color = cell.color || '#888888';
    return `  <rect x="${cell.x * scale}" y="${cell.y * scale}" width="${scale}" height="${scale}" fill="${color}" data-role="${cell.role || 'unknown'}" data-x="${cell.x}" data-y="${cell.y}"/>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Art Gene Preview — renderer v${rendererVersion} -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Art gene projection preview: ${canvas.width}x${canvas.height} canvas, ${cells.length} cells">`,
    `  <title>Art Gene Projection Preview</title>`,
    `  <desc>Deterministic preview of ${cells.length} projected cells on a ${canvas.width}x${canvas.height} canvas.</desc>`,
    `  <rect width="${w}" height="${h}" fill="#1a1a2e"/>`,
    ...rects,
    `</svg>`,
  ].join('\n');
}

function checksumBytes(str) {
  const hash = crypto.createHash('sha256').update(str, 'utf8').digest('hex');
  return `scd64:${hash.slice(0, 64)}`;
}

// ─── Commit Flow (§10.4) ────────────────────────────────────────────────────

/**
 * Commit an approved art gene through the full pipeline:
 * validate authority → verify preview binding → persist to ledger.
 *
 * @param {object} params
 * @param {Readonly<ArtGenePacket>} params.gene
 * @param {Readonly<ArtProjectionResult>} params.projection
 * @param {{ modelChecksum: string, documentChecksum: string }} params.preview
 * @param {Readonly<ArtApprovalRecord>} params.approval
 * @param {string} params.compilerVersion
 * @returns {Readonly<ArtMemoryRecord>}
 * @throws {Error} on authority or checksum mismatch
 */
export function commitGene({ gene, projection, preview, approval, compilerVersion }) {
  // §6.1: Validate human authority
  validateApprovalAuthority(approval);

  // §6.3: Verify gene checksum binding
  if (approval.geneChecksum !== gene.checksum) {
    throw new Error('ART_APPROVAL_GENE_CHECKSUM_MISMATCH');
  }

  // §6.3: Verify projection checksum binding
  if (approval.projectionChecksum !== projection.projectionChecksum) {
    throw new Error('ART_APPROVAL_PROJECTION_CHECKSUM_MISMATCH');
  }

  // §6.3: Verify preview model checksum binding
  if (approval.previewModelChecksum !== preview.modelChecksum) {
    throw new Error('ART_APPROVAL_PREVIEW_MODEL_MISMATCH');
  }

  // §6.3: Verify preview document checksum binding
  if (approval.previewDocumentChecksum !== preview.documentChecksum) {
    throw new Error('ART_APPROVAL_PREVIEW_DOCUMENT_MISMATCH');
  }

  // Create and persist the memory record
  const memoryRecord = createArtMemoryRecord({
    eventType: 'curation',
    code: 'PB-OK-v1-ART-GENE-CURATED',
    assetId: gene.assetId,
    geneId: gene.geneId,
    geneChecksum: gene.checksum,
    projectionChecksum: projection.projectionChecksum,
    approval: {
      ...approval,
      compilerVersion,
    },
    payload: {
      projectionMode: gene.projectionMode,
      cellCount: projection.cells.length,
      conflictCount: projection.conflicts.length,
    },
  });

  appendArtMemoryRecord(memoryRecord);
  return memoryRecord;
}

// ─── Feel Gate (§10.7) ──────────────────────────────────────────────────────

/**
 * Evaluate Feel score for a projection. Warn-only — never mutates cells.
 *
 * @param {object} params
 * @param {Readonly<ArtProjectionResult>} params.projection
 * @param {string} params.assetId
 * @param {number} params.threshold
 * @param {function} [params.evaluateFeel] - Injectable Feel evaluator
 * @returns {{ score: object, event: Readonly<ArtMemoryRecord>|null }}
 */
export function evaluateArtProjection({ projection, assetId, threshold, evaluateFeel }) {
  // Default Feel evaluator: simple spatial coverage metric
  const feelFn = evaluateFeel ?? defaultEvaluateFeel;
  const score = feelFn(projection.cells, assetId);

  if (score.spatialAwareness < threshold) {
    const event = createArtMemoryRecord({
      eventType: 'feel-warning',
      code: 'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
      assetId,
      geneId: 'MULTI_GENE_PROJECTION',
      geneChecksum: checksumGeneSet(projection),
      projectionChecksum: projection.projectionChecksum,
      payload: {
        score: score.spatialAwareness,
        threshold,
        action: 'none',
        aestheticApproval: 'REQUIRES_HUMAN',
      },
    });

    return { score, event };
  }

  return { score, event: null };
}

function defaultEvaluateFeel(cells, _assetId) {
  if (cells.length === 0) return { spatialAwareness: 0, geometry: 0, construction: 0, silhouette: 0 };

  // Simple coverage-based metric
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const spanX = Math.max(...xs) - Math.min(...xs) + 1;
  const spanY = Math.max(...ys) - Math.min(...ys) + 1;
  const coverage = cells.length / (spanX * spanY);

  return {
    spatialAwareness: Math.min(1, coverage),
    geometry: Math.min(1, cells.length / 10),
    construction: coverage > 0.3 ? 1 : 0.5,
    silhouette: coverage > 0.5 ? 1 : 0.5,
  };
}

function checksumGeneSet(projection) {
  return checksumStableJSON({
    orderedGeneIds: projection.orderedGeneIds,
    projectionChecksum: projection.projectionChecksum,
  });
}
