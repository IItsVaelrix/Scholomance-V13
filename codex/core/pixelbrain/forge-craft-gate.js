import * as itemFoundryModule from './item-foundry.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from './bytecode-error.js';
import { encodeBytecodeXPVaccineFromHealth } from '../diagnostic/BytecodeXPVaccine.js';
import { MATERIAL_PALETTES } from './material-registry.js';
import { fillContourMask, SILH_VIEWS, VIEW_DIMS } from './silhouette-blueprint.js';
import { hamming, projectVoxelShadows, rotateVoxelsZ } from './silhouette-projection.js';
import { normalizeItemSpec, validateItemSpec, hashItemSpec } from './item-spec.js';
import { ITEM_VOXEL_CONTRACT } from './item-voxel-packet.js';
import { ENERGY_TYPES } from './voxel-volume.js';

const REPORT_CONTRACT = 'pixelbrain.craft-gate.v1';
const REPORT_SCHEMA_VERSION = '0.1.0';
const DEFAULT_FINISH_LIGHT = Object.freeze({ angle: Math.PI * 1.25, ambient: 0.3 });
const HEX6_UPPER = /^#[0-9A-F]{6}$/;
const HEX6_ANY = /^#[0-9A-Fa-f]{6}$/;
const MATERIAL_FIELDS = Object.freeze(['fill', 'trim', 'outline', 'wrap', 'glow']);
const PICKAXE_REQUIRED_PARTS = Object.freeze(['head_core', 'handle', 'handle_wrap', 'collar', 'void_inlay']);
const VALID_ENERGY_TYPES = new Set(Object.values(ENERGY_TYPES));

function immunityFail(reason, extra = {}) {
  throw new BytecodeError(
    ERROR_CATEGORIES.STATE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.IMMUNE_INNATE_BLOCK,
    { reason, ...extra },
  );
}

function toUpperHex(value) {
  return typeof value === 'string' && HEX6_ANY.test(value)
    ? value.toUpperCase()
    : null;
}

function stableStringify(value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) return `[${Array.from(value).join(',')}]`;
  if (value instanceof Map) {
    return stableStringify(Object.fromEntries([...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))));
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function createGateError({
  category = ERROR_CATEGORIES.STATE,
  severity = ERROR_SEVERITY.CRIT,
  moduleId = MODULE_IDS.IMMUNITY,
  code = ERROR_CODES.IMMUNE_INNATE_BLOCK,
  target,
  audit,
  reason,
  context = {},
}) {
  return new BytecodeError(category, severity, moduleId, code, {
    reason,
    target,
    audit,
    ...context,
  });
}

function createReport(input, opts, spec = null, artifactKind = 'ITEM-SPEC-v1') {
  return {
    contract: REPORT_CONTRACT,
    schemaVersion: REPORT_SCHEMA_VERSION,
    source: {
      path: opts.sourcePath || null,
      specId: spec?.id || input?.spec?.id || input?.id || null,
      artifactKind,
    },
    strict: opts.strict !== false,
    status: 'fail',
    summary: { audits: 0, failures: 0, warnings: 0, fatal: 0 },
    audits: [],
    bytecodeErrors: [],
  };
}

function recordAudit(report, errors, audit) {
  const normalized = {
    id: audit.id,
    target: audit.target,
    severity: audit.severity || ERROR_SEVERITY.CRIT,
    ok: Boolean(audit.ok),
    message: audit.message,
    ...(audit.bytecodeError ? { bytecodeError: audit.bytecodeError } : {}),
    ...(audit.evidence ? { evidence: audit.evidence } : {}),
  };
  report.audits.push(normalized);
  if (!normalized.ok && audit.error) {
    errors.push(audit.error);
    report.bytecodeErrors.push(audit.error.bytecode);
  }
}

function pass(report, target, id, message, evidence = {}) {
  recordAudit(report, [], {
    id,
    target,
    severity: ERROR_SEVERITY.INFO,
    ok: true,
    message,
    evidence,
  });
}

function fail(report, errors, {
  target,
  id,
  message,
  category,
  severity = ERROR_SEVERITY.CRIT,
  moduleId,
  code,
  context,
  evidence,
}) {
  const error = createGateError({
    category,
    severity,
    moduleId,
    code,
    target,
    audit: id,
    reason: message,
    context,
  });
  recordAudit(report, errors, {
    id,
    target,
    severity,
    ok: false,
    message,
    evidence: evidence || context || {},
    bytecodeError: error.bytecode,
    error,
  });
}

