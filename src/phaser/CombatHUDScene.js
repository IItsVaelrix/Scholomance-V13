/**
 * CombatHUDScene — Phaser UI layer overlay for the full-screen VOID dungeon arena (Godot).
 *
 * Godot renders the immersive free-roam dungeon world (shader + props + units) full-screen as the background canvas.
 * This Phaser scene draws on a transparent overlay canvas on top, providing the classic MMORPG HUD.
 *
 * Layout (most of screen = the Godot world view):
 * - Bottom: Hotbar (abilities with cooldowns, using VOID palette).
 * - Top-left: Player frame (portrait + HP/mana bars).
 * - Top (or top-right of player): Target frame (when selected).
 * - Top-right: Minimap.
 * - Bottom-left or floating: Compact combat log.
 * - Center-bottom: Cast bar (when channeling).
 *
 * Communication: Via the same CombatBridge WS relay as Godot (ws://127.0.0.1:3001 or your server).
 * - Receive: state patches (player pos for minimap, unit health, ability cooldowns, events).
 * - Send: real-time inputs (movement vectors, ability casts with targets).
 *
 * Theme with the VOID dungeon palette: purple (#4A2C6A), crimson (#8B1E3D), obsidian (#11111A), indigo (#2E2A5A), silver (#A8A8B8).
 * Use semi-transparent frames so the beautiful Godot dungeon shows through.
 *
 * IMPORTANT: Import Phaser explicitly because this is an ES module.
 *
 * Usage (in your main Phaser game or React-wrapped Phaser):
 * import Phaser from 'phaser';
 * import CombatHUDScene from './src/phaser/CombatHUDScene.js';
 *
 * const game = new Phaser.Game({
 *   type: Phaser.AUTO,
 *   canvas: document.getElementById('phaser-hud'),
 *   width: window.innerWidth,
 *   height: window.innerHeight,
 *   transparent: true,
 *   scene: [CombatHUDScene]
 * });
 *
 * Make the Godot canvas position: absolute; z-index: 1; width/height: 100%.
 * Phaser canvas: position: absolute; z-index: 2; pointer-events: auto for HUD.
 */

// Support both:
// - Real Vite-bundled app: import Phaser normally (uncomment the line below when using in your main app)
// (import removed to support static demo loading; use window.Phaser from CDN in combat.html)
//
// - Static demo (public/combat.html): relies on the global from the CDN <script> tag.
//   This avoids bare specifier errors in native browser modules.

const Phaser = (typeof window !== 'undefined' && window.Phaser)
  ? window.Phaser
  : null;

if (!Phaser || !Phaser.Scene) {
  // This will only happen in the static demo if the CDN script tag is missing or after the module.
  // In a real app, replace the above with the import and remove this check.
  throw new Error(
    'Phaser not found as global. ' +
    'For the combat.html demo, make sure the Phaser CDN script is loaded before this module. ' +
    'For production use inside Vite, import Phaser from "phaser" at the top of this file instead.'
  );
}

