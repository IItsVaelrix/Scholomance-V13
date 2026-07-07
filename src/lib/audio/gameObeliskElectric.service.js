import {
  GAME_OBELISK_ELECTRIC_DEFAULTS,
  GAME_OBELISK_ELECTRIC_SAMPLE,
  GAME_OBELISK_ELECTRIC_SETTINGS_KEY,
} from './gameObeliskElectric.config.js';

const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);
const POOL_SIZE = 4;

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
  if (!storage) return { ...GAME_OBELISK_ELECTRIC_DEFAULTS };
  const parsed = safeJsonParse(storage.getItem(GAME_OBELISK_ELECTRIC_SETTINGS_KEY), {});
  return {
    enabled: parsed.enabled ?? GAME_OBELISK_ELECTRIC_DEFAULTS.enabled,
    chargeVolume: clamp01(parsed.chargeVolume ?? GAME_OBELISK_ELECTRIC_DEFAULTS.chargeVolume),
    dischargeVolume: clamp01(parsed.dischargeVolume ?? GAME_OBELISK_ELECTRIC_DEFAULTS.dischargeVolume),
    preferSample: parsed.preferSample ?? GAME_OBELISK_ELECTRIC_DEFAULTS.preferSample,
  };
}

function writeSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(GAME_OBELISK_ELECTRIC_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors.
  }
}

function isAudioElement(value) {
  return value != null && typeof value.volume === 'number';
}

export function createGameObeliskElectricService(options = {}) {
  const storage = options.storage ?? (canUseBrowser() ? window.localStorage : null);
  const sampleUrl = options.sampleUrl || GAME_OBELISK_ELECTRIC_SAMPLE.url;

  let settings = readSettings(storage);
  let unlocked = false;
  let unlockListenersAttached = false;
  let unlockHandler = null;
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
      void unlock();
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

  function volumeForPhase(phase) {
    return phase === 'OBELISK_CHARGE' ? settings.chargeVolume : settings.dischargeVolume;
  }

  async function playZap(phase = 'OBELISK_DISCHARGE') {
    if (!settings.enabled) return false;
    if (!unlocked) {
      prime();
      return false;
    }

    const element = nextPooledElement();
    if (!isAudioElement(element)) return false;

    try {
      element.pause();
      element.currentTime = 0;
      element.volume = volumeForPhase(phase);
      await element.play();
      return true;
    } catch {
      return false;
    }
  }

  function shouldPreferSample() {
    return settings.enabled && settings.preferSample;
  }

  function setEnabled(enabled) {
    settings = { ...settings, enabled: Boolean(enabled) };
    writeSettings(storage, settings);
    emit();
  }

  function setPhaseVolume(phase, value) {
    const vol = clamp01(value);
    if (phase === 'charge') settings = { ...settings, chargeVolume: vol };
    else if (phase === 'discharge') settings = { ...settings, dischargeVolume: vol };
    else return;
    writeSettings(storage, settings);
    emit();
  }

  function getState() {
    return {
      sampleId: GAME_OBELISK_ELECTRIC_SAMPLE.id,
      sampleTitle: GAME_OBELISK_ELECTRIC_SAMPLE.title,
      sampleUrl,
      enabled: settings.enabled,
      unlocked,
      preferSample: settings.preferSample,
      chargeVolume: settings.chargeVolume,
      dischargeVolume: settings.dischargeVolume,
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy() {
    detachUnlockListeners();
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
    playZap,
    shouldPreferSample,
    setEnabled,
    setPhaseVolume,
    getState,
    subscribe,
    destroy,
  };
}

let singleton = null;

export function getGameObeliskElectricService() {
  if (!singleton) {
    singleton = createGameObeliskElectricService();
  }
  return singleton;
}

export function resetGameObeliskElectricServiceForTests() {
  singleton?.destroy();
  singleton = null;
}