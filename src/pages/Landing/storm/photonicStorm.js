/**
 * PHOTONIC STORM — headless renderer for the scrying-orb landing scene.
 *
 * Cumulous clouds drift; at scheduled intervals a strike is fired. Each strike
 * encodes its seed coordinates through the Photonic-Retina → Photonic-Quantization
 * bridge (routeRetinaPacketToPhotonicBridge). The returned packet bytes seed the
 * bolt geometry, and the bridge's optical simulation modulates branch density and
 * cloud illumination. Cranking `intensity` raises strike frequency and packet
 * dimension, which is the real stress load on the photonic pipeline.
 *
 * No React here — driven by StormCanvas via update(dt)/render(ctx).
 */

import { routeRetinaPacketToPhotonicBridge } from '../../../lib/photonic-retina/index.js';
import { generateBoltFromPacket } from './photonicBolt.js';
import { initGalaxy, updateGalaxy, drawGalaxyPlate, drawGalaxySparkles } from './galaxySim.js';
import { freshRng } from '../../../lib/math/seededRng.js';

const rng = freshRng();

const ARC = '#bfe3ff'; // electric-blue bolt core
const AMETHYST = '#7b6cff'; // divination amethyst
const CLOUD_DECAY = 0.16; // seconds for a cloud's internal burst to fade
const BOLT_LIFE = 0.22; // seconds a bolt stays lit

