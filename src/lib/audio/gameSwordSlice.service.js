import {
  GAME_SWORD_SLICE_DEFAULTS,
  GAME_SWORD_SLICE_SAMPLE,
  GAME_SWORD_SLICE_SETTINGS_KEY,
} from './gameSwordSlice.config.js';

const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);
const POOL_SIZE = 3;

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
  if (!storage) return { ...GAME_SWORD_SLICE_DEFAULTS };
  const parsed = safeJsonParse(storage.getItem(GAME_SWORD_SLICE_SETTINGS_KEY), {});
  return {
    enabled: parsed.enabled ?? GAME_SWORD_SLICE_DEFAULTS.enabled,
    volume: clamp01(parsed.volume ?? GAME_SWORD_SLICE_DEFAULTS.volume),
  };
}

function writeSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(GAME_SWORD_SLICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors.
  }
}

function isAudioElement(value) {
  return value != null && typeof value.volume === 'number';
}

export function createGameSwordSliceService(options = {}) {
  const storage = options.storage ?? (canUseBrowser() ? window.localStorage : null);
  const sampleUrl = options.sampleUrl || GAME_SWORD_SLICE_SAMPLE.url;

  let settings = readSettings(storage);
  let unlocked = false;
  let unlockListenersAttached = false;
  let unlockHandler = null;
  let pendingPlay = false;
  let pool = [];
  let poolCursor = 0;
  const listeners = new Set();

  function emit() {
    listeners.forEach((listener) => {
      try { listener(getState()); } catch { /* no-op */ }
    });
  }

  function ensurePool() {
    if (!canUseBrowser() || pool.length > 0) return pool;

    for (let i = 0; i < POOL_SIZE; i += 1) {
      const element = document.createElement('audio');
      element.src = sampleUrl;
      element.preload = 'auto';
      element.volume = 0;
      element.style.cssText = 'width:0;height:0;opacity:0;pointer-events:none;position:absolute;';
      element.setAttribute('aria-hidden', 'true');
      document.body.appendChild(element);
      pool.push(element);
    }
    return pool;
  }

  function nextPooledElement() {
    const elements = ensurePool();
    if (!elements.length) return null;
    const element = elements[poolCursor % elements.length];
    poolCursor += 1;
    return element;
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
        if (!didUnlock || !settings.enabled || !pendingPlay) return;
        void playSliceInternal();
      });
    };
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, unlockHandler, { passive: true });
    });
    unlockListenersAttached = true;
  }

  async function unlock() {
    if (unlocked) return true;
    const element = nextPooledElement();
    if (!isAudioElement(element)) return false;

    try {
      element.muted = true;
      element.volume = 0;
      await element.play();
      element.pause();
      element.currentTime = 0;
      element.muted = false;
    } catch {
      return false;
    }

    unlocked = true;
    detachUnlockListeners();
    emit();
    return true;
  }

  function prime() {
    ensurePool();
    attachUnlockListeners();
    emit();
  }

  async function playSliceInternal() {
    if (!settings.enabled) {
      pendingPlay = false;
      return false;
    }
    ensurePool();
    if (!unlocked) {
      pendingPlay = true;
      prime();
      return false;
    }

    pendingPlay = false;
    const element = nextPooledElement();
    if (!isAudioElement(element)) return false;

    try {
      element.pause();
      element.currentTime = 0;
      element.volume = settings.volume;
      await element.play();
      return true;
    } catch {
      return false;
    }
  }

  function setEnabled(enabled) {
    settings = { ...settings, enabled: Boolean(enabled) };
    writeSettings(storage, settings);
    emit();
    if (!settings.enabled) {
      pendingPlay = false;
    }
  }

  function setVolume(value) {
    settings = { ...settings, volume: clamp01(value) };
    writeSettings(storage, settings);
    emit();
  }

  function getState() {
    return {
      sampleId: GAME_SWORD_SLICE_SAMPLE.id,
      sampleTitle: GAME_SWORD_SLICE_SAMPLE.title,
      sampleUrl,
      enabled: settings.enabled,
      unlocked,
      pendingPlay,
      volume: settings.volume,
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy() {
    detachUnlockListeners();
    pendingPlay = false;
    pool.forEach((element) => {
      try {
        element.pause();
        element.remove();
      } catch {
        // Ignore teardown failures.
      }
    });
    pool = [];
    poolCursor = 0;
    unlocked = false;
    listeners.clear();
    emit();
  }

  return {
    prime,
    unlock,
    playSlice: playSliceInternal,
    setEnabled,
    setVolume,
    getState,
    subscribe,
    destroy,
  };
}

let singleton = null;

export function getGameSwordSliceService() {
  if (!singleton) {
    singleton = createGameSwordSliceService();
  }
  return singleton;
}

export function resetGameSwordSliceServiceForTests() {
  singleton?.destroy();
  singleton = null;
}