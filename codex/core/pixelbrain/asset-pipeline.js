/**
 * Asset Pipeline — the single composition boundary.
 *
 * Until now every caller re-implemented the chain inline: load SCDL, build a
 * projection context, project genes, compile, lower to VRI, render. Each regen
 * script carried its own copy, and nothing in `codex/core` or `src` called the
 * VRI layer at all — its only caller was one script. A boundary nothing crosses
 * in production is indistinguishable from an unused component.
 *
 * This module wires the existing stages together **without collapsing them**.
 * Every stage remains independently callable and independently refusable; this
 * is composition, not a god-function. What it adds that no caller had before is
 * a **lineage**: a recorded chain of identities linking the construction that
 * gated an asset to the packet, the scene, and the bytes.
 *
 *   construction result checksum
 *     -> packet id
 *       -> VRI scene checksum
 *         -> raster digest
 *
 * Without that chain each stage had a strong identity and no way to prove what
 * it descended from. A packet could be hand-edited between stages and nothing
 * downstream would know.
 *
 * @bytecode PB-ASSET-PIPELINE-v1
 */

import { compileSCDL } from './scdl/scdl.compiler.js';
import { projectGenes } from './scdl/passes/project-genes.pass.js';
import {
  createArtGenePacket,
  PROJECTION_ALGO_VERSION,
  CONFLICT_POLICY_VERSION,
} from './scdna-art-gene.js';
import { compileVRI, fnv1aHex } from './vixel/vri-compiler.js';
import { renderVRI } from './vixel/vri-renderer.js';
import { createConstruction, trySolve } from './construction/index.js';

export const ASSET_PIPELINE_CONTRACT = 'PB-ASSET-PIPELINE-v1';
export const LINEAGE_CONTRACT = 'PB-ASSET-LINEAGE-v1';

/**
 * How a construction relates to the packet compiled alongside it.
 *
 * `gate`    — the construction was solved and had to succeed for this compile to
 *             proceed, but its solved geometry does not yet flow into the SCDL
 *             AST. The link is causal (a refusal stops the asset) but not
 *             generative.
 * `derived` — the packet's coordinates were produced from the solved geometry.
 *             Not reachable until a constructionToSCDLParts pass exists; the
 *             field exists so the distinction is recorded rather than assumed.
 */
export const CONSTRUCTION_LINK = Object.freeze({
  GATE: 'gate',
  DERIVED: 'derived',
});

