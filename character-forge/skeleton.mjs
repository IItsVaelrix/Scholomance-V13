/**
 * Fixed chibi skeleton + part builders for the Fairly Odd Wand → PixelBrain pipeline.
 *
 * WHY THIS EXISTS: the foundry sets `skeleton: null` and places composite children by
 * hand-tuned anchors, which produces floating limbs and disjointed anatomy (the classic
 * "AI has no skeletal logic" failure). This module pins a proportional rig and derives
 * every part from it, so anatomy is consistent across characters.
 *
 * TECHNIQUE: every part is emitted as a FULL-CANVAS child (anchor {0.5,0.5}, size {1,1}).
 * With that anchor+size the foundry's offset math is exactly zero, so the geometry we
 * write is in absolute canvas pixels — no anchor drift, pixel-perfect placement.
 *
 * ROLE RULES baked in (from character-foundry.js):
 *   - Fills (solid silhouette): head, body, robe, boots, leftEye, rightEye, mouth
 *   - Everything else strokes (hair, *Arm, *Leg, staff, sigil...)
 *   - Palette is keyed by EXACT partId: head/body→skin, hair→hair mat, leftEye/rightEye→eyes,
 *     robe→void-cloth, boots→leather. Use these names to get the intended color.
 *
 * ORDERING RULE (critical): the foundry shares ONE `seen` set across roles, so the first
 * part to claim a pixel wins and later parts are skipped there. Therefore the parts array
 * is FRONT-TO-BACK: list frontmost first (eyes/hair before head, head before robe, robe
 * before the arms it tucks over). Getting this backwards makes face details disappear.
 */

const FULL = { anchor: { x: 0.5, y: 0.5 }, size: { w: 1, h: 1 } };

export function skeleton(W = 96, H = 96) {
  const cx = 0.50 * W;
  const crownY = 0.10 * H;
  const eyeY = 0.30 * H;
  const chinY = 0.45 * H;
  const shoulderY = 0.51 * H;
  const hipY = 0.66 * H;
  const hemY = 0.95 * H;
  const headHalfW = 0.16 * W;
  const hemHalfW = 0.29 * W;

  return {
    W, H, cx,
    crownY, eyeY, chinY, shoulderY, hipY, hemY,
    headHalfW, hemHalfW,
    shoulderX: [0.36 * W, 0.64 * W],
    handXY:    [[0.28 * W, 0.72 * H], [0.72 * W, 0.72 * H]],

    // Canonical Skeleton Manifold (SCDNA-v1)
    head: { top: { x: cx, y: crownY }, center: { x: cx, y: (crownY + chinY) / 2 }, chin: { x: cx, y: chinY } },
    face: {
      eyeLeft:  { x: cx - headHalfW * 0.42, y: eyeY },
      eyeRight: { x: cx + headHalfW * 0.42, y: eyeY },
      nose:     { x: cx, y: eyeY + 0.05 * H },
      mouth:    { x: cx, y: eyeY + 0.09 * H },
      earL:     { x: cx - headHalfW, y: eyeY },
      earR:     { x: cx + headHalfW, y: eyeY }
    },
    torso: {
      shoulderL: { x: 0.36 * W, y: shoulderY },
      shoulderR: { x: 0.64 * W, y: shoulderY },
      hipL:      { x: 0.40 * W, y: hipY },
      hipR:      { x: 0.60 * W, y: hipY }
    },
    legs: {
      kneeL:  { x: 0.40 * W, y: 0.80 * H },
      kneeR:  { x: 0.60 * W, y: 0.80 * H },
      ankleL: { x: 0.40 * W, y: 0.95 * H },
      ankleR: { x: 0.60 * W, y: 0.95 * H }
    }
  };
}

// ── Part builders — each returns one full-canvas composite child ────────────────

/** Rounded oval head, crown→chin. Fills (skin). */
export function head(sk, { role = 'head', n = 14 } = {}) {
  const ccy = (sk.crownY + sk.chinY) / 2;
  const rx = sk.headHalfW;
  const ry = (sk.chinY - sk.crownY) / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: round(sk.cx + rx * Math.cos(a)), y: round(ccy + ry * Math.sin(a)) });
  }
  return { role, ...FULL, formula: { type: 'edge_trace', tracePath: pts } };
}

/** Small diamond eye. Fills (eye material). partId must be leftEye/rightEye. */
export function eye(sk, side = 'left', { r = 3, dy = 0 } = {}) {
  const pt = side === 'left' ? sk.face.eyeLeft : sk.face.eyeRight;
  const x = pt.x;
  const y = pt.y + dy;
  const role = side === 'left' ? 'leftEye' : 'rightEye';
  return {
    role, ...FULL,
    formula: { type: 'edge_trace', tracePath: [
      { x: round(x), y: round(y - r) }, { x: round(x + r), y: round(y) },
      { x: round(x), y: round(y + r) }, { x: round(x - r), y: round(y) },
    ] },
  };
}

