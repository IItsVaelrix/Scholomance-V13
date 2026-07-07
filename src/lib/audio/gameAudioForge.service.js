import { createPixelBrainAudioForge } from '../../audio/pixelbrain-audio-forge.js';
import {
  GAME_AUDIO_FORGE_DEFAULTS,
  GAME_AUDIO_FORGE_PREWARM_EVENTS,
  GAME_AUDIO_FORGE_SETTINGS_KEY,
} from './gameAudioForge.config.js';

const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);

function canUseBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function safeJsonParse(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed == null || typeof parsed !== 'object') return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function readSettings(storage) {
  if (!storage) return { ...GAME_AUDIO_FORGE_DEFAULTS };
  const parsed = safeJsonParse(storage.getItem(GAME_AUDIO_FORGE_SETTINGS_KEY), {});
  return {
    enabled: parsed.enabled ?? GAME_AUDIO_FORGE_DEFAULTS.enabled,
    combatVolume: clamp01(parsed.combatVolume ?? GAME_AUDIO_FORGE_DEFAULTS.combatVolume),
    magicVolume: clamp01(parsed.magicVolume ?? GAME_AUDIO_FORGE_DEFAULTS.magicVolume),
    uiVolume: clamp01(parsed.uiVolume ?? GAME_AUDIO_FORGE_DEFAULTS.uiVolume),
  };
}

function writeSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(GAME_AUDIO_FORGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors.
  }
}

export function createGameAudioForgeService(options = {}) {
  const storage = options.storage ?? (canUseBrowser() ? window.localStorage : null);
  let settings = readSettings(storage);
  let forge = null;
  let unlocked = false;
  let unlockListenersAttached = false;
  let unlockHandler = null;
  let prewarmed = false;
  const listeners = new Set();

  function emit() {
    listeners.forEach((listener) => {
      try { listener(getState()); } catch { /* no-op */ }
    });
  }

  function ensureForge() {
    if (forge || !canUseBrowser()) return forge;
    forge = createPixelBrainAudioForge();
    applyBusVolumes();
    return forge;
  }

  function applyBusVolumes() {
    if (!forge) return;
    forge.setVolume(forge.BUSES.COMBAT, settings.combatVolume);
    forge.setVolume(forge.BUSES.MAGIC, settings.magicVolume);
    forge.setVolume(forge.BUSES.UI, settings.uiVolume);
    forge.setMuted(!settings.enabled);
  }

  async function prewarmCommonPackets() {
    if (prewarmed || !forge || !unlocked) return;
    await forge.prewarmEventTypes(GAME_AUDIO_FORGE_PREWARM_EVENTS);
    prewarmed = true;
    emit();
  }

  function detachUnlockListeners() {
    if (!canUseBrowser() || !unlockListenersAttached || !unlockHandler) return;
    UNLOCK_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, unlockHandler);
    });
    unlockListenersAttached = false;
    unlockHandler = null;
  }

  function attachUnlockListeners() {
    if (!canUseBrowser() || unlockListenersAttached || unlocked) return;
    unlockHandler = () => {
      void unlock().then((didUnlock) => {
        if (!didUnlock || !settings.enabled) return;
        void prewarmCommonPackets();
      });
    };
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, unlockHandler, { passive: true });
    });
    unlockListenersAttached = true;
  }

  async function unlock() {
    if (unlocked) return true;
    const instance = ensureForge();
    if (!instance) return false;
    try {
      await instance.unlock();
    } catch {
      return false;
    }
    unlocked = true;
    detachUnlockListeners();
    emit();
    return true;
  }

  function prime() {
    ensureForge();
    attachUnlockListeners();
    emit();
  }

  async function emitSfx(eventType, eventData = {}) {
    if (!settings.enabled) return false;
    const instance = ensureForge();
    if (!instance) return false;
    if (!unlocked) {
      prime();
      return false;
    }
    await instance.emitSfx(eventType, eventData);
    return true;
  }

  function setEnabled(enabled) {
    settings = { ...settings, enabled: Boolean(enabled) };
    writeSettings(storage, settings);
    applyBusVolumes();
    emit();
  }

  function setBusVolume(bus, value) {
    const vol = clamp01(value);
    if (bus === 'combat') settings = { ...settings, combatVolume: vol };
    else if (bus === 'magic') settings = { ...settings, magicVolume: vol };
    else if (bus === 'ui') settings = { ...settings, uiVolume: vol };
    else return;
    writeSettings(storage, settings);
    applyBusVolumes();
    emit();
  }

  function getState() {
    return {
      enabled: settings.enabled,
      unlocked,
      ready: Boolean(forge?.ready),
      prewarmed,
      combatVolume: settings.combatVolume,
      magicVolume: settings.magicVolume,
      uiVolume: settings.uiVolume,
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose() {
    detachUnlockListeners();
    forge?.dispose();
    forge = null;
    unlocked = false;
    prewarmed = false;
    listeners.clear();
    emit();
  }

  return {
    prime,
    unlock,
    emitSfx,
    setEnabled,
    setBusVolume,
    getState,
    subscribe,
    dispose,
    getForge: () => forge,
  };
}

let singleton = null;

export function getGameAudioForgeService() {
  if (!singleton) {
    singleton = createGameAudioForgeService();
  }
  return singleton;
}

export function resetGameAudioForgeServiceForTests() {
  singleton?.dispose();
  singleton = null;
}