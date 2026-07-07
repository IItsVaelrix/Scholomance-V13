import { beforeEach, describe, expect, it } from 'vitest';
import { Storage } from '../../../src/lib/platform/storage.js';
import { STORMHEART_ORB_ITEM_ID } from '../../../codex/core/obelisk-puzzle.signals.js';
import {
  clearInventoryCache,
  clearStormheartTutorialProgress,
  grantItem,
  hasItem,
  resetInventoryForTests,
} from '../../../src/game/inventory/inventoryService.js';
import {
  clearObeliskTutorialXpDiscoveries,
  grantScholomanceXpForAction,
  resetScholomanceXpForTests,
} from '../../../src/game/character/scholomanceXpService.js';
import { SCHOLOMANCE_XP_ACTIONS } from '../../../codex/core/scholomance-xp.schema.js';
import { resetObeliskTutorialForDevSession } from '../../../src/game/combat/obeliskTutorialDevReset.js';

describe('obelisk tutorial dev reset', () => {
  beforeEach(() => {
    Storage.clear();
    resetInventoryForTests();
    resetScholomanceXpForTests();
  });

  it('clears earned Stormheart orb progress', () => {
    grantItem(STORMHEART_ORB_ITEM_ID);
    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(true);

    clearStormheartTutorialProgress();
    clearInventoryCache();

    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(false);
    expect(Storage.getItem('scholomance.tutorial.stormheart-orb-earned')).toBeNull();
  });

  it('clears one-time obelisk discovery XP ids', () => {
    grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_SIPHON);
    const first = grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_SIPHON);
    expect(first.applied).toHaveLength(0);

    clearObeliskTutorialXpDiscoveries();
    const second = grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_SIPHON);
    expect(second.applied.length).toBeGreaterThan(0);
  });

  it('resetObeliskTutorialForDevSession clears orb and discovery XP in dev builds', () => {
    grantItem(STORMHEART_ORB_ITEM_ID);
    grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT, { duplicate: false });

    expect(resetObeliskTutorialForDevSession()).toBe(true);
    clearInventoryCache();

    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(false);
    const loot = grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT, { duplicate: false });
    expect(loot.applied.length).toBeGreaterThan(0);
  });
});