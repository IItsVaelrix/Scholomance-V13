const fs = require('fs');

const arena = fs.readFileSync('src/phaser/CombatArenaScene.js', 'utf8');
const polaris = fs.readFileSync('src/phaser/PolarisForestScene.js', 'utf8');

// We need to grab imports: ITEM_DATABASE, equipSlotOf, ARM_RIG, applyWeaponPresentationRules
// and then the rig initialization, handleEquipmentChange, syncHandWeaponPresentation, applyPlayerFlipX
