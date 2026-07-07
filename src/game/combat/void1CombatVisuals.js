/**
 * Void1 portal-warden boss visuals — rigged body (body-noArms + jointed arms)
 * with composite sprites for walk/cast/attack motion.
 */

import { VOID1_ANIMATION_MANIFEST, VOID1_BOSS_LABEL } from '../../data/void1Animations.js';
import { VOID1_ARM_RIG, getVoid1Pose } from '../../data/void1RigConfig.js';
import { solveArm } from './armRig.js';

export const VOID1_ASSET_BASE = '/assets/Void1';
export const VOID1_ASSET_FALLBACK_BASE = '/generated-assets/Void1';
export const VOID1_IDLE_TEXTURE = 'void1-idle-f0';
export const VOID1_BODY_IDLE_TEXTURE = 'void1-body-noarms-f0';
export const VOID1_FEET_ORIGIN_Y = 47 / 48;
export const VOID1_DISPLAY_SCALE = 2;
export const VOID1_BOSS_DEPTH = 62;
export const VOID1_CANVAS_W = 32;
export const VOID1_CANVAS_H = 48;
export const VOID1_RIG_ORIGIN = Object.freeze({ x: 16, y: 47 });

export const VOID1_ANIM = Object.freeze({
  IDLE: 'void1-idle',
  BODY_IDLE: 'void1-body-idle',
  WALK: 'void1-walk',
  CAST: 'void1-cast',
  ATTACK: 'void1-attack',
});

const CAST_ABILITIES = new Set(['void_gravity', 'icicle_blast']);
const ATTACK_ABILITIES = new Set(['void_lash', 'void_execution', 'basic']);

const VOID1_ARM_SEGMENT_FILES = Object.freeze([
  'Void1-armR-upper',
  'Void1-armR-fore',
  'Void1-armR-hand',
  'Void1-armL-upper',
  'Void1-armL-fore',
  'Void1-armL-hand',
]);

function frameUrl(base, file) {
  return `${base}/${file}`;
}

export function hasVoid1RigTextures(textures) {
  return !!textures?.exists?.(VOID1_BODY_IDLE_TEXTURE)
    && !!textures?.exists?.(VOID1_ARM_RIG.right.segments[0].spriteKey);
}

export function hasVoid1CompositeTextures(textures) {
  return !!textures?.exists?.(VOID1_IDLE_TEXTURE);
}

export function hasVoid1Textures(textures) {
  return hasVoid1RigTextures(textures) || hasVoid1CompositeTextures(textures);
}

export function preloadVoid1Textures(loader, { base = VOID1_ASSET_BASE } = {}) {
  const bases = [base, VOID1_ASSET_FALLBACK_BASE].filter((value, index, all) => all.indexOf(value) === index);
  const pickUrl = (file) => frameUrl(bases[0], file);

  for (let i = 0; i < VOID1_ANIMATION_MANIFEST.idle.frames; i += 1) {
    loader.image(`void1-body-noarms-f${i}`, pickUrl(`Void1-body-noArms-f${i}-png.png`));
    loader.image(`void1-idle-f${i}`, pickUrl(`Void1-f${i}-png.png`));
  }
  for (const segKey of VOID1_ARM_SEGMENT_FILES) {
    loader.image(segKey, pickUrl(`${segKey}-png.png`));
  }
  for (let i = 0; i < VOID1_ANIMATION_MANIFEST.walk.frames; i += 1) {
    loader.image(`void1-walk-f${i}`, frameUrl(base, `Void1-walk-f${i}-png.png`));
  }
  for (let i = 0; i < VOID1_ANIMATION_MANIFEST.cast.frames; i += 1) {
    loader.image(`void1-cast-f${i}`, frameUrl(base, `Void1-cast-f${i}-png.png`));
  }
  for (let i = 0; i < VOID1_ANIMATION_MANIFEST.attack.frames; i += 1) {
    loader.image(`void1-attack-f${i}`, frameUrl(base, `Void1-attack-f${i}-png.png`));
  }
}

export function registerVoid1Animations(anims) {
  if (anims.exists(VOID1_ANIM.IDLE)) return;

  if (!anims.exists(VOID1_ANIM.BODY_IDLE)) {
    const idleSpec = VOID1_ANIMATION_MANIFEST.idle;
    anims.create({
      key: VOID1_ANIM.BODY_IDLE,
      frames: Array.from({ length: idleSpec.frames }, (_, i) => ({ key: `void1-body-noarms-f${i}` })),
      frameRate: idleSpec.frameRate,
      repeat: idleSpec.loop ? -1 : 0,
    });
  }

  for (const [key, spec] of Object.entries(VOID1_ANIMATION_MANIFEST)) {
    const animKey = VOID1_ANIM[key.toUpperCase()];
    const prefix = key === 'idle' ? 'void1-idle' : `void1-${key}`;
    anims.create({
      key: animKey,
      frames: Array.from({ length: spec.frames }, (_, i) => ({ key: `${prefix}-f${i}` })),
      frameRate: spec.frameRate,
      repeat: spec.loop ? -1 : 0,
    });
  }
}

