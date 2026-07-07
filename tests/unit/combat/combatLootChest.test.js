import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LOOT_CHEST_TIER_MATERIALS,
  LOOT_CHEST_TIERS,
  compileLootChestSource,
  remapLootChestSpec,
  transmuteLootChestPacket,
} from '../../../codex/core/pixelbrain/loot-chest-composition.js';
import {
  chestTierFromItemRarity,
  planCombatChestDrop,
} from '../../../src/game/combat/combatLootChest.js';
import { ICE_SLIME_STAFF_ITEM_ID, PORTAL_WARDEN_LOOT_CHANCE } from '../../../src/game/combat/combatLootDrops.js';
import { PORTAL_WARDEN_ID } from '../../../src/game/combat/portalPhase.js';


describe('loot chest SCDL composition', () => {
  it('compiles the canonical loot chest SCDL deterministically', () => {
    const first = compileLootChestSource();
    const second = compileLootChestSource();
    expect(first.ok).toBe(true);
    expect(first.packet.id).toBe(second.packet.id);
    expect(first.packet.geometry.coordinates.length).toBeGreaterThan(0);
    expect(first.framePackets.length).toBe(5);
    expect(first.frameLoop?.loop).toBe('open');
    expect(first.ast.parts.some((part) => part.id === 'body')).toBe(true);
    expect(first.ast.parts.some((part) => part.id === 'lock')).toBe(true);
  });

  it('transmutes source-authored parts per tier while preserving the silver lock', () => {
    const { packet } = compileLootChestSource();
    const rare = transmuteLootChestPacket(packet, LOOT_CHEST_TIERS.RARE);
    const body = rare.geometry.coordinates.find((coord) => coord.partId === 'body');
    const lock = rare.geometry.coordinates.find((coord) => coord.partId === 'lock');
    const sourceBody = packet.geometry.coordinates.find((coord) => coord.partId === 'body');
    const sourceLock = packet.geometry.coordinates.find((coord) => coord.partId === 'lock');

    expect(body.chromaticMaterial).toBe(LOOT_CHEST_TIER_MATERIALS[LOOT_CHEST_TIERS.RARE]);
    expect(body.color).not.toBe(sourceBody.color);
    expect(body.sourceColor).toBeTruthy();
    expect(lock.color).toBe(sourceLock.color);
    expect(lock.chromaticMaterial).toBeUndefined();
  });
});

describe('loot chest legacy ITEM-SPEC remap', () => {
  it('remaps semantic source materials per tier', () => {
    const base = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/loot-chest.v1.json'), 'utf8'));
    const rare = remapLootChestSpec(base, LOOT_CHEST_TIERS.RARE);
    const body = rare.parts.find((part) => part.id === 'body');
    expect(body.fill.material).toBe(LOOT_CHEST_TIER_MATERIALS[LOOT_CHEST_TIERS.RARE]);
    const lock = rare.parts.find((part) => part.id === 'lock');
    expect(lock.outline.material).toBe('silver');
  });
});

describe('combatLootChest', () => {
  it('maps item rarity to chest tier colors', () => {
    expect(chestTierFromItemRarity('rare')).toBe(LOOT_CHEST_TIERS.RARE);
    expect(chestTierFromItemRarity('legendary')).toBe(LOOT_CHEST_TIERS.LEGENDARY);
    expect(chestTierFromItemRarity('source')).toBe(LOOT_CHEST_TIERS.SOURCE);
  });

  it('plans a common chest when loot misses', () => {
    const plan = planCombatChestDrop(PORTAL_WARDEN_ID, () => PORTAL_WARDEN_LOOT_CHANCE);
    expect(plan.tier).toBe(LOOT_CHEST_TIERS.COMMON);
    expect(plan.loot).toBeNull();
    expect(plan.textureKey).toBe('LootChest-common-f0');
  });

  it('plans a rare gold chest when the void acolyte drops the staff', () => {
    const plan = planCombatChestDrop(PORTAL_WARDEN_ID, () => PORTAL_WARDEN_LOOT_CHANCE - 0.001);
    expect(plan.tier).toBe(LOOT_CHEST_TIERS.RARE);
    expect(plan.loot?.itemId).toBe(ICE_SLIME_STAFF_ITEM_ID);
    expect(plan.textureKey).toBe('LootChest-rare-f0');
  });
});