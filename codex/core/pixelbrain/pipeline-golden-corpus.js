import { readFileSync } from 'node:fs';

import { runForgeCraftGate } from './forge-craft-gate.js';
import { forgeItemAsset } from './item-foundry.js';
import { sketchToSilhouette } from './sketch-amp.js';
import { applyPixelAA } from './pixel-aa-amp.js';
import { applyFacets } from './facet-amp.js';
import { applyDetailBudget } from './detail-budget.js';
import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';

export const PIPELINE_CORPUS_CONTRACT = 'pixelbrain.pipeline-corpus.v1';
export const PIPELINE_CORPUS_SCHEMA_VERSION = '0.1.0';

export const PIPELINE_CORPUS_CASE_IDS = Object.freeze([
  'gate.unauthorized-final-hue',
  'gate.bad-voxel-sort',
  'gate.invalid-voxel-material-id',
  'gate.disconnected-handle',
  'gate.floating-island-pixel',
  'finish.directional-anti-pillow',
  'finish.pixel-aa-stair-step',
  'finish.gem-faceting',
  'finish.detail-budget-tight-interior',
]);

// Vitest serves modules over http, so import.meta.url is not always a file
// URL; fall back to resolving from the repo root (the test/process cwd).
const PICKAXE_SPEC_URL = (() => {
  const fromModule = new URL('../../../specs/voidmetal-pickaxe.v1.json', import.meta.url);
  if (fromModule.protocol === 'file:') return fromModule;
  return `${process.cwd()}/specs/voidmetal-pickaxe.v1.json`;
})();
const LIGHT = Object.freeze({ angle: Math.PI * 1.25, ambient: 0.3 });
const HEX_UNAUTHORIZED = '#123456';

function deepClone(value) {
  return globalThis.structuredClone(value);
}

function loadPickaxeSpec() {
  return JSON.parse(readFileSync(PICKAXE_SPEC_URL, 'utf8'));
}

function getSpec(options = {}) {
  return deepClone(options.spec || loadPickaxeSpec());
}

function getBundle(options = {}) {
  return forgeItemAsset(getSpec(options), options.forgeOptions || {});
}

function freezeCase(entry) {
  return Object.freeze({
    id: entry.id,
    type: entry.type,
    status: entry.status,
    expected: Object.freeze(entry.expected || {}),
    observed: Object.freeze(entry.observed || {}),
    bytecodeErrors: Object.freeze(entry.bytecodeErrors || []),
  });
}

function passCase(id, type, expected, observed = {}, bytecodeErrors = []) {
  return freezeCase({ id, type, status: 'pass', expected, observed, bytecodeErrors });
}

function failCase(id, type, expected, observed = {}, bytecodeErrors = []) {
  return freezeCase({ id, type, status: 'fail', expected, observed, bytecodeErrors });
}

function failedAuditIds(report) {
  return (report.audits || []).filter((audit) => !audit.ok).map((audit) => audit.id);
}

function runGateMutationCase(id, expectedAuditId, mutateBundle, options = {}, extraCheck = () => true) {
  const expected = Object.freeze({ status: 'fail', auditId: expectedAuditId });
  try {
    const bundle = deepClone(getBundle(options));
    const mutated = mutateBundle(bundle);
    const report = runForgeCraftGate(mutated, { throwOnFail: false });
    const audits = failedAuditIds(report);
    const bytecodeErrors = [...(report.bytecodeErrors || [])];
    const observed = {
      gateStatus: report.status,
      failedAuditIds: audits,
      bytecodeErrorCount: bytecodeErrors.length,
      summary: report.summary,
    };
    const ok = report.status === 'fail'
      && audits.includes(expectedAuditId)
      && bytecodeErrors.some((bytecode) => /^PB-ERR-v1-/.test(bytecode))
      && extraCheck(report);
    return ok
      ? passCase(id, 'mutation', expected, observed, bytecodeErrors)
      : failCase(id, 'mutation', expected, observed, bytecodeErrors);
  } catch (error) {
    return failCase(id, 'mutation', expected, {
      exception: error?.message || String(error),
      bytecode: error?.bytecode || null,
    }, error?.bytecode ? [error.bytecode] : []);
  }
}

function mutateUnauthorizedFinalHue(bundle) {
  const coordinates = bundle.assetPacket?.geometry?.coordinates || [];
  if (coordinates.length === 0) throw new Error('base bundle has no coordinates');
  coordinates[0] = {
    ...coordinates[0],
    color: HEX_UNAUTHORIZED,
    preSquareColor: null,
    squareAmp: null,
    colorProvenance: null,
    quantizedFrom: null,
  };
  return bundle;
}