function rand(min, max) {
  return min + rng() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Bigger clouds read as nearer, so they drift faster (parallax). Slow overall to
// resemble real wind-driven cloud movement.
function cloudSpeed(radius, height) {
  const parallax = 0.6 + (radius / (height * 0.2)) * 0.8;
  return rand(8, 20) * parallax;
}

function buildCloudField(width, height, intensity, variant) {
  const area = width * height;
  const base = variant === 'orb' ? 5 : 6;
  const count = Math.max(3, Math.round(base + (area / 240000) * intensity));
  const band = variant === 'orb' ? height * 0.9 : height * 0.62;
  const windDir = rng() < 0.5 ? -1 : 1; // one wind across the whole sky
  const clouds = [];

  for (let i = 0; i < count; i += 1) {
    const cy = rand(height * 0.06, band);
    const radius = variant === 'orb' ? rand(width * 0.18, width * 0.34) : rand(height * 0.1, height * 0.2);
    const puffCount = Math.round(rand(5, 9));
    const puffs = [];
    for (let p = 0; p < puffCount; p += 1) {
      puffs.push({
        dx: rand(-radius, radius),
        dy: rand(-radius * 0.45, radius * 0.5),
        r: rand(radius * 0.45, radius * 0.95),
      });
    }
    clouds.push({
      x: rand(-width * 0.12, width * 1.12), // staggered, some already off-screen
      y: cy,
      baseY: cy,
      radius,
      puffs,
      charge: 0,
      sprite: null,
      vx: windDir * cloudSpeed(radius, height),
      bobPhase: rand(0, Math.PI * 2),
      bobAmp: radius * rand(0.03, 0.08),
      bobFreq: rand(0.04, 0.12),
      respawn: 0,
      margin: radius + 48,
    });
  }

  return clouds;
}

/**
 * Pre-render a cloud's resting puff stack to an offscreen canvas once, so the
 * per-frame cost is a single drawImage instead of ~7 createRadialGradient calls.
 * Drift only changes the draw position, so the sprite stays valid until resize.
 */
function createCloudSprite(cloud) {
  if (typeof document === 'undefined') return null;

  let half = 0;
  for (const puff of cloud.puffs) {
    half = Math.max(half, Math.abs(puff.dx) + puff.r, Math.abs(puff.dy) + puff.r);
  }
  const size = Math.ceil((half + 4) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const sctx = canvas.getContext('2d');
  const c = size / 2;

  for (const puff of cloud.puffs) {
    const x = c + puff.dx;
    const y = c + puff.dy;
    const grad = sctx.createRadialGradient(x, y, 0, x, y, puff.r);
    grad.addColorStop(0, 'rgba(150, 170, 210, 0.16)');
    grad.addColorStop(0.55, 'rgba(90, 110, 150, 0.08)');
    grad.addColorStop(1, 'rgba(40, 50, 80, 0)');
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(x, y, puff.r, 0, Math.PI * 2);
    sctx.fill();
  }

  return { canvas, c };
}

function stellarStrikeInput(galaxyState, origin, end, width, height, strikeCount, clock) {
  const payload = [
    { x: origin.x, y: origin.y, emphasis: 1.0, color: ARC },
    { x: end.x, y: end.y, emphasis: 0.6, color: AMETHYST },
  ];

  if (galaxyState && galaxyState.particles) {
    const centerX = galaxyState.centerX;
    const centerY = galaxyState.centerY;
    const stars = galaxyState.particles.filter((p) => p.type === 'star');
    const midX = (origin.x + end.x) / 2;
    const midY = (origin.y + end.y) / 2;

    stars.sort((a, b) => {
      const distA = Math.hypot(a.x + centerX - midX, a.y + centerY - midY);
      const distB = Math.hypot(b.x + centerX - midX, b.y + centerY - midY);
      return distA - distB;
    });

    stars.slice(0, 4).forEach((star) => {
      payload.push({
        x: star.x + centerX,
        y: star.y + centerY,
        emphasis: 0.2 + (star.mass / 2) * 0.4,
        color: star.color || '#fffdf0'
      });
    });
  }

  payload.push({
    x: (strikeCount * 37) % Math.max(1, width),
    y: (clock * 1000) % Math.max(1, height),
    emphasis: 0.15,
    color: '#0b1020'
  });

  return {
    sourceKind: 'coordinates',
    dimensions: { width: Math.max(1, width), height: Math.max(1, height) },
    payload
  };
}

export function createPhotonicStorm(options = {}) {
  const state = {
    intensity: options.intensity ?? 1,
    variant: options.variant || 'scene',
    debug: Boolean(options.debug),
    skipGalaxyPlate: Boolean(options.skipGalaxyPlate),
    onStrike: typeof options.onStrike === 'function' ? options.onStrike : null,
    width: 1,
    height: 1,
    clouds: [],
    bolts: [],
    lastPacket: null,
    clock: 0,
    sinceStrike: 0,
    nextStrikeIn: 0.2,
    strikeCount: 0,
    fps: 0,
    restrikesLeft: 0,
    lastBolt: null,
    telemetry: { grade: '—', score: 0, opticalFit: 0, dim: 0, sites: 0, grid: '—', solves: 0, computeMs: 0 },
    galaxy: null,
    mouseX: 0,
    mouseY: 0,
    wandX: 0,
    wandY: 0,
    mouseActive: false,
  };

  // ── DBM worker (off-thread Laplacian growth + TurboQuant routing) ──────────
  let worker = null;
  let workerBusy = false;
  const pending = new Map();

  function onBolt(event) {
    workerBusy = false;
    const { id, points, branches, telemetry } = event.data || {};
    const cloud = pending.get(id);
    pending.delete(id);
    if (!points || points.length < 2) return;
    state.bolts.push({ points, branches: branches || [], life: 1 });
    if (state.bolts.length > 16) state.bolts.shift();
    if (cloud) cloud.charge = 1;
    state.lastBolt = { points, branches: branches || [], cloud };
    if (telemetry) state.telemetry = telemetry;
    state.onStrike?.(state.telemetry);

    // Real lightning frequently restrikes the same channel a few times before a
    // long quiet. ~half the time, queue 1–2 rapid same-channel re-flashes.
    if (state.restrikesLeft === 0 && rng() < 0.5) {
      state.restrikesLeft = rng() < 0.35 ? 2 : 1;
      state.nextStrikeIn = rand(0.05, 0.14);
      state.sinceStrike = 0;
    }
  }

  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./dbm.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = onBolt;
      worker.onerror = () => { worker = null; workerBusy = false; };
    } catch {
      worker = null;
    }
  }

  function packetDimension() {
    return Math.max(64, Math.min(1024, Math.round(160 * state.intensity)));
  }

  function pickCloud() {
    if (state.clouds.length === 0) return null;
    return state.clouds[Math.floor(rng() * state.clouds.length)];
  }

  // Synchronous fallback (midpoint-displacement) when no worker is available.
  function fireStrikeSync(cloud, origin) {
    const spread = cloud.radius * (state.variant === 'orb' ? 1.4 : 1.7);
    const end = {
      x: origin.x + rand(-spread, spread),
      y: origin.y + rand(spread * 0.2, spread * 1.1),
    };
    let route = null;
    try {
      route = routeRetinaPacketToPhotonicBridge(stellarStrikeInput(state.galaxy, origin, end, state.width, state.height, state.strikeCount, state.clock), {
        retina: { targetDimension: packetDimension(), bitWidth: 4 },
        bridge: { mode: 'shadow' },
        previousPacket: state.lastPacket,
      });
    } catch {
      route = null;
    }
    if (!route || !route.packet) return;
    const optical = route.opticalSimulation || {};
    const phase = optical.phaseBuckets || { forward: 0, inverted: 0, dark: 0 };
    const phaseTotal = (phase.forward + phase.inverted + phase.dark) || 1;
    const bolt = generateBoltFromPacket(route.packet, origin, end, {
      detail: state.variant === 'orb' ? 5 : 6,
      displacement: 0.2 + (phase.inverted / phaseTotal) * 0.22,
      branchChance: 0.16 + (Number(optical.opticalFit) || 0) * 0.3,
    });
    state.bolts.push({ ...bolt, life: 1 });
    if (state.bolts.length > 24) state.bolts.shift();
    cloud.charge = 1;
    state.lastPacket = route.packet;
    state.telemetry = {
      grade: route.bridgeReport?.compatibilityGrade || '—',
      score: Number(route.bridgeReport?.compatibilityScore) || 0,
      opticalFit: Number(optical.opticalFit) || 0,
      dim: route.packet.dimension,
      sites: route.packet.dimension,
      grid: 'sync',
      solves: 0,
      computeMs: 0,
    };
    state.onStrike?.(state.telemetry);
  }

  function fireStrike() {
    // Restrike: cheap re-flash of the previous channel (no DBM recompute), giving
    // the rapid flicker real bolts have without hammering the worker.
    if (state.restrikesLeft > 0 && state.lastBolt) {
      state.restrikesLeft -= 1;
      state.bolts.push({ points: state.lastBolt.points, branches: state.lastBolt.branches, life: 1 });
      if (state.bolts.length > 16) state.bolts.shift();
      if (state.lastBolt.cloud) state.lastBolt.cloud.charge = 1;
      return;
    }

    const cloud = pickCloud();
    if (!cloud) return;

    const puff = cloud.puffs[Math.floor(rng() * cloud.puffs.length)];
    const origin = { x: cloud.x + puff.dx, y: cloud.y + puff.dy };
    state.strikeCount += 1;

    if (!worker) {
      fireStrikeSync(cloud, origin);
      return;
    }
    // Busy-guard: never queue a backlog — drop the strike if the solver is busy.
    if (workerBusy) return;

    // DBM region: a square centred on the strike point so the discharge bursts
    // *within* the cumulous mass. Grid resolution + growth steps scale with
    // intensity — this is the TurboQuant stress dial.
    const half = cloud.radius * (state.variant === 'orb' ? 2.6 : 3.2);
    const region = { x: origin.x - half, y: origin.y - half, w: half * 2, h: half * 2 };
    const grid = state.variant === 'orb'
      ? clamp(Math.round(48 + state.intensity * 18), 40, 110)
      : clamp(Math.round(64 + state.intensity * 28), 56, 160);
    const steps = state.variant === 'orb'
      ? clamp(Math.round(60 * state.intensity), 40, 180)
      : clamp(Math.round(95 * state.intensity), 60, 260);
    const seed = (Math.floor(state.clock * 1000) ^ Math.imul(state.strikeCount, 2654435761)) >>> 0;

    const stellarCoords = [];
    if (state.galaxy && state.galaxy.particles) {
      const centerX = state.galaxy.centerX;
      const centerY = state.galaxy.centerY;
      const stars = state.galaxy.particles.filter((p) => p.type === 'star');
      stars.sort((a, b) => {
        const distA = Math.hypot(a.x + centerX - origin.x, a.y + centerY - origin.y);
        const distB = Math.hypot(b.x + centerX - origin.x, b.y + centerY - origin.y);
        return distA - distB;
      });
      stars.slice(0, 5).forEach((star) => {
        stellarCoords.push({
          x: star.x + centerX,
          y: star.y + centerY,
          emphasis: 0.3 + (star.mass / 2) * 0.4,
          color: star.color || '#fffdf0'
        });
      });
    }

    workerBusy = true;
    const id = state.strikeCount;
    pending.set(id, cloud);
    worker.postMessage({
      id,
      cloudId: id,
      dim: clamp(Math.round(steps * 4), 64, 4096),
      jitter: cloud.radius * 0.05,
      dbm: { gridW: grid, gridH: grid, steps, eta: 1.0, sweeps: 16, region, seed },
      stellarCoords,
    });
  }

  function triggerWandStrike(x, y) {
    const cloud = pickCloud() || { radius: 100, x, y: y - 50, puffs: [{ dx: 0, dy: 0 }] };
    const origin = { x, y };
    state.strikeCount += 1;

    const end = {
      x: state.width / 2 + rand(-40, 40),
      y: state.height * 0.44 + rand(-40, 40),
    };

    let route = null;
    try {
      const retinaInput = stellarStrikeInput(state.galaxy, origin, end, state.width, state.height, state.strikeCount, state.clock);
      route = routeRetinaPacketToPhotonicBridge(retinaInput, {
        retina: { targetDimension: packetDimension(), bitWidth: 4 },
        bridge: { mode: 'shadow' },
        previousPacket: state.lastPacket,
      });
    } catch {
      route = null;
    }
    if (!route || !route.packet) return;
    const optical = route.opticalSimulation || {};
    const phase = optical.phaseBuckets || { forward: 0, inverted: 0, dark: 0 };
    const phaseTotal = (phase.forward + phase.inverted + phase.dark) || 1;
    const bolt = generateBoltFromPacket(route.packet, origin, end, {
      detail: state.variant === 'orb' ? 5 : 6,
      displacement: 0.2 + (phase.inverted / phaseTotal) * 0.22,
      branchChance: 0.16 + (Number(optical.opticalFit) || 0) * 0.3,
    });
    state.bolts.push({ ...bolt, life: 1 });
    if (state.bolts.length > 24) state.bolts.shift();
    cloud.charge = 1.3;
    state.lastPacket = route.packet;
    state.telemetry = {
      grade: route.bridgeReport?.compatibilityGrade || '—',
      score: Number(route.bridgeReport?.compatibilityScore) || 0,
      opticalFit: Number(optical.opticalFit) || 0,
      dim: route.packet.dimension,
      sites: route.packet.dimension,
      grid: 'sync-wand',
      solves: 0,
      computeMs: 0,
    };
    state.onStrike?.(state.telemetry);
  }

  function dispose() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    pending.clear();
  }

  function scheduleNext() {
    if (state.restrikesLeft > 0) {
      state.nextStrikeIn = rand(0.05, 0.14); // rapid same-channel flicker
    } else {
      // Long, randomized quiet between strikes — realistic lightning cadence.
      const calm = state.variant === 'orb' ? rand(3, 8) : rand(5, 15);
      state.nextStrikeIn = calm / (0.8 + state.intensity * 0.2);
    }
    state.sinceStrike = 0;
  }

  // ── public API ────────────────────────────────────────────────────────────

  function resize(width, height) {
    state.width = Math.max(1, width);
    state.height = Math.max(1, height);
    state.clouds = buildCloudField(state.width, state.height, state.intensity, state.variant);
    for (const cloud of state.clouds) cloud.sprite = createCloudSprite(cloud);

    if (!state.galaxy) {
      state.galaxy = initGalaxy(state.width, state.height);
    } else {
      state.galaxy.centerX = state.width / 2;
      state.galaxy.centerY = state.height * 0.44;
    }

    scheduleNext();
  }

  function update(dt) {
    state.clock += dt;
    state.fps = dt > 0 ? state.fps * 0.9 + (1 / dt) * 0.1 : state.fps;

    state.sinceStrike += dt;
    if (state.sinceStrike >= state.nextStrikeIn) {
      fireStrike();
      scheduleNext();
    }

    if (state.mouseActive) {
      if (state.wandX === 0 && state.wandY === 0) {
        state.wandX = state.mouseX;
        state.wandY = state.mouseY;
      } else {
        state.wandX += (state.mouseX - state.wandX) * 0.14;
        state.wandY += (state.mouseY - state.wandY) * 0.14;
      }

      if (state.galaxy && rng() < 0.65) {
        const angle = Math.atan2((state.height * 0.44) - state.wandY, (state.width / 2) - state.wandX);
        const tipX = state.wandX;
        const tipY = state.wandY;
        const centerX = state.galaxy.centerX;
        const centerY = state.galaxy.centerY;

        const species = rng() < 0.4 ? 'h-alpha' : rng() < 0.7 ? 'oIII' : 'sulfur';
        const color = species === 'h-alpha' ? 'rgba(255, 20, 147, ' : species === 'oIII' ? 'rgba(0, 245, 255, ' : 'rgba(255, 69, 0, ';

        state.galaxy.particles.push({
          type: 'sparkle',
          x: tipX - centerX,
          y: tipY - centerY,
          vx: Math.cos(angle + Math.PI + rand(-0.4, 0.4)) * rand(30, 75),
          vy: Math.sin(angle + Math.PI + rand(-0.4, 0.4)) * rand(30, 75),
          mass: 0.05,
          size: rand(1.1, 2.3),
          color,
          life: 0.8
        });
      }
    }

    if (state.galaxy) {
      state.galaxy.particles = state.galaxy.particles.filter(p => p.type !== 'sparkle' || p.life > 0);
      for (const p of state.galaxy.particles) {
        if (p.type === 'sparkle') {
          p.life -= dt;
          const baseColor = p.color;
          p.drawColor = `${baseColor}${p.life})`;
        }
      }
      updateGalaxy(state.galaxy, dt);
    }

    const cloudFade = Math.exp(-dt / CLOUD_DECAY);
    const band = state.variant === 'orb' ? state.height * 0.9 : state.height * 0.62;
    for (const cloud of state.clouds) {
      cloud.charge *= cloudFade;

      // Parked off-screen between crossings — the randomized gap interval.
      if (cloud.respawn > 0) {
        cloud.respawn -= dt;
        continue;
      }

      cloud.x += cloud.vx * dt;
      cloud.y = cloud.baseY + Math.sin(state.clock * cloud.bobFreq + cloud.bobPhase) * cloud.bobAmp;

      const exited = cloud.vx > 0
        ? cloud.x - cloud.margin > state.width
        : cloud.x + cloud.margin < 0;
      if (exited) {
        const dir = cloud.vx >= 0 ? 1 : -1;
        cloud.x = dir > 0 ? -cloud.margin : state.width + cloud.margin;
        cloud.baseY = rand(state.height * 0.06, band);
        cloud.vx = dir * cloudSpeed(cloud.radius, state.height);
        cloud.bobPhase = rand(0, Math.PI * 2);
        cloud.respawn = rand(2, 10); // randomized interval before it drifts back in
      }
    }

    const boltFade = dt / BOLT_LIFE;
    for (const bolt of state.bolts) bolt.life -= boltFade;
    state.bolts = state.bolts.filter((bolt) => bolt.life > 0);
  }

  function drawCloud(ctx, cloud) {
    // Inside the orb the resting puff stack reads as an ugly smudge through the
    // glass (screen blend), so there we render only the strike flash + bolts.
    if (cloud.sprite && state.variant !== 'orb') {
      const { canvas, c } = cloud.sprite;
      ctx.drawImage(canvas, cloud.x - c, cloud.y - c);
      // re-add the cached puff stack, weighted by charge, to brighten from within
      if (cloud.charge > 0.02) {
        ctx.globalAlpha = Math.min(1, cloud.charge * 0.7);
        ctx.drawImage(canvas, cloud.x - c, cloud.y - c);
        ctx.globalAlpha = 1;
      }
    }
    // internal burst — hot core flash when freshly struck
    if (cloud.charge > 0.02) {
      const flash = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.radius * 1.4);
      flash.addColorStop(0, `rgba(191, 227, 255, ${0.6 * cloud.charge})`);
      flash.addColorStop(0.4, `rgba(123, 108, 255, ${0.28 * cloud.charge})`);
      flash.addColorStop(1, 'rgba(123, 108, 255, 0)');
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function strokePolyline(ctx, points, lineWidth, color, alpha, blur) {
    if (points.length < 2 || alpha <= 0) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = blur;
    ctx.shadowColor = blur > 0 ? color : 'transparent';
    ctx.stroke();
  }

  function drawBolt(ctx, bolt) {
    const a = Math.max(0, bolt.life);
    // halo (blurred) → mid glow → white-hot core
    // Glow is built from stacked translucent strokes (additive 'lighter' blend),
    // NOT shadowBlur — shadowBlur forces a per-frame software blur pass that
    // knocks the canvas off the GPU path and makes motion choppy.
    strokePolyline(ctx, bolt.points, 10, AMETHYST, a * 0.13, 0);
    strokePolyline(ctx, bolt.points, 5, AMETHYST, a * 0.26, 0);
    strokePolyline(ctx, bolt.points, 2.6, ARC, a * 0.85, 0);
    strokePolyline(ctx, bolt.points, 1.1, '#ffffff', a, 0);
    for (const branch of bolt.branches) {
      strokePolyline(ctx, branch.points, 4.5, AMETHYST, a * 0.14, 0);
      strokePolyline(ctx, branch.points, 1.8, ARC, a * 0.6, 0);
      strokePolyline(ctx, branch.points, 0.7, '#ffffff', a * 0.85, 0);
    }
  }

  function paint(ctx) {
    if (state.galaxy) {
      if (!state.skipGalaxyPlate) {
        drawGalaxyPlate(ctx, state.galaxy);
      }
      drawGalaxySparkles(ctx, state.galaxy);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const cloud of state.clouds) drawCloud(ctx, cloud);
    for (const bolt of state.bolts) drawBolt(ctx, bolt);

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();

    if (state.mouseActive) {
      ctx.save();
      const centerX = state.width / 2;
      const centerY = state.height * 0.44;
      const angle = Math.atan2(centerY - state.wandY, centerX - state.wandX);

      const len = 46;
      const baseX = state.wandX - Math.cos(angle) * len;
      const baseY = state.wandY - Math.sin(angle) * len;

      ctx.lineCap = 'round';
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(123, 108, 255, 0.35)';

      // Rod
      ctx.strokeStyle = '#12101e';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(state.wandX, state.wandY);
      ctx.stroke();

      // Wrap filigree
      ctx.strokeStyle = 'rgba(191, 227, 255, 0.8)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const px = baseX + (state.wandX - baseX) * t + Math.cos(t * Math.PI * 4 + state.clock * 2) * 1.8;
        const py = baseY + (state.wandY - baseY) * t + Math.sin(t * Math.PI * 4 + state.clock * 2) * 1.8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Gem tip radial gradient glow
      const tipGrad = ctx.createRadialGradient(state.wandX, state.wandY, 0, state.wandX, state.wandY, 7);
      tipGrad.addColorStop(0, '#ffffff');
      tipGrad.addColorStop(0.3, '#7b6cff');
      tipGrad.addColorStop(0.7, 'rgba(191, 227, 255, 0.25)');
      tipGrad.addColorStop(1, 'rgba(123, 108, 255, 0)');
      ctx.fillStyle = tipGrad;
      ctx.beginPath();
      ctx.arc(state.wandX, state.wandY, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    if (state.debug) {
      const t = state.telemetry;
      ctx.save();
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(191, 227, 255, 0.85)';
      ctx.fillText(`fps ${state.fps.toFixed(0)}  bolts ${state.bolts.length}  clouds ${state.clouds.length}  strikes ${state.strikeCount}`, 10, 16);
      ctx.fillText(`DBM ${t.grid}  sites ${t.sites}  solves ${t.solves}  ${t.computeMs}ms`, 10, 30);
      ctx.fillText(`TurboQuant ${t.grade}  fit ${t.opticalFit.toFixed(2)}  dim ${t.dim}`, 10, 44);
      ctx.restore();
    }
  }

  function render(ctx) {
    ctx.clearRect(0, 0, state.width, state.height);
    paint(ctx);
  }

  function renderStatic(ctx) {
    // reduced-motion: a single calm frame with one resting cloud charge
    ctx.clearRect(0, 0, state.width, state.height);
    if (state.clouds[0]) state.clouds[0].charge = 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const cloud of state.clouds) drawCloud(ctx, cloud);
    ctx.restore();
  }

  function setIntensity(value) {
    state.intensity = value;
  }

  const setMousePosition = (x, y) => {
    state.mouseX = x;
    state.mouseY = y;
    state.mouseActive = true;
  };

  return {
    resize,
    update,
    render,
    renderStatic,
    setIntensity,
    dispose,
    getTelemetry: () => state.telemetry,
    setMousePosition,
    triggerWandStrike
  };
}