function failFromError(report, errors, target, id, message, error, evidence = {}) {
  recordAudit(report, errors, {
    id,
    target,
    severity: error.severity || ERROR_SEVERITY.CRIT,
    ok: false,
    message,
    evidence,
    bytecodeError: error.bytecode,
    error,
  });
}

function finalizeReport(report, errors, bundle = null, vaccine = null) {
  const failedAudits = report.audits.filter((audit) => !audit.ok);
  const fatalAudits = failedAudits.filter((audit) => audit.severity === ERROR_SEVERITY.FATAL);
  const warningAudits = failedAudits.filter((audit) => audit.severity === ERROR_SEVERITY.WARN);
  const status = failedAudits.length === 0 ? 'pass' : 'fail';
  return Object.freeze({
    ...report,
    status,
    summary: Object.freeze({
      audits: report.audits.length,
      failures: failedAudits.length,
      warnings: warningAudits.length,
      fatal: fatalAudits.length,
    }),
    audits: Object.freeze(report.audits),
    bytecodeErrors: Object.freeze(report.bytecodeErrors),
    ok: status === 'pass',
    ...(vaccine ? { vaccine } : {}),
    ...(bundle ? { bundle } : {}),
    errors,
  });
}

function returnOrThrow(report, errors, bundle, vaccine, opts) {
  const finalReport = finalizeReport(report, errors, bundle, vaccine);
  if (finalReport.status === 'fail' && opts.throwOnFail !== false) {
    throw errors[0] || new Error('PixelBrain craft gate failed');
  }
  return finalReport;
}

function connectedComponentCount(voxels) {
  const present = new Set(voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const seen = new Set();
  let components = 0;

  for (const start of present) {
    if (seen.has(start)) continue;
    components += 1;
    const stack = [start];
    seen.add(start);

    while (stack.length > 0) {
      const [x, y, z] = stack.pop().split(',').map(Number);
      const neighbors = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];

      for (const [dx, dy, dz] of neighbors) {
        const key = `${x + dx},${y + dy},${z + dz}`;
        if (present.has(key) && !seen.has(key)) {
          seen.add(key);
          stack.push(key);
        }
      }
    }
  }

  return components;
}

function packetFromFrontMask(mask, dimensions) {
  const voxels = [...mask].sort().map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y, z: 0, materialId: 1 };
  });
  return { dimensions, voxels };
}

function assertGridMatches(dims, grid) {
  if (dims.width !== grid.width || dims.height !== grid.height || dims.depth !== grid.depth) {
    immunityFail('GRID disagrees with voxelPacket dimensions', { grid, dims });
  }
}

/** Grade the bundle's voxel shadows against a sealed `.silh` blueprint. */
export function auditSilhouetteBlueprint(bundle, blueprint) {
  if (!blueprint) return;
  if (!bundle?.voxelPacket) {
    immunityFail('Missing voxelPacket for silhouette blueprint audit');
  }

  const { voxelPacket } = bundle;
  const grid = blueprint.grid;
  assertGridMatches(voxelPacket.dimensions, grid);

  const shadows = projectVoxelShadows(voxelPacket);
  for (const view of SILH_VIEWS) {
    const mask = fillContourMask(blueprint.views[view].contour, VIEW_DIMS[view](grid));
    const delta = hamming(shadows[view], mask);
    if (delta > blueprint.tolerance[view]) {
      immunityFail('shadow does not match blueprint', {
        view,
        delta,
        tolerance: blueprint.tolerance[view],
        digest: blueprint.digest,
      });
    }
  }

  if (!blueprint.animation) return;

  const baseCount = voxelPacket.voxels.length;
  const pivot = { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) };
  const frontMask = fillContourMask(blueprint.views.front.contour, VIEW_DIMS.front(grid));
  const frontMaskPacket = packetFromFrontMask(frontMask, voxelPacket.dimensions);

  for (const pose of blueprint.animation.poses) {
    const rotatedVoxelPacket = rotateVoxelsZ(voxelPacket, pose.rotateDeg, pivot);
    if (rotatedVoxelPacket.voxels.length !== baseCount) {
      immunityFail('voxel count not conserved under rotation', { phase: pose.phase });
    }

    const rotatedMaskPacket = rotateVoxelsZ(frontMaskPacket, pose.rotateDeg, pivot);
    const delta = hamming(
      projectVoxelShadows(rotatedVoxelPacket).front,
      projectVoxelShadows(rotatedMaskPacket).front,
    );

    if (delta > blueprint.tolerance.front) {
      immunityFail('animated pose not in lockstep with blueprint', {
        phase: pose.phase,
        view: 'front',
        delta,
        tolerance: blueprint.tolerance.front,
        digest: blueprint.digest,
      });
    }
  }
}

