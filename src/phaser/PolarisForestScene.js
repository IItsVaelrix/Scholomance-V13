/**
 * Polaris Sonic Thaumaturgist Forest — separate world map (flat plane, tuning-fork trees).
 */

import { generateBattleLeylines } from '../../codex/core/leyline.engine.js';
import { CombatStatController } from '../game/combat/combatStatController.js';
import {
  buildBlockedSet,
  findPath,
  getReachableTiles,
  tileKey,
} from '../game/combat/combatPathfinding.js';
import { COMBAT_FREE_ROAM_MOVEMENT_RANGE } from '../game/combat/combatBattleIntro.js';
import {
  COMBAT_FOREST_MUSIC_EVENT,
  COMBAT_MUSIC_REGION,
  setCombatMusicRegion,
} from '../game/combat/combatMusicRegion.js';
import { compileArenaBattleBoard } from '../game/combat/tacticalBoardMapAdapter.js';
import {
  POLARIS_GRID_SIZE,
  POLARIS_SCENE_ID,
  POLARIS_SPAWN_TILE,
  POLARIS_WORLD_REGION,
} from '../game/world/polarisForestConfig.js';
import { POLARIS_FOREST_MAP_ID } from '../game/world/worldMapRegistry.js';
import {
  bindActiveSceneContextRequest,
  bootstrapIsoCamera,
  bootstrapScenePointerInput,
} from './combatSceneShared.js';

const PALETTES = {
  cyan_glow: { shine: 0x00ffff, lit: 0x0088cc, core: 0x004488, rim: 0x002244, shadow: 0x001122 },
};

const FOREST_TILE = {
  clearing: { shine: 0x66ccaa, lit: 0x44aa88, core: 0x2d7a66, rim: 0x1a5044, shadow: 0x0f3028 },
  moss: { shine: 0x55bb99, lit: 0x338866, core: 0x226655, rim: 0x143d33, shadow: 0x0a221c },
  path: { shine: 0x88aa77, lit: 0x668855, core: 0x4a6640, rim: 0x2d4030, shadow: 0x1a2818 },
};

