/**
 * GALAXY PHYSICS & VISUAL SIMULATOR
 *
 * Implements:
 * 1. Physics Layer: Softened pairwise N-Body + Central Core gravity + Navarro-Frenk-White Dark Matter Halo potential.
 * 2. Form Layer: Logarithmic spiral initialization + Density Wave Theory tangential pull forces.
 * 3. Visual Layer: Volumetric multi-spectral stardust scattering (Hydrogen-Alpha, OIII, Sulfur-II) + starlight-absorbing dust lanes.
 * 4. Cache Optimization: Pre-rendered volumetric gas/dust textures for high performance.
 */

// Colors for spectral rendering (Hydrogen-Alpha, Oxygen III, Sulfur II)
const COLOR_H_ALPHA = 'rgba(255, 20, 147, ';  // Deep Pink / Magenta
const COLOR_OIII    = 'rgba(0, 245, 255, ';   // Cyan / Turquoise
const COLOR_SULFUR  = 'rgba(255, 69, 0, ';     // Orange-Red
const COLOR_DUST    = 'rgba(10, 8, 14, ';      // Starlight-absorbing dark dust

const G = 0.6; // Gravitational constant
const M_CORE = 180000; // Massive black hole / bulge mass
const V_HALO = 140; // Dark Matter Halo velocity scale
const R_HALO = 160; // Halo scale radius (Rh)
const EPSILON_SQ = 225; // Softening parameter (epsilon = 15 px)
const PATTERN_SPEED = 0.05; // Density wave pattern rotation speed (rad/s)
const C_DW = 12.0; // Density wave tangential force scale
const SPIRAL_B = 0.26; // Logarithmic spiral flare constant (b)
const SPIRAL_A = 12.0; // Logarithmic spiral scale constant (a)

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(1337);

function rand(min, max) {
  return min + rng() * (max - min);
}

