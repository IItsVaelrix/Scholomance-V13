/**
 * Void1 animation manifest — frame counts and timing for combat Phaser anims.
 * Source: generated-assets/Void1/*-frameloop.json
 */

export const VOID1_ANIMATION_MANIFEST = Object.freeze({
  idle: { frames: 4, frameRate: 2.5, defaultDurationMs: 400, loop: true },
  walk: { frames: 5, frameRate: 5, defaultDurationMs: 200, loop: true },
  cast: { frames: 5, frameRate: 1000 / 150, defaultDurationMs: 150, loop: false },
  attack: { frames: 4, frameRate: 1000 / 120, defaultDurationMs: 120, loop: false },
});

export const VOID1_BOSS_ID = 'portal-warden';
export const VOID1_BOSS_LABEL = 'Void1';
export const VOID1_BOSS_SUBTITLE = 'Void Acolyte — Portal Warden';