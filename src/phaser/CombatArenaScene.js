import { generateBattleLeylines } from '../../codex/core/leyline.engine.js';
import { processorBridge } from '../../codex/core/shared/processor-bridge.js';
import { ITEM_DATABASE } from '../data/itemDatabase.js';
import { combat_leylineUri } from '../pages/Combat/assets/generated/combat-leyline.js';
import { CombatStatController } from '../game/combat/combatStatController.js';
import { getRotationAtTime, getTimeForRotation } from '../../codex/core/pixelbrain/gear-glide-amp.js';
import { resolveEnchant } from '../game/combat/enchantResolver.js';
import { analyzeText } from '../../codex/core/analysis.pipeline.js';
import { createCombatScoringEngine } from '../../codex/core/scoring.defaults.js';
import { normalizeCombatScore } from '../../codex/core/combat.scoring.js';
import { resolveObeliskPuzzle } from '../../codex/core/obelisk-puzzle.resolver.js';
import {
  OBELISK_DISCOVERY_FLASH_XP,
  STORMHEART_ORB_ITEM_ID,
} from '../../codex/core/obelisk-puzzle.signals.js';
import { grantItem, hasItem } from '../game/inventory/inventoryService.js';
import { resolveCombatLootGrant } from '../game/combat/combatLootDrops.js';
import { planCombatChestDrop } from '../game/combat/combatLootChest.js';
import {
  getLootChestOpenAnimKey,
  preloadLootChestTextures,
  registerLootChestAnimations,
} from '../game/combat/lootChestVisuals.js';
import { getScholomanceCombatBlock, grantScholomanceXpForAction } from '../game/character/scholomanceXpService.js';
import { buildCompendiumRuntimeContext } from '../game/combat/spellweaveCompendium.persistence.js';
import { SCHOLOMANCE_XP_ACTIONS } from '../../codex/core/scholomance-xp.schema.js';
import { matchElement } from '../data/combatElementDatabase.js';
import { ARM_RIG, getPose } from '../data/armRigConfig.js';
import { solveArm, gripWorld, anchorWorld } from '../game/combat/armRig.js';
import { equipSlotOf } from '../data/itemDatabase.js';
import { getHoldPresentation } from '../game/combat/heldItemPresentation.js';
import {
  buildBlockedSet,
  DEFAULT_BLOCKED_TILES,
  findPath,
  getReachableTiles,
  tileKey,
} from '../game/combat/combatPathfinding.js';
import { ARENA_SORT_LAYER, getGridSortDepth } from '../game/combat/arenaDepthSorting.js';
import { queueIsoTileTextures } from './isoTileTextures.js';
import {
  areAllSentinelsDefeated,
  buildSentinelBlockedTiles,
  buildSentinelSceneTargets,
  getAggroableSentinels,
  getSentinelAtTile as findSentinelAtTile,
  shouldEngageCombatBattle,
  getSentinelDefinition,
  isSentinelId,
  SENTINEL_ROBOTS,
  getSentinelCombatOverrides,
  SENTINEL_STAT_DEFAULTS,
} from '../game/combat/sentinelRobots.js';
import { applyIceBiome, resolveVoxelPaletteBand } from '../game/combat/arenaBiomeTransform.js';
import {
  PORTAL_PHASE,
  PORTAL_TILE,
  PORTAL_WARDEN_ID,
} from '../game/combat/portalPhase.js';
import { POLARIS_FOREST_MAP_ID } from '../game/world/worldMapRegistry.js';
import {
  applyVoidAcolyteHitDamage,
  createVoidAcolyteAbilityState,
  planVoidAcolyteAttack,
  resolveVoidAcolyteAbility,
  tickVoidAcolyteAbilityState,
} from '../game/combat/voidAcolyteCombatAbilities.js';
import {
  emitVoidAcolyteSpellCast,
  emitVoidAcolyteSpellHit,
  isVoidAcolyteIceSpell,
  isVoidAcolyteVoidSpell,
} from '../game/combat/voidAcolyteSpellAudio.js';
import { playIcicleBlastVfx, playVoidAcolyteSpellVfx } from '../game/combat/void1BossSpellVfx.js';
import { aggregateEquipmentBonuses } from '../game/combat/equipmentCombatBonuses.js';
import {
  applyPlayerIcicleSlamHit,
  ICICLE_SLAM_AP_COST,
  resolvePlayerIcicleSlam,
} from '../game/combat/iceSlimeStaffAbilities.js';
import { getEffectiveScholomance } from '../game/combat/scholomanceStats.js';
import {
  getPortalWardenDuelLayout,
  getVoidAcolyteSpawnTile,
  isPortalWardenId,
  VOID_ACOLYTE_STAT_DEFAULTS,
} from '../game/combat/voidAcolyteRobots.js';
import {
  createVoid1WardenSprite,
  playVoid1SpriteAnim,
  pickVoid1StrikeAnim,
  preloadVoid1Textures,
  registerVoid1Animations,
  VOID1_ANIM,
  void1StrikeDelayMs,
} from '../game/combat/void1CombatVisuals.js';
import { VOID1_BOSS_SUBTITLE } from '../data/void1Animations.js';
import { createCombatSessionTelemetry } from '../game/combat/combatSessionTelemetry.js';
import {
  COMBAT_BATTLE_ENDED_EVENT,
  COMBAT_BATTLE_STARTED_EVENT,
  COMBAT_FREE_ROAM_MOVEMENT_RANGE,
  consumeCombatBattleStarted,
} from '../game/combat/combatBattleIntro.js';
import { getGameVictoryService } from '../lib/audio/gameVictory.service.js';
import { buildInspectPresentation } from '../game/combat/combatInspectCopy.js';
import {
  DEFEATED_ENEMY_DISAPPEAR_MS,
  destroyPortalWardenEffect,
  destroySentinelTorchEffect,
} from '../game/combat/defeatedEnemyCleanup.js';
import { COMBAT_MUSIC_REGION, setCombatMusicRegion } from '../game/combat/combatMusicRegion.js';
import { parseWeave } from '../../codex/core/spellweave.engine.js';
import {
  cycleCombatTargetId,
  listTargetableCombatants,
  mergeSelectedCombatTarget,
} from '../game/combat/combatTargetSelection.js';
import { enrichScoreWithTacticalBoard, resolveCombatCastScore } from '../game/combat/combatCastScoring.js';
import { compileArenaBattleBoard } from '../game/combat/tacticalBoardMapAdapter.js';
import {
  clearActiveBattleBoard,
  getActiveBattleBoard,
  setActiveBattleBoard,
} from '../game/combat/tacticalBoardSession.js';
import {
  computeThreatMap,
  getMovementRange,
  getSpellRange,
  getVisibleTiles,
} from '../../codex/core/combat/tactical-board.threat-map.js';
import { syncBattleBoardFromLiveStats, resolveThreatEntityLabels } from '../game/combat/tacticalBoardLiveSync.js';
import { getReverseTransitionTimeline } from './battle-transition.fx.js';
import { bindActiveSceneContextRequest } from './combatSceneShared.js';
import { BATTLE_TERRAIN_TYPES } from '../../codex/core/combat/tactical-board.tiles.js';
import { SPELL_CAST_AP_COST } from '../game/combat/combatMana.js';
import { driveEnemyTurn } from '../game/combat/ai/enemyCombatDriver.js';
import {
  applySentinelBurnDebuff,
  createSentinelAbilityState,
  notePlayerSpellCastOnSentinels,
  planSentinelAttack,
  resolveSentinelAbilityDamage,
  tickPlayerCombatStatuses,
  tickSentinelAbilityState,
} from '../game/combat/sentinelCombatAbilities.js';
import {
  buildBestiaryRuntimeContext,
  buildCombatDefenderProfile,
  hasCombatBestiaryEntry,
} from '../game/combat/bestiary/index.js';
import {
  extractParsedClauses,
  resolveWeaveTargetsFromParsed,
} from '../game/combat/weave-scene-targets.js';
import { pickBestCandidate } from '../../codex/core/pixelbrain/iso-cell-picker.js';
import {
  applyCombatGatherIntent,
  buildReachableLatticeKeys,
  combatGridToLattice,
  createCombatLatticeAuthority,
  getPlayerLatticePosition,
  heightmapToCombatCoord,
  islandVoxelToLattice,
  isPlayerLatticePick,
  latticeCellKey,
  registerCombatGridCell,
  registerGatherableCell,
  validateCombatGatherIntent,
} from '../game/combat/combatLatticeAuthority.js';
import { getGameAudioForgeService } from '../lib/audio/gameAudioForge.service.js';
import { getGameBackgroundMusicService } from '../lib/audio/gameBackgroundMusic.service.js';
import { getGameObeliskElectricService } from '../lib/audio/gameObeliskElectric.service.js';
import { getGameBrazierFireService } from '../lib/audio/gameBrazierFire.service.js';
import { getGameFireballImpactService } from '../lib/audio/gameFireballImpact.service.js';
import { getGameIceSpellImpactService } from '../lib/audio/gameIceSpellImpact.service.js';
import { getGameSwordSliceService } from '../lib/audio/gameSwordSlice.service.js';
import { getGameChestUnlockService } from '../lib/audio/gameChestUnlock.service.js';
import {
  GAME_BACKGROUND_MUSIC_PACING,
  GAME_OBELISK_MUSIC_SYNC,
} from '../lib/audio/gameBackgroundMusic.config.js';
import {
  bpmBobOffset,
  bpmBobShadow,
  findSnareCrossings,
  isDischargeSnareHit,
  isLastChargeSnare,
  resolveMusicBeatSnapshot,
  snaresPerDischargeCycle,
} from '../lib/audio/gameMusicBeatClock.js';

const PALETTES = {
  voidsteel: { shine: 0x4a5a7a, lit: 0x2a3a5a, core: 0x1a2a4a, rim: 0x0a1020, shadow: 0x050510 },
  void_ice: { shine: 0x88bbdd, lit: 0x447799, core: 0x224466, rim: 0x112233, shadow: 0x08111a },
  obsidian: { shine: 0x332244, lit: 0x221133, core: 0x110022, rim: 0x0a0011, shadow: 0x05000a },
  amethyst: { shine: 0xffaaff, lit: 0xcc55ff, core: 0x8800bb, rim: 0x440077, shadow: 0x220044 },
  cyan_glow: { shine: 0x00ffff, lit: 0x0088cc, core: 0x004488, rim: 0x002244, shadow: 0x001122 },
  sonic_moss: { shine: 0x55ccaa, lit: 0x338866, core: 0x1a4a44, rim: 0x0f2a28, shadow: 0x081816 },
  sonic_bark: { shine: 0xc8b888, lit: 0x9a8055, core: 0x6a5030, rim: 0x3a2818, shadow: 0x1a1008 },
  royal_purple: { shine: 0xd8b2ff, lit: 0x9b66ff, core: 0x6600cc, rim: 0x330066, shadow: 0x1a0033 },
  // Light checker cell — a subtly-lit arcane slate that reads against obsidian without going muddy.
  arcane_slate: { shine: 0x453a5e, lit: 0x2e2440, core: 0x1e1730, rim: 0x120c20, shadow: 0x080512 }
};

// Character walk cycle: f0 is the idle/rest pose, f1..f8 are the 8 walk frames.
// The base body and every frame-locked armor asset export this same f0..f8 layout.
const WALK_FRAME_COUNT = 8;

/** Painter-order depths for the combat arena (higher = nearer camera). */
const ARENA_DEPTH = Object.freeze({
  GRID: 10,
  GRID_HIT: 15,
  PORTAL: 18,
  COMPARTMENT_PIT: 18,
  CENTER_TILE_CAP: 11,
  OBELISK_BODY: 28,
  OBELISK_CHARGE: 29,
  OBELISK_BOLT: 30,
  TORCH: 31,
  STORMHEART_ORB: 33,
  LOOT_CHEST: 32,
  PLAYER: 25,
});

// Geologic Bytecode Opcodes
const OP = {
  UPLIFT: 0x01,
  ERODE: 0x02,
  FOLD: 0x03,
  SMOOTH: 0x04,
  FLATTEN: 0x05 // Intentional intelligent carving
};

