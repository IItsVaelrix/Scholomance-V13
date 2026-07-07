/**
 * ResonanceScene.js — Phaser 4 Scene (ISOMETRIC BATTLE ZONE)
 *
 * Renders the 9x9 tactical board as a 2.5D isometric diamond arena, à la DOFUS.
 * Floor tiles are drawn as depth-sorted diamonds; combatants are WAND/PixelBrain
 * authored SVG sprites (see ../assets/combatAssets.js) that "stand" on their tile
 * and occlude correctly front-to-back.
 *
 * Public API is unchanged from the flat-grid version so PhaserLayer + the combat
 * animation queue keep working untouched:
 *   setArenaSchool, updateTileStates, renderUnits, setCursor, recenter,
 *   playCastEffect, animateMove, animateCast, animateHit, animateTurnShift.
 * Every animate* method MUST call onComplete (even on the no-op path) or the
 * OracleScribe textarea locks up.
 *
 * Atmospheric shader backdrop is a separate React canvas (ShaderArenaBackdrop),
 * not a Phaser pipeline — avoids the Phaser-3/4 PostFX API mismatch.
 */

import { buildCombatTextures, textureKeyForUnit, buildCharacterTextures } from '../assets/combatAssets.js';
import { applyEffects } from './CharacterShaderRenderer.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 9;
const ISO_RATIO = 0.5;             // tileH / tileW — 2:1 isometric
const FIT_FACTOR = 0.92;

const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const SCHOOL_COLORS = {
  SONIC:   0x8a5bff,
  VOID:    0x7a7aa6,
  PSYCHIC: 0x00e5ff,
  ALCHEMY: 0xff3d8b,
  WILL:    0xffd400,
};

// ---------------------------------------------------------------------------
// Scene Factory
// ---------------------------------------------------------------------------