/** @param {import('./voidAcolyteCombatAbilities.js').VoidAcolyteAbilityId | string} abilityId */
export function pickVoid1StrikeAnim(abilityId) {
  if (CAST_ABILITIES.has(abilityId)) return VOID1_ANIM.CAST;
  if (ATTACK_ABILITIES.has(abilityId)) return VOID1_ANIM.ATTACK;
  return VOID1_ANIM.ATTACK;
}

/** @param {import('./voidAcolyteCombatAbilities.js').VoidAcolyteAbilityId | string} abilityId */
export function void1StrikeDelayMs(abilityId) {
  switch (abilityId) {
    case 'icicle_blast': return 380;
    case 'void_gravity': return 450;
    case 'void_lash': return 320;
    case 'void_execution': return 290;
    default: return 290;
  }
}

function createVoid1FallbackBody(scene) {
  const body = scene.add.graphics();
  body.fillStyle(0x1a1030, 1);
  body.fillEllipse(0, -18, 34, 48);
  body.fillStyle(0x66ccff, 0.95);
  body.fillCircle(0, -42, 9);
  body.lineStyle(2, 0xaa66ff, 0.95);
  body.lineBetween(-8, -30, 12, -8);
  body.lineStyle(2, 0x442266, 0.8);
  body.strokeEllipse(0, -20, 30, 44);
  return body;
}

export function applyVoid1ArmPose(armSegments, poseName, rigCanvas = VOID1_RIG_ORIGIN) {
  if (!armSegments) return;
  const pose = getVoid1Pose(poseName);
  const { x: OX, y: OY } = rigCanvas;
  for (const side of ['left', 'right']) {
    const arm = VOID1_ARM_RIG[side];
    const solved = solveArm(arm, pose[side]);
    solved.forEach((result, index) => {
      const segment = arm.segments[index];
      const sprite = armSegments[segment.spriteKey];
      if (!sprite) return;
      sprite.setPosition(result.jointX - OX, result.jointY - OY);
      sprite.setRotation(result.angleRad);
    });
  }
}

function setVoid1Flip(target, faceLeft) {
  if (!target) return;
  if (target.mode === 'rig') {
    target.body?.setFlipX(faceLeft);
    Object.values(target.armSegments || {}).forEach((sprite) => sprite?.setFlipX?.(faceLeft));
    target.composite?.setFlipX(faceLeft);
    return;
  }
  target.sprite?.setFlipX?.(faceLeft);
  target.fallback?.setScale?.(faceLeft ? -1 : 1, 1);
}

function showVoid1Rig(target, { poseName = 'carry' } = {}) {
  if (target.mode !== 'rig') return;
  target.body?.setVisible(true);
  Object.values(target.armSegments || {}).forEach((sprite) => sprite?.setVisible?.(true));
  target.composite?.setVisible(false);
  applyVoid1ArmPose(target.armSegments, poseName, target.rigCanvas);
  if (target.body?.anims?.exists(VOID1_ANIM.BODY_IDLE)) {
    target.body.play(VOID1_ANIM.BODY_IDLE);
  }
}

function showVoid1Composite(target, animKey) {
  if (target.mode === 'rig') {
    target.body?.setVisible(false);
    Object.values(target.armSegments || {}).forEach((sprite) => sprite?.setVisible?.(false));
    target.composite?.setVisible(true);
    if (target.composite?.play) target.composite.play(animKey);
    return;
  }
  if (target.sprite?.play) target.sprite.play(animKey);
}

export function playVoid1SpriteAnim(target, animKey, { returnToIdle = true } = {}) {
  const visual = target?.mode ? target : { mode: 'composite', sprite: target };
  const player = visual.mode === 'rig' ? visual.composite : visual.sprite;
  player?.off?.('animationcomplete');

  if (animKey === VOID1_ANIM.IDLE || animKey === VOID1_ANIM.BODY_IDLE) {
    showVoid1Rig(visual, { poseName: 'carry' });
    return;
  }

  showVoid1Composite(visual, animKey);

  if (returnToIdle && animKey !== VOID1_ANIM.WALK) {
    player?.once?.('animationcomplete', () => {
      showVoid1Rig(visual, { poseName: 'carry' });
    });
  }
}