function normalizeForFinish(rawSpec, opts) {
  if (!opts.finish || rawSpec?.light) return rawSpec;
  return { ...rawSpec, light: DEFAULT_FINISH_LIGHT };
}

function collectMaterialTargets(part) {
  const targets = [];
  for (const field of MATERIAL_FIELDS) {
    if (part?.[field]?.material) targets.push({ field, target: part[field] });
  }
  if (part?.motif?.core?.material) targets.push({ field: 'motif.core', target: part.motif.core });
  if (part?.motif?.glow?.material) targets.push({ field: 'motif.glow', target: part.motif.glow });
  return targets;
}

function auditSpecMaterials(report, errors, spec) {
  const invalid = [];
  for (const part of spec.parts || []) {
    for (const { field, target } of collectMaterialTargets(part)) {
      const material = String(target.material || '').trim();
      if (material === 'source') continue;
      const definition = MATERIAL_PALETTES[material];
      if (!definition) {
        invalid.push({ partId: part.id, field, material });
        continue;
      }
      if (target.anchor && !definition.anchors?.[target.anchor]) {
        invalid.push({ partId: part.id, field, material, anchor: target.anchor });
      }
    }
  }

  if (invalid.length > 0) {
    fail(report, errors, {
      target: 'materialAuthority',
      id: 'materialAuthority.spec.registry',
      message: 'illegal material color / id',
      category: ERROR_CATEGORIES.VALUE,
      code: ERROR_CODES.INVALID_VALUE,
      context: { invalid },
    });
    return;
  }

  pass(report, 'materialAuthority', 'materialAuthority.spec.registry', 'all spec materials resolve to registry anchors', {
    partCount: spec.parts.length,
  });
}

function auditIntegerParams(report, errors, spec) {
  const offGrid = [];
  for (const part of spec.parts || []) {
    for (const [param, value] of Object.entries(part.params || {})) {
      if (typeof value === 'number' && !Number.isInteger(value)) {
        offGrid.push({ partId: part.id, param, value });
      }
    }
  }

  if (offGrid.length > 0) {
    fail(report, errors, {
      target: 'lattice',
      id: 'lattice.integer-params',
      message: 'off-grid coordinate detected',
      context: { offGrid },
    });
    return;
  }

  pass(report, 'lattice', 'lattice.integer-params', 'all numeric part params are integer grid values');
}

function auditDiagonalCadence(report, errors, spec) {
  const failures = [];
  for (const part of spec.parts || []) {
    if (part.profile !== 'tool.pickaxe.handle.diagonal') continue;
    const length = Number(part.params?.length || 0);
    const dx = Math.abs(Number(part.params?.dx || 0));
    if (!Number.isFinite(length) || length <= 0 || dx < length * 0.5 || dx > length * 1.1) {
      failures.push({ partId: part.id, length, dx });
    }
  }

  if (failures.length > 0) {
    fail(report, errors, {
      target: 'pixelLogic',
      id: 'pixelLogic.diagonal-cadence',
      message: 'jagged diagonal handle detected',
      context: {
        failures,
        expectedInvariant: 'diagonal run cadence remains stable and connected',
      },
    });
    return;
  }

  pass(report, 'pixelLogic', 'pixelLogic.diagonal-cadence', 'diagonal cadence is inside strict craft bounds');
}

