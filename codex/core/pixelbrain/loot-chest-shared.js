import {
  SOURCE_MATERIAL,
  resolveMaterialId,
  transmuteMaterialColor,
} from './material-registry.js';

export const LOOT_CHEST_PNG_SCALE = 1;

export const LOOT_CHEST_TIERS = Object.freeze({
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  MYTHIC: 'mythic',
  LEGENDARY: 'legendary',
  SOURCE: 'source',
});

/** PixelBrain chromatic transmutation targets for the source-authored chest SCDL. */
export const LOOT_CHEST_TIER_MATERIALS = Object.freeze({
  [LOOT_CHEST_TIERS.COMMON]: 'leather_brown',
  [LOOT_CHEST_TIERS.UNCOMMON]: 'emerald',
  [LOOT_CHEST_TIERS.RARE]: 'gold',
  [LOOT_CHEST_TIERS.MYTHIC]: 'amethyst',
  [LOOT_CHEST_TIERS.LEGENDARY]: 'ruby',
  [LOOT_CHEST_TIERS.SOURCE]: 'obsidian',
});

const SOURCE_AUTHORED_PARTS = new Set(['body', 'lid', 'band', 'glow', 'cavity']);

export const LOOT_CHEST_OPEN_FRAME_COUNT = 7;

function isSourceMaterial(material) {
  return material === SOURCE_MATERIAL || material === 'source';
}

function tierMaterialId(tier) {
  return resolveMaterialId(
    LOOT_CHEST_TIER_MATERIALS[tier] || LOOT_CHEST_TIER_MATERIALS[LOOT_CHEST_TIERS.COMMON],
  );
}

/**
 * Apply per-part PixelBrain chromatic transmutation to a compiled chest packet.
 * @param {object} packet
 * @param {string} tier
 */
export function transmuteLootChestPacket(packet, tier) {
  const materialId = tierMaterialId(tier);
  const coordinates = (packet.geometry?.coordinates || []).map((coord) => {
    const partId = coord.partId || '';
    const partMaterial = coord.material || SOURCE_MATERIAL;
    const shouldRemap = isSourceMaterial(partMaterial) && SOURCE_AUTHORED_PARTS.has(partId);
    if (!shouldRemap) return coord;
    return {
      ...coord,
      sourceColor: coord.sourceColor || coord.color,
      color: transmuteMaterialColor(coord.color, materialId),
      chromaticMaterial: materialId,
      material: materialId,
    };
  });

  return {
    ...packet,
    geometry: {
      ...packet.geometry,
      coordinates,
    },
  };
}

/** @deprecated ITEM-SPEC remap retained for legacy tests; runtime uses SCDL transmutation. */
export function remapLootChestSpec(spec, tier) {
  const material = LOOT_CHEST_TIER_MATERIALS[tier] || LOOT_CHEST_TIER_MATERIALS[LOOT_CHEST_TIERS.COMMON];
  const next = JSON.parse(JSON.stringify(spec));
  for (const part of next.parts) {
    if (part.fill && isSourceMaterial(part.fill.material) && SOURCE_AUTHORED_PARTS.has(part.id)) {
      part.fill = { ...part.fill, material };
    }
    if (part.outline && isSourceMaterial(part.outline.material) && part.id !== 'lock') {
      part.outline = { ...part.outline, material };
    }
  }
  return next;
}

export function getLootChestOpenFrameRate(frameLoop) {
  const durationMs = frameLoop?.defaultDurationMs ?? 120;
  return Math.max(4, Math.round(1000 / durationMs));
}

export function getLootChestTextureKey(tier) {
  return `LootChest-${tier || LOOT_CHEST_TIERS.COMMON}`;
}

export function getLootChestFrameTextureKey(tier, frameIndex = 0) {
  return `${getLootChestTextureKey(tier)}-f${frameIndex}`;
}

export function getLootChestOpenAnimKey(tier) {
  return `loot-chest-open-${tier || LOOT_CHEST_TIERS.COMMON}`;
}

export function getLootChestGeneratedAssetFilename(tier, frameIndex = 0, scale = LOOT_CHEST_PNG_SCALE) {
  const key = getLootChestFrameTextureKey(tier, frameIndex);
  return scale === 1 ? `${key}-png.png` : `${key}-x${scale}-png.png`;
}

export function getLootChestGeneratedAssetPath(tier, frameIndex = 0, scale = LOOT_CHEST_PNG_SCALE) {
  return `/generated-assets/LootChest/${getLootChestGeneratedAssetFilename(tier, frameIndex, scale)}`;
}

export function getLootChestTexturePath(tier) {
  return getLootChestGeneratedAssetPath(tier, 0, LOOT_CHEST_PNG_SCALE);
}