import {
  GAME_BRAZIER_FIRE_DEFAULTS,
  GAME_BRAZIER_FIRE_SAMPLE,
  GAME_BRAZIER_FIRE_SETTINGS_KEY,
} from './gameBrazierFire.config.js';

const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);
/** Left + right obelisk braziers — staggered loop phase for stereo width. */
const BRAZIER_COUNT = 2;

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
  if (!storage) return { ...GAME_BRAZIER_FIRE_DEFAULTS };
  const parsed = safeJsonParse(storage.getItem(GAME_BRAZIER_FIRE_SETTINGS_KEY), {});
  return {
    enabled: parsed.enabled ?? GAME_BRAZIER_FIRE_DEFAULTS.enabled,
    volume: clamp01(parsed.volume ?? GAME_BRAZIER_FIRE_DEFAULTS.volume),
  };
}

function writeSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(GAME_BRAZIER_FIRE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors.
  }
}

function isAudioElement(value) {
  return value != null && typeof value.volume === 'number';
}

export function createGameBrazierFireService(options = {}) {
  const storage = options.storage ?? (canUseBrowser() ? window.localStorage : null);
  const sampleUrl = options.sampleUrl || GAME_BRAZIER_FIRE_SAMPLE.url;

  let settings = readSettings(storage);
  let unlocked = false;
  let unlockListenersAttached = false;
  let unlockHandler = null;
  let active = false;
  let pendingStart = false;
  let loops = [];
  const listeners = new Set();

  function emit() {
    listeners.forEach((listener) => {
      try { listener(getState()); } catch { /* no-op */ }
    });
  }

  function applyVolume() {
    const perBrazier = settings.volume * 0.72;
    loops.forEach((entry) => {
      if (!isAudioElement(entry.element)) return;
      entry.element.volume = perBrazier;
    });
  }

  function ensureLoops() {
    if (!canUseBrowser() || loops.length > 0) return loops;

    for (let index = 0; index < BRAZIER_COUNT; index += 1) {
      const element = document.createElement('audio');
      element.src = sampleUrl;
      element.preload = 'auto';
      element.loop = true;
      element.volume = 0;
      element.style.cssText = 'width:0;height:0;opacity:0;pointer-events:none;position:absolute;';
      element.setAttribute('aria-hidden', 'true');
      document.body.appendChild(element);
      loops.push({ element, index });
    }
    return loops;
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
        if (!didUnlock || !settings.enabled || !pendingStart || active) return;
        void startInternal();
      });
    };
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, unlockHandler, { passive: true });
    });
    unlockListenersAttached = true;
  }

  async function unlock() {
    if (unlocked) return true;
    ensureLoops();
    const first = loops[0]?.element;
    if (!isAudioElement(first)) return false;

    try {
      first.muted = true;
      first.volume = 0;
      await first.play();
      first.pause();
      first.currentTime = 0;
      first.muted = false;
    } catch {
      return false;
    }

    unlocked = true;
    detachUnlockListeners();
    emit();
    return true;
  }

  function prime() {
    ensureLoops();
    attachUnlockListeners();
    emit();
  }

  async function startInternal() {
    if (!settings.enabled) {
      pendingStart = false;
      return false;
    }
    ensureLoops();
    if (!loops.length) return false;
    if (!unlocked) {
      pendingStart = true;
      prime();
      return false;
    }

    pendingStart = false;
    active = true;
    applyVolume();
    emit();

    const durationSec = GAME_BRAZIER_FIRE_SAMPLE.durationMs / 1000;
    let started = false;

    for (const { element, index } of loops) {
      if (!isAudioElement(element)) continue;
      try {
        element.pause();
        element.currentTime = index * (durationSec * 0.37) % durationSec;
        await element.play();
        started = true;
      } catch {
        // Keep trying remaining braziers.
      }
    }

    if (!started) {
      active = false;
      emit();
    }
    return started;
  }

  async function stopInternal() {
    pendingStart = false;
    active = false;
    loops.forEach(({ element }) => {
      if (!isAudioElement(element)) return;
      try {
        element.pause();
        element.currentTime = 0;
      } catch {
        // Ignore teardown failures.
      }
    });
    emit();
  }

  function setEnabled(enabled) {
    settings = { ...settings, enabled: Boolean(enabled) };
    writeSettings(storage, settings);
    emit();
    if (!settings.enabled) {
      return stopInternal();
    }
    if (active) {
      return startInternal();
    }
    pendingStart = true;
    return startInternal();
  }

  function setVolume(value) {
    settings = { ...settings, volume: clamp01(value) };
    writeSettings(storage, settings);
    applyVolume();
    emit();
  }

  function getState() {
    return {
      sampleId: GAME_BRAZIER_FIRE_SAMPLE.id,
      sampleTitle: GAME_BRAZIER_FIRE_SAMPLE.title,
      sampleUrl,
      enabled: settings.enabled,
      unlocked,
      active,
      pendingStart,
      volume: settings.volume,
      brazierCount: BRAZIER_COUNT,
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy() {
    detachUnlockListeners();
    void stopInternal();
    loops.forEach(({ element }) => {
      try {
        element.remove();
      } catch {
        // Ignore teardown failures.
      }
    });
    loops = [];
    unlocked = false;
    listeners.clear();
    emit();
  }

  return {
    prime,
    unlock,
    start: startInternal,
    stop: stopInternal,
    setEnabled,
    setVolume,
    getState,
    subscribe,
    destroy,
  };
}

let singleton = null;

export function getGameBrazierFireService() {
  if (!singleton) {
    singleton = createGameBrazierFireService();
  }
  return singleton;
}

export function resetGameBrazierFireServiceForTests() {
  singleton?.destroy();
  singleton = null;
}