/** Default digest: content-sensitive change detector, not a content address. */
function defaultDigest(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compile an asset from SCDL source through to pixels.
 *
 * @param {string} source - SCDL source text
 * @param {object} [options]
 * @param {object}   [options.construction] - GeometryConstructionSpec. Solved and
 *   required to pass before compilation proceeds. Its geometry does not yet feed
 *   the packet — see CONSTRUCTION_LINK.
 * @param {object[]} [options.genes] - raw gene definitions, or pre-built packets
 * @param {object}   [options.canvas] - canvas for gene projection; defaults to the
 *   compiled packet's canvas when genes are absent
 * @param {string}   [options.assetId] - asset id for gene packet construction
 * @param {object}   [options.projection] - overrides for the gene projection context
 * @param {object}   [options.vri] - options forwarded to compileVRI (lighting,
 *   atmosphere, rasterPatches, quantize, ...). Pass `false` to skip VRI entirely.
 * @param {number}   [options.scale] - when set, renders the VRI scene at this
 *   integer scale. Omit to stop at the scene.
 * @param {Function} [options.digest] - (Uint8Array) => string, for the raster
 *   digest. Defaults to FNV-1a; Node callers may pass a SHA-256 hasher.
 * @returns {object} { ok, errors, packet, vriScene, raster, frames, frameLoop,
 *   lineage, diagnostics }. `frames` carries one entry per frame of the loop —
 *   `{ index, packet, vriScene, raster }` — and always has at least one element.
 *   `packet`/`vriScene`/`raster` are shorthand for `frames[0]`.
 */
export function compileAsset(source, options = {}) {
  const {
    construction = null,
    genes = null,
    canvas = null,
    assetId = null,
    projection = {},
    vri = {},
    scale = null,
    digest = defaultDigest,
  } = options;

  const errors = [];
  const diagnostics = {};

  // ── Stage 1: construction (gate) ────────────────────────────────────────
  // A false constraint must stop the asset before anything is drawn. This is
  // the pipeline's existing law -- refusal is not a visual warning -- applied
  // at the composition boundary rather than left to each caller.
  let constructionLineage = null;
  if (construction) {
    let packetized;
    try {
      packetized = createConstruction(construction);
    } catch (e) {
      return _fail([e], { construction: { stage: 'create', error: String(e.message || e) } });
    }

    const solved = trySolve(packetized);
    const solveFailed = solved.error !== null || !solved.result;
    diagnostics.construction = {
      passed: !solveFailed,
      report: solved.result?.validationReport ?? null,
      error: solveFailed
        ? String(solved.error?.message || solved.error || 'construction refused')
        : null,
    };

    if (solveFailed) {
      return _fail(
        [solved.error instanceof Error ? solved.error : new Error(diagnostics.construction.error)],
        diagnostics,
      );
    }

    constructionLineage = {
      id: packetized.id,
      checksum: packetized.checksum,
      resultChecksum: solved.result.resultChecksum,
      link: CONSTRUCTION_LINK.GATE,
    };
  }

  // ── Stage 2: gene projection ────────────────────────────────────────────
  let genePackets = null;
  let projectionContext = null;
  let projectionResult = null;

  if (genes && genes.length > 0) {
    const geneCanvas = canvas || projection.canvas;
    if (!geneCanvas) {
      return _fail(
        [new Error('PB-ASSET-PIPELINE: genes supplied without a canvas. Pass options.canvas.')],
        diagnostics,
      );
    }

    // Accept both raw gene definitions and already-built PB-SCDNA-GENE-v1 packets.
    genePackets = genes.map(g => (g.contract || g.projectionChecksum)
      ? g
      : createArtGenePacket({
        assetId: assetId || g.assetId || 'unknown',
        geneId: g.geneId,
        geneType: g.geneType || 'art-direction',
        priority: g.priority,
        projectionMode: g.projectionMode,
        canvas: geneCanvas,
        coordinates: g.coordinates,
        geometryHints: g.geometryHints,
        role: g.role,
        curator: g.curator,
        rationale: g.rationale,
      }));

    projectionContext = {
      canvas: geneCanvas,
      compilerVersion: projection.compilerVersion || 'scdl-compiler-1.0.0',
      projectionAlgoVersion: projection.projectionAlgoVersion || PROJECTION_ALGO_VERSION,
      conflictPolicyVersion: projection.conflictPolicyVersion || CONFLICT_POLICY_VERSION,
      paletteRoleMappingVersion: projection.paletteRoleMappingVersion || 'default-palette-v1',
      sdfByPart: projection.sdfByPart || {},
    };

    projectionResult = projectGenes(genePackets, projectionContext);
    diagnostics.genes = {
      count: genePackets.length,
      cells: projectionResult.cells.length,
      conflicts: projectionResult.conflicts?.length ?? 0,
      projectionChecksum: projectionResult.projectionChecksum,
    };
  }

  // ── Stage 3: SCDL ───────────────────────────────────────────────────────
  const scdl = compileSCDL(source, genePackets
    ? { artGenes: genePackets, artProjectionContext: projectionContext }
    : {});

  diagnostics.scdl = {
    fatal: scdl.fatal === true,
    errorCount: (scdl.errors || []).length,
    errors: (scdl.errors || []).map(e => ({
      code: e.code ?? null,
      severity: e.severity ?? null,
      message: e.message ?? String(e),
    })),
  };

  if (scdl.fatal || !scdl.packet) {
    errors.push(...(scdl.errors || []));
    return _fail(errors.length ? errors : [new Error('PB-ASSET-PIPELINE: SCDL produced no packet')], diagnostics);
  }

  const packet = scdl.packet;

  // Every frame of a loop is a first-class asset. Compiling only `scdl.packet`
  // would silently drop frames 1..N here: an animated source would arrive with
  // its loop intact and leave as a still, with nothing in the result saying so.
  const framePackets = (Array.isArray(scdl.framePackets) && scdl.framePackets.length > 0)
    ? scdl.framePackets
    : [packet];

  // ── Stages 4 & 5: VRI + raster, once per frame ──────────────────────────
  const frames = [];
  for (let i = 0; i < framePackets.length; i += 1) {
    const framePacket = framePackets[i];
    let frameScene = null;
    if (vri !== false) {
      try {
        frameScene = compileVRI(framePacket, vri || {});
      } catch (e) {
        return _fail([e], {
          ...diagnostics,
          vri: { stage: 'compile', frame: i, error: String(e.message || e) },
        });
      }
    }
    frames.push({
      index: i,
      packet: framePacket,
      vriScene: frameScene,
      raster: (frameScene && scale != null) ? renderVRI(frameScene, scale) : null,
    });
  }

  const vriScene = frames[0].vriScene;
  const raster = frames[0].raster;

  if (vriScene) {
    diagnostics.vri = {
      frames: frames.length,
      layers: vriScene.layers.length,
      lights: vriScene.lights.length,
      quantizationMode: vriScene.provenance.quantizationMode,
      unrenderedDeclarations: vriScene.provenance.unrenderedDeclarations,
      paletteCoverage: vriScene.provenance.paletteCoverage,
    };
  }

  // ── Lineage ─────────────────────────────────────────────────────────────
  const lineage = Object.freeze({
    contract: LINEAGE_CONTRACT,
    construction: constructionLineage ? Object.freeze(constructionLineage) : null,
    genes: projectionResult
      ? Object.freeze({
        count: genePackets.length,
        projectionChecksum: projectionResult.projectionChecksum,
      })
      : null,
    packet: Object.freeze({ id: packet.id ?? null }),
    vriScene: vriScene
      ? Object.freeze({ id: vriScene.id, checksum: vriScene.checksum })
      : null,
    raster: raster
      ? Object.freeze({
        width: raster.width,
        height: raster.height,
        scale,
        digest: digest(raster.data),
      })
      : null,
    // One lineage row per frame. Without this an animation's later frames have
    // no recorded identity at all, so nothing downstream can prove which pixels
    // belonged to which frame.
    frames: Object.freeze(frames.map(f => Object.freeze({
      index: f.index,
      packet: Object.freeze({ id: f.packet.id ?? null }),
      vriScene: f.vriScene
        ? Object.freeze({ id: f.vriScene.id, checksum: f.vriScene.checksum })
        : null,
      raster: f.raster
        ? Object.freeze({
          width: f.raster.width,
          height: f.raster.height,
          scale,
          digest: digest(f.raster.data),
        })
        : null,
    }))),
  });

  return Object.freeze({
    ok: true,
    contract: ASSET_PIPELINE_CONTRACT,
    errors: Object.freeze(scdl.errors || []),
    packet,
    vriScene,
    raster,
    // Frame 0 is also `frames[0]`; the top-level fields are the single-frame
    // shorthand, not a different asset.
    frames: Object.freeze(frames.map(Object.freeze)),
    frameLoop: scdl.frameLoop ?? null,
    lineage,
    diagnostics: Object.freeze(diagnostics),
  });

  function _fail(errs, diag) {
    return Object.freeze({
      ok: false,
      contract: ASSET_PIPELINE_CONTRACT,
      errors: Object.freeze(errs),
      packet: null,
      vriScene: null,
      raster: null,
      lineage: null,
      diagnostics: Object.freeze(diag || {}),
    });
  }
}

/**
 * Verify that a lineage describes the artifacts handed to it.
 *
 * The chain is only worth recording if something checks it. This re-derives each
 * downstream identity and compares. It cannot detect a packet edited before
 * compilation -- only that the recorded chain matches the artifacts present.
 *
 * @returns {{ ok: boolean, mismatches: Array<{stage: string, expected: string, actual: string}> }}
 */
export function verifyLineage(result, options = {}) {
  const { digest = defaultDigest } = options;
  const mismatches = [];

  if (!result?.lineage) {
    return { ok: false, mismatches: [{ stage: 'lineage', expected: 'present', actual: 'null' }] };
  }
  const L = result.lineage;

  if (L.packet && result.packet && L.packet.id !== (result.packet.id ?? null)) {
    mismatches.push({ stage: 'packet', expected: L.packet.id, actual: result.packet.id ?? null });
  }
  if (L.vriScene && result.vriScene) {
    if (L.vriScene.checksum !== result.vriScene.checksum) {
      mismatches.push({ stage: 'vriScene', expected: L.vriScene.checksum, actual: result.vriScene.checksum });
    }
  }
  if (L.raster && result.raster) {
    const actual = digest(result.raster.data);
    if (L.raster.digest !== actual) {
      mismatches.push({ stage: 'raster', expected: L.raster.digest, actual });
    }
  }

  // Verifying only frame 0 would let every later frame of a loop drift unchecked
  // -- which is the failure mode a per-frame lineage exists to catch.
  if (Array.isArray(L.frames) && Array.isArray(result.frames)) {
    if (L.frames.length !== result.frames.length) {
      mismatches.push({
        stage: 'frames',
        expected: String(L.frames.length),
        actual: String(result.frames.length),
      });
    }
    for (const row of L.frames) {
      const frame = result.frames.find(f => f.index === row.index);
      if (!frame) {
        mismatches.push({ stage: `frames[${row.index}]`, expected: 'present', actual: 'missing' });
        continue;
      }
      if (row.packet && row.packet.id !== (frame.packet?.id ?? null)) {
        mismatches.push({
          stage: `frames[${row.index}].packet`,
          expected: row.packet.id,
          actual: frame.packet?.id ?? null,
        });
      }
      if (row.vriScene && frame.vriScene && row.vriScene.checksum !== frame.vriScene.checksum) {
        mismatches.push({
          stage: `frames[${row.index}].vriScene`,
          expected: row.vriScene.checksum,
          actual: frame.vriScene.checksum,
        });
      }
      if (row.raster && frame.raster) {
        const actual = digest(frame.raster.data);
        if (row.raster.digest !== actual) {
          mismatches.push({ stage: `frames[${row.index}].raster`, expected: row.raster.digest, actual });
        }
      }
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
