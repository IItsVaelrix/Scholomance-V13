/**
 * SCDL Project Genes Pass — Deterministic Art-Gene Projection
 *
 * Pure function: no I/O, no clock, no filesystem, no event emission.
 * Accepts approved art-direction genes and a projection context,
 * returns frozen ProjectedArtCell[] with full causal provenance.
 *
 * PDR §8.4–8.6, §9 Hop 2, §6.2 (deterministic projection).
 *
 * @typedef {import('../scdna-art-gene.js').ArtGenePacket} ArtGenePacket
 * @typedef {object} ArtProjectionContext
 * @property {{ width: number, height: number }} canvas
 * @property {string} compilerVersion
 * @property {number} projectionAlgoVersion
 * @property {number} conflictPolicyVersion
 * @property {string} paletteRoleMappingVersion
 * @property {Record<string, { checksum: string, width: number, height: number, values: number[] }>} sdfByPart
 */

import {
  checksumStableJSON,
  stableStringify,
  PROJECTION_ALGO_VERSION,
  CONFLICT_POLICY_VERSION,
} from '../../scdna-art-gene.js';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Project approved art-direction genes onto a canvas.
 *
 * @param {ReadonlyArray<ArtGenePacket>} genes - Approved art genes (any order)
 * @param {ArtProjectionContext} context - Projection context (all inputs explicit)
 * @returns {Readonly<ArtProjectionResult>}
 */
export function projectGenes(genes, context) {
  // §6.5: No genes → strict no-op with deterministic empty checksum
  if (!genes || genes.length === 0) {
    const emptyChecksum = checksumStableJSON({
      genes: [],
      canvas: context.canvas,
      projectionAlgoVersion: context.projectionAlgoVersion ?? PROJECTION_ALGO_VERSION,
      conflictPolicyVersion: context.conflictPolicyVersion ?? CONFLICT_POLICY_VERSION,
      compilerVersion: context.compilerVersion,
      paletteRoleMappingVersion: context.paletteRoleMappingVersion,
      sdfByPart: {},
    });

    return Object.freeze({
      cells: Object.freeze([]),
      projectionChecksum: emptyChecksum,
      orderedGeneIds: Object.freeze([]),
      conflicts: Object.freeze([]),
      projectionAlgoVersion: context.projectionAlgoVersion ?? PROJECTION_ALGO_VERSION,
      conflictPolicyVersion: context.conflictPolicyVersion ?? CONFLICT_POLICY_VERSION,
    });
  }

  // Step 3: Canonical ordering — priority ascending, then geneId ascending
  const ordered = [...genes].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.geneId.localeCompare(b.geneId);
  });

  const orderedGeneIds = ordered.map((g) => g.geneId);

  // Step 4–6: Resolve cells from each gene
  const cellMap = new Map(); // "x,y" → ProjectedArtCell
  const conflicts = [];

  for (const gene of ordered) {
    const geneCells = resolveGeneCells(gene, context);

    for (const cell of geneCells) {
      const key = `${cell.x},${cell.y}`;
      const existing = cellMap.get(key);

      if (existing) {
        // Step 7: Deterministic overlap policy — later in canonical order wins
        conflicts.push(Object.freeze({
          x: cell.x,
          y: cell.y,
          winnerGeneId: gene.geneId,
          loserGeneId: existing._gene.geneId,
          policy: 'priority-then-geneId',
        }));

        cellMap.set(key, {
          ...cell,
          _gene: {
            ...cell._gene,
            overlap: Object.freeze({
              replacedGeneId: existing._gene.geneId,
              policy: 'priority-then-geneId',
            }),
          },
        });
      } else {
        cellMap.set(key, cell);
      }
    }
  }

  // Step 8: Compute projection checksum from all bound inputs
  const projectionChecksum = computeProjectionChecksum(ordered, context);

  // Step 9: Attach final projection provenance to every surviving cell
  const cells = [];
  for (const cell of cellMap.values()) {
    cells.push(Object.freeze({
      ...cell,
      _gene: Object.freeze({
        ...cell._gene,
        projectionChecksum,
        passVersion: context.projectionAlgoVersion ?? PROJECTION_ALGO_VERSION,
      }),
    }));
  }

  // Sort cells deterministically for stable output
  cells.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // Step 10: Return frozen result
  return Object.freeze({
    cells: Object.freeze(cells),
    projectionChecksum,
    orderedGeneIds: Object.freeze(orderedGeneIds),
    conflicts: Object.freeze(conflicts),
    projectionAlgoVersion: context.projectionAlgoVersion ?? PROJECTION_ALGO_VERSION,
    conflictPolicyVersion: context.conflictPolicyVersion ?? CONFLICT_POLICY_VERSION,
  });
}

// ─── Gene Cell Resolution ────────────────────────────────────────────────────

/**
 * Resolve a single gene into concrete cells.
 * Handles explicit coordinates and derived contour-follow.
 */
