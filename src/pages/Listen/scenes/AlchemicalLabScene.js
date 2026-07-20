/**
 * AlchemicalLabScene.js — Background atmosphere with rotating portal halo
 *
 * Performance: All textures are pre-baked at module level (shared across instances)
 * to eliminate runtime texture generation delays.
 */

import { getBytecodeAMP, AMP_CHANNELS } from '../../../lib/ambient/bytecodeAMP';
import { freshRng } from '../../../lib/math/seededRng.js';

// ══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL CACHED TEXTURES (pre-baked, shared across all instances)
// ══════════════════════════════════════════════════════════════════════════

let PARTICLE_TEXTURE = null;

function preBakeTextures() {
  if (PARTICLE_TEXTURE) return; 

  const particleG = document.createElement('canvas');
  particleG.width = 16;
  particleG.height = 16;
  const pCtx = particleG.getContext('2d', { willReadFrequently: true });
  
  const pGradient = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
  pGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  pGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  pCtx.fillStyle = pGradient;
  pCtx.fillRect(0, 0, 16, 16);
  PARTICLE_TEXTURE = particleG;
}

// ══════════════════════════════════════════════════════════════════════════
// SCENE CLASS
// ══════════════════════════════════════════════════════════════════════════

export function buildAlchemicalLabScene(Phaser) {
  return class AlchemicalLabScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AlchemicalLabScene' });
    this._sprites = {};
    this._archHexR = 0;
    this._isCreated = false;
    this._sig = 0;
    this._bpm = 90; // Default BPM for rotation sync
  }

  init(data) {
    this.reducedMotion = data?.reducedMotion ?? false;
  }

  preload() {
    preBakeTextures();
    if (!this.textures.exists('labPt')) {
      this.textures.addCanvas('labPt', PARTICLE_TEXTURE);
    }
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.scene.settings.zIndex = 0;

    // ── Static layers ───────────────────────────────
    this._bgGfx = this.add.graphics();
    this._archStatGfx = this.add.graphics();
    this._leftGfx = this.add.graphics();
    this._rightGfx = this.add.graphics();
    this._bottleGfx = this.add.graphics();
    this._candleGfx = this.add.graphics();

    // ── Dynamic layers ───────────────────────────
    this._glowGfx = this.add.graphics();
    this._ledGfx = this.add.graphics();
    this._vigGfx = this.add.graphics();

    // Build 2D elements
    this._drawBackground(W, H);
    this._drawArchStatic(W, H);
    // Pentagram removed (performance): keep only the radius the particles need.
    this._archHexR = (Math.max(W, H) * 0.45) * 0.53;
    this._buildParticles(W, H);
    this._drawVignette(W, H);

    // ── Filters Refinement (Phaser 4: postFX→Filters; addBloom removed, approximate
    // the "paintbrush" bloom with a soft Glow + brightness lift) ──
    try {
      const f = this.cameras.main?.filters?.internal;
      if (f && !this.reducedMotion) {
        f.addGlow(0xffffff, 1.3, 0, 1, false, 8, 14);
        f.addColorMatrix().brightness(1.05);
      }
    } catch { /* tolerate filter API drift */ }

    this._isCreated = true;
  }

  _drawBackground(W, H) {
    const g = this._bgGfx;
    g.fillStyle(0x010305, 1);
    g.fillRect(0, 0, W, H);
    const bw = 72, bh = 36;
    const STONE = [0x030709, 0x040a0f, 0x03060c, 0x050b0e, 0x040810];
    for (let row = 0; row * bh <= H + bh; row++) {
      const offset = (row % 2) * (bw * 0.5);
      for (let col = -1; col * bw <= W + bw; col++) {
        const x = col * bw + offset;
        const y = row * bh;
        const si = (row * 7 + col * 13 + 17) % STONE.length;
        g.fillStyle(STONE[si], 0.6);
        g.fillRect(x, y, bw - 1, bh - 1);
      }
    }
    g.lineStyle(1, 0x020507, 0.8);
    for (let row = 0; row * bh <= H; row++) { g.lineBetween(0, row * bh, W, row * bh); }
    g.fillStyle(0x000000, 0.5);
    g.fillRect(0, 0, W, H * 0.07);
    g.fillStyle(0x000000, 0.4);
    g.fillRect(0, H * 0.88, W, H * 0.12);
    for (let y = 0; y < H * 0.35; y += 3) {
      const a = (1 - y / (H * 0.35)) * 0.04;
      g.fillStyle(0x003318, a);
      g.fillRect(0, y, W, 3);
    }
  }

  _drawArchStatic(W, H) {
    const g = this._archStatGfx;
    const cx = W * 0.5, cy = H * 0.50, outerR = Math.max(W, H) * 0.45;
    const halos = [{ r: outerR + 80, w: 12, a: 0.02 }, { r: outerR + 45, w: 8, a: 0.035 }, { r: outerR + 20, w: 5, a: 0.06 }];
    halos.forEach(({ r, w, a }) => { g.lineStyle(w, 0x004422, a); g.strokeCircle(cx, cy, r); });
    g.lineStyle(6, 0x091610, 1); g.strokeCircle(cx, cy, outerR + 2);
    g.lineStyle(2, 0x14281a, 0.8); g.strokeCircle(cx, cy, outerR);
    const bezelR = outerR * 0.78, bezelWidth = 32;
    g.lineStyle(bezelWidth, 0x1a160a, 1); g.strokeCircle(cx, cy, bezelR);
    g.lineStyle(3, 0x8a723a, 0.5); g.strokeCircle(cx, cy, bezelR + (bezelWidth / 2));
    g.lineStyle(2, 0x000000, 0.9); g.strokeCircle(cx, cy, bezelR - (bezelWidth / 2));
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2, px = cx + Math.cos(ang) * bezelR, py = cy + Math.sin(ang) * bezelR;
      g.fillStyle(0x000000, 1); g.fillCircle(px, py, 8);
      g.lineStyle(2, 0x5a4a2a, 0.6); g.strokeCircle(px, py, 9);
    }
    this._archCx = cx; this._archCy = cy; this._bezelR = bezelR;
  }

  _buildParticles(W, H) {
    const cx = W * 0.5, cy = H * 0.50, outerR = this._archHexR * 1.8;
    const rng = freshRng();
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2, dist = outerR * (0.7 + rng() * 0.3);
      this.add.particles(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 'labPt', {
        speed: { min: 8, max: 18 }, angle: { min: 240, max: 300 }, scale: { start: 0.3, end: 0 },
        alpha: { start: 0.4, end: 0 }, lifespan: { min: 1800, max: 2800 }, quantity: 1,
        tint: 0x00cc88, blendMode: 'ADD', frequency: 800, emitting: true,
      });
    }
  }

  _drawVignette(W, H) {
    const g = this._vigGfx;
    for (let x = 0; x < W * 0.09; x += 2) { g.fillStyle(0x000000, (1 - x / (W * 0.09)) * 0.52); g.fillRect(x, 0, 2, H); }
    for (let x = W * 0.91; x < W; x += 2) { g.fillStyle(0x000000, ((x - W * 0.91) / (W * 0.09)) * 0.52); g.fillRect(x, 0, 2, H); }
  }

  update(time, _delta) {
    if (!this._isCreated) return;

    // ── Clear Dynamic Graphics ──
    this._glowGfx.clear();

    // ── Update Synchronized Bytecode AMP Signals ──
    const flicker = getBytecodeAMP(time, AMP_CHANNELS.FLICKER);
    const glow    = getBytecodeAMP(time, AMP_CHANNELS.GLOW);

    const cx = this.scale.width * 0.5, cy = this.scale.height * 0.50;

    // Phonemic Pips (Yellow Lights in Bezel Sockets)
    if (this._bezelR) {
      const alpha = (0.65 + flicker * 0.2) * glow;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2, px = cx + Math.cos(ang) * this._bezelR, py = cy + Math.sin(ang) * this._bezelR;
        let pipAlpha = alpha * 0.9;
        if (flicker > 0.92) pipAlpha = 1.0;
        this._glowGfx.fillStyle(0xffcc44, pipAlpha); this._glowGfx.fillCircle(px, py, 3.5);
        this._glowGfx.fillStyle(0xffaa00, pipAlpha * 0.4); this._glowGfx.fillCircle(px, py, 8);
        this._glowGfx.fillStyle(0xff8800, pipAlpha * 0.15); this._glowGfx.fillCircle(px, py, 14);
      }
    }
  }

  updateState(data) {
    if (data.signalLevel !== undefined) this._sig = data.signalLevel;
    if (data.bpm !== undefined) this._bpm = data.bpm;
  }
  };
}