function mutateBadVoxelSort(bundle) {
  const voxels = bundle.voxelPacket?.voxels || [];
  if (voxels.length < 2) throw new Error('base bundle has too few voxels');
  bundle.voxelPacket.voxels = [voxels[voxels.length - 1], ...voxels.slice(1, -1), voxels[0]];
  return bundle;
}

function mutateInvalidVoxelMaterialId(bundle) {
  const voxels = bundle.voxelPacket?.voxels || [];
  if (voxels.length === 0) throw new Error('base bundle has no voxels');
  const maxId = Math.max(0, ...Object.keys(bundle.voxelPacket.materials || {}).map((id) => Number(id)));
  voxels[0] = { ...voxels[0], materialId: maxId + 1000 };
  return bundle;
}

function mutateDisconnectedHandle(bundle) {
  const partOf = bundle.silhouette?.partOf;
  if (!(partOf instanceof Map)) throw new Error('base bundle has no silhouette part map');
  const moved = [];
  for (const [key, value] of [...partOf.entries()]) {
    if (value !== 'handle') continue;
    const [x, y] = key.split(',').map(Number);
    partOf.delete(key);
    moved.push([`${x + 32},${y + 24}`, value]);
  }
  if (moved.length === 0) throw new Error('base bundle has no handle cells');
  for (const [key, value] of moved) partOf.set(key, value);
  return bundle;
}

