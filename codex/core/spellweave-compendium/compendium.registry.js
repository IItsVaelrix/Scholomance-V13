import { COMPENDIUM_VERSION } from './compendium.schema.js';
import { CHEMICAL_COMPENDIUM_ENTRIES } from './chemical-reactions.registry.js';
import { DISCOVERY_COMPENDIUM_ENTRIES } from './discovery.registry.js';
import { ELEMENTAL_COMPENDIUM_ENTRIES } from './elemental.registry.js';
import { EMOTION_COMPENDIUM_ENTRIES } from './emotion.registry.js';
import { LEXICAL_COMPENDIUM_ENTRIES } from './lexical-rarity.registry.js';
import { MYTH_COMPENDIUM_ENTRIES } from './myth.registry.js';
import { PSYCHOLOGY_COMPENDIUM_ENTRIES } from './psychology.registry.js';
import { SONIC_COMPENDIUM_ENTRIES } from './sonic.registry.js';

export const COMPENDIUM_ENTRIES = Object.freeze([
  ...ELEMENTAL_COMPENDIUM_ENTRIES,
  ...EMOTION_COMPENDIUM_ENTRIES,
  ...LEXICAL_COMPENDIUM_ENTRIES,
  ...CHEMICAL_COMPENDIUM_ENTRIES,
  ...PSYCHOLOGY_COMPENDIUM_ENTRIES,
  ...SONIC_COMPENDIUM_ENTRIES,
  ...MYTH_COMPENDIUM_ENTRIES,
  ...DISCOVERY_COMPENDIUM_ENTRIES,
]);

const ENTRY_BY_ID = Object.freeze(
  Object.fromEntries(COMPENDIUM_ENTRIES.map((entry) => [entry.entryId, entry])),
);

export function getCompendiumEntry(entryId) {
  return ENTRY_BY_ID[entryId] || null;
}

export function listCompendiumEntriesByTier(tierId) {
  return COMPENDIUM_ENTRIES.filter((entry) => entry.tierId === tierId);
}

export function getCompendiumRegistryMeta() {
  return {
    version: COMPENDIUM_VERSION,
    entryCount: COMPENDIUM_ENTRIES.length,
    tiers: [...new Set(COMPENDIUM_ENTRIES.map((entry) => entry.tierId))],
  };
}