// Never-throw SCDL v2 pass orchestration. Every public result is built by
// successV2 or failV2; a false `ok` always nulls analysis/bytecode/package/
// packet and freezes framePackets empty. lowerSCDLV2Bytecode's programId:null
// fallback is an emit failure, not a successful empty program.

import { parseSCDLV2 } from './scdl-v2.parser.js';
import { analyzeSCDLV2 } from './scdl-v2.analyzer.js';
import { verifySCDLV2Budget } from './scdl-v2.budget.js';
import { lowerSCDLV2Bytecode } from './scdl-v2.bytecode.js';
import { evaluateSCDLV2 } from './scdl-v2.evaluator.js';
import { rasterizeSCDLV2 } from './scdl-v2.raster.js';
import { emitSCDLV2Package } from './scdl-v2.emit.js';
import { diagnosticEnvelope, span, v2Diagnostic } from './scdl-v2.diagnostics.js';
import { buildConveyorBelt } from './scdl-v2.amp-stages.js';
import { getAmpAdapter, getAmpManifest } from './scdl-v2.amp-catalog.js';
import { parseVersionHeader } from './scdl-v2.version.js';
import { sampleTimeline, buildAnimationManifest } from './scdl-v2.animation.js';
import { sha256Hex } from '../../sha256.js';

const ZERO_SPAN = span({ line: 1, column: 1, offset: 0 });

function internalDiagnostic(error) {
  const name = error && typeof error === 'object' && error.name ? String(error.name) : 'Error';
  return v2Diagnostic({
    code: 'SCDL-EMIT-999',
    phase: 'emit',
    message: 'Internal emit failure.',
    span: ZERO_SPAN,
    received: [name],
  });
}

function baseResult({ source, options, cst, ast, errors }) {
  const frozenErrors = Object.freeze([...errors]);
  const diagnosticReport = diagnosticEnvelope(frozenErrors);
  return {
    contract: 'SCDL-COMPILE-RESULT-v2',
    languageVersion: 2,
    compilerVersion: '2.0.0',
    cst,
    ast,
    errors: frozenErrors,
    diagnostics: diagnosticReport.diagnostics,
    diagnosticReport,
    frameLoop: null,
    regressionSeed: Object.freeze({ source, options, checksum: null }),
  };
}

function failV2({ source, options, cst, ast, diagnostics }) {
  return Object.freeze({
    ...baseResult({ source, options, cst, ast, errors: diagnostics }),
    ok: false,
    analysis: null,
    bytecode: null,
    package: null,
    packet: null,
    ampPlan: Object.freeze([]),
    ampDescriptors: Object.freeze([]),
    framePackets: Object.freeze([]),
  });
}

function successV2({ source, options, cst, ast, analysis, bytecode, package: packageValue, packet, ampPlan, ampDescriptors, counters, framePackets }) {
  const resolvedDescriptors = Object.freeze([...(ampDescriptors || packageValue?.ampDescriptors || [])]);
  const resolvedPlan = Object.freeze([...(ampPlan || packageValue?.ampPlan || [])]);
  const resolvedFramePackets = framePackets || packageValue?.framePackets || Object.freeze([packet]);
  const resolvedFrameLoop = packageValue?.frameLoop || null;

  const resolvedAmps = resolvedPlan.map((entry) => {
    const manifest = getAmpManifest(entry.ampId);
    return Object.freeze({
      invocationKey: `${entry.ampId}@${entry.stage}`,
      ampId: entry.ampId,
      version: manifest?.version || '1.0.0',
      manifestChecksum: manifest?.checksum || null,
      stage: entry.stage,
      targetKey: entry.target || 'canvas',
    });
  });

  const buildReceipt = Object.freeze({
    sourceDigest: `scdl2_src:${sha256Hex(source || '')}`,
    programId: bytecode.programId,
    programDigest: bytecode.programDigest || null,
    rasterDigest: packageValue?.rasterDigest || null,
    buildDigest: packageValue?.buildDigest || null,
    compilerBuild: 'scdl-v2-p0-build',
    semanticsVersion: bytecode.semanticsVersion || '2.0.0',
    resolvedAmps: Object.freeze(resolvedAmps),
  });

  const resolvedPackage = packageValue ? Object.freeze({
    ...packageValue,
    ampDescriptors: resolvedDescriptors,
    buildReceipt,
    counters: counters || Object.freeze({}),
  }) : null;

  return Object.freeze({
    ...baseResult({ source, options, cst, ast, errors: [] }),
    ok: true,
    analysis,
    bytecode,
    package: resolvedPackage,
    packet,
    ampPlan: resolvedPlan,
    ampDescriptors: resolvedDescriptors,
    counters: counters || Object.freeze({}),
    stats: counters || Object.freeze({}),
    buildReceipt,
    frameLoop: resolvedFrameLoop,
    framePackets: resolvedFramePackets,
    regressionSeed: Object.freeze({ source, options, checksum: bytecode.programId }),
  });
}