export function buildResonanceScene(Phaser) {
  return class ResonanceScene extends Phaser.Scene {
    constructor() {
      super({ key: 'ResonanceScene' });
    }

    preload() {
      // WAND/PixelBrain SVG combatant textures, rasterized at native size.
      this.load.image('island_bg', '/void_ice_arena.png');
      this.load.spritesheet('combat-scholar-walk', '/starbound-esper-chibi-walk-east.png', { frameWidth: 32, frameHeight: 48 });
      try {
        const textures = buildCombatTextures({ school: 'VOID' });
        Object.entries(textures).forEach(([key, { uri, w, h }]) => {
          if (!this.textures.exists(key)) {
            // We are using PNGs generated from the Item Foundry now instead of WAND SVGs
            this.load.image(key, uri);
          }
        });
      } catch (err) {
        // Asset generation must never block the board from rendering.
        console.error('[ResonanceScene] texture build failed:', err);
      }
    }

    init(data) {
      this.onSelectCell = data?.onSelectCell ?? null;
      this.reducedMotion = data?.reducedMotion ?? false;

      this._ignited = false;
      this._schoolColor = SCHOOL_COLORS.SONIC;
      this._tileViewModels = [];
      this._renderedUnits = [];
      this._cursorTile = null;
      this._unitContainers = new Map();
      this._characterTextures = new Map(); // actorId → {textureKey, uniforms, enhancements}
      this._tiles = [];
      this._animating = false;
      this._pendingUnitsRebuild = false;

      this._calculateMetrics();
    }

    _calculateMetrics() {
      const { width, height } = this.scale;
      // Diamond board bbox ≈ N*tileW wide and N*tileH tall. Fit to canvas.
      const byW = (width * FIT_FACTOR) / GRID_SIZE;
      const byH = (height * FIT_FACTOR) / (GRID_SIZE * ISO_RATIO);
      this.tileW = Math.max(28, Math.floor(Math.min(byW, byH)));
      this.tileH = Math.floor(this.tileW * ISO_RATIO);
    }

    /** Cartesian cell → isometric pixel center, board-centered around (0,0). */
    _cellToIso(x, y) {
      const hw = this.tileW / 2;
      const hh = this.tileH / 2;
      const px = (x - y) * hw;
      const py = (x + y) * hh - (GRID_SIZE - 1) * hh;
      return { px, py };
    }

    create() {
      const g = this.make.graphics({x:0, y:0, add:false});
      g.fillStyle(0xffffff);
      g.fillCircle(4, 4, 4);
      g.generateTexture('ice_spark', 8, 8);
      g.destroy();

      if (!this.textures.exists('dust')) {
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 4, 4);
        g.generateTexture('dust', 4, 4);
        g.destroy();
      }

      // Single depth-sorted board container gives correct iso occlusion.
      this.boardContainer = this.add.container(0, 0);
      this.runeContainer = this.add.container(0, 0);

      this._buildEnvironment();
      this._buildGrid();
      this._buildLabels();
      this._buildAtmosphere();
      this.boardContainer.sort('depth');
      this.recenter();

      // Bake forged character textures (async; fallback to SVG sprites if incomplete).
      if (this._renderedUnits?.length) {
        buildCharacterTextures(this._renderedUnits, this).then(map => {
          this._characterTextures = map;
          this._rebuildUnits();
        }).catch(err => {
          console.warn('[ResonanceScene] buildCharacterTextures failed, using SVG fallback:', err);
        });
      }

      if (!this._ignited) {
        this._playIgnition();
        this._ignited = true;
      }

      this._applyCameraGrade();
      this.scale.on('resize', this._handleResize, this);
    }

    update(_time, _delta) {
      if (this.reducedMotion) return;


      this._tiles.forEach((tile) => {
        const vm = this._vmFor(tile.x, tile.y);
        if (vm && vm.hasLeyline) {
          tile.leylineSprite.setVisible(true);
          const time = this.time?.now || Date.now();

          if (vm.leylinePhase === 'dormant') {
            tile.leylineSprite.setTint(0x555555);
            tile.leylineSprite.setAlpha(0.1);
            tile.leylineSprite.setScale(0.8);
          } else if (vm.leylinePhase === 'charging') {
            tile.leylineSprite.setTint(0x00ff00);
            tile.leylineSprite.setAlpha(0.4);
            tile.leylineSprite.setScale(0.9);
          } else if (vm.leylinePhase === 'glowing') {
            tile.leylineSprite.setTint(0x00ffff);
            const pulse = Math.sin(time / 200) * 0.2 + 0.6;
            tile.leylineSprite.setAlpha(pulse);
            tile.leylineSprite.setScale(1.0 + Math.sin(time / 150) * 0.05);
          } else if (vm.leylinePhase === 'fading') {
            tile.leylineSprite.setTint(0xffa500);
            const flicker = Math.sin(time / 45) > 0 ? 0.5 : 0.2;
            tile.leylineSprite.setAlpha(flicker);
            tile.leylineSprite.setScale(0.9);
          } else if (vm.leylinePhase === 'spent') {
            tile.leylineSprite.setTint(0x222222);
            tile.leylineSprite.setAlpha(0.05);
            tile.leylineSprite.setScale(0.8);
          }
        } else {
          tile.leylineSprite.setVisible(false);
        }
      });
    }

    _applyCameraGrade() {
      if (this.reducedMotion) return;
      try {
        const f = this.cameras.main?.filters?.internal;
        if (!f) return;
        f.addColorMatrix().saturate(0.14).brightness(1.03);
        f.addVignette(0.5, 0.52, 0.62, 0.4);
      } catch { /* tolerate filter API drift */ }
    }

    _handleResize() {
      this._calculateMetrics();
      // Reposition every tile to the new iso metrics.
      this._tiles.forEach((tile) => {
        const { px, py } = this._cellToIso(tile.x, tile.y);
        tile.px = px;
        tile.py = py;
        tile.container.setPosition(px, py);
        this._redrawTile(tile);
      });
      this._buildEnvironment();
      this._rebuildUnits();
      this.boardContainer.sort('depth');
      this.recenter();
    }

    // --- Solid Environment --------------------------------------

    _buildEnvironment() {
      if (this._slab) { this._slab.destroy(); this._slab = null; }
      if (this._pillars) { this._pillars.forEach((p) => p.destroy()); this._pillars = null; }

      // Load the generated island background
      const slab = this.add.image(0, 0, 'island_bg');
      slab.setOrigin(0.5, 0.5);
      slab.setDepth(-1000);

      // Scale the island to neatly encompass the board
      const boardWidth = this.tileW * GRID_SIZE;
      const targetScale = (boardWidth * 1.6) / slab.width;
      slab.setScale(targetScale);

      // Adjust slightly upwards so the island landmass centers with the tiles
      slab.setPosition(0, -this.tileH);

      this.boardContainer.add(slab);
      this._slab = slab;
      this._pillars = [];

    }

    // --- Diamond geometry helpers ------------------------------------------

    _diamondPoints(scale = 1) {
      const hw = (this.tileW / 2) * scale;
      const hh = (this.tileH / 2) * scale;
      return [0, -hh, hw, 0, 0, hh, -hw, 0];
    }

    _buildGrid() {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const { px, py } = this._cellToIso(x, y);
          const base = this.add.graphics();
          const overlay = this.add.graphics();
          const field = this.add.graphics();
          const cursor = this.add.graphics();

          const leylineSprite = this.add.sprite(0, 0, 'combat-leyline');
          leylineSprite.setOrigin(0.5, 0.5);
          leylineSprite.setVisible(false);
          leylineSprite.setAlpha(0);

          const container = this.add.container(px, py, [base, overlay, field, cursor, leylineSprite]);
          container.setDepth((x + y) * 10);
          container.setSize(this.tileW * 2, this.tileH * 2);
          container.setInteractive({
            hitArea: new Phaser.Geom.Polygon(this._diamondPoints(1)),
            hitAreaCallback: Phaser.Geom.Polygon.Contains,
            useHandCursor: true
          });
          container.on('pointerover', () => this._onTileHover(x, y));
          container.on('pointerout', () => this._onTileHoverEnd(x, y));
          container.on('pointerdown', () => { if (this.onSelectCell) this.onSelectCell({ x, y }); });

          this.boardContainer.add(container);
          const tile = { x, y, px, py, base, overlay, cursor, field, leylineSprite, container, hovered: false };
          this._tiles.push(tile);
          this._redrawTile(tile);
        }
      }
    }

    _buildLabels() {
      // Edge coordinate labels along the two near borders of the diamond.
      const style = { fontSize: '10px', color: '#9a7f4a', fontFamily: 'JetBrains Mono, monospace' };
      for (let x = 0; x < GRID_SIZE; x++) {
        const { px, py } = this._cellToIso(x, 0);
        const lbl = this.add.text(px, py - this.tileH * 0.9, COL_LABELS[x], style)
          .setOrigin(0.5, 0.5).setAlpha(0.7);
        lbl.setDepth(9000);
        this.boardContainer.add(lbl);
      }
      for (let yi = 0; yi < GRID_SIZE; yi++) {
        const { px, py } = this._cellToIso(0, yi);
        const lbl = this.add.text(px - this.tileW * 0.72, py, String(yi + 1), style)
          .setOrigin(0.5, 0.5).setAlpha(0.7);
        lbl.setDepth(9000);
        this.boardContainer.add(lbl);
      }
    }

    _vmFor(x, y) {
      return this._tileViewModels.find((t) => t.coord.x === x && t.coord.y === y) || null;
    }

    _redrawTile(tile) {
      const vm = this._vmFor(tile.x, tile.y);
      this._drawTileBase(tile.base, tile.hovered);
      this._drawTileOverlay(tile.overlay, vm);
      this._drawTileField(tile.field, vm);
      if (tile.isCursor) this._drawCursorOverlay(tile.cursor);
    }

    _drawTileBase(gfx, hovered) {
      gfx.clear();
      const pts = this._toPointObjs(this._diamondPoints(0.98));
      // Transparent fill to let the island show through, but with a subtle white/green border
      gfx.fillStyle(0xffffff, hovered ? 0.3 : 0.02);
      gfx.fillPoints(pts, true);
      gfx.lineStyle(hovered ? 1.6 : 1, 0xffffff, hovered ? 0.75 : 0.2);
      gfx.strokePoints(pts, true);
    }

    _drawTileOverlay(gfx, vm) {
      gfx.clear();
      if (!vm) return;
      const pts = this._toPointObjs(this._diamondPoints(0.92));
      if (vm.isReachable) {
        gfx.fillStyle(0x00e5ff, 0.16);
        gfx.fillPoints(pts, true);
      } else if (vm.isTargetable) {
        gfx.fillStyle(vm.previewKind === 'aoe' ? 0xff4444 : 0x8a5bff, vm.previewKind === 'aoe' ? 0.24 : 0.12);
        gfx.fillPoints(pts, true);
      }
    }

    _drawTileField(gfx, vm) {
      gfx.clear();
      if (!vm) return;

      if (vm.hasHazard) {
        const pts = this._toPointObjs(this._diamondPoints(0.5));
        const color = vm.hazardKind === 'RESONANCE_BUFF' ? 0xffd400 : 0x7a7aa6;
        gfx.fillStyle(color, 0.18);
        gfx.fillPoints(pts, true);
        gfx.lineStyle(1.5, color, 0.6);
        gfx.strokePoints(pts, true);
      } else if (vm.isOccupied) {
        gfx.fillStyle(0x000000, 0.32);
        gfx.fillEllipse(0, this.tileH * 0.08, this.tileW * 0.5, this.tileH * 0.45);
      }
    }

    _drawCursorOverlay(gfx) {
      gfx.clear();
      const pts = this._toPointObjs(this._diamondPoints(0.96));
      gfx.lineStyle(2, this._schoolColor, 0.95);
      gfx.strokePoints(pts, true);
    }

    _toPointObjs(flat) {
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
      return out;
    }

    _onTileHover(x, y) {
      const tile = this._tiles.find((t) => t.x === x && t.y === y);
      if (!tile || tile.isCursor) return;
      tile.hovered = true;
      this._drawTileBase(tile.base, true);
    }

    _onTileHoverEnd(x, y) {
      const tile = this._tiles.find((t) => t.x === x && t.y === y);
      if (!tile || tile.isCursor) return;
      tile.hovered = false;
      this._drawTileBase(tile.base, false);
    }

    // --- Public API: state sync --------------------------------------------

    setArenaSchool(school) {
      this._schoolColor = SCHOOL_COLORS[school] ?? SCHOOL_COLORS.SONIC;
      this._tiles.forEach((tile) => this._redrawTile(tile));
    }

    updateTileStates(viewModels) {
      this._tileViewModels = viewModels || [];
      if (!this._tiles.length) return;
      this._tiles.forEach((tile) => this._redrawTile(tile));
    }

    setCursor(coord) {
      this._tiles.forEach((t) => {
        t.cursor.clear();
        t.isCursor = false;
      });
      this._cursorTile = coord;
      if (!coord) return;
      const tile = this._tiles.find((t) => t.x === coord.x && t.y === coord.y);
      if (!tile) return;
      tile.isCursor = true;
      this._drawCursorOverlay(tile.cursor);
      if (!this.reducedMotion) {
        this.tweens.add({ targets: tile.cursor, alpha: { from: 0.6, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    // --- Public API: units -------------------------------------------------

    /**
     * Return the canvas-local screen anchor for a unit's "head" — the
     * point a dialogue bubble should hang above. Returns null if the
     * scene isn't ready or the unit isn't on the board.
     *
     * The head anchor sits above the unit's feet (sprite origin is at
     * the bottom-center) by an amount proportional to the tile height,
     * which scales correctly with the canvas size.
     */
    getUnitScreenAnchor(unitId, headHeightFactor = 0.85) {
      const container = this._unitContainers?.get(unitId);
      if (!container || !this.boardContainer) return null;
      const unit = this._renderedUnits?.find((u) => u.id === unitId);
      if (!unit) return null;
      // Re-derive from current data, not the tweened sprite, so the
      // bubble stays anchored to the unit's logical position even if
      // it's mid-MOVE.
      const { px, py } = this._cellToIso(unit.position.x, unit.position.y);
      const headOffsetY = -this.tileH * headHeightFactor;
      return {
        x: this.boardContainer.x + px,
        y: this.boardContainer.y + py + headOffsetY,
      };
    }

    renderUnits(renderedUnits) {
      this._renderedUnits = renderedUnits || [];
      if (this._animating) {
        this._pendingUnitsRebuild = true;
        return;
      }
      this._rebuildUnits();
    }

    _rebuildUnits() {
      this._pendingUnitsRebuild = false;
      this._unitContainers.forEach((c) => c.destroy());
      this._unitContainers.clear();
      if (!this.boardContainer) return;

      this._renderedUnits.forEach((unit) => {
        const container = this._buildUnit(unit);
        this._unitContainers.set(unit.id, container);
      });
      this.boardContainer.sort('depth');
    }

    _buildUnit(unit) {
      const { px, py } = this._cellToIso(unit.position.x, unit.position.y);
      const key = textureKeyForUnit(unit);
      const isScholar = unit.id === 'player';
      const container = this.add.container(px, py);
      container.setDepth((unit.position.x + unit.position.y) * 10 + 5);

      // Ground shadow.
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.34);
      shadow.fillEllipse(0, 0, this.tileW * 0.46, this.tileH * 0.46);
      container.add(shadow);

      // Sprite — prefer forged character texture; fall back to WAND SVG texture.
      let sprite;
      const charData = this._characterTextures?.get(unit.id);
      const resolvedKey = charData?.textureKey ?? key;
      if (this.textures.exists(resolvedKey) || isScholar) {
        if (isScholar && this.textures.exists('combat-scholar-walk')) {
          sprite = this.add.sprite(0, 0, 'combat-scholar-walk').setOrigin(0.5, 1);
          if (!this.anims.exists('scholar-walk')) {
            this.anims.create({
              key: 'scholar-walk',
              frames: this.anims.generateFrameNumbers('combat-scholar-walk', { start: 0, end: 3 }),
              frameRate: 6,
              repeat: -1
            });
          }
          sprite.play('scholar-walk');
        } else if (this.textures.exists(resolvedKey)) {
          sprite = this.add.image(0, 0, resolvedKey).setOrigin(0.5, 1);
        }

        const targetW = this.tileW * (isScholar ? 1.85 : 2.15);
        sprite.setScale(targetW / (isScholar && this.textures.exists('combat-scholar-walk') ? 32 : sprite.width));
        sprite.y = this.tileH * 0.28; // feet sit just below tile center
        sprite.setOrigin(0.5, 1);
        // Apply GPU glow effects if we have compiled uniforms.
        if (charData?.uniforms) {
          applyEffects(sprite, charData.uniforms, charData.enhancements, this);
        }
      } else {
        // Fallback: a colored diamond token so the board never renders empty.
        sprite = this.add.graphics();
        const color = SCHOOL_COLORS[unit.school] ?? SCHOOL_COLORS.SONIC;
        sprite.fillStyle(color, 0.9);
        sprite.fillPoints(this._toPointObjs(this._diamondPoints(0.5)), true);
      }
      container.add(sprite);
      container._sprite = sprite;
      container._baseY = py;

      this.boardContainer.add(container);
      this._startIdleFloat(container, isScholar);
      return container;
    }

    _startIdleFloat(container, isScholar) {
      if (this.reducedMotion || !container._sprite) return;
      const sprite = container._sprite;
      const restY = sprite.y;
      this.tweens.add({
        targets: sprite,
        y: restY - (isScholar ? 4 : 6),
        duration: isScholar ? 2100 : 2700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // --- Public API: animations --------------------------------------------

    animateMove(unitId, targetCoord, descriptor, onComplete, originCoord = null, _options = {}) {
      const container = this._unitContainers.get(unitId);
      if (!container) return onComplete?.();
      const unit = this._renderedUnits.find((u) => u.id === unitId);
      const dest = this._cellToIso(targetCoord.x, targetCoord.y);
      if (originCoord) {
        const origin = this._cellToIso(originCoord.x, originCoord.y);
        container.x = origin.px;
        container.y = origin.py;
        container._baseY = origin.py;
        container.setDepth((originCoord.x + originCoord.y) * 10 + 5);
      }
      const d = (descriptor && descriptor.PHONEMIC_STEP) || descriptor || {};
      const traversal = d.traversal || { duration: 420 };
      const settle = d.settle || { duration: 160 };

      this._animating = true;
      const sprite = container._sprite || container;
      this.tweens.killTweensOf(sprite);
      this.tweens.killTweensOf(container);
      sprite.scaleX = 1;
      sprite.scaleY = 1;
      sprite.angle = 0;
      sprite.y = 0;

      container.setDepth(8000);
      this.tweens.add({
        targets: container,
        x: dest.px,
        y: dest.py,
        duration: Math.max(360, traversal.duration || 420),
        ease: 'Sine.easeInOut',
        onComplete: () => {
          container.x = dest.px;
          container.y = dest.py;
          container._baseY = dest.py;
          container.setDepth((targetCoord.x + targetCoord.y) * 10 + 5);
          this.tweens.add({
            targets: sprite,
            scaleX: 1.04,
            scaleY: 1.04,
            duration: settle.duration,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              sprite.scaleX = 1;
              sprite.scaleY = 1;
              this._playTileLockEffect(targetCoord, unit?.school || 'SONIC');
              this._startIdleFloat(container, unit?.id === 'player');
              this._animating = false;
              this.boardContainer.sort('depth');
              if (this._pendingUnitsRebuild) this._rebuildUnits();
              onComplete?.();
            }
          });
        }
      });
    }

    _safeEmitter(container, d) {
      try {
        const p = d.particles || {};
        const emitter = this.add.particles(0, 0, 'dust', {
          speed: { min: 5, max: 15 },
          scale: { start: 0.2, end: 0 },
          alpha: { start: p.alpha ?? 0.5, end: 0 },
          lifespan: p.lifespan ?? 400,
          frequency: p.frequency ?? 60,
          follow: container,
          blendMode: 'ADD',
        });
        this.boardContainer.add(emitter);
        emitter.setDepth(9999);
        return emitter;
      } catch { return null; }
    }

    animateCast(unitId, targetCoord, school, descriptor, onComplete, options = {}) {
      const container = this._unitContainers.get(unitId);
      if (!container) return onComplete?.();
      const d = (descriptor && descriptor.LEXICAL_CHARGE) || descriptor || {};
      const suppressDebris = Boolean(options.suppressDebris);
      const anticip = d.anticipation || { duration: 240 };
      const pulse = d.pulse || { duration: 320, scale: 2.5, alpha: 0, ease: 'Quad.easeOut' };
      const color = SCHOOL_COLORS[school] || SCHOOL_COLORS.SONIC;
      const dest = this._cellToIso(targetCoord.x, targetCoord.y);

      this._animating = true;
      const sprite = container._sprite || container;
      this.tweens.killTweensOf(sprite);

      const dx = dest.px - container.x;
      const angleSign = dx >= 0 ? -1 : 1;
      const windupAngle = angleSign * 18;
      const strikeAngle = -angleSign * 24;

      // 1. Wind-up (Squish, lean back, float up slightly)
      this.tweens.add({
        targets: sprite,
        scaleY: 0.75,
        scaleX: 1.25,
        angle: windupAngle,
        y: -10,
        duration: anticip.duration,
        ease: 'Back.easeIn',
        onComplete: () => {
          // Play ground cast shockwave
          const castRing = this.add.graphics();
          castRing.lineStyle(2.5, color, 0.85);
          castRing.strokePoints(this._toPointObjs(this._diamondPoints(0.5)), true);
          const rc = this.add.container(container.x, container.y, [castRing]);
          rc.setDepth(container.depth - 1);
          this.boardContainer.add(rc);
          this.tweens.add({
            targets: rc,
            scaleX: 2.4,
            scaleY: 2.4,
            alpha: 0,
            duration: pulse.duration * 1.5,
            ease: 'Quad.easeOut',
            onComplete: () => rc.destroy()
          });

          if (!suppressDebris) {
            const particlesAngle = Phaser.Math.Angle.Between(container.x, container.y, dest.px, dest.py);
            const spray = this.add.particles(container.x, container.y - this.tileH * 0.4, 'dust', {
              speed: { min: 80, max: 180 },
              angle: { min: Phaser.Math.RadToDeg(particlesAngle) - 20, max: Phaser.Math.RadToDeg(particlesAngle) + 20 },
              scale: { start: 0.7, end: 0 },
              alpha: { start: 0.9, end: 0 },
              lifespan: 500,
              quantity: 14,
              duration: 120,
              blendMode: 'ADD'
            });
            spray.setDepth(9999);
            this.boardContainer.add(spray);
            this.time.delayedCall(600, () => spray.destroy());
          }

          // 2. Strike/Lunge forward
          this.tweens.add({
            targets: sprite,
            scaleY: 1.35,
            scaleX: 0.75,
            angle: strikeAngle,
            y: 5,
            duration: 140,
            ease: 'Expo.easeOut',
            onComplete: () => {
              if (!suppressDebris) {
                const casting = this._renderedUnits.find((u) => u.id === unitId);
                this.playCastEffect(casting?.position ?? { x: 0, y: 0 }, targetCoord, school);
              }

              // 3. Return to Idle pose
              this.tweens.add({
                targets: sprite,
                scaleY: 1.0,
                scaleX: 1.0,
                angle: 0,
                y: 0,
                duration: 220,
                ease: 'Back.easeOut',
                onComplete: () => {
                  this._animating = false;
                  if (this._pendingUnitsRebuild) this._rebuildUnits();
                  onComplete?.();
                }
              });
            }
          });
        }
      });
    }

    animateExtraction(unitId, targetCoord, school, signals, stars, onComplete) {
      const container = this._unitContainers.get(unitId);
      const px = container ? container.x : 0;
      const py = container ? container.y : 0;

      const { px: tilePx, py: tilePy } = this._cellToIso(targetCoord.x, targetCoord.y);
      const color = SCHOOL_COLORS[school] || SCHOOL_COLORS.SONIC;
      const isSuccess = !!signals?.ok;
      const instability = !!signals?.instability;
      const starRating = stars || 1;

      this._animating = true;

      if (isSuccess) {
        const ringCount = starRating;
        const particleCount = starRating * 15;
        const shakeIntensity = starRating * 0.003;
        const shakeDuration = starRating * 120;

        if (starRating >= 3) {
          this.cameras.main.shake(shakeDuration, shakeIntensity);
        }

        if (starRating === 5) {
          const flash = this.add.graphics();
          flash.fillStyle(0xffffff, 0.7);
          flash.fillRect(-1000, -1000, 2000, 2000);
          flash.setDepth(10000);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 400,
            onComplete: () => flash.destroy()
          });
        }

        for (let i = 0; i < ringCount; i++) {
          const ring = this.add.graphics();
          ring.lineStyle(2 + i, color, 0.9);
          ring.strokePoints(this._toPointObjs(this._diamondPoints(0.6)), true);
          const c = this.add.container(tilePx, tilePy, [ring]);
          c.setDepth(9990);
          this.boardContainer.add(c);

          this.tweens.add({
            targets: c,
            scaleX: 2.2 + i * 0.4,
            scaleY: 2.2 + i * 0.4,
            alpha: 0,
            duration: 600 + i * 150,
            ease: 'Quad.easeOut',
            onComplete: () => c.destroy()
          });
        }

        const burst = this.add.particles(tilePx, tilePy, 'dust', {
          speed: { min: 40, max: 80 + starRating * 20 },
          scale: { start: 0.8, end: 0.1 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 400, max: 800 },
          quantity: particleCount,
          duration: 300,
          blendMode: 'ADD'
        });
        burst.setDepth(9995);
        this.boardContainer.add(burst);

        if (starRating >= 3) {
          const orbit = this.add.particles(tilePx, tilePy, 'dust', {
            speed: { min: 10, max: 30 },
            scale: { start: 0.6, end: 0 },
            alpha: { start: 0.8, end: 0 },
            lifespan: 1000,
            quantity: starRating * 5,
            duration: 600,
            emitZone: {
              type: 'random',
              source: new Phaser.Geom.Circle(0, 0, 80)
            },
            blendMode: 'ADD'
          });
          orbit.setDepth(9996);
          this.boardContainer.add(orbit);
          this.time.delayedCall(1200, () => orbit.destroy());
        }

        if (container) {
          const scholarStream = this.add.particles(tilePx, tilePy, 'dust', {
            speed: { min: 20, max: 50 },
            scale: { start: 0.7, end: 0.1 },
            alpha: { start: 0.9, end: 0 },
            lifespan: 500,
            quantity: starRating * 4,
            duration: 400,
            moveToX: px - tilePx,
            moveToY: (py - this.tileH * 0.4) - tilePy,
            blendMode: 'ADD'
          });
          scholarStream.setDepth(9997);
          this.boardContainer.add(scholarStream);
          this.time.delayedCall(1000, () => scholarStream.destroy());
        }

        this.time.delayedCall(800 + starRating * 100, () => {
          burst.destroy();
          this._animating = false;
          onComplete?.();
        });

      } else {
        const penaltyColor = 0xff3300;
        this.cameras.main.shake(instability ? 400 : 200, instability ? 0.015 : 0.005);

        for (let i = 0; i < 2; i++) {
          const ring = this.add.graphics();
          ring.lineStyle(1.5, penaltyColor, 0.85);
          ring.strokePoints(this._toPointObjs(this._diamondPoints(1.2)), true);
          const c = this.add.container(tilePx, tilePy, [ring]);
          c.setDepth(9990);
          this.boardContainer.add(c);

          this.tweens.add({
            targets: c,
            scaleX: 0.1,
            scaleY: 0.1,
            alpha: 0,
            duration: 450 + i * 100,
            ease: 'Back.easeIn',
            onComplete: () => c.destroy()
          });
        }

        const crackle = this.add.graphics();
        crackle.setDepth(9998);
        this.boardContainer.add(crackle);

        let crackleTimer = 0;
        const drawCrackles = () => {
          if (!this.sys?.isActive() || crackleTimer > 5) {
            crackle.destroy();
            return;
          }
          crackle.clear();
          crackle.lineStyle(2, 0xffaa00, 0.9);
          crackle.beginPath();
          crackle.moveTo(tilePx, tilePy);

          let lx = tilePx;
          let ly = tilePy;
          for (let step = 0; step < 4; step++) {
            const dx = (Math.random() - 0.5) * 40; // EXEMPT IMMUNE_ALLOW: math-random — cosmetic crackle path
            const dy = (Math.random() - 0.5) * 20; // EXEMPT IMMUNE_ALLOW: math-random — cosmetic crackle path
            lx += dx;
            ly += dy;
            crackle.lineTo(lx, ly);
          }
          crackle.strokePath();
          crackleTimer++;
          this.time.delayedCall(60, drawCrackles);
        };
        drawCrackles();

        const darkSmoke = this.add.particles(tilePx, tilePy, 'dust', {
          speed: { min: 60, max: 120 },
          scale: { start: 0.9, end: 0.1 },
          alpha: { start: 0.8, end: 0 },
          lifespan: 400,
          quantity: 20 + starRating * 5,
          duration: 250,
          color: [0x555555, 0x990000, 0x111111],
          colorEase: 'quad.out'
        });
        darkSmoke.setDepth(9995);
        this.boardContainer.add(darkSmoke);

        this.time.delayedCall(700, () => {
          darkSmoke.destroy();
          this._animating = false;
          onComplete?.();
        });
      }
    }

    animateHit(affectedTiles, school, descriptor, onComplete, options = {}) {
      const d = (descriptor && descriptor.IMPACT_FLASH) || descriptor || {};
      const flash = d.flash || { alpha: 0.8, duration: 300 };
      const shake = d.shake || { duration: 180, intensity: 0.01 };
      const particles = d.particles || { speed: 120, quantity: 12 };
      const suppressDebris = Boolean(options.suppressDebris);

      (affectedTiles || []).forEach((coord, i) => {
        const tile = this._tiles.find((t) => t.x === coord.x && t.y === coord.y);
        if (!tile) return;
        const burst = suppressDebris
          ? null
          : this.add.particles(tile.px, tile.py, 'dust', {
            speed: { min: particles.speed / 3, max: particles.speed },
            scale: { start: 0.5, end: 0 }, alpha: { start: 1, end: 0 },
            lifespan: 500, gravityY: 90, quantity: particles.quantity, duration: 100, blendMode: 'ADD',
          });
        if (burst) {
          this.boardContainer.add(burst);
          burst.setDepth(9999);
        }

        const fl = this.add.graphics();
        fl.fillStyle(0xffffff, flash.alpha);
        fl.fillPoints(this._toPointObjs(this._diamondPoints(0.92)), true);
        tile.container.add(fl);
        this.tweens.add({
          targets: fl, alpha: 0, duration: flash.duration, delay: i * 30,
          onComplete: () => {
            fl.destroy();
            if (burst) this.time.delayedCall(500, () => burst.destroy());
          },
        });
        if (i === 0) this.cameras.main.shake(shake.duration, shake.intensity);
      });
      this.time.delayedCall(320, () => onComplete?.());
    }

    animateTurnShift(activeSide, descriptor, onComplete) {
      const d = (descriptor && descriptor.TURN_SWEEP) || descriptor || {};
      const dim = d.dim || { alpha: 0.7, duration: 220 };
      const aura = d.aura || { scale: 1.12, duration: 260, ease: 'Sine.easeInOut' };

      this.tweens.add({ targets: this.boardContainer, alpha: dim.alpha, duration: dim.duration, yoyo: true, ease: 'Sine.easeInOut' });
      this._unitContainers.forEach((c, id) => {
        const isActive = (activeSide === 'scholar' && id === 'player') || (activeSide === 'enemy' && id === 'opponent');
        this.tweens.add({ targets: c, scale: isActive ? aura.scale : 1, duration: aura.duration, ease: aura.ease });
      });
      this.time.delayedCall((aura.duration || 260) + 100, () => onComplete?.());
    }

    playCastEffect(origin, target, school = 'SONIC') {
      const start = this._cellToIso(origin.x, origin.y);
      const end = this._cellToIso(target.x, target.y);
      const color = SCHOOL_COLORS[school] ?? SCHOOL_COLORS.SONIC;
      const beam = this.add.graphics();
      beam.setDepth(9998);
      this.boardContainer.add(beam);
      const progress = { t: 0 };
      this.tweens.add({
        targets: progress, t: 1, duration: 380, ease: 'Quad.easeIn',
        onUpdate: () => {
          beam.clear();
          const casterH = this.tileH * 0.45;
          const sx = start.px;
          const sy = start.py - casterH;
          const ex = start.px + (end.px - start.px) * progress.t;
          const ey = (start.py - casterH) + ((end.py - casterH) - (start.py - casterH)) * progress.t;

          // 1. Glowing outer elemental aura
          beam.lineStyle(5 + Math.sin(this.time.now / 30) * 1.5, color, 0.6 * (1 - progress.t * 0.2));
          beam.lineBetween(sx, sy, ex, ey);

          // 2. White hot core
          beam.lineStyle(2, 0xffffff, 0.9 * (1 - progress.t * 0.2));
          beam.lineBetween(sx, sy, ex, ey);
        },
        onComplete: () => {
          beam.destroy();
          switch (school) {
            case 'VOID': this._playVoidHollow(target); break;
            case 'PSYCHIC': this._playPsychicSchism(target); break;
            default: this._playRipple(target, color);
          }
        },
      });
    }

    // --- Transient effects (iso-space) -------------------------------------

    _playRipple(target, color) {
      const { px, py } = this._cellToIso(target.x, target.y);
      const ring = this.add.graphics();
      ring.lineStyle(2, color, 1);
      ring.strokePoints(this._toPointObjs(this._diamondPoints(0.5)), true);
      const c = this.add.container(px, py, [ring]);
      c.setDepth(9998);
      this.boardContainer.add(c);
      this.tweens.add({ targets: c, scaleX: 4, scaleY: 4, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
    }

    _playVoidHollow(target) {
      const { px, py } = this._cellToIso(target.x, target.y);
      const hollow = this.add.graphics();
      hollow.fillStyle(0x000000, 1);
      hollow.fillCircle(0, 0, 5);
      const c = this.add.container(px, py, [hollow]);
      c.setDepth(9998);
      this.boardContainer.add(c);
      this.tweens.add({ targets: hollow, scaleX: 8, scaleY: 8, alpha: 0, duration: 680, ease: 'Expo.easeIn', onComplete: () => c.destroy() });
    }

    _playPsychicSchism(target) {
      const { px, py } = this._cellToIso(target.x, target.y);
      const c = this.add.container(px, py);
      c.setDepth(9998);
      this.boardContainer.add(c);
      for (let i = 0; i < 4; i++) {
        const angle = (i * 90) * (Math.PI / 180);
        const line = this.add.graphics();
        line.lineStyle(2, 0x00e5ff, 0.9);
        line.lineBetween(0, 0, Math.cos(angle) * 30, Math.sin(angle) * 30 * ISO_RATIO);
        c.add(line);
        this.tweens.add({ targets: line, alpha: 0, x: Math.cos(angle) * 14, y: Math.sin(angle) * 14, duration: 440, ease: 'Cubic.easeOut' });
      }
      this.time.delayedCall(480, () => c.destroy());
    }

    _playTileLockEffect(target, school) {
      const { px, py } = this._cellToIso(target.x, target.y);
      const color = SCHOOL_COLORS[school] ?? SCHOOL_COLORS.SONIC;
      const ring = this.add.graphics();
      ring.lineStyle(2, color, 0.8);
      ring.strokePoints(this._toPointObjs(this._diamondPoints(0.9)), true);
      const c = this.add.container(px, py, [ring]);
      c.setDepth(9997);
      this.boardContainer.add(c);
      this.tweens.add({ targets: c, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
    }

    // --- Atmosphere --------------------------------------------------------

    _buildAtmosphere() {
      this.runeContainer?.removeAll(true);
    }

    _playIgnition() {
      if (this.reducedMotion) return;
      this._tiles.forEach((tile) => {
        const dist = tile.x + tile.y;
        tile.container.setAlpha(0);
        this.tweens.add({ targets: tile.container, alpha: 1, duration: 320, delay: dist * 55 + 80, ease: 'Sine.easeOut' });
      });
    }

    recenter() {
      const cx = this.cameras.main.centerX;
      const cy = this.cameras.main.centerY;
      if (this.boardContainer) this.boardContainer.setPosition(cx, cy);
      if (this.runeContainer) this.runeContainer.setPosition(cx, cy);
    }
  };
}
