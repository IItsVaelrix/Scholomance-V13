const STORAGE_KEY = 'scholomance:spellweave-compendium:v1';

function emptyLedger() {
  return {
    unlockedEntryIds: [],
    discoveredEntryIds: [],
    masteryCounts: {},
    sessionUsedEntryIds: [],
  };
}

function readLedger() {
  if (typeof localStorage === 'undefined') return emptyLedger();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLedger();
    const parsed = JSON.parse(raw);
    return {
      unlockedEntryIds: [...(parsed.unlockedEntryIds || [])],
      discoveredEntryIds: [...(parsed.discoveredEntryIds || [])],
      masteryCounts: { ...(parsed.masteryCounts || {}) },
      sessionUsedEntryIds: [...(parsed.sessionUsedEntryIds || [])],
    };
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger) {
  if (typeof localStorage === 'undefined') return ledger;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  return ledger;
}

export function getSpellweaveCompendiumLedger() {
  return readLedger();
}

export function buildCompendiumRuntimeContext() {
  const ledger = readLedger();
  return {
    unlockedEntryIds: ledger.unlockedEntryIds,
    discoveredEntryIds: ledger.discoveredEntryIds,
    usedEntryIds: ledger.sessionUsedEntryIds,
  };
}

/**
 * @param {string[]} entryIds
 */
export function recordCompendiumDiscoveries(entryIds = []) {
  if (!entryIds.length) return getSpellweaveCompendiumLedger();
  const ledger = readLedger();
  for (const entryId of entryIds) {
    if (!ledger.discoveredEntryIds.includes(entryId)) {
      ledger.discoveredEntryIds.push(entryId);
      ledger.unlockedEntryIds.push(entryId);
    }
    ledger.masteryCounts[entryId] = (ledger.masteryCounts[entryId] || 0) + 1;
    if (!ledger.sessionUsedEntryIds.includes(entryId)) {
      ledger.sessionUsedEntryIds.push(entryId);
    }
  }
  return writeLedger(ledger);
}

export function resetCompendiumSessionUsage() {
  const ledger = readLedger();
  ledger.sessionUsedEntryIds = [];
  return writeLedger(ledger);
}