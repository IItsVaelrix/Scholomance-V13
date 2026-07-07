/**
 * Build a polished IceSlimeStaff.scdl:
 * - Character-rig fit (64x128, grip at right hand)
 * - Vector sphere + ring hero parts (round orb, cradle, iridescent halo)
 * - ITEM-SPEC forged shaft/handle/bezel cells
 * - Ether pulse + sparkle idle frames (f1–f3)
 * - Walk bob frames (f4–f8)
 */

import {
  CHARACTER_WEAPON_GRIP,
  fitPoint,
  fitWeaponPartMapToCharacterRig,
  isHeroWeaponPart,
  scaleWalkOffsets,
} from '../src/game/combat/weaponRigFit.js';
import { bundleCoordinatesToPartMap } from './item-spec-to-scdl.mjs';

const GLOW_PARTS = new Set([
  'orb_halo',
  'orb_sparkle',
  'shaft_lattice_glow',
  'bezel_void_glow',
  'pommel_glow',
  'shaft_glint',
  'ether_flow',
]);

const RUNE_PARTS = new Set(['shaft_rune_lattice', 'shaft_lattice_glow']);

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

function filterRunePulse(cells, phase, canvas) {
  const bands = [
    { min: 0, max: 34 },
    { min: 34, max: 44 },
    { min: 44, max: 54 },
    { min: 54, max: canvas.height },
  ];
  const active = new Set();
  for (let step = 0; step <= phase; step += 1) {
    const band = bands[step];
    if (!band) continue;
    for (let y = band.min; y < band.max; y += 1) active.add(y);
  }
  return cells.filter((cell) => active.has(cell.y));
}

function emitCellLines(cells, seen, indent = '  ') {
  const lines = [];
  const sorted = [...cells].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const cell of sorted) {
    const alias = seen.get(normalizeHex(cell.color));
    if (!alias) continue;
    lines.push(`${indent}cell ${cell.x} ${cell.y} ${alias}`);
  }
  return lines;
}

function heroPartLines(rigFit) {
  const orb = fitPoint(24, 24, rigFit);
  const cradle = fitPoint(24, 31, rigFit);
  const orbR = Math.max(4, Math.round(9 * rigFit.scale));
  const cradleR = Math.max(5, Math.round(10 * rigFit.scale));
  const sparkleA = { x: orb.x - 2, y: orb.y - 3 };
  const sparkleB = { x: orb.x - 1, y: orb.y - 4 };

  return [
    'part orb_halo material cyan_glow {',
    '  glow radius 3',
    `  ring ${orb.x} ${orb.y} radius ${orbR + 3} width 1 irid_violet`,
    `  ring ${orb.x} ${orb.y} radius ${orbR + 2} width 1 irid_cyan`,
    `  ring ${orb.x} ${orb.y} radius ${orbR + 1} width 2 irid_blue`,
    '}',
    '',
    'part orb material void_ice {',
    `  sphere ${orb.x} ${orb.y} radius ${orbR} light -1 -1 orb_shine orb_lit orb_core orb_rim orb_shadow`,
    '  glow radius 2',
    '}',
    '',
    'part orb_sparkle material sapphire_enamel {',
    `  cell ${sparkleA.x} ${sparkleA.y} orb_shine`,
    `  cell ${sparkleB.x} ${sparkleB.y} orb_lit`,
    '}',
    '',
    'part cradle material silver {',
    `  ring ${cradle.x} ${cradle.y} radius ${cradleR} width 2 silver_rim`,
    `  ring ${cradle.x} ${cradle.y} radius ${cradleR - 1} width 1 silver_body`,
    `  rect ${cradle.x - 2} ${cradle.y} 5 2 silver_body`,
    '}',
    '',
    'part cradle_highlight material silver {',
    `  cell ${cradle.x - 2} ${cradle.y - 1} silver_shine`,
    `  cell ${cradle.x - 1} ${cradle.y - 2} silver_shine`,
    '}',
    '',
  ];
}

function etherFlowLines(rigFit, phase, indent = '') {
  const cradle = fitPoint(24, 31, rigFit);
  const handle = fitPoint(24, 103, rigFit);
  const lines = [`${indent}part ether_flow after cradle material cyan_glow {`, `${indent}  glow radius 2`];
  const steps = 4;
  for (let step = 0; step <= phase; step += 1) {
    const t = (step + 1) / steps;
    const y = Math.round(cradle.y + (handle.y - cradle.y) * t);
    lines.push(`${indent}  cell ${cradle.x - 1} ${y} ether_pulse`);
    lines.push(`${indent}  cell ${cradle.x} ${y} ether_core`);
    lines.push(`${indent}  cell ${cradle.x + 1} ${y} ether_pulse`);
    if (step > 0) {
      lines.push(`${indent}  cell ${cradle.x} ${y - 1} ether_trail`);
    }
  }
  lines.push(`${indent}}`);
  lines.push('');
  return lines;
}