function build2DComponents(cells) {
  const present = new Set((cells || []).map((cell) => `${cell.x},${cell.y}`));
  const seen = new Set();
  const components = [];
  for (const start of present) {
    if (seen.has(start)) continue;
    const stack = [start];
    const cellsInComponent = [];
    seen.add(start);
    while (stack.length > 0) {
      const key = stack.pop();
      cellsInComponent.push(key);
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = `${x + dx},${y + dy}`;
        if (present.has(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    components.push(cellsInComponent);
  }
  return components.sort((a, b) => b.length - a.length);
}

function cellsForPart(bundle, partId) {
  const out = [];
  const partOf = bundle?.silhouette?.partOf;
  if (!partOf || typeof partOf.forEach !== 'function') return out;
  partOf.forEach((value, key) => {
    if (value === partId) {
      const [x, y] = key.split(',').map(Number);
      out.push({ x, y });
    }
  });
  return out;
}

function aabb(cells) {
  if (!cells.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    if (cell.x < minX) minX = cell.x;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.y > maxY) maxY = cell.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function partsTouch(bundle, a, b, maxDistance = 1) {
  const aCells = cellsForPart(bundle, a);
  const bCells = cellsForPart(bundle, b);
  if (!aCells.length || !bCells.length) return false;
  const bSet = new Set(bCells.map((cell) => `${cell.x},${cell.y}`));
  for (const cell of aCells) {
    for (let dy = -maxDistance; dy <= maxDistance; dy += 1) {
      for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
        if (bSet.has(`${cell.x + dx},${cell.y + dy}`)) return true;
      }
    }
  }
  return false;
}

function auditConstruction(report, errors, spec, bundle) {
  if (spec.class !== 'weapon' || spec.archetype !== 'pickaxe') {
    pass(report, 'construction', 'construction.class-specific', 'no class-specific construction audit required');
    return;
  }

  const partIds = new Set((spec.parts || []).map((part) => part.id));
  const missing = PICKAXE_REQUIRED_PARTS.filter((partId) => !partIds.has(partId));
  if (missing.length > 0) {
    fail(report, errors, {
      target: 'construction',
      id: 'construction.pickaxe.required-parts',
      message: 'pickaxe is missing required anatomy',
      context: { missing, required: PICKAXE_REQUIRED_PARTS },
    });
    return;
  }

  const failures = [];
  if (!partsTouch(bundle, 'handle', 'head_core')) {
    failures.push({ invariant: 'handle connects to pickaxe head base', parts: ['handle', 'head_core'] });
  }
  if (!partsTouch(bundle, 'collar', 'head_core', 2)) {
    failures.push({ invariant: 'collar socket connects to pickaxe head base', parts: ['collar', 'head_core'] });
  }

  const headBox = aabb(cellsForPart(bundle, 'head_core'));
  const inlayCells = cellsForPart(bundle, 'void_inlay');
  if (!headBox || inlayCells.some((cell) => (
    cell.x < headBox.minX - 1
    || cell.x > headBox.maxX + 1
    || cell.y < headBox.minY - 1
    || cell.y > headBox.maxY + 1
  ))) {
    failures.push({ invariant: 'void inlay remains inside the pickaxe head readable zone' });
  }

  if (failures.length > 0) {
    fail(report, errors, {
      target: 'construction',
      id: 'construction.pickaxe.attachments',
      message: 'pickaxe construction anchors are not structurally bound',
      context: { failures },
    });
    return;
  }

  pass(report, 'construction', 'construction.pickaxe.attachments', 'pickaxe anatomy anchors are structurally bound');
}

function isDecorativePart(spec, partId) {
  const part = (spec.parts || []).find((entry) => entry.id === partId);
  const id = String(partId || '').toLowerCase();
  const profile = String(part?.profile || '').toLowerCase();
  return Boolean(
    part?.motif
    || part?.glow
    || id.includes('inlay')
    || id.includes('rune')
    || id.includes('spark')
    || id.includes('gem')
    || profile.includes('inlay')
    || profile.includes('rune')
    || profile.includes('gem')
  );
}

function structuralSilhouetteCells(bundle, spec) {
  const partOf = bundle?.silhouette?.partOf;
  const cells = bundle?.silhouette?.cells || [];
  if (!partOf || typeof partOf.get !== 'function') return cells;
  const structural = cells.filter((cell) => !isDecorativePart(spec, partOf.get(`${cell.x},${cell.y}`)));
  return structural.length > 0 ? structural : cells;
}

function auditSilhouetteReadability(report, errors, bundle, spec) {
  const cells = structuralSilhouetteCells(bundle, spec);
  const components = build2DComponents(cells);
  if (components.length === 0) {
    fail(report, errors, {
      target: 'silhouetteReadability',
      id: 'silhouetteReadability.non-empty',
      message: 'silhouette has no occupied cells',
      context: { componentCount: 0 },
    });
    return;
  }

  if (components.length > 1) {
    fail(report, errors, {
      target: 'silhouetteReadability',
      id: 'silhouetteReadability.connected',
      message: 'silhouette is disconnected',
      context: {
        componentCount: components.length,
        componentSizes: components.map((component) => component.length),
      },
    });
    return;
  }

  pass(report, 'silhouetteReadability', 'silhouetteReadability.connected', '1-bit load-bearing silhouette is one connected component', {
    cellCount: cells.length,
  });
}

function auditFloatingIslands(report, errors, bundle, spec) {
  const partOf = bundle?.silhouette?.partOf;
  const components = build2DComponents(bundle?.silhouette?.cells || []);
  const islands = components.filter((component) => {
    if (component.length !== 1) return false;
    const partId = partOf?.get?.(component[0]);
    return !isDecorativePart(spec, partId);
  });
  if (islands.length > 0) {
    fail(report, errors, {
      target: 'pixelLogic',
      id: 'pixelLogic.floating-islands',
      message: 'floating island pixel detected',
      context: { islands },
    });
    return;
  }

  pass(report, 'pixelLogic', 'pixelLogic.floating-islands', 'no unauthorized disconnected single-pixel islands detected');
}

function auditRoute(report, errors, bundle) {
  if (!bundle?.routeDiagnostics) {
    fail(report, errors, {
      target: 'route',
      id: 'route.diagnostics.present',
      message: 'routeDiagnostics missing from forge bundle',
      context: {},
    });
    return;
  }
  if (!bundle.routeDiagnostics.ok) {
    fail(report, errors, {
      target: 'route',
      id: 'route.diagnostics.ok',
      message: 'routeDiagnostics failed',
      context: { failures: bundle.routeDiagnostics.failures || [] },
    });
    return;
  }
  pass(report, 'route', 'route.diagnostics.ok', 'route diagnostics passed', {
    route: bundle.routeDiagnostics.route || null,
  });
}

function auditVolume(report, errors, bundle) {
  const volume = bundle?.volume;
  if (!volume) {
    fail(report, errors, {
      target: 'volume',
      id: 'volume.present',
      message: 'Missing volume or voxelPacket',
      context: { missing: 'volume' },
    });
    return;
  }

  const total = volume.width * volume.height * volume.depth;
  const failures = [];
  if (!Number.isInteger(volume.width) || volume.width <= 0) failures.push({ field: 'width', value: volume.width });
  if (!Number.isInteger(volume.height) || volume.height <= 0) failures.push({ field: 'height', value: volume.height });
  if (!Number.isInteger(volume.depth) || volume.depth <= 0) failures.push({ field: 'depth', value: volume.depth });
  if (!(volume.cells instanceof Uint16Array) || volume.cells.length !== total) failures.push({ field: 'cells.length', value: volume.cells?.length, expected: total });
  if (!(volume.energyField instanceof Float32Array) || volume.energyField.length !== total) failures.push({ field: 'energyField.length', value: volume.energyField?.length, expected: total });
  if (!(volume.energyTypes instanceof Uint8Array) || volume.energyTypes.length !== total) failures.push({ field: 'energyTypes.length', value: volume.energyTypes?.length, expected: total });

  if (volume.energyField && volume.energyTypes) {
    for (let index = 0; index < volume.energyField.length; index += 1) {
      const energy = volume.energyField[index];
      const energyType = volume.energyTypes[index];
      if (!Number.isFinite(energy) || energy < 0 || energy > 1) failures.push({ field: 'energyField', index, value: energy });
      if (energy > 0 && !VALID_ENERGY_TYPES.has(energyType)) failures.push({ field: 'energyTypes', index, value: energyType });
    }
  }

  if (failures.length > 0) {
    fail(report, errors, {
      target: 'volume',
      id: 'volume.buffer-health',
      message: 'voxel volume buffers are malformed',
      category: ERROR_CATEGORIES.RANGE,
      moduleId: MODULE_IDS.COORD,
      code: ERROR_CODES.OUT_OF_BOUNDS,
      context: { failures },
    });
    return;
  }

  pass(report, 'volume', 'volume.buffer-health', 'volume buffers and energy channels are healthy', {
    dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
    cellCount: total,
  });
}

function compareVoxelOrder(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.z !== b.z) return a.z - b.z;
  return a.x - b.x;
}

function auditVoxelPacket(report, errors, bundle) {
  const packet = bundle?.voxelPacket;
  if (!packet) {
    fail(report, errors, {
      target: 'voxelPacket',
      id: 'voxelPacket.present',
      message: 'Missing volume or voxelPacket',
      context: { missing: 'voxelPacket' },
    });
    return;
  }

  const failures = [];
  if (packet.contract !== ITEM_VOXEL_CONTRACT) failures.push({ field: 'contract', value: packet.contract, expected: ITEM_VOXEL_CONTRACT });
  const dims = packet.dimensions || {};
  for (const field of ['width', 'height', 'depth']) {
    if (!Number.isInteger(dims[field]) || dims[field] <= 0) failures.push({ field: `dimensions.${field}`, value: dims[field] });
  }
  if (!packet.materials || typeof packet.materials !== 'object') failures.push({ field: 'materials', value: packet.materials });
  if (!Array.isArray(packet.voxels)) failures.push({ field: 'voxels', value: packet.voxels });

  const finalColors = new Set((bundle.assetPacket?.geometry?.coordinates || [])
    .map((coord) => toUpperHex(coord.color))
    .filter(Boolean));

  if (packet.materials && typeof packet.materials === 'object') {
    for (const [id, material] of Object.entries(packet.materials)) {
      if (!/^[1-9][0-9]*$/.test(id)) failures.push({ field: 'materials.id', id });
      const colorHint = material?.colorHint;
      if (colorHint !== undefined) {
        const normalized = toUpperHex(colorHint);
        if (!normalized || colorHint !== normalized) {
          failures.push({ field: 'materials.colorHint', id, colorHint, expected: 'uppercase #RRGGBB' });
        } else if (finalColors.size > 0 && !finalColors.has(normalized)) {
          failures.push({ field: 'materials.colorHint', id, colorHint, expected: 'final coordinate color provenance' });
        }
      }
    }
  }

  if (Array.isArray(packet.voxels)) {
    for (let index = 0; index < packet.voxels.length; index += 1) {
      const voxel = packet.voxels[index];
      const sortedPrev = index > 0 ? packet.voxels[index - 1] : null;
      if (!Number.isInteger(voxel.x) || voxel.x < 0 || voxel.x >= dims.width) failures.push({ field: 'voxel.x', index, value: voxel.x, bounds: dims.width });
      if (!Number.isInteger(voxel.y) || voxel.y < 0 || voxel.y >= dims.height) failures.push({ field: 'voxel.y', index, value: voxel.y, bounds: dims.height });
      if (!Number.isInteger(voxel.z) || voxel.z < 0 || voxel.z >= dims.depth) failures.push({ field: 'voxel.z', index, value: voxel.z, bounds: dims.depth });
      if (!Number.isInteger(voxel.materialId) || voxel.materialId <= 0) failures.push({ field: 'voxel.materialId', index, value: voxel.materialId });
      if (!packet.materials?.[String(voxel.materialId)]) failures.push({ field: 'voxel.materialId', index, value: voxel.materialId, reason: 'unresolved material id' });
      if (sortedPrev && compareVoxelOrder(sortedPrev, voxel) > 0) failures.push({ field: 'voxels.order', index, previous: sortedPrev, current: voxel, expected: 'y->z->x' });
      const hasEnergy = Object.prototype.hasOwnProperty.call(voxel, 'energy');
      const hasEnergyType = Object.prototype.hasOwnProperty.call(voxel, 'energyType');
      if (hasEnergy !== hasEnergyType) failures.push({ field: 'voxel.energyPair', index, hasEnergy, hasEnergyType });
      if (hasEnergy && (!Number.isFinite(voxel.energy) || voxel.energy < 0 || voxel.energy > 1)) failures.push({ field: 'voxel.energy', index, value: voxel.energy });
      if (hasEnergyType && !VALID_ENERGY_TYPES.has(voxel.energyType)) failures.push({ field: 'voxel.energyType', index, value: voxel.energyType });
    }
  }

  if (failures.length > 0) {
    fail(report, errors, {
      target: 'voxelPacket',
      id: 'voxelPacket.contract-health',
      message: 'voxel packet failed strict health audit',
      category: ERROR_CATEGORIES.COORD,
      moduleId: MODULE_IDS.COORD,
      code: ERROR_CODES.COORD_OUT_OF_BOUNDS,
      context: { failures: failures.slice(0, 20), failureCount: failures.length },
    });
    return;
  }

  pass(report, 'voxelPacket', 'voxelPacket.contract-health', 'voxel packet is in-bounds, sorted, and material-valid', {
    voxelCount: packet.voxels.length,
    materialCount: Object.keys(packet.materials || {}).length,
  });
}

function registryColorSet() {
  const colors = new Set();
  for (const definition of Object.values(MATERIAL_PALETTES)) {
    for (const color of Object.values(definition.anchors || {})) {
      const normalized = toUpperHex(color);
      if (normalized) colors.add(normalized);
    }
  }
  return colors;
}

function aaBlendAuthorized(coord, colors) {
  const provenance = coord?.colorProvenance;
  if (provenance?.amp !== 'pixel-aa-amp') return false;
  const inputs = Array.isArray(provenance.inputs) ? provenance.inputs : [];
  return inputs.length >= 2 && inputs.every((color) => colors.has(toUpperHex(color)));
}

function isAuthorizedCoordinateColor(coord, colors, depth = 0) {
  if (!coord || depth > 4) return false;
  const color = toUpperHex(coord.color);
  if (!color) return false;
  if (colors.has(color)) return true;
  if (aaBlendAuthorized(coord, colors)) return true;
  if (coord.quantizedFrom && colors.has(color)) return true;
  if (coord.preSquareColor && coord.squareAmp === 'square-sharpness-contrast') {
    return isAuthorizedCoordinateColor(
      { ...coord, color: coord.preSquareColor, preSquareColor: null, squareAmp: null },
      colors,
      depth + 1,
    );
  }
  return false;
}

function auditFinalMaterialAuthority(report, errors, bundle) {
  const coordinates = bundle?.assetPacket?.geometry?.coordinates || [];
  const colors = registryColorSet();
  const unauthorized = [];
  for (const coord of coordinates) {
    if (!isAuthorizedCoordinateColor(coord, colors)) {
      unauthorized.push({
        x: coord.x,
        y: coord.y,
        partId: coord.partId || null,
        color: coord.color,
        preSquareColor: coord.preSquareColor || null,
        squareAmp: coord.squareAmp || null,
      });
    }
  }

  if (unauthorized.length > 0) {
    fail(report, errors, {
      target: 'materialAuthority',
      id: 'materialAuthority.final-colors',
      message: 'unauthorized final hue detected',
      category: ERROR_CATEGORIES.COLOR,
      severity: ERROR_SEVERITY.CRIT,
      moduleId: MODULE_IDS.COLOR_BYTE,
      code: ERROR_CODES.COLOR_BYTE_MISMATCH,
      context: { unauthorized: unauthorized.slice(0, 20), failureCount: unauthorized.length },
    });
    return;
  }

  pass(report, 'materialAuthority', 'materialAuthority.final-colors', 'all final colors trace to registry anchors or documented AMP provenance', {
    coordinateCount: coordinates.length,
  });
}

function deterministicFingerprint(bundle) {
  return stableStringify({
    assetPacket: bundle.assetPacket,
    fillsHash: bundle.fills?.hash || null,
    voxelPacket: bundle.voxelPacket,
    volumeDiagnostics: bundle.volume?.diagnostics || null,
    sharpnessInputHash: bundle.sharpness?.inputHash || null,
  });
}

function auditDeterminism(report, errors, rawSpec, firstBundle, opts) {
  if (opts.skipDeterminism) {
    pass(report, 'determinism', 'determinism.forge-twice', 'determinism audit skipped by caller');
    return;
  }

  try {
    const secondBundle = itemFoundryModule.forgeItemAsset(rawSpec, opts.forgeOptions || {});
    if (deterministicFingerprint(firstBundle) !== deterministicFingerprint(secondBundle)) {
      fail(report, errors, {
        target: 'determinism',
        id: 'determinism.forge-twice',
        message: 'non-deterministic forge output',
        context: {
          first: deterministicFingerprint(firstBundle).slice(0, 160),
          second: deterministicFingerprint(secondBundle).slice(0, 160),
        },
      });
      return;
    }
  } catch (error) {
    fail(report, errors, {
      target: 'determinism',
      id: 'determinism.forge-twice',
      message: 'non-deterministic forge output',
      context: { error: error.message },
    });
    return;
  }

  pass(report, 'determinism', 'determinism.forge-twice', 'forge output is byte-stable across two runs');
}

function auditBlueprint(report, errors, bundle, blueprint) {
  if (!blueprint) return;
  try {
    auditSilhouetteBlueprint(bundle, blueprint);
    pass(report, 'silhouetteBlueprint', 'silhouetteBlueprint.shadow-match', 'voxel shadows match sealed silhouette blueprint', {
      digest: blueprint.digest,
    });
    if (blueprint.animation) {
      pass(report, 'silhouetteAnimation', 'silhouetteAnimation.lockstep', 'animated voxel shadows stay in blueprint lockstep', {
        digest: blueprint.digest,
        poses: blueprint.animation.poses.length,
      });
    }
  } catch (error) {
    const target = error?.context?.phase ? 'silhouetteAnimation' : 'silhouetteBlueprint';
    const id = target === 'silhouetteAnimation'
      ? 'silhouetteAnimation.lockstep'
      : 'silhouetteBlueprint.shadow-match';
    failFromError(report, errors, target, id, error?.context?.reason || 'silhouette blueprint audit failed', error, error?.context || {});
  }
}

/**
 * PixelBrain Craft Gate for Forge Asset Immunity.
 *
 * Default behavior preserves the historical API: blocking failures throw the
 * first BytecodeError, and successful calls expose `ok`, `vaccine`, and
 * `bundle`. Pass `{ throwOnFail: false }` to receive the full
 * PixelBrainCraftGateReport on failures.
 */
export function runForgeCraftGate(input, opts = {}) {
  const inputIsBundle = Boolean(input?.assetPacket && input?.voxelPacket);
  const rawSpec = inputIsBundle ? input.spec : normalizeForFinish(input, opts);
  let spec = inputIsBundle ? input.spec : null;
  let report = createReport(input, opts, spec, inputIsBundle ? 'pixelbrain.asset.v1' : 'ITEM-SPEC-v1');
  const errors = [];

  if (!inputIsBundle) {
    try {
      spec = normalizeItemSpec(rawSpec);
      validateItemSpec(spec);
      report = { ...report, source: { ...report.source, specId: spec.id } };
      pass(report, 'itemSpec', 'itemSpec.contract', 'ITEM-SPEC-v1 normalizes and validates', {
        hash: hashItemSpec(spec),
      });
    } catch (error) {
      const message = /material/i.test(error.message || '')
        ? 'illegal material color / id'
        : 'forgeItemAsset threw exception';
      fail(report, errors, {
        target: 'itemSpec',
        id: 'itemSpec.contract',
        message,
        category: /material/i.test(error.message || '') ? ERROR_CATEGORIES.VALUE : ERROR_CATEGORIES.STATE,
        code: /material/i.test(error.message || '') ? ERROR_CODES.INVALID_VALUE : ERROR_CODES.IMMUNE_INNATE_BLOCK,
        context: { error: error.message, cause: error.cause || null },
      });
      return returnOrThrow(report, errors, null, null, opts);
    }

    auditSpecMaterials(report, errors, spec);
    auditIntegerParams(report, errors, spec);
    auditDiagonalCadence(report, errors, spec);
  } else if (spec) {
    pass(report, 'itemSpec', 'itemSpec.bundle-present', 'bundle carries a source spec');
  }

  let bundle = inputIsBundle ? input : null;
  if (!bundle) {
    try {
      bundle = itemFoundryModule.forgeItemAsset(rawSpec, opts.forgeOptions || {});
    } catch (error) {
      fail(report, errors, {
        target: 'route',
        id: 'route.forge',
        message: 'forgeItemAsset threw exception',
        context: { error: error.message, cause: error.cause || null },
      });
      return returnOrThrow(report, errors, null, null, opts);
    }
  }

  auditRoute(report, errors, bundle);
  auditConstruction(report, errors, spec || bundle.spec || {}, bundle);
  auditSilhouetteReadability(report, errors, bundle, spec || bundle.spec || {});
  auditFloatingIslands(report, errors, bundle, spec || bundle.spec || {});
  auditFinalMaterialAuthority(report, errors, bundle);
  auditVolume(report, errors, bundle);
  auditVoxelPacket(report, errors, bundle);
  if (!inputIsBundle) auditDeterminism(report, errors, rawSpec, bundle, opts);
  auditBlueprint(report, errors, bundle, opts.blueprint);

  let vaccine = null;
  if (errors.length === 0) {
    const vaccineResult = encodeBytecodeXPVaccineFromHealth({
      cellId: 'forge_craft_gate',
      checkId: opts.finish ? 'strict_gate_finish_suite' : 'determinism_and_authority',
      moduleId: MODULE_IDS.IMMUNITY,
      bytecode: 'PASS',
    }, { title: `ForgeGatePass-${(spec || bundle.spec).id}` });
    vaccine = vaccineResult.bytecode;
  }

  return returnOrThrow(report, errors, bundle, vaccine, opts);
}
