/**
 * Void1 portal-warden spell VFX — procedural ice spikes, void binds, and shatter bursts.
 */

const ICE_COLORS = Object.freeze({
  deep: 0x2a5a7a,
  mid: 0x55aadd,
  rim: 0x88ddff,
  core: 0xd8f4ff,
  voidCore: 0xaa44ff,
});

function drawDownwardStalagmite(gfx, height, width) {
  gfx.clear();
  gfx.fillStyle(ICE_COLORS.deep, 0.95);
  gfx.fillTriangle(0, 0, -width * 0.55, -height * 0.28, -width * 0.38, -height);
  gfx.fillTriangle(0, 0, width * 0.55, -height * 0.28, width * 0.38, -height);
  gfx.fillStyle(ICE_COLORS.mid, 0.9);
  gfx.fillTriangle(0, 2, -width * 0.28, -height * 0.35, -width * 0.12, -height * 0.92);
  gfx.fillTriangle(0, 2, width * 0.18, -height * 0.42, width * 0.05, -height * 0.88);
  gfx.fillStyle(ICE_COLORS.rim, 0.75);
  gfx.fillRect(-width * 0.06, -height * 0.82, width * 0.08, height * 0.18);
  gfx.fillStyle(ICE_COLORS.core, 0.85);
  gfx.fillCircle(0, -height * 0.12, Math.max(2, width * 0.12));
}

function spawnIceImpactBurst(scene, x, y, phaserRuntime, { scale = 1 } = {}) {
  const burst = scene.add.graphics().setDepth(68).setPosition(x, y);
  burst.setBlendMode(phaserRuntime.BlendModes.ADD);
  burst.fillStyle(ICE_COLORS.core, 0.85);
  burst.fillCircle(0, 0, 8 * scale);
  burst.fillStyle(ICE_COLORS.rim, 0.55);
  burst.fillCircle(0, 0, 16 * scale);
  burst.lineStyle(2, ICE_COLORS.mid, 0.7);
  burst.strokeEllipse(0, 4, 28 * scale, 10 * scale);
  scene.tweens.add({
    targets: burst,
    alpha: 0,
    scaleX: 1.5 * scale,
    scaleY: 1.5 * scale,
    duration: 220,
    ease: 'Quad.easeOut',
    onComplete: () => burst.destroy(),
  });
  return burst;
}

/**
 * Three sky-born stalagmites condense and slam the target.
 * @param {Phaser.Scene} scene
 * @param {object} opts
 * @param {number} opts.targetX
 * @param {number} opts.targetY
 * @param {number} opts.hitCount
 * @param {(index: number) => void} [opts.onHit]
 * @param {() => void} [opts.onComplete]
 * @param {object} opts.phaserRuntime
 */
export function playIcicleBlastVfx(scene, {
  targetX,
  targetY,
  hitCount = 3,
  onHit,
  onComplete,
  phaserRuntime,
} = {}) {
  const offsets = [-34, 0, 34];
  const skyLift = 150;
  const heights = [72, 86, 78];
  const widths = [18, 22, 19];
  let completed = 0;

  for (let i = 0; i < hitCount; i += 1) {
    const spawnDelay = i * 180;
    const slamDelay = 320 + i * 220;
    const offsetX = offsets[i % offsets.length];
    const skyX = targetX + offsetX;
    const skyY = targetY - skyLift - i * 8;
    const impactY = targetY - 34;

    scene.time.delayedCall(spawnDelay, () => {
      const container = scene.add.container(skyX, skyY).setDepth(67);
      const body = scene.add.graphics();
      drawDownwardStalagmite(body, heights[i % heights.length], widths[i % widths.length]);
      container.add(body);
      container.setScale(0.15);
      container.setAlpha(0.2);

      const motes = scene.add.graphics().setDepth(66);
      for (let m = 0; m < 8; m += 1) {
        motes.fillStyle(ICE_COLORS.core, phaserRuntime.Math.FloatBetween(0.25, 0.8));
        motes.fillCircle(
          phaserRuntime.Math.Between(-20, 20),
          phaserRuntime.Math.Between(-24, 12),
          phaserRuntime.Math.FloatBetween(1, 3),
        );
      }
      motes.setPosition(skyX, skyY - 20);
      scene.tweens.add({
        targets: motes,
        alpha: 0,
        y: motes.y - 18,
        duration: 260,
        onComplete: () => motes.destroy(),
      });

      scene.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 220,
        ease: 'Back.easeOut',
      });

      scene.time.delayedCall(slamDelay - spawnDelay, () => {
        scene.tweens.add({
          targets: container,
          x: targetX + offsetX * 0.35,
          y: impactY,
          duration: 140,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            spawnIceImpactBurst(scene, container.x, container.y + 6, phaserRuntime);
            scene.cameras?.main?.shake?.(120, 0.004 + i * 0.0015);
            container.destroy();
            onHit?.(i);
            completed += 1;
            if (completed >= hitCount) onComplete?.();
          },
        });
      });
    });
  }
}