export function compileSCDLV2(source, options = {}) {
  const safeSource = typeof source === 'string' ? source : '';
  const safeOptions = options && typeof options === 'object' ? options : {};
  try {
    const headerInfo = parseVersionHeader(safeSource);
    if (headerInfo.explicit && !headerInfo.supported) {
      const diag = v2Diagnostic({
        code: 'SCDL-VER-001',
        phase: 'PARSER',
        severity: 'ERROR',
        message: `Unsupported explicit SCDL version header '${headerInfo.raw}'. Supported versions: SCDL 1, SCDL 1.2, SCDL 2.`,
        span: ZERO_SPAN,
      });
      return failV2({ source: safeSource, options: safeOptions, cst: null, ast: null, diagnostics: [diag] });
    }
    const parsed = parseSCDLV2(safeSource);
    if (!parsed.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: null, diagnostics: parsed.diagnostics });
    const analyzed = analyzeSCDLV2(parsed.ast, safeOptions);
    if (!analyzed.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: analyzed.diagnostics });
    const budget = verifySCDLV2Budget(analyzed.ir, safeOptions);
    if (!budget.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: budget.diagnostics });
    const bytecode = lowerSCDLV2Bytecode(analyzed.ir, budget.verified);
    if (!bytecode || typeof bytecode.programId !== 'string') {
      return failV2({
        source: safeSource,
        options: safeOptions,
        cst: parsed.cst,
        ast: parsed.ast,
        diagnostics: [internalDiagnostic({ name: 'Error' })],
      });
    }
    const evaluated = evaluateSCDLV2(bytecode);
    if (!evaluated.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: evaluated.diagnostics });