export default function createPolarisForestScene(phaserRuntime) {
  return class PolarisForestScene extends phaserRuntime.Scene {
    constructor() {
      super({
        key: 'PolarisForestScene',
        active: false,
        visible: false,
      });
    }

    init(data = {}) {
      this.entryConnection = data.entryConnection ?? null;
    }

    preload() {
      this.load.image('purple_void_grass', '/assets/void_tiles/void_forest_grass-png.png');
      this.load.image('void_ice_top', '/assets/void_tiles/void_ice_surface-png.png');
      this.load.image('obsidian_dirt_side', '/assets/void_tiles/obsidian_cliff_edge-png.png');
      this.load.image('obsidian_side', '/assets/void_tiles/obsidian_cliff_edge-png.png');
      this.load.image('purple_void_tree', '/assets/void_tiles/void_crystal_tree-png.png');
      this.load.image('hologram_fern', '/assets/void_tiles/hologram_fern-png.png');
      this.load.image('void_spores', '/assets/void_tiles/void_spores-png.png');
      this.load.image('obsidian_cavity', '/assets/void_tiles/void_spores-png.png');
      this.load.image('ember_pine', '/assets/trees/ember_pine.png');
      this.load.image('void_pine', '/assets/trees/void_pine.png');
      this.load.image('base_pine', '/assets/trees/base_pine.png');
      this.load.image('snow_pine', '/assets/trees/snow_pine.png');
      this.load.image('void_liquid', '/assets/void_tiles/void_liquid-png.png');
      this.load.image('void_flowers', '/assets/void_tiles/void_flowers-png.png');
      this.load.image('void_tall_grass', '/assets/void_tiles/void_tall_grass-png.png');
      this.load.image('void_short_grass', '/assets/void_tiles/void_short_grass-png.png');
      this.load.image('void_ice_sunflower', '/assets/void_tiles/void_ice_sunflower-png.png');
      this.load.json('polaris_forest_chunk', '/assets/void_tiles/polaris_forest_chunk.scdl');
    }

    getLambertColor(nx, ny, nz, palette) {
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const dot = Math.max(0, nz / len);
      const shade = 0.35 + dot * 0.65;
      const r = Math.min(255, ((palette.core >> 16) & 0xff) * shade) | 0;
      const g = Math.min(255, ((palette.core >> 8) & 0xff) * shade) | 0;
      const b = Math.min(255, (palette.core & 0xff) * shade) | 0;
      return (r << 16) | (g << 8) | b;
    }

    create() {
      try {
        this.buildWorld();
      } catch (error) {
        console.error('[PolarisForestScene] create failed', error);
        this.events.emit('tile-error', {
          type: 'tile-error',
          message: error?.message || 'Polaris forest failed to load',
        });
      }
    }

    buildWorld() {
      this.worldRegion = POLARIS_WORLD_REGION;
      this.polarisTrees = [];
      this.movementArmed = false;
      this.isWalking = false;
      this.reachableTiles = new Set();
      this.gridTiles = new Map();
      this.leylineTileRegistry = new Map();
      this._blockedTiles = buildBlockedSet();

      bootstrapScenePointerInput(this);
      bootstrapIsoCamera(this, { scrollYOffset: 20, zoom: 1.05, enableDrift: false });

      const plateauZ = 48;
      const tw = 80;
      const th = 40;
      const toIso = (tx, ty) => {
        const ox = tx; 
        const oy = ty;
        return {
          x: (ox - oy) * (tw / 2),
          y: (ox + oy) * (th / 2),
        };
      };

      this.combatGridMetrics = { gridSize: 30, tw, th, plateauZ, toIso };
      this.combatGridSize = 30;
      this.getIsoTarget = (tx, ty) => {
        const pt = toIso(tx, ty);
        return { x: pt.x, y: pt.y - plateauZ };
      };

      this.gridTiles = new Map();
      
      this.leylines = generateBattleLeylines({
        battleSeed: 4242,
        width: 30,
        height: 30,
        blockedCoords: [{ x: POLARIS_SPAWN_TILE.tx, y: POLARIS_SPAWN_TILE.ty }],
        count: 7,
      }).map((entry, index) => ({
        ...entry,
        affinity: 'SONIC',
        id: `polaris-ley-${index}`,
      }));

      this.drawTileForgeScdlChunk(toIso, plateauZ, tw, th);
      
      this.setupPlayer(POLARIS_SPAWN_TILE.tx, POLARIS_SPAWN_TILE.ty, plateauZ, toIso);
      this.cameras.main.startFollow(this.playerContainer, true, 0.08, 0.08, 0, 40);
      this.setupInput();
      this.setupSceneContextBridge();

      setCombatMusicRegion(COMBAT_MUSIC_REGION.POLARIS_FOREST);
      window.dispatchEvent(new CustomEvent(COMBAT_FOREST_MUSIC_EVENT));

      this.events.emit('polaris-forest-ready', {
        type: 'polaris-forest-ready',
        sceneId: POLARIS_SCENE_ID,
        text: 'You step into the Sonic Thaumaturgist Forest of Polaris.',
      });
      this.emitSceneContextState();
    }

    drawTileForgeScdlChunk(toIso, plateauZ, tw, th) {
      const candidate = this.cache.json.get('polaris_forest_chunk');
      if (!candidate || !candidate.layers) return;

      const { isoTile, biomeMaterial, fibonacciField } = candidate.layers;
      if (!isoTile || !isoTile.topPlane) return;

      this._gridGraphics?.destroy();
      const graphics = this.add.graphics();
      graphics.setDepth(10);
      this._gridGraphics = graphics;

      const allCells = [];
      const { assignments } = biomeMaterial || {};
      
      isoTile.topPlane.forEach(cell => allCells.push({ ...cell, type: 'top', material: assignments?.topPlane || 'void_ice_top' }));
      if (isoTile.rimCells) isoTile.rimCells.forEach(cell => allCells.push({ ...cell, type: 'rim', material: assignments?.rim }));
      if (isoTile.sidePlanes) Object.values(isoTile.sidePlanes).flat().forEach(cell => allCells.push({ ...cell, type: 'side', material: assignments?.sidePlane || 'obsidian_side' }));
      
      if (fibonacciField && fibonacciField.seeds) {
        fibonacciField.seeds.forEach((seed, index) => {
          const types = ['hologram_fern', 'purple_void_tree', 'void_pine', 'ember_pine', 'base_pine', 'snow_pine'];
          allCells.push({ 
            x: seed.x,
            y: seed.z || seed.y, // isometric y coordinate
            z: seed.y || 1, // elevation
            type: 'tree', 
            material: types[index % types.length] 
          });
        });
      }

      const getGrassNoise = (x, y) => (Math.sin(x * 0.1 + y * 0.1) + Math.sin(x * 0.15 - y * 0.05) + Math.sin(x * 0.05 + y * 0.2)) / 3;

      let renderedCount = 0;
      allCells.forEach(cell => {
        // TileSize in the chunk is 30x30, we want it centered on the player (12, 12).
        const cx = 12 - 15; 
        const cy = 12 - 15;
        const tx = cx + cell.x;
        const ty = cy + (cell.y || 0); // fallback if y missing
        const pt = toIso(tx, ty);
        
        const mapW = tw;
        const mapH = th;
        let py = pt.y - plateauZ - ((cell.z || 0) * (mapH / 2));

        // Create interactive grid polygons for top tiles
        if (cell.type === 'top') {
          const p1 = { x: pt.x, y: py - th / 2 };
          const p2 = { x: pt.x + tw / 2, y: py };
          const p3 = { x: pt.x, y: py + th / 2 };
          const p4 = { x: pt.x - tw / 2, y: py };

          graphics.lineStyle(1, 0x0088cc, 0.15); // cyan grid
          graphics.beginPath();
          graphics.moveTo(p1.x, p1.y);
          graphics.lineTo(p2.x, p2.y);
          graphics.lineTo(p3.x, p3.y);
          graphics.lineTo(p4.x, p4.y);
          graphics.closePath();
          graphics.strokePath();

          const polyPoints = [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y];
          const hitPoly = new phaserRuntime.Geom.Polygon(polyPoints);
          const interactiveTile = this.add.polygon(0, 0, polyPoints, 0xffffff, 0)
            .setOrigin(0)
            .setDepth(15);
          interactiveTile.setInteractive(hitPoly, phaserRuntime.Geom.Polygon.Contains);

          const leyline = this.leylines.find((entry) => entry.coord.x === tx && entry.coord.y === ty);
          interactiveTile.inspectData = {
            tx, ty, isGrid: true, terrain: 'void_forest', variantId: null,
            leyline: leyline ? { affinity: leyline.affinity, id: leyline.id } : null,
          };
          interactiveTile.interactData = { tx, ty, isGrid: true };
          interactiveTile.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            if (this.movementArmed) this.tryMoveToTile(tx, ty);
          });
          this.gridTiles.set(tileKey(tx, ty), interactiveTile);
        }

        let imgKey = cell.material;
        if (imgKey === 'purple_void_grass' || imgKey === 'void_ice_top') {
          if (imgKey === 'purple_void_grass') {
            const noise = getGrassNoise(cell.x, cell.y);
            if (noise > 0.3) imgKey = 'void_tall_grass';
            else if (noise < -0.3) imgKey = 'void_short_grass';

            const hash = Math.abs(Math.sin(cell.x * 12.9898 + cell.y * 78.233)) * 100;
            if (noise > 0.1 && hash < 4) imgKey = 'void_ice_sunflower';
            else if (hash > 90 && hash < 95) imgKey = 'void_flowers';
          }
        }

        const depth = py + (cell.type === 'tree' ? mapH : 0); // Sort by Y-coordinate

        if (cell.type === 'top' || cell.type === 'rim') {
          this.add.image(pt.x, py, imgKey).setDepth(depth).setDisplaySize(mapW, mapH);
          renderedCount++;
        } else if (cell.type === 'side') {
          this.add.image(pt.x, py + mapH/2, imgKey).setOrigin(0.5, 0).setDepth(depth).setDisplaySize(mapW, mapH * 2);
          renderedCount++;
        } else if (cell.type === 'tree') {
          const img = this.add.image(pt.x, py, imgKey).setOrigin(0.5, 1).setDepth(depth);
          const aspect = img.height ? (img.height / img.width) : 1.5;
          img.setDisplaySize(140, 140 * aspect);
          renderedCount++;
        }
      });
      console.log(`[TileForge] Rendered ${renderedCount} sprites from SCDL chunk.`);
    }


    handleEquipmentChange = (event) => {
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
        const frame0Id = item ? `${item.assetId}-f0` : null;
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

    setupInput() {
      this.boundCanvasPointerDown = (e) => this.handleCanvasPointerDown(e);
      this.boundCanvasContextMenu = (e) => {
        e.preventDefault();
        this.handleCanvasContextMenu(e);
      };
      if (this.game.canvas) {
        this.game.canvas.addEventListener('pointerdown', this.boundCanvasPointerDown);
        this.game.canvas.addEventListener('contextmenu', this.boundCanvasContextMenu);
        this.events.once('destroy', () => {
          this.game.canvas?.removeEventListener('pointerdown', this.boundCanvasPointerDown);
          this.game.canvas?.removeEventListener('contextmenu', this.boundCanvasContextMenu);
        });
      }
    }

    setupSceneContextBridge() {
      this.boundRequestSceneContext = bindActiveSceneContextRequest(
        this,
        () => this.emitSceneContextState(),
      );
      window.addEventListener('request-scene-context', this.boundRequestSceneContext);
      this.events.once('destroy', () => {
        window.removeEventListener('request-scene-context', this.boundRequestSceneContext);
      });
    }

    toggleMovementArmed() {
      this.movementArmed = !this.movementArmed;
      this.refreshMovementHighlights();
    }

    getBlockedTiles() {
      return this._blockedTiles || buildBlockedSet();
    }

    refreshMovementHighlights() {
      if (!this.playerGridPos || !this.gridTiles) return;
      if (!this.movementArmed) {
        this.reachableTiles = new Set();
        for (const [, tile] of this.gridTiles) {
          tile.setFillStyle(0xffffff, 0);
        }
        return;
      }
      this.reachableTiles = getReachableTiles(
        this.playerGridPos,
        COMBAT_FREE_ROAM_MOVEMENT_RANGE,
        this.getBlockedTiles(),
        new Set(this.gridTiles.keys())
      );
      for (const [key, tile] of this.gridTiles) {
        if (this.reachableTiles.has(key)) {
          tile.setFillStyle(PALETTES.cyan_glow.shine, 0.18);
        } else {
          tile.setFillStyle(0xffffff, 0);
        }
      }
    }

    tryMoveToTile(tx, ty) {
      if (!this.movementArmed || this.isWalking || !this.playerGridPos) return false;
      if (this.playerGridPos.tx === tx && this.playerGridPos.ty === ty) return false;
      const path = findPath(this.playerGridPos, { tx, ty }, this.getBlockedTiles(), new Set(this.gridTiles.keys()));
      if (path.length === 0) return false;
      this.followGridPath(path);
      return true;
    }

    followGridPath(path) {
      if (!path.length || !this.playerContainer) return;
      this.isWalking = true;
      let step = 0;
      const walk = () => {
        if (step >= path.length) {
          this.isWalking = false;
          this.refreshMovementHighlights();
          this.emitSceneContextState();
          return;
        }
        const next = path[step];
        step += 1;
        this.playerGridPos = { tx: next.tx, ty: next.ty };
        this.stats?.setPosition('player', next.tx, next.ty);
        const tile = this.getIsoTarget(next.tx, next.ty);
        this.tweens.add({
          targets: this.playerContainer,
          x: tile.x,
          y: tile.y,
          duration: 220,
          ease: 'Cubic.easeInOut',
          onUpdate: () => {
            this.playerContainer.setDepth(this.playerContainer.y + 1);
          },
          onComplete: () => {
            walk();
          },
        });
      };
      walk();
    }

    handleCanvasPointerDown(event) {
      if (event.button !== 2) return;
      this.handleCanvasContextMenu(event);
    }

    handleCanvasContextMenu(event) {
      const camera = this.cameras.main;
      const worldX = camera.scrollX + event.offsetX / camera.zoom;
      const worldY = camera.scrollY + event.offsetY / camera.zoom;
      let closest = null;
      let closestDist = Infinity;

      for (const [, tile] of this.gridTiles || []) {
        const data = tile.inspectData;
        if (!data) continue;
        const pt = this.getIsoTarget(data.tx, data.ty);
        const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
        if (dist < closestDist && dist < 80) {
          closestDist = dist;
          closest = data;
        }
      }

      if (!closest) return;
      this.events.emit('tile-inspect', {
        type: 'tile-inspect',
        title: closest.leyline ? 'Sonic Leyline' : 'Forest Floor',
        details: [
          closest.leyline
            ? `Resonance: ${closest.leyline.affinity}`
            : 'Mossy sonic earth under the tuning-fork canopy.',
          `Coordinate: (${closest.tx}, ${closest.ty})`,
        ],
        characterLine: 'The forest hums at a frequency the void courtyard never knew.',
        screenX: event.clientX,
        screenY: event.clientY,
      });
    }

    buildArenaBattleSnapshot() {
      return {
        sceneId: POLARIS_SCENE_ID,
        gridSize: this.combatGridSize || POLARIS_GRID_SIZE,
        spawnTile: POLARIS_SPAWN_TILE,
        playerGridPos: this.playerGridPos,
        leylines: this.leylines || [],
        enemies: [],
        encounterId: 'polaris-forest-entry',
        mapHash: `polaris-${this.combatGridSize || POLARIS_GRID_SIZE}`,
      };
    }

    buildSceneTargetRegistry() {
      return {
        sceneId: POLARIS_SCENE_ID,
        mapId: POLARIS_FOREST_MAP_ID,
        worldRegion: POLARIS_WORLD_REGION,
        casterId: 'player',
        tick: 0,
        selectedCombatTargetId: null,
        playerGridPos: this.playerGridPos,
        sentinels: [],
        allSentinelsDefeated: true,
        combatVictoryAchieved: false,
        portalPhase: null,
        targets: [],
      };
    }

    emitSceneContextState() {
      const snapshot = this.buildSceneTargetRegistry();
      const boardState = compileArenaBattleBoard(this.buildArenaBattleSnapshot());
      window.dispatchEvent(new CustomEvent('scene-context-state', {
        detail: {
          ...snapshot,
          battleBoard: boardState,
        },
      }));
      return snapshot;
    }

    shutdown() {
      this.polarisTrees = [];
    }
  };
}