export function buildPolishedIceSlimeStaffScdl(bundle, options = {}) {
  const spec = bundle.spec;
  const assetName = options.assetName || 'IceSlimeStaff';
  const rawPartMap = bundleCoordinatesToPartMap(bundle);
  const rigFit = fitWeaponPartMapToCharacterRig(rawPartMap, options.rigFit);
  const canvas = rigFit.canvas;

  const bodyPartMap = new Map();
  for (const [partId, cells] of rigFit.partMap.entries()) {
    if (isHeroWeaponPart(partId)) continue;
    bodyPartMap.set(partId, cells);
  }

  const paletteSeed = [
    { alias: 'orb_shine', hex: '#F4FBFF' },
    { alias: 'orb_lit', hex: '#B8F3FF' },
    { alias: 'orb_core', hex: '#4CC9F0' },
    { alias: 'orb_rim', hex: '#15789D' },
    { alias: 'orb_shadow', hex: '#082636' },
    { alias: 'irid_violet', hex: '#C4B5FD' },
    { alias: 'irid_cyan', hex: '#67E8F9' },
    { alias: 'irid_blue', hex: '#38BDF8' },
    { alias: 'silver_shine', hex: '#F8FAFC' },
    { alias: 'silver_rim', hex: '#CBD5E1' },
    { alias: 'silver_body', hex: '#94A3B8' },
    { alias: 'ether_core', hex: '#22D3EE' },
    { alias: 'ether_pulse', hex: '#67E8F9' },
    { alias: 'ether_trail', hex: '#0E7490' },
  ];

  const allCoords = [...bodyPartMap.values()].flat();
  const generatedPalette = buildPalette(allCoords);
  const seen = new Map(paletteSeed.map((entry) => [entry.hex, entry.alias]));
  const entries = [...paletteSeed];
  for (const entry of generatedPalette.entries) {
    if (seen.has(entry.hex)) continue;
    seen.set(entry.hex, entry.alias);
    entries.push(entry);
  }

  const orderedPartIds = (spec.parts || [])
    .map((part) => part.id)
    .filter((id) => bodyPartMap.has(id));
  for (const partId of bodyPartMap.keys()) {
    if (!orderedPartIds.includes(partId)) orderedPartIds.push(partId);
  }

  const lines = [];
  lines.push(`# ${assetName} — polished SCDL (rig-fit + vector orb/cradle + ether pulse)`);
  lines.push(`# Grip (${CHARACTER_WEAPON_GRIP.x}, ${CHARACTER_WEAPON_GRIP.y}) on ${canvas.width}x${canvas.height}; scale ${rigFit.scale.toFixed(4)}`);
  lines.push('');
  lines.push(`asset ${assetName} canvas ${canvas.width}x${canvas.height}`);
  lines.push('');
  lines.push('palette {');
  for (const entry of entries) lines.push(`  ${entry.alias} = ${entry.hex}`);
  lines.push('}');
  lines.push('');
  lines.push(...heroPartLines(rigFit));

  const emitBodyPart = (partId, cells, indent = '') => {
    const material = partMaterial(spec, partId);
    lines.push(`${indent}part ${partId} material ${material} {`);
    if (GLOW_PARTS.has(partId)) lines.push(`${indent}  glow radius 2`);
    lines.push(...emitCellLines(cells, seen, `${indent}  `));
    lines.push(`${indent}}`);
    lines.push('');
  };

  for (const partId of orderedPartIds) emitBodyPart(partId, bodyPartMap.get(partId));

  const runeLattice = bodyPartMap.get('shaft_rune_lattice') || [];
  const runeGlow = bodyPartMap.get('shaft_lattice_glow') || [];

  const pulseFrames = [
    { label: 'sparkle-peak', phase: 1, sparkle: true },
    { label: 'ether-mid', phase: 2, sparkle: false },
    { label: 'ether-base', phase: 3, sparkle: false },
  ];

  const walkOffsets = scaleWalkOffsets([
    { label: 'contactL', dy: -1 },
    { label: 'riseL', dy: -2 },
    { label: 'passL', dy: -1 },
    { label: 'fallL', dy: 0 },
    { label: 'contactR', dy: -2 },
  ], rigFit.scale);

  lines.push('loop ether duration 220');
  lines.push('');

  pulseFrames.forEach((frame, index) => {
    lines.push(`frame ${index + 1} "${frame.label}" {`);
    lines.push(...etherFlowLines(rigFit, frame.phase, '  '));
    if (frame.sparkle) {
      const orb = fitPoint(24, 24, rigFit);
      lines.push('  part orb_sparkle material sapphire_enamel {');
      lines.push(`    cell ${orb.x - 3} ${orb.y - 4} orb_shine`);
      lines.push(`    cell ${orb.x - 2} ${orb.y - 5} orb_shine`);
      lines.push(`    cell ${orb.x + 2} ${orb.y - 3} orb_lit`);
      lines.push('  }');
    }
    if (runeLattice.length) {
      lines.push('  part shaft_rune_lattice material void_ice {');
      lines.push(...emitCellLines(filterRunePulse(runeLattice, frame.phase, canvas), seen, '    '));
      lines.push('  }');
    }
    if (runeGlow.length) {
      lines.push('  part shaft_lattice_glow material cyan_glow {');
      lines.push('    glow radius 2');
      lines.push(...emitCellLines(filterRunePulse(runeGlow, frame.phase, canvas), seen, '    '));
      lines.push('  }');
    }
    lines.push('}');
    lines.push('');
  });

  walkOffsets.forEach((frame, index) => {
    lines.push(`frame ${index + 4} "${frame.label}" {`);
    lines.push(...etherFlowLines(rigFit, (index % 3) + 1, '  '));
    for (const partId of orderedPartIds) {
      const shifted = shiftCells(bodyPartMap.get(partId), frame.dx || 0, frame.dy || 0, canvas);
      if (!shifted.length) continue;
      emitBodyPart(partId, shifted, '  ');
    }
    lines.push('}');
    lines.push('');
  });

  lines.push('export json svg phaser png');
  lines.push('');
  return { source: lines.join('\n'), rigFit, canvas };
}