function dispatchConveyorEntry(entry, adapter, manifest, context) {
  try {
    const stage = entry.stage;
    const commonContext = { stage, canvas: context.canvas };

    if (manifest?.execution === 'DESCRIPTOR' || stage === 'RUNTIME_DESCRIPTOR' || stage === 'WORLD_DESCRIPTOR') {
      const desc = adapter.execute(entry.inputs || {}, entry.params || {}, commonContext);
      if (desc) context.ampDescriptors.push(desc);
      return null;
    }

    switch (stage) {
      case 'SOURCE_ANALYSIS': {
        const inputs = { source: context.source, ast: context.ast, analysis: context.analysis, ...(entry.inputs || {}) };
        const res = adapter.execute(inputs, entry.params || {}, commonContext);
        if (res?.analysis) {
          context.analysis = Object.freeze({ ...context.analysis, ...res.analysis });
        } else if (res && typeof res === 'object') {
          context.analysis = Object.freeze({ ...context.analysis, ...res });
        }
        break;
      }
      case 'CONSTRUCTION': {
        const inputs = { construction: context.activeConstruction, ...(entry.inputs || {}) };
        const res = adapter.execute(inputs, entry.params || {}, commonContext);
        if (res?.construction) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, ...res.construction });
        } else if (res?.layers) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, layers: Object.freeze(res.layers) });
        }
        break;
      }
      case 'SHAPE_PRE':
      case 'SHAPE_POST': {
        const inputs = {
          shapes: context.activeConstruction?.shapes || context.analysis?.shapes,
          construction: context.activeConstruction,
          ...(entry.inputs || {}),
        };
        const res = adapter.execute(inputs, entry.params || {}, commonContext);
        if (res?.layers) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, layers: Object.freeze(res.layers) });
        } else if (res?.shapes) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, shapes: Object.freeze(res.shapes) });
        }
        break;
      }
      case 'MASK': {
        const inputs = {
          masks: context.activeConstruction?.masks || context.analysis?.masks,
          construction: context.activeConstruction,
          ...(entry.inputs || {}),
        };
        const res = adapter.execute(inputs, entry.params || {}, commonContext);
        if (res?.masks) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, masks: Object.freeze(res.masks) });
        }
        break;
      }
      case 'PAINT': {
        const inputs = {
          layers: context.activeConstruction?.layers,
          construction: context.activeConstruction,
          ...(entry.inputs || {}),
        };
        const res = adapter.execute(inputs, entry.params || {}, commonContext);
        if (res?.layers) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, layers: Object.freeze(res.layers) });
        } else if (Array.isArray(res)) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, layers: Object.freeze(res) });
        }
        break;
      }
      case 'LAYER_POST': {
        if (context.activeConstruction?.layers) {
          const updatedLayers = context.activeConstruction.layers.map((layer) => {
            const res = adapter.execute(entry.inputs?.layer ? entry.inputs : { layer }, entry.params || {}, commonContext);
            return res?.layer || res || layer;
          });
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, layers: Object.freeze(updatedLayers) });
        }
        break;
      }
      case 'PACKET_POST': {
        if (context.emitted) {
          const inputs = { packet: context.emitted.packet, package: context.emitted.package, ...(entry.inputs || {}) };
          const res = adapter.execute(inputs, entry.params || {}, commonContext);
          if (res) {
            const updatedPacket = res.packet || (res.id && res.canvas ? res : null);
            if (updatedPacket) {
              const updatedPackage = res.package || Object.freeze({
                ...context.emitted.package,
                framePackets: Object.freeze([updatedPacket]),
              });
              context.emitted = Object.freeze({
                packet: Object.freeze(updatedPacket),
                package: updatedPackage,
              });
            }
          }
        }
        break;
      }
      case 'RENDER': {
        if (context.activeRaster) {
          const inputs = { raster: context.activeRaster, canvas: context.canvas, ...(entry.inputs || {}) };
          const res = adapter.execute(inputs, entry.params || {}, commonContext);
          if (res?.coordinates) {
            context.activeRaster = Object.freeze({ ...context.activeRaster, coordinates: Object.freeze(res.coordinates) });
          } else if (res?.raster) {
            context.activeRaster = Object.freeze({ ...context.activeRaster, ...res.raster });
          }
          if (context.emitted && context.activeRaster?.coordinates) {
            const newCoords = context.activeRaster.coordinates;
            const updatedPacket = Object.freeze({
              ...context.emitted.packet,
              coordinates: newCoords,
              palette: {
                ...context.emitted.packet.palette,
                sourcePalette: [{
                  key: 'scdl-v2-source',
                  colors: [...new Set(newCoords.map((c) => c.color))],
                  source: 'scdl-v2',
                  weights: [],
                }],
              },
            });
            context.emitted = Object.freeze({
              packet: updatedPacket,
              package: Object.freeze({
                ...context.emitted.package,
                framePackets: Object.freeze([updatedPacket]),
              }),
            });
          }
        }
        break;
      }
      case 'TIMELINE': {
        const inputs = {
          timeline: context.activeConstruction?.timeline || context.analysis?.timeline,
          frames: context.emitted?.package?.framePackets,
          ...(entry.inputs || {}),
        };
        const res = adapter.execute(inputs, entry.params || {}, commonContext);
        if (res?.timeline) {
          context.activeConstruction = Object.freeze({ ...context.activeConstruction, timeline: Object.freeze(res.timeline) });
        }
        if (res?.framePackets || res?.frames) {
          const frames = Object.freeze(res.framePackets || res.frames);
          context.emitted = Object.freeze({
            ...context.emitted,
            package: Object.freeze({
              ...context.emitted.package,
              framePackets: frames,
              animation: res.animation || context.emitted.package.animation,
            }),
          });
        } else if (res?.animation) {
          context.emitted = Object.freeze({
            ...context.emitted,
            package: Object.freeze({
              ...context.emitted.package,
              animation: Object.freeze(res.animation),
            }),
          });
        }
        break;
      }
      default:
        break;
    }
    return null;
  } catch (err) {
    return {
      error: true,
      message: err instanceof Error ? err.message : String(err),
      entry,
    };
  }
}

    const activeAmps = analyzed.ir?.selectedAmps || [];
    const ampDescriptors = [];
    let activeConstruction = evaluated.construction;

    const conveyorContext = {
      source: safeSource,
      ast: parsed.ast,
      analysis: analyzed.ir,
      canvas: analyzed.ir.canvas,
      activeConstruction,
      activeRaster: null,
      emitted: null,
      ampDescriptors,
    };

    const belt = activeAmps.length > 0 ? buildConveyorBelt(activeAmps) : [];