export default class CombatHUDScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatHUDScene' });
    this.bridge = null; // WebSocket or your bridge instance
    this.playerHealth = 100;
    this.playerMaxHealth = 100;
    this.targetHealth = 0;
    this.targetMaxHealth = 100;
    this.targetName = '';
    this.cooldowns = {}; // { abilityId: { remaining: 0, total: 5 } }
    this.logMessages = [];
    this.minimapGraphics = null;
    this.hotbarSlots = [];
  }

  preload() {
    // === PixelBrain generated arcane/futuristic HUD assets (Futuristic/Arcane mysticism) ===
    // Generated with the new ui.* profiles using VOID palette + harmonic proportions.
    // Copy the PNGs from output/foundry/void-ui-hud/ to public/assets/
    // (or wherever your asset base is).

    this.load.image('player_portrait', 'assets/icy_holy_fire_chestplate.png'); // from previous generation

    // The new PixelBrain UI pieces (scaffolded for hotbar, chat, minimap, indicators)
    this.load.image('hud_hotbar', 'assets/void_hud_hotbar.png');
    this.load.image('hud_slot', 'assets/void_hud_slot.png');
    this.load.image('hud_minimap_border', 'assets/void_hud_minimap_border.png');
    this.load.image('hud_chatbox', 'assets/void_hud_chatbox.png');
    this.load.image('hud_player_indicator', 'assets/void_hud_player_indicator.png');
    this.load.image('hud_enemy_indicator', 'assets/void_hud_enemy_indicator.png');

    // These have built-in glow/rune layers for "breathing".
  }

  create() {
    const { width, height } = this.scale;

    // Connect to the same bridge/relay as Godot (real-time state + inputs for free-roam).
    this.connectBridge();

    // === FUTURISTIC/ARCANE PIXELBRAIN HUD ===
    // All elements are PixelBrain-generated (arcane frames with runes, glows, harmonic proportions).
    // They "breathe" via subtle Phaser tweens (scale pulse, alpha on glows) synced to a mystical resonance.
    // Palette: obsidian/indigo/purple bases, silver runes, crimson energy.
    // Positioned in thin frames around the large central dungeon arena view.

    const hudAlpha = 0.92;
    const breatheSpeed = 1400; // ms for one breath cycle
    const abilities = ['1', '2', '3', '4', '5', 'Q', 'W', 'E', 'R', 'F'];

    // --- BOTTOM HOTBAR ---
    const hotbarHeight = 82;
    const hotbarY = height - hotbarHeight - 6;
    const hotbar = this.add.image(width / 2, hotbarY + hotbarHeight / 2, 'hud_hotbar');
    hotbar.setAlpha(hudAlpha);
    hotbar.setDisplaySize(Math.min(820, width * 0.85), hotbarHeight); // Scale to fit, keep pixel crisp

    // 10 slots composited on the bar
    const slotSize = 52;
    const slotSpacing = 6;
    const startX = (width - (10 * slotSize + 9 * slotSpacing)) / 2;

    this.hotbarSlots = [];

    for (let i = 0; i < 10; i++) {
      const x = startX + i * (slotSize + slotSpacing);
      const y = hotbarY + 13;

      const slot = this.add.image(x + slotSize / 2, y + slotSize / 2, 'hud_slot');
      slot.setDisplaySize(slotSize, slotSize);
      slot.setAlpha(hudAlpha);

      // Key label (small, silver)
      this.add.text(x + 6, y + 4, abilities[i], {
        fontSize: '11px',
        color: '#A8A8B8',
        fontFamily: 'monospace'
      });

      // Icon placeholder (will be ability icon from PixelBrain later)
      const icon = this.add.rectangle(x + 8, y + 16, slotSize - 16, 22, 0x4A2C6A, 0.6);

      // Cooldown (crimson pulse overlay)
      const cooldown = this.add.rectangle(x + 8, y + 16, slotSize - 16, 22, 0x8B1E3D, 0.8);
      cooldown.visible = false;

      this.hotbarSlots.push({ slot, icon, cooldown, key: abilities[i] });

      const zone = this.add.zone(x, y, slotSize, slotSize).setOrigin(0);
      zone.setInteractive();
      zone.on('pointerdown', () => this.castAbility(i));
    }

    // Breathing on hotbar
    this.tweens.add({
      targets: hotbar,
      scaleX: 1.015,
      scaleY: 1.015,
      duration: breatheSpeed,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // --- TOP PLAYER INDICATOR (left) ---
    const playerY = 22;
    const playerFrame = this.add.image(90, playerY + 30, 'hud_player_indicator');
    playerFrame.setDisplaySize(68, 68);
    playerFrame.setAlpha(hudAlpha);

    // Portrait inside (the Icy Holy Fire one)
    const portrait = this.add.image(90, playerY + 30, 'player_portrait');
    portrait.setDisplaySize(42, 42);

    // Simple status text (can be replaced with bars)
    this.playerHealthText = this.add.text(140, playerY + 8, 'HP 100%', {
      fontSize: '13px',
      color: '#A8A8B8',
      fontFamily: 'monospace'
    });
    this.add.text(140, playerY + 26, 'RES 87%', {
      fontSize: '11px',
      color: '#6B35B8' // purple accent
    });

    // Breathing on player frame
    this.tweens.add({
      targets: [playerFrame, portrait],
      scaleX: 1.01,
      scaleY: 1.01,
      duration: breatheSpeed * 1.2,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // --- TOP TARGET / ENEMY INDICATOR ---
    this.targetFrame = this.add.image(320, playerY + 30, 'hud_enemy_indicator');
    this.targetFrame.setDisplaySize(44, 44);
    this.targetFrame.setAlpha(0.9);
    this.targetFrame.visible = false;

    this.targetNameText = this.add.text(355, playerY + 8, '', {
      fontSize: '13px',
      color: '#8B1E3D',
      fontFamily: 'monospace'
    });
    this.targetHealthText = this.add.text(355, playerY + 26, '', {
      fontSize: '11px',
      color: '#A8A8B8'
    });

    // Breathing on enemy indicator when visible
    this.enemyBreatheTween = this.tweens.add({
      targets: this.targetFrame,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      paused: true
    });

    // --- MINIMAP (top-right, arcane border) ---
    const minimapSize = 168;
    const minimapX = width - minimapSize - 18;
    const minimapY = 18;

    const minimapBorder = this.add.image(minimapX + minimapSize / 2, minimapY + minimapSize / 2, 'hud_minimap_border');
    minimapBorder.setDisplaySize(minimapSize, minimapSize);
    minimapBorder.setAlpha(hudAlpha);

    // Inner map area (for now a dark rect; later a mini render or generated map texture)
    this.minimapInner = this.add.rectangle(minimapX + 14, minimapY + 14, minimapSize - 28, minimapSize - 28, 0x11111A, 0.6).setOrigin(0);

    this.minimapGraphics = this.add.graphics();
    this.minimapGraphics.setPosition(minimapX + 14, minimapY + 14);

    // Breathing on minimap border
    this.tweens.add({
      targets: minimapBorder,
      scaleX: 1.012,
      scaleY: 1.012,
      duration: breatheSpeed * 0.9,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // --- CHATBOX (bottom-left mystical window) ---
    const chatW = 310;
    const chatH = 138;
    const chatX = 16;
    const chatY = height - chatH - 12;

    const chatFrame = this.add.image(chatX + chatW / 2, chatY + chatH / 2, 'hud_chatbox');
    chatFrame.setDisplaySize(chatW, chatH);
    chatFrame.setAlpha(0.88);

    // Log text inside the frame
    this.logText = this.add.text(chatX + 12, chatY + 10, '', {
      fontSize: '10px',
      color: '#A8A8B8',
      fontFamily: 'monospace',
      wordWrap: { width: chatW - 24 }
    });

    this.addLogMessage('VOID ARENA. THE DUNGEON BREATHES.');
    this.addLogMessage('FREE ROAM ENGAGED. RESONANCE STABLE.');

    // Breathing on chatbox
    this.tweens.add({
      targets: chatFrame,
      scaleX: 1.008,
      scaleY: 1.008,
      duration: breatheSpeed * 1.4,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Keyboard hotbar support (real-time free-roam abilities)
    this.input.keyboard.on('keydown', (event) => {
      const key = event.key.toUpperCase();
      const idx = abilities.indexOf(key);
      if (idx !== -1) this.castAbility(idx);
    });

    // Resize handler
    this.scale.on('resize', this.resizeHUD, this);

    // Global breathing resonance (syncs all HUD elements to the mystical "breath" of the realm).
    // In full setup, drive this from Godot's resonance uniform via bridge for perfect sync with the dungeon shader.
    this.resonance = 0.6;
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        this.resonance = 0.5 + Math.sin(Date.now() / 1800) * 0.2; // slow organic pulse
      }
    });
  }

  resizeHUD(gameSize) {
    const { width, height } = gameSize;
    // Reposition elements on resize (keep relative to edges)
    // Bottom hotbar stays at bottom, etc. (Phaser handles via anchors or manual in update).
  }

  connectBridge() {
    // Connect to the same relay as Godot (ws://127.0.0.1:3001 or your combat relay).
    // This is the wiring — Godot <-> relay <-> Phaser.
    // Both the Godot arena and this Phaser HUD talk to the same WS endpoint.
    this.bridge = new WebSocket('ws://127.0.0.1:3001');

    this.bridge.onopen = () => {
      this.bridge.send(JSON.stringify({ type: 'HELLO', role: 'phaser_ui' }));
      this.addLogMessage('CONNECTED TO VOID RELAY.');
    };

    this.bridge.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        this.handleBridgePacket(packet);
      } catch (e) {
        console.warn('Bad packet from relay', event.data);
      }
    };

    this.bridge.onerror = () => {
      this.addLogMessage('RELAY ERROR — FALLING BACK TO SIM.');
      // For demo / standalone testing: simulate state so the HUD is visible.
      this.simulateStateUpdates();
    };

    this.bridge.onclose = () => {
      this.addLogMessage('RELAY DISCONNECTED.');
    };
  }

  handleBridgePacket(packet) {
    if (packet.type === 'COMBAT_STATE_PATCH' || packet.type === 'STATE_UPDATE') {
      const state = packet.state || packet;

      // Live player health (for top frame)
      if (state.playerHealth !== undefined) {
        this.playerHealth = state.playerHealth;
        this.playerMaxHealth = state.playerMaxHealth || 100;
        this.updatePlayerFrame();
      }

      // Target info
      if (state.target) {
        this.targetName = state.target.name || 'VOID WRAITH';
        this.targetHealth = state.target.health || 0;
        this.targetMaxHealth = state.target.maxHealth || 100;
        this.targetFrame.visible = this.targetHealth > 0;
        this.updateTargetFrame();
      }

      // Cooldowns for hotbar (real-time from Godot simulation)
      if (state.cooldowns) {
        this.cooldowns = state.cooldowns;
        this.updateHotbarCooldowns();
      }

      // Minimap data (player + enemy positions from free-roam state)
      if (state.minimap) {
        this.updateMinimap(state.minimap);
      }

      // Live log events
      if (state.events) {
        state.events.forEach(e => this.addLogMessage(e));
      }
    }

    if (packet.type === 'COMBAT_INIT') {
      this.addLogMessage('ARENA INITIALIZED. ENGAGE.');
    }
  }

  // Demo simulation when no relay (for testing the HUD alone).
  // Uses a deterministic mulberry32 PRNG seeded from a stable label so the
  // demo replays identically across runs (Vaelrix Law: Determinism forbids
  // Math.random in non-deterministic contexts).
  simulateStateUpdates() {
    const demoSeed = 'combat-hud-demo';
    let demoState = 1;
    for (let i = 0; i < demoSeed.length; i += 1) {
      demoState = ((demoState * 31) + demoSeed.charCodeAt(i)) | 0;
    }
    const next = () => {
      demoState = (demoState + 0x6D2B79F5) | 0;
      let t = demoState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
    };
    setInterval(() => {
      this.playerHealth = Math.max(20, this.playerHealth - next() * 3);
      this.updatePlayerFrame();

      // Fake target
      if (next() > 0.7) {
        this.targetHealth = Math.max(0, 80 - next() * 10);
        this.updateTargetFrame();
      }

      // Fake cooldowns
      Object.keys(this.cooldowns).forEach(id => {
        if (this.cooldowns[id].remaining > 0) this.cooldowns[id].remaining -= 0.5;
      });
      this.updateHotbarCooldowns();

      // Fake minimap
      this.updateMinimap({
        player: { x: 0.5, y: 0.5 },
        enemies: [{ x: 0.3 + next() * 0.4, y: 0.3 + next() * 0.4 }]
      });
    }, 800);
  }

  updatePlayerFrame() {
    if (!this.playerHealthText) return;
    this.playerHealthText.setText(`HP ${Math.floor(this.playerHealth)}%`);
    // For breathing effect on portrait when health low, etc.
  }

  updateTargetFrame() {
    if (!this.targetFrame || !this.targetNameText || !this.targetHealthText) return;
    if (this.targetHealth <= 0) {
      this.targetFrame.visible = false;
      return;
    }
    this.targetFrame.visible = true;
    this.targetNameText.setText(this.targetName.toUpperCase());
    this.targetHealthText.setText(`HP ${Math.floor(this.targetHealth)}%`);
  }

  updateHotbarCooldowns() {
    this.hotbarSlots.forEach((slotData, index) => {
      const cd = this.cooldowns[index] || { remaining: 0, total: 5 };
      const cooldown = slotData.cooldown;
      if (cd.remaining > 0) {
        cooldown.visible = true;
        const pct = cd.remaining / cd.total;
        cooldown.width = (slotData.icon ? slotData.icon.width : 48) * (1 - pct);
      } else {
        cooldown.visible = false;
      }
    });
  }

  updateMinimap(data) {
    if (!this.minimapGraphics) return;
    this.minimapGraphics.clear();

    const size = 180;
    // Background
    this.minimapGraphics.fillStyle(0x11111A, 0.6);
    this.minimapGraphics.fillRect(0, 0, size, size);

    // Border
    this.minimapGraphics.lineStyle(2, 0xA8A8B8);
    this.minimapGraphics.strokeRect(0, 0, size, size);

    // Player dot (silver)
    if (data.player) {
      const px = data.player.x * size;
      const py = data.player.y * size;
      this.minimapGraphics.fillStyle(0xA8A8B8);
      this.minimapGraphics.fillCircle(px, py, 5);
    }

    // Enemies (crimson dots)
    if (data.enemies) {
      this.minimapGraphics.fillStyle(0x8B1E3D);
      data.enemies.forEach(e => {
        const ex = e.x * size;
        const ey = e.y * size;
        this.minimapGraphics.fillCircle(ex, ey, 4);
      });
    }

    // Simple dungeon outline (purple)
    this.minimapGraphics.lineStyle(1, 0x4A2C6A);
    this.minimapGraphics.strokeRect(10, 10, size - 20, size - 20);
  }

  castAbility(slotIndex) {
    const abilityId = `ability_${slotIndex}`;
    // Send to Godot via bridge (real-time cast in free-roam).
    if (this.bridge && this.bridge.readyState === WebSocket.OPEN) {
      this.bridge.send(JSON.stringify({
        type: 'COMBAT_COMMAND',
        command: `CAST ${abilityId}`,
        source: 'phaser_hotbar',
        // For targeted: include mouse world pos if aiming
      }));
    } else {
      console.log(`[DEMO] Cast ability ${slotIndex} (no relay)`);
    }

    // Local cooldown demo
    this.cooldowns[slotIndex] = { remaining: 4.5, total: 4.5 };
    this.updateHotbarCooldowns();

    this.addLogMessage(`CAST ABILITY ${slotIndex}`);
  }

  addLogMessage(msg) {
    this.logMessages.push(msg.toUpperCase());
    if (this.logMessages.length > 6) this.logMessages.shift();
    this.logText.setText(this.logMessages.join('\n'));
  }

  update(time, delta) {
    // Update cooldowns live
    Object.keys(this.cooldowns).forEach(key => {
      if (this.cooldowns[key].remaining > 0) {
        this.cooldowns[key].remaining = Math.max(0, this.cooldowns[key].remaining - delta / 1000);
      }
    });
    this.updateHotbarCooldowns();
  }
}