// Generates a segmented humanoid character model — one SCDL part per limb
// segment, ready to be driven by the FK rig in src/game/combat/armRig.js —
// and compiles each to PNG via the SCDL CLI. Run: npm run assets:charmodel
//
// Geometry comes from humanoid-proportion-canon.js (landmark fractions, not
// pixel constants), shading from pixel-art-shaders.js (tube vs mass), and the
// hues from the RAMPS below, so a new character is a palette swap rather than
// a redraw.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveCanon,
  JOINT_OVERLAP as OV,
} from '../codex/core/pixelbrain/humanoid-proportion-canon.js';
import { shadeCylinder, shadeMass } from '../codex/core/pixelbrain/pixel-art-shaders.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'assets', 'ASSETS', 'Character model');
const cli = join(root, 'codex', 'core', 'pixelbrain', 'scdl', 'scdl.cli.js');

const CANVAS = { width: 32, height: 48 };
const FIGURE = { top: 2, height: 44, centerX: 16 };

/** Subject palette. Value structure is the shader's; hue is the character's. */
const RAMPS = {
  robe: { void: '#0A0210', deep: '#1A0526', body: '#2D0638', frost: '#5C1450', hi: '#842176' },
  skin: { void: '#4A1F05', deep: '#7E390B', body: '#BC5D1E', frost: '#C97135', hi: '#E0904A' },
  hair: { void: '#0A0A0A', deep: '#161616', body: '#2B2B2B', frost: '#55524F', hi: '#8D8B8A' },
  boot: { void: '#050505', deep: '#0F0F0F', body: '#1F1B18', frost: '#332A22', hi: '#4A3A2C' },
};
const GOLD = { base: '#F3DD2E', hi: '#FAFDDF' };
const EYE = { dark: '#1A0526', white: '#F0E4D0' };

const C = resolveCanon(FIGURE);
const { y, width, joints } = C;

/** Tapered vertical capsule, extended OV past both joints. */
function capsule(cx, y0, y1, w0, w1) {
  const cells = [];
  const top = y0 - OV;
  const bot = y1 + OV;
  for (let yy = top; yy <= bot; yy += 1) {
    const t = (yy - top) / Math.max(1, bot - top);
    const w = Math.max(1, Math.round(w0 + (w1 - w0) * t));
    const x0 = Math.round(cx - (w - 1) / 2);
    for (let i = 0; i < w; i += 1) cells.push({ x: x0 + i, y: yy });
  }
  return cells;
}

function headShape() {
  const cx = FIGURE.centerX;
  const w = width.head;
  const cells = [];
  for (let yy = y.crown; yy <= y.chin; yy += 1) {
    const t = (yy - y.crown) / (y.chin - y.crown);
    let ww = w;
    if (t < 0.15) ww = w - 4;
    else if (t < 0.3) ww = w - 2;
    else if (t > 0.85) ww = w - 4;
    else if (t > 0.7) ww = w - 2;
    const x0 = Math.round(cx - (ww - 1) / 2);
    for (let i = 0; i < ww; i += 1) cells.push({ x: x0 + i, y: yy });
  }
  return cells;
}

function neckShape() {
  const cx = FIGURE.centerX;
  const cells = [];
  for (let yy = y.chin; yy <= y.shoulder; yy += 1) {
    for (let i = -1; i <= 1; i += 1) cells.push({ x: cx + i, y: yy });
  }
  return cells;
}

function hairShape() {
  const cx = FIGURE.centerX;
  const w = width.head;
  const cells = [];
  for (let yy = y.crown; yy <= y.crown + 3; yy += 1) {
    const t = (yy - y.crown) / 3;
    const ww = t < 0.34 ? w - 4 : t < 0.67 ? w - 2 : w;
    const x0 = Math.round(cx - (ww - 1) / 2);
    for (let i = 0; i < ww; i += 1) cells.push({ x: x0 + i, y: yy });
  }
  return cells;
}

function torsoShape() {
  const cx = FIGURE.centerX;
  const cells = [];
  for (let yy = y.shoulder - OV; yy <= y.crotch + OV; yy += 1) {
    let w;
    if (yy <= y.waist) {
      const t = (yy - (y.shoulder - OV)) / Math.max(1, y.waist - (y.shoulder - OV));
      w = Math.round(width.shoulders + (width.waist - width.shoulders) * t);
    } else {
      const t = (yy - y.waist) / Math.max(1, y.crotch + OV - y.waist);
      w = Math.round(width.waist + (width.hips - width.waist) * t);
    }
    const x0 = Math.round(cx - (w - 1) / 2);
    for (let i = 0; i < w; i += 1) cells.push({ x: x0 + i, y: yy });
  }
  return cells;
}

function footShape(side) {
  const ax = joints[side === 'L' ? 'ankleL' : 'ankleR'].x;
  const len = width.foot;
  // Toes lead outward from the ankle, mirrored per side, so the two soles
  // splay apart instead of both pointing screen-left into each other.
  const toeX = side === 'L' ? ax - len + 2 : ax - 1;
  const cells = [];
  for (let yy = y.ankle - OV; yy <= y.sole - 2; yy += 1) {
    for (let i = -1; i <= 1; i += 1) cells.push({ x: ax + i, y: yy });
  }
  for (let yy = y.sole - 1; yy <= y.sole; yy += 1) {
    for (let i = 0; i < len; i += 1) cells.push({ x: toeX + i, y: yy });
  }
  return cells;
}

