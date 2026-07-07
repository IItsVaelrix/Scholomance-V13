const fs = require('fs');

const arena = fs.readFileSync('src/phaser/CombatArenaScene.js', 'utf8');
let polaris = fs.readFileSync('src/phaser/PolarisForestScene.js', 'utf8');

const setupCodeStart = arena.indexOf('      // Spawn the new IdealHuman character model');
const setupCodeEnd = arena.indexOf('      this.stats = new CombatStatController();');
if (setupCodeStart === -1 || setupCodeEnd === -1) throw new Error('Could not find setup code');

let setupCode = arena.substring(setupCodeStart, setupCodeEnd);
// Replace `const playerPos = toIso(4, 6);` with `const playerPos = toIso(tx, ty);`
setupCode = setupCode.replace('const playerPos = toIso(4, 6);', 'const playerPos = toIso(tx, ty);');
setupCode = setupCode.replace('this.playerGridPos = { tx: 4, ty: 6 };', 'this.playerGridPos = { tx, ty };');
// Remove `this.draw3DGrid` or anything before `const playerPos`
const idx = setupCode.indexOf('const playerPos = toIso(tx, ty);');
setupCode = setupCode.substring(idx);

// Remove keyboard input as PolarisForestScene handles its own input / movement armed logic
// The setupCode contains:
// this.cursors = this.input.keyboard.createCursorKeys();
// this.input.keyboard.on('keydown', this.handleGlobalKeydown);
setupCode = setupCode.replace("this.cursors = this.input.keyboard.createCursorKeys();", "");
setupCode = setupCode.replace("this.input.keyboard.on('keydown', this.handleGlobalKeydown);", "");

// The setup code contains `this.getIsoTarget = ...` which we don't want to redefine if Polaris already does it, but Polaris might need the `plateauZ` closure. 
// Polaris already has it defined elsewhere or we can let it redefine.
// Let's remove `this.getIsoTarget` definition to be safe.
const isoTargetStart = setupCode.indexOf('// Helper to compute grid to screen position');
if (isoTargetStart !== -1) {
  setupCode = setupCode.substring(0, isoTargetStart);
}

// Ensure the pointerdown toggles movement armed
// setupCode contains: `playerImg.on('pointerdown', (pointer) => { if (pointer.button === 0) this.toggleMovementArmed(); });`
// Which is exactly what we want!

const targetStartStr = `    setupPlayer(tx, ty, plateauZ, toIso) {
      const playerPos = toIso(tx, ty);
      const playerContainer = this.add.container(playerPos.x, playerPos.y - plateauZ);

      const hitArea = this.add.rectangle(0, -20, 40, 80, 0xffffff, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', (pointer) => {
        if (pointer.button === 0) this.toggleMovementArmed();
      });
      playerContainer.add(hitArea);

      const playerImg = this.add.image(0, -60, 'ideal-human-f0');
      playerImg.setOrigin(0.5, 0.5);
      playerImg.setScale(0.8);
      playerContainer.add(playerImg);

      this.playerContainer = playerContainer;
      this.playerImg = playerImg;`;

// We replace the old setup logic with the new setup logic.
const replaceIdx = polaris.indexOf('    setupPlayer(tx, ty, plateauZ, toIso) {');
if (replaceIdx === -1) throw new Error('Could not find setupPlayer in polaris');
const replaceEndIdx = polaris.indexOf('this.playerGridPos = { tx, ty };', replaceIdx);

polaris = polaris.substring(0, replaceIdx) + '    setupPlayer(tx, ty, plateauZ, toIso) {\n' + setupCode + polaris.substring(replaceEndIdx);

// Also need to set playerContainer depth correctly inside the new setupPlayer:
// `playerContainer.setDepth(playerPos.y + 1);`
polaris = polaris.replace('playerContainer.setDepth(25);', 'playerContainer.setDepth(playerPos.y + 1);');

fs.writeFileSync('src/phaser/PolarisForestScene.js', polaris);
console.log('Patch 2 applied');