/** Nose derived from joint manifold. Fills (skin). */
export function nose(sk, { r = 1.5, dy = 0 } = {}) {
  const pt = sk.face.nose;
  const x = pt.x;
  const y = pt.y + dy;
  return {
    role: 'nose', ...FULL,
    formula: { type: 'edge_trace', tracePath: [
      { x: round(x), y: round(y - r) }, { x: round(x + r), y: round(y) },
      { x: round(x), y: round(y + r) }, { x: round(x - r), y: round(y) },
    ] },
  };
}

/** Mouth derived from joint manifold. Fills (skin/dark). */
export function mouth(sk, { width = 4, dy = 0 } = {}) {
  const pt = sk.face.mouth;
  const x = pt.x;
  const y = pt.y + dy;
  return {
    role: 'mouth', ...FULL,
    formula: { type: 'mathematical_stroke', parameters: {
      cx: round(x), cy: round(y), length: width, angle: 0,
      baseWidth: 1, widthVariation: 0, frequency: 0, density: 1, bleed: 0, n: 5
    } },
  };
}

/** Tousled fringe hugging the crown. Strokes (hair material). One path = no stray joins. */
export function hair(sk, { role = 'hair', teeth = 5, drop = 0.10 } = {}) {
  const halfW = sk.headHalfW * 1.16;
  const topY = sk.crownY - 1;                                   // spikes rise above the crown
  const lowY = sk.crownY + sk.headHalfW * (2 * drop + 0.7);     // valleys dip onto the forehead
  const pts = [];
  const span = halfW * 2;
  const steps = teeth * 2;
  for (let i = 0; i <= steps; i++) {
    const x = sk.cx - halfW + (span * i) / steps;
    const y = i % 2 === 0 ? lowY : topY;   // valley / spike
    pts.push({ x: round(x), y: round(y) });
  }
  return { role, ...FULL, formula: { type: 'edge_trace', tracePath: pts } };
}

/** Flared robe, shoulders→hem. Fills (void-cloth). */
export function robe(sk, { role = 'robe' } = {}) {
  const [slx, srx] = [sk.shoulderX[0] + 2, sk.shoulderX[1] - 2];
  const midY = (sk.shoulderY + sk.hemY) / 2;
  const pts = [
    { x: slx, y: sk.shoulderY }, { x: srx, y: sk.shoulderY },
    { x: sk.cx + sk.headHalfW * 0.95, y: midY },
    { x: sk.cx + sk.hemHalfW, y: sk.hemY }, { x: sk.cx - sk.hemHalfW, y: sk.hemY },
    { x: sk.cx - sk.headHalfW * 0.95, y: midY },
  ].map(p => ({ x: round(p.x), y: round(p.y) }));
  return { role, ...FULL, formula: { type: 'edge_trace', tracePath: pts } };
}

/**
 * A limb derived from two skeleton points — ALWAYS attaches at `from` and reaches `to`.
 * Strokes with organic taper (widthVariation). Use role leftArm/rightArm/leftLeg/rightLeg.
 */
export function limb(from, to, { role = 'leftArm', baseWidth = 5, widthVariation = 0.45 } = {}) {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    role, ...FULL,
    formula: { type: 'mathematical_stroke', parameters: {
      cx: round(mx), cy: round(my), length: round(length), angle: round(angle),
      baseWidth, widthVariation, frequency: 0.35, density: 1.3, bleed: 0.25, n: 26,
    } },
  };
}

/** Vertical held staff next to a hand. Strokes. */
export function staff(sk, { role = 'staff', side = 1, baseWidth = 2.6 } = {}) {
  const x = side > 0 ? sk.handXY[1][0] + 4 : sk.handXY[0][0] - 4;
  const topY = sk.crownY + 2, botY = sk.hemY;
  return {
    role, ...FULL,
    formula: { type: 'mathematical_stroke', parameters: {
      cx: round(x), cy: round((topY + botY) / 2), length: round(botY - topY),
      angle: 90, baseWidth, widthVariation: 0.1, frequency: 0.2, density: 1.0, bleed: 0.2, n: 30,
    } },
  };
}

/** Floating sigil ring. Strokes. */
export function sigilRing(cx, cy, radius, { role = 'sigil', n = 40 } = {}) {
  return { role, ...FULL, formula: { type: 'parametric_curve', parameters: { cx: round(cx), cy: round(cy), a: radius, b: 0.1, c: 0, n } } };
}

/** Assemble parts into a composite proposal (proposedFormula shape). */
export function composeCharacter(role, material, children) {
  return { role, material, formula: { type: 'composite', children } };
}

function round(v) { return Math.round(v * 100) / 100; }
