/**
 * Tutorial Forest — Phaser 4 Living Isometric Scene
 *
 * Implements the full isometric runtime:
 * - 2:1 dimetric projection with elevation offsets.
 * - Procedurally synthesized assets generated entirely from SCD128 & SCDL V2.
 * - Reforged handcrafted tile family (13 variants) for maximum cohesion & variance.
 * - Storytelling landmarks: Ancient Dolmen, Hollow Fairy Stump, Fallen Log, Lotus Basin.
 * - Tile Forge procedural biome assets integrated seamlessly with Phaser textures.
 * - WebGL custom shaders & filters:
 *   * Real-time Water Caustic Shader over the sacred lotus spring.
 *   * WebGL Bioluminescent Glow filter blooming on lotus, dolmen runes, and fairy mushrooms.
 *   * WebGL Camera Atmosphere PostFX (ColorMatrix + Vignette) for Day/Twilight/Night grading.
 *   * Foliage canopy wind sway and fluttering.
 * - Interactive player navigation:
 *   * Click-to-move BFS pathfinding with stride animation.
 *   * Smooth camera tracking, drag-panning, and zoom.
 * - Click-to-inspect HUD event bridge emitting full SCD128 dual-witness records.
 */

import {
  buildTutorialForestAssets,
  releaseTutorialForestAssets,
} from '../generators/TutorialForestAssetBridge.js';
import {
  buildTutorialForestWorld,
  findGridPath,
} from '../world/tutorialForestBuilder.js';
import { TILE_W, TILE_H } from '../world/forestBiomeModel.js';
import {
  createWindField,
  sampleWindLean,
  WIND_FIELD_DEFAULTS,
} from '../world/windField.js';
import { createWaterCausticShader } from '../shaders/WaterCausticShader.js';
import { createFoliageWindShader } from '../shaders/FoliageWindShader.js';
import { applyBioluminescentGlow } from '../shaders/BioluminescentGlow.js';
import {
  setupCameraAtmosphere,
  applyCameraLightingMode,
} from '../shaders/AtmospherePostFX.js';

const GROUND_DEPTH = -4096;

// Canopy wind sway, CPU path. Trees pivot about their sprite origin, which both
// spawn paths already anchor at the trunk base (0.5, 0.94 / 0.5, 0.95), so a
// small rotation sweeps the crown while the roots stay planted. Translating X
// instead slid the entire sprite — trunk included — off its planting point.
//
// Lean amplitude and direction live in the shared wind field (world/windField.js),
// not here: one field drives every tree so the forest breathes as a single
// system. The defaults put ~0.9px of travel at the crown and under 0.05px at the
// trunk base, so trunks read as sturdy while foliage drifts subtly.
//
// Pixel art reads badly under continuous sub-pixel rotation, so the angle snaps
// to discrete steps. A quarter degree keeps the subtle sweep from strobing.
const WIND_SWAY_ANGLE_STEP = 0.25;

