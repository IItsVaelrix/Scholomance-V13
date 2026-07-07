import { beforeEach, describe, expect, it } from 'vitest';
import { Storage } from '../../../src/lib/platform/storage.js';
import { STORMHEART_ORB_ITEM_ID } from '../../../codex/core/obelisk-puzzle.signals.js';
import {
  clearInventoryCache,
  getInventorySnapshot,
  grantItem,
  hasItem,
  resetInventoryForTests,
} from '../../../src/game/inventory/inventoryService.js';

describe('inventoryService', () => {
  beforeEach(() => {
    Storage.clear();
    resetInventoryForTests();
  });

  it('seeds starter gear but withholds the tutorial Stormheart orb', () => {
    const snapshot = getInventorySnapshot();
    expect(snapshot.slots.some((item) => item?.id === 'item_sword_void')).toBe(true);
    expect(snapshot.slots.some((item) => item?.id === STORMHEART_ORB_ITEM_ID)).toBe(false);
    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(false);
  });

  it('grants a quest item into the first empty slot and persists ownership', () => {
    const granted = grantItem(STORMHEART_ORB_ITEM_ID);
    expect(granted?.id).toBe(STORMHEART_ORB_ITEM_ID);
    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(true);
    expect(grantItem(STORMHEART_ORB_ITEM_ID)).toBeNull();

    clearInventoryCache();
    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(true);
  });

  it('does not auto-grant the Stormheart orb from the legacy localStorage flag', () => {
    getInventorySnapshot();
    Storage.setItem('scholomance.tutorial.stormheart-orb', '1');
    clearInventoryCache();
    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(false);
    expect(Storage.getItem('scholomance.tutorial.stormheart-orb')).toBeNull();
  });

  it('strips a persisted Stormheart orb unless the puzzle earn flag is set', () => {
    Storage.setItem('scholomance.inventory.v1', JSON.stringify({
      slots: [{ id: STORMHEART_ORB_ITEM_ID }],
      equipped: {},
    }));
    clearInventoryCache();

    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(false);
  });

  it('keeps the Stormheart orb after puzzle loot marks it earned', () => {
    grantItem(STORMHEART_ORB_ITEM_ID);
    clearInventoryCache();

    expect(hasItem(STORMHEART_ORB_ITEM_ID)).toBe(true);
    expect(Storage.getItem('scholomance.tutorial.stormheart-orb-earned')).toBe('1');
  });
});