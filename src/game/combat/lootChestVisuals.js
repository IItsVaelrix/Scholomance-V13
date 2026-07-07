import {
  LOOT_CHEST_OPEN_FRAME_COUNT,
  LOOT_CHEST_PNG_SCALE,
  LOOT_CHEST_TIERS,
  getLootChestFrameTextureKey,
  getLootChestGeneratedAssetPath,
  getLootChestOpenAnimKey,
  getLootChestOpenFrameRate,
} from '../../../codex/core/pixelbrain/loot-chest-shared.js';

export {
  LOOT_CHEST_OPEN_FRAME_COUNT,
  LOOT_CHEST_PNG_SCALE,
  getLootChestOpenAnimKey,
  getLootChestOpenFrameRate,
};

export function preloadLootChestTextures(loader, frameLoop = null) {
  const frameRate = getLootChestOpenFrameRate(frameLoop);
  for (const tier of Object.values(LOOT_CHEST_TIERS)) {
    for (let frameIndex = 0; frameIndex < LOOT_CHEST_OPEN_FRAME_COUNT; frameIndex += 1) {
      loader.image(
        getLootChestFrameTextureKey(tier, frameIndex),
        getLootChestGeneratedAssetPath(tier, frameIndex, LOOT_CHEST_PNG_SCALE),
      );
    }
  }
  return frameRate;
}

export function registerLootChestAnimations(anims, frameLoop = null) {
  // Use the bespoke snappy timing sequence defined in Aseprite
  const frameDurations = [250, 80, 80, 100, 300, 120, 160];
  
  for (const tier of Object.values(LOOT_CHEST_TIERS)) {
    anims.create({
      key: getLootChestOpenAnimKey(tier),
      frames: Array.from({ length: LOOT_CHEST_OPEN_FRAME_COUNT }, (_, frameIndex) => ({
        key: getLootChestFrameTextureKey(tier, frameIndex),
        duration: frameDurations[frameIndex] || 120,
      })),
      repeat: 0,
    });
  }
  return 8; // Legacy return value
}