function ampExecutionDiagnostic(entry, err) {
  return v2Diagnostic({
    code: 'SCDL-AMP-007',
    severity: 'ERROR',
    phase: 'compiler',
    message: `AMP '${entry.ampId}' execution failed in stage '${entry.stage}': ${err.message}`,
    span: ZERO_SPAN,
    relatedSymbols: [entry.ampId],
  });
}

    // Pre-rasterization stages: SOURCE_ANALYSIS (0) through LAYER_POST (6)
    const STAGES_PRE_RASTER = ['SOURCE_ANALYSIS', 'CONSTRUCTION', 'SHAPE_PRE', 'SHAPE_POST', 'MASK', 'PAINT', 'LAYER_POST'];
    for (const stage of STAGES_PRE_RASTER) {
      const stageEntries = belt.filter((e) => e.stage === stage);
      for (const entry of stageEntries) {
        if (entry.source === 'EXPLICIT_APPLY' && (entry.stage === 'SHAPE_PRE' || entry.stage === 'SHAPE_POST')) continue;
        const adapter = getAmpAdapter(entry.ampId);
        const manifest = entry.manifest || getAmpManifest(entry.ampId);
        if (adapter && typeof adapter.execute === 'function') {
          const err = dispatchConveyorEntry(entry, adapter, manifest, conveyorContext);
          if (err) {
            return failV2({
              source: safeSource,
              options: safeOptions,
              cst: parsed.cst,
              ast: parsed.ast,
              diagnostics: [ampExecutionDiagnostic(entry, err)],
            });
          }
        }
      }
    }
    activeConstruction = conveyorContext.activeConstruction;

    const isAnimated = Array.isArray(analyzed.ir.timelines) && analyzed.ir.timelines.length > 0;
    let animationManifest = null;
    let rasterizedFrames = null;
    let raster = null;

    if (isAnimated) {
      const primaryTimeline = analyzed.ir.timelines[0];
      const sampledFrames = sampleTimeline(primaryTimeline, activeConstruction);
      rasterizedFrames = [];
      for (const frame of sampledFrames) {
        const frameRaster = rasterizeSCDLV2(frame.construction, analyzed.ir.canvas, budget.verified);
        if (!frameRaster.ok) {
          return failV2({
            source: safeSource,
            options: safeOptions,
            cst: parsed.cst,
            ast: parsed.ast,
            diagnostics: frameRaster.diagnostics,
          });
        }
        rasterizedFrames.push(Object.freeze({ ...frame, raster: frameRaster }));
      }
      raster = rasterizedFrames[0].raster;
      animationManifest = buildAnimationManifest(analyzed.ir.timelines, analyzed.ir.clips);
    } else {
      raster = rasterizeSCDLV2(activeConstruction, analyzed.ir.canvas, budget.verified);
      if (!raster.ok) {
        return failV2({
          source: safeSource,
          options: safeOptions,
          cst: parsed.cst,
          ast: parsed.ast,
          diagnostics: raster.diagnostics,
        });
      }
    }
    conveyorContext.activeRaster = raster;

    conveyorContext.emitted = emitSCDLV2Package({
      analysis: analyzed.ir,
      bytecode,
      construction: activeConstruction,
      raster,
      ampPlan: analyzed.ir.ampPlan || [],
      ampDescriptors,
      animation: animationManifest,
      frames: rasterizedFrames,
    });

    // Post-rasterization stages: PACKET_POST (7) through WORLD_DESCRIPTOR (11)
    const STAGES_POST_RASTER = ['PACKET_POST', 'RENDER', 'TIMELINE', 'RUNTIME_DESCRIPTOR', 'WORLD_DESCRIPTOR'];
    for (const stage of STAGES_POST_RASTER) {
      const stageEntries = belt.filter((e) => e.stage === stage);
      for (const entry of stageEntries) {
        const adapter = getAmpAdapter(entry.ampId);
        const manifest = entry.manifest || getAmpManifest(entry.ampId);
        if (adapter && typeof adapter.execute === 'function') {
          const err = dispatchConveyorEntry(entry, adapter, manifest, conveyorContext);
          if (err) {
            return failV2({
              source: safeSource,
              options: safeOptions,
              cst: parsed.cst,
              ast: parsed.ast,
              diagnostics: [ampExecutionDiagnostic(entry, err)],
            });
          }
        }
      }
    }

    if (conveyorContext.emitted?.package) {
      conveyorContext.emitted = Object.freeze({
        ...conveyorContext.emitted,
        package: Object.freeze({
          ...conveyorContext.emitted.package,
          ampDescriptors: Object.freeze([...conveyorContext.ampDescriptors]),
        }),
      });
    }

    const combinedCounters = Object.freeze({
      ...(evaluated.counters || {}),
      ...(raster?.counters || {}),
    });

    return successV2({
      source: safeSource,
      options: safeOptions,
      cst: parsed.cst,
      ast: parsed.ast,
      analysis: conveyorContext.analysis,
      bytecode,
      ampPlan: analyzed.ir.ampPlan || [],
      ampDescriptors: conveyorContext.ampDescriptors,
      counters: combinedCounters,
      ...conveyorContext.emitted,
    });
  } catch (error) {
    return failV2({ source: safeSource, options: safeOptions, cst: null, ast: null, diagnostics: [internalDiagnostic(error)] });
  }
}