export function playVoidGravityVfx(scene, { targetX, targetY, phaserRuntime } = {}) {
  const ring = scene.add.graphics().setDepth(66).setPosition(targetX, targetY - 28);
  ring.lineStyle(3, ICE_COLORS.voidCore, 0.55);
  ring.strokeEllipse(0, 0, 18, 8);
  ring.lineStyle(2, 0x442266, 0.8);
  ring.strokeEllipse(0, 0, 28, 12);
  scene.tweens.add({
    targets: ring,
    scaleX: 1.8,
    scaleY: 1.8,
    alpha: 0,
    duration: 420,
    ease: 'Sine.easeOut',
    onComplete: () => ring.destroy(),
  });

  const well = scene.add.graphics().setDepth(65).setPosition(targetX, targetY);
  well.fillStyle(0x110022, 0.45);
  well.fillEllipse(0, 0, 36, 14);
  scene.tweens.add({
    targets: well,
    alpha: 0,
    scaleX: 1.35,
    scaleY: 1.35,
    duration: 500,
    onComplete: () => well.destroy(),
  });

  for (let i = 0; i < 6; i += 1) {
    const shard = scene.add.graphics().setDepth(66).setPosition(
      targetX + phaserRuntime.Math.Between(-24, 24),
      targetY - phaserRuntime.Math.Between(40, 90),
    );
    shard.fillStyle(ICE_COLORS.voidCore, 0.7);
    shard.fillTriangle(0, 0, -3, -10, 3, -10);
    scene.tweens.add({
      targets: shard,
      y: targetY - 20,
      alpha: 0,
      duration: 320 + i * 30,
      ease: 'Cubic.easeIn',
      onComplete: () => shard.destroy(),
    });
  }
}

export function playVoidLashVfx(scene, {
  fromX,
  fromY,
  toX,
  toY,
  phaserRuntime,
} = {}) {
  const slash = scene.add.graphics().setDepth(67);
  slash.lineStyle(4, ICE_COLORS.voidCore, 0.85);
  slash.beginPath();
  slash.moveTo(fromX - 8, fromY - 42);
  slash.lineTo(toX + 10, toY - 50);
  slash.strokePath();
  slash.lineStyle(2, ICE_COLORS.core, 0.9);
  slash.beginPath();
  slash.moveTo(fromX, fromY - 46);
  slash.lineTo(toX, toY - 54);
  slash.strokePath();
  slash.setBlendMode(phaserRuntime.BlendModes.ADD);
  scene.tweens.add({
    targets: slash,
    alpha: 0,
    duration: 180,
    onComplete: () => slash.destroy(),
  });
}

export function playVoidExecutionVfx(scene, { targetX, targetY, phaserRuntime } = {}) {
  spawnIceImpactBurst(scene, targetX, targetY - 36, phaserRuntime, { scale: 1.35 });
  const shatter = scene.add.graphics().setDepth(68).setPosition(targetX, targetY - 40);
  shatter.setBlendMode(phaserRuntime.BlendModes.ADD);
  shatter.lineStyle(2, ICE_COLORS.voidCore, 0.9);
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    shatter.beginPath();
    shatter.moveTo(0, 0);
    shatter.lineTo(Math.cos(angle) * 26, Math.sin(angle) * 12);
    shatter.strokePath();
  }
  scene.tweens.add({
    targets: shatter,
    alpha: 0,
    scaleX: 1.5,
    scaleY: 1.5,
    duration: 280,
    onComplete: () => shatter.destroy(),
  });
  scene.cameras?.main?.shake?.(220, 0.009);
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} abilityId
 * @param {object} opts
 */
export function playVoidAcolyteSpellVfx(scene, abilityId, opts = {}) {
  switch (abilityId) {
    case 'icicle_blast':
      return playIcicleBlastVfx(scene, opts);
    case 'void_gravity':
      return playVoidGravityVfx(scene, opts);
    case 'void_lash':
      return playVoidLashVfx(scene, opts);
    case 'void_execution':
      return playVoidExecutionVfx(scene, opts);
    default:
      return null;
  }
}