/**
 * Procedural tuning-fork trees for the Polaris Sonic Thaumaturgist Forest.
 * L-system branching + metal prongs with teal leaf clusters; subtle resonance vibration.
 */

const FORK = Object.freeze({
  metalShine: 0xd4c4a0,
  metalLit: 0xa08050,
  metalCore: 0x6a5030,
  leafBright: 0x66ffcc,
  leafMid: 0x44e8c0,
  leafDeep: 0x22aacc,
  glow: 0x88eeff,
});

const DEFAULT_LSYSTEM = Object.freeze({
  axiom: 'T',
  rules: Object.freeze({
    T: 'F[+F][-F]',
    F: 'FF',
  }),
  angle: 28,
  depth: 4,
});

/**
 * Lindenmayer expansion for tuning-fork branch topology.
 *
 * @param {number} seed
 * @param {{ leanX?: number, leanY?: number, depth?: number }} [options]
 */
export function generateTuningForkLSystem(seed, options = {}) {
  const leanX = options.leanX ?? 0;
  const leanY = options.leanY ?? -0.15;
  const depth = options.depth ?? DEFAULT_LSYSTEM.depth;
  let state = DEFAULT_LSYSTEM.axiom;

  let hash = (seed >>> 0) || 1;
  const rng = () => {
    hash = (hash + 0x6D2B79F5) >>> 0;
    let output = hash;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < depth; i += 1) {
    let next = '';
    for (const symbol of state) {
      next += DEFAULT_LSYSTEM.rules[symbol] ?? symbol;
    }
    state = next;
  }

  const segments = [];
  const leafClusters = [];
  const stack = [];
  let x = 0;
  let y = 42;
  let angle = -90 + leanX * 18;
  const step = 7.5;
  const angleJitter = (rng() - 0.5) * 6;

  for (const symbol of state) {
    if (symbol === 'F') {
      const rad = (angle * Math.PI) / 180;
      const nx = x + Math.cos(rad) * step;
      const ny = y + Math.sin(rad) * step;
      segments.push({ x1: x, y1: y, x2: nx, y2: ny, width: 2.2 - stack.length * 0.15 });
      x = nx;
      y = ny;
    } else if (symbol === '+') {
      angle += DEFAULT_LSYSTEM.angle + angleJitter + leanX * 8;
    } else if (symbol === '-') {
      angle -= DEFAULT_LSYSTEM.angle + angleJitter + leanX * 8;
    } else if (symbol === '[') {
      stack.push({ x, y, angle });
    } else if (symbol === ']') {
      const restore = stack.pop();
      if (restore) {
        leafClusters.push({
          x: x + leanX * 3,
          y: y + leanY * 4,
          r: 3.5 + rng() * 2.5,
        });
        x = restore.x;
        y = restore.y;
        angle = restore.angle;
      }
    } else if (symbol === 'T') {
      angle += leanY * 10;
    }
  }

  if (leafClusters.length < 3) {
    leafClusters.push(
      { x: -10, y: -40, r: 5 },
      { x: 10, y: -40, r: 5 },
      { x: 0, y: -18, r: 4 },
    );
  }

  return Object.freeze({
    segments: Object.freeze(segments.map((s) => Object.freeze(s))),
    leafClusters: Object.freeze(leafClusters.map((l) => Object.freeze(l))),
  });
}

/**
 * Draws one tuning-fork tree into a Phaser graphics object (local coords).
 *
 * @param {import('phaser').GameObjects.Graphics} graphics
 * @param {number} [scale]
 * @param {{ segments?: Array<{ x1: number, y1: number, x2: number, y2: number, width?: number }>, leafClusters?: Array<{ x: number, y: number, r: number }> }} [lSystem]
 */