function createVoid1RigSprite(scene, phaserRuntime) {
  const rigCanvas = { ...VOID1_RIG_ORIGIN, CANVAS_W: VOID1_CANVAS_W, CANVAS_H: VOID1_CANVAS_H };
  const armSegments = {};

  for (const side of ['left', 'right']) {
    for (const segment of VOID1_ARM_RIG[side].segments) {
      const sprite = scene.add.sprite(0, 0, segment.spriteKey);
      sprite.setOrigin(segment.pivot.x / VOID1_CANVAS_W, segment.pivot.y / VOID1_CANVAS_H);
      sprite.setScale(VOID1_DISPLAY_SCALE);
      armSegments[segment.spriteKey] = sprite;
    }
  }

  const body = scene.add.sprite(0, 0, VOID1_BODY_IDLE_TEXTURE);
  body.setOrigin(0.5, VOID1_FEET_ORIGIN_Y);
  body.setScale(VOID1_DISPLAY_SCALE);
  body.setData('bossId', VOID1_BOSS_LABEL);
  if (body.postFX) {
    body.postFX.addBloom(0x6644ff, 0.25, 0, 0.4, 0.6);
  }

  const composite = scene.add.sprite(0, 0, VOID1_IDLE_TEXTURE);
  composite.setOrigin(0.5, VOID1_FEET_ORIGIN_Y);
  composite.setScale(VOID1_DISPLAY_SCALE);
  composite.setVisible(false);
  if (composite.postFX) {
    composite.postFX.addBloom(0x6644ff, 0.25, 0, 0.4, 0.6);
  }

  applyVoid1ArmPose(armSegments, 'carry', rigCanvas);
  if (scene.anims?.exists(VOID1_ANIM.BODY_IDLE)) {
    body.play(VOID1_ANIM.BODY_IDLE);
  }

  const leftArmLayers = VOID1_ARM_RIG.left.segments.map((segment) => armSegments[segment.spriteKey]);
  const rightArmLayers = VOID1_ARM_RIG.right.segments.map((segment) => armSegments[segment.spriteKey]);

  return {
    mode: 'rig',
    body,
    armSegments,
    composite,
    rigCanvas,
    sprite: body,
    containerLayers: [...leftArmLayers, body, ...rightArmLayers, composite],
    setFlip: (faceLeft) => setVoid1Flip({ mode: 'rig', body, armSegments, composite }, faceLeft),
  };
}

function createVoid1CompositeSprite(scene) {
  const sprite = scene.add.sprite(0, 0, VOID1_IDLE_TEXTURE);
  sprite.setOrigin(0.5, VOID1_FEET_ORIGIN_Y);
  sprite.setScale(VOID1_DISPLAY_SCALE);
  sprite.setData('bossId', VOID1_BOSS_LABEL);
  if (sprite.postFX) {
    sprite.postFX.addBloom(0x6644ff, 0.25, 0, 0.4, 0.6);
  }
  if (scene.anims?.exists(VOID1_ANIM.IDLE)) sprite.play(VOID1_ANIM.IDLE);
  return {
    mode: 'composite',
    sprite,
    setFlip: (faceLeft) => sprite.setFlipX(faceLeft),
  };
}

export function createVoid1WardenSprite(scene, phaserRuntime) {
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x08060f, 0.55);
  shadow.fillEllipse(0, 2, 26, 9);

  const targetRing = scene.add.graphics();
  targetRing.lineStyle(2, 0xff4466, 0.9);
  targetRing.strokeEllipse(0, -38, 44, 18);
  targetRing.setBlendMode(phaserRuntime.BlendModes.ADD);
  targetRing.setVisible(false);

  if (hasVoid1RigTextures(scene.textures)) {
    const rig = createVoid1RigSprite(scene, phaserRuntime);
    return {
      shadow,
      targetRing,
      fallback: null,
      ...rig,
    };
  }

  if (hasVoid1CompositeTextures(scene.textures)) {
    console.warn('[Void1] Rig textures missing — using baked composite sprite.');
    const composite = createVoid1CompositeSprite(scene);
    return {
      shadow,
      targetRing,
      fallback: null,
      ...composite,
      body: null,
      armSegments: null,
      composite: null,
      containerLayers: [composite.sprite],
    };
  }

  console.warn('[Void1] Sprite textures missing — drawing fallback warden silhouette.');
  const fallback = createVoid1FallbackBody(scene);
  if (fallback.postFX) {
    fallback.postFX.addBloom(0x6644ff, 0.35, 0, 0.5, 0.8);
  }
  return {
    mode: 'fallback',
    shadow,
    sprite: null,
    body: null,
    armSegments: null,
    composite: null,
    fallback,
    targetRing,
    containerLayers: [fallback],
    setFlip: (faceLeft) => fallback.setScale(faceLeft ? -1 : 1, 1),
  };
}