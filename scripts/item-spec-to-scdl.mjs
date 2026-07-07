/**
 * Convert a forged ITEM-SPEC bundle into SCDL source text.
 * Coordinates become painter-ordered `cell` ops grouped by part.
 */

import {
  fitWeaponPartMapToCharacterRig,
  scaleWalkOffsets,
} from '../src/game/combat/weaponRigFit.js';

const GLOW_PARTS = new Set([
  'orb_ring_glow',
  'shaft_lattice_glow',
  'bezel_void_glow',
  'pommel_glow',
  'shaft_glint',
]);

function normalizeHex(color) {
  const raw = String(color || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw.toUpperCase()}`;
}

function buildPalette(coordinates) {
  const seen = new Map();
  const entries = [];
  for (const coord of coordinates) {
    const hex = normalizeHex(coord.color);
    if (!hex || seen.has(hex)) continue;
    const alias = `c${String(seen.size).padStart(2, '0')}`;
    seen.set(hex, alias);
    entries.push({ alias, hex });
  }
  return { seen, entries };
}

function partMaterial(spec, partId) {
  const part = spec.parts?.find((entry) => entry.id === partId);
  if (!part) return 'source';
  return part.fill?.material || part.outline?.material || 'source';
}

function shiftCells(cells, dx = 0, dy = 0, canvas) {
  return cells
    .map((cell) => ({ x: cell.x + dx, y: cell.y + dy, color: cell.color }))
    .filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < canvas.width && cell.y < canvas.height);
}

export function bundleCoordinatesToPartMap(bundle) {
  const map = new Map();
  for (const coord of bundle.assetPacket.geometry.coordinates) {
    const partId = coord.partId || 'icon';
    if (!map.has(partId)) map.set(partId, []);
    map.get(partId).push({
      x: Math.round(coord.snappedX ?? coord.x),
      y: Math.round(coord.snappedY ?? coord.y),
      color: coord.color,
    });
  }
  return map;
}

export function buildItemSpecScdlSource(bundle, options = {}) {
  const spec = bundle.spec;
  const assetName = options.assetName || 'IceSlimeStaff';
  let partMap = bundleCoordinatesToPartMap(bundle);
  let canvas = spec.canvas || { width: 48, height: 128 };
  let rigFit = null;

  if (options.fitToCharacterRig) {
    rigFit = fitWeaponPartMapToCharacterRig(partMap, options.rigFit);
    partMap = rigFit.partMap;
    canvas = rigFit.canvas;
  }

  const orderedPartIds = (spec.parts || []).map((part) => part.id).filter((id) => partMap.has(id));
  for (const partId of partMap.keys()) {
    if (!orderedPartIds.includes(partId)) orderedPartIds.push(partId);
  }

  const allCoords = [...partMap.values()].flat();
  const { seen, entries } = buildPalette(allCoords);

  const lines = [];
  lines.push(`# ${assetName} — compiled from ${spec.id}`);
  lines.push(`# ITEM-SPEC painter order preserved; transparent PNG via SCDL export.`);
  if (rigFit) {
    lines.push(`# Rig fit: scale ${rigFit.scale.toFixed(4)} → grip (${rigFit.targetGrip.x}, ${rigFit.targetGrip.y}) on ${canvas.width}x${canvas.height}.`);
  }
  lines.push('');
  lines.push(`asset ${assetName} canvas ${canvas.width}x${canvas.height}`);
  lines.push('');
  lines.push('palette {');
  for (const entry of entries) {
    lines.push(`  ${entry.alias} = ${entry.hex}`);
  }
  lines.push('}');
  lines.push('');

  const emitPart = (partId, cells) => {
    const material = partMaterial(spec, partId);
    lines.push(`part ${partId} material ${material} {`);
    if (GLOW_PARTS.has(partId)) {
      lines.push('  glow radius 2');
    }
    const sorted = [...cells].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const cell of sorted) {
      const hex = normalizeHex(cell.color);
      const alias = seen.get(hex);
      if (!alias) continue;
      lines.push(`  cell ${cell.x} ${cell.y} ${alias}`);
    }
    lines.push('}');
    lines.push('');
  };

  for (const partId of orderedPartIds) {
    emitPart(partId, partMap.get(partId));
  }

  const walkOffsets = options.walkOffsets || [
    { label: 'contactL', dy: -1 },
    { label: 'riseL', dy: -2 },
    { label: 'passL', dy: -1 },
    { label: 'fallL', dy: 0 },
    { label: 'contactR', dy: -3 },
    { label: 'riseR', dy: -5 },
    { label: 'passR', dy: -5 },
    { label: 'fallR', dy: -3 },
  ];

  if (walkOffsets.length) {
    lines.push('loop walk duration 800');
    lines.push('');
    walkOffsets.forEach((frame, index) => {
      lines.push(`frame ${index + 1} "${frame.label}" {`);
      for (const partId of orderedPartIds) {
        const shifted = shiftCells(partMap.get(partId), frame.dx || 0, frame.dy || 0, canvas);
        if (!shifted.length) continue;
        const material = partMaterial(spec, partId);
        lines.push(`  part ${partId} material ${material} {`);
        if (GLOW_PARTS.has(partId)) {
          lines.push('    glow radius 2');
        }
        for (const cell of shifted) {
          const hex = normalizeHex(cell.color);
          const alias = seen.get(hex);
          if (!alias) continue;
          lines.push(`    cell ${cell.x} ${cell.y} ${alias}`);
        }
        lines.push('  }');
      }
      lines.push('}');
      lines.push('');
    });
  }

  lines.push('export json svg phaser png');
  lines.push('');
  return lines.join('\n');
}