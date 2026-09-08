/**
 * SCDL Compiler — Pass Orchestrator
 *
 * Runs the full pass pipeline on a parsed AST:
 *   validate → resolveColors → resolveMaterials →
 *   expandVector → expandSymmetry → expandCells →
 *   emitPacket → emitDiagnostics
 *
 * Always returns a CompileResult — never throws.
 *
 * @typedef {object} CompileResult
 * @property {boolean}   ok          - true if no ERROR-severity errors
 * @property {object|null} ast       - Final AST (null if early error)
 * @property {object|null} packet    - PixelBrainAssetPacket (null on error)
 * @property {import('./scdl.errors.js').SCDLError[]} errors
 * @property {object[]}  diagnostics - SCD64 diagnostic entries
 * @property {object}    regressionSeed - Replay token for regression tests
 */

import { parseSCDL }            from './scdl.grammar.js';
import { SCDLError, SCDL_ERROR_CODES, scdlError } from './scdl.errors.js';
import { validatePass }         from './passes/validate.pass.js';
import { expandFramesPass }     from './passes/expand-frames.pass.js';
import { resolveColorsPass }    from './passes/resolve-colors.pass.js';
import { resolveMaterialsPass } from './passes/resolve-materials.pass.js';
import { expandVectorPass }     from './passes/expand-vector.pass.js';
import { buildSceneGraphPass } from './passes/build-scene-graph.pass.js';
import { expandSymmetryPass }   from './passes/expand-symmetry.pass.js';
import { expandCellsPass }      from './passes/expand-cells.pass.js';
import { emitPacketPass }       from './passes/emit-packet.pass.js';
import { emitDiagnosticsPass }  from './passes/emit-diagnostics.pass.js';
import { projectGenesPass }     from './passes/project-genes.pass.js';

// SemQuant / PB-Semantics (Phase 1 thin slice)
import { scdlAstToIR } from '../semantic/adapters/scdl-to-ir.adapter.js';
import { semanticUnifierPass } from '../semantic/semantic-unifier.js';
import { createSemanticDiagnostic } from '../semantic-registry.js';
import { detectSCDLVersion, parseVersionHeader } from './v2/scdl-v2.version.js';
import { compileSCDLV2 } from './v2/scdl-v2.compiler.js';

export function compileSCDL(source, options = {}) {
  const headerInfo = parseVersionHeader(source);
  if (headerInfo.explicit && !headerInfo.supported) {
    const diag = scdlError(
      `Unsupported explicit SCDL version header '${headerInfo.raw}'. Supported versions: SCDL 1, SCDL 1.2, SCDL 2.`,
      'SCDL-VER-001',
      { line: 1, col: 1 },
      { phase: 'VERSION' }
    );
    diag.code = 'SCDL-VER-001';
    diag.label = 'SCDL-VER-001';
    return {
      ok: false,
      ast: null,
      packet: null,
      errors: [diag],
      diagnostics: [diag],
      regressionSeed: null,
    };
  }
  if (headerInfo.version === 2) return compileSCDLV2(source, options);
  return compileLegacySCDL(source, options);
}

/**
 * Compile SCDL source text into a PixelBrainAssetPacket.
 *
 * @param {string} source - Raw SCDL source text
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - Treat WARNs as ERRORs
 * @returns {CompileResult}
 */