export function drawTuningForkTreeGraphics(graphics, scale = 1, lSystem = null) {
  graphics.clear();

  const s = scale;
  const spec = lSystem ?? generateTuningForkLSystem(1);

  if (spec.segments.length > 0) {
    for (const segment of spec.segments) {
      graphics.lineStyle((segment.width ?? 2) * s, FORK.metalCore, 1);
      graphics.beginPath();
      graphics.moveTo(segment.x1 * s, segment.y1 * s);
      graphics.lineTo(segment.x2 * s, segment.y2 * s);
      graphics.strokePath();
      graphics.lineStyle(((segment.width ?? 2) * 0.65) * s, FORK.metalShine, 0.85);
      graphics.beginPath();
      graphics.moveTo(segment.x1 * s, segment.y1 * s);
      graphics.lineTo(segment.x2 * s, segment.y2 * s);
      graphics.strokePath();
    }
  } else {
    const baseY = 42 * s;
    graphics.lineStyle(2 * s, FORK.metalCore, 1);
    graphics.fillStyle(FORK.metalLit, 1);
    graphics.beginPath();
    graphics.moveTo(0, baseY);
    graphics.lineTo(0, 8 * s);
    graphics.lineTo(-10 * s, -28 * s);
    graphics.lineTo(-6 * s, -24 * s);
    graphics.lineTo(0, 4 * s);
    graphics.lineTo(6 * s, -24 * s);
    graphics.lineTo(10 * s, -28 * s);
    graphics.lineTo(0, 8 * s);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  graphics.fillStyle(FORK.metalCore, 1);
  graphics.fillEllipse(0, 42 * s + 2 * s, 14 * s, 5 * s);

  for (const leaf of spec.leafClusters) {
    graphics.fillStyle(FORK.leafDeep, 0.85);
    graphics.fillCircle(leaf.x * s, leaf.y * s, leaf.r * s);
    graphics.fillStyle(FORK.leafMid, 0.9);
    graphics.fillCircle((leaf.x - 1) * s, (leaf.y - 1) * s, leaf.r * 0.65 * s);
    graphics.fillStyle(FORK.leafBright, 0.75);
    graphics.fillCircle((leaf.x + 1) * s, leaf.y * s, leaf.r * 0.4 * s);
  }

  graphics.lineStyle(1, FORK.glow, 0.35);
  graphics.strokeEllipse(0, -20 * s, 22 * s, 36 * s);
}

/**
 * @param {import('phaser').Scene} scene
 * @param {{ worldX: number, worldY: number, scale?: number, phase?: number, depth?: number, lSystemSeed?: number, leanX?: number, leanY?: number }} options
 */
export function createTuningForkTree(scene, options = {}) {
  const {
    worldX = 0,
    worldY = 0,
    scale = 1,
    phase = 0,
    depth = 22,
    lSystemSeed = 1,
    leanX = 0,
    leanY = -0.15,
  } = options;

  const lSystem = generateTuningForkLSystem(lSystemSeed, { leanX, leanY });

  const container = scene.add.container(worldX, worldY);
  const graphics = scene.add.graphics();
  drawTuningForkTreeGraphics(graphics, scale, lSystem);
  container.add(graphics);
  container.setDepth(depth);

  const prongTween = scene.tweens.add({
    targets: graphics,
    scaleX: 1.02,
    scaleY: 0.98,
    duration: 900 + phase * 120,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    delay: phase * 200,
  });

  const leafTween = scene.tweens.add({
    targets: graphics,
    alpha: { from: 0.92, to: 1 },
    duration: 1400 + phase * 80,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    delay: 100 + phase * 150,
  });

  return {
    container,
    graphics,
    lSystem,
    tweens: [prongTween, leafTween],
  };
}

/**
 * @param {Array<{ container?: { destroy?: () => void }, tweens?: Array<{ stop?: () => void }> }>} trees
 */
export function destroyTuningForkTrees(trees = []) {
  for (const entry of trees) {
    entry.tweens?.forEach((tween) => tween.stop?.());
    entry.container?.destroy?.();
  }
}