function mutateFloatingIslandPixel(bundle) {
  const cells = bundle.silhouette?.cells || [];
  const partOf = bundle.silhouette?.partOf;
  if (!Array.isArray(cells) || !(partOf instanceof Map)) {
    throw new Error('base bundle has no mutable silhouette cells');
  }
  const occupied = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  let island = null;
  for (let y = 0; y < 64 && !island; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const key = `${x},${y}`;
      const neighbors = [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`];
      if (!occupied.has(key) && neighbors.every((neighbor) => !occupied.has(neighbor))) {
        island = { x, y };
        break;
      }
    }
  }
  if (!island) throw new Error('could not find empty island cell');
  cells.push(island);
  partOf.set(`${island.x},${island.y}`, 'rogue_pixel');
  return bundle;
}

function discOccupancy(cx, cy, r) {
  const cells = [];
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) cells.push({ x, y });
    }
  }
  return cells;
}

function halfMeans(coordinates, cx, cy, light) {
  const lx = Math.cos(light.angle);
  const ly = Math.sin(light.angle);
  let lit = 0;
  let litN = 0;
  let shadow = 0;
  let shadowN = 0;
  for (const cell of coordinates) {
    const projection = (cell.x - cx) * lx + (cell.y - cy) * ly;
    if (projection > 1) {
      lit += cell.slot;
      litN += 1;
    } else if (projection < -1) {
      shadow += cell.slot;
      shadowN += 1;
    }
  }
  return { lit: lit / litN, shadow: shadow / shadowN };
}

function runDirectionalAntiPillow() {
  const id = 'finish.directional-anti-pillow';
  const expected = Object.freeze({ status: 'pass', invariant: 'lit-half-outshines-shadow-half' });
  const cx = 10;
  const cy = 10;
  const occupied = discOccupancy(cx, cy, 8);
  const lit = sketchToSilhouette(occupied, { width: 21, height: 21 }, { bands: 6, light: LIGHT });
  const legacy = sketchToSilhouette(occupied, { width: 21, height: 21 }, { bands: 6 });
  const directionalMeans = halfMeans(lit.coordinates, cx, cy, LIGHT);
  const legacyMeans = halfMeans(legacy.coordinates, cx, cy, LIGHT);
  const observed = {
    directionalMeans,
    legacyMeans,
    directionalDelta: directionalMeans.lit - directionalMeans.shadow,
    legacyDelta: Math.abs(legacyMeans.lit - legacyMeans.shadow),
  };
  const ok = observed.directionalDelta > 0.2 && observed.legacyDelta < 0.15;
  return ok
    ? passCase(id, 'golden', expected, observed)
    : failCase(id, 'golden', expected, observed);
}

function runPixelAAStairStep() {
  const id = 'finish.pixel-aa-stair-step';
  const expected = Object.freeze({ status: 'pass', invariant: 'inner-corner-50-50-aa-provenance' });
  const fills = {
    coordinates: [
      { x: 2, y: 0, color: '#1D5FD6', isRim: true, isMotif: false, partId: 'p' },
      { x: 1, y: 1, color: '#1D5FD6', isRim: true, isMotif: false, partId: 'p' },
      { x: 2, y: 1, color: '#101017', isRim: false, isMotif: false, partId: 'p' },
      { x: 3, y: 1, color: '#1D5FD6', isRim: true, isMotif: false, partId: 'p' },
      { x: 2, y: 2, color: '#1D5FD6', isRim: true, isMotif: false, partId: 'p' },
    ],
  };
  const out = applyPixelAA(fills, {});
  const inner = out.coordinates.find((cell) => cell.x === 2 && cell.y === 1);
  const observed = {
    color: inner?.color || null,
    provenance: inner?.colorProvenance || null,
    geometryStable: out.coordinates.length === fills.coordinates.length,
  };
  const ok = observed.color === '#173877'
    && observed.provenance?.amp === 'pixel-aa-amp'
    && observed.provenance?.kind === 'inner-corner-50-50'
    && observed.geometryStable;
  return ok
    ? passCase(id, 'golden', expected, observed)
    : failCase(id, 'golden', expected, observed);
}

function registryResolver({ material, anchor }) {
  const definition = MATERIAL_PALETTES[resolveMaterialId(material)];
  if (!definition) return null;
  return definition.anchors?.[anchor] || definition.anchors?.body || null;
}

function runGemFaceting() {
  const id = 'finish.gem-faceting';
  const expected = Object.freeze({ status: 'pass', invariant: 'hard-registry-facet-tones' });
  const coordinates = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const isRim = x === 0 || y === 0 || x === 4 || y === 4;
      coordinates.push({ x, y, color: '#C9DAE6', isRim, isMotif: false, partId: 'gem' });
    }
  }
  const spec = { parts: [{ id: 'gem', shading: 'faceted', fill: { material: 'diamond' } }] };
  const out = applyFacets({ coordinates }, spec, registryResolver, LIGHT);
  const interior = out.coordinates.filter((cell) => !cell.isRim);
  const tones = [...new Set(interior.map((cell) => cell.color))].sort();
  const anchors = new Set(Object.values(MATERIAL_PALETTES.diamond.anchors));
  const observed = {
    toneCount: tones.length,
    tones,
    allRegistryAnchors: interior.every((cell) => anchors.has(cell.color)),
  };
  const ok = observed.toneCount >= 2 && observed.allRegistryAnchors;
  return ok
    ? passCase(id, 'golden', expected, observed)
    : failCase(id, 'golden', expected, observed);
}

function runDetailBudgetTightInterior() {
  const id = 'finish.detail-budget-tight-interior';
  const expected = Object.freeze({ status: 'pass', invariant: 'tight-interior-simplifies-motif-and-drops-glow' });
  const budget = applyDetailBudget({ motif: { kind: 'bolt' } }, 3);
  const observed = { budget };
  const ok = budget.allowCore === true && budget.allowGlow === false && budget.simplifyToPoints === true;
  return ok
    ? passCase(id, 'golden', expected, observed)
    : failCase(id, 'golden', expected, observed);
}

export function runPipelineCorpusCase(caseId, options = {}) {
  switch (caseId) {
    case 'gate.unauthorized-final-hue':
      return runGateMutationCase(caseId, 'materialAuthority.final-colors', mutateUnauthorizedFinalHue, options);
    case 'gate.bad-voxel-sort':
      return runGateMutationCase(caseId, 'voxelPacket.contract-health', mutateBadVoxelSort, options);
    case 'gate.invalid-voxel-material-id':
      return runGateMutationCase(
        caseId,
        'voxelPacket.contract-health',
        mutateInvalidVoxelMaterialId,
        options,
        (report) => report.audits.some((audit) => JSON.stringify(audit.evidence || {}).includes('unresolved material id')),
      );
    case 'gate.disconnected-handle':
      return runGateMutationCase(caseId, 'construction.pickaxe.attachments', mutateDisconnectedHandle, options);
    case 'gate.floating-island-pixel':
      return runGateMutationCase(caseId, 'pixelLogic.floating-islands', mutateFloatingIslandPixel, options);
    case 'finish.directional-anti-pillow':
      return runDirectionalAntiPillow();
    case 'finish.pixel-aa-stair-step':
      return runPixelAAStairStep();
    case 'finish.gem-faceting':
      return runGemFaceting();
    case 'finish.detail-budget-tight-interior':
      return runDetailBudgetTightInterior();
    default:
      return failCase(caseId, 'golden', { status: 'pass' }, { exception: `unknown corpus case: ${caseId}` });
  }
}

export function runPixelBrainPipelineCorpus(options = {}) {
  const ids = options.caseIds || PIPELINE_CORPUS_CASE_IDS;
  const cases = ids.map((caseId) => runPipelineCorpusCase(caseId, options));
  const failed = cases.filter((entry) => entry.status === 'fail');
  const bytecodeErrors = cases.flatMap((entry) => entry.bytecodeErrors);
  return Object.freeze({
    contract: PIPELINE_CORPUS_CONTRACT,
    schemaVersion: PIPELINE_CORPUS_SCHEMA_VERSION,
    status: failed.length === 0 ? 'pass' : 'fail',
    summary: Object.freeze({
      cases: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
    }),
    cases: Object.freeze(cases),
    bytecodeErrors: Object.freeze(bytecodeErrors),
  });
}