function headPainted() {
  const out = [];
  out.push(...shadeMass(headShape(), RAMPS.skin));
  out.push(...neckShape().map((c) => ({ ...c, color: RAMPS.skin.deep })));
  out.push(...shadeMass(hairShape(), RAMPS.hair));
  const eyeY = Math.round(y.crown + (y.chin - y.crown) * 0.52);
  out.push({ x: 13, y: eyeY, color: EYE.dark }, { x: 14, y: eyeY, color: EYE.white });
  out.push({ x: 18, y: eyeY, color: EYE.dark }, { x: 17, y: eyeY, color: EYE.white });
  return out;
}

function torsoPainted() {
  const painted = shadeCylinder(torsoShape(), RAMPS.robe);
  const map = new Map(painted.map((c) => [`${c.x},${c.y}`, c]));
  const bw = width.waist;
  const x0 = Math.round(FIGURE.centerX - (bw - 1) / 2);
  for (let i = 0; i < bw; i += 1) {
    const cell = map.get(`${x0 + i},${y.waist}`);
    if (cell) cell.color = i === 1 ? GOLD.hi : GOLD.base;
  }
  return [...map.values()];
}

const PARTS = {
  'head model/head': ['Head', 'head', headPainted()],
  'torso model/torso': ['Torso', 'torso', torsoPainted()],

  'arms model/armL-upper': ['ArmLUpper', 'armL_upper',
    shadeCylinder(capsule(joints.shoulderL.x, y.shoulder, y.elbow, width.upperArm, width.upperArm), RAMPS.robe)],
  'arms model/armL-fore': ['ArmLFore', 'armL_fore',
    shadeCylinder(capsule(joints.elbowL.x, y.elbow, y.wrist, width.foreArm, width.foreArm), RAMPS.robe)],
  'arms model/armL-hand': ['ArmLHand', 'armL_hand',
    shadeCylinder(capsule(joints.wristL.x, y.wrist, y.fingertip, width.hand, width.hand - 1), RAMPS.skin)],
  'arms model/armR-upper': ['ArmRUpper', 'armR_upper',
    shadeCylinder(capsule(joints.shoulderR.x, y.shoulder, y.elbow, width.upperArm, width.upperArm), RAMPS.robe)],
  'arms model/armR-fore': ['ArmRFore', 'armR_fore',
    shadeCylinder(capsule(joints.elbowR.x, y.elbow, y.wrist, width.foreArm, width.foreArm), RAMPS.robe)],
  'arms model/armR-hand': ['ArmRHand', 'armR_hand',
    shadeCylinder(capsule(joints.wristR.x, y.wrist, y.fingertip, width.hand, width.hand - 1), RAMPS.skin)],

  'legs model/legL-thigh': ['LegLThigh', 'legL_thigh',
    shadeCylinder(capsule(joints.hipL.x, y.crotch, y.knee, width.thigh, width.shin + 1), RAMPS.robe)],
  'legs model/legL-shin': ['LegLShin', 'legL_shin',
    shadeCylinder(capsule(joints.kneeL.x, y.knee, y.ankle, width.shin + 1, width.shin), RAMPS.robe)],
  'legs model/legL-foot': ['LegLFoot', 'legL_foot',
    shadeCylinder(footShape('L'), RAMPS.boot, { specular: false })],
  'legs model/legR-thigh': ['LegRThigh', 'legR_thigh',
    shadeCylinder(capsule(joints.hipR.x, y.crotch, y.knee, width.thigh, width.shin + 1), RAMPS.robe)],
  'legs model/legR-shin': ['LegRShin', 'legR_shin',
    shadeCylinder(capsule(joints.kneeR.x, y.knee, y.ankle, width.shin + 1, width.shin), RAMPS.robe)],
  'legs model/legR-foot': ['LegRFoot', 'legR_foot',
    shadeCylinder(footShape('R'), RAMPS.boot, { specular: false })],
};

for (const dir of ['head model', 'torso model', 'arms model', 'legs model']) {
  mkdirSync(join(outRoot, dir), { recursive: true });
}

for (const [rel, [assetSuffix, partId, painted]] of Object.entries(PARTS)) {
  const dedup = new Map();
  for (const c of painted) dedup.set(`${c.x},${c.y}`, c);
  const cells = [...dedup.values()];

  const names = new Map();
  [...new Set(cells.map((c) => c.color.toUpperCase()))]
    .sort()
    .forEach((hex, i) => names.set(hex, `t${i + 1}`));

  const palette = [...names.entries()].map(([hex, n]) => `  ${n.padEnd(4)} = ${hex}`).join('\n');
  const ops = cells.map((c) => `  cell ${c.x} ${c.y} ${names.get(c.color.toUpperCase())}`).join('\n');
  const name = rel.split('/')[1];

  const scdl = `# ${name}.scdl — GENERATED by scripts/build-character-model.mjs. Do not hand-edit.
# Geometry: humanoid-proportion-canon.js (${C.headCount} heads tall).
# Shading:  pixel-art-shaders.js — cylindrical across the cross-section for
#           tube forms, radial for the head mass, on the subject's own ramp.
# Drawn in shared ${CANVAS.width}x${CANVAS.height} canvas space at rest position; the FK rig in
# src/game/combat/armRig.js positions it. Joint capsule overlap is ${OV}px past
# each pivot so a rotating joint cannot open a gap.

asset Photo1${assetSuffix} canvas ${CANVAS.width}x${CANVAS.height}

palette {
${palette}
}

part ${partId} material void_cloth {
${ops}
}
export json png
`;

  const path = join(outRoot, `${rel}.scdl`);
  writeFileSync(path, scdl);
  execFileSync('node', [cli, 'compile', path, '--export', 'json,png'], { stdio: 'pipe' });
  console.log(`[charmodel] ${name.padEnd(12)} ${String(cells.length).padStart(3)} cells  ${names.size} tones`);
}

console.log(`[charmodel] done — ${Object.keys(PARTS).length} parts, ${C.headCount} heads tall`);