export default function createCombatArenaScene(phaserRuntime) {
  return class CombatArenaScene extends phaserRuntime.Scene {
    constructor() {
      super({ key: 'CombatArenaScene' });
      const lMag = Math.sqrt(1 + 1);
      this.lx = -1 / lMag;
      this.ly = -1 / lMag;
    }

    preload() {
      // Load actual ideal-human textures from generated-assets.
      // f0 = idle/rest pose; f1..f8 = the 8-frame walk cycle.
      for (let i = 0; i <= WALK_FRAME_COUNT; i++) {
        const key = `ideal-human-f${i}`;
        this.load.image(key, `/generated-assets/IdealHuman/IdealHuman-f${i}-png.png`);
      }

      // Two-arm rig (Slice 3): armless body walk frames + 6 jointed segment sprites.
      for (let i = 0; i <= WALK_FRAME_COUNT; i++) {
        this.load.image(`body-noarms-f${i}`, `/generated-assets/IdealHuman/IdealHuman-body-noArms-f${i}-png.png`);
      }
      // The SCDL CLI names outputs after the SOURCE filename stem, so the segment
      // files armR-upper.scdl… compile to armR-upper-png.png…; the texture key
      // equals the armRigConfig spriteKey.
      const SEG_KEYS = ['armR-upper', 'armR-fore', 'armR-hand', 'armL-upper', 'armL-fore', 'armL-hand'];
      for (const segKey of SEG_KEYS) {
        this.load.image(segKey, `/generated-assets/IdealHuman/${segKey}-png.png`);
      }
      this.load.image('armL-hand-palm', '/generated-assets/IdealHuman/armL-hand-palm-png.png');

      // Load all armor sprite frames from the item database (same f0..f8 layout,
      // frame-locked to the body so equipped walking stays in sync).
      Object.values(ITEM_DATABASE).forEach(item => {
        if (item.sprite) {
          const basePath = item.sprite.replace('-f0-png.png', '');
          for (let i = 0; i <= WALK_FRAME_COUNT; i++) {
            if (i === 0) this.load.image(item.assetId, `${basePath}-f0-png.png`);
            this.load.image(`${item.assetId}-f${i}`, `${basePath}-f${i}-png.png`);
          }
        }
      });

      preloadLootChestTextures(this.load);
      queueIsoTileTextures(this.load);

      preloadVoid1Textures(this.load);
      this.load.on('loaderror', (file) => {
        const key = String(file?.key || '');
        if (key.startsWith('void1-') || key.startsWith('Void1-')) {
          console.error('[Void1] Failed to load texture:', file?.key, file?.url);
        }
      });
    }

    getLambertColor(nx, ny, nz, palette) {
      const mag = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      const nnx = nx / mag;
      const nny = ny / mag;
      const nnz = nz / mag;
      
      // Light comes from top-left-forward
      const cosTheta = (nnx * this.lx) + (nny * this.ly) + (nnz * 0.5); 
      
      if (cosTheta >= 0.70) return palette.shine;
      if (cosTheta >= 0.30) return palette.lit;
      if (cosTheta >= -0.10) return palette.core;
      if (cosTheta >= -0.50) return palette.rim;
      return palette.shadow;
    }

    create() {
    console.log('[CombatArenaScene] Starting...');
      this.obeliskState = this.hasStormheartOrb() ? 'looted' : 'active';
      const { width, height } = this.scale;
      this.cameras.main.scrollX = -width / 2;
      // Shift camera slightly up to frame the obelisk peak
      this.cameras.main.scrollY = -height / 2 - 40;
      
      // Zoom out to give the island breathing room and reveal the space around it.
      // Universe bg is now massively oversized + resize handler to ensure it always fills the full viewport (no side black bars).
      this.baseCameraZoom = 1.1;
      this.maxCameraZoom = 2.25;
      this.cameraZoomStep = 0.1;
      this.cameras.main.setZoom(this.baseCameraZoom);

      // Subtle camera idle drift to sell "alive" parallax-on-stars
      // Note: galaxy redraw on resize ensures full viewport fill even after drift/zoom
      this.tweens.add({
        targets: this.cameras.main,
        scrollX: this.cameras.main.scrollX + 3,
        scrollY: this.cameras.main.scrollY - 2,
        duration: 7000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // Initialize Doom Fire Canvas Texture (32x48 grid)
      this.fireW = 32;
      this.fireH = 48;
      this.fireTexture = this.textures.createCanvas('doom-fire', this.fireW, this.fireH);
      this.fireContext = this.fireTexture.getContext();
      this.fireImageData = this.fireContext.createImageData(this.fireW, this.fireH);
      this.firePixels = new Float32Array(this.fireW * this.fireH);
      this._frameSeed = 1;
      this._plasmaSmooth = 0;
      this._arenaTickGen = 0;
      this._arenaTickInFlight = false;
      
      // Bottom row will be dynamically seeded in update() for a flame shape

      // Disable default browser right-click menu so we can use right-click for inspection
      this.input.mouse.disableContextMenu();

      if (this.cameras.main.postFX) {
        // Keep a handle on the bloom so the obelisk discharge can flash it.
        this.baseBloom = 1.5;
        this.bloomFx = this.cameras.main.postFX.addBloom(0x00ffff, 1, 1, 1.2, this.baseBloom);
        this.cameras.main.postFX.addVignette(0.5, 0.5, 0.9, 0.6);
        this.cameras.main.postFX.addNoise(0.04);
      }

      this.drawGalaxyBackground();

      // Keep camera centered on universe when window resizes (prevents black bars shifting)
      // ALSO refresh galaxy bg so it continues to take up the WHOLE viewport (gene-enforced).
      this.scale.on('resize', (gameSize) => {
        this.cameras.main.scrollX = -gameSize.width / 2;
        this.cameras.main.scrollY = -gameSize.height / 2 - 40;
        if (this.galaxyBg) {
          this.galaxyBg.destroy();
        }
        this.drawGalaxyBackground();
      });
      
      this.movementArmed = false;
      this.footstepIndex = 0;
      this.musicBeatSync = {
        lastExactBeat: null,
        snareCount: 0,
      };
      this.latticeAuthority = createCombatLatticeAuthority();
      this.latticePickCandidates = [];
      this.equippedGatherTools = [];
      this.islandTerrainRadius = 14;
      this.boundCanvasPointerDown = (e) => this.handleCanvasPointerDown(e);
      this.boundCanvasContextMenu = (e) => this.handleCanvasContextMenu(e);
      this.boundCanvasWheel = (e) => this.handleCanvasWheel(e);
      if (this.game.canvas) {
        this.game.canvas.addEventListener('pointerdown', this.boundCanvasPointerDown);
        this.game.canvas.addEventListener('contextmenu', this.boundCanvasContextMenu);
        this.game.canvas.addEventListener('wheel', this.boundCanvasWheel, { passive: false });
        this.events.once('destroy', () => {
          this.game.canvas?.removeEventListener('pointerdown', this.boundCanvasPointerDown);
          this.game.canvas?.removeEventListener('contextmenu', this.boundCanvasContextMenu);
          this.game.canvas?.removeEventListener('wheel', this.boundCanvasWheel);
        });
      }

      // Generate the massive voxel terrain via Geologic VM
      const terrainRadius = 14; 
      const terrainSize = terrainRadius * 2 + 1;
      const heightmap = this.runGeologicVM(terrainSize, terrainRadius);

      this.arenaBiome = 'void';
      this.worldRegion = 'void_courtyard';
      this.polarisTransitActive = false;
      this.defeatedEnemyRemovalTimers = new Map();
      this.events.once('destroy', () => {
        for (const timer of this.defeatedEnemyRemovalTimers?.values() || []) {
          timer?.remove?.(false);
        }
        this.defeatedEnemyRemovalTimers?.clear();
      });
      this.portalPhase = PORTAL_PHASE.DORMANT;
      this.portalWarden = null;
      this.portalWardenEffect = null;
      this.drawVoxelTerrain(heightmap, terrainSize, terrainRadius);

      // Sporadic ice smoke — one shared emitter, single particle per burst,
      // 3–5s gaps. Caps simultaneous wisps well under 3.
      if (this.icePeakPositions && this.icePeakPositions.length > 0) {
        // Continuous vapor. Each puff is emitted from a random peak and its alpha ramps
        // 0 → peak → 0 across its life, so wisps breathe in and out instead of the old
        // one-particle-every-few-seconds burst that popped in and out like a god particle.
        const peaks = this.icePeakPositions;
        const peakZone = {
          getRandomPoint: (point) => {
            const peak = phaserRuntime.Utils.Array.GetRandom(peaks);
            point.x = peak.x + phaserRuntime.Math.Between(-6, 6);
            point.y = peak.y + phaserRuntime.Math.Between(-4, 4);
            return point;
          }
        };
        const iceSmokeEmitter = this.add.particles(0, 0, 'ice-smoke', {
          speed: { min: 3, max: 9 },
          angle: { min: 255, max: 285 },              // gentle upward drift
          scale: { start: 0.16, end: 0.6 },           // a small puff that expands as it rises
          alpha: { values: [0, 0.22, 0.18, 0], ease: 'Sine.easeInOut' }, // fade in, hold, fade out
          rotate: { min: -15, max: 15 },
          lifespan: { min: 4500, max: 7000 },
          frequency: 850,                             // a soft, steady stream — no dead gaps
          quantity: 1,
          blendMode: 'NORMAL',
          emitZone: { type: 'random', source: peakZone },
        });
        iceSmokeEmitter.setDepth(40); // Ice vapor drifts in front of the arena geometry, like the snow
        this.iceSmokeEmitter = iceSmokeEmitter;
      }

      // Draw the crisp combat grid on top
      const gridSize = 9;
      const tw = 80;
      const th = 40;
      const toIso = (tx, ty) => {
        const ox = tx - Math.floor(gridSize / 2);
        const oy = ty - Math.floor(gridSize / 2);
        return {
          x: (ox - oy) * (tw / 2),
          y: (ox + oy) * (th / 2)
        };
      };

      // Generate battle leylines from the engine
      // Leylines must NEVER appear on runes. Runes live exclusively on the diagonals.
      const runeBlocked = [];
      for (let i = 0; i < gridSize; i++) {
        runeBlocked.push({ x: i, y: i });                 // main diagonal
        runeBlocked.push({ x: i, y: gridSize - 1 - i });  // anti-diagonal
      }
      // dedupe center (already blocked)
      const uniqueBlocked = [...new Set(runeBlocked.map(c => `${c.x},${c.y}`))]
        .map(k => { const [x,y] = k.split(',').map(Number); return {x,y}; })
        .filter(c => !(c.x === 4 && c.y === 4));

      this.leylines = generateBattleLeylines({
         battleSeed: 1337,
         width: gridSize,
         height: gridSize,
         blockedCoords: [{x: 4, y: 4}, ...uniqueBlocked], // Center + all rune diagonals blocked
         count: 5 // Scatter 5 leylines across the battlefield
      });

      // The combat grid sits perfectly flush on the carved plateau
      const targetZ = 12;
      const zScale = 4;
      const plateauZ = targetZ * zScale;
      
      this.combatGridMetrics = { gridSize, tw, th, plateauZ, toIso };
      this.combatBattleEngaged = false;
      this.battleLeylinesActive = false;
      this.leylineTileRegistry = new Map();

      this.draw3DGrid(gridSize, tw, th, toIso, plateauZ);
      
      // Draw the massive central obelisk
      this.drawObelisk(tw, th, plateauZ);
      if (this.hasStormheartOrb()) {
        this.obeliskCompartmentPit?.destroy();
        this.obeliskCompartmentPit = null;
        this.hideObeliskTower();
        this.revealCenterCompartmentTile();
      } else {
        this.restoreActiveObeliskTower();
      }
      
      this.drawTeleportationPortal();

      // Spawn the new IdealHuman character model on the grid inside a Container
      const playerPos = toIso(4, 6);
      
      const playerContainer = this.add.container(playerPos.x, playerPos.y - plateauZ);
      
      // The SCDL export draws the figure on a 64x128 canvas with the feet at
      // y~112, leaving ~16px of empty padding below. Origin (0.5, 1) would pin
      // that empty canvas bottom to the tile center, floating the feet ~16px
      // north (up-screen) onto the tile's back edge. Anchor to the feet row so
      // the character plants on the tile CENTER. All body-part layers share this
      // one canvas coordinate system, so every layer MUST use the same origin.
      const FEET_ORIGIN_Y = 112 / 128; // = 0.875, the feet row of the shared canvas
      const playerImg = this.add.sprite(0, 0, 'ideal-human-f0');
      playerImg.setOrigin(0.5, FEET_ORIGIN_Y);
      playerImg.setInteractive({ useHandCursor: true, pixelPerfect: false });
      playerImg.on('pointerdown', (pointer) => {
        if (pointer.button === 0) this.toggleMovementArmed();
      });
      playerContainer.add(playerImg);

      // Armor layers on top of base model
      const armorLayers = {
        chest: this.add.sprite(0, 0, 'ideal-human-f0').setOrigin(0.5, FEET_ORIGIN_Y).setVisible(false),
        legs: this.add.sprite(0, 0, 'ideal-human-f0').setOrigin(0.5, FEET_ORIGIN_Y).setVisible(false),
        boots: this.add.sprite(0, 0, 'ideal-human-f0').setOrigin(0.5, FEET_ORIGIN_Y).setVisible(false),
        head: this.add.sprite(0, 0, 'ideal-human-f0').setOrigin(0.5, FEET_ORIGIN_Y).setVisible(false),
        weapon: this.add.sprite(0, 0, 'ideal-human-f0').setOrigin(0.5, FEET_ORIGIN_Y).setVisible(false),
      };
      playerContainer.add(armorLayers.chest);
      playerContainer.add(armorLayers.legs);
      playerContainer.add(armorLayers.boots);
      playerContainer.add(armorLayers.head);
      playerContainer.add(armorLayers.weapon);

      // --- Two-arm rig (Slice 3) ---
      // The baked body no longer contains arms; the arms are jointed segment
      // sprites (canvas 64x128, origin at each segment's joint pivot). Body
      // origin (0.5,0.875) => a canvas point (px,py) maps to container-local
      // (px-32, py-112).
      playerImg.setTexture('body-noarms-f0');
      const CANVAS_W = 64, CANVAS_H = 128, OX = 32, OY = 112;
      this._rigCanvas = { OX, OY, CANVAS_W, CANVAS_H };
      this.armSegments = {};
      for (const side of ['right', 'left']) {
        for (const seg of ARM_RIG[side].segments) {
          const s = this.add.sprite(0, 0, seg.spriteKey);
          s.setOrigin(seg.pivot.x / CANVAS_W, seg.pivot.y / CANVAS_H);
          playerContainer.add(s);
          this.armSegments[seg.spriteKey] = s;
        }
      }
      // Hand payloads (main = right, off = left); textures set by equipment.
      this.handPayloads = {
        mainHand: this.add.sprite(0, 0, 'ideal-human-f0').setVisible(false),
        offHand: this.add.sprite(0, 0, 'ideal-human-f0').setVisible(false),
      };
      playerContainer.add(this.handPayloads.mainHand);
      playerContainer.add(this.handPayloads.offHand);

      // Register SCDL compiled frames as Phaser animations
      // Body walk/idle use the ARMLESS body frames — the arms are the jointed
      // segment sprites overlaid on top (they hold a carry pose during walk;
      // walk-swing articulation is deferred).
      this.anims.create({
        key: 'player-walk',
        frames: Array.from({ length: WALK_FRAME_COUNT }, (_, k) => ({ key: `body-noarms-f${k + 1}` })),
        frameRate: 18,
        repeat: -1
      });
      this.anims.create({
        key: 'player-idle',
        frames: [{ key: 'body-noarms-f0' }],
        frameRate: 1,
        repeat: -1
      });

      // Register animations for armor pieces
      Object.values(ITEM_DATABASE).forEach(item => {
        if (!item.sprite) return;
        const walkIndices = Array.isArray(item.walkFrames) && item.walkFrames.length
          ? item.walkFrames
          : Array.from({ length: WALK_FRAME_COUNT }, (_, k) => k + 1);
        this.anims.create({
          key: `${item.assetId}-walk`,
          frames: walkIndices
            .filter((index) => this.textures.exists(`${item.assetId}-f${index}`))
            .map((index) => ({ key: `${item.assetId}-f${index}` })),
          frameRate: 18,
          repeat: -1,
        });
        if (item.idleAnim) this.ensureHandItemIdleAnimation(item.assetId);
      });

      playerImg.play('player-idle');

      registerVoid1Animations(this.anims);
      registerLootChestAnimations(this.anims);

      // Give him a subtle breathing animation (default idle)
      this.idleTween = this.tweens.add({
        targets: [playerImg, ...Object.values(armorLayers)],
        scaleY: 0.98,
        y: 1, // Local sink
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // Store player and input for the update loop
      this.playerImg = playerImg;
      this.playerArmorLayers = armorLayers;
      this.playerContainer = playerContainer;
      this.playerGridPos = { tx: 4, ty: 6 };
      this.cursors = this.input.keyboard.createCursorKeys();
      this.input.keyboard.on('keydown', this.handleGlobalKeydown);
      
      // Listen for React equipment changes
      window.addEventListener('equipment-changed', this.handleEquipmentChange);
      // Ask for initial equipment state
      window.dispatchEvent(new CustomEvent('request-equipment-state'));
      this.isWalking = false;

      // Helper to compute grid to screen position
      this.getIsoTarget = (tx, ty) => {
        const ox = tx - Math.floor(gridSize / 2);
        const oy = ty - Math.floor(gridSize / 2);
        return {
          x: (ox - oy) * (tw / 2),
          y: (ox + oy) * (th / 2) - plateauZ
        };
      };

      // --- Combat stat tree (slice 1) ---
      this.stats = new CombatStatController();
      this.stats.registerEntity('player', {
        tx: 4,
        ty: 6,
        hp: 100,
        maxHp: 100,
        scholomanceOverrides: getScholomanceCombatBlock(),
      });

      this.sentinels = SENTINEL_ROBOTS.map((entry) => ({
        ...entry,
        defeated: false,
        aggroed: false,
        abilities: createSentinelAbilityState(),
      }));
      this.combatVictoryAchieved = false;
      this.sessionTelemetry = createCombatSessionTelemetry();
      this.spawnSentinelRobots();
      this.rebuildBlockedTiles();

      this.createSwingTextures();

      // Procedural smoke wisp — FBM noise with soft circular mask, light cool-gray
      if (!this.textures.exists('smoke-wisp')) {
        const w = 128, h = 128;
        const sTex = this.textures.createCanvas('smoke-wisp', w, h);
        const sCtx = sTex.getContext();
        const imageData = sCtx.createImageData(w, h);
        const data = imageData.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let n = 0, amp = 1, freq = 0.05, max = 0;
            for (let o = 0; o < 4; o++) {
              n += this.smoothNoise2D(x * freq, y * freq) * amp;
              max += amp;
              amp *= 0.5;
              freq *= 2;
            }
            n = Math.max(0, (n / max - 0.45) * 2.4);
            const dx = x - w / 2, dy = y - h / 2;
            const r = Math.sqrt(dx * dx + dy * dy) / (w / 2);
            const edge = Math.max(0, 1 - r);
            const edgeSoft = edge * edge * (3 - 2 * edge);
            const a = Math.min(1, n * edgeSoft) * 0.9;
            const idx = (y * w + x) * 4;
            data[idx] = 210;
            data[idx + 1] = 205;
            data[idx + 2] = 220;
            data[idx + 3] = Math.floor(a * 255);
          }
        }
        sCtx.putImageData(imageData, 0, 0);
        sTex.refresh();
      }

      // Continuous mist mass — large overlapping sprites with offset breathing cycles
      const mistConfigs = [
        { x: -320, y: 290, scale: 3.4, alpha: 0.18 },
        { x: -160, y: 260, scale: 3.9, alpha: 0.20 },
        { x: 20,   y: 305, scale: 3.6, alpha: 0.22 },
        { x: 200,  y: 270, scale: 3.7, alpha: 0.20 },
        { x: 340,  y: 295, scale: 3.2, alpha: 0.18 }
      ];
      mistConfigs.forEach((cfg, i) => {
        const m = this.add.image(cfg.x, cfg.y, 'smoke-wisp');
        m.setDepth(60); // Atmospheric haze drifts in front of the arena geometry (portal 50, torches 30)
        m.setBlendMode(phaserRuntime.BlendModes.NORMAL);
        m.setAlpha(cfg.alpha);
        m.setScale(cfg.scale);
        this.tweens.add({
          targets: m,
          alpha: cfg.alpha * 0.4,
          scale: cfg.scale * 1.08,
          x: cfg.x + phaserRuntime.Math.Between(-18, 18),
          y: cfg.y + phaserRuntime.Math.Between(-10, 10),
          duration: phaserRuntime.Math.Between(6500, 9500),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: i * 700
        });
      });

      this.boundHandleCombatCast = this.handleCombatCast.bind(this);
      window.addEventListener('combat-cast', this.boundHandleCombatCast);
      this.events.once('destroy', () => {
        window.removeEventListener('combat-cast', this.boundHandleCombatCast);
      });

      this.boundHandleHudAttack = () => this.performBasicAttack();
      this.boundHandleHudEndTurn = () => this.endPlayerTurn();
      this.boundHandleIcicleSlam = () => this.performIcicleSlam();
      window.addEventListener('combat-attack', this.boundHandleHudAttack);
      window.addEventListener('combat-endturn', this.boundHandleHudEndTurn);
      window.addEventListener('combat-icicle-slam', this.boundHandleIcicleSlam);
      this.events.once('destroy', () => {
        window.removeEventListener('combat-attack', this.boundHandleHudAttack);
        window.removeEventListener('combat-endturn', this.boundHandleHudEndTurn);
        window.removeEventListener('combat-icicle-slam', this.boundHandleIcicleSlam);
      });
      this.reachableTiles = new Set();
      this.inspectHighlightTile = null;
      this.selectedCombatTargetId = null;
      this.emitCombatStats(); // seed the HUD with initial values + movement highlights
      this.emitSceneContextState();
      this.applyArmPose('carry'); // place jointed arms at rest

      this._incantation = { verse: '', weave: '' };
      this.scoringEngine = createCombatScoringEngine();
      this.enchantRng = () => (typeof window !== 'undefined' && window.__forceEnchant ? 0 : Math.random());
      this.boundHandleIncantation = (e) => { if (e && e.detail) this._incantation = { verse: e.detail.verse || '', weave: e.detail.weave || '' }; };
      window.addEventListener('incantation-state', this.boundHandleIncantation);
      this.events.once('destroy', () => window.removeEventListener('incantation-state', this.boundHandleIncantation));
      window.dispatchEvent(new CustomEvent('request-incantation-state'));

      this.boundHandleSceneContextRequest = bindActiveSceneContextRequest(
        this,
        () => this.emitSceneContextState(),
      );
      window.addEventListener('request-scene-context', this.boundHandleSceneContextRequest);
      this.events.once('destroy', () => {
        window.removeEventListener('request-scene-context', this.boundHandleSceneContextRequest);
      });

      this.boundHandleScholomanceStats = (event) => {
        const scholomance = event?.detail?.scholomance;
        const player = this.stats?.getEntity('player');
        if (!player || !scholomance) return;
        player.scholomance = { ...scholomance };
        this.emitCombatStats();
      };
      window.addEventListener('scholomance-stats-updated', this.boundHandleScholomanceStats);
      this.events.once('destroy', () => {
        window.removeEventListener('scholomance-stats-updated', this.boundHandleScholomanceStats);
      });

      this.boundHandleTargetCycleKey = (event) => {
        if (event.key !== 'Tab') return;
        if (!this.getTargetableCombatantsOrdered().length) return;
        event.preventDefault();
        this.cycleCombatTarget();
      };
      window.addEventListener('keydown', this.boundHandleTargetCycleKey);
      this.events.once('destroy', () => {
        window.removeEventListener('keydown', this.boundHandleTargetCycleKey);
      });

      this.setupTacticalOverlayListener();

      this.boundHandleBattleStarted = () => {
        if (this.canEngageCombatBattle()) this.engageCombatBattle();
      };
      this.boundHandleBattleEnded = () => this.disengageCombatBattle();
      window.addEventListener(COMBAT_BATTLE_STARTED_EVENT, this.boundHandleBattleStarted);
      window.addEventListener(COMBAT_BATTLE_ENDED_EVENT, this.boundHandleBattleEnded);
      this.events.once('destroy', () => {
        window.removeEventListener(COMBAT_BATTLE_STARTED_EVENT, this.boundHandleBattleStarted);
        window.removeEventListener(COMBAT_BATTLE_ENDED_EVENT, this.boundHandleBattleEnded);
      });

      if (consumeCombatBattleStarted() && this.canEngageCombatBattle()) {
        this.engageCombatBattle();
      }

      this.events.emit('arena-ready');
    }

    handleCombatCast(event) {
      if (this.cutsceneInputLock) return;
      if (this.canEngageCombatBattle()) {
        this.ensureCombatBattleEngaged();
      }
      const detail = event.detail || {};
      const sceneContext = this.buildSceneTargetRegistry();
      const resolvedTargets = detail.resolvedTargets
        || detail.bridge?.resolvedTargets
        || (detail.weave
          ? resolveWeaveTargetsFromParsed(parseWeave(detail.weave), sceneContext, detail.weave)
          : null);
      const enriched = { ...detail, sceneContext, resolvedTargets };
      const primaryId = resolvedTargets?.primaryTargetId;

      if (primaryId === 'stormheart-orb') {
        this.tryLootStormheartOrb();
        return;
      }

      if (primaryId?.startsWith('gather:')) {
        const target = sceneContext.targets.find((entry) => entry.id === primaryId);
        const tool = this.getPrimaryGatherTool();
        if (target?.metadata?.targetCell && tool) {
          this.submitGatherIntent(
            { ...target.metadata.targetCell, gatherable: true, requiredTool: target.metadata.requiredTool },
            tool,
          );
        } else {
          this.showFizzle();
        }
        return;
      }

      if (primaryId === 'obelisk') {
        this.resolveObeliskCast(enriched);
        return;
      }

      if (primaryId === 'combat-portal') {
        this.tryEnterPortal();
        return;
      }

      void this.performSpellCast({
        castDetail: detail,
        sceneContext,
        resolvedTargets,
      });
    }

    isPlayerAdjacentToTile(tx, ty) {
      if (!this.playerGridPos) return false;
      return Math.max(Math.abs(this.playerGridPos.tx - tx), Math.abs(this.playerGridPos.ty - ty)) <= 1;
    }

    isPlayerAdjacentToObelisk() {
      return this.isPlayerAdjacentToTile(4, 4);
    }

    buildGatherableTargets() {
      const targets = [];
      if (!this.latticeAuthority?.cells) return targets;

      const player = this.getPlayerGatherState();
      for (const cell of this.latticeAuthority.cells.values()) {
        const key = latticeCellKey(cell);
        if (!cell.gatherable || this.latticeAuthority.depleted.has(key)) continue;

        const tx = cell.combatTx ?? cell.x;
        const ty = cell.combatTy ?? cell.z;
        const dist = Math.abs(player.tx - tx) + Math.abs(player.ty - ty);

        targets.push({
          id: `gather:${tx},${ty},${cell.z}`,
          label: 'Void Ore Spire',
          kind: 'gatherable',
          weaveObjects: ['STONE'],
          tx,
          ty,
          z: cell.z,
          inRange: dist <= 2,
          reachable: true,
          interactionPriority: 300,
          metadata: {
            targetCell: { x: cell.x, y: cell.y, z: cell.z },
            requiredTool: cell.requiredTool,
          },
        });
      }

      return targets;
    }

    getSentinelRecords() {
      return Array.isArray(this.sentinels) ? this.sentinels : [];
    }

    spawnSentinelRobots() {
      for (const sentinel of this.getSentinelRecords()) {
        const tile = this.getIsoTarget(sentinel.tx, sentinel.ty);
        this.drawTorch(tile.x, tile.y, { sentinelId: sentinel.id });
        this.stats.registerEntity(sentinel.id, {
          hp: SENTINEL_STAT_DEFAULTS.hp,
          maxHp: SENTINEL_STAT_DEFAULTS.maxHp,
          tx: sentinel.tx,
          ty: sentinel.ty,
          overrides: getSentinelCombatOverrides(sentinel.id),
          scholomanceOverrides: SENTINEL_STAT_DEFAULTS.scholomanceOverrides,
        });
      }
      this.refreshSortableEntityDepths();
    }

    respawnSentinel(sentinelId) {
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record || !record.defeated) return;

      record.defeated = false;
      const tile = this.getIsoTarget(record.tx, record.ty);
      this.drawTorch(tile.x, tile.y, { sentinelId: record.id });
      
      this.stats.registerEntity(record.id, {
        hp: SENTINEL_STAT_DEFAULTS.hp,
        maxHp: SENTINEL_STAT_DEFAULTS.maxHp,
        tx: record.tx,
        ty: record.ty,
        overrides: getSentinelCombatOverrides(record.id),
        scholomanceOverrides: SENTINEL_STAT_DEFAULTS.scholomanceOverrides,
      });

      this.refreshSortableEntityDepths();
      this.rebuildBlockedTiles();
      this.refreshMovementHighlights();
      this.emitSceneContextState();

      const effect = this.getSentinelTorchEffect(sentinelId);
      if (effect?.bobContainer) {
        effect.bobContainer.setAlpha(0);
        this.tweens.add({
          targets: effect.bobContainer,
          alpha: 1,
          duration: 1500,
          ease: 'Sine.easeInOut',
        });
      }
      if (effect?.shadow) {
        effect.shadow.setAlpha(0);
        this.tweens.add({
          targets: effect.shadow,
          alpha: effect.shadow.bobAlpha ?? 0.8,
          duration: 1500,
          ease: 'Sine.easeInOut',
        });
      }
    }

    refreshSortableEntityDepths() {
      const playerPos = this.playerGridPos;
      if (this.playerContainer && playerPos) {
        this.playerContainer.setDepth(
          getGridSortDepth(playerPos.tx, playerPos.ty, ARENA_SORT_LAYER.PLAYER),
        );
      }

      for (const effect of this.torchEffects || []) {
        const tx = effect.gridTx;
        const ty = effect.gridTy;
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
        effect.shadow?.setDepth(getGridSortDepth(tx, ty, ARENA_SORT_LAYER.TORCH_SHADOW));
        effect.ambient?.setDepth(getGridSortDepth(tx, ty, ARENA_SORT_LAYER.TORCH_AMBIENT));
        effect.bobContainer?.setDepth(getGridSortDepth(tx, ty, ARENA_SORT_LAYER.TORCH_BODY));
      }

      for (const chest of this.combatLootChests || []) {
        const d = getGridSortDepth(chest.tx, chest.ty, ARENA_SORT_LAYER.LOOT_CHEST);
        chest.sprite?.setDepth(d);
        chest.idleEmitter?.setDepth(d + 1);
      }

      const warden = this.portalWardenEffect;
      if (warden?.container && Number.isFinite(warden.tx) && Number.isFinite(warden.ty)) {
        warden.container.setDepth(
          getGridSortDepth(warden.tx, warden.ty, ARENA_SORT_LAYER.PORTAL_WARDEN),
        );
      }
    }

    rebuildBlockedTiles() {
      const tiles = buildSentinelBlockedTiles(this.getSentinelRecords(), [...DEFAULT_BLOCKED_TILES]);
      const warden = this.getPortalWardenRecord();
      if (warden) tiles.push({ tx: warden.tx, ty: warden.ty });
      this._blockedTiles = buildBlockedSet(tiles);
    }

    getSentinelTorchEffect(sentinelId) {
      if (!sentinelId || !this.torchEffects?.length) return null;
      return this.torchEffects.find((entry) => entry.sentinelId === sentinelId) || null;
    }

    scheduleDefeatedEnemyRemoval(entityId, onRemove) {
      if (!entityId || typeof onRemove !== 'function') return;
      if (!this.defeatedEnemyRemovalTimers) {
        this.defeatedEnemyRemovalTimers = new Map();
      }
      const prior = this.defeatedEnemyRemovalTimers.get(entityId);
      prior?.remove?.(false);

      const timer = this.time.delayedCall(DEFEATED_ENEMY_DISAPPEAR_MS, () => {
        this.defeatedEnemyRemovalTimers?.delete(entityId);
        onRemove();
      });
      this.defeatedEnemyRemovalTimers.set(entityId, timer);
    }

    removeSentinelTorchVisual(sentinelId) {
      const effect = this.getSentinelTorchEffect(sentinelId);
      if (!effect) return;
      destroySentinelTorchEffect(effect);
      this.torchEffects = (this.torchEffects || []).filter((entry) => entry.sentinelId !== sentinelId);
      this.refreshSortableEntityDepths();
    }

    removePortalWardenVisual() {
      if (!this.portalWardenEffect) return;
      destroyPortalWardenEffect(this.portalWardenEffect);
      this.portalWardenEffect = null;
      this.refreshSortableEntityDepths();
    }

    applySentinelAggroVisual(sentinelId) {
      const effect = this.getSentinelTorchEffect(sentinelId);
      if (!effect) return;
      if (effect.fireSprite) effect.fireSprite.setTint(0xff6644);
      if (effect.ring1) effect.ring1.setAlpha(1);
      if (effect.ring2) effect.ring2.setAlpha(1);
      if (effect.bobContainer) {
        this.tweens.add({
          targets: effect.bobContainer,
          scaleX: 1.12,
          scaleY: 1.12,
          duration: 180,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    }

    emitFireballImpactSfx() {
      const impact = getGameFireballImpactService();
      impact.prime();
      void impact.playImpact();
    }

    emitIceSpellImpactSfx() {
      const impact = getGameIceSpellImpactService();
      impact.prime();
      void impact.playImpact();
    }

    emitFireballImpactBurst(x, y) {
      const burst = this.add.graphics().setDepth(65);
      burst.fillStyle(0xff6600, 0.55);
      burst.fillCircle(x, y, 18);
      burst.fillStyle(0xffcc44, 0.75);
      burst.fillCircle(x, y, 9);
      burst.fillStyle(0xffffff, 0.9);
      burst.fillCircle(x, y, 4);
      this.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: 1.45,
        scaleY: 1.45,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => burst.destroy(),
      });
    }

    buildSentinelFireball(startX, startY) {
      const fireball = this.add.container(startX, startY).setDepth(64);
      const halo = this.add.graphics();
      halo.fillStyle(0xff4400, 0.38);
      halo.fillCircle(0, 0, 16);
      const core = this.add.graphics();
      core.fillStyle(0xff9922, 0.95);
      core.fillCircle(0, 0, 8);
      core.fillStyle(0xffee88, 0.9);
      core.fillCircle(0, 0, 4);
      core.fillStyle(0xffffff, 0.95);
      core.fillCircle(0, 0, 2);
      fireball.add([halo, core]);
      fireball.setScale(0.55);
      fireball.setBlendMode(phaserRuntime.BlendModes.ADD);
      return fireball;
    }

    launchSentinelFireball(sentinelId) {
      const effect = this.getSentinelTorchEffect(sentinelId);
      if (!effect || !this.playerContainer || !this.stats?.canAttack?.(sentinelId, 'player')) {
        this.resolveSentinelFireballHit(sentinelId);
        return;
      }

      const startX = effect.bobContainer?.x ?? effect.anchorX;
      const startY = (effect.bobContainer?.y ?? effect.anchorY) - 10;
      const endX = this.playerContainer.x;
      const endY = this.playerContainer.y - 36;
      const fireball = this.buildSentinelFireball(startX, startY);

      if (effect.fireSprite) {
        const baseScaleX = effect.fireSprite.scaleX;
        const baseScaleY = effect.fireSprite.scaleY;
        this.tweens.add({
          targets: effect.fireSprite,
          scaleX: baseScaleX * 1.28,
          scaleY: baseScaleY * 1.28,
          duration: 140,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }

      this.tweens.add({
        targets: fireball,
        x: endX,
        y: endY,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 360,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.emitFireballImpactBurst(endX, endY);
          fireball.destroy();
          this.resolveSentinelFireballHit(sentinelId);
        },
      });
    }

    resolveSentinelFireballHit(sentinelId) {
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record || !this.stats) return;

      const plan = record._pendingAttackPlan || planSentinelAttack({
        record,
        sentinels: this.getSentinelRecords(),
        stats: this.stats,
      });
      record._pendingAttackPlan = null;

      const result = resolveSentinelAbilityDamage(this.stats, sentinelId, 'player', plan);
      if (!result?.hit) {
        this.showPlayerCastHint('miss!');
        this.events.emit('sentinel-ability', {
          type: 'sentinel-ability',
          sentinelId,
          abilityId: plan.abilityId,
          missed: true,
          logLines: [`[SENTINEL] ${record.shortLabel || sentinelId} attack missed.`],
        });
        this.emitCombatStats();
        return;
      }

      if (plan.applyBurn) {
        applySentinelBurnDebuff(this.stats, plan);
      }

      this.emitFireballImpactSfx();
      this.showHitFeedback('player', {
        color: plan.abilityId === 'machine_learning' ? 0xaa66ff : 0xff7722,
        amount: result.damage,
        delay: 0,
      });
      const hint = plan.abilityId === 'machine_learning'
        ? 'counter-cast!'
        : plan.abilityId === 'burn'
          ? 'matrix burn!'
          : plan.alertActive
            ? 'alert strike!'
            : 'fireball!';
      this.showPlayerCastHint(hint);
      this.sessionTelemetry?.recordSentinelHit({
        sentinelId,
        damage: result.damage,
      });
      this.events.emit('sentinel-ability', {
        type: 'sentinel-ability',
        sentinelId,
        abilityId: plan.abilityId,
        damage: result.damage,
        logLines: plan.logLines,
        machineLearning: plan.machineLearning || null,
      });
      this.emitCombatStats();
    }

    applySentinelRepositionSteps(sentinelId, steps = []) {
      if (!steps.length) return;
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record || !this.stats) return;

      const finalStep = steps[steps.length - 1];
      record.tx = finalStep.tx;
      record.ty = finalStep.ty;
      this.stats.setPosition(sentinelId, finalStep.tx, finalStep.ty);
      for (let i = 0; i < steps.length; i += 1) {
        this.stats.spendMove(sentinelId);
      }

      const effect = this.getSentinelTorchEffect(sentinelId);
      if (effect?.bobContainer) {
        const tile = this.getIsoTarget(finalStep.tx, finalStep.ty);
        effect.gridTx = finalStep.tx;
        effect.gridTy = finalStep.ty;
        effect.bobContainer.setDepth(getGridSortDepth(finalStep.tx, finalStep.ty, ARENA_SORT_LAYER.TORCH_BODY));
        if (effect.shadow) effect.shadow.setDepth(getGridSortDepth(finalStep.tx, finalStep.ty, ARENA_SORT_LAYER.TORCH_SHADOW));
        if (effect.ambient) effect.ambient.setDepth(getGridSortDepth(finalStep.tx, finalStep.ty, ARENA_SORT_LAYER.TORCH_AMBIENT));

        this.tweens.add({
          targets: effect,
          anchorX: tile.x,
          anchorY: tile.y - 10,
          shadowBaseX: tile.x,
          shadowBaseY: tile.y + 10,
          duration: 180 + steps.length * 40,
          ease: 'Sine.easeInOut',
        });
        if (effect.ambient) {
          this.tweens.add({
            targets: effect.ambient,
            x: tile.x,
            y: tile.y + 10,
            duration: 180 + steps.length * 40,
            ease: 'Sine.easeInOut',
          });
        }
      }

      this.rebuildBlockedTiles();
      if (this.combatBattleEngaged) this.syncLiveBattleBoard();
      this.emitSceneContextState();
    }

    performSentinelAttack(sentinelId, delay = 0) {
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record?.aggroed || record.defeated || !this.stats) return;

      const allies = this.getSentinelRecords()
        .filter((entry) => entry.aggroed && !entry.defeated && entry.id !== sentinelId)
        .map((entry) => entry.id);

      const plan = driveEnemyTurn({
        entityId: sentinelId,
        record,
        stats: this.stats,
        allies,
        targetId: 'player',
        blocked: this.getBlockedTiles?.() || this._blockedTiles,
        rng: Math.random,
      });
      if (!plan) return;

      if (plan.reasons?.length) {
        this.events.emit('sentinel-ability', {
          type: 'sentinel-ability',
          sentinelId,
          logLines: plan.reasons,
        });
      }

      if (plan.movement?.steps?.length) {
        this.applySentinelRepositionSteps(sentinelId, plan.movement.steps);
      }

      if (plan.action?.kind === 'guard') {
        this.stats.setGuarding(sentinelId, true);
        return;
      }
      if (plan.action?.kind !== 'attack') return;

      record._pendingAttackPlan = planSentinelAttack({
        record,
        sentinels: this.getSentinelRecords(),
        stats: this.stats,
        stance: plan.stance,
      });

      const launch = () => this.launchSentinelFireball(sentinelId);
      if (delay > 0) this.time.delayedCall(delay, launch);
      else launch();
    }

    applyVoidAcolyteRepositionSteps(wardenId, steps = []) {
      if (!steps.length) return;
      const record = this.getPortalWardenRecord();
      if (!record || record.id !== wardenId || !this.stats) return;

      const finalStep = steps[steps.length - 1];
      record.tx = finalStep.tx;
      record.ty = finalStep.ty;
      this.stats.setPosition(wardenId, finalStep.tx, finalStep.ty);
      for (let i = 0; i < steps.length; i += 1) {
        this.stats.spendMove(wardenId);
      }

      const effect = this.portalWardenEffect;
      if (effect?.container) {
        const tile = this.getIsoTarget(finalStep.tx, finalStep.ty);
        if (effect.wardenVisual) {
          playVoid1SpriteAnim(effect.wardenVisual, VOID1_ANIM.WALK, { returnToIdle: false });
        }
        this.tweens.add({
          targets: effect.container,
          x: tile.x,
          y: tile.y,
          duration: 180 + steps.length * 40,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (effect.wardenVisual) {
              playVoid1SpriteAnim(effect.wardenVisual, VOID1_ANIM.IDLE);
            }
          },
        });
        effect.tx = finalStep.tx;
        effect.ty = finalStep.ty;
      }

      this.rebuildBlockedTiles();
      this.emitSceneContextState();
    }

    emitVoidAcolyteAbilitySfx(abilityId) {
      if (isVoidAcolyteVoidSpell(abilityId)) {
        const audio = getGameAudioForgeService();
        audio.prime();
        emitVoidAcolyteSpellHit(audio, abilityId);
        return;
      }
      if (isVoidAcolyteIceSpell(abilityId)) {
        this.emitIceSpellImpactSfx();
      }
    }

    getVoidAcolytePlayerImpactPoint() {
      return {
        x: this.playerContainer?.x ?? 0,
        y: this.playerContainer?.y ?? 0,
      };
    }

    getVoidAcolyteBossCastPoint() {
      const effect = this.portalWardenEffect;
      return {
        x: effect?.container?.x ?? effect?.tx ?? 0,
        y: effect?.container?.y ?? effect?.ty ?? 0,
      };
    }

    finishVoidAcolyteStrike(wardenId, plan, result) {
      const record = this.getPortalWardenRecord();
      if (!record || !this.stats) return;

      this.sessionTelemetry?.recordSentinelHit?.({
        sentinelId: wardenId,
        damage: result.damage ?? result.totalDamage ?? 0,
      });
      this.events.emit('sentinel-ability', {
        type: 'sentinel-ability',
        sentinelId: wardenId,
        abilityId: plan.abilityId,
        damage: result.damage ?? result.totalDamage ?? 0,
        logLines: plan.logLines,
      });
      this.emitCombatStats();

      const playerEntity = this.stats.getEntity('player');
      if (playerEntity?.hp <= 0) {
        const defeatText = plan.abilityId === 'icicle_blast'
          ? 'The rime claims you.'
          : 'The void claims you.';
        this.events.emit('combat-defeat', { type: 'combat-defeat', text: defeatText });
      }
    }

    resolveVoidAcolyteStrike(wardenId) {
      const record = this.getPortalWardenRecord();
      if (!record || !this.stats) return;

      const plan = record._pendingAttackPlan || planVoidAcolyteAttack({
        record,
        stats: this.stats,
      });
      record._pendingAttackPlan = null;

      const result = resolveVoidAcolyteAbility(
        this.stats,
        wardenId,
        'player',
        plan,
        this.getBlockedTiles?.() || this._blockedTiles,
      );

      if (!result?.hit) {
        this.events.emit('sentinel-ability', {
          type: 'sentinel-ability',
          sentinelId: wardenId,
          abilityId: plan.abilityId,
          missed: true,
          logLines: [`[VOID] ${record.shortLabel} attack missed.`],
        });
        this.emitCombatStats();
        return;
      }

      const playerPoint = this.getVoidAcolytePlayerImpactPoint();
      const bossPoint = this.getVoidAcolyteBossCastPoint();

      if (result.staged && plan.abilityId === 'icicle_blast') {
        this.showPlayerCastHint('icicle blast!');
        playVoidAcolyteSpellVfx(this, 'icicle_blast', {
          targetX: playerPoint.x,
          targetY: playerPoint.y,
          hitCount: result.hitCount,
          phaserRuntime,
          onHit: (index) => {
            const hit = applyVoidAcolyteHitDamage(this.stats, 'player', result.damagePerHit);
            if (!hit) return;
            this.emitVoidAcolyteAbilitySfx('icicle_blast');
            this.showHitFeedback('player', {
              color: 0x66ccff,
              amount: hit.damage,
              delay: 0,
            });
            if (index === 0) {
              this.sessionTelemetry?.recordSentinelHit?.({
                sentinelId: wardenId,
                damage: result.totalDamage,
              });
              this.events.emit('sentinel-ability', {
                type: 'sentinel-ability',
                sentinelId: wardenId,
                abilityId: plan.abilityId,
                damage: result.totalDamage,
                logLines: plan.logLines,
              });
            }
            this.emitCombatStats();
            if (hit.targetDefeated) {
              this.events.emit('combat-defeat', {
                type: 'combat-defeat',
                text: 'The rime claims you.',
              });
            }
          },
        });
        return;
      }

      if (result.pulled) {
        this.playerGridPos = { tx: result.pulled.tx, ty: result.pulled.ty };
        this.refreshSortableEntityDepths();
        const tile = this.getIsoTarget(result.pulled.tx, result.pulled.ty);
        if (this.playerContainer) {
          this.tweens.add({
            targets: this.playerContainer,
            x: tile.x,
            y: tile.y,
            duration: 280,
            ease: 'Cubic.easeIn',
          });
        }
      }

      playVoidAcolyteSpellVfx(this, plan.abilityId, {
        targetX: playerPoint.x,
        targetY: playerPoint.y,
        fromX: bossPoint.x,
        fromY: bossPoint.y,
        phaserRuntime,
      });

      this.emitVoidAcolyteAbilitySfx(plan.abilityId);
      this.showHitFeedback('player', {
        color: plan.abilityId === 'void_execution' ? 0xaa44ff : 0x66ccff,
        amount: result.damage,
        delay: 0,
      });
      const hint = plan.abilityId === 'void_execution'
        ? 'execution!'
        : plan.abilityId === 'void_gravity'
          ? 'void gravity!'
          : 'void lash!';
      this.showPlayerCastHint(hint);
      this.finishVoidAcolyteStrike(wardenId, plan, result);
    }

    performVoidAcolyteAttack(wardenId, delay = 0) {
      const record = this.getPortalWardenRecord();
      if (!record?.aggroed || record.defeated || !this.stats) return;

      const plan = driveEnemyTurn({
        entityId: wardenId,
        record,
        stats: this.stats,
        allies: [],
        targetId: 'player',
        blocked: this.getBlockedTiles?.() || this._blockedTiles,
        rng: Math.random,
      });
      if (!plan) return;

      if (plan.reasons?.length) {
        this.events.emit('sentinel-ability', {
          type: 'sentinel-ability',
          sentinelId: wardenId,
          logLines: plan.reasons,
        });
      }

      if (plan.movement?.steps?.length) {
        this.applyVoidAcolyteRepositionSteps(wardenId, plan.movement.steps);
      }

      if (plan.action?.kind === 'guard') {
        this.stats.setGuarding(wardenId, true);
        return;
      }
      if (plan.action?.kind !== 'attack') return;

      record._pendingAttackPlan = planVoidAcolyteAttack({
        record,
        stats: this.stats,
        stance: plan.stance,
      });

      const abilityId = record._pendingAttackPlan?.abilityId;
      if (isVoidAcolyteVoidSpell(abilityId) || isVoidAcolyteIceSpell(abilityId)) {
        const audio = getGameAudioForgeService();
        audio.prime();
        if (isVoidAcolyteVoidSpell(abilityId)) {
          emitVoidAcolyteSpellCast(audio, abilityId);
        }
      }
      const wardenVisual = this.portalWardenEffect?.wardenVisual;
      if (wardenVisual) {
        playVoid1SpriteAnim(wardenVisual, pickVoid1StrikeAnim(abilityId));
      }

      const launch = () => this.resolveVoidAcolyteStrike(wardenId);
      const strikeDelay = void1StrikeDelayMs(abilityId);
      const totalDelay = Math.max(delay || 0, strikeDelay);
      if (totalDelay > 0) this.time.delayedCall(totalDelay, launch);
      else launch();
    }

    runPortalWardenRetaliation() {
      const record = this.getPortalWardenRecord();
      if (!record?.aggroed) return;
      this.performVoidAcolyteAttack(record.id, 0);
    }

    runSentinelRetaliation({ onlyNewlyAggroed = false } = {}) {
      const attackers = this.getSentinelRecords().filter((entry) => (
        !entry.defeated
        && entry.aggroed
        && (!onlyNewlyAggroed || entry._justAggroed)
      ));
      attackers.forEach((entry, index) => {
        entry._justAggroed = false;
        this.performSentinelAttack(entry.id, index * 220);
      });
    }

    checkSentinelObeliskAggro(tx, ty) {
      const candidates = getAggroableSentinels(this.getSentinelRecords(), tx, ty);
      if (!candidates.length) return false;

      const newlyAggroed = [];
      for (const record of candidates) {
        if (record.aggroed) continue;
        record.aggroed = true;
        record._justAggroed = true;
        newlyAggroed.push(record);
        this.applySentinelAggroVisual(record.id);
      }

      if (newlyAggroed.length) {
        this.sessionTelemetry?.recordAggro({ count: newlyAggroed.length });
        this.events.emit('sentinel-aggro', {
          type: 'sentinel-aggro',
          count: newlyAggroed.length,
          tx,
          ty,
          text: 'Brazier matrices lock onto you — the tower is threatened.',
        });
        this.emitSceneContextState();
      }

      if (newlyAggroed.length && this.combatBattleEngaged) {
        this.runSentinelRetaliation({ onlyNewlyAggroed: true });
      }
      return newlyAggroed.length > 0;
    }

    triggerCombatVictory({ text = 'The flank sentinels are down. Victory!' } = {}) {
      if (this.combatVictoryAchieved) return false;
      this.combatVictoryAchieved = true;

      void getGameBackgroundMusicService().stop();
      const victory = getGameVictoryService();
      victory.prime();
      void victory.playVictory();
      window.dispatchEvent(new CustomEvent(COMBAT_BATTLE_ENDED_EVENT));

      const playerEntity = this.stats?.getEntity('player') || null;
      const report = this.sessionTelemetry?.buildReport({
        playerEntity,
        sentinelTotal: this.getSentinelRecords().length,
        portalWardenDefeated: this.portalPhase === PORTAL_PHASE.CLEARED,
      }) || null;

      this.events.emit('combat-victory', {
        type: 'combat-victory',
        text,
        report,
      });
      return true;
    }

    defeatSentinel(sentinelId) {
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record || record.defeated) return false;
      record.defeated = true;

      const effect = this.getSentinelTorchEffect(sentinelId);
      if (effect) {
        if (effect.fireSprite) {
          effect.fireSprite.setVisible(false);
          effect.fireSprite.anims?.stop?.();
        }
        if (effect.bobContainer) {
          this.tweens.add({
            targets: effect.bobContainer,
            alpha: 0.2,
            y: effect.bobContainer.y + 18,
            duration: 700,
            ease: 'Quad.easeIn',
          });
        }
        if (effect.shadow) {
          this.tweens.add({
            targets: effect.shadow,
            alpha: 0,
            duration: 500,
          });
        }
        if (effect.ambient) effect.ambient.setVisible(false);
        if (effect.ring1) effect.ring1.setVisible(false);
        if (effect.ring2) effect.ring2.setVisible(false);
      }

      this.rebuildBlockedTiles();
      this.refreshMovementHighlights();
      if (this.selectedCombatTargetId === sentinelId) {
        const remaining = this.getTargetableCombatantsOrdered().map((entry) => entry.id);
        this.selectedCombatTargetId = cycleCombatTargetId(null, remaining);
        this.refreshCombatTargetVisual();
      }
      this.emitSceneContextState();
      this.emitCombatTargetSelected();
      this.sessionTelemetry?.recordSentinelDefeated();
      this.events.emit('sentinel-defeated', {
        type: 'sentinel-defeated',
        id: sentinelId,
        label: record.label,
        shortLabel: record.shortLabel,
        tx: record.tx,
        ty: record.ty,
      });
      this.spawnCombatLootChest(sentinelId, record.tx, record.ty);
      this.scheduleDefeatedEnemyRemoval(sentinelId, () => {
        this.removeSentinelTorchVisual(sentinelId);
      });

      this.time.delayedCall(15000, () => {
        this.respawnSentinel(sentinelId);
      });

      if (areAllSentinelsDefeated(this.getSentinelRecords())) {
        this.triggerPortalUnseal();
      }
      return true;
    }

    triggerPortalUnseal() {
      if (this.portalPhase !== PORTAL_PHASE.DORMANT) return false;
      this.portalPhase = PORTAL_PHASE.UNSEALING;
      this.playPortalIceCutscene(() => {
        this.enterPortalExplorationMode();
        this.portalPhase = PORTAL_PHASE.BECKONING;
        this.refreshPortalInteractionState();
        this.events.emit('portal-unsealed', {
          type: 'portal-unsealed',
          text: 'The ward unseals. The island freezes. Seek the northeast portal.',
        });
        this.emitSceneContextState();
      });
      return true;
    }

    /** Leave turn-based combat after sentinels fall; free-roam to the portal. */
    enterPortalExplorationMode() {
      this.disengageCombatBattle();
      const player = this.stats?.getEntity('player');
      if (player) {
        player.movementPointsRemaining = player.movementPoints;
        player.attackPointsRemaining = player.attackPoints;
        player.attackUsed = false;
        player.voidLockedTurnsRemaining = 0;
        player.guarding = false;
      }
      this.selectedCombatTargetId = null;
      this.refreshCombatTargetVisual();
      window.dispatchEvent(new CustomEvent(COMBAT_BATTLE_ENDED_EVENT));
      // Re-arm after battle-ended listeners — disengageCombatBattle disarms movement.
      this.movementArmed = true;
      if (this.playerImg) this.playerImg.setTint(0xaaffcc);
      this.refreshMovementHighlights();
      this.emitCombatStats();
    }

    restartCameraIdleDrift() {
      const cam = this.cameras.main;
      this.tweens.add({
        targets: cam,
        scrollX: cam.scrollX + 3,
        scrollY: cam.scrollY - 2,
        duration: 7000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    playPortalIceCutscene(onComplete) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const cam = this.cameras.main;
      const cx = cam.width / 2;
      const cy = cam.height / 2;
      const vw = cam.width;
      const vh = cam.height;

      this.cutsceneInputLock = true;
      this.tweens.killTweensOf(cam);

      const savedCam = {
        scrollX: cam.scrollX,
        scrollY: cam.scrollY,
        zoom: cam.zoom,
      };

      const overlay = this.add.container(cx, cy).setDepth(10000).setScrollFactor(0);

      const space = this.add.graphics();
      space.fillStyle(0x020610, 0.9);
      space.fillRect(-vw, -vh, vw * 2, vh * 2);
      overlay.add(space);

      const stars = this.add.graphics();
      for (let i = 0; i < 96; i += 1) {
        const sx = phaserRuntime.Math.Between(Math.floor(-vw * 0.48), Math.floor(vw * 0.48));
        const sy = phaserRuntime.Math.Between(Math.floor(-vh * 0.48), Math.floor(vh * 0.48));
        stars.fillStyle(0xffffff, phaserRuntime.Math.FloatBetween(0.15, 0.95));
        stars.fillCircle(sx, sy, phaserRuntime.Math.FloatBetween(0.6, 2.2));
      }
      overlay.add(stars);

      const islandView = this.add.graphics();
      islandView.fillStyle(0x1a2840, 0.95);
      islandView.fillEllipse(0, vh * 0.1, vw * 0.38, vh * 0.14);
      islandView.lineStyle(2, 0x4a6a8a, 0.7);
      islandView.strokeEllipse(0, vh * 0.1, vw * 0.38, vh * 0.14);
      overlay.add(islandView);

      const beam = this.add.graphics();
      beam.setBlendMode(phaserRuntime.BlendModes.ADD);
      overlay.add(beam);

      const flash = this.add.graphics();
      overlay.add(flash);

      const beamTargetY = vh * 0.1;
      const beamTopY = -vh * 0.72;
      let iceApplied = false;

      const drawBeam = (progress) => {
        beam.clear();
        const headY = beamTopY + progress * (beamTargetY - beamTopY);
        const width = 18 + progress * 52;
        beam.fillStyle(0x66aacc, 0.22);
        beam.fillTriangle(-width, headY, width, headY, 0, beamTargetY + 28);
        beam.fillStyle(0xe8f8ff, 0.82);
        beam.fillTriangle(-width * 0.32, headY + 42, width * 0.32, headY + 42, 0, beamTargetY + 14);
        if (progress > 0.62) {
          const impact = (progress - 0.62) / 0.38;
          beam.fillStyle(0xffffff, 0.35 * impact);
          beam.fillCircle(0, beamTargetY, 24 + impact * 96);
          beam.lineStyle(3, 0xc8eeff, 0.5 * impact);
          beam.strokeEllipse(0, beamTargetY, vw * 0.38 * (0.85 + impact * 0.15), vh * 0.14 * (0.85 + impact * 0.15));
        }
      };

      if (!reduced) {
        this.tweens.add({
          targets: cam,
          zoom: 0.5,
          duration: 1500,
          ease: 'Cubic.easeOut',
        });
      }

      this.events.emit('sentinel-ability', {
        type: 'sentinel-ability',
        logLines: ['[PORTAL] An ice ray answers from orbit — the island is in its crosshairs.'],
      });

      const finishCutscene = () => {
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          duration: reduced ? 220 : 520,
          onComplete: () => {
            overlay.destroy();
            this.tweens.add({
              targets: cam,
              zoom: savedCam.zoom,
              scrollX: savedCam.scrollX,
              scrollY: savedCam.scrollY,
              duration: 700,
              ease: 'Sine.easeInOut',
              onComplete: () => {
                this.cutsceneInputLock = false;
                this.restartCameraIdleDrift();
                onComplete?.();
              },
            });
          },
        });
      };

      if (reduced) {
        drawBeam(1);
        flash.fillStyle(0xd8eeff, 0.45);
        flash.fillRect(-vw, -vh, vw * 2, vh * 2);
        applyIceBiome(this);
        this.time.delayedCall(320, finishCutscene);
        return;
      }

      const duration = 4200;
      let elapsed = 0;
      const tick = this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          elapsed += 16;
          const p = Math.min(1, elapsed / duration);
          drawBeam(p);

          if (p > 0.68) {
            flash.clear();
            flash.fillStyle(0xd8eeff, 0.5 * (p - 0.68) / 0.32);
            flash.fillRect(-vw, -vh, vw * 2, vh * 2);
          }

          if (!iceApplied && p >= 0.76) {
            iceApplied = true;
            applyIceBiome(this);
            cam.shake(400, 0.007);
          }

          if (p >= 1) {
            tick.remove(false);
            finishCutscene();
          }
        },
      });
    }

    isPortalBeckoning() {
      return this.portalPhase === PORTAL_PHASE.BECKONING;
    }

    isPlayerAdjacentToPortal() {
      return this.isPlayerAdjacentToTile(PORTAL_TILE.tx, PORTAL_TILE.ty);
    }

    isPortalCleared() {
      return this.portalPhase === PORTAL_PHASE.CLEARED;
    }

    isPortalTeleported() {
      return this.portalPhase === PORTAL_PHASE.TELEPORTED;
    }

    tryEnterPortal() {
      if (this.isPortalCleared()) {
        return this.beginPolarisTeleport();
      }
      if (this.isPortalTeleported()) {
        this.showPlayerCastHint('the gate stands open — you have already crossed');
        return false;
      }
      if (!this.isPortalBeckoning()) {
        this.showPlayerCastHint('portal sealed');
        return false;
      }
      if (!this.isPlayerAdjacentToPortal()) {
        this.showPlayerCastHint('cross to the threshold');
        return false;
      }
      return this.spawnPortalWarden();
    }

    beginPolarisTeleport() {
      if (this.polarisTransitActive) return false;
      if (!this.isPlayerAdjacentToPortal()) {
        this.showPlayerCastHint('cross to the threshold');
        return false;
      }
      this.polarisTransitActive = true;
      this.cutsceneInputLock = true;
      this.portalPhase = PORTAL_PHASE.TELEPORTED;
      this.refreshPortalInteractionState();
      this.events.emit('polaris-teleport-start', { type: 'polaris-teleport-start' });
      this.events.emit('world-transition-request', {
        type: 'world-transition-request',
        targetMapId: POLARIS_FOREST_MAP_ID,
        sourceMapId: 'tutorial-island',
      });
      return true;
    }

    refreshPortalInteractionState() {
      if (!this.portalVisual) return;
      const beckoning = this.isPortalBeckoning();
      const cleared = this.isPortalCleared();
      if (beckoning || cleared) {
        this.portalVisual.setInteractive(
          this.portalHitArea,
          phaserRuntime.Geom.Rectangle.Contains,
        );
        this.portalVisual.input.cursor = 'pointer';
      } else {
        this.portalVisual.disableInteractive();
      }
    }

    applyPlayerFlipX(flipX) {
      const targets = [
        this.playerImg,
        ...Object.values(this.playerArmorLayers || {}),
        ...Object.values(this.armSegments || {}),
        ...Object.values(this.handPayloads || {}),
      ].filter(Boolean);
      targets.forEach((sprite) => sprite.setFlipX(flipX));
    }

    beginPlayerWalkMotion() {
      const bobTargets = [
        this.playerImg,
        ...Object.values(this.playerArmorLayers || {}),
      ].filter(Boolean);
      if (!this.playerImg) return bobTargets;

      this.playerImg.play('player-walk', true);
      Object.values(this.playerArmorLayers || {}).forEach((layer) => {
        if (layer?.visible && layer.texture?.key) {
          const baseAssetId = layer.texture.key.replace(/-f\d+$/, '');
          const walkKey = `${baseAssetId}-walk`;
          if (this.anims.exists(walkKey)) layer.play(walkKey, true);
        }
      });
      this.syncHandWeaponPresentation();

      if (this.idleTween) this.idleTween.pause();
      bobTargets.forEach((sprite) => { sprite.y = 0; sprite.scaleY = 1; });
      if (this.walkBob) this.walkBob.stop();
      this.walkBob = this.tweens.add({
        targets: bobTargets,
        y: -2.5,
        duration: 90,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return bobTargets;
    }

    endPlayerWalkMotion(bobTargets = []) {
      if (this.walkBob) {
        this.walkBob.stop();
        this.walkBob = null;
      }
      bobTargets.forEach((sprite) => { sprite.y = 0; sprite.scaleY = 1; });
      if (this.idleTween) this.idleTween.resume();
      if (!this.playerImg) return;
      this.playerImg.play('player-idle', true);
      Object.values(this.playerArmorLayers || {}).forEach((layer) => {
        if (layer?.visible && layer.texture?.key) {
          layer.stop();
          const baseAssetId = layer.texture.key.replace(/-f\d+$/, '');
          const idleKey = `${baseAssetId}-f0`;
          if (this.textures.exists(idleKey)) layer.setTexture(idleKey);
        }
      });
      this.syncHandWeaponPresentation();
    }

    snapPlayerToGridTile(tx, ty, { animate = false, duration = 380 } = {}) {
      if (!this.playerGridPos) return Promise.resolve(false);
      const fromTx = this.playerGridPos.tx;
      const faceRight = tx >= fromTx;
      this.applyPlayerFlipX(!faceRight);

      this.playerGridPos = { tx, ty };
      this.stats?.setPosition('player', tx, ty);
      this.refreshSortableEntityDepths();
      const tile = this.getIsoTarget(tx, ty);
      if (!this.playerContainer) {
        this.emitCombatStats();
        this.refreshMovementHighlights();
        return Promise.resolve(true);
      }
      if (animate) {
        const bobTargets = this.beginPlayerWalkMotion();
        return new Promise((resolve) => {
          this.tweens.add({
            targets: this.playerContainer,
            x: tile.x,
            y: tile.y,
            duration,
            ease: 'Cubic.easeInOut',
            onComplete: () => {
              this.endPlayerWalkMotion(bobTargets);
              this.emitCombatStats();
              this.refreshMovementHighlights();
              resolve(true);
            },
          });
        });
      }

      this.playerContainer.setPosition(tile.x, tile.y);
      this.emitCombatStats();
      this.refreshMovementHighlights();
      return Promise.resolve(true);
    }

    layoutPortalWardenDuel(duel = getPortalWardenDuelLayout()) {
      if (duel.boss.tx !== duel.player.tx) {
        const faceRight = duel.boss.tx > duel.player.tx;
        this.applyPlayerFlipX(!faceRight);
      }
      this.disarmMovement();
      this.isWalking = false;
      this.tweens.killTweensOf(this.playerContainer);
      return this.snapPlayerToGridTile(duel.player.tx, duel.player.ty, { animate: false });
    }

    spawnPortalWarden() {
      if (this.portalPhase !== PORTAL_PHASE.BECKONING || this.portalWarden) return false;
      const duel = getPortalWardenDuelLayout();
      this.layoutPortalWardenDuel(duel);
      const spawn = duel.boss;
      this.portalWarden = {
        id: PORTAL_WARDEN_ID,
        role: 'void-acolyte',
        label: VOID_ACOLYTE_STAT_DEFAULTS.label,
        shortLabel: VOID_ACOLYTE_STAT_DEFAULTS.shortLabel,
        tx: spawn.tx,
        ty: spawn.ty,
        defeated: false,
        aggroed: true,
        abilities: createVoidAcolyteAbilityState(),
      };
      this.portalPhase = PORTAL_PHASE.ENGAGED;
      this.refreshPortalInteractionState();
      this.stats.registerEntity(PORTAL_WARDEN_ID, {
        hp: VOID_ACOLYTE_STAT_DEFAULTS.hp,
        maxHp: VOID_ACOLYTE_STAT_DEFAULTS.maxHp,
        tx: spawn.tx,
        ty: spawn.ty,
        overrides: {
          intelligence: VOID_ACOLYTE_STAT_DEFAULTS.intelligence,
          movementPoints: VOID_ACOLYTE_STAT_DEFAULTS.movementPoints,
          attackRange: VOID_ACOLYTE_STAT_DEFAULTS.attackRange,
          attackPoints: 11,
        },
        scholomanceOverrides: VOID_ACOLYTE_STAT_DEFAULTS.scholomanceOverrides,
      });
      this.drawPortalWardenVisual(spawn.tx, spawn.ty);
      this.rebuildBlockedTiles();
      this.ensureCombatBattleEngaged();
      this.selectCombatTarget(PORTAL_WARDEN_ID);
      this.events.emit('portal-warden-spawn', {
        type: 'portal-warden-spawn',
        text: `${VOID_ACOLYTE_STAT_DEFAULTS.label} steps through the seal.`,
      });
      this.emitSceneContextState();
      this.time.delayedCall(180, () => {
        if (this.portalPhase === PORTAL_PHASE.ENGAGED && this.getPortalWardenRecord()) {
          this.performVoidAcolyteAttack(PORTAL_WARDEN_ID, 0);
        }
      });
      return true;
    }

    drawPortalWardenVisual(tx, ty) {
      if (this.portalWardenEffect?.container) {
        this.portalWardenEffect.container.destroy();
        this.portalWardenEffect = null;
      }

      const tile = this.getIsoTarget(tx, ty);
      const container = this.add.container(tile.x, tile.y);
      const wardenVisual = createVoid1WardenSprite(this, phaserRuntime);
      const playerTx = this.playerGridPos?.tx ?? getPortalWardenDuelLayout().player.tx;
      const faceLeft = tx > playerTx;
      wardenVisual.setFlip?.(faceLeft);
      const parts = [
        wardenVisual.shadow,
        ...(wardenVisual.containerLayers || []),
        wardenVisual.fallback,
        wardenVisual.targetRing,
      ].filter(Boolean);
      container.add(parts);
      container.setScale(0.25);
      container.setAlpha(0);

      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 480,
        ease: 'Back.easeOut',
      });

      this.portalWardenEffect = {
        container,
        wardenVisual,
        sprite: wardenVisual.sprite,
        fallback: wardenVisual.fallback,
        targetRing: wardenVisual.targetRing,
        shadow: wardenVisual.shadow,
        tx,
        ty,
      };
      this.refreshSortableEntityDepths();
      this.showPlayerCastHint('Void1 emerges!');
    }

    getPortalWardenRecord() {
      return this.portalWarden && !this.portalWarden.defeated ? this.portalWarden : null;
    }

    defeatPortalWarden() {
      const record = this.getPortalWardenRecord();
      if (!record) return false;
      record.defeated = true;
      const effect = this.portalWardenEffect;
      if (effect?.wardenVisual?.body?.anims) effect.wardenVisual.body.anims.stop();
      if (effect?.wardenVisual?.composite?.anims) effect.wardenVisual.composite.anims.stop();
      if (effect?.sprite?.anims) effect.sprite.anims.stop();
      if (effect?.container) {
        this.tweens.add({
          targets: effect.container,
          alpha: 0.15,
          y: effect.container.y + 24,
          duration: 700,
          ease: 'Quad.easeIn',
        });
      }
      this.portalPhase = PORTAL_PHASE.CLEARED;
      this.refreshPortalInteractionState();
      this.rebuildBlockedTiles();
      this.emitSceneContextState();
      this.spawnCombatLootChest(record.id, record.tx, record.ty);
      this.triggerCombatVictory({
        text: `${VOID_ACOLYTE_STAT_DEFAULTS.label} falls. The dimensional seal collapses.`,
      });
      this.scheduleDefeatedEnemyRemoval(PORTAL_WARDEN_ID, () => {
        this.removePortalWardenVisual();
      });
      return true;
    }

    redrawVoxelTerrain() {
      if (!this._terrainHeightmap) return;
      this.drawVoxelTerrain(this._terrainHeightmap, this._terrainSize, this._terrainRadius);
    }

    buildSentinelTargets() {
      return buildSentinelSceneTargets({
        sentinels: this.getSentinelRecords(),
        stats: this.stats,
      });
    }

    buildSceneTargetRegistry() {
      const sentinels = this.getSentinelRecords();
      return {
        sceneId: 'combat-arena',
        casterId: 'player',
        tick: this.turnTick ?? 0,
        selectedCombatTargetId: this.selectedCombatTargetId ?? null,
        sentinels: sentinels.map(({ id, defeated, aggroed }) => ({
          id,
          defeated: !!defeated,
          aggroed: !!aggroed,
        })),
        allSentinelsDefeated: areAllSentinelsDefeated(sentinels),
        combatVictoryAchieved: !!this.combatVictoryAchieved,
        portalPhase: this.portalPhase || PORTAL_PHASE.DORMANT,
        targets: [
          ...this.buildSentinelTargets(),
          ...((this.isPortalBeckoning() || this.isPortalCleared()) ? [{
            id: 'combat-portal',
            label: this.isPortalCleared() ? 'Polaris Gate' : 'Dimensional Portal',
            kind: 'structure',
            weaveObjects: ['PORTAL', 'VOID', 'SPIRIT', 'SONIC'],
            tx: PORTAL_TILE.tx,
            ty: PORTAL_TILE.ty,
            inRange: this.isPlayerAdjacentToPortal(),
            reachable: true,
            interactionPriority: 520,
            weaveAliases: Object.freeze(['PORTAL', 'GATE', 'VOID GATE']),
            metadata: { role: 'portal', portalPhase: this.portalPhase },
          }] : []),
          ...(this.getPortalWardenRecord() ? [{
            id: PORTAL_WARDEN_ID,
            label: VOID_ACOLYTE_STAT_DEFAULTS.label,
            kind: 'combatant',
            weaveObjects: [...VOID_ACOLYTE_STAT_DEFAULTS.weaveObjects],
            tx: this.portalWarden.tx,
            ty: this.portalWarden.ty,
            inRange: this.stats?.isInAttackRange?.('player', PORTAL_WARDEN_ID) ?? false,
            reachable: true,
            interactionPriority: VOID_ACOLYTE_STAT_DEFAULTS.interactionPriority,
            weaveAliases: Object.freeze(['ACOLYTE', 'WARDEN', 'VOID ACOLYTE']),
            metadata: {
              school: VOID_ACOLYTE_STAT_DEFAULTS.school,
              role: 'void-acolyte',
              boss: VOID_ACOLYTE_STAT_DEFAULTS.label,
              spriteAsset: VOID_ACOLYTE_STAT_DEFAULTS.spriteAsset,
              shortLabel: VOID_ACOLYTE_STAT_DEFAULTS.shortLabel,
              subtitle: VOID1_BOSS_SUBTITLE,
              aggroed: true,
            },
          }] : []),
          {
            id: 'obelisk',
            label: 'Central Obelisk',
            kind: 'structure',
            weaveObjects: ['OBELISK', 'STONE', 'FIRE', 'SPIRIT'],
            tx: 4,
            ty: 4,
            inRange: this.isPlayerAdjacentToTile(4, 4),
            reachable: this.obeliskState === 'active',
            interactionPriority: 450,
            metadata: {
              obeliskState: this.obeliskState,
              phase: this.obeliskFx?.phase,
              intensity: this.obeliskFx?.intensity,
            },
          },
          {
            id: 'stormheart-orb',
            label: 'Stormheart Orb',
            kind: 'loot',
            weaveObjects: ['SPIRIT', 'SOUL', 'FIRE'],
            tx: 4,
            ty: 4,
            inRange: this.isPlayerAdjacentToTile(4, 4),
            reachable: this.obeliskState === 'lowered' && !this.hasStormheartOrb(),
            interactionPriority: 250,
          },
          ...this.buildGatherableTargets(),
        ],
      };
    }

    emitSceneContextState() {
      const snapshot = this.buildSceneTargetRegistry();
      window.dispatchEvent(new CustomEvent('scene-context-state', { detail: snapshot }));
      return snapshot;
    }

    isCombatantAlive(targetId) {
      const entity = this.stats?.getEntity(targetId);
      if (!entity) return true;
      return entity.hp === null || entity.hp > 0;
    }

    getTargetableCombatantsOrdered() {
      const playerTx = this.playerGridPos?.tx ?? this.stats?.getEntity('player')?.position?.tx ?? 0;
      const playerTy = this.playerGridPos?.ty ?? this.stats?.getEntity('player')?.position?.ty ?? 0;
      return listTargetableCombatants(this.buildSceneTargetRegistry(), {
        playerTx,
        playerTy,
        isAlive: (targetId) => this.isCombatantAlive(targetId),
      });
    }

    emitCombatTargetSelected(targetId = this.selectedCombatTargetId) {
      const sceneContext = this.buildSceneTargetRegistry();
      const target = sceneContext.targets.find((entry) => entry.id === targetId);
      window.dispatchEvent(new CustomEvent('combat-target-selected', {
        detail: {
          targetId: targetId || null,
          label: target?.label || null,
          shortLabel: target?.metadata?.shortLabel || null,
          inRange: target?.inRange ?? false,
        },
      }));
    }

    refreshCombatTargetVisual() {
      for (const effect of this.torchEffects || []) {
        if (!effect.sentinelId || !effect.bobContainer) continue;
        const selected = effect.sentinelId === this.selectedCombatTargetId;
        if (!effect.targetRing) {
          const ring = this.add.graphics();
          ring.lineStyle(2.5, 0xff4466, 0.95);
          ring.strokeEllipse(0, -20, 54, 24);
          ring.setBlendMode(phaserRuntime.BlendModes.ADD);
          effect.bobContainer.add(ring);
          effect.targetRing = ring;
        }
        effect.targetRing.setVisible(selected);
      }
      if (this.portalWardenEffect?.targetRing) {
        const selected = this.selectedCombatTargetId === PORTAL_WARDEN_ID;
        this.portalWardenEffect.targetRing.setVisible(selected);
      }
    }

    selectCombatTarget(targetId) {
      if (!targetId) return false;
      const sceneContext = this.buildSceneTargetRegistry();
      const target = sceneContext.targets.find((entry) => entry.id === targetId);
      if (target?.kind !== 'combatant' || !this.isCombatantAlive(targetId)) return false;

      this.selectedCombatTargetId = targetId;
      this.refreshCombatTargetVisual();
      this.emitSceneContextState();
      this.emitCombatTargetSelected(targetId);
      return true;
    }

    cycleCombatTarget() {
      const ordered = this.getTargetableCombatantsOrdered();
      if (!ordered.length) return null;
      const nextId = cycleCombatTargetId(
        this.selectedCombatTargetId,
        ordered.map((entry) => entry.id),
      );
      return this.selectCombatTarget(nextId) ? nextId : null;
    }

    enrichObeliskAction(action) {
      if (!action?.isObelisk) return action;
      const next = {
        ...action,
        obeliskState: this.obeliskState || 'active',
      };
      if (this.obeliskState === 'active' && this.obeliskFx?.phase === 'charge' && this.obeliskFx.intensity >= 0.65) {
        next.obeliskClue = 'The runes are swollen with unread discharge.';
      }
      if (this.obeliskState === 'lowered') {
        next.obeliskClue = 'The obelisk has sunk into the plateau. Something gleams where the crown was.';
        next.hasStormheartOrb = !this.hasStormheartOrb();
      }
      if (this.obeliskState === 'looted') {
        next.obeliskClue = 'The obelisk is quiet. The crown socket is empty.';
      }
      return next;
    }

    hasStormheartOrb() {
      return hasItem(STORMHEART_ORB_ITEM_ID);
    }

    resolveObeliskCast(detail) {
      if (!this.obeliskFx || this.obeliskState !== 'active') return;
      const verdict = resolveObeliskPuzzle(
        {
          state: this.obeliskState,
          phase: this.obeliskFx.phase,
          intensity: this.obeliskFx.intensity,
        },
        {
          verse: detail.text || detail.verse || '',
          weave: detail.weave || '',
          bridge: detail.bridge || detail.combatScore?.bridge || null,
          combatScore: detail,
          playerAdjacent: this.isPlayerAdjacentToObelisk(),
        },
      );
      if (verdict.kind === 'overload') {
        this.beginObeliskDescent('overload', verdict);
      } else if (verdict.kind === 'siphon') {
        this.beginObeliskDescent('siphon', verdict);
      } else if (verdict.kind === 'none') {
        if (verdict.displayText) this.showPlayerCastHint(verdict.displayText);
        this.events.emit('obelisk-reject', {
          type: 'obelisk-reject',
          verdict,
          text: verdict.displayText,
          hint: verdict.hint,
          reason: verdict.reason,
        });
      }
    }

    getObeliskSinkDepth() {
      const fx = this.obeliskFx;
      if (!fx) return 280;
      const capHeight = fx.capHeight || 60;
      return fx.shaftHeight + capHeight + fx.bRadiusY + 36;
    }

    hideObeliskTower() {
      const fx = this.obeliskFx;
      if (fx) {
        fx.phase = 'lowered';
        fx.intensity = 0;
        fx.chargeGfx?.clear();
        fx.boltGfx?.clear();
        fx.chargeGfx?.setVisible(false);
        fx.boltGfx?.setVisible(false);
      }
      if (this.obeliskBody) {
        this.obeliskBody.setVisible(false);
        this.obeliskBody.setAlpha(0);
      }
    }

    restoreActiveObeliskTower() {
      if (this.obeliskState !== 'active') return;
      const fx = this.obeliskFx;
      if (this.obeliskBody) {
        this.obeliskBody.setPosition(0, 0);
        this.obeliskBody.setAlpha(1);
        this.obeliskBody.setVisible(true);
        this.obeliskBody.setDepth(ARENA_DEPTH.OBELISK_BODY);
      }
      if (fx) {
        fx.phase = 'charge';
        fx.intensity = 0;
        fx.chargeGfx?.setPosition(0, 0);
        fx.boltGfx?.setPosition(0, 0);
        fx.chargeGfx?.setVisible(true);
        fx.boltGfx?.setVisible(true);
        fx.chargeGfx?.setDepth(ARENA_DEPTH.OBELISK_CHARGE);
        fx.boltGfx?.setDepth(ARENA_DEPTH.OBELISK_BOLT);
        fx.chargeGfx?.clear();
        fx.boltGfx?.clear();
      }
      this.centerTileCap?.destroy();
      this.centerTileCap = null;
      this.obeliskCompartmentPit?.destroy();
      this.obeliskCompartmentPit = null;
    }

    drawIsoTileTop(graphics, pt, tw, th, zOffset, palette) {
      const py = pt.y - zOffset;
      const p1 = { x: pt.x, y: py - th / 2 };
      const p2 = { x: pt.x + tw / 2, y: py };
      const p3 = { x: pt.x, y: py + th / 2 };
      const p4 = { x: pt.x - tw / 2, y: py };
      const topColor = this.getLambertColor(0, 0, 1, palette);

      graphics.fillStyle(topColor, 1);
      graphics.beginPath();
      graphics.moveTo(p1.x, p1.y);
      graphics.lineTo(p2.x, p2.y);
      graphics.lineTo(p3.x, p3.y);
      graphics.lineTo(p4.x, p4.y);
      graphics.closePath();
      graphics.fillPath();

      graphics.lineStyle(1.5, palette.lit, 0.6);
      graphics.strokePath();
    }

    drawIsoTileCap(graphics, pt, tw, th, zOffset, palette, depth = 8) {
      const py = pt.y - zOffset;
      const p1 = { x: pt.x, y: py - th / 2 };
      const p2 = { x: pt.x + tw / 2, y: py };
      const p3 = { x: pt.x, y: py + th / 2 };
      const p4 = { x: pt.x - tw / 2, y: py };

      const topColor = this.getLambertColor(0, 0, 1, palette);
      const leftFaceColor = this.getLambertColor(-1, 1, 0, palette);
      const rightFaceColor = this.getLambertColor(1, 1, 0, palette);

      graphics.fillStyle(leftFaceColor, 1);
      graphics.beginPath();
      graphics.moveTo(p4.x, p4.y);
      graphics.lineTo(p3.x, p3.y);
      graphics.lineTo(p3.x, p3.y + depth);
      graphics.lineTo(p4.x, p4.y + depth);
      graphics.closePath();
      graphics.fillPath();

      graphics.fillStyle(rightFaceColor, 1);
      graphics.beginPath();
      graphics.moveTo(p3.x, p3.y);
      graphics.lineTo(p2.x, p2.y);
      graphics.lineTo(p2.x, p2.y + depth);
      graphics.lineTo(p3.x, p3.y + depth);
      graphics.closePath();
      graphics.fillPath();

      graphics.fillStyle(topColor, 1);
      graphics.beginPath();
      graphics.moveTo(p1.x, p1.y);
      graphics.lineTo(p2.x, p2.y);
      graphics.lineTo(p3.x, p3.y);
      graphics.lineTo(p4.x, p4.y);
      graphics.closePath();
      graphics.fillPath();

      graphics.lineStyle(1.5, palette.lit, 0.6);
      graphics.strokePath();
    }

    revealCenterCompartmentTile() {
      if (this.centerTileCap || !this.combatGridMetrics) return;
      const { tw, th, plateauZ, toIso } = this.combatGridMetrics;
      const pt = toIso(4, 4);
      const cap = this.add.graphics().setDepth(ARENA_DEPTH.CENTER_TILE_CAP);
      // Flush top face only — reads as a normal checker cell under the loot orb.
      this.drawIsoTileTop(cap, pt, tw, th, plateauZ, PALETTES.arcane_slate);
      this.centerTileCap = cap;
    }

    showObeliskCompartmentPit() {
      const fx = this.obeliskFx;
      const metrics = this.combatGridMetrics;
      if (!fx || !metrics) return null;
      const pit = this.add.graphics().setDepth(ARENA_DEPTH.COMPARTMENT_PIT);
      const inset = 0.42;
      const cx = fx.cx;
      const cy = fx.cy;
      const rx = fx.bRadiusX * inset;
      const ry = fx.bRadiusY * inset;
      const depthTint = PALETTES.obsidian.shadow;
      pit.fillStyle(depthTint, 0.92);
      pit.beginPath();
      pit.moveTo(cx, cy - ry);
      pit.lineTo(cx + rx, cy);
      pit.lineTo(cx, cy + ry);
      pit.lineTo(cx - rx, cy);
      pit.closePath();
      pit.fillPath();
      pit.lineStyle(2, PALETTES.royal_purple.lit, 0.55);
      pit.strokePath();
      pit.setAlpha(0);
      this.obeliskCompartmentPit = pit;
      return pit;
    }

    finalizeObeliskDescent(path, verdict) {
      this.obeliskState = 'lowered';
      const pit = this.obeliskCompartmentPit;
      if (pit) {
        this.tweens.add({
          targets: pit,
          alpha: 0,
          duration: 280,
          onComplete: () => {
            pit.destroy();
            if (this.obeliskCompartmentPit === pit) this.obeliskCompartmentPit = null;
          },
        });
      }
      this.hideObeliskTower();
      this.revealCenterCompartmentTile();
      if (this.bloomFx) this.bloomFx.strength = this.baseBloom;
      this.spawnStormheartOrb(path);
      grantScholomanceXpForAction(
        path === 'overload'
          ? SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_OVERLOAD
          : SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_SIPHON,
      );
      this.events.emit('obelisk-discovery', {
        type: 'obelisk-discovery',
        path,
        verdict,
        xpAmount: OBELISK_DISCOVERY_FLASH_XP,
        text: path === 'overload'
          ? 'The obelisk could not contain the verse.'
          : "You drank the tower's breath.",
      });
      this.emitSceneContextState();
    }

    beginObeliskDescent(path, verdict) {
      if (this.obeliskState !== 'active') return;
      this.obeliskState = path === 'overload' ? 'meltdown' : 'siphoned';
      if (path === 'siphon' && verdict?.manaGrant && this.stats) {
        this.stats.grantMovementPoints('player', verdict.manaGrant);
        this.emitCombatStats();
      }
      const fx = this.obeliskFx;
      if (fx) {
        fx.boltGfx?.clear();
        if (path === 'overload') {
          this.drawTeslaDischarge(1);
        } else {
          this.drawObeliskCharge(0.25);
        }
      }
      if (this.bloomFx) {
        this.bloomFx.strength = this.baseBloom + (path === 'overload' ? 1.5 : 0.5);
      }

      const sinkDepth = this.getObeliskSinkDepth();
      const duration = path === 'overload' ? 1400 : 2000;
      const pit = this.showObeliskCompartmentPit();
      const targets = [this.obeliskBody, fx?.chargeGfx, fx?.boltGfx].filter(Boolean);

      if (pit) {
        this.tweens.add({
          targets: pit,
          alpha: 1,
          duration: duration * 0.45,
          ease: 'Sine.easeOut',
        });
      }

      this.tweens.add({
        targets,
        y: `+=${sinkDepth}`,
        duration,
        ease: 'Cubic.easeIn',
        onComplete: () => this.finalizeObeliskDescent(path, verdict),
      });

      if (this.obeliskBody) {
        this.tweens.add({
          targets: this.obeliskBody,
          alpha: 0,
          duration: duration * 0.35,
          delay: duration * 0.55,
          ease: 'Quad.easeIn',
        });
      }
    }

    spawnStormheartOrb(path) {
      if (this.stormheartOrb || this.hasStormheartOrb()) {
        if (this.hasStormheartOrb()) this.obeliskState = 'looted';
        return;
      }
      const tile = this.getIsoTarget?.(4, 4);
      const stormheartItem = ITEM_DATABASE[STORMHEART_ORB_ITEM_ID];
      const textureKey = stormheartItem?.assetId || 'StormheartOrb';
      const ORB_GRIP_X = 19 / 64;
      const ORB_GRIP_Y = 55 / 128;
      const orbY = tile ? tile.y - 20 : ((this.obeliskFx?.cy || 0) - 20);
      const orb = this.add.sprite(tile?.x || 0, orbY, textureKey);
      orb.setOrigin(ORB_GRIP_X, ORB_GRIP_Y);
      orb.setScale(2.8);
      orb.setDepth(ARENA_DEPTH.STORMHEART_ORB);
      orb.setBlendMode(phaserRuntime.BlendModes.ADD);
      orb.setTint(path === 'siphon' ? 0xbbddff : 0xddbbff);
      orb.setAlpha(0.9);
      orb.setInteractive(new phaserRuntime.Geom.Circle(0, 0, 22), phaserRuntime.Geom.Circle.Contains);
      orb.interactData = { tx: 4, ty: 4, isGrid: true, isObelisk: true, isStormheartOrb: true };
      orb.inspectData = orb.interactData;
      orb.on('pointerover', () => this.input.setDefaultCursor('pointer'));
      orb.on('pointerout', () => this.input.setDefaultCursor('default'));
      this.stormheartOrb = orb;
      this.tweens.add({
        targets: orb,
        y: orb.y - 8,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: orb,
        alpha: 1,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    getCombatLootChestAt(tx, ty) {
      if (!Array.isArray(this.combatLootChests)) return null;
      return this.combatLootChests.find((entry) => entry.tx === tx && entry.ty === ty && !entry.opened) || null;
    }

    spawnCombatLootChest(enemyId, tx, ty) {
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
      if (this.getCombatLootChestAt(tx, ty)) return null;

      const plan = planCombatChestDrop(enemyId);
      const tile = this.getIsoTarget?.(tx, ty);
      if (!tile) return null;

      const chestId = `chest-${enemyId}-${tx}-${ty}-${this.combatLootChests?.length || 0}`;
      const floorY = tile.y;
      const sprite = this.add.sprite(tile.x, floorY, plan.textureKey);
      sprite.setOrigin(0.5, 55 / 80); // Chest bottom is at Y=55 in the 80x80 canvas
      sprite.setScale(1); // Make the chest proportionately realistic (body size is too big)
      sprite.setAlpha(0.35);

      sprite.setInteractive(new phaserRuntime.Geom.Rectangle(-20, -28, 40, 28), phaserRuntime.Geom.Rectangle.Contains);
      sprite.interactData = {
        tx,
        ty,
        isGrid: true,
        isLootChest: true,
        chestId,
        chestTier: plan.tier,
        chestLabel: plan.label,
      };
      sprite.inspectData = sprite.interactData;

      const record = {
        id: chestId,
        enemyId,
        tx,
        ty,
        tier: plan.tier,
        label: plan.label,
        textureKey: plan.textureKey,
        loot: plan.loot,
        opened: false,
        sprite,
        idleEmitter: null,
      };

      // Ensure idleEmitter gets linked properly right after record creation
      // We will assign it below when particles are created.

      if (!Array.isArray(this.combatLootChests)) this.combatLootChests = [];
      this.combatLootChests.push(record);

      sprite.on('pointerover', () => this.input.setDefaultCursor('pointer'));
      sprite.on('pointerout', () => this.input.setDefaultCursor('default'));
      sprite.on('pointerdown', (pointer) => {
        if (pointer.button !== 0 || this.cutsceneInputLock) return;
        this.openCombatLootChest(chestId);
      });

      this.tweens.add({
        targets: sprite,
        alpha: 1,
        scaleX: 0.525,
        scaleY: 0.525,
        duration: 420,
        ease: 'Back.easeOut',
      });

      let idleEmitter = null;
      if (this.add.particles && this.textures.exists('twinkle-star')) {
        idleEmitter = this.add.particles(tile.x, floorY - 10, 'twinkle-star', {
          scale: { start: 0.3, end: 0 },
          alpha: { start: 0.7, end: 0 },
          tint: 0xffd700,
          speed: { min: 2, max: 8 },
          lifespan: 1400,
          frequency: 300,
          gravityY: -8,
          blendMode: 'ADD',
        });
      }

      this.events.emit('combat-chest-spawn', {
        type: 'combat-chest-spawn',
        chestId,
        enemyId,
        tx,
        ty,
        tier: plan.tier,
        label: plan.label,
        hasLoot: Boolean(plan.loot),
      });
      if (idleEmitter) {
        record.idleEmitter = idleEmitter;
      }
      this.refreshSortableEntityDepths();
      return record;
    }

    openCombatLootChest(chestId) {
      const chest = this.combatLootChests?.find((entry) => entry.id === chestId && !entry.opened);
      if (!chest) return null;

      chest.opened = true;
      if (chest.idleEmitter) {
        chest.idleEmitter.stop();
        chest.idleEmitter.destroy();
        chest.idleEmitter = null;
      }

      if (this.add.particles && chest.sprite && this.textures.exists('twinkle-star')) {
        const x = chest.sprite.x;
        const y = chest.sprite.y - 15;
        const d = chest.sprite.depth + 1;
        const burst = this.add.particles(x, y, 'twinkle-star', {
          scale: { start: 0.5, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: [0xffd700, 0xffaa00, 0xffffff, 0xffff00],
          speed: { min: 40, max: 120 },
          lifespan: { min: 400, max: 900 },
          gravityY: 150,
          emitting: false,
          blendMode: 'ADD',
        });
        burst.setDepth(d);
        burst.explode(60); // actual wealth explosion
        this.time.delayedCall(1200, () => burst.destroy());
      }

      const finalizeOpen = () => this.finalizeCombatLootChestOpen(chest);

      const unlockService = getGameChestUnlockService();
      if (unlockService) {
        unlockService.playUnlock();
      }

      if (chest.sprite) {
        const animKey = getLootChestOpenAnimKey(chest.tier);
        if (this.anims.exists(animKey)) {
          chest.sprite.play(animKey);
          chest.sprite.once('animationcomplete', (animation) => {
            if (animation.key !== animKey) return;
            finalizeOpen();
          });
          return chest;
        }
        finalizeOpen();
        return chest;
      }

      return finalizeOpen();
    }

    finalizeCombatLootChestOpen(chest) {
      if (chest.sprite) {
        this.tweens.add({
          targets: chest.sprite,
          alpha: 0,
          scaleX: 0.525 * 1.2,
          scaleY: 0.525 * 1.2,
          y: chest.sprite.y - 8,
          duration: 220,
          onComplete: () => {
            chest.sprite?.destroy();
            chest.sprite = null;
          },
        });
      }

      if (!chest.loot) {
        this.events.emit('combat-loot', {
          type: 'combat-loot',
          enemyId: chest.enemyId,
          chestTier: chest.tier,
          chestLabel: chest.label,
          granted: false,
          empty: true,
          text: `${chest.label} — empty.`,
        });
        return { empty: true, chest };
      }

      const outcome = resolveCombatLootGrant(chest.loot, { hasItem, grantItem });
      this.events.emit('combat-loot', {
        type: 'combat-loot',
        enemyId: outcome.enemyId,
        itemId: outcome.itemId,
        itemName: outcome.itemName,
        chestTier: chest.tier,
        chestLabel: chest.label,
        duplicate: Boolean(outcome.duplicate),
        inventoryFull: Boolean(outcome.inventoryFull),
        granted: Boolean(outcome.granted),
        text: outcome.text,
      });
      return outcome;
    }

    tryLootStormheartOrb() {
      if (this.obeliskState !== 'lowered') return false;
      if (this.hasStormheartOrb()) {
        this.obeliskState = 'looted';
        this.events.emit('obelisk-loot', {
          type: 'obelisk-loot',
          duplicate: true,
          itemId: STORMHEART_ORB_ITEM_ID,
          text: 'The crown socket is empty.',
        });
        return true;
      }
      grantItem(STORMHEART_ORB_ITEM_ID);
      grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT, { duplicate: false });
      this.obeliskState = 'looted';
      if (this.stormheartOrb) {
        this.tweens.add({
          targets: this.stormheartOrb,
          alpha: 0,
          scaleX: 1.4,
          scaleY: 1.4,
          duration: 350,
          onComplete: () => {
            this.stormheartOrb?.destroy();
            this.stormheartOrb = null;
          },
        });
      }
      this.events.emit('obelisk-loot', {
        type: 'obelisk-loot',
        itemId: STORMHEART_ORB_ITEM_ID,
        itemName: 'Stormheart Orb',
        text: 'Stormheart Orb acquired.',
      });
      return true;
    }

    handleEquipmentChange = (event) => {
      const equipment = event.detail || {};
      this._lastEquipment = equipment;
      if (!this.playerArmorLayers) return;

      // Armor layers (frame-locked to the body).
      const armorMap = {
        head: this.playerArmorLayers.head,
        chest: this.playerArmorLayers.chest,
        legs: this.playerArmorLayers.legs,
        boots: this.playerArmorLayers.boots,
      };
      for (const [slot, sprite] of Object.entries(armorMap)) {
        if (!sprite) continue;
        const item = equipment[slot];
        const frame0Id = item ? `${item.assetId}-f0` : null;
        if (frame0Id && this.textures.exists(frame0Id)) {
          sprite.setTexture(frame0Id);
          sprite.setVisible(true);
        } else {
          sprite.setVisible(false);
        }
      }

      // Hands: route every equipped item to a hand by its slot (main/off).
      const hands = { mainHand: null, offHand: null };
      for (const item of Object.values(equipment)) {
        const slot = equipSlotOf(item);
        if (slot) hands[slot] = item;
      }
      for (const slot of ['mainHand', 'offHand']) {
        const payload = this.handPayloads && this.handPayloads[slot];
        if (!payload) continue;
        const item = hands[slot];
        const presentation = slot === 'offHand' ? getHoldPresentation(item) : null;
        const frame0Id = item ? `${item.assetId}-f0` : null;
        if (frame0Id && this.textures.exists(frame0Id)) {
          payload.setTexture(frame0Id);
          payload.setVisible(true);
          if (presentation?.idleAnim) {
            this.ensureOrbIdleAnimation(item.assetId);
            payload.play(`${item.assetId}-idle`);
          } else if (payload.anims?.isPlaying) {
            payload.stop();
          }
        } else {
          payload.setVisible(false);
          if (payload.anims?.isPlaying) payload.stop();
        }
      }

      this.applyArmPose('carry', { equipment });
      this.syncHandWeaponPresentation(equipment);

        this.syncEquippedGatherTools(equipment);

        if (this.stats) {
        const modifiers = aggregateEquipmentBonuses(equipment);
        this.stats.applyEquipmentModifiers('player', modifiers);
        this.emitCombatStats();
      }
    };
    
    resolveCarryPoseName = (equipment = this._lastEquipment) => {
      const offItem = equipment?.offhand;
      return getHoldPresentation(offItem)?.pose === 'orbHold' ? 'orbHold' : 'carry';
    };

    ensureOrbIdleAnimation = (assetId) => {
      return this.ensureHandItemIdleAnimation(assetId, [0, 1, 2, 3, 2, 1], 5);
    };

    ensureHandItemIdleAnimation = (assetId, sequence = [0, 1, 2, 3, 2, 1], frameRate = 6) => {
      const key = `${assetId}-idle`;
      if (this.anims.exists(key)) return key;
      const frames = sequence
        .filter((index) => this.textures.exists(`${assetId}-f${index}`))
        .map((index) => ({ key: `${assetId}-f${index}` }));
      if (!frames.length) return null;
      this.anims.create({ key, frames, frameRate, repeat: -1 });
      return key;
    };

    syncHandWeaponPresentation = (equipment = this._lastEquipment) => {
      const weapon = equipment?.weapon;
      const payload = this.handPayloads?.mainHand;
      if (!payload || !weapon?.assetId || !payload.visible) return;

      if (this.isWalking) {
        const walkKey = `${weapon.assetId}-walk`;
        if (this.anims.exists(walkKey)) {
          payload.play(walkKey, true);
        } else if (payload.anims?.isPlaying) {
          payload.stop();
        }
        return;
      }

      if (weapon.idleAnim) {
        const idleKey = this.ensureHandItemIdleAnimation(weapon.assetId);
        if (idleKey && this.anims.exists(idleKey)) {
          payload.play(idleKey, true);
          return;
        }
      }

      if (payload.anims?.isPlaying) payload.stop();
      const restKey = `${weapon.assetId}-f0`;
      if (this.textures.exists(restKey)) payload.setTexture(restKey);
    };

    stopOrbHoldFloat = () => {
      if (this._orbHoldFloatTween) {
        this._orbHoldFloatTween.stop();
        this._orbHoldFloatTween = null;
      }
    };

    startOrbHoldFloat = (payload) => {
      this.stopOrbHoldFloat();
      if (!payload) return;
      this._orbHoldFloatTween = this.tweens.add({
        targets: payload,
        y: payload.y - 2,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };

    applyArmPose = (poseName, options = {}) => {
      if (!this.armSegments || !this._rigCanvas) return;
      const equipment = options.equipment || this._lastEquipment || {};
      const effectivePoseName = poseName === 'carry' ? this.resolveCarryPoseName(equipment) : poseName;
      const pose = getPose(effectivePoseName);
      const offPresentation = getHoldPresentation(equipment?.offhand);
      const { OX, OY, CANVAS_W, CANVAS_H } = this._rigCanvas;
      this.stopOrbHoldFloat();

      for (const side of ['right', 'left']) {
        const arm = ARM_RIG[side];
        const solved = solveArm(arm, pose[side]);
        solved.forEach((r, i) => {
          const seg = arm.segments[i];
          const spriteKey = side === 'left' && offPresentation && seg.palmSpriteKey && effectivePoseName === 'orbHold'
            ? offPresentation.handSpriteKey
            : seg.spriteKey;
          const sprite = this.armSegments[seg.spriteKey];
          if (!sprite) return;
          if (sprite.texture.key !== spriteKey && this.textures.exists(spriteKey)) {
            sprite.setTexture(spriteKey);
          } else if (side === 'left' && !offPresentation && seg.spriteKey && sprite.texture.key !== seg.spriteKey) {
            sprite.setTexture(seg.spriteKey);
          }
          sprite.setPosition(r.jointX - OX, r.jointY - OY);
          sprite.setRotation(r.angleRad);
        });

        const handSeg = arm.segments.find((s) => s.gripPoint);
        const payload = side === 'right' ? this.handPayloads.mainHand : this.handPayloads.offHand;
        if (!payload || !handSeg) continue;

        const offItem = equipment?.offhand;
        const usePalmCradle = side === 'left' && offPresentation && equipSlotOf(offItem) === 'offHand';
        if (usePalmCradle) {
          const anchor = anchorWorld(arm, pose[side], offPresentation.cradleAnchorKey);
          const holdAnchor = offPresentation.holdAnchor;
          payload.setOrigin(holdAnchor.x / CANVAS_W, holdAnchor.y / CANVAS_H);
          payload.setPosition(anchor.x - OX, anchor.y - OY);
          payload.setRotation(anchor.angleRad);
          this.startOrbHoldFloat(payload);
          continue;
        }

        const grip = gripWorld(arm, pose[side]);
        const handItem = side === 'right' ? equipment?.weapon : equipment?.offhand;
        const origin = this.resolveHandItemOrigin(payload, handItem, handSeg, CANVAS_W, CANVAS_H);
        payload.setOrigin(origin.x, origin.y);
        payload.setPosition(grip.x - OX, grip.y - OY);
        payload.setRotation(grip.angleRad);
      }
    };

    resolveHandItemOrigin = (payload, item, handSeg, canvasW, canvasH) => {
      if (item?.holdAnchor) {
        const tex = payload?.texture?.get?.() || payload?.texture?.source?.[0];
        const texW = tex?.width || canvasW;
        const texH = tex?.height || canvasH;
        return {
          x: item.holdAnchor.x / texW,
          y: item.holdAnchor.y / texH,
        };
      }
      return {
        x: handSeg.gripPoint.x / canvasW,
        y: handSeg.gripPoint.y / canvasH,
      };
    };

    createSwingTextures = () => {
      if (this.textures.exists('slash-streak')) return;
      // A horizontal tapered lens (pointed at both ends, thick in the middle) — a
      // motion-blur streak that glides across as a level slash, NOT a rotating
      // crescent. 200 wide x 40 tall, points meeting at the left/right tips.
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillPoints([
        { x: 0, y: 20 }, { x: 55, y: 3 }, { x: 145, y: 3 },
        { x: 200, y: 20 }, { x: 145, y: 37 }, { x: 55, y: 37 },
      ], true);
      g.generateTexture('slash-streak', 200, 40);
      g.destroy();
    };

    // Apply explicit right-arm joint angles for one animation frame (null = rest).
    // The FK sets each segment + the sword's POSITION (the hand translates the
    // sword across). `swordRotRad`, when provided, orients the blade independently
    // of the hand's spin so the BLADE leads the slash instead of pivoting like a
    // wrench; without it the sword just follows the hand (rest/carry).
    _overrideRightArm = (anglesDeg, swordRotRad = null) => {
      if (!this.armSegments || !this._rigCanvas) return;
      const { OX, OY, CANVAS_W, CANVAS_H } = this._rigCanvas;
      const arm = ARM_RIG.right;
      const use = anglesDeg || getPose('carry').right;
      const solved = solveArm(arm, use);
      solved.forEach((r, i) => {
        const s = this.armSegments[arm.segments[i].spriteKey];
        if (!s) return;
        s.setPosition(r.jointX - OX, r.jointY - OY);
        s.setRotation(r.angleRad);
      });
      const handSeg = arm.segments.find((s) => s.gripPoint);
      const grip = gripWorld(arm, use);
      const payload = this.handPayloads && this.handPayloads.mainHand;
      if (payload && handSeg) {
        const equipment = this._lastEquipment || {};
        const origin = this.resolveHandItemOrigin(payload, equipment.weapon, handSeg, CANVAS_W, CANVAS_H);
        payload.setOrigin(origin.x, origin.y);
        payload.setPosition(grip.x - OX, grip.y - OY);
        payload.setRotation(swordRotRad != null ? swordRotRad : grip.angleRad);
      }
    };

    performSwing = (_element) => {
      this.emitSwordSliceSfx();

      const SWING_BPM = 120;
      const SWING_DEG_PER_BEAT = 360;   // gear-glide: 250ms for a 180° arc
      const ARC = Math.PI;
      const strikeMs = getTimeForRotation(ARC, SWING_BPM, SWING_DEG_PER_BEAT);
      const WINDUP_MS = 150;
      const RECOVER_MS = 240;

      const rest = getPose('carry').right;
      const windup = getPose('swingWindup').right;
      const strike = getPose('swing').right;
      const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
      const lerp1 = (a, b, t) => a + (b - a) * t;
      const D2R = phaserRuntime.Math.DegToRad;
      // Blade orientation (deg) so the BLADE edge leads a right->left slash. These
      // are the opposite sense to the hand's spin (which pointed the handle first).
      // Flip the signs if the blade still trails.
      const BLADE_WIND = 50;    // cocked, blade raised (blade leads, not handle)
      const BLADE_STRIKE = 110; // followed-through, blade sweeps across leading-edge first

      const finish = () => this._overrideRightArm(null);

      // Phase 1 — windup: cock the arm out and raise the blade.
      const p1 = { t: 0 };
      this.tweens.add({
        targets: p1, t: 1, duration: WINDUP_MS, ease: 'Quad.easeOut',
        onUpdate: () => this._overrideRightArm(lerp(rest, windup, p1.t), D2R(lerp1(0, BLADE_WIND, p1.t))),
        onComplete: () => {
          // Phase 2 — strike: gear-glide-driven lateral sweep; the blade leads.
          // No traveling streak here — the "slice" reads at the impact zone
          // (showHitFeedback), so the swing itself stays clean.
          const p2 = { v: 0 };
          this.tweens.add({
            targets: p2, v: 1, duration: strikeMs, ease: 'Quad.easeIn',
            onUpdate: () => {
              const phase = Math.min(ARC, getRotationAtTime(p2.v * strikeMs, SWING_BPM, SWING_DEG_PER_BEAT)) / ARC;
              this._overrideRightArm(lerp(windup, strike, phase), D2R(lerp1(BLADE_WIND, BLADE_STRIKE, phase)));
            },
            onComplete: () => {
              // Phase 3 — recover: settle arm + blade back to carry.
              const p3 = { t: 0 };
              this.tweens.add({
                targets: p3, t: 1, duration: RECOVER_MS, ease: 'Sine.easeInOut',
                onUpdate: () => this._overrideRightArm(lerp(strike, rest, p3.t), D2R(lerp1(BLADE_STRIKE, 0, p3.t))),
                onComplete: finish,
              });
            },
          });
        },
      });
      // Safety: guarantee the arm returns to rest even if a tween is interrupted.
      this.time.delayedCall(WINDUP_MS + strikeMs + RECOVER_MS + 150, finish);
    };

    floatingNumber = (x, y, text, color) => {
      const label = this.add.text(x, y, text, {
        fontFamily: 'monospace', fontSize: '22px', color, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(60);
      this.tweens.add({ targets: label, y: y - 48, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => label.destroy() });
    };

    // A compact arcane cut at the point of impact — two short crossed slashes that
    // draw fast and fade, plus a tight spark burst. Contained to the target, NOT a
    // wide wind-sweep.
    impactSlash = (x, y, color) => {
      for (const ang of [-24, 8]) {
        const cut = this.add.sprite(x, y, 'slash-streak');
        cut.setDepth(62).setBlendMode(phaserRuntime.BlendModes.ADD).setTint(color)
          .setRotation(phaserRuntime.Math.DegToRad(ang)).setScale(0.04, 0.09).setAlpha(1);
        this.tweens.add({ targets: cut, scaleX: 0.3, duration: 80, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: cut, alpha: 0, delay: 70, duration: 150, onComplete: () => cut.destroy() });
      }
      if (this.add.particles && this.textures.exists('doom-fire')) {
        const spark = this.add.particles(x, y, 'doom-fire', {
          speed: { min: 40, max: 130 }, lifespan: 220, quantity: 9, angle: { min: 190, max: 350 },
          scale: { start: 0.24, end: 0 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD', tint: color,
        });
        this.time.delayedCall(80, () => spark && spark.stop());
        this.time.delayedCall(400, () => spark && spark.destroy());
      }
    };

    getTargetPresentation = (targetId) => {
      if (targetId === 'player' && this.playerContainer) {
        return {
          container: this.playerContainer,
          sprite: this.playerImg,
          anchorX: this.playerContainer.x,
          anchorY: this.playerContainer.y,
        };
      }

      if (isSentinelId(targetId)) {
        const effect = this.getSentinelTorchEffect(targetId);
        if (effect?.bobContainer) {
          return {
            container: effect.bobContainer,
            sprite: effect.fireSprite || effect.bobContainer,
            anchorX: effect.anchorX,
            anchorY: effect.anchorY,
          };
        }
      }

      if (isPortalWardenId(targetId) && this.portalWardenEffect?.container) {
        return {
          container: this.portalWardenEffect.container,
          sprite: this.portalWardenEffect.sprite || this.portalWardenEffect.container,
          anchorX: this.portalWardenEffect.container.x,
          anchorY: this.portalWardenEffect.container.y,
        };
      }

      if (targetId === 'obelisk' && this.obeliskBody) {
        return {
          sprite: this.obeliskBody,
          anchorX: this.obeliskBody.x,
          anchorY: this.obeliskBody.y,
        };
      }

      if (targetId === 'stormheart-orb' && this.stormheartOrb) {
        return {
          sprite: this.stormheartOrb,
          anchorX: this.stormheartOrb.x,
          anchorY: this.stormheartOrb.y,
        };
      }

      if (targetId?.startsWith('gather:')) {
        const coords = targetId.slice('gather:'.length).split(',');
        const tx = Number(coords[0]);
        const ty = Number(coords[1]);
        const z = Number(coords[2]);
        const pick = (this.latticePickCandidates || []).find((entry) => {
          const cell = entry.cell || {};
          const cellTx = cell.combatTx ?? cell.x;
          const cellTy = cell.combatTy ?? cell.z;
          return cellTx === tx && cellTy === ty && cell.z === z;
        });
        if (pick?.gameObject) {
          return {
            sprite: pick.gameObject,
            anchorX: pick.gameObject.x,
            anchorY: pick.gameObject.y,
          };
        }
      }

      return null;
    };

    showHitFeedback = (targetId, { color, amount, prefix = '-', delay = 0 }) => {
      const presentation = this.getTargetPresentation(targetId);
      const fire = () => {
        if (presentation?.sprite?.setTint) {
          const baseTint = presentation.tintBase;
          presentation.sprite.setTint(color);
          this.tweens.add({
            targets: presentation.sprite,
            alpha: 0.6,
            yoyo: true,
            duration: 90,
            repeat: 1,
            onComplete: () => {
              if (baseTint != null) presentation.sprite.setTint(baseTint);
              else presentation.sprite.clearTint?.();
            },
          });
        }

        const anchorX = presentation?.container?.x ?? presentation?.anchorX;
        const anchorY = presentation?.container?.y ?? presentation?.anchorY;
        if (anchorX != null && anchorY != null) {
          this.impactSlash(anchorX, anchorY - 44, color);
          const hex = `#${color.toString(16).padStart(6, '0')}`;
          this.floatingNumber(anchorX, anchorY - 60, `${prefix}${amount}`, hex);
        }
      };
      if (delay > 0) this.time.delayedCall(delay, fire);
      else fire();
    };

    showFizzle = () => {
      if (!this.playerContainer) return;
      const puff = this.add.text(this.playerContainer.x, this.playerContainer.y - 70, 'fizzle', {
        fontFamily: 'monospace', fontSize: '14px', color: '#9aa0a6', fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(60);
      this.tweens.add({ targets: puff, y: puff.y - 30, alpha: 0, duration: 700, onComplete: () => puff.destroy() });
    };

    showPlayerCastHint = (text) => {
      if (!this.playerContainer || !text) return;
      if (this._playerCastHint) {
        this._playerCastHint.destroy();
        this._playerCastHint = null;
      }
      const hint = this.add.text(this.playerContainer.x, this.playerContainer.y - 82, text, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e8c170',
        fontStyle: 'italic',
        stroke: '#1a1208',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(62);
      this._playerCastHint = hint;
      this.tweens.add({
        targets: hint,
        y: hint.y - 28,
        alpha: 0,
        duration: 1100,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (this._playerCastHint === hint) this._playerCastHint = null;
          hint.destroy();
        },
      });
    };

    buildPlayerCombatStatsDetail = (playerEntity) => ({
      hp: playerEntity.hp,
      maxHp: playerEntity.maxHp,
      movementPointsRemaining: playerEntity.movementPointsRemaining,
      movementPoints: playerEntity.movementPoints,
      attackPoints: playerEntity.attackPoints,
      attackPointsRemaining: playerEntity.attackPointsRemaining,
      attackRange: playerEntity.attackRange,
      attackUsed: playerEntity.attackUsed,
      spellweaveUsed: playerEntity.spellweaveUsed,
      manaPoints: playerEntity.manaPoints,
      manaPointsRemaining: playerEntity.manaPointsRemaining,
      manaUsed: playerEntity.manaUsed,
      scholomance: getEffectiveScholomance(playerEntity),
      icicleSlamCooldown: playerEntity.icicleSlamCooldown ?? 0,
      grantedAbilities: Array.isArray(playerEntity.grantedAbilities)
        ? [...playerEntity.grantedAbilities]
        : [],
      battleEngaged: !!this.combatBattleEngaged,
    });

    emitCombatStats = () => {
      const p = this.stats?.getEntity('player');
      if (!p) return;
      this.emitSceneContextState();
      window.dispatchEvent(new CustomEvent('combat-stats-changed', {
        detail: this.buildPlayerCombatStatsDetail(p),
      }));
      this.refreshMovementHighlights();
    };

    resolveCastTargets(options = {}) {
      if (options.castDetail) {
        const cast = options.castDetail;
        this._incantation = {
          verse: cast.text || cast.verse || '',
          weave: cast.weave || '',
        };
      }

      const sceneContext = options.sceneContext || this.buildSceneTargetRegistry();
      const weave = this._incantation.weave || '';
      let resolvedTargets = options.resolvedTargets;
      if (!resolvedTargets) {
        resolvedTargets = weave.trim()
          ? resolveWeaveTargetsFromParsed(parseWeave(weave), sceneContext, weave)
          : { primaryTargetId: null, unresolvedObjects: [], clauses: [] };
      }

      const canReachTarget = (id) => (
        this.stats?.isInAttackRange('player', id)
        || this.stats?.canCastSpell('player', id)
        || this.stats?.canAttack('player', id)
      );
      resolvedTargets = mergeSelectedCombatTarget(
        resolvedTargets,
        this.selectedCombatTargetId,
        sceneContext,
        { canAttack: canReachTarget },
      );

      return { sceneContext, weave, resolvedTargets };
    }

    performIcicleSlam = async () => {
      if (!this.stats || !this.combatBattleEngaged) return;

      const targetId = this.selectedCombatTargetId
        || this.buildSceneTargetRegistry().targets.find((entry) => (
          entry.kind === 'combatant' && entry.inRange && this.isCombatantAlive(entry.id)
        ))?.id;

      if (!targetId) {
        this.showFizzle();
        return;
      }

      const result = resolvePlayerIcicleSlam(this.stats, 'player', targetId);
      if (!result) {
        this.showFizzle();
        return;
      }

      const presentation = this.getTargetPresentation(targetId);
      const entity = this.stats.getEntity(targetId);
      const tile = entity ? this.getIsoTarget?.(entity.position.tx, entity.position.ty) : null;
      const targetX = presentation?.anchorX ?? tile?.x ?? 0;
      const targetY = presentation?.anchorY ?? tile?.y ?? 0;

      this.showPlayerCastHint('icicle slam!');
      const iceImpact = getGameIceSpellImpactService();
      iceImpact.prime();
      iceImpact.setEnabled(true);

      playIcicleBlastVfx(this, {
        targetX,
        targetY,
        hitCount: result.hitCount,
        phaserRuntime,
        onHit: (index) => {
          const hit = applyPlayerIcicleSlamHit(this.stats, targetId, result.damagePerHit);
          if (!hit) return;
          void iceImpact.playImpact?.();
          this.showHitFeedback(targetId, {
            color: 0x66ccff,
            amount: hit.damage,
            delay: 0,
          });
          if (index === 0) {
            this.sessionTelemetry?.recordPlayerAttack?.({
              damage: result.totalDamage,
              targetId,
              elemental: true,
              abilityId: result.abilityId,
            });
          }
          this.emitCombatStats();
          const targetEntity = this.stats.getEntity(targetId);
          if (targetEntity && isSentinelId(targetId) && targetEntity.hp <= 0) {
            this.defeatSentinel(targetId);
          }
          if (targetEntity && isPortalWardenId(targetId) && targetEntity.hp <= 0) {
            this.defeatPortalWarden();
          }
        },
      });
    };

    performBasicAttack = async () => {
      if (!this.stats || !this.combatBattleEngaged) return;

      const { sceneContext, weave, resolvedTargets: baseTargets } = this.resolveCastTargets({});
      let resolvedTargets = baseTargets;

      // Bare swing with no weave: nearest in-range combatant (tutorial scaffolding only).
      if (!resolvedTargets.primaryTargetId && !weave.trim()) {
        const fallbackCombatant = sceneContext.targets.find(
          (entry) => entry.kind === 'combatant' && entry.inRange && entry.reachable !== false,
        );
        if (fallbackCombatant) {
          resolvedTargets = { ...resolvedTargets, primaryTargetId: fallbackCombatant.id };
        }
      }

      const targetId = resolvedTargets.primaryTargetId;

      if (!targetId) {
        this.showFizzle();
        window.dispatchEvent(new CustomEvent('combat-target-miss', {
          detail: {
            weave,
            unresolvedObjects: resolvedTargets.unresolvedObjects,
            message: 'No valid target bound to the weave.',
          },
        }));
        return;
      }

      const target = sceneContext.targets.find((entry) => entry.id === targetId);

      if (targetId === 'obelisk') {
        try {
          const doc = analyzeText(this._incantation.verse || '');
          const base = await this.scoringEngine.calculateScore(doc);
          const scoreData = normalizeCombatScore(base, {
            scrollText: this._incantation.verse,
            weave,
          }) || {};
          this.resolveObeliskCast({
            ...scoreData,
            text: this._incantation.verse,
            weave,
            sceneContext,
            resolvedTargets,
          });
        } catch (err) {
          console.warn('[combat] obelisk cast failed.', err);
          this.showFizzle();
        }
        return;
      }

      if (target?.kind === 'gatherable' && target.metadata?.targetCell) {
        const tool = this.getPrimaryGatherTool();
        if (tool) {
          this.submitGatherIntent(
            {
              ...target.metadata.targetCell,
              gatherable: true,
              requiredTool: target.metadata.requiredTool,
            },
            tool,
          );
        } else {
          this.showFizzle();
        }
        return;
      }

      if (target?.kind !== 'combatant' || !this.stats.canAttack('player', targetId)) {
        this.showFizzle();
        return;
      }

      const result = this.stats.resolveAttack('player', targetId);
      if (!result) return;

      // Combat chess: does the current incantation ignite the swing? Only score when
      // the incantation actually names an element (scoring is the async engine path).
      const combined = `${this._incantation.verse || ''} ${this._incantation.weave || ''}`;
      let scoreData = {};
      if (matchElement(combined)) {
        try {
          const doc = analyzeText(this._incantation.verse || '');
          const base = await this.scoringEngine.calculateScore(doc);
          scoreData = normalizeCombatScore(base, {
            scrollText: this._incantation.verse,
            weave: this._incantation.weave,
          }) || {};
        } catch (err) {
          console.warn('[combat] score failed; plain swing.', err);
        }
      }
      const outcome = resolveEnchant(this._incantation, scoreData, this.enchantRng);
      const elemental = !!(outcome.element && outcome.success);
      const element = elemental ? outcome.element : null;

      this.performSwing(element);

      const hitColor = elemental ? element.glowColor : 0xff3300;
      // Sync the impact cut + glow + number to when the blade actually lands
      // (after the windup, partway through the strike).
      this.showHitFeedback(targetId, { color: hitColor, amount: result.damage, delay: 250 });
      if (elemental) {
        this.stats.applyStatus(targetId, element.status);
      } else if (outcome.element && !outcome.success) {
        this.showFizzle(); // matched an element but the enchant failed
      }

      grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.BASIC_ATTACK);
      this.sessionTelemetry?.recordXpAction(SCHOLOMANCE_XP_ACTIONS.BASIC_ATTACK);
      this.sessionTelemetry?.recordPlayerAttack({
        damage: result.damage,
        targetId,
        elemental,
      });
      const targetEntity = this.stats.getEntity(targetId);
      if (targetEntity && isSentinelId(targetId) && targetEntity.hp <= 0) {
        this.defeatSentinel(targetId);
      }
      if (targetEntity && isPortalWardenId(targetId) && targetEntity.hp <= 0) {
        this.defeatPortalWarden();
      }
      this.emitCombatStats();
    };

    resolveSpellCastTargetId(sceneContext, weave, resolvedTargets) {
      let targetId = resolvedTargets?.primaryTargetId || null;
      if (targetId) return targetId;

      const objectTokens = extractParsedClauses(parseWeave(weave))
        .map((clause) => clause.objectToken)
        .filter(Boolean);

      const candidates = (sceneContext?.targets || []).filter((entry) => (
        entry.kind === 'combatant'
        && entry.inRange
        && entry.reachable !== false
        && this.isCombatantAlive(entry.id)
        && (
          objectTokens.length === 0
          || objectTokens.some((token) => entry.weaveObjects?.includes(token))
        )
      ));

      if (this.selectedCombatTargetId) {
        const selected = candidates.find((entry) => entry.id === this.selectedCombatTargetId);
        if (selected) return selected.id;
      }

      return candidates[0]?.id || null;
    }

    canEngageCombatBattle() {
      return shouldEngageCombatBattle({
        sentinels: this.getSentinelRecords(),
        combatVictoryAchieved: this.combatVictoryAchieved,
        portalWarden: this.portalWarden,
      });
    }

    ensureCombatBattleEngaged() {
      if (this.combatBattleEngaged) return true;
      if (!this.canEngageCombatBattle()) return false;
      return this.engageCombatBattle();
    }

    performSpellCast = async (options = {}) => {
      if (!this.stats) {
        if (options.castDetail) this.showFizzle();
        return;
      }

      this.ensureCombatBattleEngaged();

      const cast = options.castDetail || {};
      const { sceneContext, weave, resolvedTargets } = this.resolveCastTargets(options);
      const targetId = this.resolveSpellCastTargetId(sceneContext, weave, resolvedTargets);

      if (!targetId) {
        this.showFizzle();
        window.dispatchEvent(new CustomEvent('combat-target-miss', {
          detail: {
            weave,
            unresolvedObjects: resolvedTargets.unresolvedObjects,
            message: 'No valid target bound to the weave.',
          },
        }));
        return;
      }

      const target = sceneContext.targets.find((entry) => entry.id === targetId);
      if (target?.kind !== 'combatant') {
        this.showFizzle();
        return;
      }

      if (cast.failureCast) {
        this.showFizzle();
        window.dispatchEvent(new CustomEvent('combat-spell-fizzle', {
          detail: { reason: 'syntactic_collapse', weave },
        }));
        return;
      }

      if (!this.stats.canCastSpell('player', targetId)) {
        this.showFizzle();
        const player = this.stats.getEntity('player');
        let reason = 'out_of_range';
        if (player?.spellweaveUsed) reason = 'already_invoked';
        else if ((player?.attackPointsRemaining ?? 0) < SPELL_CAST_AP_COST) reason = 'no_ap';
        window.dispatchEvent(new CustomEvent('combat-spell-fizzle', {
          detail: { reason, weave, targetId },
        }));
        return;
      }

      const defender = buildCombatDefenderProfile(buildBestiaryRuntimeContext({
        enemyId: targetId,
        target,
        record: this.getSentinelRecords().find((entry) => entry.id === targetId) || null,
        entity: this.stats.getEntity(targetId),
      }));

      let scoreData = cast;
      const castLooksUnscored = !Number.isFinite(Number(cast?.totalScore)) || Number(cast.totalScore) <= 0;
      if (castLooksUnscored) {
        try {
          const scored = await resolveCombatCastScore({
            verse: this._incantation.verse,
            weave: this._incantation.weave,
            defender,
            defenderSchool: defender?.school ?? target.metadata?.school ?? null,
            scholomance: getScholomanceCombatBlock(),
            compendiumContext: buildCompendiumRuntimeContext(),
            scoringEngine: this.scoringEngine,
          });
          scoreData = scored.scoreData;
        } catch (error) {
          console.warn('[combat] spell cast scoring failed.', error);
        }
      }

      scoreData = normalizeCombatScore(scoreData, {
        scrollText: this._incantation.verse,
        weave: this._incantation.weave,
        defender,
        defenderSchool: defender?.school ?? target.metadata?.school ?? null,
        scholomance: getScholomanceCombatBlock(),
        compendiumContext: buildCompendiumRuntimeContext(),
      }) || scoreData;

      this.syncLiveBattleBoard();

      const playerEntity = this.stats.getEntity('player');
      scoreData = enrichScoreWithTacticalBoard(scoreData, {
        casterId: 'player',
        targetId,
        weave: this._incantation.weave,
        movementUsed: Math.max(0, (playerEntity?.movementPoints || 0) - (playerEntity?.movementPointsRemaining || 0)),
        maxMovement: playerEntity?.movementPoints || 3,
      });

      const spellDamage = Number(scoreData.damage ?? cast.damage) || 0;
      const result = this.stats.resolveSpellCast('player', targetId, {
        damage: spellDamage,
        scoreData,
      });
      if (!result) {
        this.showFizzle();
        return;
      }

      const outcome = resolveEnchant(this._incantation, scoreData, this.enchantRng);
      const elemental = !!(outcome.element && outcome.success);
      const element = elemental ? outcome.element : null;

      this.performSwing(element);

      const hitColor = elemental ? element.glowColor : 0x66ccff;
      this.showHitFeedback(targetId, { color: hitColor, amount: result.damage, delay: 250 });
      if (elemental) {
        this.stats.applyStatus(targetId, element.status);
      }

      notePlayerSpellCastOnSentinels(this.getSentinelRecords(), {
        ...cast,
        weave,
        syntacticalChess: scoreData?.syntacticalChess,
      });

      grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.WEAVE_CAST_LEGAL);
      this.sessionTelemetry?.recordXpAction(SCHOLOMANCE_XP_ACTIONS.WEAVE_CAST_LEGAL);
      this.sessionTelemetry?.recordPlayerAttack({
        damage: result.damage,
        targetId,
        elemental,
        castType: 'spell',
      });

      const targetEntity = this.stats.getEntity(targetId);
      if (targetEntity && isSentinelId(targetId) && targetEntity.hp <= 0) {
        this.defeatSentinel(targetId);
      }
      if (targetEntity && isPortalWardenId(targetId) && targetEntity.hp <= 0) {
        this.defeatPortalWarden();
      }
      this.emitCombatStats();
    };

    endPlayerTurn = () => {
      if (this.cutsceneInputLock) return;
      if (!this.stats || !this.combatBattleEngaged) return;
      this.sessionTelemetry?.recordTurnEnd();

      const burnTicks = tickPlayerCombatStatuses(this.stats);
      for (const tick of burnTicks) {
        this.events.emit('sentinel-ability', {
          type: 'sentinel-ability',
          abilityId: 'burn_tick',
          logLines: [`[DEBUFF] Matrix Burn ticks for ${tick.damage} damage.`],
          damage: tick.damage,
        });
        if (tick.targetHp <= 0) break;
      }

      tickSentinelAbilityState(this.getSentinelRecords());
      const warden = this.getPortalWardenRecord();
      if (warden) tickVoidAcolyteAbilityState(warden);
      this.stats.endTurn('player');
      this.disarmMovement();
      for (const record of this.getSentinelRecords()) {
        if (!record.aggroed || record.defeated) continue;
        this.stats.endTurn(record.id);
      }
      if (warden?.aggroed) {
        this.stats.endTurn(warden.id);
      }
      if (this.combatBattleEngaged) {
        this.runSentinelRetaliation();
        this.runPortalWardenRetaliation();
      }

      const wardenEntity = this.stats.getEntity(PORTAL_WARDEN_ID);
      if (wardenEntity && wardenEntity.hp <= 0) {
        this.defeatPortalWarden();
      }
      this.emitCombatStats();
    };

    pointerEventToWorld(event) {
      const rect = this.game.canvas.getBoundingClientRect();
      const scaleX = this.game.canvas.width / rect.width;
      const scaleY = this.game.canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      return this.cameras.main.getWorldPoint(x, y);
    }

    registerLatticePickCandidate(cell, hitPolygon, gameObject = null) {
      if (!cell || !hitPolygon) return;
      this.latticePickCandidates.push({ cell, hitPolygon, gameObject });
    }

    collectLatticeHitsAt(worldX, worldY) {
      const hits = [];
      for (const entry of this.latticePickCandidates || []) {
        if (entry.hitPolygon && phaserRuntime.Geom.Polygon.Contains(entry.hitPolygon, worldX, worldY)) {
          hits.push(entry);
        }
      }
      return hits;
    }

    pickLatticeAt(worldX, worldY, context = {}) {
      const hits = this.collectLatticeHitsAt(worldX, worldY);
      if (hits.length === 0) return null;
      return pickBestCandidate(hits, context);
    }

    getEquippedGatherTools() {
      return Array.isArray(this.equippedGatherTools) ? this.equippedGatherTools : [];
    }

    getPrimaryGatherTool() {
      return this.getEquippedGatherTools()[0] || null;
    }

    syncEquippedGatherTools(equipment = {}) {
      const tools = new Set();
      for (const item of Object.values(equipment)) {
        if (item?.gatherTool) tools.add(item.gatherTool);
      }
      this.equippedGatherTools = [...tools];
    }

    getPickContext() {
      return {
        toolId: this.getPrimaryGatherTool(),
        playerCell: getPlayerLatticePosition(this.playerGridPos),
        reachableKeys: this.movementArmed
          ? buildReachableLatticeKeys(this.reachableTiles)
          : new Set(),
      };
    }

    toggleMovementArmed() {
      this.movementArmed = !this.movementArmed;
      if (this.playerImg) {
        this.playerImg.setTint(this.movementArmed ? 0xaaffcc : 0xffffff);
      }
      this.refreshMovementHighlights();
    }

    disarmMovement() {
      this.movementArmed = false;
      if (this.playerImg) this.playerImg.clearTint();
      this.refreshMovementHighlights();
    }

    isPlayerGameObject(obj) {
      let cur = obj;
      while (cur) {
        if (cur === this.playerContainer) return true;
        cur = cur.parentContainer;
      }
      return false;
    }

    ensureCombatArenaAmbience() {
      const fire = getGameBrazierFireService();
      fire.prime();
      void fire.start();

      const sword = getGameSwordSliceService();
      sword.prime();
      sword.setEnabled(true);

      const fireball = getGameFireballImpactService();
      fireball.prime();
      fireball.setEnabled(true);

      const iceImpact = getGameIceSpellImpactService();
      iceImpact.prime();
      iceImpact.setEnabled(true);
    }

    emitSwordSliceSfx() {
      const sword = getGameSwordSliceService();
      sword.prime();
      void sword.playSlice();
    }

    handleCanvasWheel(event) {
      event.preventDefault();
      this.applyCameraWheelZoom(event.deltaY);
    }

    applyCameraWheelZoom(deltaY) {
      if (this.cutsceneInputLock || !Number.isFinite(deltaY) || deltaY === 0) return;

      const cam = this.cameras.main;
      const baseZoom = this.baseCameraZoom ?? 1.1;
      const maxZoom = this.maxCameraZoom ?? 2.25;
      const step = this.cameraZoomStep ?? 0.1;
      const prevZoom = cam.zoom;

      let nextZoom = prevZoom;
      if (deltaY < 0) {
        nextZoom = Math.min(maxZoom, prevZoom + step);
      } else {
        nextZoom = Math.max(baseZoom, prevZoom - step);
      }

      if (nextZoom === prevZoom) return;

      cam.setZoom(nextZoom);
      if (this.galaxyBg) {
        this.galaxyBg.destroy();
        this.drawGalaxyBackground();
      }
    }

    handleCanvasPointerDown(event) {
      this.ensureCombatArenaAmbience();
      if (event.button !== 0 || this.isWalking) return;
      try {
        const world = this.pointerEventToWorld(event);
        const pick = this.pickLatticeAt(world.x, world.y, this.getPickContext());

        if (!pick) return;
        const { cell } = pick;

        if (isPlayerLatticePick(cell, this.playerGridPos)) {
          this.toggleMovementArmed();
          return;
        }

        if (
          cell.combatTx === PORTAL_TILE.tx
          && cell.combatTy === PORTAL_TILE.ty
          && (this.isPortalBeckoning() || this.isPortalCleared())
        ) {
          this.tryEnterPortal();
          return;
        }

        const gatherTool = this.getPrimaryGatherTool();
        if (cell.gatherable && gatherTool && cell.requiredTool === gatherTool) {
          this.submitGatherIntent(cell, gatherTool);
          return;
        }

        if (this.movementArmed && cell.combatTx != null && cell.combatTy != null) {
          this.tryMoveToTile(cell.combatTx, cell.combatTy);
        }
      } catch (error) {
        console.error('Pointerdown error:', error);
        this.events.emit('tile-error', { type: 'error', text: error.message });
      }
    }

    handleCanvasContextMenu(event) {
      event.preventDefault();
      try {
        const world = this.pointerEventToWorld(event);
        const pick = this.pickLatticeAt(world.x, world.y, this.getPickContext());
        if (!pick) return;

        const enriched = this.enrichObeliskAction({
          ...pick.cell,
          tx: pick.cell.combatTx ?? pick.cell.x,
          ty: pick.cell.combatTy ?? pick.cell.z,
          isGrid: pick.cell.interactionKind === 'grid',
          isIsland: !!pick.cell.isIsland,
          gatherable: !!pick.cell.gatherable,
          height: pick.cell.height,
          isStormheartOrb: false,
          type: 'inspect',
        });

        if (
          enriched.tx === PORTAL_TILE.tx
          && enriched.ty === PORTAL_TILE.ty
          && (this.isPortalBeckoning() || this.isPortalCleared())
        ) {
          enriched.isPortal = true;
          enriched.portalPhase = this.portalPhase;
        }

        const warden = this.getPortalWardenRecord();
        if (warden && warden.tx === enriched.tx && warden.ty === enriched.ty) {
          const entity = this.stats?.getEntity(warden.id);
          enriched.isSentinel = true;
          enriched.sentinelId = warden.id;
          enriched.sentinelLabel = warden.shortLabel || warden.label;
          enriched.hp = entity?.hp ?? null;
          enriched.sentinelIntelligence = entity?.intelligence ?? null;
          enriched.sentinelAggroed = !!warden.aggroed;
          enriched.sentinelLine = 'The hollow reaches for you — execution is near.';
          enriched.enemyId = warden.id;
          enriched.bestiaryAvailable = hasCombatBestiaryEntry(buildBestiaryRuntimeContext({
            enemyId: warden.id,
            record: warden,
            entity,
          }));
          if ((entity?.hp ?? 1) > 0) {
            this.selectCombatTarget(warden.id);
          }
        }

        const sentinel = findSentinelAtTile(enriched.tx, enriched.ty, this.getSentinelRecords());
        if (sentinel) {
          const entity = this.stats?.getEntity(sentinel.id);
          enriched.isSentinel = true;
          enriched.sentinelId = sentinel.id;
          enriched.sentinelLabel = sentinel.shortLabel || sentinel.label;
          enriched.hp = entity?.hp ?? null;
          enriched.sentinelIntelligence = entity?.intelligence ?? null;
          enriched.sentinelAggroed = !!sentinel.aggroed;
          enriched.sentinelLine = entity?.hp > 0
            ? (sentinel.aggroed
              ? 'The matrix tracks you — it defends the tower.'
              : 'A sentinel robot — dormant until the obelisk is threatened.')
            : 'Scorched plating. The sentinel will not rise again.';
          const bestiaryContext = buildBestiaryRuntimeContext({
            enemyId: sentinel.id,
            record: sentinel,
            entity,
            target: this.buildSceneTargetRegistry().targets.find((entry) => entry.id === sentinel.id),
          });
          enriched.enemyId = sentinel.id;
          enriched.bestiaryAvailable = hasCombatBestiaryEntry(bestiaryContext);
          enriched.bestiarySnapshot = {
            hp: entity?.hp ?? null,
            maxHp: entity?.maxHp ?? null,
            aggroed: !!sentinel.aggroed,
            defeated: !!sentinel.defeated,
          };
          if (!sentinel.defeated && (entity?.hp ?? 1) > 0) {
            this.selectCombatTarget(sentinel.id);
          }
        }

        if (enriched.isObelisk && this.tryLootStormheartOrb()) {
          return;
        }

        const lootChest = this.getCombatLootChestAt(enriched.tx, enriched.ty);
        if (lootChest) {
          this.openCombatLootChest(lootChest.id);
          return;
        }

        if (pick.cell.combatTx != null && pick.cell.combatTy != null) {
          this.setInspectHighlight(pick.cell.combatTx, pick.cell.combatTy);
        }

        const gridTile = this.gridTiles?.get(`${enriched.tx},${enriched.ty}`);
        if (gridTile?.inspectData?.battleTile) {
          enriched.battleTile = gridTile.inspectData.battleTile;
        }

        const presentation = buildInspectPresentation(enriched);
        const displayPoint = this.worldToScreenPoint(world.x, world.y);
        this.events.emit('tile-inspect', {
          ...enriched,
          ...presentation,
          screenX: displayPoint.x,
          screenY: displayPoint.y,
        });
      } catch (error) {
        console.error('Contextmenu error:', error);
        this.events.emit('tile-error', { type: 'error', text: error.message });
      }
    }

    worldToScreenPoint(worldX, worldY) {
      return {
        x: (worldX - this.cameras.main.scrollX) * this.cameras.main.zoom,
        y: (worldY - this.cameras.main.scrollY) * this.cameras.main.zoom,
      };
    }

    getPlayerGatherState() {
      return {
        tx: this.playerGridPos?.tx ?? 0,
        ty: this.playerGridPos?.ty ?? 0,
        tools: this.getEquippedGatherTools(),
      };
    }

    submitGatherIntent(cell, toolId) {
      const intent = {
        targetCell: { x: cell.x, y: cell.y, z: cell.z },
        toolId,
      };
      const verdict = validateCombatGatherIntent(this.latticeAuthority, this.getPlayerGatherState(), intent);
      if (!verdict.ok) {
      this.events.emit('tile-gather', {
        type: 'gather',
        ok: false,
        code: verdict.code,
        targetCell: intent.targetCell,
        toolId,
        characterLine: `This strike will not bite: ${verdict.code}.`,
      });
        return;
      }

      const applied = applyCombatGatherIntent(this.latticeAuthority, this.getPlayerGatherState(), intent);
      const pickEntry = this.latticePickCandidates.find((entry) => latticeCellKey(entry.cell) === verdict.key);
      if (pickEntry?.gameObject?.setFillStyle) {
        pickEntry.gameObject.setFillStyle(0xffffff, 0);
      }

      const screen = pickEntry?.gameObject
        ? this.worldToScreenPoint(pickEntry.gameObject.x, pickEntry.gameObject.y)
        : this.worldToScreenPoint(this.cameras.main.scrollX, this.cameras.main.scrollY);
      grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.GATHER_SUCCESS);
      this.events.emit('tile-gather', {
        type: 'gather',
        ok: true,
        yield: applied.yield,
        targetCell: intent.targetCell,
        toolId,
        screenX: screen.x,
        screenY: screen.y,
        characterLine: `The ${toolId} bites; ${applied.yield} comes free in shards.`,
      });
    }

    getBlockedTiles() {
      return this._blockedTiles || buildBlockedSet();
    }

    isReachableTile(tx, ty) {
      return !!this.reachableTiles?.has(tileKey(tx, ty));
    }

    restoreTileHighlight(tx, ty) {
      const tile = this.gridTiles?.get(tileKey(tx, ty));
      if (!tile) return;
      if (this.inspectHighlightTile?.tx === tx && this.inspectHighlightTile?.ty === ty) {
        tile.setFillStyle(PALETTES.amethyst.shine, 0.42);
        return;
      }
      if (this.isReachableTile(tx, ty)) {
        tile.setFillStyle(PALETTES.cyan_glow.shine, 0.18);
      } else {
        tile.setFillStyle(0xffffff, 0);
      }
    }

    refreshMovementHighlights() {
      if (!this.playerGridPos || !this.gridTiles) return;
      if (!this.movementArmed) {
        this.reachableTiles = new Set();
        for (const [key, tile] of this.gridTiles) {
          const [tx, ty] = key.split(',').map(Number);
          if (this.inspectHighlightTile?.tx === tx && this.inspectHighlightTile?.ty === ty) continue;
          tile.setFillStyle(0xffffff, 0);
        }
        return;
      }
      const mp = this.combatBattleEngaged
        ? (this.stats?.getEntity('player')?.movementPointsRemaining ?? 0)
        : COMBAT_FREE_ROAM_MOVEMENT_RANGE;
      this.reachableTiles = getReachableTiles(this.playerGridPos, mp, this.getBlockedTiles());
      for (const [key, tile] of this.gridTiles) {
        const [tx, ty] = key.split(',').map(Number);
        if (this.inspectHighlightTile?.tx === tx && this.inspectHighlightTile?.ty === ty) continue;
        if (this.reachableTiles.has(key)) {
          tile.setFillStyle(PALETTES.cyan_glow.shine, 0.18);
        } else {
          tile.setFillStyle(0xffffff, 0);
        }
      }
    }

    setInspectHighlight(tx, ty) {
      if (this.inspectHighlightTimer) {
        this.inspectHighlightTimer.remove(false);
        this.inspectHighlightTimer = null;
      }
      if (this.inspectHighlightTile) {
        this.restoreTileHighlight(this.inspectHighlightTile.tx, this.inspectHighlightTile.ty);
      }
      this.inspectHighlightTile = { tx, ty };
      const tile = this.gridTiles?.get(tileKey(tx, ty));
      if (tile) {
        tile.setFillStyle(PALETTES.amethyst.shine, 0.42);
      }
      this.inspectHighlightTimer = this.time.delayedCall(2500, () => {
        if (this.inspectHighlightTile?.tx === tx && this.inspectHighlightTile?.ty === ty) {
          this.inspectHighlightTile = null;
          this.restoreTileHighlight(tx, ty);
        }
        this.inspectHighlightTimer = null;
      });
    }

    tryMoveToTile(tx, ty) {
      if (this.cutsceneInputLock) return false;
      if (!this.movementArmed || this.isWalking || !this.playerGridPos || !this.stats) return false;
      const player = this.stats.getEntity('player');
      if (!player) return false;
      if (this.combatBattleEngaged && player.movementPointsRemaining < 1) return false;
      if (this.playerGridPos.tx === tx && this.playerGridPos.ty === ty) return false;

      const path = findPath(this.playerGridPos, { tx, ty }, this.getBlockedTiles());
      if (path.length === 0) return false;
      if (this.combatBattleEngaged && path.length > player.movementPointsRemaining) return false;

      this.followGridPath(path);
      return true;
    }

    emitFootstepForTile(tx, ty, stepIndex) {
      const audio = getGameAudioForgeService();
      const payload = {
        surface: 'stone',
        stepIndex,
        tx,
        ty,
        battleId: 'combat-arena',
      };
      void audio.emitSfx('FOOTSTEP', payload);
    }

    emitObeliskElectricSfx(eventType, extra = {}) {
      const sample = getGameObeliskElectricService();
      sample.prime();

      // Lightning sample is discharge-only; charge is visual buildup (no second staggered hit).
      if (sample.shouldPreferSample()) {
        if (eventType === 'OBELISK_DISCHARGE') {
          void sample.playZap(eventType);
        }
        return;
      }

      const audio = getGameAudioForgeService();
      void audio.emitSfx(eventType, {
        battleId: 'combat-arena',
        affinity: 'PSYCHIC',
        pan: 0,
        ...extra,
      });
    }

    stepToTile(tx, ty) {
      return new Promise((resolve) => {
        this.playerGridPos.tx = tx;
        this.playerGridPos.ty = ty;
        this.playerContainer.setDepth(getGridSortDepth(tx, ty, ARENA_SORT_LAYER.PLAYER));
        this.refreshSortableEntityDepths();

        const firstStep = this.footstepIndex;
        this.footstepIndex += 1;
        this.emitFootstepForTile(tx, ty, firstStep);
        this.time.delayedCall(175, () => {
          const midStep = this.footstepIndex;
          this.footstepIndex += 1;
          this.emitFootstepForTile(tx, ty, midStep);
        });

        if (this.stats) {
          this.stats.setPosition('player', tx, ty);
          if (this.combatBattleEngaged) {
            this.stats.spendMove('player');
            this.sessionTelemetry?.recordMove();
          }
          this.emitCombatStats();
        }

        const targetPos = this.getIsoTarget(tx, ty);
        const bobTargets = [this.playerImg, ...Object.values(this.playerArmorLayers)].filter(Boolean);

        if (this.playerImg) {
          this.playerImg.play('player-walk', true);
          Object.values(this.playerArmorLayers).forEach((layer) => {
            if (layer && layer.visible && layer.texture.key) {
              const baseAssetId = layer.texture.key.replace(/-f\d+$/, '');
              const walkKey = `${baseAssetId}-walk`;
              if (this.anims.exists(walkKey)) {
                layer.play(walkKey, true);
              }
            }
          });

          if (this.idleTween) this.idleTween.pause();
          bobTargets.forEach((s) => { s.y = 0; s.scaleY = 1; });
          if (this.walkBob) this.walkBob.stop();
          this.walkBob = this.tweens.add({
            targets: bobTargets,
            y: -2.5,
            duration: 90,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }

        this.tweens.add({
          targets: this.playerContainer,
          x: targetPos.x,
          y: targetPos.y,
          duration: 350,
          onComplete: () => {
            if (this.walkBob) { this.walkBob.stop(); this.walkBob = null; }
            bobTargets.forEach((s) => { s.y = 0; s.scaleY = 1; });
            if (this.idleTween) this.idleTween.resume();
            if (this.playerImg) {
              this.playerImg.play('player-idle', true);
              Object.values(this.playerArmorLayers).forEach((layer) => {
                if (layer && layer.visible && layer.texture.key) {
                  layer.stop();
                  const baseAssetId = layer.texture.key.replace(/-f\d+$/, '');
                  const idleKey = `${baseAssetId}-f0`;
                  if (this.textures.exists(idleKey)) {
                    layer.setTexture(idleKey);
                  }
                }
              });
            }
            this.checkSentinelObeliskAggro(tx, ty);
            if (this.combatBattleEngaged) this.syncLiveBattleBoard();
            resolve();
          },
        });
      });
    }

    async followGridPath(path) {
      if (this.isWalking || !Array.isArray(path) || path.length === 0) return;
      this.isWalking = true;
      try {
        for (const step of path) {
          if (this.combatBattleEngaged && !this.stats?.canMove('player')) break;
          await this.stepToTile(step.tx, step.ty);
        }
      } finally {
        this.isWalking = false;
        this.refreshMovementHighlights();
      }
    }

    handleGlobalKeydown = (e) => {
      if (this.isWalking) return;

      if (this.combatBattleEngaged && (e.key === 'f' || e.key === 'F')) {
        this.performBasicAttack();
        return;
      }
      if (this.combatBattleEngaged && (e.key === ' ' || e.key === 'Enter')) {
        this.endPlayerTurn();
        return;
      }

      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowUp' || e.key === 'w') { dx = -1; dy = 0; }
      else if (e.key === 'ArrowDown' || e.key === 's') { dx = 1; dy = 0; }
      else if (e.key === 'ArrowLeft' || e.key === 'a') { dx = 0; dy = 1; }
      else if (e.key === 'ArrowRight' || e.key === 'd') { dx = 0; dy = -1; }

      if (dx === 0 && dy === 0) return;
      if (!this.movementArmed) return;

      const newTx = this.playerGridPos.tx + dx;
      const newTy = this.playerGridPos.ty + dy;
      this.tryMoveToTile(newTx, newTy);
    };

    // Custom deterministic Value Noise since Phaser doesn't bundle SimplexNoise by default
    noise2D(x, y) {
      const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
      return hash - Math.floor(hash);
    }

    smoothNoise2D(x, y) {
      const intX = Math.floor(x);
      const intY = Math.floor(y);
      const fracX = x - intX;
      const fracY = y - intY;
      
      // Bilinear interpolation
      const v1 = this.noise2D(intX, intY);
      const v2 = this.noise2D(intX + 1, intY);
      const v3 = this.noise2D(intX, intY + 1);
      const v4 = this.noise2D(intX + 1, intY + 1);
      
      const i1 = v1 * (1 - fracX) + v2 * fracX;
      const i2 = v3 * (1 - fracX) + v4 * fracX;
      
      return i1 * (1 - fracY) + i2 * fracY;
    }

    runGeologicVM(size, radius) {
      // 1. Initial Tectonic Density Map using Value Noise
      let map = Array(size).fill(0).map(() => Array(size).fill(0));
      
      for(let x=0; x<size; x++) {
        for(let y=0; y<size; y++) {
          // Distance from center to create an island mask
          const dx = x - radius;
          const dy = y - radius;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist > radius) continue; // Cutoff to circle

          // Multiple noise octaves - much smoother and lower frequency
          const n1 = this.smoothNoise2D(x * 0.05, y * 0.05);
          const n2 = this.smoothNoise2D(x * 0.15, y * 0.15) * 0.3;
          
          // Dome shape multiplier
          const dome = Math.max(0, 1 - Math.pow(dist / radius, 1.2));
          
          map[x][y] = (n1 + n2) * dome * 15; // Gentler base height
        }
      }

      // 2. Geologic Bytecode Instructions Program (Intentional Construction)
      const program = [
        { op: OP.UPLIFT, amount: 2, freq: 0.1 }, // Gentle natural variance
        { op: OP.ERODE, passes: 4, capacity: 1.0 }, // Natural weathering
        { op: OP.SMOOTH, passes: 5 }, // Very smooth natural terrain
        // Intelligent Design Pass: Carve a perfect flat plateau for the arena foundation
        { op: OP.FLATTEN, radius: 5.5, targetZ: 12, blend: 2 } 
      ];

      // Execute VM Program
      program.forEach(inst => {
        switch(inst.op) {
          case OP.UPLIFT:
            for(let x=0; x<size; x++) {
              for(let y=0; y<size; y++) {
                if (map[x][y] > 0) {
                  const upliftNoise = this.smoothNoise2D(x * inst.freq + 100, y * inst.freq + 100);
                  if (upliftNoise > 0.5) map[x][y] += inst.amount * upliftNoise;
                }
              }
            }
            break;
            
          case OP.FOLD:
            for(let x=0; x<size; x++) {
              for(let y=0; y<size; y++) {
                if (map[x][y] > 0) {
                  // Create ridges
                  const fold = Math.sin((inst.axis ? x : y) * 0.5);
                  if (fold > 0.5) map[x][y] += inst.severity * fold;
                }
              }
            }
            break;

          case OP.ERODE:
            // Cellular Automata erosion
            for(let p=0; p<inst.passes; p++) {
              let nextMap = JSON.parse(JSON.stringify(map));
              for(let x=1; x<size-1; x++) {
                for(let y=1; y<size-1; y++) {
                  if (map[x][y] <= 0) continue;
                  
                  let lowestNeighbor = map[x][y];
                  let targetX = x, targetY = y;
                  
                  // Check 4 neighbors
                  const neighbors = [[-1,0], [1,0], [0,-1], [0,1]];
                  neighbors.forEach(([dx, dy]) => {
                    if (map[x+dx][y+dy] < lowestNeighbor) {
                      lowestNeighbor = map[x+dx][y+dy];
                      targetX = x+dx;
                      targetY = y+dy;
                    }
                  });
                  
                  const diff = map[x][y] - lowestNeighbor;
                  if (diff > inst.capacity) {
                    const sediment = diff * 0.3; // Transport 30% of diff
                    nextMap[x][y] -= sediment;
                    nextMap[targetX][targetY] += sediment;
                  }
                }
              }
              map = nextMap;
            }
            break;

          case OP.SMOOTH:
            for(let p=0; p<inst.passes; p++) {
              let nextMap = JSON.parse(JSON.stringify(map));
              for(let x=1; x<size-1; x++) {
                for(let y=1; y<size-1; y++) {
                  if (map[x][y] <= 0) continue;
                  let sum = map[x][y];
                  sum += map[x-1][y] + map[x+1][y] + map[x][y-1] + map[x][y+1];
                  nextMap[x][y] = sum / 5;
                }
              }
              map = nextMap;
            }
            break;
            
          case OP.FLATTEN:
            // Simulates intelligent mages carving a foundation
            for(let x=0; x<size; x++) {
              for(let y=0; y<size; y++) {
                const dx = x - radius;
                const dy = y - radius;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist <= inst.radius) {
                  // Perfect flat foundation
                  map[x][y] = inst.targetZ;
                } else if (dist <= inst.radius + inst.blend) {
                  // Terraced blend down to natural terrain
                  const t = (dist - inst.radius) / inst.blend;
                  // Lerp between targetZ and natural terrain
                  map[x][y] = inst.targetZ * (1 - t) + map[x][y] * t;
                }
              }
            }
            break;
        }
      });

      return map;
    }

    drawVoxelTerrain(heightmap, size, radius) {
      this._terrainHeightmap = heightmap;
      this._terrainSize = size;
      this._terrainRadius = radius;
      this.icePeakPositions = [];
      this._terrainGraphics?.destroy();
      this._terrainShimmerGraphics?.destroy();

      const graphics = this.add.graphics();
      graphics.setDepth(5); // Island terrain above galaxy but below grid if needed (gene protected)
      this._terrainGraphics = graphics;

      const shimmerGraphics = this.add.graphics();
      shimmerGraphics.setDepth(6); // Ice peaks sit just above the island terrain (5), below the grid (10)
      this._terrainShimmerGraphics = shimmerGraphics;
      if (shimmerGraphics.postFX) {
        shimmerGraphics.postFX.addShine(1, 0.2, 5, false); // Shimmer shader
        shimmerGraphics.postFX.addBloom(0x00ffff, 1, 1, 1.5, 1.2); // Ice bloom
      }
      
      const vTw = 60; // voxel tile width
      const vTh = 30; // voxel tile height
      const zScale = 4; // multiplier for height z

      // Painter's algorithm: sort voxels back to front
      const voxels = [];
      for(let x=0; x<size; x++) {
        for(let y=0; y<size; y++) {
          if (heightmap[x][y] > 1) {
            voxels.push({ x, y, z: heightmap[x][y] });
          }
        }
      }
      voxels.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      voxels.forEach(v => {
        let isEdge = false;
        const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
        for(let [neighborDx, neighborDy] of neighbors) {
           const nx = v.x+neighborDx, ny = v.y+neighborDy;
           if (nx < 0 || ny < 0 || nx >= size || ny >= size || heightmap[nx][ny] <= 1) {
              isEdge = true;
              break;
           }
        }

        // Quantize height for chunked bitmask look
        let blockZ = Math.floor(v.z) * zScale;
        let isTallestPeak = false;
        if (isEdge) {
           const extraHeight = 80 + Math.random() * 60;
           blockZ += extraHeight; // Make perimeter walls massively tall
           if (extraHeight > 125) isTallestPeak = true; // Only top ~25% of perimeter walls
        }
        
        // Base coordinate (0,0 is center)
        const ox = v.x - radius;
        const oy = v.y - radius;
        
        const px = (ox - oy) * (vTw / 2);
        const py = (ox + oy) * (vTh / 2);

        // Calculate discrete normal from local derivatives for layered shading
        const hLeft = v.x > 0 ? heightmap[v.x-1][v.y] : 0;
        const hRight = v.x < size-1 ? heightmap[v.x+1][v.y] : 0;
        const hUp = v.y > 0 ? heightmap[v.x][v.y-1] : 0;
        const hDown = v.y < size-1 ? heightmap[v.x][v.y+1] : 0;
        
        const dx = hRight - hLeft;
        const dy = hDown - hUp;
        
        const biome = this.arenaBiome === 'frozen' ? 'frozen' : 'void';
        const band = resolveVoxelPaletteBand(biome, { z: v.z, isEdge });
        let palette = PALETTES[band] || PALETTES.voidsteel;
        // Top face normal is affected by slope
        const topColor = this.getLambertColor(-dx, -dy, 4, palette);
        // Left face normal (-1, 1, 0)
        const leftColor = this.getLambertColor(-1, 1, 0, palette);
        // Right face normal (1, 1, 0)
        const rightColor = this.getLambertColor(1, 1, 0, palette);

        // Base geometry definition for a 3D isometric column
        // We project the base far down to give the floating island deep roots
        const rootDepth = 250 - (Math.abs(ox) + Math.abs(oy)) * 10;
        
        const pTopCenter = { x: px, y: py - blockZ };
        const pTopLeft = { x: px - vTw/2, y: py + vTh/2 - blockZ };
        const pTopRight = { x: px + vTw/2, y: py + vTh/2 - blockZ };
        const pTopBottom = { x: px, y: py + vTh - blockZ };

        const pBotLeft = { x: px - vTw/2, y: py + vTh/2 + rootDepth };
        const pBotRight = { x: px + vTw/2, y: py + vTh/2 + rootDepth };
        const pBotBottom = { x: px, y: py + vTh + rootDepth };

        // Left Face
        graphics.fillStyle(leftColor, 1);
        graphics.beginPath();
        graphics.moveTo(pTopLeft.x, pTopLeft.y);
        graphics.lineTo(pTopBottom.x, pTopBottom.y);
        graphics.lineTo(pBotBottom.x, pBotBottom.y);
        graphics.lineTo(pBotLeft.x, pBotLeft.y);
        graphics.closePath();
        graphics.fillPath();

        // Right Face
        graphics.fillStyle(rightColor, 1);
        graphics.beginPath();
        graphics.moveTo(pTopBottom.x, pTopBottom.y);
        graphics.lineTo(pTopRight.x, pTopRight.y);
        graphics.lineTo(pBotRight.x, pBotRight.y);
        graphics.lineTo(pBotBottom.x, pBotBottom.y);
        graphics.closePath();
        graphics.fillPath();

        let hitPolyPoints;

        if (isEdge) {
           const variant = Math.random() > 0.5 ? 1 : 2;
           let tip;
           if (variant === 1) {
               // Variant 1: Centered Spire
               tip = { x: pTopCenter.x, y: pTopCenter.y - 30 - Math.random() * 40 };
           } else {
               // Variant 2: Asymmetrical Slanted Shard
               const lean = Math.random() > 0.5 ? 25 : -25;
               tip = { x: pTopCenter.x + lean, y: pTopCenter.y - 15 - Math.random() * 25 };
           }
           
           if (isTallestPeak) {
               // Obsidian Crystal Wall Tip transitions to Shining Ice Peak
               const icyLeft = this.getLambertColor(-1, 1, 0, PALETTES.cyan_glow);
               const icyRight = this.getLambertColor(1, 1, 0, PALETTES.cyan_glow);

               // Left Crystal Face
               shimmerGraphics.fillStyle(icyLeft, 1);
               shimmerGraphics.beginPath();
               shimmerGraphics.moveTo(pTopLeft.x, pTopLeft.y);
               shimmerGraphics.lineTo(pTopBottom.x, pTopBottom.y);
               shimmerGraphics.lineTo(tip.x, tip.y);
               shimmerGraphics.closePath();
               shimmerGraphics.fillPath();
               
               // Right Crystal Face
               shimmerGraphics.fillStyle(icyRight, 1);
               shimmerGraphics.beginPath();
               shimmerGraphics.moveTo(pTopBottom.x, pTopBottom.y);
               shimmerGraphics.lineTo(pTopRight.x, pTopRight.y);
               shimmerGraphics.lineTo(tip.x, tip.y);
               shimmerGraphics.closePath();
               shimmerGraphics.fillPath();

               // Add stroke details to the shimmer layer
               shimmerGraphics.lineStyle(1.5, PALETTES.cyan_glow.shine, 0.8);
               shimmerGraphics.beginPath();
               shimmerGraphics.moveTo(pTopLeft.x, pTopLeft.y);
               shimmerGraphics.lineTo(tip.x, tip.y);
               shimmerGraphics.lineTo(pTopRight.x, pTopRight.y);
               shimmerGraphics.moveTo(pTopBottom.x, pTopBottom.y);
               shimmerGraphics.lineTo(tip.x, tip.y);
               shimmerGraphics.strokePath();
               
                // Emit softly drifting snowflakes from the frozen peak
                if (this.add.particles) {
                    const snow = this.add.particles(tip.x, tip.y, 'twinkle-star', {
                        speedY: { min: 10, max: 30 },
                        speedX: { min: -15, max: 15 },
                        scale: { start: 0.2, end: 0 },
                        alpha: { start: 0.6, end: 0 },
                        lifespan: { min: 2000, max: 5000 },
                        frequency: phaserRuntime.Math.Between(400, 1500),
                        blendMode: 'ADD',
                        tint: 0xaaffff
                    });
                    snow.setDepth(40); // Falling snow is atmospheric — in front of the arena geometry

                    // Record this peak for the shared ice-smoke emitter
                    this.icePeakPositions.push({ x: tip.x, y: tip.y });
                }
           } else {
               // Normal Obsidian Crystal Wall Tip
               graphics.fillStyle(leftColor, 1);
               graphics.beginPath();
               graphics.moveTo(pTopLeft.x, pTopLeft.y);
               graphics.lineTo(pTopBottom.x, pTopBottom.y);
               graphics.lineTo(tip.x, tip.y);
               graphics.closePath();
               graphics.fillPath();
               
               graphics.fillStyle(rightColor, 1);
               graphics.beginPath();
               graphics.moveTo(pTopBottom.x, pTopBottom.y);
               graphics.lineTo(pTopRight.x, pTopRight.y);
               graphics.lineTo(tip.x, tip.y);
               graphics.closePath();
               graphics.fillPath();
           }

           hitPolyPoints = [tip.x, tip.y, pTopRight.x, pTopRight.y, pTopBottom.x, pTopBottom.y, pTopLeft.x, pTopLeft.y];
        } else {
           // Normal Flat Top Face
           graphics.fillStyle(topColor, 1);
           graphics.beginPath();
           graphics.moveTo(pTopCenter.x, pTopCenter.y);
           graphics.lineTo(pTopRight.x, pTopRight.y);
           graphics.lineTo(pTopBottom.x, pTopBottom.y);
           graphics.lineTo(pTopLeft.x, pTopLeft.y);
           graphics.closePath();
           graphics.fillPath();

           hitPolyPoints = [pTopCenter.x, pTopCenter.y, pTopRight.x, pTopRight.y, pTopBottom.x, pTopBottom.y, pTopLeft.x, pTopLeft.y];
        }

        // Quantized bitmask-style rim lines
        graphics.lineStyle(1, palette.lit, isEdge ? 0.6 : 0.4);
        graphics.strokePath();

        // Create an interactive zone wrapping this voxel's top geometry
        const poly = new phaserRuntime.Geom.Polygon(hitPolyPoints);

        const interactiveTile = this.add.polygon(0, 0, hitPolyPoints, 0xffffff, 0).setOrigin(0).setDepth(15);
        interactiveTile.setInteractive(poly, phaserRuntime.Geom.Polygon.Contains);

        const combatCoord = heightmapToCombatCoord(v.x, v.y, radius);
        const islandLattice = islandVoxelToLattice(v.x, v.y, v.z);
        const islandCell = isTallestPeak
          ? registerGatherableCell(this.latticeAuthority, {
            ...islandLattice,
            combatTx: combatCoord.tx,
            combatTy: combatCoord.ty,
            isIsland: true,
            height: v.z,
          })
          : {
            ...islandLattice,
            faceType: 'top',
            gatherable: false,
            interactionPriority: 5,
            interactionKind: 'island',
            combatTx: combatCoord.tx,
            combatTy: combatCoord.ty,
            isIsland: true,
            height: v.z,
          };
        if (!isTallestPeak) {
          this.latticeAuthority.cells.set(latticeCellKey(islandCell), islandCell);
        }
        this.registerLatticePickCandidate(islandCell, poly, interactiveTile);

        interactiveTile.inspectData = {
          tx: combatCoord.tx,
          ty: combatCoord.ty,
          isIsland: true,
          height: v.z,
          gatherable: !!islandCell.gatherable,
        };
        interactiveTile.interactData = interactiveTile.inspectData;

        interactiveTile.on('pointerover', () => {
          if (islandCell.gatherable && this.getPrimaryGatherTool() === islandCell.requiredTool) {
            interactiveTile.setFillStyle(PALETTES.void_ice.shine, 0.28);
          }
          this.input.setDefaultCursor('pointer');
        });

        interactiveTile.on('pointerout', () => {
          interactiveTile.setFillStyle(0xffffff, 0); // Hide
          this.input.setDefaultCursor('default');
        });
      });
    }

    draw3DGrid(gridSize, tw, th, toIso, zOffset) {
      const graphics = this.add.graphics();
      graphics.setDepth(10); // Arena grid on top of galaxy background (gene protected)

      this.combatGridSize = gridSize;
      this.gridTiles = new Map();
      if (!this.leylineTileRegistry) this.leylineTileRegistry = new Map();
      this._blockedTiles = buildBlockedSet();

      const tiles = [];
      for (let tx = 0; tx < gridSize; tx++) {
        for (let ty = 0; ty < gridSize; ty++) {
          tiles.push({ tx, ty });
        }
      }
      tiles.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty));

      tiles.forEach(({ tx, ty }) => {
        const pt = toIso(tx, ty);
        const depth = 8; 
        
        const isDiagonal = (tx === ty) || (tx === gridSize - 1 - ty);
        // Dark checker cell (and all rune diagonals) are obsidian black.
        let palette = PALETTES.obsidian;

        // Light checker cell: a clean, intentional arcane-slate tone — reads as a board,
        // stays dark and grimoire. Diagonals stay obsidian so the rune tiles are uniform.
        if (!isDiagonal && (tx + ty) % 2 === 0) {
           palette = PALETTES.arcane_slate;
        }

        const topColor = this.getLambertColor(0, 0, 1, palette);
        const leftFaceColor = this.getLambertColor(-1, 1, 0, palette);
        const rightFaceColor = this.getLambertColor(1, 1, 0, palette);

        const py = pt.y - zOffset;

        const p1 = { x: pt.x, y: py - th/2 };
        const p2 = { x: pt.x + tw/2, y: py };
        const p3 = { x: pt.x, y: py + th/2 };
        const p4 = { x: pt.x - tw/2, y: py };

        // Left Face
        graphics.fillStyle(leftFaceColor, 1);
        graphics.beginPath();
        graphics.moveTo(p4.x, p4.y);
        graphics.lineTo(p3.x, p3.y);
        graphics.lineTo(p3.x, p3.y + depth);
        graphics.lineTo(p4.x, p4.y + depth);
        graphics.closePath();
        graphics.fillPath();

        // Right Face
        graphics.fillStyle(rightFaceColor, 1);
        graphics.beginPath();
        graphics.moveTo(p3.x, p3.y);
        graphics.lineTo(p2.x, p2.y);
        graphics.lineTo(p2.x, p2.y + depth);
        graphics.lineTo(p3.x, p3.y + depth);
        graphics.closePath();
        graphics.fillPath();

        // Top Face
        graphics.fillStyle(topColor, 1);
        graphics.beginPath();
        graphics.moveTo(p1.x, p1.y);
        graphics.lineTo(p2.x, p2.y);
        graphics.lineTo(p3.x, p3.y);
        graphics.lineTo(p4.x, p4.y);
        graphics.closePath();
        graphics.fillPath();

        graphics.lineStyle(1.5, palette.lit, 0.6);
        graphics.strokePath();

        if (isDiagonal && (tx !== 4 || ty !== 4)) {
          this.drawVectorRune(pt.x, py, tw, th);
        }

        // Leylines are generated at boot but only rendered once battle starts.
        const leyline = this.leylines && this.leylines.find((entry) => (
          entry.coord.x === tx && entry.coord.y === ty
        ));
        let lColor = null;
        if (leyline && !isDiagonal) {
          this.leylineTileRegistry.set(`${tx},${ty}`, {
            leyline,
            tx,
            ty,
            x: pt.x,
            y: py,
          });
          if (this.battleLeylinesActive) {
            lColor = this.spawnLeylineFissureAtTile(tx, ty, leyline, pt.x, py);
          }
        }

        // Overlay an interactive invisible polygon on the top face for mouse events
        const hitPoly = new phaserRuntime.Geom.Polygon([
          p1.x, p1.y,
          p2.x, p2.y,
          p3.x, p3.y,
          p4.x, p4.y
        ]);

        const interactiveTile = this.add.polygon(0, 0, hitPoly.points, 0xffffff, 0).setOrigin(0).setDepth(15);
        interactiveTile.setInteractive(hitPoly, phaserRuntime.Geom.Polygon.Contains);
        
        const activeLeyline = (this.battleLeylinesActive && leyline && !isDiagonal)
          ? { affinity: leyline.affinity, id: leyline.id }
          : null;

        interactiveTile.inspectData = { 
          tx, ty, isGrid: true, 
          leyline: activeLeyline,
          isObelisk: (tx === 4 && ty === 4)
        };
        
        interactiveTile.interactData = { 
          tx, ty, isGrid: true, 
          leyline: activeLeyline,
          isObelisk: (tx === 4 && ty === 4)
        };

        const latticeCell = registerCombatGridCell(this.latticeAuthority, tx, ty, {
          isObelisk: tx === 4 && ty === 4,
          leyline: activeLeyline,
          blocked: (tx === 8 && ty === 0) || (tx === 4 && ty === 4),
        });
        this.registerLatticePickCandidate(latticeCell, hitPoly, interactiveTile);

        this.gridTiles.set(tileKey(tx, ty), interactiveTile);

        // Attach leyline data for targeted hover effects once battle is live.
        if (this.battleLeylinesActive && leyline && !isDiagonal && lColor != null) {
          interactiveTile.leylineHover = { tx, ty, color: lColor };
        }

        interactiveTile.on('pointerover', () => {
          if (this.movementArmed && this.isReachableTile(tx, ty)) {
            interactiveTile.setFillStyle(PALETTES.cyan_glow.shine, 0.34);
            this.input.setDefaultCursor('pointer');
            if (interactiveTile.leylineHover) {
              this.startLeylineSoundwavePulse(interactiveTile.leylineHover);
            }
          } else if (this.inspectHighlightTile?.tx === tx && this.inspectHighlightTile?.ty === ty) {
            interactiveTile.setFillStyle(PALETTES.amethyst.shine, 0.55);
            this.input.setDefaultCursor('help');
          } else {
            this.input.setDefaultCursor('default');
          }
        });

        interactiveTile.on('pointerout', () => {
          this.restoreTileHighlight(tx, ty);
          this.input.setDefaultCursor('default');
          if (interactiveTile.leylineHover) {
            this.stopLeylineSoundwavePulse(interactiveTile.leylineHover);
          }
        });
      });
    }

    // PixelBrain: Hover soundwave pulse for leylines
    // When hovering a leyline tile, create expanding soundwave rings in the affinity color.
    // Feels like sonic resonance pulsing outward from the fissures.
    startLeylineSoundwavePulse(leylineData) {
      const key = `${leylineData.tx},${leylineData.ty}`;
      if (!this.leylineVisuals || !this.leylineVisuals.has(key)) return;
      if (this.leylineWaves && this.leylineWaves.has(key)) return; // already pulsing

      const visual = this.leylineVisuals.get(key);
      const { x, y, color } = visual;

      if (!this.leylineWaves) this.leylineWaves = new Map();
      const waveEntry = { gfs: [], tweens: [] };
      this.leylineWaves.set(key, waveEntry);

      // Create 3 staggered expanding soundwave rings (isometric ellipse)
      // Each ring gets its own Graphics so they don't fight on clear()
      for (let i = 0; i < 3; i++) {
        const delay = i * 160;
        const progress = { val: 0 };

        const ringGfx = this.add.graphics();
        ringGfx.setPosition(x, y);
        ringGfx.setDepth(7);
        waveEntry.gfs.push(ringGfx);

        const tween = this.tweens.add({
          targets: progress,
          val: 1,
          duration: 720,
          delay,
          repeat: -1,
          ease: 'Sine.easeOut',
          onUpdate: () => {
            const p = progress.val;
            ringGfx.clear();

            const maxW = 52;
            const maxH = 24; // isometric squash

            const w = maxW * p;
            const h = maxH * p;
            const alpha = Math.max(0.08, (1 - p) * 0.75);

            // Outer wave ring
            ringGfx.lineStyle(2.5, color, alpha);
            ringGfx.strokeEllipse(0, 0, w, h);

            // Inner detail ring for richer soundwave texture
            if (p > 0.2) {
              ringGfx.lineStyle(1, color, alpha * 0.6);
              ringGfx.strokeEllipse(0, 0, w * 0.55, h * 0.55);
            }
          }
        });

        waveEntry.tweens.push(tween);
      }

      // Subtle pulse on the fissure itself for extra presence
      if (visual.fissure && visual.baseScaleX) {
        const pulseTween = this.tweens.add({
          targets: visual.fissure,
          scaleX: visual.baseScaleX * 1.07,
          scaleY: visual.baseScaleY * 1.07,
          duration: 380,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        waveEntry.tweens.push(pulseTween);
      }
    }

    stopLeylineSoundwavePulse(leylineData) {
      const key = `${leylineData.tx},${leylineData.ty}`;
      if (!this.leylineWaves || !this.leylineWaves.has(key)) return;

      const entry = this.leylineWaves.get(key);
      entry.tweens.forEach(t => t.stop());
      entry.gfs.forEach(g => g && g.destroy());

      // Restore fissure scale
      const visual = this.leylineVisuals && this.leylineVisuals.get(key);
      if (visual && visual.fissure && visual.baseScaleX) {
        visual.fissure.setScale(visual.baseScaleX, visual.baseScaleY);
      }

      this.leylineWaves.delete(key);
    }

    getLeylineAffinityColor(affinity) {
      const colors = {
        ALCHEMY: 0xff3300,
        PSYCHIC: 0xff00ff,
        VITAL: 0x00ffaa,
        SONIC: 0xffff00,
        LORE: 0x0088ff,
        CELESTIAL: 0xffffff,
        WARD: 0x88bbff,
        NECROTIC: 0x99ffcc,
        CODEX: 0xaa00ff,
        ENTROPY: 0x444444,
        VOID: 0x220044,
      };
      return colors[affinity] || 0xffffff;
    }

    spawnLeylineFissureAtTile(tx, ty, leyline, x, y, { initialAlpha = 0.93 } = {}) {
      const color = this.getLeylineAffinityColor(leyline.affinity);
      if (!this.textures.exists('leyline-fissure')) {
        this.textures.addBase64('leyline-fissure', combat_leylineUri);
      }

      const fissure = this.add.image(x, y + 1, 'leyline-fissure');
      fissure.setScale(0.48, 0.62);
      fissure.setTint(color);
      fissure.setAlpha(initialAlpha);
      fissure.setBlendMode(phaserRuntime.BlendModes.ADD);
      fissure.setDepth(8);

      if (!this.leylineVisuals) this.leylineVisuals = new Map();
      this.leylineVisuals.set(`${tx},${ty}`, {
        fissure,
        color,
        baseScaleX: fissure.scaleX,
        baseScaleY: fissure.scaleY,
        x,
        y,
      });
      return color;
    }

    getActiveEnemyIds() {
      return this.getTargetableCombatantsOrdered().map((entry) => entry.id);
    }

    buildArenaBattleSnapshot() {
      return {
        sceneId: 'combat-arena',
        gridSize: this.combatGridSize || 9,
        playerGridPos: this.playerGridPos,
        leylines: this.leylines || [],
        enemies: this.getActiveEnemyIds(),
        encounterId: this.currentEncounterId || 'arena-default',
        mapHash: `arena-${this.combatGridSize || 9}`,
      };
    }

    syncLiveBattleBoard() {
      if (!this.battleBoardState) return null;
      const synced = syncBattleBoardFromLiveStats(this.battleBoardState, this.stats);
      this.battleBoardState = synced;
      this.applyBattleBoardToGrid(synced);
      this.updateBattleBoardThreatMap();
      return synced;
    }

    compileAndApplyBattleBoard() {
      const boardState = compileArenaBattleBoard(this.buildArenaBattleSnapshot());
      this.battleBoardState = syncBattleBoardFromLiveStats(boardState, this.stats) || boardState;
      setActiveBattleBoard(this.battleBoardState);
      this.applyBattleBoardToGrid(this.battleBoardState);
      this.updateBattleBoardThreatMap();
      this.events.emit('battle-board-compiled', { type: 'battle-board-compiled', boardState: this.battleBoardState });
      return this.battleBoardState;
    }

    applyBattleBoardToGrid(boardState) {
      if (!boardState || !this.gridTiles) return;

      for (const battleTile of boardState.tiles) {
        const key = `${battleTile.x},${battleTile.y}`;
        const gridTile = this.gridTiles.get(key);
        if (!gridTile) continue;

        const terrainDef = BATTLE_TERRAIN_TYPES[battleTile.terrain] || BATTLE_TERRAIN_TYPES.normal;
        if (gridTile.inspectData) {
          gridTile.inspectData.battleTile = battleTile;
        }
        if (gridTile.interactData) {
          gridTile.interactData.battleTile = battleTile;
        }

        if (battleTile.modifier && terrainDef.colorHint) {
          const color = Number.parseInt(String(terrainDef.colorHint).replace('#', ''), 16);
          if (Number.isFinite(color)) {
            gridTile.setFillStyle(color, 0.3);
          }
        }
      }

      this.renderTacticalOverlays();
    }

    clearBattleBoardVisuals() {
      if (this.gridTiles) {
        for (const gridTile of this.gridTiles.values()) {
          gridTile.setFillStyle(0xffffff, 0);
          if (gridTile.inspectData) delete gridTile.inspectData.battleTile;
          if (gridTile.interactData) delete gridTile.interactData.battleTile;
        }
      }
      this.tacticalOverlayGraphics?.clear?.();
      this.battleBoardState = null;
      clearActiveBattleBoard();
    }

    updateBattleBoardThreatMap() {
      const boardState = this.battleBoardState || getActiveBattleBoard();
      if (!boardState) return;

      const entities = [];
      const player = this.stats?.getEntity('player');
      if (player?.position) {
        entities.push({
          id: 'player',
          x: player.position.tx,
          y: player.position.ty,
          side: 'player',
          meleeRange: player.attackRange || 1,
          spellRange: player.attackRange || 1,
          attack: player.attackPoints || 5,
        });
      }

      for (const combatant of this.getTargetableCombatantsOrdered()) {
        const entity = this.stats?.getEntity(combatant.id);
        if (!entity?.position) continue;
        entities.push({
          id: combatant.id,
          x: entity.position.tx,
          y: entity.position.ty,
          side: 'enemy',
          meleeRange: entity.attackRange || 1,
          spellRange: entity.attackRange || 3,
          attack: entity.attackPoints || 5,
          spellPower: entity.attackPoints || 5,
        });
      }

      this.tacticalThreatMap = computeThreatMap(boardState, entities);

      for (const tile of boardState.tiles) {
        const threats = this.tacticalThreatMap.controlledTiles.find(
          (entry) => entry.x === tile.x && entry.y === tile.y,
        );
        tile.control.threatenedBy = resolveThreatEntityLabels(threats?.controlledBy || []);
      }
    }

    renderTacticalOverlays() {
      if (!this.tacticalOverlayGraphics) {
        this.tacticalOverlayGraphics = this.add.graphics();
        this.tacticalOverlayGraphics.setDepth(14);
      }
      this.tacticalOverlayGraphics.clear();

      const boardState = this.battleBoardState || getActiveBattleBoard();
      const overlays = this.activeTacticalOverlays || {};
      if (!boardState || !this.combatGridMetrics) return;

      const { toIso, tw, th, plateauZ } = this.combatGridMetrics;
      const zOffset = plateauZ || 0;

      const paintTile = (tx, ty, color, alpha = 0.35) => {
        const pt = toIso(tx, ty);
        const py = pt.y - zOffset;
        const halfW = tw / 2;
        const halfH = th / 2;
        this.tacticalOverlayGraphics.fillStyle(color, alpha);
        this.tacticalOverlayGraphics.beginPath();
        this.tacticalOverlayGraphics.moveTo(pt.x, py - halfH);
        this.tacticalOverlayGraphics.lineTo(pt.x + halfW, py);
        this.tacticalOverlayGraphics.lineTo(pt.x, py + halfH);
        this.tacticalOverlayGraphics.lineTo(pt.x - halfW, py);
        this.tacticalOverlayGraphics.closePath();
        this.tacticalOverlayGraphics.fillPath();
      };

      if (overlays.premium) {
        for (const tile of boardState.tiles) {
          if (['rune', 'anchor', 'null'].includes(tile.terrain)) {
            paintTile(tile.x, tile.y, 0xa855f4, 0.28);
          }
        }
      }

      if (overlays.school) {
        for (const tile of boardState.tiles) {
          if (['fire', 'void', 'sonic', 'holy', 'ice'].includes(tile.terrain)) {
            paintTile(tile.x, tile.y, 0x44e8c0, 0.22);
          }
        }
      }

      if (overlays.threat && this.tacticalThreatMap) {
        for (const entry of this.tacticalThreatMap.controlledTiles) {
          const isEnemyThreat = entry.controlledBy.some((id) => id !== 'player');
          if (isEnemyThreat) paintTile(entry.x, entry.y, 0xea4335, 0.3);
        }
      }

      if (overlays.movement) {
        const player = this.stats?.getEntity('player');
        if (player?.position) {
          const reachable = getMovementRange({
            id: 'player',
            x: player.position.tx,
            y: player.position.ty,
            movementRange: player.movementPointsRemaining ?? 3,
          }, boardState);
          for (const tile of reachable) {
            paintTile(tile.x, tile.y, 0x4285f4, 0.25);
          }
        }
      }

      if (overlays.spell) {
        const player = this.stats?.getEntity('player');
        if (player?.position) {
          const spellTiles = getSpellRange({
            id: 'player',
            x: player.position.tx,
            y: player.position.ty,
            spellRange: player.attackRange || 3,
          }, player.attackRange || 3, boardState);
          for (const tile of spellTiles) {
            paintTile(tile.x, tile.y, 0xfbbc04, 0.22);
          }
        }
      }

      if (overlays.lineOfSight) {
        const player = this.stats?.getEntity('player');
        if (player?.position) {
          const visible = getVisibleTiles({
            id: 'player',
            x: player.position.tx,
            y: player.position.ty,
            spellRange: Math.max(boardState.width, boardState.height),
          }, Math.max(boardState.width, boardState.height), boardState);
          for (const tile of visible) {
            paintTile(tile.x, tile.y, 0x34a853, 0.18);
          }
        }
      }
    }

    setupTacticalOverlayListener() {
      this.boundHandleTacticalOverlay = (event) => {
        this.activeTacticalOverlays = { ...(event.detail || {}) };
        this.renderTacticalOverlays();
      };
      window.addEventListener('tactical-overlay-change', this.boundHandleTacticalOverlay);
      this.events.once('destroy', () => {
        window.removeEventListener('tactical-overlay-change', this.boundHandleTacticalOverlay);
      });
    }

    engageCombatBattle() {
      if (this.combatBattleEngaged) return false;
      this.combatBattleEngaged = true;
      const player = this.stats?.getEntity('player');
      if (player) {
        player.manaPointsRemaining = player.manaPoints;
        player.manaUsed = false;
      }
      if (!this.selectedCombatTargetId) {
        const nearest = this.getTargetableCombatantsOrdered()[0];
        if (nearest) this.selectCombatTarget(nearest.id);
      }
      this.activateBattleLeylines();
      this.compileAndApplyBattleBoard();
      window.dispatchEvent(new CustomEvent('battle.transition.gridReveal'));
      window.dispatchEvent(new CustomEvent('battle.transition.tileReveal'));
      this.runSentinelRetaliation({ onlyNewlyAggroed: true });
      this.emitCombatStats();
      return true;
    }

    disengageCombatBattle() {
      if (!this.combatBattleEngaged) return false;
      this.combatBattleEngaged = false;
      this.deactivateBattleLeylines();
      this.clearBattleBoardVisuals();
      this.disarmMovement();
      const reverseTimeline = getReverseTransitionTimeline();
      for (const phase of reverseTimeline.phases) {
        window.dispatchEvent(new CustomEvent(phase.eventName, { detail: { phase: phase.id } }));
      }
      this.emitCombatStats();
      return true;
    }

    deactivateBattleLeylines() {
      if (!this.battleLeylinesActive) return false;
      this.battleLeylinesActive = false;

      if (this.leylineWaves) {
        this.leylineWaves.forEach((entry) => {
          entry.tweens.forEach((tween) => tween.stop());
          entry.gfs.forEach((gfx) => gfx?.destroy?.());
        });
        this.leylineWaves.clear();
      }

      if (this.leylineVisuals) {
        for (const visual of this.leylineVisuals.values()) {
          visual.fissure?.destroy?.();
        }
        this.leylineVisuals.clear();
      }

      for (const [key, tile] of this.gridTiles || []) {
        if (tile.inspectData) tile.inspectData.leyline = null;
        if (tile.interactData) tile.interactData.leyline = null;
        delete tile.leylineHover;

        const [tx, ty] = key.split(',').map(Number);
        const latticeKey = latticeCellKey(combatGridToLattice(tx, ty, 0));
        const latticeCell = this.latticeAuthority?.cells?.get(latticeKey);
        if (latticeCell) latticeCell.leyline = null;
      }

      this.emitSceneContextState();
      return true;
    }

    activateBattleLeylines() {
      if (this.battleLeylinesActive) return false;
      this.battleLeylinesActive = true;

      for (const [key, entry] of this.leylineTileRegistry.entries()) {
        const color = this.spawnLeylineFissureAtTile(
          entry.tx,
          entry.ty,
          entry.leyline,
          entry.x,
          entry.y,
          { initialAlpha: 0 },
        );

        const tile = this.gridTiles?.get(key);
        if (tile) {
          const leylineData = { affinity: entry.leyline.affinity, id: entry.leyline.id };
          tile.inspectData = { ...tile.inspectData, leyline: leylineData };
          tile.interactData = { ...tile.interactData, leyline: leylineData };
          tile.leylineHover = { tx: entry.tx, ty: entry.ty, color };
        }

        const latticeKey = latticeCellKey(combatGridToLattice(entry.tx, entry.ty, 0));
        const latticeCell = this.latticeAuthority?.cells?.get(latticeKey);
        if (latticeCell) {
          latticeCell.leyline = { affinity: entry.leyline.affinity, id: entry.leyline.id };
        }

        const visual = this.leylineVisuals?.get(key);
        if (visual?.fissure) {
          this.tweens.add({
            targets: visual.fissure,
            alpha: 0.93,
            scaleX: visual.baseScaleX * 1.08,
            scaleY: visual.baseScaleY * 1.08,
            duration: 680,
            ease: 'Sine.easeOut',
            yoyo: true,
            hold: 120,
            repeat: -1,
          });
        }
      }

      this.emitSceneContextState();
      return true;
    }

    // Ensure waves are cleaned if the scene shuts down
    shutdown() {
      if (this.leylineWaves) {
        this.leylineWaves.forEach(entry => {
          entry.tweens.forEach(t => t.stop());
          entry.gfs.forEach(g => g && g.destroy());
        });
        this.leylineWaves.clear();
      }
    }

    drawVectorRune(x, y, tw, th) {
      const graphics = this.add.graphics();
      graphics.setBlendMode(phaserRuntime.BlendModes.ADD);
      
      graphics.fillStyle(PALETTES.cyan_glow.core, 0.4);
      graphics.fillEllipse(x, y, tw * 0.4, th * 0.4);

      graphics.lineStyle(3, PALETTES.cyan_glow.shine, 1);
      const type = (Math.abs(Math.floor(x)) + Math.abs(Math.floor(y))) % 3;
      
      graphics.beginPath();
      if (type === 0) {
        graphics.moveTo(x, y - th*0.15);
        graphics.lineTo(x + tw*0.12, y + th*0.15);
        graphics.lineTo(x - tw*0.12, y + th*0.15);
        graphics.closePath();
        graphics.moveTo(x - tw*0.06, y);
        graphics.lineTo(x + tw*0.06, y);
      } else if (type === 1) {
        graphics.moveTo(x, y - th*0.2);
        graphics.lineTo(x + tw*0.12, y);
        graphics.lineTo(x, y + th*0.2);
        graphics.lineTo(x - tw*0.12, y);
        graphics.closePath();
      } else {
        graphics.moveTo(x - tw*0.08, y - th*0.15);
        graphics.lineTo(x + tw*0.08, y + th*0.15);
        graphics.moveTo(x, y - th*0.15);
        graphics.lineTo(x + tw*0.16, y + th*0.15);
      }
      graphics.strokePath();
    }

    drawObelisk(tw, th, zOffset) {
      const graphics = this.add.graphics();
      graphics.setDepth(ARENA_DEPTH.OBELISK_BODY);
      this.obeliskBody = graphics;
      
      const cx = 0;
      const cy = -zOffset; // Center of the grid
      
      const bRadiusX = (tw / 2) * 0.7; // Base takes up 70% of the center tile
      const bRadiusY = (th / 2) * 0.7;
      
      const shaftHeight = 160; // Reduced height to fit on screen
      const capHeight = 60;
      const totalRise = shaftHeight + capHeight;
      
      // Base points
      const bLeft = { x: cx - bRadiusX, y: cy };
      const bRight = { x: cx + bRadiusX, y: cy };
      const bBottom = { x: cx, y: cy + bRadiusY };
      
      // Top of shaft points
      const tLeft = { x: bLeft.x, y: bLeft.y - shaftHeight };
      const tRight = { x: bRight.x, y: bRight.y - shaftHeight };
      const tBottom = { x: bBottom.x, y: bBottom.y - shaftHeight };
      
      // Pyramid tip
      const tip = { x: cx, y: cy - shaftHeight - capHeight };

      // Obsidian palette for the rock
      const palette = PALETTES.obsidian;
      
      const leftFaceColor = this.getLambertColor(-1, 1, 0, palette);
      const rightFaceColor = this.getLambertColor(1, 1, 0, palette);
      const capLeftColor = this.getLambertColor(-1, 1, 2, palette);
      const capRightColor = this.getLambertColor(1, 1, 2, palette);
      
      // Left Shaft
      graphics.fillStyle(leftFaceColor, 1);
      graphics.beginPath();
      graphics.moveTo(tLeft.x, tLeft.y);
      graphics.lineTo(tBottom.x, tBottom.y);
      graphics.lineTo(bBottom.x, bBottom.y);
      graphics.lineTo(bLeft.x, bLeft.y);
      graphics.closePath();
      graphics.fillPath();

      // Right Shaft
      graphics.fillStyle(rightFaceColor, 1);
      graphics.beginPath();
      graphics.moveTo(tBottom.x, tBottom.y);
      graphics.lineTo(tRight.x, tRight.y);
      graphics.lineTo(bRight.x, bRight.y);
      graphics.lineTo(bBottom.x, bBottom.y);
      graphics.closePath();
      graphics.fillPath();

      // Left Cap
      graphics.fillStyle(capLeftColor, 1);
      graphics.beginPath();
      graphics.moveTo(tLeft.x, tLeft.y);
      graphics.lineTo(tBottom.x, tBottom.y);
      graphics.lineTo(tip.x, tip.y);
      graphics.closePath();
      graphics.fillPath();

      // Right Cap
      graphics.fillStyle(capRightColor, 1);
      graphics.beginPath();
      graphics.moveTo(tBottom.x, tBottom.y);
      graphics.lineTo(tRight.x, tRight.y);
      graphics.lineTo(tip.x, tip.y);
      graphics.closePath();
      graphics.fillPath();
      
      // Sharp lit edges
      graphics.lineStyle(2, palette.lit, 0.8);
      graphics.beginPath();
      graphics.moveTo(tLeft.x, tLeft.y);
      graphics.lineTo(tip.x, tip.y);
      graphics.lineTo(tRight.x, tRight.y);
      graphics.moveTo(tip.x, tip.y);
      graphics.lineTo(tBottom.x, tBottom.y);
      graphics.lineTo(bBottom.x, bBottom.y);
      graphics.strokePath();

      // Glowing Royal Purple Runes
      graphics.lineStyle(3, PALETTES.royal_purple.shine, 0.9);
      graphics.beginPath();
      // Center line rune
      graphics.moveTo(tBottom.x, tBottom.y - 10);
      graphics.lineTo(tBottom.x, bBottom.y - 20);
      graphics.strokePath();
      
      // Glowing rings
      for (let i = 1; i <= 4; i++) {
         const h = shaftHeight * (i / 5);
         const hy = cy + bRadiusY - h;
         graphics.lineStyle(2, PALETTES.royal_purple.lit, 0.8);
         graphics.beginPath();
         graphics.moveTo(cx - bRadiusX, cy - h);
         graphics.lineTo(cx, hy);
         graphics.lineTo(cx + bRadiusX, cy - h);
         graphics.strokePath();
      }
      graphics.fillStyle(PALETTES.royal_purple.shine, 1);
      graphics.fillEllipse(tip.x, tip.y, 15, 15);
      graphics.setBlendMode(phaserRuntime.BlendModes.NORMAL);

      // ── Charge/discharge FX layers (animated in updateObeliskFx) ────────
      // Additive overlays sit above the obelisk: chargeGfx pulses the runes +
      // orb, boltGfx paints the tesla arcs during the discharge.
      const chargeGfx = this.add.graphics().setDepth(ARENA_DEPTH.OBELISK_CHARGE);
      chargeGfx.setBlendMode(phaserRuntime.BlendModes.ADD);
      const boltGfx = this.add.graphics().setDepth(ARENA_DEPTH.OBELISK_BOLT);
      boltGfx.setBlendMode(phaserRuntime.BlendModes.ADD);

      this.obeliskFx = {
        cx, cy, bRadiusX, bRadiusY, shaftHeight, capHeight, totalRise,
        orbX: tip.x, orbY: tip.y,
        spineX: tBottom.x, spineTopY: tBottom.y, baseY: bBottom.y,
        chargeGfx, boltGfx,
        phase: 'charge',
        t: 0,
        chargeMs: 3500,   // purple lines swell for ~3.5s
        dischargeMs: 480, // tesla blast
        cooldownMs: 6500, // rest between discharges
        intensity: 0,
        bolts: [],
      };
    }

    // Redraw the pulsing runes + orb glow at a given charge intensity (0..1).
    drawObeliskCharge(intensity) {
      const fx = this.obeliskFx;
      const g = fx.chargeGfx;
      g.clear();
      const i = Math.max(0, Math.min(1, intensity));
      if (i <= 0.01) return;

      const bright = PALETTES.royal_purple.shine;
      const core = PALETTES.royal_purple.core;
      const alpha = 0.25 + i * 0.75;

      // Glowing chevron rings (mirror the baked geometry, brighter with charge)
      g.lineStyle(2 + i * 2.5, bright, alpha);
      for (let k = 1; k <= 4; k++) {
        const h = fx.shaftHeight * (k / 5);
        const hy = fx.cy + fx.bRadiusY - h;
        g.beginPath();
        g.moveTo(fx.cx - fx.bRadiusX, fx.cy - h);
        g.lineTo(fx.cx, hy);
        g.lineTo(fx.cx + fx.bRadiusX, fx.cy - h);
        g.strokePath();
      }
      // Central spine
      g.lineStyle(2 + i * 2, bright, alpha);
      g.beginPath();
      g.moveTo(fx.spineX, fx.spineTopY - 10);
      g.lineTo(fx.spineX, fx.baseY - 20);
      g.strokePath();

      // Orb glow — layered radial bloom that swells as it charges
      const glowR = 8 + i * 26;
      g.fillStyle(core, 0.10 + i * 0.20);
      g.fillEllipse(fx.orbX, fx.orbY, glowR * 2.2, glowR * 2.2);
      g.fillStyle(bright, 0.20 + i * 0.35);
      g.fillEllipse(fx.orbX, fx.orbY, glowR, glowR);
      g.fillStyle(0xffffff, 0.30 + i * 0.55);
      g.fillEllipse(fx.orbX, fx.orbY, 6 + i * 8, 6 + i * 8);
    }

    // Seed the discharge bolt directions (upward-biased fan from the orb).
    buildTeslaBolts() {
      const count = 9;
      const bolts = [];
      for (let k = 0; k < count; k++) {
        const base = -Math.PI * 0.92 + (k / (count - 1)) * (Math.PI * 0.84);
        bolts.push({
          angle: base + (Math.random() - 0.5) * 0.4,
          len: 90 + Math.random() * 110,
        });
      }
      return bolts;
    }

    // Perpendicular-jittered polyline between two points (lightning path).
    jaggedPoints(x0, y0, x1, y1, segments, maxOffset) {
      const pts = [{ x: x0, y: y0 }];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const taper = Math.sin(t * Math.PI); // widest jitter mid-span
        const off = (Math.random() - 0.5) * 2 * maxOffset * taper;
        pts.push({ x: x0 + dx * t + px * off, y: y0 + dy * t + py * off });
      }
      pts.push({ x: x1, y: y1 });
      return pts;
    }

    strokePolyline(g, pts, width, color, alpha) {
      if (alpha <= 0) return;
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y);
      g.strokePath();
    }

    // Regenerate the tesla arcs each frame so they crackle; `fade` is 1→0.
    drawTeslaDischarge(fade) {
      const fx = this.obeliskFx;
      const g = fx.boltGfx;
      g.clear();
      const a = Math.max(0, fade);

      // Central emission beam shooting straight up out of the orb.
      const beamLen = 150 + (1 - a) * 70;
      g.fillStyle(PALETTES.royal_purple.shine, 0.28 * a);
      g.fillTriangle(fx.orbX - 20, fx.orbY, fx.orbX + 20, fx.orbY, fx.orbX, fx.orbY - beamLen);
      g.fillStyle(0xffffff, 0.55 * a);
      g.fillTriangle(fx.orbX - 8, fx.orbY, fx.orbX + 8, fx.orbY, fx.orbX, fx.orbY - beamLen);

      for (const bolt of fx.bolts) {
        const ex = fx.orbX + Math.cos(bolt.angle) * bolt.len;
        const ey = fx.orbY + Math.sin(bolt.angle) * bolt.len;
        const pts = this.jaggedPoints(fx.orbX, fx.orbY, ex, ey, 6, bolt.len * 0.28);
        this.strokePolyline(g, pts, 9, PALETTES.royal_purple.core, 0.30 * a);    // aura
        this.strokePolyline(g, pts, 4.5, PALETTES.royal_purple.shine, 0.65 * a); // glow
        this.strokePolyline(g, pts, 2, 0xffffff, a);                            // hot core

        if (Math.random() < 0.7) {
          const bi = 2 + Math.floor(Math.random() * (pts.length - 3));
          const anchor = pts[bi];
          const bAng = bolt.angle + (Math.random() - 0.5) * 1.2;
          const bLen = bolt.len * (0.3 + Math.random() * 0.35);
          const bpts = this.jaggedPoints(
            anchor.x, anchor.y,
            anchor.x + Math.cos(bAng) * bLen, anchor.y + Math.sin(bAng) * bLen,
            4, bLen * 0.3
          );
          this.strokePolyline(g, bpts, 3, PALETTES.royal_purple.shine, 0.45 * a);
          this.strokePolyline(g, bpts, 1.25, 0xffffff, 0.8 * a);
        }
      }

      // Orb flash
      g.fillStyle(0xffffff, 0.9 * a);
      g.fillEllipse(fx.orbX, fx.orbY, 16 + (1 - a) * 22, 16 + (1 - a) * 22);
      g.fillStyle(PALETTES.royal_purple.shine, 0.55 * a);
      g.fillEllipse(fx.orbX, fx.orbY, 34 + (1 - a) * 60, 34 + (1 - a) * 60);

      // Expanding shock ring (isometric squash)
      const ringR = 20 + (1 - a) * 170;
      g.lineStyle(3.5 * a, PALETTES.royal_purple.shine, 0.6 * a);
      g.strokeEllipse(fx.orbX, fx.orbY, ringR * 2, ringR * 1.2);
    }

    triggerMusicSyncedObeliskDischarge() {
      const fx = this.obeliskFx;
      if (!fx || this.obeliskState !== 'active') return;
      fx.phase = 'discharge';
      fx.t = 0;
      fx.bolts = this.buildTeslaBolts();
      this.emitObeliskElectricSfx('OBELISK_DISCHARGE', {
        intensity: 1,
        pulseIndex: this.musicBeatSync?.snareCount ?? 0,
      });
    }

    getArenaBeatSnapshot(leadMs = 0) {
      const music = getGameBackgroundMusicService();
      const playbackMs = music.getPlaybackTimeMs();
      const baseMs = playbackMs != null ? playbackMs : this.time.now;
      const pacing = music.getState().pacing || GAME_BACKGROUND_MUSIC_PACING;
      return resolveMusicBeatSnapshot(baseMs + leadMs, pacing);
    }

    getObeliskBeatSnapshot() {
      return this.getArenaBeatSnapshot(GAME_OBELISK_MUSIC_SYNC.leadMs);
    }

    getObeliskSnaresPerDischarge() {
      const pacing = getGameBackgroundMusicService().getState().pacing || GAME_BACKGROUND_MUSIC_PACING;
      const [beatsPerBar] = pacing.timeSignature;
      return snaresPerDischargeCycle(GAME_OBELISK_MUSIC_SYNC.dischargeEveryMeasures, beatsPerBar);
    }

    isMusicPlaybackSynced() {
      return getGameBackgroundMusicService().isPlaybackActive();
    }

    syncMusicBeatCrossings(beatSnapshot) {
      if (!beatSnapshot?.beat) return;
      const exactBeat = beatSnapshot.beat.exactBeat;
      const prev = this.musicBeatSync?.lastExactBeat;
      const crossings = findSnareCrossings(prev, exactBeat);
      const cycleSnares = this.getObeliskSnaresPerDischarge();

      for (const beatIdx of crossings) {
        this.musicBeatSync.snareCount += 1;
        if (isDischargeSnareHit(this.musicBeatSync.snareCount, cycleSnares)) {
          this.triggerMusicSyncedObeliskDischarge();
        } else if (isLastChargeSnare(this.musicBeatSync.snareCount, cycleSnares)) {
          this.emitObeliskElectricSfx('OBELISK_CHARGE', {
            intensity: 0.95,
            pulseIndex: this.musicBeatSync.snareCount,
          });
        }
      }

      this.musicBeatSync.lastExactBeat = exactBeat;
    }

    syncBraziersToBeat(beatSnapshot) {
      if (!this.torchEffects?.length || !beatSnapshot?.beat) return;
      const exactBeat = beatSnapshot.beat.exactBeat;

      for (const effect of this.torchEffects) {
        const sentinel = effect.sentinelId
          ? this.getSentinelRecords().find((entry) => entry.id === effect.sentinelId)
          : null;
        if (sentinel?.defeated) continue;

        const phaseOffset = effect.bobPhaseOffset ?? 0;
        const bobY = bpmBobOffset(exactBeat, phaseOffset);
        if (effect.bobContainer && effect.anchorX != null && effect.anchorY != null) {
          effect.bobContainer.setPosition(effect.anchorX, effect.anchorY + bobY);
        }
        const shadow = bpmBobShadow(exactBeat, phaseOffset);
        if (effect.shadow && effect.shadowBaseX != null && effect.shadowBaseY != null) {
          effect.shadow.setPosition(effect.shadowBaseX, effect.shadowBaseY + bobY * 0.35);
          effect.shadow.bobScale = shadow.scale;
          effect.shadow.bobAlpha = shadow.alpha;
        }
        if (effect.ring1) {
          effect.ring1.rotation = (effect.ring1BaseRot ?? 0) + exactBeat * Math.PI * 2;
        }
        if (effect.ring2) {
          effect.ring2.rotation = (effect.ring2BaseRot ?? 0) - exactBeat * Math.PI * 1.5;
        }
      }
    }

    updateObeliskFxMusicDriven(delta, beatSnapshot) {
      const fx = this.obeliskFx;
      if (!fx) return 0;
      if (this.obeliskState && this.obeliskState !== 'active') {
        return 0;
      }

      fx.t += delta;
      let plasmaTarget = 0;
      const cycleSnares = this.getObeliskSnaresPerDischarge();
      const snareCycle = (this.musicBeatSync?.snareCount ?? 0) % cycleSnares;
      const cycleProgress = snareCycle / cycleSnares;
      const beatFlicker = 1 + (Math.random() - 0.5) * 0.08;

      if (fx.phase === 'discharge') {
        const p = Math.min(1, fx.t / fx.dischargeMs);
        const fade = 1 - p;
        this.drawObeliskCharge(Math.max(fade, 0.6));
        this.drawTeslaDischarge(fade);
        if (this.bloomFx) this.bloomFx.strength = this.baseBloom + fade * 1.6;
        plasmaTarget = 1;
        if (fx.t >= fx.dischargeMs) {
          fx.phase = 'charge';
          fx.t = 0;
          fx.boltGfx.clear();
        }
      } else {
        const phaseLift = beatSnapshot?.beat?.phase ?? 0;
        fx.intensity = Math.min(1, (cycleProgress + phaseLift * 0.12) * beatFlicker);
        fx.phase = 'charge';
        this.drawObeliskCharge(fx.intensity);
        if (this.bloomFx) this.bloomFx.strength = this.baseBloom + fx.intensity * 0.6;
        plasmaTarget = fx.intensity;
      }

      return plasmaTarget;
    }

    updateObeliskFx(time, delta) {
      const beatSnapshot = this.getArenaBeatSnapshot();
      this.syncBraziersToBeat(beatSnapshot);

      if (this.isMusicPlaybackSynced()) {
        const obeliskBeat = this.getObeliskBeatSnapshot();
        this.syncMusicBeatCrossings(obeliskBeat);
        return this.updateObeliskFxMusicDriven(delta, obeliskBeat);
      }

      const fx = this.obeliskFx;
      if (!fx) return 0;
      if (this.obeliskState && this.obeliskState !== 'active') {
        return 0;
      }
      fx.t += delta;

      let plasmaTarget = 0;

      if (fx.phase === 'charge') {
        const p = Math.min(1, fx.t / fx.chargeMs);
        const flicker = 1 + (Math.random() - 0.5) * 0.15 * p; // crackle as it peaks
        fx.intensity = Math.min(1, p * p * flicker);
        this.drawObeliskCharge(fx.intensity);
        if (this.bloomFx) this.bloomFx.strength = this.baseBloom + fx.intensity * 0.6;
        plasmaTarget = fx.intensity;
        if (fx.t >= fx.chargeMs) {
          const pulseIndex = Math.floor(this.time.now / 1000);
          this.emitObeliskElectricSfx('OBELISK_CHARGE', {
            intensity: fx.intensity,
            pulseIndex,
          });
          fx.phase = 'discharge';
          fx.t = 0;
          fx.bolts = this.buildTeslaBolts();
          this.emitObeliskElectricSfx('OBELISK_DISCHARGE', {
            intensity: 1,
            pulseIndex: pulseIndex + 1,
          });
        }
      } else if (fx.phase === 'discharge') {
        const p = Math.min(1, fx.t / fx.dischargeMs);
        const fade = 1 - p;
        this.drawObeliskCharge(Math.max(fade, 0.6)); // orb stays hot mid-blast
        this.drawTeslaDischarge(fade);
        if (this.bloomFx) this.bloomFx.strength = this.baseBloom + fade * 1.6;
        plasmaTarget = 1; // peak plasma during the bolt strike
        if (fx.t >= fx.dischargeMs) {
          fx.phase = 'cooldown';
          fx.t = 0;
          fx.boltGfx.clear();
        }
      } else { // cooldown
        const p = Math.min(1, fx.t / fx.cooldownMs);
        fx.intensity = (1 - p) * 0.5;
        this.drawObeliskCharge(fx.intensity);
        if (this.bloomFx) this.bloomFx.strength = this.baseBloom + fx.intensity * 0.2;
        plasmaTarget = (1 - p) * 0.35;
        if (fx.t >= fx.cooldownMs) {
          fx.phase = 'charge';
          fx.t = 0;
        }
      }

      return plasmaTarget;
    }

    applyPlasmaSmooth(plasma) {
      if (!this.torchEffects) return;
      for (const effect of this.torchEffects) {
        if (!effect.fireSprite) continue;
        const baseScale = 2.16;
        effect.fireSprite.setScale(baseScale + plasma * 0.55);
        const g = Math.floor(255 - plasma * 75);
        const tint = (255 << 16) | (g << 8) | 255;
        effect.fireSprite.setTint(tint);
        if (effect.fireSprite._plasmaBloom) {
          effect.fireSprite._plasmaBloom.strength = plasma * 1.2;
        }
      }
    }

    syncPlasmaResonance(plasmaTarget, rate = 0.07) {
      const current = this._plasmaSmooth || 0;
      this._plasmaSmooth = current + (plasmaTarget - current) * rate;
      this.applyPlasmaSmooth(this._plasmaSmooth);
      return this._plasmaSmooth;
    }

    buildArenaTickPayload(plasmaTarget, plasmaRate = 0.07) {
      return {
        firePixels: this.firePixels,
        fireW: this.fireW,
        fireH: this.fireH,
        seed: this._frameSeed++,
        torcheffects: (this.torchEffects || []).map(() => ({})),
        plasma: {
          target: plasmaTarget,
          current: this._plasmaSmooth || 0,
          rate: plasmaRate,
        },
      };
    }

    applyArenaTickResult(result, time) {
      if (!result || !this.firePixels) return;

      if (result.firePixelsNext && result.fireRgba) {
        this.firePixels = result.firePixelsNext;
        this.fireImageData.data.set(result.fireRgba);
        this.fireContext.putImageData(this.fireImageData, 0, 0);
        this.fireTexture.refresh();
      }

      if (this.torchEffects && result.torchData) {
        const glowPhase = this.getArenaBeatSnapshot()?.beat?.exactBeat ?? (time * 0.001);
        for (let i = 0; i < this.torchEffects.length && i < result.torchData.length; i++) {
          const effect = this.torchEffects[i];
          const { shadowScale, ambientAlpha, ambientScale, flicker } = result.torchData[i];
          effect.shadow.alpha = effect.shadow.bobAlpha * (0.85 + flicker * 0.15);
          effect.shadow.setScale(effect.shadow.bobScale * shadowScale, effect.shadow.bobScale * shadowScale);
          effect.ambient.alpha = ambientAlpha;
          effect.ambient.setScale(ambientScale, ambientScale);
          this.renderTorchGlowCanvas(effect, glowPhase);
        }
      }
    }

    async runArenaTickDirect(payload) {
      const { arenaTickProcessor } = await import('../../codex/core/microprocessors/arena/arena-tick.processor.js');
      return arenaTickProcessor(payload);
    }

    dispatchArenaVisualTick(payload, time) {
      const tickGen = ++this._arenaTickGen;
      const applyLatest = (result) => {
        if (tickGen !== this._arenaTickGen) return;
        this.applyArenaTickResult(result, time);
      };

      const runDirect = () => this.runArenaTickDirect(payload).then(applyLatest);

      if (this._arenaTickInFlight) {
        void runDirect().catch((e) => {
          console.warn('[CombatArena] arena.tick direct fallback failed:', e.message);
        });
        return;
      }

      this._arenaTickInFlight = true;
      processorBridge.execute('arena.tick', payload)
        .catch(() => this.runArenaTickDirect(payload))
        .then(applyLatest)
        .catch((e) => console.warn('[CombatArena] arena.tick failed:', e.message))
        .finally(() => {
          if (tickGen === this._arenaTickGen) {
            this._arenaTickInFlight = false;
          }
        });
    }

    update(time, delta) {
      // Obelisk, brazier bob, and beat crossings stay on the main thread.
      const plasmaTarget = this.updateObeliskFx(time, delta);
      if (!this.firePixels) return;

      // Plasma must track obelisk intensity every frame — never defer to worker round-trip.
      const plasmaRate = 0.07;
      this.syncPlasmaResonance(plasmaTarget, plasmaRate);

      // Doom fire + torch flicker via AMP worker (direct fallback if worker is busy/slow).
      this.dispatchArenaVisualTick(this.buildArenaTickPayload(plasmaTarget, plasmaRate), time);
    }

    renderTorchGlowCanvas(effect, beatPhase) {
      const ctx = effect.glowCtx;
      const size = effect.size;
      const cx = size / 2;
      const cy = size / 2;

      ctx.clearRect(0, 0, size, size);

      ctx.globalCompositeOperation = 'source-over';
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35);
      grd.addColorStop(0, 'rgba(51, 0, 170, 1)');
      grd.addColorStop(1, 'rgba(51, 0, 170, 0)');
      ctx.fillStyle = grd;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.5);
      ctx.rotate(beatPhase * Math.PI * 2 * 0.5);
      ctx.fillRect(-45, -5, 90, 10);
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.5);
      ctx.rotate(-beatPhase * Math.PI * 2 * 0.33);
      ctx.fillRect(-45, -4, 90, 8);
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.5);
      for (let i = 0; i < 3; i++) {
        const angle = beatPhase * Math.PI * 2 + (i * Math.PI * 0.6);
        const rx = Math.cos(angle) * 25;
        const ry = Math.sin(angle) * 25;
        ctx.beginPath();
        ctx.arc(rx, ry, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      effect.glowTex.refresh();
    }
    
    drawTorch(x, y, options = {}) {
      if (!this.torchEffects) this.torchEffects = [];
      const tIndex = this.torchEffects.length;
      const sentinelId = options.sentinelId || null;
      const sentinelDef = sentinelId ? getSentinelDefinition(sentinelId) : null;
      
      // 0. Realistic ground shadow for the floating matrix
      const shadow = this.add.graphics();
      shadow.fillStyle(PALETTES.obsidian.shadow, 1);
      shadow.fillEllipse(0, 0, 18, 9);
      shadow.setPosition(x, y + 10);
      shadow.bobAlpha = 0.8;
      shadow.bobScale = 1.0;
      
      // 1. Ambient ground glow (Dynamic canvas for internal shadow casting)
      const size = 128;
      const texKey = 'ambient-glow-' + tIndex;
      let glowTex = this.textures.get(texKey);
      if (glowTex.key !== texKey) { // Create if it doesn't exist
          glowTex = this.textures.createCanvas(texKey, size, size);
      }
      const glowCtx = glowTex.getContext();
      
      const ambient = this.add.sprite(x, y + 10, texKey);
      ambient.setBlendMode(phaserRuntime.BlendModes.ADD);
      
      const floatY = y - 15;
      const bobContainer = this.add.container(x, floatY);

      // 2. Floating Obsidian Crystal Base (Inverted Pyramid) — local to bobContainer
      const graphics = this.add.graphics();
      const pw = 14;
      const ph = 7;
      const drop = 25;

      const tTop = { x: 0, y: -ph };
      const tRight = { x: pw, y: 0 };
      const tBottom = { x: 0, y: ph };
      const tLeft = { x: -pw, y: 0 };
      const bottomTip = { x: 0, y: drop };

      const palette = PALETTES.obsidian;
      const leftColor = this.getLambertColor(-1, 0.5, -0.5, palette);
      const rightColor = this.getLambertColor(1, 0.5, -0.5, palette);
      const topColor = this.getLambertColor(0, 0, 1, palette);

      graphics.fillStyle(leftColor, 1);
      graphics.beginPath();
      graphics.moveTo(tLeft.x, tLeft.y);
      graphics.lineTo(tBottom.x, tBottom.y);
      graphics.lineTo(bottomTip.x, bottomTip.y);
      graphics.closePath();
      graphics.fillPath();

      graphics.fillStyle(rightColor, 1);
      graphics.beginPath();
      graphics.moveTo(tBottom.x, tBottom.y);
      graphics.lineTo(tRight.x, tRight.y);
      graphics.lineTo(bottomTip.x, bottomTip.y);
      graphics.closePath();
      graphics.fillPath();

      graphics.fillStyle(topColor, 1);
      graphics.beginPath();
      graphics.moveTo(tTop.x, tTop.y);
      graphics.lineTo(tRight.x, tRight.y);
      graphics.lineTo(tBottom.x, tBottom.y);
      graphics.lineTo(tLeft.x, tLeft.y);
      graphics.closePath();
      graphics.fillPath();

      graphics.lineStyle(1, palette.lit, 0.8);
      graphics.beginPath();
      graphics.moveTo(tLeft.x, tLeft.y);
      graphics.lineTo(bottomTip.x, bottomTip.y);
      graphics.lineTo(tRight.x, tRight.y);
      graphics.moveTo(tBottom.x, tBottom.y);
      graphics.lineTo(bottomTip.x, bottomTip.y);
      graphics.strokePath();
      
      bobContainer.add(graphics);

      // 3. Mount the dynamic Doom Fire texture
      const fireSprite = this.add.sprite(0, 5, 'doom-fire');
      fireSprite.setOrigin(0.5, 1);
      fireSprite.setScale(2.16);
      fireSprite.setBlendMode(phaserRuntime.BlendModes.ADD);
      if (fireSprite.postFX) {
        fireSprite._plasmaBloom = fireSprite.postFX.addBloom(0xccffff, 1, 1, 1, 0);
      }
      bobContainer.add(fireSprite);

      this.torchEffects.push({
        shadow,
        ambient,
        glowTex,
        glowCtx,
        size,
        fireSprite,
        bobContainer,
        anchorX: x,
        anchorY: floatY,
        shadowBaseX: x,
        shadowBaseY: y + 10,
        bobPhaseOffset: tIndex * 0.5,
        ring1: null,
        ring2: null,
        ring1BaseRot: 0.3,
        ring2BaseRot: -0.4,
        sentinelId,
        gridTx: sentinelDef?.tx ?? null,
        gridTy: sentinelDef?.ty ?? null,
      });

      // 4. Gyroscopic Containment Rings (Armillary Matrix)
      const ring1 = this.add.graphics();
      ring1.setBlendMode(phaserRuntime.BlendModes.ADD);
      ring1.lineStyle(2, PALETTES.royal_purple.shine, 0.9);
      ring1.strokeEllipse(0, 0, 45, 15);
      ring1.setPosition(0, -20);
      ring1.rotation = 0.3;

      const ring2 = this.add.graphics();
      ring2.setBlendMode(phaserRuntime.BlendModes.ADD);
      ring2.lineStyle(1.5, PALETTES.royal_purple.core, 1);
      ring2.strokeEllipse(0, 0, 55, 12);
      ring2.setPosition(0, -25);
      ring2.rotation = -0.4;
      
      bobContainer.add([ring1, ring2]);

      const torchEntry = this.torchEffects[this.torchEffects.length - 1];
      torchEntry.ring1 = ring1;
      torchEntry.ring2 = ring2;
      torchEntry.ring1BaseRot = ring1.rotation;
      torchEntry.ring2BaseRot = ring2.rotation;

      // 5. High Fidelity Particle Emitter for Doom Fire Sparks
      if (this.add.particles) {
        const emitter = this.add.particles(0, -20, 'doom-fire', {
          speed: { min: 20, max: 80 },
          angle: { min: 250, max: 290 }, // Emits upwards
          scale: { start: 0.3, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: 1500,
          blendMode: 'ADD',
          frequency: 50,
          tint: [0xff4400, 0xffaa00, 0xff0044]
        });
        bobContainer.add(emitter);
      } else {
        const runes = this.add.graphics();
        runes.setBlendMode(phaserRuntime.BlendModes.ADD);
        runes.fillStyle(PALETTES.royal_purple.lit, 1);
        runes.fillEllipse(-25, -45, 3, 3);
        runes.fillEllipse(30, -20, 2, 2);
        runes.fillEllipse(15, -55, 4, 4);
        runes.fillEllipse(-30, -15, 2, 2);
        bobContainer.add(runes);
      }

      // Levitation + shadow bob are driven by BGM beat clock in updateObeliskFx.
    }
    
    drawTeleportationPortal() {
      // Anchored on the Northeast grid tile (8,0)
      const px = 320;
      const py = -125;
      const pW = 48; // Portal width
      const pH = 160; // Portal height

      const portalGroup = this.add.container(px, py);

      // 0. Solid 3D Isometric Support Platform
      const mechPlatform = this.add.graphics();
      const platW = 60; // Width of the platform
      const platH = 30; // Isometric depth
      const platZ = 20; // Vertical thickness
      
      mechPlatform.lineStyle(2, 0x447799, 1);
      
      // Top face
      mechPlatform.fillStyle(0x0a101a, 1);
      mechPlatform.beginPath();
      mechPlatform.moveTo(0, 85 - platH);
      mechPlatform.lineTo(platW, 85);
      mechPlatform.lineTo(0, 85 + platH);
      mechPlatform.lineTo(-platW, 85);
      mechPlatform.closePath();
      mechPlatform.fillPath();
      mechPlatform.strokePath();

      // Left face
      mechPlatform.fillStyle(0x050a10, 1);
      mechPlatform.beginPath();
      mechPlatform.moveTo(-platW, 85);
      mechPlatform.lineTo(0, 85 + platH);
      mechPlatform.lineTo(0, 85 + platH + platZ);
      mechPlatform.lineTo(-platW, 85 + platZ);
      mechPlatform.closePath();
      mechPlatform.fillPath();
      mechPlatform.strokePath();

      // Right face
      mechPlatform.fillStyle(0x0f1520, 1);
      mechPlatform.beginPath();
      mechPlatform.moveTo(0, 85 + platH);
      mechPlatform.lineTo(platW, 85);
      mechPlatform.lineTo(platW, 85 + platZ);
      mechPlatform.lineTo(0, 85 + platH + platZ);
      mechPlatform.closePath();
      mechPlatform.fillPath();
      mechPlatform.strokePath();
      
      portalGroup.add(mechPlatform);

      // 1. Arcane/Technological Skeleton (Backplate)
      const mechBack = this.add.graphics();
      mechBack.fillStyle(0x0a101a, 1);
      mechBack.fillRect(-22, -80, 44, 160);
      portalGroup.add(mechBack);

      // 2. Holographic Portal Energy Surface (Cellular Drip Algorithm)
      if (!this.textures.exists('portal-energy')) {
        this.textures.createCanvas('portal-energy', pW, pH);
      }
      const portalTex = this.textures.get('portal-energy');
      const pCtx = portalTex.getContext();
      
      const portalImg = this.add.image(0, 0, 'portal-energy');
      portalImg.setBlendMode(phaserRuntime.BlendModes.ADD);
      portalImg.setAlpha(0.9);
      if (portalImg.postFX) portalImg.postFX.addBloom(0x4400ff, 1.5, 1.5, 2, 1.5);
      portalGroup.add(portalImg);

      // 3. Imposing Mechanical Skeleton (Front frame)
      const mechFront = this.add.graphics();
      mechFront.fillStyle(0x1a2a3a, 1);
      mechFront.lineStyle(2, 0x0f1520, 1);

      mechFront.beginPath();
      // Outer border (sharp, angled geometry)
      mechFront.moveTo(-35, 85);
      mechFront.lineTo(-35, -85);
      mechFront.lineTo(-15, -105);
      mechFront.lineTo(15, -105);
      mechFront.lineTo(35, -85);
      mechFront.lineTo(35, 85);
      // Inner hole cutting through
      mechFront.lineTo(20, 85);
      mechFront.lineTo(20, -80);
      mechFront.lineTo(0, -100);
      mechFront.lineTo(-20, -80);
      mechFront.lineTo(-20, 85);
      mechFront.closePath();
      mechFront.fillPath();
      mechFront.strokePath();

      // Obsidian Bezel filling the top triangle gap
      mechFront.fillStyle(0x161220, 1); // Darker obsidian for left side
      mechFront.beginPath();
      mechFront.moveTo(-20, -80);
      mechFront.lineTo(0, -100);
      mechFront.lineTo(0, -85); // inner point
      mechFront.closePath();
      mechFront.fillPath();

      mechFront.fillStyle(0x1f192b, 1); // Brighter obsidian for right side
      mechFront.beginPath();
      mechFront.moveTo(20, -80);
      mechFront.lineTo(0, -100);
      mechFront.lineTo(0, -85);
      mechFront.closePath();
      mechFront.fillPath();

      // Sharp highlight stroke for the obsidian bezel
      mechFront.lineStyle(1, 0x443366, 0.8);
      mechFront.beginPath();
      mechFront.moveTo(-20, -80);
      mechFront.lineTo(0, -100);
      mechFront.lineTo(20, -80);
      mechFront.lineTo(0, -85);
      mechFront.closePath();
      mechFront.strokePath();

      // Arcane tech nodes
      mechFront.fillStyle(0x00ffff, 1);
      const nodes = [
        {x: -25, y: -75}, {x: 25, y: -75},
        {x: -25, y: -10}, {x: 25, y: -10},
        {x: -25, y: 55},  {x: 25, y: 55},
        {x: 0, y: -95}
      ];
      nodes.forEach(n => mechFront.fillCircle(n.x, n.y, 3));
      if (mechFront.postFX) mechFront.postFX.addBloom(0x00ffff, 1, 1, 1, 1.2);
      
      portalGroup.add(mechFront);
      portalGroup.setDepth(ARENA_DEPTH.PORTAL);

      this.portalHitArea = new phaserRuntime.Geom.Rectangle(-36, -108, 72, 200);
      this.portalVisual = portalGroup;
      portalGroup.on('pointerdown', (pointer) => {
        if (pointer.button !== 0 || this.cutsceneInputLock) return;
        this.tryEnterPortal();
      });
      portalGroup.on('pointerover', () => {
        if (this.isPortalBeckoning() || this.isPortalCleared()) this.input.setDefaultCursor('pointer');
      });
      portalGroup.on('pointerout', () => {
        this.input.setDefaultCursor('default');
      });
      this.refreshPortalInteractionState();

      // Arrays for 2D Water Ripple simulation
      let buf1 = new Float32Array(pW * pH);
      let buf2 = new Float32Array(pW * pH);
      let angle = 0;

      this.time.addEvent({
        delay: 30, // ~33fps
        loop: true,
        callback: () => {
          // Cellular Drip Algorithm simulating splashing water
          if (Math.random() > 0.4) {
             const rx = 4 + Math.floor(Math.random() * (pW - 8));
             const ry = 4 + Math.floor(Math.random() * (pH - 8));
             buf1[ry * pW + rx] = 500;
          }
          
          // Spiral of Energy generator in the center
          angle += 0.2;
          const cx = Math.floor(pW / 2 + Math.cos(angle) * 10);
          const cy = Math.floor(pH / 2 + Math.sin(angle) * 30);
          if (cx > 0 && cx < pW && cy > 0 && cy < pH) {
              buf1[cy * pW + cx] = 1200;
          }

          const imgData = pCtx.createImageData(pW, pH);
          const data = imgData.data;

          for (let y = 1; y < pH - 1; y++) {
            for (let x = 1; x < pW - 1; x++) {
              const idx = y * pW + x;
              // Ripple formula
              buf2[idx] = (
                buf1[idx - 1] + buf1[idx + 1] + 
                buf1[idx - pW] + buf1[idx + pW]
              ) / 2 - buf2[idx];
              
              buf2[idx] *= 0.94; // Viscosity
              
              const val = Math.max(0, Math.min(255, buf2[idx]));
              const cIdx = idx * 4;
              
              // Dark indigo color mapping
              data[cIdx] = Math.floor(val * 0.5);      // R
              data[cIdx+1] = Math.floor(val * 0.1);    // G
              data[cIdx+2] = Math.floor(val + 50);     // B
              data[cIdx+3] = val > 10 ? 255 : 150;     // A
            }
          }
          
          pCtx.putImageData(imgData, 0, 0);
          portalTex.refresh();
          
          const temp = buf1;
          buf1 = buf2;
          buf2 = temp;
        }
      });
    }
    
    drawIsoRing(graphics, cx, cy, radius, thickness, color, alpha) {
      graphics.lineStyle(thickness, color, alpha);
      graphics.beginPath();
      for(let i=0; i<=32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const ex = cx + Math.cos(angle) * radius;
        const ey = cy + Math.sin(angle) * radius * 0.5;
        if(i===0) graphics.moveTo(ex, ey);
        else graphics.lineTo(ex, ey);
      }
      graphics.strokePath();
    }

    drawGalaxyBackground() {
      const galaxyContainer = this.add.container(0, 0);
      galaxyContainer.setDepth(-1000); // Galaxy container behind entire arena
      this.galaxyBg = galaxyContainer; // for destroy in resize
      const bg = this.add.graphics();
      galaxyContainer.add(bg);
      // GALAXY MUST FILL THE ENTIRE CURRENT VIEWPORT (enforced by SCDNA_Gene_Combat_Galaxy_Viewport_Fill.md).
      // Explicitly compute visible world rect from camera + margin so fill and all stars/arms ALWAYS cover 100% of the rendered viewport with no gaps/black.
      // This guarantees the galaxy takes up the WHOLE viewport regardless of size/zoom.
      // Dynamic to current view. Agents are **strictly forbidden** from changing this (see gene).
      const cam = this.cameras.main;
      const gw = this.scale.width;
      const gh = this.scale.height;
      const zoom = cam.zoom || 1;
      const viewLeft = cam.scrollX;
      const viewTop = cam.scrollY;
      const viewW = gw / zoom;
      const viewH = gh / zoom;
      const margin = Math.max(200, Math.min(gw, gh) * 0.2);
      const skyLeft = viewLeft - margin;
      const skyTop = viewTop - margin;
      const skyRight = viewLeft + viewW + margin;
      const skyBottom = viewTop + viewH + margin;
      const skyW = skyRight - skyLeft;
      const skyH = skyBottom - skyTop;
      
      // Deep space void covering the entire visible viewport + margin
      bg.fillStyle(0x020208, 1);
      bg.fillRect(skyLeft, skyTop, skyW, skyH);

      // Distant planet — anchors cosmic scale, breathes softly via rim glow
      if (!this.textures.exists('distant-planet')) {
        const pTex = this.textures.createCanvas('distant-planet', 200, 200);
        const pCtx = pTex.getContext();
        const grd = pCtx.createRadialGradient(70, 70, 10, 100, 100, 90);
        grd.addColorStop(0, 'rgba(160,100,220,1)');
        grd.addColorStop(0.3, 'rgba(80,40,140,1)');
        grd.addColorStop(0.7, 'rgba(30,15,60,1)');
        grd.addColorStop(1, 'rgba(10,5,30,0)');
        pCtx.fillStyle = grd;
        pCtx.fillRect(0, 0, 200, 200);
        pCtx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const y = 50 + i * 18;
          pCtx.fillStyle = `rgba(${30 + i * 4}, ${15 + i * 2}, ${50 + i * 5}, 0.18)`;
          pCtx.beginPath();
          pCtx.ellipse(100, y, 85 - i * 2, 3, 0, 0, Math.PI * 2);
          pCtx.fill();
        }
        pCtx.globalCompositeOperation = 'source-over';
        pTex.refresh();
      }
      if (!this.textures.exists('planet-rim')) {
        const rTex = this.textures.createCanvas('planet-rim', 200, 200);
        const rCtx = rTex.getContext();
        const rgrd = rCtx.createRadialGradient(100, 100, 80, 100, 100, 100);
        rgrd.addColorStop(0, 'rgba(120,80,200,0)');
        rgrd.addColorStop(0.5, 'rgba(120,80,200,0.4)');
        rgrd.addColorStop(1, 'rgba(80,50,160,0)');
        rCtx.fillStyle = rgrd;
        rCtx.fillRect(0, 0, 200, 200);
        rTex.refresh();
      }
      // Position planet in upper left of current view for consistent cosmic feel
      const planetX = skyLeft + 350;
      const planetY = skyTop + 200;
      const planet = this.add.image(planetX, planetY, 'distant-planet').setScale(1.6);
      const planetRim = this.add.image(planetX, planetY, 'planet-rim').setScale(1.65);
      planetRim.setBlendMode(phaserRuntime.BlendModes.ADD);
      planetRim.setAlpha(0.6);
      galaxyContainer.add([planet, planetRim]);
      this.tweens.add({
        targets: planetRim,
        alpha: 0.85,
        scale: 1.75,
        duration: 6000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // Deep space volumetric nebula haze (underneath the island)
      bg.setBlendMode(phaserRuntime.BlendModes.SCREEN);
      for(let i=0; i<40; i++) {
        bg.fillStyle(0x1a053a, phaserRuntime.Math.FloatBetween(0.02, 0.08));
        const nx = phaserRuntime.Math.Between(skyLeft, skyRight);
        const ny = phaserRuntime.Math.Between(skyTop, skyBottom); // Spread across the whole sky
        const rw = phaserRuntime.Math.Between(1500, 3000);
        const rh = phaserRuntime.Math.Between(1500, 3000); // Make them rounder/taller to avoid horizontal banding
        const angle = phaserRuntime.Math.FloatBetween(-Math.PI, Math.PI);
        bg.save();
        bg.translateCanvas(nx, ny);
        bg.rotateCanvas(angle);
        bg.fillEllipse(0, 0, rw, rh);
        bg.restore();
      }

      // Create a tiny canvas texture for the twinkling stars to use as fast sprites
      if (!this.textures.exists('twinkle-star')) {
        const starTex = this.textures.createCanvas('twinkle-star', 8, 8);
        const sCtx = starTex.getContext();
        sCtx.fillStyle = '#ffffff';
        sCtx.beginPath();
        sCtx.arc(4, 4, 4, 0, Math.PI * 2);
        sCtx.fill();
        starTex.refresh();
      }

      // Ice smoke texture — wispy vapor (hot air meeting cold air), stretched FBM
      if (!this.textures.exists('ice-smoke')) {
        const w = 128, h = 128;
        const iTex = this.textures.createCanvas('ice-smoke', w, h);
        const iCtx = iTex.getContext();
        const imageData = iCtx.createImageData(w, h);
        const data = imageData.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let n = 0, amp = 1, freq = 0.04, max = 0;
            for (let o = 0; o < 5; o++) {
              n += this.smoothNoise2D(x * freq * 1.3, y * freq * 0.55) * amp;
              max += amp;
              amp *= 0.5;
              freq *= 2;
            }
            n = Math.max(0, (n / max - 0.35) * 2.6);
            const dx = x - w / 2, dy = y - h / 2;
            const r = Math.sqrt(dx * dx + dy * dy) / (w / 2);
            const edge = Math.max(0, 1 - r);
            const edgeSoft = edge * edge * (3 - 2 * edge);
            const a = Math.min(1, n * edgeSoft) * 0.95;
            const idx = (y * w + x) * 4;
            data[idx] = 240;
            data[idx + 1] = 248;
            data[idx + 2] = 255;
            data[idx + 3] = Math.floor(a * 255);
          }
        }
        iCtx.putImageData(imageData, 0, 0);
        iTex.refresh();
      }

      // Parallax Galaxy Core (Massive swirling spiral arms) - number scaled to area for appropriate density to fill viewport without cluttering arena
      bg.setBlendMode(phaserRuntime.BlendModes.ADD);
      const spiralArms = 4;
      const area = skyW * skyH;
      // The spiral core is a fixed world-space object centered at the origin — its reach and
      // star count must NOT scale with the viewport (that shrank it to a pale nub). Restore the
      // original dense 3000-star, 2500px-radius colored spiral.
      const spiralReach = 2500;
      const numSpiral = 3000;
      for(let i=0; i<numSpiral; i++) {
        const armOffset = phaserRuntime.Math.FloatBetween(0, Math.PI * 2);
        const distance = phaserRuntime.Math.FloatBetween(50, spiralReach);
        // Golden ratio spiral rotation
        const angle = (distance * 0.002) + (Math.floor(armOffset / (Math.PI*2/spiralArms)) * (Math.PI*2/spiralArms));
        
        // Add scatter / dust
        const scatter = phaserRuntime.Math.FloatBetween(-200, 200) * (distance / 500);
        const sx = Math.cos(angle) * distance + scatter;
        const sy = Math.sin(angle) * distance * 0.4 + scatter * 0.4 - 400; // Shift galaxy up and flatten
        
        const size = phaserRuntime.Math.FloatBetween(0.5, 4.0);
        
        // Core is intensely bright/white/cyan, edges are deep purple
        let color = 0xcceeff; // Core
        if (distance > 1500) color = 0x330055;
        else if (distance > 800) color = 0xff33cc;
        else if (distance > 400) color = 0x00ffff;
        
        const brightness = phaserRuntime.Math.FloatBetween(0.2, 1.0) * Math.max(0.1, 1 - (distance / spiralReach));
        
        // Make ~15% of the stars twinkle independently
        if (Math.random() > 0.85) {
          const star = this.add.image(sx, sy, 'twinkle-star');
          star.setBlendMode(phaserRuntime.BlendModes.ADD);
          star.setTint(color);
          star.setScale(size / 8); // Base texture is 8x8
          star.setAlpha(brightness);
          galaxyContainer.add(star);
          
          this.tweens.add({
            targets: star,
            alpha: 0,
            duration: phaserRuntime.Math.Between(1500, 5000), // Random speed
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: phaserRuntime.Math.Between(0, 5000) // Random start offset so they never sync up
          });
        } else {
          bg.fillStyle(color, brightness);
          bg.fillEllipse(sx, sy, size, size);
        }
      }

      bg.setBlendMode(phaserRuntime.BlendModes.ADD);
      const numFiller = Math.floor(area / 16000);
      for(let i=0; i<numFiller; i++) {
        let sx = phaserRuntime.Math.Between(skyLeft, skyRight);
        let sy = phaserRuntime.Math.Between(skyTop, skyBottom);
        if (Math.random() > 0.4) {
          const curve = Math.sin(sx / 800) * 300;
          sy = curve + phaserRuntime.Math.Between(-300, 300);
        }
        
        const size = phaserRuntime.Math.FloatBetween(0.2, 2.5);
        const brightness = phaserRuntime.Math.FloatBetween(0.1, 1.0);
        const colors = [0xffffff, 0xcceeff, 0xffccff, 0xaaffcc, 0xffbb99];
        
        bg.fillStyle(colors[Math.floor(Math.random() * colors.length)], brightness);
        bg.fillCircle(sx, sy, size);
      }
      bg.setBlendMode(phaserRuntime.BlendModes.NORMAL);

      // Shooting stars — periodic diagonal streaks across the upper sky
      if (!this.textures.exists('meteor')) {
        const mTex = this.textures.createCanvas('meteor', 6, 60);
        const mCtx = mTex.getContext();
        const grd = mCtx.createLinearGradient(0, 3, 60, 3);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.1, 'rgba(180,220,255,0.7)');
        grd.addColorStop(0.5, 'rgba(100,150,255,0.3)');
        grd.addColorStop(1, 'rgba(50,100,200,0)');
        mCtx.fillStyle = grd;
        mCtx.beginPath();
        mCtx.moveTo(0, 3);
        mCtx.lineTo(60, 0);
        mCtx.lineTo(60, 6);
        mCtx.closePath();
        mCtx.fill();
        mTex.refresh();
      }
      this.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => {
          if (Math.random() > 0.4) return;
          const startX = phaserRuntime.Math.Between(skyLeft, skyRight / 2);
          const startY = phaserRuntime.Math.Between(skyTop, skyBottom / 2);
          const dist = phaserRuntime.Math.Between(500, 1200);
          const drop = phaserRuntime.Math.Between(80, 250);
          const endX = startX + dist;
          const endY = startY + drop;
          const m = this.add.image(startX, startY, 'meteor');
          m.setBlendMode(phaserRuntime.BlendModes.ADD);
          m.setAlpha(0.95);
          m.setRotation(Math.atan2(drop, dist));
          galaxyContainer.add(m);
          if (m.postFX) m.postFX.addBloom(0xaaccff, 1, 1, 1, 1.2);
          this.tweens.add({
            targets: m,
            x: endX,
            y: endY,
            alpha: 0,
            duration: phaserRuntime.Math.Between(800, 1600),
            ease: 'Cubic.easeIn',
            onComplete: () => m.destroy()
          });
        }
      });
    }
  };
}
