import { Storage } from '../../lib/platform/storage.js';
import { ITEM_DATABASE } from '../../data/itemDatabase.js';
import { STORMHEART_ORB_ITEM_ID } from '../../../codex/core/obelisk-puzzle.signals.js';
import { ICE_SLIME_STAFF_ITEM_ID } from '../combat/combatLootDrops.js';

const STORAGE_KEY = 'scholomance.inventory.v1';
const LEGACY_STORMHEART_KEY = 'scholomance.tutorial.stormheart-orb';
const STORMHEART_EARNED_KEY = 'scholomance.tutorial.stormheart-orb-earned';
const SLOT_COUNT = 24;

const QUEST_EXCLUDED_IDS = new Set([
  STORMHEART_ORB_ITEM_ID,
  ICE_SLIME_STAFF_ITEM_ID,
]);

const DEFAULT_EQUIPPED = Object.freeze({
  head: null,
  amulet: null,
  shoulder: null,
  chest: null,
  weapon: null,
  offhand: null,
  ring1: null,
  ring2: null,
  legs: null,
  boots: null,
});

/** @type {{ slots: (object|null)[], equipped: Record<string, object|null> } | null} */
let cachedState = null;

function cloneItem(item) {
  return item ? { ...item } : null;
}

function buildDefaultInventory() {
  const slots = Array(SLOT_COUNT).fill(null);
  Object.values(ITEM_DATABASE)
    .filter((item) => !QUEST_EXCLUDED_IDS.has(item.id))
    .forEach((item, index) => {
      if (index < SLOT_COUNT) slots[index] = cloneItem(item);
    });
  return {
    slots,
    equipped: Object.fromEntries(Object.keys(DEFAULT_EQUIPPED).map((key) => [key, null])),
  };
}

function isStormheartOrbEarned() {
  return Storage.getItem(STORMHEART_EARNED_KEY) === '1';
}

function markStormheartOrbEarned() {
  Storage.setItem(STORMHEART_EARNED_KEY, '1');
  Storage.removeItem(LEGACY_STORMHEART_KEY);
}

function stripUnearnedStormheart(state) {
  if (!state || isStormheartOrbEarned()) return state;

  const slots = state.slots.map((item) => (
    item?.id === STORMHEART_ORB_ITEM_ID ? null : cloneItem(item)
  ));
  const equipped = Object.fromEntries(
    Object.entries(state.equipped).map(([slotId, item]) => [
      slotId,
      item?.id === STORMHEART_ORB_ITEM_ID ? null : cloneItem(item),
    ]),
  );

  return { slots, equipped };
}

function inventoryContainsStormheart(state) {
  if (!state) return false;
  if (state.slots.some((item) => item?.id === STORMHEART_ORB_ITEM_ID)) return true;
  return Object.values(state.equipped).some((item) => item?.id === STORMHEART_ORB_ITEM_ID);
}

function sanitizeQuestInventory(state) {
  const next = stripUnearnedStormheart(state);
  if (
    inventoryContainsStormheart(state)
    && !inventoryContainsStormheart(next)
  ) {
    return { state: next, changed: true };
  }
  return { state: next, changed: false };
}

function normalizeState(raw) {
  const fallback = buildDefaultInventory();
  if (!raw || typeof raw !== 'object') return stripUnearnedStormheart(fallback);

  const slots = Array(SLOT_COUNT).fill(null);
  if (Array.isArray(raw.slots)) {
    raw.slots.slice(0, SLOT_COUNT).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const canonical = ITEM_DATABASE[entry.id];
      slots[index] = cloneItem(canonical ? { ...canonical, ...entry } : entry);
    });
  } else {
    fallback.slots.forEach((item, index) => {
      slots[index] = cloneItem(item);
    });
  }

  const equipped = Object.fromEntries(Object.keys(DEFAULT_EQUIPPED).map((key) => [key, null]));
  if (raw.equipped && typeof raw.equipped === 'object') {
    for (const [slotId, entry] of Object.entries(raw.equipped)) {
      if (!Object.prototype.hasOwnProperty.call(equipped, slotId) || !entry) continue;
      const canonical = ITEM_DATABASE[entry.id];
      equipped[slotId] = cloneItem(canonical ? { ...canonical, ...entry } : entry);
    }
  }

  return stripUnearnedStormheart({ slots, equipped });
}

function readStorage() {
  try {
    const raw = Storage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultInventory();
    return normalizeState(JSON.parse(raw));
  } catch {
    return buildDefaultInventory();
  }
}

