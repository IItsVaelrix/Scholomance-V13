const fs = require('fs');

let polaris = fs.readFileSync('src/phaser/PolarisForestScene.js', 'utf8');

// Find start
const startIdx = polaris.indexOf('    applyPlayerFlipX(flipX) {');
// Find end
const endIdx = polaris.indexOf('    setupInput() {');

if (startIdx === -1 || endIdx === -1) {
    console.log("Could not find start or end index.");
    process.exit(1);
}

const replacement = `    handleEquipmentChange = (event) => {
      const equipment = event.detail || {};
      if (!this.playerArmorLayers) return;
      
      const armorMap = {
        head: this.playerArmorLayers.head,
        chest: this.playerArmorLayers.chest,
        legs: this.playerArmorLayers.legs,
        boots: this.playerArmorLayers.boots,
      };
      
      for (const [slot, sprite] of Object.entries(armorMap)) {
        if (!sprite) continue;
        const item = equipment[slot];
        const frame0Id = item ? \`\${item.assetId}-f0\` : null;
        if (frame0Id && this.textures.exists(frame0Id)) {
          sprite.setTexture(frame0Id);
          sprite.setVisible(true);
        } else {
          sprite.setVisible(false);
        }
      }
    };

    setupPlayer(tx, ty, plateauZ, toIso) {
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
      playerImg.setInteractive({ useHandCursor: true, pixelPerfect: false });
      playerImg.on('pointerdown', (pointer) => {
        if (pointer.button === 0) this.toggleMovementArmed();
      });
      playerContainer.add(playerImg);

      const armorLayers = {
        chest: this.add.sprite(0, -60, 'ideal-human-f0').setOrigin(0.5, 0.5).setVisible(false).setScale(0.8),
        legs: this.add.sprite(0, -60, 'ideal-human-f0').setOrigin(0.5, 0.5).setVisible(false).setScale(0.8),
        boots: this.add.sprite(0, -60, 'ideal-human-f0').setOrigin(0.5, 0.5).setVisible(false).setScale(0.8),
        head: this.add.sprite(0, -60, 'ideal-human-f0').setOrigin(0.5, 0.5).setVisible(false).setScale(0.8),
      };
      playerContainer.add(armorLayers.chest);
      playerContainer.add(armorLayers.legs);
      playerContainer.add(armorLayers.boots);
      playerContainer.add(armorLayers.head);

      this.playerContainer = playerContainer;
      this.playerImg = playerImg;
      this.playerArmorLayers = armorLayers;
      this.playerGridPos = { tx, ty };

      this.stats = new CombatStatController();
      this.stats.registerEntity('player', {
        tx,
        ty,
        overrides: { movementPoints: COMBAT_FREE_ROAM_MOVEMENT_RANGE },
      });
      playerContainer.setDepth(playerPos.y + 1);

      window.addEventListener('equipment-changed', this.handleEquipmentChange);
      window.dispatchEvent(new CustomEvent('request-equipment-state'));
    }

`;

polaris = polaris.substring(0, startIdx) + replacement + polaris.substring(endIdx);
fs.writeFileSync('src/phaser/PolarisForestScene.js', polaris);
console.log("Fixed!");
