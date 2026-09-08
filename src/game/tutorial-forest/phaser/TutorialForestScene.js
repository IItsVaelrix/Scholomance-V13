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
import { createWaterCausticShader } from '../shaders/WaterCausticShader.js';
import { applyBioluminescentGlow } from '../shaders/BioluminescentGlow.js';
import {
  setupCameraAtmosphere,
  applyCameraLightingMode,
} from '../shaders/AtmospherePostFX.js';

const GROUND_DEPTH = -4096;

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
      this.particlesEnabled = data.particlesEnabled ?? true;
      this.shaderCausticsEnabled = data.shaderCausticsEnabled ?? true;
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

        // 2. Build one continuous ground fabric and depth-sortable Forge actors.
        this.assetManifest = buildTutorialForestAssets(this, this.world, { seed: this.forestSeed });

        // 3. Setup Camera Atmosphere PostFX (WebGL ColorMatrix + Vignette)
        this.atmosphere = setupCameraAtmosphere(this.cameras.main);

        // 4. Render World Elements
        this.renderGroundRegion();
        this.renderEnvironmentActors();
        this.renderPlayer();

        // 5. Living Atmosphere Effects
        this.setupWindSway();
        this.setupAtmosphericParticles();
        this.setLightingMode(this.lightingMode);

        // 6. Camera & Input
        this.setupCameraControls();
        this.setupInteraction();

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
        const sprite = this.add.image(point.x, point.y + 4, descriptor.textureKey);
        sprite.setOrigin(descriptor.asset.anchor.x, descriptor.asset.anchor.y);
        sprite.setDepth(point.y + descriptor.asset.depthBias);
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
        sprite.on('pointerdown', (pointer) => {
          if (pointer.button !== 0) return;
          this.interactiveClicked = true;
          if (this.onSelectEntity) this.onSelectEntity(sprite.inspectData);
        });

        const isTree = descriptor.semanticType.startsWith('canopy_')
          || descriptor.semanticType === 'young_sapling';
        if (isTree) {
          this.treeSprites.push({
            sprite,
            baseX: point.x,
            phase: (descriptor.tx * 0.4 + descriptor.ty * 0.7) % (Math.PI * 2),
          });
        } else {
          this.propSprites.push(sprite);
        }
        if (descriptor.semanticType === 'lotus_cluster') this.lotusSprites.push(sprite);

        if (this.glowEnabled) {
          if (descriptor.semanticType === 'waymarker' || descriptor.semanticType === 'lotus_cluster') {
            applyBioluminescentGlow(sprite, { color: 0x63D2CD, outerStrength: 4, innerStrength: 0.5 });
          } else if (descriptor.semanticType === 'sanctuary_ruin') {
            applyBioluminescentGlow(sprite, { color: 0x9B7BC2, outerStrength: 4, innerStrength: 0.5 });
          }
        }

        this.environmentSprites.push(sprite);
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

      for (const w of this.world.waterTiles) {
        const pt = this.toIso(w.tx, w.ty, 0);
        const depth = pt.y + 1;

        // Base water tile image (deep spring or shore transition)
        const waterImg = this.add.image(pt.x, pt.y, w.terrain || 'water_deep_spring');
        waterImg.setOrigin(0.5, 0.5);
        waterImg.setDepth(depth);
        this.waterSprites.push(waterImg);

        // WebGL Real-Time Water Caustic Shader overlay for deep water
        if (this.shaderCausticsEnabled && w.terrain === 'water_deep_spring') {
          const causticShader = createWaterCausticShader(this, pt.x, pt.y, 80, 40);
          if (causticShader) {
            causticShader.setDepth(depth + 0.5);
            this.waterShaders.push(causticShader);
          }
        }

        // Floating lilypads
        if (w.hasLilypad) {
          const pad = this.add.image(pt.x, pt.y, 'forest_lilypad');
          pad.setOrigin(0.5, 0.5);
          pad.setDepth(depth + 1);
          this.lilypadSprites.push(pad);
        }

        // Blooming Sacred Lotus Flower
        if (w.hasLotus) {
          const pad = this.add.image(pt.x, pt.y, 'forest_lilypad');
          pad.setOrigin(0.5, 0.5);
          pad.setDepth(depth + 1);
          this.lilypadSprites.push(pad);

          const lotus = this.add.image(pt.x, pt.y - 2, 'forest_lotus_bloom_f0');
          lotus.setOrigin(0.5, 0.6);
          lotus.setDepth(depth + 3);
          lotus.setInteractive({ useHandCursor: true });

          lotus.inspectData = {
            type: 'lotus_bloom',
            name: 'Sacred Lotus Blossom',
            tx: w.tx,
            ty: w.ty,
            scd128Record: this.world.tileMap.get(`${w.tx},${w.ty}`)?.scd128Record,
            description: 'A radiant bioluminescent lotus flower growing from the sacred spring. Petals pulse with healing alchemical light enhanced by WebGL glowing emissive filters.',
          };

          lotus.on('pointerdown', (pointer) => {
            if (pointer.button === 0) {
              this.interactiveClicked = true;
              if (this.onSelectEntity) {
                this.onSelectEntity(lotus.inspectData);
              }
            }
          });

          // Apply WebGL Bioluminescent Glow filter
          if (this.glowEnabled) {
            applyBioluminescentGlow(lotus, { color: 0x10b981, outerStrength: 6, innerStrength: 1 });
          }

          this.lotusSprites.push(lotus);

          // Atmospheric radial light aura
          const glow = this.add.circle(pt.x, pt.y - 2, 20, 0x10b981, 0.2);
          glow.setDepth(depth + 2);
          this.lotusGlows.push(glow);

          this.tweens.add({
            targets: glow,
            alpha: 0.45,
            scale: 1.25,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
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
          phase: (t.tx * 0.4 + t.ty * 0.7) % (Math.PI * 2),
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
      this.player.play('player_idle');
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
    }

    setupWaterAnimation() {
      let currentFrame = 0;
      this.time.addEvent({
        delay: 240,
        loop: true,
        callback: () => {
          currentFrame = (currentFrame + 1) % 4;
          const key = `forest_water_f${currentFrame}`;
          for (const s of this.waterSprites) {
            if (s?.active && s.texture?.key?.startsWith('forest_water_')) {
              s.setTexture(key);
            }
          }
        },
      });
    }

    setupLotusPulse() {
      let lotusFrame = 0;
      this.time.addEvent({
        delay: 800,
        loop: true,
        callback: () => {
          lotusFrame = (lotusFrame + 1) % 2;
          const key = `forest_lotus_bloom_f${lotusFrame}`;
          for (const s of this.lotusSprites) {
            if (s?.active) s.setTexture(key);
          }
        },
      });
    }

    setupWindSway() {
      this.events.on('update', (time) => {
        if (!this.windEnabled || !this.treeSprites) return;
        const t = time * 0.002;
        for (let i = 0; i < this.treeSprites.length; i += 1) {
          const item = this.treeSprites[i];
          if (item?.sprite?.active) {
            const sway = Math.round(Math.sin(t + item.phase));
            item.sprite.setX(item.baseX + sway);
          }
        }
      });
    }

    setWindEnabled(enabled) {
      this.windEnabled = Boolean(enabled);
      if (!this.windEnabled && this.treeSprites) {
        for (const item of this.treeSprites) {
          if (item?.sprite?.active) {
            item.sprite.setX(item.baseX);
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
      this.assetManifest = buildTutorialForestAssets(this, this.world, { seed: this.forestSeed });

      this.renderGroundRegion();
      this.renderEnvironmentActors();
      this.renderPlayer();
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

      if (!tile.walkable || this.isWalking) return;

      const path = findGridPath(this.playerPos, { tx, ty }, this.world.tileMap);
      if (path.length > 0) {
        this.walkPath(path);
      }
    }

    walkPath(path) {
      if (!path.length || this.isWalking) return;
      this.isWalking = true;
      this.player.play('player_walk');

      let step = 0;
      const stepNext = () => {
        if (step >= path.length) {
          this.isWalking = false;
          this.player.play('player_idle');
          return;
        }

        const next = path[step];
        step += 1;
        this.playerPos = { tx: next.tx, ty: next.ty };

        const targetTile = this.world.tileMap.get(`${next.tx},${next.ty}`);
        const pt = this.toIso(next.tx, next.ty, targetTile?.elevation || 0);

        this.tweens.add({
          targets: this.player,
          x: pt.x,
          y: pt.y + 4,
          duration: 200,
          ease: 'Linear',
          onUpdate: () => {
            this.player.setDepth(this.player.y + 8);
          },
          onComplete: stepNext,
        });
      };

      stepNext();
    }
  };
}
