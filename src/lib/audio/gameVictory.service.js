import {
  GAME_VICTORY_DEFAULTS,
  GAME_VICTORY_SAMPLE,
  GAME_VICTORY_SETTINGS_KEY,
} from './gameVictory.config.js';

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
  if (!storage) return { ...GAME_VICTORY_DEFAULTS };
  const parsed = safeJsonParse(storage.getItem(GAME_VICTORY_SETTINGS_KEY), {});
  return {
    enabled: parsed.enabled ?? GAME_VICTORY_DEFAULTS.enabled,
    volume: clamp01(parsed.volume ?? GAME_VICTORY_DEFAULTS.volume),
  };
}

function writeSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(GAME_VICTORY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors.
  }
}

function isAudioElement(value) {
  return value != null && typeof value.volume === 'number';
}

export function createGameVictoryService(options = {}) {
  const storage = options.storage ?? (canUseBrowser() ? window.localStorage : null);
  const sampleUrl = options.sampleUrl || GAME_VICTORY_SAMPLE.url;

  let settings = readSettings(storage);
  let unlocked = false;
  let unlockListenersAttached = false;
  let unlockHandler = null;
  let pendingPlay = false;
  let audio = null;
  const listeners = new Set();

  function emit() {
    listeners.forEach((listener) => {
      try { listener(getState()); } catch { /* no-op */ }
    });
  }

  function ensureAudio() {
    if (!canUseBrowser()) return null;
    if (isAudioElement(audio)) return audio;

    const element = document.createElement('audio');
    element.src = sampleUrl;
    element.preload = 'auto';
    element.loop = false;
    element.volume = 0;
    element.style.cssText = 'width:0;height:0;opacity:0;pointer-events:none;position:absolute;';
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
    audio = element;
    return audio;
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
        void playVictoryInternal();
      });
    };
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, unlockHandler, { passive: true });
    });
    unlockListenersAttached = true;
  }

  async function unlock() {
    if (unlocked) return true;
    const element = ensureAudio();
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
    ensureAudio();
    attachUnlockListeners();
    emit();
  }

  async function playVictoryInternal() {
    if (!settings.enabled) {
      pendingPlay = false;
      return false;
    }
    ensureAudio();
    if (!unlocked) {
      pendingPlay = true;
      prime();
      return false;
    }

    pendingPlay = false;
    const element = audio;
    if (!isAudioElement(element)) return false;

    try {
      element.pause();
      element.currentTime = 0;
      element.volume = settings.volume;
      await element.play();
      emit();
      return true;
    } catch {
      return false;
    }
  }

  function setEnabled(enabled) {
    settings = { ...settings, enabled: Boolean(enabled) };
    writeSettings(storage, settings);
    emit();
    if (!settings.enabled) pendingPlay = false;
  }

  function setVolume(value) {
    settings = { ...settings, volume: clamp01(value) };
    writeSettings(storage, settings);
    if (isAudioElement(audio) && !audio.paused) {
      audio.volume = settings.volume;
    }
    emit();
  }

  function getState() {
    return {
      sampleId: GAME_VICTORY_SAMPLE.id,
      sampleTitle: GAME_VICTORY_SAMPLE.title,
      sampleUrl,
      enabled: settings.enabled,
      unlocked,
      pendingPlay,
      volume: settings.volume,
      playing: isAudioElement(audio) && !audio.paused,
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function stopVictory() {
    pendingPlay = false;
    if (!isAudioElement(audio)) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      emit();
      return true;
    } catch {
      return false;
    }
  }

  function destroy() {
    detachUnlockListeners();
    pendingPlay = false;
    if (isAudioElement(audio)) {
      try {
        audio.pause();
        audio.remove();
      } catch {
        // Ignore teardown failures.
      }
    }
    audio = null;
    unlocked = false;
    listeners.clear();
    emit();
  }

  return {
    prime,
    unlock,
    playVictory: playVictoryInternal,
    stopVictory,
    setEnabled,
    setVolume,
    getState,
    subscribe,
    destroy,
  };
}

let singleton = null;

export function getGameVictoryService() {
  if (!singleton) {
    singleton = createGameVictoryService();
  }
  return singleton;
}

export function resetGameVictoryServiceForTests() {
  singleton?.destroy();
  singleton = null;
}