function resolveGeneCells(gene, context) {
  const cells = [];
  const { width: w, height: h } = context.canvas;

  // Explicit coordinates
  if (gene.coordinates && gene.coordinates.length > 0) {
    for (let i = 0; i < gene.coordinates.length; i++) {
      const coord = gene.coordinates[i];

      // Bounds check
      if (coord.x < 0 || coord.x >= w || coord.y < 0 || coord.y >= h) {
        continue; // skip out-of-bounds (compiler validates separately)
      }

      cells.push({
        x: coord.x,
        y: coord.y,
        color: coord.color,
        role: coord.role,
        partId: coord.partId,
        _gene: {
          assetId: gene.assetId,
          geneId: gene.geneId,
          genePriority: gene.priority,
          geneChecksum: gene.checksum,
          projectionChecksum: '', // filled later
          passVersion: 0, // filled later
          sourceCoordOrHint: Object.freeze({
            type: 'coordinate',
            coordinateIndex: i,
            x: coord.x,
            y: coord.y,
          }),
        },
      });
    }
  }

  // Derived contour-follow from SDF
  if (gene.geometryHints?.contourFollow === true && gene.geometryHints?.contourPartId) {
    const partId = gene.geometryHints.contourPartId;
    const sdf = context.sdfByPart?.[partId];

    if (sdf) {
      const contourCells = traceContour(sdf, gene, w, h);
      for (const cc of contourCells) {
        cells.push({
          x: cc.x,
          y: cc.y,
          color: cc.color,
          role: gene.role,
          partId,
          _gene: {
            assetId: gene.assetId,
            geneId: gene.geneId,
            genePriority: gene.priority,
            geneChecksum: gene.checksum,
            projectionChecksum: '', // filled later
            passVersion: 0, // filled later
            sourceCoordOrHint: Object.freeze({
              type: 'geometryHint',
              hint: 'contourFollow',
              contourPartId: partId,
              sdfChecksum: sdf.checksum,
            }),
          },
        });
      }
    }
  }

  return cells;
}

// ─── Contour Tracing from SDF ────────────────────────────────────────────────

/**
 * Trace contour cells from an SDF grid.
 * A cell is on the contour if |signedDistance| < rimWidth (default 1).
 */
function traceContour(sdf, gene, canvasW, canvasH) {
  const rimWidth = gene.geometryHints?.rimWidth ?? 1;
  const cells = [];
  const { width: sw, height: sh, values } = sdf;

  for (let y = 0; y < sh && y < canvasH; y++) {
    for (let x = 0; x < sw && x < canvasW; x++) {
      const sd = values[y * sw + x];
      if (sd !== undefined && Math.abs(sd) < rimWidth) {
        cells.push({ x, y, color: undefined });
      }
    }
  }

  return cells;
}

// ─── Projection Checksum (§6.2) ─────────────────────────────────────────────

/**
 * Compute the projection identity checksum from all bound inputs.
 * Pure function of: gene checksums + canvas + SDF checksums + versions.
 */
function computeProjectionChecksum(orderedGenes, context) {
  const identity = {
    geneChecksums: orderedGenes.map((g) => g.checksum),
    canvas: { width: context.canvas.width, height: context.canvas.height },
    sdfChecksums: Object.fromEntries(
      Object.entries(context.sdfByPart ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v.checksum])
    ),
    paletteRoleMappingVersion: context.paletteRoleMappingVersion,
    projectionAlgoVersion: context.projectionAlgoVersion ?? PROJECTION_ALGO_VERSION,
    conflictPolicyVersion: context.conflictPolicyVersion ?? CONFLICT_POLICY_VERSION,
    compilerVersion: context.compilerVersion,
  };

  return checksumStableJSON(identity);
}

// ─── SCDL Compiler Integration Hook ─────────────────────────────────────────

/**
 * SCDL pass adapter: project approved art genes onto the AST.
 * Registered in scdl.compiler.js after expandCells.
 *
 * @param {object} ast - SCDL AST with parts[].coordinates
 * @param {object[]} errors - SCDL error accumulator
 * @param {object} [options]
 * @param {ReadonlyArray<ArtGenePacket>} [options.artGenes] - Approved genes
 * @param {ArtProjectionContext} [options.artProjectionContext]
 * @returns {object} AST with projected cells merged into parts
 */
export function projectGenesPass(ast, errors, options = {}) {
  const genes = options.artGenes;
  const context = options.artProjectionContext;

  // §6.5: Feature flag disabled or no genes → strict no-op
  if (!genes || genes.length === 0 || !context) {
    return ast;
  }

  const result = projectGenes(genes, context);

  // Merge projected cells into a synthetic part
  if (result.cells.length === 0) return ast;

  const projectedPart = {
    id: '_art_gene_projection',
    material: 'art-direction',
    coordinates: result.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      color: cell.color || '#ffffff',
      partId: cell.partId || '_art_gene_projection',
      material: 'art-direction',
      role: cell.role,
      _gene: cell._gene,
    })),
    noiseDescriptors: [],
    intentOps: [],
    fillColor: null,
    _artProjection: {
      projectionChecksum: result.projectionChecksum,
      orderedGeneIds: result.orderedGeneIds,
      conflicts: result.conflicts,
      projectionAlgoVersion: result.projectionAlgoVersion,
      conflictPolicyVersion: result.conflictPolicyVersion,
    },
  };

  return {
    ...ast,
    parts: [...ast.parts, projectedPart],
    _artProjectionResult: result,
  };
}