export function compileLegacySCDL(source, options = {}) {
  const { strict = false } = options;
  const errors = [];

  // ── Parse ────────────────────────────────────────────────────────────────
  let parseResult;
  try {
    parseResult = parseSCDL(source);
  } catch (e) {
    const fatal = scdlError(
      `Parser threw: ${e.message}`,
      SCDL_ERROR_CODES.MISSING_ASSET,
      { line: 1, col: 1 },
      { thrown: String(e) }
    );
    return _failResult([fatal], null, source);
  }

  // Materialise deferred errors from grammar (plain objects → SCDLError)
  for (const raw of (parseResult.errors || [])) {
    if (raw instanceof SCDLError) {
      errors.push(raw);
    } else if (raw?._deferred) {
      // Grammar may name its own code; fall back to the coarse default only
      // when it does not, so a specific lexer/parser diagnostic is not relabelled
      // as "unknown verb".
      const code = raw.code
        ?? (raw.severity === 'ERROR' ? SCDL_ERROR_CODES.UNKNOWN_VERB : SCDL_ERROR_CODES.TRACE_INTENT);
      errors.push(new SCDLError({
        message:  raw.message,
        code,
        severity: raw.severity,
        loc:      raw.loc,
      }));
    }
  }

  // If parse produced no usable AST, bail
  if (!parseResult.rawAst) {
    return _failResult(errors, null, source);
  }

  let ast = parseResult.rawAst;

  // ── Pass 1: Validate ─────────────────────────────────────────────────────
  ast = _runPass('validate', ast, errors, validatePass);
  if (_hasFatal(errors)) return _failResult(errors, ast, source);

  // Early graph + frames rejection (before expandFrames mutates for legacy flat parts)
  if (ast.graphMode && ((ast.frames && ast.frames.length) || ast.loop)) {
    errors.push(scdlError(
      'Scene-graph assets do not support frames yet (planned: PR-3)',
      SCDL_ERROR_CODES.FRAME_INDEX_LAW, { line: 1, col: 1 },
      { reason: 'graph-frames-pr3' }
    ));
    return _failResult(errors, ast, source);
  }

  // ── Expand Frames (SCDL v1.1) ────────────────────────────────────────────
  // Materializes one virtual part list per frame; frame 0 is the base parts
  // untouched. Enforces the Frame Index / Replacement Ordering laws.
  let frameExpansion;
  try {
    frameExpansion = expandFramesPass(ast, errors);
  } catch (e) {
    errors.push(scdlError(
      `Pass 'expandFrames' threw unexpectedly: ${e.message}`,
      SCDL_ERROR_CODES.FRAME_INDEX_LAW,
      { line: 1, col: 1 },
      { pass: 'expandFrames', thrown: String(e) }
    ));
    return _failResult(errors, ast, source);
  }
  if (_hasFatal(errors)) return _failResult(errors, ast, source);

  // ── Per-frame pipeline: SemQuant → colors → materials → vector →
  //    symmetry → cells → packet. Runs once for single-frame assets.
  const framePackets = [];
  let frame0Ast = ast;
  for (const spec of frameExpansion.frameSpecs) {
    const frameAst = spec.index === 0 ? ast : { ...ast, parts: spec.parts };
    const outcome = _runFramePipeline(frameAst, errors, options);
    if (spec.index === 0) frame0Ast = outcome.ast;
    if (outcome.fatal) return _failResult(errors, outcome.ast, source);
    framePackets.push(outcome.packet);
  }
  ast = frame0Ast;
  const packet = framePackets[0] || null;

  // ── SCDL-FRAME-LOOP-v1 manifest (multi-frame assets only) ────────────────
  const frameLoop = frameExpansion.hasFrames ? {
    contract:          'SCDL-FRAME-LOOP-v1',
    asset:             ast.asset,
    loop:              frameExpansion.loop.name,
    canvas:            { width: ast.canvas.width, height: ast.canvas.height },
    defaultDurationMs: frameExpansion.loop.defaultDurationMs,
    sourceChecksum:    ast.checksum,
    frames: frameExpansion.frameSpecs.map((spec, i) => ({
      index:      spec.index,
      label:      spec.label,
      durationMs: spec.durationMs,
      packet:     framePackets[i]?.id || null,
    })),
  } : null;

  // ── Emit Diagnostics ─────────────────────────────────────────────────────
  const diagnostics = emitDiagnosticsPass(ast, errors, packet);

  const hasErrors = errors.some(e =>
    e.isError() || (strict && e.isWarn())
  );

  return Object.freeze({
    ok:           !hasErrors,
    ast:          hasErrors ? null : ast,
    packet:       hasErrors ? null : packet,
    framePackets: hasErrors ? Object.freeze([]) : Object.freeze(framePackets),
    frameLoop:    hasErrors ? null : frameLoop,
    errors:       Object.freeze(errors),
    diagnostics:  Object.freeze(diagnostics),
    regressionSeed: Object.freeze({
      source:  source,
      options: options,
      checksum: ast?.checksum || null,
    }),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run one pass, reporting a crash instead of recording it.
 *
 * Used only by the post-fatal recovery sweep in _runFramePipeline, where a
 * throwing pass means "stop, we are past useful information" rather than
 * "here is another error for the author to read".
 */
function _tryPass(name, ast, errors, passFn) {
  try {
    return { ast: passFn(ast, errors) || ast, threw: false };
  } catch (e) {
    return { ast, threw: true, error: e };
  }
}

/**
 * Frame pipeline.
 *
 * Recovery sweep (audit 2026-09-03, MINOR #9): the first fatal used to abort
 * here, so an asset carrying three independent mistakes reported exactly one
 * and made the author fix → recompile → fix → recompile. That guard was also
 * stricter than it needed to be — `_hasFatal` scans the whole *accumulating*
 * error list, so a single early error suppressed every later diagnostic in
 * every frame of a loop. The passes after it are frequently still meaningful:
 * resolve-colors already degrades an unresolvable alias to `#000000` and
 * continues, resolve-materials reports SCDL-005 per part, and lower-booleans
 * reports SCDL-026 per bad target — none of which depend on the failure that
 * came first.
 *
 * So we now keep going, but only as far as the passes keep working. Once one
 * throws, we stop rather than reporting crashes that are symptoms of the real
 * error. Either way `fatal` stays true and no packet is emitted: this buys a
 * complete *report*, never a partial asset.
 */
function _runFramePipeline(frameAst, errors, options) {
  _applySemQuant(frameAst, errors, options);

  let ast = frameAst;
  let recovering = false;

  /** Advance one pass, honouring the sweep. Returns false to stop the sweep. */
  const step = (name, passFn) => {
    if (!recovering) {
      ast = _runPass(name, ast, errors, passFn);
      if (_hasFatal(errors)) recovering = true;
      return true;
    }
    const r = _tryPass(name, ast, errors, passFn);
    if (r.threw) return false;   // symptom, not cause — stop sweeping
    ast = r.ast;
    return true;
  };

  if (!step('resolveColors', resolveColorsPass)) return _sweepResult(ast, errors);
  // Material warnings are non-fatal
  if (!step('resolveMaterials', resolveMaterialsPass)) return _sweepResult(ast, errors);

  if (ast.graphMode) {
    if (!step('buildSceneGraph', buildSceneGraphPass)) return _sweepResult(ast, errors);
    if (recovering) return _sweepResult(ast, errors);
    let packet = null;
    try {
      packet = emitPacketPass(ast, errors);
    } catch (e) {
      errors.push(scdlError(
        `Packet emit failed: ${e.message}`,
        SCDL_ERROR_CODES.MISSING_ASSET, { line: 1, col: 1 }, { thrown: String(e) }
      ));
      return { ast, packet: null, fatal: true };
    }
    return { ast, packet, fatal: false };
  }

  if (!step('expandVector', expandVectorPass)) return _sweepResult(ast, errors);
  if (!step('expandSymmetry', expandSymmetryPass)) return _sweepResult(ast, errors);
  if (!step('expandCells', expandCellsPass)) return _sweepResult(ast, errors);

  if (recovering) return _sweepResult(ast, errors);

  // ── Art Gene Projection (PDR: Ontological Art-Direction Pipeline) ────────
  // Strict no-op when options.artGenes is empty/absent or feature flag is off.
  // §6.5: existing SCDL and raster output remain byte-identical.
  if (options.artGenes && options.artGenes.length > 0) {
    ast = projectGenesPass(ast, errors, {
      artGenes: options.artGenes,
      artProjectionContext: options.artProjectionContext,
    });
  }

  let packet = null;
  try {
    packet = emitPacketPass(ast, errors);
  } catch (e) {
    errors.push(scdlError(
      `Packet emit failed: ${e.message}`,
      SCDL_ERROR_CODES.MISSING_ASSET,
      { line: 1, col: 1 },
      { thrown: String(e) }
    ));
    return { ast, packet: null, fatal: true };
  }

  return { ast, packet, fatal: false };
}

/** A fatal was recorded; never emit a packet, but the diagnostics are complete. */
function _sweepResult(ast, errors) {
  return { ast, packet: null, fatal: true, swept: _hasFatal(errors) };
}

/**
 * SemQuant / PB-Semantics thin slice (Phase 1).
 * Convert SCDL AST → IR → annotate → attach annotations back.
 * Does not change raster behavior. Adds semantic metadata + PB-SEM-* diagnostics.
 * Failures never break compilation (downgraded to PB-SEM-000 info).
 */
function _applySemQuant(ast, errors, _options) {
  try {
    const irInput = scdlAstToIR(ast, { filePath: null });
    const semResult = semanticUnifierPass(irInput);

    // Merge semantic diagnostics into main errors, encoded as PB-ERR-v1
    // bytecode so they are visible to the shared decode/recovery tooling.
    for (const d of (semResult.diagnostics || [])) {
      errors.push(createSemanticDiagnostic(d));
    }

    // Attach annotations + provenance back to AST for downstream use (thin bridge)
    if (semResult.nodes && Array.isArray(ast.parts)) {
      attachSemanticAnnotations(ast, semResult.nodes);
    }
  } catch (e) {
    errors.push(createSemanticDiagnostic({
      code: 'PB-SEM-000',
      severity: 'info',
      message: `SemQuant (semanticUnifier) skipped due to internal error: ${e.message}`,
    }));
  }
}

function _runPass(name, ast, errors, passFn) {
  try {
    return passFn(ast, errors) || ast;
  } catch (e) {
    errors.push(scdlError(
      `Pass '${name}' threw unexpectedly: ${e.message}`,
      SCDL_ERROR_CODES.MISSING_ASSET,
      { line: 1, col: 1 },
      { pass: name, thrown: String(e) }
    ));
    return ast;
  }
}

function _hasFatal(errors) {
  return errors.some(e => e.isError ? e.isError() : e.severity === 'ERROR');
}

function _failResult(errors, ast, source) {
  const diagnostics = emitDiagnosticsPass(ast, errors, null);
  return Object.freeze({
    ok:          false,
    ast:         null,
    packet:      null,
    errors:      Object.freeze(errors),
    diagnostics: Object.freeze(diagnostics),
    regressionSeed: Object.freeze({ source, options: {}, checksum: ast?.checksum || null }),
  });
}

/**
 * Thin bridge: attach SemQuant annotations back onto the original SCDL AST.
 * Ops and parts get .annotations and .semantic (for Phase 1 inspection).
 */
function attachSemanticAnnotations(ast, irNodes) {
  if (!ast || !Array.isArray(ast.parts) || !Array.isArray(irNodes)) return;

  const byId = new Map();
  for (const node of irNodes) {
    if (node.id) byId.set(node.id, node);
  }

  for (const part of ast.parts) {
    const partNode = byId.get(`scdl:part:${part.id}`);
    if (partNode) {
      part.annotations = partNode.annotations || [];
      part.semantic = { annotations: partNode.annotations || [] };
    }

    if (Array.isArray(part.ops)) {
      part.ops.forEach((op, idx) => {
        const opId = op.id || `scdl:${part.id}:${idx}:${op.op}`;
        const irNode = byId.get(opId);
        if (irNode) {
          op.annotations = irNode.annotations || [];
          op.semantic = {
            annotations: irNode.annotations || [],
            provenance: irNode.provenance || {},
          };
          // carry lowering history for audit
          if (irNode.provenance?.loweringSteps) {
            op.loweringSteps = irNode.provenance.loweringSteps;
          }
        }
      });
    }
  }
}