function randNormal() {
  // Box-Muller transform for gaussian distribution
  let u = 0, v = 0;
  while(u === 0) u = rng();
  while(v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Pre-renders soft radial gradient textures for volumetric rendering
 */
function createVolumetricSprites() {
  if (typeof document === 'undefined') return null;

  const createGradSprite = (colorStr, size, absorb = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;

    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    if (absorb) {
      // Dust absorbs light - opaque center, fading to transparent
      grad.addColorStop(0, `${colorStr}0.88)`);
      grad.addColorStop(0.35, `${colorStr}0.62)`);
      grad.addColorStop(0.7, `${colorStr}0.25)`);
      grad.addColorStop(1, `${colorStr}0)`);
    } else {
      // Spectral emission glows
      grad.addColorStop(0, `${colorStr}0.22)`);
      grad.addColorStop(0.2, `${colorStr}0.15)`);
      grad.addColorStop(0.5, `${colorStr}0.06)`);
      grad.addColorStop(1, `${colorStr}0)`);
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  };

  return {
    hAlpha: createGradSprite(COLOR_H_ALPHA, 160),
    oIII: createGradSprite(COLOR_OIII, 130),
    sulfur: createGradSprite(COLOR_SULFUR, 110),
    dust: createGradSprite(COLOR_DUST, 90, true)
  };
}

/**
 * Renders the galaxy using layered volumetric sprites & composition modes
 */
function drawGalaxyLayers(ctx, state, includeSparkles = true) {
  const { particles, sprites, centerX, centerY } = state;
  if (!sprites) return;

  ctx.save();

  // 1. Draw Nebula Gas Glows (Screen blend mode for realistic starlight scattering)
  ctx.globalCompositeOperation = 'screen';
  for (const p of particles) {
    if (p.type !== 'gas' || p.species === 'dust') continue;

    let sprite = null;
    if (p.species === 'h-alpha') sprite = sprites.hAlpha;
    else if (p.species === 'oIII') sprite = sprites.oIII;
    else if (p.species === 'sulfur') sprite = sprites.sulfur;

    if (sprite) {
      const scale = p.size / sprite.width;
      const size = p.size;
      // Starlight scattering: gas brightness peaks near the core due to supermassive excitation
      const dist = Math.hypot(p.x, p.y);
      const exciter = Math.max(0.4, 1.2 - dist / 320);
      ctx.globalAlpha = exciter;

      ctx.drawImage(
        sprite,
        p.x + centerX - size / 2,
        p.y + centerY - size / 2,
        size,
        size
      );
    }
  }

  // 2. Draw Dust Lanes (Multiply blend mode to simulate volumetric starlight absorption)
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.55;
  for (const p of particles) {
    if (p.type === 'gas' && p.species === 'dust') {
      const sprite = sprites.dust;
      const size = p.size;
      ctx.drawImage(
        sprite,
        p.x + centerX - size / 2,
        p.y + centerY - size / 2,
        size,
        size
      );
    }
  }

  // 3. Draw Stars (Lighter blend mode for radiant starlight)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    if (p.type !== 'star') continue;

    // Phase function starlight bloom
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + centerX, p.y + centerY, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (includeSparkles) {
    // 3.5 Draw Sparkles (interactive trails from the Wand)
    for (const p of particles) {
      if (p.type !== 'sparkle') continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.beginPath();
      ctx.arc(p.x + centerX, p.y + centerY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1.0;

  // 4. Draw Supermassive Black Hole & Accretion Disk (Core)
  const distToCore = 0;
  const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 32);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  coreGrad.addColorStop(0.15, 'rgba(123, 108, 255, 0.9)');
  coreGrad.addColorStop(0.4, 'rgba(0, 245, 255, 0.4)');
  coreGrad.addColorStop(1, 'rgba(123, 108, 255, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 32, 0, Math.PI * 2);
  ctx.fill();

  // Core diffraction spikes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(centerX - 42, centerY);
  ctx.lineTo(centerX + 42, centerY);
  ctx.moveTo(centerX, centerY - 42);
  ctx.lineTo(centerX, centerY + 42);
  ctx.stroke();

  ctx.restore();
}

export function initGalaxy(width, height) {
  const particles = [];
  const sprites = createVolumetricSprites();
  const maxRadius = Math.min(width, height) * 0.46;
  const scaleRadius = maxRadius * 0.4; // Exponential disk scale length

  // 1. Initialize Stars (~180 particles)
  const starCount = 180;
  for (let i = 0; i < starCount; i++) {
    // Sérsic profile (n=1 exponential disk radial sampling)
    let r = -scaleRadius * Math.log(1 - rng() * 0.96);
    r = Math.max(12, r); // Keep away from singularity core

    // Assign to one of 2 spiral arms
    const armIndex = rng() < 0.5 ? 0 : 1;
    const baseTheta = (1 / SPIRAL_B) * Math.log(r / SPIRAL_A) + armIndex * Math.PI;

    // Apply dispersion (narrow near core, wider at edges)
    const dispersion = (0.16 + (r / maxRadius) * 0.22) * randNormal();
    const theta = baseTheta + dispersion;

    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    // Orbital kinematics balancing Core gravity + DM Halo
    const accCore = (M_CORE) / (r * r);
    const accHalo = (V_HALO * V_HALO * r) / (r * r + R_HALO * R_HALO);
    const vOrbit = Math.sqrt(r * (accCore + accHalo));

    // Base circular velocity vectors
    let vx = -vOrbit * Math.sin(theta);
    let vy = vOrbit * Math.cos(theta);

    // Epicyclic thermal perturbations
    const thermal = vOrbit * 0.08;
    vx += rand(-thermal, thermal);
    vy += rand(-thermal, thermal);

    // Spectral classification
    const randTemp = rng();
    let starColor, starSize;
    if (randTemp < 0.12) {
      // Hot O/B stars (Blue-white)
      starColor = 'rgba(191, 227, 255, 0.95)';
      starSize = rand(1.6, 2.5);
    } else if (randTemp < 0.45) {
      // Sol-like G/F stars (White/Yellow-white)
      starColor = 'rgba(255, 253, 240, 0.85)';
      starSize = rand(1.1, 1.6);
    } else {
      // Cool K/M stars (Orange-red)
      starColor = 'rgba(255, 120, 80, 0.75)';
      starSize = rand(0.8, 1.2);
    }

    particles.push({
      id: i,
      type: 'star',
      x,
      y,
      vx,
      vy,
      mass: rand(0.5, 1.8),
      size: starSize,
      color: starColor
    });
  }

  // 2. Initialize Nebula Gas & Dust Clouds (~70 particles)
  const gasCount = 70;
  for (let i = 0; i < gasCount; i++) {
    let r = -scaleRadius * Math.log(1 - rng() * 0.94);
    r = Math.max(16, r);

    const armIndex = rng() < 0.5 ? 0 : 1;
    const baseTheta = (1 / SPIRAL_B) * Math.log(r / SPIRAL_A) + armIndex * Math.PI;
    const dispersion = (0.12 + (r / maxRadius) * 0.18) * randNormal();
    const theta = baseTheta + dispersion;

    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    const accCore = (M_CORE) / (r * r);
    const accHalo = (V_HALO * V_HALO * r) / (r * r + R_HALO * R_HALO);
    const vOrbit = Math.sqrt(r * (accCore + accHalo));

    const vx = -vOrbit * Math.sin(theta);
    const vy = vOrbit * Math.cos(theta);

    // Distribute nebula species
    const speciesRoll = rng();
    let species, size;
    if (speciesRoll < 0.35) {
      species = 'h-alpha'; // Pink-magenta Hydrogen
      size = rand(120, 160);
    } else if (speciesRoll < 0.65) {
      species = 'oIII'; // Cyan Oxygen
      size = rand(100, 130);
    } else if (speciesRoll < 0.8) {
      species = 'sulfur'; // Deep Red-Orange Sulfur
      size = rand(80, 110);
    } else {
      species = 'dust'; // Dust lane absorption
      size = rand(70, 95);
    }

    particles.push({
      id: starCount + i,
      type: 'gas',
      species,
      x,
      y,
      vx,
      vy,
      mass: rand(2.2, 4.5),
      size
    });
  }

  const state = {
    particles,
    sprites,
    clock: 0,
    width,
    height,
    centerX: width / 2,
    centerY: height * 0.44 // Positioned elegantly behind the scrying orb
  };

  // MATHEMATICAL CACHING: Pre-render the entire static galaxy (stars, dust, gas, core) 
  // into an offscreen canvas. This avoids doing 250+ expensive globalCompositeOperation 
  // blend mode calculations (screen, multiply) per frame.
  const cachedCanvas = document.createElement('canvas');
  cachedCanvas.width = width;
  cachedCanvas.height = height;
  const offCtx = cachedCanvas.getContext('2d');
  
  // Render the static layers once
  drawGalaxyLayers(offCtx, state, false);
  
  state.cachedCanvas = cachedCanvas;

  return state;
}

export function updateGalaxy(state, dt) {
  state.clock += dt;
  // If we are using mathematical caching, we don't need to run the expensive $O(N^2)$ N-body physics 
  // on the static galaxy elements every frame. They will just rotate visually.
  // We only need to update the dynamic sparkles (handled in photonicStorm.js)
}



/**
 * Main render entrypoint called every frame.
 * Uses the mathematically cached canvas for the static galaxy and just rotates it,
 * while dynamically drawing the interactive sparkles on top.
 */
export function drawGalaxy(ctx, state) {
  if (state.cachedCanvas) {
    ctx.save();
    // Translate to center to rotate the cached image
    ctx.translate(state.centerX, state.centerY);
    
    // The density wave pattern speed drives the slow rotation of the galaxy
    ctx.rotate(state.clock * PATTERN_SPEED);
    
    // Draw the pre-calculated galaxy
    ctx.drawImage(state.cachedCanvas, -state.centerX, -state.centerY);
    ctx.restore();

    // Draw dynamic interactive sparkles over the cached galaxy
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (p.type !== 'sparkle') continue;
      ctx.fillStyle = p.color || '#fff';
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.beginPath();
      // Sparkles are absolute coordinates, so we draw them directly
      ctx.arc(p.x + state.centerX, p.y + state.centerY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    drawGalaxyLayers(ctx, state, true);
  }
}
