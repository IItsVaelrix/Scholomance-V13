import { hashString } from './shared.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from './bytecode-error.js';
import {
  createPixelBrainAssetPacket,
  derivePixelBrainExportPacket,
  derivePixelBrainRenderPacket,
  normalizePixelBrainAssetPacket,
} from './pixelbrain-asset-packet.js';
import { runPixelBrainRenderFidelityPipeline } from './render-fidelity-pipeline.js';
import { templatize, fillTemplate } from './template-fill-bridge.js';
import { resolvePixelBrainPaletteAuthority } from './palette-authority-bridge.js';
import { enrichPacketWithSemantics, applyAuthoringSemantics } from './semantic-bridge.js';

const PIXELBRAIN_FIDELITY_KIND = 'pixelbrain.fidelity.v1';

function stableJson(value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function digest(value) {
  return hashString(stableJson(value)).toString(16);
}

function diagnostic(stageId, status, input, output, extra = {}) {
  return Object.freeze({
    stageId,
    status,
    code: extra.code || status.toUpperCase(),
    message: extra.message || `${stageId}:${status}`,
    inputHash: digest(input),
    outputHash: digest(output),
    warnings: Object.freeze(extra.warnings || []),
    errors: Object.freeze(extra.errors || []),
    durationMs: extra.durationMs || 0,
    metadata: Object.freeze(extra.metadata || {}),
  });
}

function deriveRenderFidelityPacket(packet, options = {}) {
  const materialId = options.material || packet.material.id;
  const renderPacket = derivePixelBrainRenderPacket(packet, { ...options, material: materialId });
  const fidelity = runPixelBrainRenderFidelityPipeline({
    canvas: packet.canvas,
    renderPacket,
    materialId,
  }, options);
  const coordinates = Object.freeze(Array.isArray(fidelity.coordinates)
    ? fidelity.coordinates.map((coord) => Object.freeze({ ...coord }))
    : [...renderPacket.coordinates]);
  const payloadIds = Object.freeze(Object.keys(fidelity.payloads || {}));

  return Object.freeze({
    kind: PIXELBRAIN_FIDELITY_KIND,
    schemaVersion: 1,
    ok: fidelity.ok === true,
    renderPacketId: renderPacket.id,
    material: Object.freeze({ id: materialId }),
    canvas: renderPacket.canvas,
    coordinates,
    payloads: Object.freeze(fidelity.payloads || {}),
    diagnostics: Object.freeze({
      pipeline: 'pixelbrain.render-fidelity-pipeline',
      coordinateCount: coordinates.length,
      payloadIds,
    }),
  });
}

function buildFinalRenderPacket(renderPacket, fidelityPacket) {
  if (!fidelityPacket) return renderPacket;
  return Object.freeze({
    ...renderPacket,
    id: `pbfidelity_${digest({ renderPacketId: renderPacket.id, coordinates: fidelityPacket.coordinates })}`,
    sourceRenderPacketId: renderPacket.id,
    coordinates: fidelityPacket.coordinates,
    fidelity: Object.freeze({
      kind: fidelityPacket.kind,
      ok: fidelityPacket.ok,
      pipeline: fidelityPacket.diagnostics.pipeline,
      payloadIds: fidelityPacket.diagnostics.payloadIds,
    }),
  });
}

function runStage(packet, stage, context) {
  const stageId = typeof stage === 'string' ? stage : stage.id;
  const options = typeof stage === 'string' ? {} : stage.options || {};
  const before = packet;

  switch (stageId) {
    case 'packet':
    case 'normalize':
      return normalizePixelBrainAssetPacket(packet);
    case 'templatize': {
      const template = templatize(packet.geometry.coordinates, options);
      return normalizePixelBrainAssetPacket({
        ...packet,
        geometry: { ...packet.geometry, coordinates: template.coordinates },
        template: { ...packet.template, slots: template.coordinates.map((coord) => coord.slot) },
      });
    }
    case 'fill': {
      const bytecode = options.bytecode || packet.bytecode.raw;
      const coordinates = fillTemplate(packet.geometry.coordinates, bytecode, options);
      return normalizePixelBrainAssetPacket({
        ...packet,
        geometry: { ...packet.geometry, coordinates },
        bytecode,
        template: {
          ...packet.template,
          fillState: { ...(packet.template?.fillState || {}), bytecode },
        },
      });
    }
    case 'palette': {
      const palette = resolvePixelBrainPaletteAuthority({
        sourcePalette: packet.palette.sourcePalette[0]?.colors || [],
        bytecode: options.bytecode || packet.bytecode.raw,
        material: options.material || packet.material.id,
      });
      return normalizePixelBrainAssetPacket({
        ...packet,
        palette: {
          ...packet.palette,
          sourcePalette: [{ key: 'authority', colors: palette.sourcePalette, byteMap: palette.byteMap }],
          semanticPalette: palette.semanticPalette.length ? [{ key: 'semantic', colors: palette.semanticPalette }] : [],
          materialPalette: palette.materialPalette.length ? [{ key: 'material', colors: palette.materialPalette }] : [],
          byteMap: palette.byteMap,
          authority: palette.authority,
        },
      });
    }
    case 'material':
      return normalizePixelBrainAssetPacket({
        ...packet,
        material: { ...packet.material, id: options.material || packet.material.id },
        chromatic: { ...packet.chromatic, transformId: options.material || packet.material.id },
      });
    case 'routePhotonic': {
      if (typeof context.routePhotonic !== 'function') return packet;
      const render = derivePixelBrainRenderPacket(packet, options);
      const route = context.routePhotonic(render, options);
      return normalizePixelBrainAssetPacket({
        ...packet,
        photonic: {
          routeId: route?.packet?.packetId || null,
          packetId: route?.packet?.packetId || null,
          status: route ? 'ready' : 'idle',
        },
      });
    }
    case 'fidelity':
    case 'renderFidelity':
      return deriveRenderFidelityPacket(packet, options);
    case 'semantic':
      // Apply SemQuant authoring semantics if authoring source provided
      if (options.authoringSource) {
        return enrichPacketWithSemantics(packet, options.authoringSource, options);
      }
      // Or just return enriched if input already has
      return enrichPacketWithSemantics(packet, null, options);
    case 'export': {
      if (typeof context.exportPacket === 'function') {
        return context.exportPacket(derivePixelBrainExportPacket(packet, options.target || 'json', options), options);
      }
      return derivePixelBrainExportPacket(packet, options.target || 'json', options);
    }
    default:
      return before;
  }
}

export function runPixelBrainOperationPipeline(input = {}, context = {}) {
  const stages = Array.isArray(input.stages) ? input.stages : [];
  let current = createPixelBrainAssetPacket(input.packet || input.asset || input);
  let exportPacket = null;
  let fidelityPacket = null;
  const diagnostics = [];

  for (const stage of stages) {
    const stageId = typeof stage === 'string' ? stage : stage.id;
    const before = current;
    try {
      const next = runStage(current, stage, context);
      if (next?.kind === 'pixelbrain.asset.v1') {
        current = next;
      } else if (next?.kind === 'pixelbrain.export.v1') {
        exportPacket = next;
      } else if (next?.kind === PIXELBRAIN_FIDELITY_KIND) {
        fidelityPacket = next;
      }
      diagnostics.push(diagnostic(
        stageId,
        next === before && stageId !== 'normalize' ? 'skipped' : 'ok',
        before,
        next?.kind === PIXELBRAIN_FIDELITY_KIND ? next : current
      ));
    } catch (error) {
      // Stage failures speak the canonical taxonomy: a thrown BytecodeError
      // passes through verbatim; anything else is wrapped as STATE/CRIT so
      // the immunity scanner and diagnostics tooling can parse every failure.
      const bytecodeError = error instanceof BytecodeError
        ? error
        : new BytecodeError(
            ERROR_CATEGORIES.STATE,
            ERROR_SEVERITY.CRIT,
            MODULE_IDS.CORE,
            ERROR_CODES.INVALID_STATE,
            { stageId, message: error.message }
          );
      diagnostics.push(diagnostic(stageId, 'error', before, current, {
        code: bytecodeError.bytecode,
        message: `${stageId} failed: ${error.message}`,
        errors: [bytecodeError.toJSON()],
      }));
      if (!input.continueOnError) break;
    }
  }

  const renderPacket = derivePixelBrainRenderPacket(current, fidelityPacket?.material?.id
    ? { material: fidelityPacket.material.id }
    : {});

  return Object.freeze({
    ok: diagnostics.every((entry) => entry.status !== 'error'),
    packet: current,
    renderPacket,
    finalRenderPacket: buildFinalRenderPacket(renderPacket, fidelityPacket),
    fidelityPacket,
    exportPacket,
    diagnostics: Object.freeze(diagnostics),
  });
}