function writeStorage(state) {
  Storage.setItem(STORAGE_KEY, JSON.stringify({
    slots: state.slots.map((item) => (item ? { id: item.id } : null)),
    equipped: Object.fromEntries(
      Object.entries(state.equipped).map(([slotId, item]) => [slotId, item ? { id: item.id } : null]),
    ),
  }));
}

function emitInventoryChanged(state) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('inventory-changed', {
    detail: {
      slots: state.slots.map(cloneItem),
      equipped: Object.fromEntries(
        Object.entries(state.equipped).map(([slotId, item]) => [slotId, cloneItem(item)]),
      ),
    },
  }));
}

function emitItemGranted(item) {
  if (typeof window === 'undefined' || !item) return;
  window.dispatchEvent(new CustomEvent('inventory-item-granted', {
    detail: { item: cloneItem(item) },
  }));
}

function ensureLoaded() {
  if (!cachedState) {
    cachedState = readStorage();
    clearLegacyStormheartFlag();
    const { state, changed } = sanitizeQuestInventory(cachedState);
    cachedState = state;
    if (changed) {
      persist(cachedState);
    }
  }
  return cachedState;
}

function persist(state = cachedState) {
  if (!state) return;
  writeStorage(state);
  emitInventoryChanged(state);
}

function clearLegacyStormheartFlag() {
  if (Storage.getItem(LEGACY_STORMHEART_KEY) === '1') {
    Storage.removeItem(LEGACY_STORMHEART_KEY);
  }
}

export function getInventorySnapshot() {
  const state = ensureLoaded();
  return {
    slots: state.slots.map(cloneItem),
    equipped: Object.fromEntries(
      Object.entries(state.equipped).map(([slotId, item]) => [slotId, cloneItem(item)]),
    ),
  };
}

export function setInventorySnapshot({ slots, equipped }) {
  const state = ensureLoaded();
  if (Array.isArray(slots)) {
    state.slots = slots.slice(0, SLOT_COUNT).map((entry) => cloneItem(entry));
    while (state.slots.length < SLOT_COUNT) state.slots.push(null);
  }
  if (equipped && typeof equipped === 'object') {
    for (const slotId of Object.keys(state.equipped)) {
      state.equipped[slotId] = equipped[slotId] ? cloneItem(equipped[slotId]) : null;
    }
  }
  persist(state);
  return getInventorySnapshot();
}

export function hasItem(itemId) {
  if (!itemId) return false;
  const state = ensureLoaded();
  if (state.slots.some((item) => item?.id === itemId)) return true;
  return Object.values(state.equipped).some((item) => item?.id === itemId);
}

export function grantItem(itemId, { silent = false } = {}) {
  const canonical = ITEM_DATABASE[itemId];
  if (!canonical) return null;
  if (hasItem(itemId)) return null;

  const state = ensureLoaded();
  const emptyIndex = state.slots.findIndex((slot) => slot === null);
  if (emptyIndex === -1) return null;

  const granted = cloneItem(canonical);
  state.slots[emptyIndex] = granted;
  if (itemId === STORMHEART_ORB_ITEM_ID) {
    markStormheartOrbEarned();
  }
  persist(state);
  if (!silent) emitItemGranted(granted);
  return granted;
}

export function clearInventoryCache() {
  cachedState = null;
}

export function resetInventoryForTests() {
  cachedState = null;
  Storage.removeItem(STORAGE_KEY);
  Storage.removeItem(LEGACY_STORMHEART_KEY);
  Storage.removeItem(STORMHEART_EARNED_KEY);
}

/** Clears Stormheart orb ownership so the obelisk tutorial can run again. */
export function clearStormheartTutorialProgress() {
  Storage.removeItem(STORMHEART_EARNED_KEY);
  Storage.removeItem(LEGACY_STORMHEART_KEY);
  const state = cachedState || readStorage();
  const slots = state.slots.map((item) => (
    item?.id === STORMHEART_ORB_ITEM_ID ? null : cloneItem(item)
  ));
  const equipped = Object.fromEntries(
    Object.entries(state.equipped).map(([slotId, item]) => [
      slotId,
      item?.id === STORMHEART_ORB_ITEM_ID ? null : cloneItem(item),
    ]),
  );
  cachedState = { slots, equipped };
  persist(cachedState);
}

export function hasEarnedStormheartOrb() {
  return isStormheartOrbEarned();
}