function quantizeSwayAngle(degrees) {
  return Math.round(degrees / WIND_SWAY_ANGLE_STEP) * WIND_SWAY_ANGLE_STEP;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export default function createTutorialForestScene(phaserRuntime) {
  return class TutorialForestScene extends phaserRuntime.Scene {
    constructor() {
      super({ key: 'TutorialForestScene' });
    }

    init(data = {}) {
      this.forestSeed = data.seed ?? 4242;
      this.onSelectEntity = data.onSelectEntity ?? null;
      this.windEnabled = data.windEnabled ?? true;
      // One shared field drives every tree and every shader: the forest breathes
      // as a single system instead of as independent per-tree oscillators.
      this.windField = createWindField({
        direction: data.windDirection ?? WIND_FIELD_DEFAULTS.direction,
        ...(Number.isFinite(data.windMeanLeanDeg) ? { meanLeanDeg: data.windMeanLeanDeg } : {}),
        ...(Number.isFinite(data.windGustAmplitudeDeg) ? { gustAmplitudeDeg: data.windGustAmplitudeDeg } : {}),
      });
      this.particlesEnabled = data.particlesEnabled ?? true;
      this.shaderCausticsEnabled = data.shaderCausticsEnabled ?? true;
      // GPU canopy flutter is opt-in: the CPU sway below is the proven default.
      this.windShaderEnabled = data.windShaderEnabled ?? false;
      this.glowEnabled = data.glowEnabled ?? true;
      this.lightingMode = data.lightingMode ?? 'day';
    }

    create() {
      try {
        console.log('[TutorialForestScene] Initializing living scene...');

        // 1. Compile gameplay state before asking Tile Forge for visual output.
        this.world = buildTutorialForestWorld(this.forestSeed);
        this.tileW = TILE_W;
        this.tileH = TILE_H;
        this.playerPos = { ...this.world.playerSpawn };
        this.playerFacing = { dx: 1, dy: -1 };

        // 2. Build one continuous ground fabric and depth-sortable Forge actors.
        this.assetManifest = buildTutorialForestAssets(this, this.world, { seed: this.forestSeed });

        // 3. Setup Camera Atmosphere PostFX (WebGL ColorMatrix + Vignette)
        this.atmosphere = setupCameraAtmosphere(this.cameras.main);

        // 4. Render World Elements
      this.renderGroundRegion();
      this.renderLotusPond();
      this.renderEnvironmentActors();
      this.renderPlayer();
      this.computeReflectionPlates();
      this.updateWaterReflection();

      // 5. Living Atmosphere Effects
      this.setupLotusPulse();
      this.setupWindSway();
      this.setupAtmosphericParticles();
      this.setLightingMode(this.lightingMode);

        // 6. Camera & Input
        this.setupCameraControls();
        this.setupInteraction();
        this.setupKeyboardNavigation();

        // Screen resize tracking
        this.scale.on('resize', (gameSize) => {
          if (this.lightingOverlay) {
            this.lightingOverlay.setPosition(gameSize.width / 2, gameSize.height / 2);
            this.lightingOverlay.setSize(gameSize.width * 2, gameSize.height * 2);
          }
        });

        console.log('[TutorialForestScene] Scene ready and living.');
        this.events.emit('scene-ready', {
          title: 'Tutorial Forest',
          seed: this.forestSeed,
        });

        // Auto-select player initially
        if (this.onSelectEntity && this.player) {
          this.onSelectEntity(this.player.inspectData);
        }
      } catch (err) {
        console.error('[TutorialForestScene] create failed:', err);
      }
    }

    // Coordinate projection helpers
    toIso(tx, ty, elevation = 0) {
      return {
        x: (tx - ty) * (this.tileW / 2),
        y: (tx + ty) * (this.tileH / 2) - elevation * 16,
      };
    }

    fromIso(worldX, worldY) {
      const hw = this.tileW / 2;
      const hh = this.tileH / 2;

      // Check elevation tiers from 1 down to -1
      for (const z of [1, 0, -1]) {
        const adjY = worldY + z * 16;
        const tx = Math.round(0.5 * (worldX / hw + adjY / hh));
        const ty = Math.round(0.5 * (adjY / hh - worldX / hw));
        const tile = this.world.tileMap.get(`${tx},${ty}`);
        if (tile && (tile.elevation ?? 0) === z) {
          return { tx, ty, tile };
        }
      }

      // Fallback assuming z = 0
      const fallbackTx = Math.round(0.5 * (worldX / hw + worldY / hh));
      const fallbackTy = Math.round(0.5 * (worldY / hh - worldX / hw));
      const fallbackTile = this.world.tileMap.get(`${fallbackTx},${fallbackTy}`);
      if (fallbackTile) {
        return { tx: fallbackTx, ty: fallbackTy, tile: fallbackTile };
      }
      return null;
    }

    renderGroundRegion() {
      const ground = this.assetManifest.ground;
      this.groundRegionSprite = this.add.image(ground.originX, ground.originY, ground.textureKey);
      this.groundRegionSprite.setOrigin(0, 0);
      this.groundRegionSprite.setDepth(GROUND_DEPTH);
    }

    renderEnvironmentActors() {
      this.environmentSprites = [];
      this.treeSprites = [];
      this.propSprites = [];
      this.lotusSprites = [];

      for (const descriptor of this.assetManifest.actors) {
        const point = this.toIso(descriptor.tx, descriptor.ty, descriptor.elevation ?? 0);
        const px = point.x + (descriptor.offsetX ?? 0);
        const py = point.y + 4 + (descriptor.offsetY ?? 0);
        const sprite = this.add.image(px, py, descriptor.textureKey);
        sprite.setOrigin(descriptor.asset.anchor.x, descriptor.asset.anchor.y);
        sprite.setDepth(py + descriptor.asset.depthBias);
        if (descriptor.interactive !== false) {
          sprite.setInteractive({ useHandCursor: true });
          sprite.inspectData = {
            type: descriptor.semanticType.startsWith('canopy_') || descriptor.semanticType === 'young_sapling'
              ? 'tree'
              : 'landmark',
            name: descriptor.name,
            semanticType: descriptor.semanticType,
            sourceType: descriptor.sourceType,
            tx: descriptor.tx,
            ty: descriptor.ty,
            scd128Record: descriptor.asset.scd128Record,
          description: descriptor.description
              ?? `Tile Forge ${descriptor.semanticType.replace(/_/g, ' ')} in the shared sunlit-glade palette.`,
        };
        if (descriptor.semanticType === 'lotus_cluster') {
          // The pond centerpiece keeps its own inspect identity and SCD128 witness.
          sprite.inspectData = {
            ...sprite.inspectData,
            type: 'lotus_bloom',
            name: 'Sacred Lotus Blossom',
            description: 'A radiant bioluminescent lotus flower growing from the sacred spring. Petals pulse with healing alchemical light enhanced by WebGL glowing emissive filters.',
          };
        }
          sprite.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            this.interactiveClicked = true;
            if (this.onSelectEntity) this.onSelectEntity(sprite.inspectData);
          });
        }

        const isTree = descriptor.semanticType.startsWith('canopy_')
          || descriptor.semanticType === 'young_sapling';
        let actor = sprite;

        if (isTree) {
          // Canopy flutter runs on the GPU only when explicitly enabled on a
          // WebGL renderer; the CPU sway below remains the deterministic default.
          const windShader = this.windShaderEnabled && this.sys?.renderer?.gl
            ? createFoliageWindShader(
              this,
              descriptor.textureKey,
              px,
              py,
              descriptor.asset.width,
              descriptor.asset.height,
              // Tile coords place this tree on the SHARED gust wave. The old
              // per-tree phase here made neighbours lean in opposite directions.
              { tx: descriptor.tx, ty: descriptor.ty },
            )
            : null;
          if (windShader) {
            windShader.setDepth(py + descriptor.asset.depthBias);
            windShader.setInteractive({ useHandCursor: true });
            windShader.inspectData = sprite.inspectData;
            windShader.on('pointerdown', (pointer) => {
              if (pointer.button !== 0) return;
              this.interactiveClicked = true;
              if (this.onSelectEntity) this.onSelectEntity(windShader.inspectData);
            });
            sprite.destroy();
            actor = windShader;
            this.treeSprites.push({
              sprite: windShader,
              originAngle: 0,
              tx: descriptor.tx,
              ty: descriptor.ty,
              shaderDriven: true,
            });
          } else {
            this.treeSprites.push({
              sprite,
              // Sprite origin is descriptor.asset.anchor (0.5, 0.94) — the trunk
              // base — so CPU sway rotates about the roots, not the centroid.
              originAngle: 0,
              // Tile coords feed the SHARED gust wave. No private phase: a tree
              // must not oscillate independently of its neighbours.
              tx: descriptor.tx,
              ty: descriptor.ty,
            });
          }
        } else {
          this.propSprites.push(sprite);
        }
        if (descriptor.semanticType === 'lotus_cluster') this.lotusSprites.push(actor);

        if (this.glowEnabled) {
          if (descriptor.semanticType === 'waymarker' || descriptor.semanticType === 'lotus_cluster') {
            applyBioluminescentGlow(actor, { color: 0x63D2CD, outerStrength: 4, innerStrength: 0.5 });
          } else if (descriptor.semanticType === 'sanctuary_ruin') {
            applyBioluminescentGlow(actor, { color: 0x9B7BC2, outerStrength: 4, innerStrength: 0.5 });
          }
        }

        this.environmentSprites.push(actor);
      }
    }

    renderGroundTiles() {
      this.tileSprites = new Map();

      for (const tile of this.world.tiles) {
        const pt = this.toIso(tile.tx, tile.ty, tile.elevation);
        const depth = pt.y;

        const img = this.add.image(pt.x, pt.y, tile.textureKey);
        img.setOrigin(0.5, 0.5);
        img.setDepth(depth);

        this.tileSprites.set(tile.key, img);
      }
    }

    renderLotusPond() {
      this.waterSprites = [];
      this.waterShaders = [];
      this.lotusSprites = [];
      this.lilypadSprites = [];
      this.lotusGlows = [];

      // One unified caustic field over the whole region, not per-tile boxes: the
      // pattern is continuous in ground pixel space (and flows along the iso
      // plane), while the uploaded water_pond material mask activates it only
      // inside the actual water silhouette, tile by tile.
      const ground = this.assetManifest?.ground;
      if (
        !this.shaderCausticsEnabled
        || !this.sys?.renderer?.gl
        || !ground?.waterMaskKey
      ) return;

      const causticShader = createWaterCausticShader(
        this,
        ground.originX,
        ground.originY,
        ground.width,
        ground.height,
        ground.waterMaskKey,
      );
      if (causticShader) {
        causticShader.setOrigin(0, 0);
        causticShader.setDepth(GROUND_DEPTH + 1);
        this.waterShader = causticShader;
        this.waterShaders.push(causticShader);
      }
    }

    /**
     * Shore "pressure plates": a full perimeter of walkable tiles around the
     * pond. Every edge can activate the mirror; each plate remembers its
     * nearest water tile, which becomes the mirror plane.
     */
    computeReflectionPlates() {
      const plates = new Map();
      const water = new Map();
      for (const tile of this.world.tiles) {
        if (tile.terrain.startsWith('water_')) water.set(`${tile.tx},${tile.ty}`, tile);
      }
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (const tile of this.world.tiles) {
        if (!tile.walkable || tile.terrain.startsWith('water_')) continue;
        let best = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const [dx, dy] of neighbors) {
          const candidate = water.get(`${tile.tx + dx},${tile.ty + dy}`);
          if (!candidate) continue;
          const a = this.toIso(candidate.tx, candidate.ty, 0);
          const b = this.toIso(tile.tx, tile.ty, 0);
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = candidate;
          }
        }
        if (best) plates.set(`${tile.tx},${tile.ty}`, { tx: best.tx, ty: best.ty });
      }
      this.reflectionPlates = plates;
    }

    /**
     * Refresh the mirror-ghost state read by the water field each render.
     *
     * Physics: activation is orientation-agnostic (touching the plate is
     * enough); orientation only chooses WHICH side of the Wanderer the water
     * shows. Gaze toward the water reflects the front, gaze away reflects the
     * back. Water screen-below mirrors top-to-bottom; water screen-above
     * carries the parity upright into the pond.
     */
    updateWaterReflection() {
      const state = {
        enabled: false, x: 0, y: 0, w: 0, h: 0, alpha: 0.26, flip: false, back: false,
      };
      const ground = this.assetManifest?.ground;
      const plate = this.reflectionPlates?.get(`${this.playerPos.tx},${this.playerPos.ty}`);
      if (plate && ground?.waterMaskKey && this.player && this.waterShader) {
        const waterPt = this.toIso(plate.tx, plate.ty, 0);
        const playerPt = this.toIso(this.playerPos.tx, this.playerPos.ty, 0);
        const squash = 0.55;
        const facing = this.playerFacing || { dx: 0, dy: -1 };
        const toWaterX = plate.tx - this.playerPos.tx;
        const toWaterY = plate.ty - this.playerPos.ty;
        const gaze = facing.dx * toWaterX + facing.dy * toWaterY;
        const waterline = (playerPt.y + waterPt.y) / 2;
        const height = this.player.height * squash;

        state.enabled = true;
        state.back = gaze < 0;
        state.flip = waterPt.y > playerPt.y;
        state.x = this.player.x - this.player.width / 2 - ground.originX;
        // The shader's pixel lattice counts upward (GL convention) while world
        // coordinates count downward from the map top: convert the rect.
        const yTop = (state.flip ? waterline : waterline - height) - ground.originY;
        state.y = ground.height - yTop - height;
        state.w = this.player.width;
        state.h = height;
      }
      this.waterReflection = state;
      this.syncWaterReflectionTexture();
    }

    /** Bind the water field's ghost sampler to the mirrored parity frame. */
    syncWaterReflectionTexture() {
      const ground = this.assetManifest?.ground;
      if (!this.waterShader || !ground?.waterMaskKey) return;
      const frameKey = this.waterReflection?.back
        ? 'player_back_0'
        : (this.player?.texture?.key || 'player_idle_0');
      this.waterShader.setTextures([ground.waterMaskKey, frameKey]);
    }

    renderTrees() {
      this.treeSprites = [];

      for (const t of this.world.trees) {
        const pt = this.toIso(t.tx, t.ty, t.elevation || 0);
        const treeImg = this.add.image(pt.x, pt.y + 4, t.textureKey);
        treeImg.setOrigin(0.5, 0.95);
        treeImg.setDepth(pt.y + 8);
        treeImg.setInteractive({ useHandCursor: true });

        treeImg.inspectData = {
          type: 'tree',
          name: t.speciesKey.toUpperCase().replace(/_/g, ' '),
          speciesKey: t.speciesKey,
          tx: t.tx,
          ty: t.ty,
          scd128Record: t.scd128Record,
          description: `Living botanical specimen of ${t.speciesKey.replace(/_/g, ' ')}. Synthesized from discrete 1x pixel-art cells with spherical normal canopy lobes.`,
        };

        treeImg.on('pointerdown', (pointer) => {
          if (pointer.button === 0) {
            this.interactiveClicked = true;
            if (this.onSelectEntity) {
              this.onSelectEntity(treeImg.inspectData);
            }
          }
        });

        this.treeSprites.push({
          sprite: treeImg,
          originAngle: 0,
          tx: t.tx,
          ty: t.ty,
        });
      }
    }

    renderProps() {
      this.propSprites = [];

      for (const p of this.world.props) {
        const tile = this.world.tileMap.get(`${p.tx},${p.ty}`);
        const pt = this.toIso(p.tx, p.ty, p.elevation || tile?.elevation || 0);

        const propImg = this.add.image(pt.x, pt.y + 4, p.textureKey);
        propImg.setOrigin(0.5, 0.9);
        propImg.setDepth(pt.y + 10);
        propImg.setInteractive({ useHandCursor: true });

        propImg.inspectData = {
          type: 'landmark',
          name: p.name || p.type.toUpperCase().replace(/_/g, ' '),
          tx: p.tx,
          ty: p.ty,
          scd128Record: p.scd128Record,
          description: p.description || 'Procedural environmental landmark synthesized with SCD128 dual-witness records.',
        };

        propImg.on('pointerdown', (pointer) => {
          if (pointer.button === 0) {
            this.interactiveClicked = true;
            if (this.onSelectEntity) {
              this.onSelectEntity(propImg.inspectData);
            }
          }
        });

        // Specialized WebGL glows on magical storytelling landmarks
        if (this.glowEnabled) {
          if (p.type === 'ancient_waymarker') {
            applyBioluminescentGlow(propImg, { color: 0x34d399, outerStrength: 8, innerStrength: 1 });
            const beacon = this.add.circle(pt.x, pt.y - 36, 12, 0x6ee7b7, 0.25);
            beacon.setDepth(pt.y + 11);
            this.propSprites.push(beacon);
            this.tweens.add({
              targets: beacon,
              scale: 1.5,
              alpha: 0.6,
              duration: 1200,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          } else if (p.type === 'ancient_moss_dolmen') {
            applyBioluminescentGlow(propImg, { color: 0x38bdf8, outerStrength: 7, innerStrength: 0.5 });
          } else if (p.type === 'hollow_fairy_stump') {
            applyBioluminescentGlow(propImg, { color: 0x67e8f9, outerStrength: 6, innerStrength: 0.8 });
          } else if (p.type === 'tileforge_crystal_tree') {
            applyBioluminescentGlow(propImg, { color: 0xc084fc, outerStrength: 8, innerStrength: 1 });
          } else if (p.type === 'lotus_stone_basin') {
            applyBioluminescentGlow(propImg, { color: 0x22d3ee, outerStrength: 5, innerStrength: 0.5 });
          }
        }

        this.propSprites.push(propImg);
      }
    }

    renderPlayer() {
      const pt = this.toIso(this.playerPos.tx, this.playerPos.ty, 0);

      this.player = this.add.sprite(pt.x, pt.y + 4, 'player_idle_0');
      this.player.setOrigin(0.5, 0.95);
      this.player.setDepth(pt.y + 12);
      this.playerDirection = 'south';
      this.setPlayerFacing('south', false);
      this.player.setInteractive({ useHandCursor: true });

      this.player.inspectData = {
        type: 'character',
        name: 'Lotus Wanderer',
        assetClass: 'scdl_v2_character',
        scdlAssetId: 'lotus_wanderer',
        coordinates: this.playerPos,
        description: 'Original player character authored completely in SCDL V2. Proportional 4-head RPG canon with indigo robe, gnarled staff, and glowing lotus core.',
      };

      this.player.on('pointerdown', (pointer) => {
        if (pointer.button === 0) {
          this.interactiveClicked = true;
          if (this.onSelectEntity) {
            this.onSelectEntity(this.player.inspectData);
          }
        }
      });

      // Keep the mirror ghost sampling the player's current animation frame
      // (or the back-view frame when their gaze turns away from the water).
      this.player.on('animationupdate', (_anim, frame) => {
        if (!frame?.texture?.key || this.waterReflection?.back) return;
        this.syncWaterReflectionTexture();
      });
    }

    /**
     * Controlled lotus pulse: a slow breathing scale/alpha on the pond
     * centerpiece actors (the caustic shader carries the water motion).
     */
    setupLotusPulse() {
      if (!this.lotusSprites?.length) return;
      this.tweens.add({
        targets: this.lotusSprites,
        scaleX: 1.06,
        scaleY: 1.06,
        alpha: 0.92,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    setupWindSway() {
      this.events.on('update', (time) => {
        // The mirror tracks the Wanderer's tweened pixel position every frame.
        if (this.waterReflection?.enabled && this.player) {
          const ground = this.assetManifest?.ground;
          if (ground) {
            this.waterReflection.x = this.player.x - this.player.width / 2 - ground.originX;
          }
        }
        if (!this.windEnabled || !this.treeSprites) return;
        const field = this.windField;
        for (let i = 0; i < this.treeSprites.length; i += 1) {
          const item = this.treeSprites[i];
          // Shader-driven canopies flutter on the GPU; skip CPU sway for them.
          if (item?.shaderDriven) continue;
          if (item?.sprite?.active) {
            // Rotate about the trunk-base origin so the roots stay planted and
            // only the crown sweeps. Never translate: that moved the trunk too.
            //
            // Every tree samples the SAME field at the SAME instant, so the whole
            // forest leans one way together. Tile coords only place the tree on
            // the traveling gust wave; they are not a private oscillator phase.
            const base = item.originAngle ?? 0;
            const lean = sampleWindLean(field, time, item.tx, item.ty);
            item.sprite.setAngle(base + quantizeSwayAngle(lean));
          }
        }
      });
    }

    /**
     * Turn the wind. Every tree and shader follows immediately and uniformly:
     * a west wind leans every crown left, an east wind leans every crown right.
     */
    setWindDirection(direction) {
      this.windField = createWindField({
        ...(this.windField || {}),
        direction,
      });
      if (!this.windEnabled && this.treeSprites) {
        for (const item of this.treeSprites) {
          if (item?.shaderDriven) continue;
          if (item?.sprite?.active) item.sprite.setAngle(item.originAngle ?? 0);
        }
      }
      return this.windField;
    }

    setWindEnabled(enabled) {
      this.windEnabled = Boolean(enabled);
      // Shader canopies read windEnabled live in their setupUniforms callback.
      if (!this.windEnabled && this.treeSprites) {
        for (const item of this.treeSprites) {
          if (item?.shaderDriven) continue;
          if (item?.sprite?.active) {
            item.sprite.setAngle(item.originAngle ?? 0);
          }
        }
      }
    }

    setShaderCausticsEnabled(enabled) {
      this.shaderCausticsEnabled = Boolean(enabled);
      if (this.waterShaders) {
        for (const s of this.waterShaders) {
          if (s?.active) s.setVisible(this.shaderCausticsEnabled);
        }
      }
    }

    setGlowEnabled(enabled) {
      this.glowEnabled = Boolean(enabled);
      if (this.lotusGlows) {
        for (const g of this.lotusGlows) {
          if (g?.active) g.setVisible(this.glowEnabled);
        }
      }
    }

    setupAtmosphericParticles() {
      this.particles = [];
      const particleCount = 40;
      const random = createSeededRandom((this.forestSeed ^ 0xA7F05EED) >>> 0);

      for (let i = 0; i < particleCount; i += 1) {
        const px = (random() - 0.5) * (this.world.gridSize * this.tileW);
        const py = random() * (this.world.gridSize * this.tileH * 0.6);
        const isFirefly = random() > 0.6;

        const color = isFirefly ? 0x6ee7b7 : 0xfde047;
        const radius = isFirefly ? 1.5 : 1;
        const dot = this.add.circle(px, py, radius, color, isFirefly ? 0.75 : 0.4);
        dot.setDepth(py + 40);
        dot.setVisible(this.particlesEnabled);

        this.particles.push({
          dot,
          baseX: px,
          baseY: py,
          phase: random() * Math.PI * 2,
          speedY: 0.15 + random() * 0.25,
          speedX: 0.3 + random() * 0.4,
          resetOffset: (random() - 0.5) * 100,
        });
      }

      this.events.on('update', (time) => {
        if (!this.particlesEnabled || !this.particles) return;
        const t = time * 0.001;
        for (const p of this.particles) {
          if (!p.dot || !p.dot.active) continue;
          p.dot.y -= p.speedY;
          p.dot.x += Math.sin(t + p.phase) * p.speedX;

          if (p.dot.y < -100) {
            p.dot.y = this.world.gridSize * this.tileH * 0.5 + 50;
            p.dot.x = p.baseX + p.resetOffset;
          }
        }
      });
    }

    setParticlesEnabled(enabled) {
      this.particlesEnabled = Boolean(enabled);
      if (this.particles) {
        for (const p of this.particles) {
          if (p?.dot?.active) {
            p.dot.setVisible(this.particlesEnabled);
          }
        }
      }
    }

    setLightingMode(mode) {
      this.lightingMode = mode;

      // 1. WebGL Camera Atmosphere Filter grading
      if (this.atmosphere) {
        applyCameraLightingMode(this.atmosphere, mode);
      }

      // 2. Fallback vignette / tint overlay
      if (this.lightingOverlay) {
        this.lightingOverlay.destroy();
        this.lightingOverlay = null;
      }

      let color = 0x000000;
      let alpha = 0.0;

      if (mode === 'twilight') {
        color = 0x3b184f;
        alpha = 0.25;
      } else if (mode === 'night') {
        color = 0x05081c;
        alpha = 0.55;
      }

      if (alpha > 0) {
        const width = this.scale.width || 1920;
        const height = this.scale.height || 1080;
        this.lightingOverlay = this.add.rectangle(
          0,
          0,
          Math.max(width, 3000) * 2,
          Math.max(height, 3000) * 2,
          color,
          alpha
        );
        this.lightingOverlay.setOrigin(0.5, 0.5);
        this.lightingOverlay.setPosition(width / 2, height / 2);
        this.lightingOverlay.setScrollFactor(0);
        this.lightingOverlay.setDepth(999999);
      }
    }

    applyLightingMode(mode) {
      this.setLightingMode(mode);
    }

    clearWorld() {
      if (this.groundRegionSprite) {
        this.groundRegionSprite.destroy();
        this.groundRegionSprite = null;
      }
      if (this.environmentSprites) {
        for (const sprite of this.environmentSprites) sprite.destroy();
        this.environmentSprites = [];
        this.treeSprites = [];
        this.propSprites = [];
        this.lotusSprites = [];
      }
      if (this.tileSprites) {
        for (const sprite of this.tileSprites.values()) sprite.destroy();
        this.tileSprites.clear();
      }
      if (this.waterSprites) {
        for (const sprite of this.waterSprites) sprite.destroy();
        this.waterSprites = [];
      }
      if (this.waterShaders) {
        for (const shader of this.waterShaders) shader.destroy();
        this.waterShaders = [];
      }
      if (this.lotusSprites) {
        for (const sprite of this.lotusSprites) sprite.destroy();
        this.lotusSprites = [];
      }
      if (this.lilypadSprites) {
        for (const sprite of this.lilypadSprites) sprite.destroy();
        this.lilypadSprites = [];
      }
      if (this.lotusGlows) {
        for (const glow of this.lotusGlows) glow.destroy();
        this.lotusGlows = [];
      }
      if (this.treeSprites) {
        for (const item of this.treeSprites) {
          if (item?.sprite) item.sprite.destroy();
        }
        this.treeSprites = [];
      }
      if (this.propSprites) {
        for (const sprite of this.propSprites) sprite.destroy();
        this.propSprites = [];
      }
      if (this.player) {
        this.player.destroy();
        this.player = null;
      }
      if (this.particles) {
        for (const p of this.particles) {
          if (p?.dot) p.dot.destroy();
        }
        this.particles = [];
      }
    }

    reseed(newSeed) {
      this.forestSeed = newSeed;
      this.clearWorld();
      releaseTutorialForestAssets(this, this.assetManifest);

      this.world = buildTutorialForestWorld(this.forestSeed);
      this.playerPos = { ...this.world.playerSpawn };
        this.playerFacing = { dx: 1, dy: -1 };
      this.assetManifest = buildTutorialForestAssets(this, this.world, { seed: this.forestSeed });

      this.renderGroundRegion();
      this.renderLotusPond();
      this.renderEnvironmentActors();
      this.renderPlayer();
      this.computeReflectionPlates();
      this.updateWaterReflection();
      this.setupAtmosphericParticles();
      this.setLightingMode(this.lightingMode);

      const spawnPt = this.toIso(this.playerPos.tx, this.playerPos.ty, 0);
      this.cameras.main.centerOn(spawnPt.x, spawnPt.y);

      if (this.onSelectEntity && this.player) {
        this.onSelectEntity(this.player.inspectData);
      }
    }

    setupCameraControls() {
      const camera = this.cameras.main;
      camera.setZoom(2);
      if (camera.setRoundPixels) camera.setRoundPixels(true);

      const spawnPt = this.toIso(this.playerPos.tx, this.playerPos.ty, 0);
      camera.centerOn(spawnPt.x, spawnPt.y);

      let pointerDownX = 0;
      let pointerDownY = 0;
      let isDragging = false;

      this.input.on('pointerdown', (pointer) => {
        if (pointer.button === 0) {
          pointerDownX = pointer.x;
          pointerDownY = pointer.y;
          isDragging = false;
        }
      });

      this.input.on('pointermove', (pointer) => {
        if (pointer.isDown && pointer.button === 0) {
          const dist = Math.hypot(pointer.x - pointerDownX, pointer.y - pointerDownY);
          if (dist > 6) {
            isDragging = true;
            camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
            camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
          }
        }
      });

      this.input.on('pointerup', (pointer) => {
        if (pointer.button === 0) {
          if (isDragging) {
            isDragging = false;
            return;
          }
          if (this.interactiveClicked) {
            this.interactiveClicked = false;
            return;
          }
          const match = this.fromIso(pointer.worldX, pointer.worldY);
          if (match) {
            this.handleTileClick(match.tx, match.ty);
          }
        }
      });

      // Mouse wheel zoom
      this.input.on('wheel', (_pointer, _gameObjects, _deltaX, deltaY) => {
        const newZoom = Math.max(0.75, Math.min(2.0, camera.zoom - deltaY * 0.001));
        camera.setZoom(newZoom);
      });
    }

    setupInteraction() {
      this.isWalking = false;
      this.interactiveClicked = false;
    }

    handleTileClick(tx, ty) {
      const tile = this.world.tileMap.get(`${tx},${ty}`);
      if (!tile) return;

      if (this.onSelectEntity) {
        this.onSelectEntity({
          type: 'tile',
          name: `${tile.terrain.toUpperCase().replace(/_/g, ' ')} TILE`,
          tx,
          ty,
          zone: tile.zone,
          terrain: tile.terrain,
          elevation: tile.elevation,
          walkable: tile.walkable,
          scd128Record: tile.scd128Record,
          description: `Isometric terrain cell at (${tx}, ${ty}) in ${tile.zone.replace(/_/g, ' ')}. Elevation tier ${tile.elevation}. ${tile.walkable ? 'Traversable.' : 'Impassable terrain.'}`,
        });
      }

      if (!tile.walkable) return;

      const targetPt = this.toIso(tx, ty, tile.elevation || 0);
      this.startFreeRoamNavigation(targetPt.x, targetPt.y + 4, { tx, ty });
    }

    resolveFacingDirection(dScreenX, dScreenY) {
      if (Math.abs(dScreenY) >= Math.abs(dScreenX) * 0.7) {
        return dScreenY < 0 ? 'north' : 'south';
      }
      return dScreenX > 0 ? 'east' : 'west';
    }

    setPlayerFacing(direction, isMoving = false) {
      this.playerDirection = direction;
      if (!this.playerFacing || (this.playerFacing.dx === 0 && this.playerFacing.dy === 0)) {
        if (direction === 'south') this.playerFacing = { dx: 0, dy: 1 };
        else if (direction === 'north') this.playerFacing = { dx: 0, dy: -1 };
        else if (direction === 'east') this.playerFacing = { dx: 1, dy: -1 };
        else if (direction === 'west') this.playerFacing = { dx: -1, dy: 1 };
      }
      if (!this.player) return;

      const animKey = isMoving ? `player_walk_${direction}` : `player_idle_${direction}`;
      const fallbackAnim = isMoving ? 'player_walk' : 'player_idle';

      if (this.anims?.exists(animKey)) {
        if (this.player.anims?.currentAnim?.key !== animKey) {
          this.player.play(animKey);
        }
      } else if (this.anims?.exists(fallbackAnim)) {
        if (this.player.anims?.currentAnim?.key !== fallbackAnim) {
          this.player.play(fallbackAnim);
        }
      } else {
        const textureKey = direction === 'north' ? 'player_back_0' : (direction === 'east' ? 'player_east_0' : (direction === 'west' ? 'player_west_0' : 'player_idle_0'));
        if (this.textures?.exists(textureKey)) {
          this.player.setTexture(textureKey);
        }
      }
      this.updateWaterReflection();
    }

    isPositionWalkable(x, y) {
      if (!this.world?.tileMap) return true;
      const cell = this.fromIso(x, y - 4) || this.fromIso(x, y);
      return Boolean(cell?.tile?.walkable);
    }

    hasLineOfSight(x1, y1, x2, y2) {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (dist < 6) return true;
      const steps = Math.max(2, Math.ceil(dist / 12));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const sx = x1 + (x2 - x1) * t;
        const sy = y1 + (y2 - y1) * t;
        if (!this.isPositionWalkable(sx, sy)) return false;
      }
      return true;
    }

    stringPullWaypoints(startX, startY, points) {
      if (!points || points.length <= 1) return points ? [...points] : [];
      const waypoints = [];
      let currentX = startX;
      let currentY = startY;
      let i = 0;

      while (i < points.length) {
        let furthest = i;
        for (let j = points.length - 1; j >= i; j--) {
          if (this.hasLineOfSight(currentX, currentY, points[j].x, points[j].y)) {
            furthest = j;
            break;
          }
        }
        waypoints.push(points[furthest]);
        currentX = points[furthest].x;
        currentY = points[furthest].y;
        i = furthest + 1;
      }
      return waypoints;
    }

    startFreeRoamNavigation(targetX, targetY, targetTile = null) {
      if (!this.player) return;

      // 1. If direct line of sight is unobstructed, navigate in a single straight vector
      if (this.hasLineOfSight(this.player.x, this.player.y, targetX, targetY)) {
        this.navWaypoints = [{ x: targetX, y: targetY }];
        this.isWalking = true;
        return;
      }

      // 2. Obstacle in direct line: pathfind around obstacle and string-pull waypoints to eliminate zig-zags
      const startCell = this.fromIso(this.player.x, this.player.y - 4) || { tx: this.playerPos.tx, ty: this.playerPos.ty };
      const goalCell = targetTile || this.fromIso(targetX, targetY - 4);
      if (!goalCell) {
        this.navWaypoints = [{ x: targetX, y: targetY }];
        this.isWalking = true;
        return;
      }

      const gridPath = findGridPath(startCell, goalCell, this.world.tileMap);
      if (!gridPath || gridPath.length === 0) {
        // Fallback to direct navigation
        this.navWaypoints = [{ x: targetX, y: targetY }];
        this.isWalking = true;
        return;
      }

      const rawPoints = gridPath.map((t) => {
        const tile = this.world.tileMap.get(`${t.tx},${t.ty}`);
        const pt = this.toIso(t.tx, t.ty, tile?.elevation || 0);
        return { x: pt.x, y: pt.y + 4 };
      });

      this.navWaypoints = this.stringPullWaypoints(this.player.x, this.player.y, rawPoints);
      this.isWalking = true;
    }

    walkPath(path, explicitFacing = null) {
      if (!path || !path.length) return;
      if (explicitFacing) this.playerDirection = explicitFacing;

      // Convert grid path to screen-space waypoints and string-pull
      const startX = this.player ? this.player.x : 0;
      const startY = this.player ? this.player.y : 0;
      const rawPoints = path.map((t) => {
        const tile = this.world?.tileMap?.get(`${t.tx},${t.ty}`);
        const pt = this.toIso(t.tx, t.ty, tile?.elevation || 0);
        return { x: pt.x, y: pt.y + 4 };
      });

      this.navWaypoints = this.stringPullWaypoints(startX, startY, rawPoints);
      this.isWalking = true;

      // Headless / stub fallback if tweens exist but update loop isn't ticking
      if (this.tweens?.add && (!this.events?.on || !this.player)) {
        let step = 0;
        const stepNext = () => {
          if (step >= path.length) {
            this.isWalking = false;
            this.setPlayerFacing(this.playerDirection || 'south', false);
            return;
          }
          const next = path[step];
          const prev = this.playerPos;
          step += 1;
          this.playerPos = { tx: next.tx, ty: next.ty };
          const dtx = next.tx - prev.tx;
          const dty = next.ty - prev.ty;
          const dScreenX = (dtx - dty) * (this.tileW / 2);
          const dScreenY = (dtx + dty) * (this.tileH / 2);
          const dir = explicitFacing || this.resolveFacingDirection(dScreenX, dScreenY);
          this.setPlayerFacing(dir, true);

          const targetTile = this.world?.tileMap?.get(`${next.tx},${next.ty}`);
          const pt = this.toIso(next.tx, next.ty, targetTile?.elevation || 0);
          if (this.player) {
            this.tweens.add({
              targets: this.player,
              x: pt.x,
              y: pt.y + 4,
              duration: 200,
              ease: 'Linear',
              onComplete: stepNext,
            });
          }
        };
        stepNext();
      }
    }

    setupKeyboardNavigation() {
      if (!this.input?.keyboard) return;

      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasdKeys = this.input.keyboard.addKeys({
        W: phaserRuntime.Input?.Keyboard?.KeyCodes?.W ?? 'W',
        A: phaserRuntime.Input?.Keyboard?.KeyCodes?.A ?? 'A',
        S: phaserRuntime.Input?.Keyboard?.KeyCodes?.S ?? 'S',
        D: phaserRuntime.Input?.Keyboard?.KeyCodes?.D ?? 'D',
      });

      this.events.on('update', (_time, delta) => {
        this.updateLocomotion(delta);
      });
    }

    updateLocomotion(delta) {
      if (!this.player) return;

      const dt = (typeof delta === 'number' && delta > 0 ? Math.min(delta, 50) : 16.667) / 1000;
      const walkSpeed = 180; // pixels per second for grounded 8-frame human gait

      // 1. Real-time Free-Roam Keyboard Movement (WASD / Arrows)
      let inputX = 0;
      let inputY = 0;

      if (this.wasdKeys?.W?.isDown || this.cursors?.up?.isDown) inputY -= 1;
      if (this.wasdKeys?.S?.isDown || this.cursors?.down?.isDown) inputY += 1;
      if (this.wasdKeys?.A?.isDown || this.cursors?.left?.isDown) inputX -= 1;
      if (this.wasdKeys?.D?.isDown || this.cursors?.right?.isDown) inputX += 1;

      if (inputX !== 0 || inputY !== 0) {
        // Keyboard takes immediate direct control: cancel any click navigation
        this.navWaypoints = null;

        const len = Math.hypot(inputX, inputY);
        const normX = inputX / len;
        const normY = inputY / len;
        const moveDist = walkSpeed * dt;
        const vx = normX * moveDist;
        const vy = normY * moveDist;

        // Facing direction directly from input vector:
        // Pure W -> North; Pure S -> South; Pure D -> East; Pure A -> West
        const dir = this.resolveFacingDirection(inputX, inputY);
        this.setPlayerFacing(dir, true);

        // Continuous collision & obstacle sliding
        const newX = this.player.x + vx;
        const newY = this.player.y + vy;

        if (this.isPositionWalkable(newX, newY)) {
          this.player.x = newX;
          this.player.y = newY;
        } else if (vx !== 0 && this.isPositionWalkable(newX, this.player.y)) {
          this.player.x = newX;
        } else if (vy !== 0 && this.isPositionWalkable(this.player.x, newY)) {
          this.player.y = newY;
        }

        this.player.setDepth(this.player.y + 8);
        const currentCell = this.fromIso(this.player.x, this.player.y - 4) || this.fromIso(this.player.x, this.player.y);
        if (currentCell) {
          this.playerPos = { tx: currentCell.tx, ty: currentCell.ty };
        }
        this.updateWaterReflection();
        this.isWalking = true;
        return;
      }

      // 2. Click-to-Move Free-Roam Waypoint Navigation
      if (this.navWaypoints && this.navWaypoints.length > 0) {
        const target = this.navWaypoints[0];
        const dx = target.x - this.player.x;
        const dy = target.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        const stepDist = walkSpeed * dt;

        if (dist <= stepDist + 2.0) {
          // Reached this waypoint
          this.player.x = target.x;
          this.player.y = target.y;
          this.navWaypoints.shift();

          if (this.navWaypoints.length === 0) {
            this.navWaypoints = null;
            this.isWalking = false;
            this.setPlayerFacing(this.playerDirection || 'south', false);
          }
        } else {
          const vx = (dx / dist) * stepDist;
          const vy = (dy / dist) * stepDist;

          const dir = this.resolveFacingDirection(dx, dy);
          this.setPlayerFacing(dir, true);

          this.player.x += vx;
          this.player.y += vy;
        }

        this.player.setDepth(this.player.y + 8);
        const currentCell = this.fromIso(this.player.x, this.player.y - 4) || this.fromIso(this.player.x, this.player.y);
        if (currentCell) {
          this.playerPos = { tx: currentCell.tx, ty: currentCell.ty };
        }
        this.updateWaterReflection();
        this.isWalking = true;
        return;
      }

      // 3. No active movement: smoothly settle into idle
      if (this.isWalking) {
        this.isWalking = false;
        this.setPlayerFacing(this.playerDirection || 'south', false);
      }
    }

    getKeyboardMovementRequest() {
      if (!this.wasdKeys && !this.cursors) return null;

      let inputX = 0;
      let inputY = 0;

      if (this.wasdKeys?.W?.isDown || this.cursors?.up?.isDown) inputY -= 1;
      if (this.wasdKeys?.S?.isDown || this.cursors?.down?.isDown) inputY += 1;
      if (this.wasdKeys?.A?.isDown || this.cursors?.left?.isDown) inputX -= 1;
      if (this.wasdKeys?.D?.isDown || this.cursors?.right?.isDown) inputX += 1;

      if (inputX === 0 && inputY === 0) return null;

      let dtx = 0;
      let dty = 0;
      let dir = this.playerDirection || 'south';

      if (inputX === 0 && inputY < 0) {
        dtx = -1; dty = -1; dir = 'north';
      } else if (inputX === 0 && inputY > 0) {
        dtx = 1; dty = 1; dir = 'south';
      } else if (inputX < 0 && inputY === 0) {
        dtx = -1; dty = 1; dir = 'west';
      } else if (inputX > 0 && inputY === 0) {
        dtx = 1; dty = -1; dir = 'east';
      } else if (inputX > 0 && inputY < 0) {
        dtx = 0; dty = -1; dir = 'east';
      } else if (inputX < 0 && inputY < 0) {
        dtx = -1; dty = 0; dir = 'west';
      } else if (inputX > 0 && inputY > 0) {
        dtx = 1; dty = 0; dir = 'east';
      } else if (inputX < 0 && inputY > 0) {
        dtx = 0; dty = 1; dir = 'west';
      }

      return { dtx, dty, dir, inputX, inputY };
    }

    resolveKeyboardPath(req) {
      if (!req) return null;

      const targetTx = this.playerPos.tx + req.dtx;
      const targetTy = this.playerPos.ty + req.dty;

      const path = findGridPath(this.playerPos, { tx: targetTx, ty: targetTy }, this.world.tileMap);
      if (path && path.length > 0) return path;

      if (req.dtx !== 0 && req.dty !== 0) {
        const tryA = { tx: this.playerPos.tx + req.dtx, ty: this.playerPos.ty };
        const pathA = findGridPath(this.playerPos, tryA, this.world.tileMap);
        if (pathA && pathA.length > 0) return pathA;

        const tryB = { tx: this.playerPos.tx, ty: this.playerPos.ty + req.dty };
        const pathB = findGridPath(this.playerPos, tryB, this.world.tileMap);
        if (pathB && pathB.length > 0) return pathB;
      }

      return null;
    }

    handleKeyboardMovement(time, delta) {
      this.updateLocomotion(delta);
    }
  };
}
