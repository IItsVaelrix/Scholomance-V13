const fs = require('fs');

const arena = fs.readFileSync('src/phaser/CombatArenaScene.js', 'utf8');
let polaris = fs.readFileSync('src/phaser/PolarisForestScene.js', 'utf8');

// 1. Add imports
const imports = `import { ITEM_DATABASE } from '../data/itemDatabase.js';
import { equipSlotOf } from '../game/inventory/equipment.js';
import { ARM_RIG } from '../game/combat/armRig.js';
import { applyWeaponPresentationRules } from '../game/combat/heldItemPresentation.js';
`;
polaris = polaris.replace('import { getReachableTiles, findPath }', imports + 'import { getReachableTiles, findPath }');
polaris = polaris.replace('const WALK_FRAME_COUNT = 8;', 'const WALK_FRAME_COUNT = 8;\nconst FEET_ORIGIN_Y = 112 / 128;');

// 2. Extract methods
const getMethod = (name) => {
  const start = arena.indexOf(`${name}(`);
  if (start === -1) {
    const startArrow = arena.indexOf(`${name} = (`);
    if (startArrow === -1) throw new Error(`Method ${name} not found`);
    let brackets = 0;
    let end = startArrow;
    let started = false;
    while (end < arena.length) {
      if (arena[end] === '{') { started = true; brackets++; }
      if (arena[end] === '}') { brackets--; if (started && brackets === 0) break; }
      end++;
    }
    return arena.substring(startArrow, end + 1);
  } else {
    let brackets = 0;
    let end = start;
    let started = false;
    while (end < arena.length) {
      if (arena[end] === '{') { started = true; brackets++; }
      if (arena[end] === '}') { brackets--; if (started && brackets === 0) break; }
      end++;
    }
    return arena.substring(start, end + 1);
  }
};

const applyFlipX = getMethod('applyPlayerFlipX');
const handleEquipment = getMethod('handleEquipmentChange');
const syncWeapon = getMethod('syncHandWeaponPresentation');
const ensureAnim = getMethod('ensureHandItemIdleAnimation');

const methodsStr = `\n    ${applyFlipX}\n\n    ${handleEquipment}\n\n    ${syncWeapon}\n\n    ${ensureAnim}\n`;
polaris = polaris.replace('    setupPlayer(tx, ty, plateauZ, toIso) {', methodsStr + '    setupPlayer(tx, ty, plateauZ, toIso) {');

fs.writeFileSync('src/phaser/PolarisForestScene.js', polaris);
console.log('Patch 1 applied');
