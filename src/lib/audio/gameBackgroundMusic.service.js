import { freshRng } from '../math/seededRng.js';
import {
  GAME_BACKGROUND_MUSIC_CYCLE_MS,
  GAME_BACKGROUND_MUSIC_DEFAULTS,
  GAME_BACKGROUND_MUSIC_PACING,
  GAME_BACKGROUND_MUSIC_SETTINGS_KEY,
  GAME_BACKGROUND_MUSIC_TRACK,
} from './gameBackgroundMusic.config.js';
import { resolveMusicBeatSnapshot } from './gameMusicBeatClock.js';

const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);
const FADE_OUT_MS = 450;
const FADE_IN_MS = 900;

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
  if (!storage) return { ...GAME_BACKGROUND_MUSIC_DEFAULTS };
  const parsed = safeJsonParse(storage.getItem(GAME_BACKGROUND_MUSIC_SETTINGS_KEY), {});
  return {
    volume: clamp01(parsed.volume ?? GAME_BACKGROUND_MUSIC_DEFAULTS.volume),
    enabled: parsed.enabled ?? GAME_BACKGROUND_MUSIC_DEFAULTS.enabled,
  };
}

function writeSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(GAME_BACKGROUND_MUSIC_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors.
  }
}

function isAudioElement(value) {
  return value != null && typeof value.volume === 'number';
}

function readAudioVolume(audio, fallback = 0) {
  return isAudioElement(audio) ? clamp01(audio.volume) : clamp01(fallback);
}

function setAudioVolume(audio, volume) {
  if (!isAudioElement(audio)) return;
  audio.volume = clamp01(volume);
}

/**
 * @param {number} minMs
 * @param {number} maxMs
 * @param {() => number} randomFn
 */
export function pickCycleDurationMs(
  minMs = GAME_BACKGROUND_MUSIC_CYCLE_MS.min,
  maxMs = GAME_BACKGROUND_MUSIC_CYCLE_MS.max,
  randomFn = freshRng(),
) {
  const lo = Math.max(1, Math.min(minMs, maxMs));
  const hi = Math.max(lo, maxMs);
  return Math.round(lo + clamp01(randomFn()) * (hi - lo));
}

function fadeVolume(audio, from, to, durationMs, isCancelled = () => false) {
  if (!isAudioElement(audio) || isCancelled()) {
    return Promise.resolve();
  }

  if (durationMs <= 0) {
    if (!isCancelled()) setAudioVolume(audio, to);
    return Promise.resolve();
  }

  const start = performance?.now?.() ?? Date.now();
  const begin = clamp01(from);
  const end = clamp01(to);

  return new Promise((resolve) => {
    const step = (now) => {
      if (!isAudioElement(audio) || isCancelled()) {
        resolve();
        return;
      }

      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      setAudioVolume(audio, begin + (end - begin) * progress);

      if (progress < 1 && !isCancelled()) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export function createGameBackgroundMusicService(options = {}) {
  const storage = options.storage ?? (canUseBrowser() ? window.localStorage : null);
  const randomFn = typeof options.randomFn === 'function' ? options.randomFn : freshRng();
  let trackUrl = options.trackUrl || GAME_BACKGROUND_MUSIC_TRACK.url;
  let currentTrack = GAME_BACKGROUND_MUSIC_TRACK;
  let currentPacing = GAME_BACKGROUND_MUSIC_PACING;
  let loopOnly = false;

  let settings = readSettings(storage);
  let audio = null;
  let cycleTimer = null;
  let fadeGeneration = 0;
  let unlocked = false;
  let active = false;
  let intentToPlay = false;
  let unlockListenersAttached = false;
  let unlockHandler = null;
  let lifecycle = Promise.resolve();
  let cachedPlaybackTimeMs = null;

  const listeners = new Set();

  function syncCachedPlaybackTime() {
    if (!isAudioElement(audio) || audio.paused) {
      cachedPlaybackTimeMs = null;
      return;
    }
    const seconds = audio.currentTime;
    if (!Number.isFinite(seconds) || seconds < 0) {
      cachedPlaybackTimeMs = null;
      return;
    }
    cachedPlaybackTimeMs = Math.round(seconds * 1000);
  }

  function attachPlaybackListeners(element) {
    if (!element || element._scholomanceBeatListeners) return;
    const onTimeUpdate = () => syncCachedPlaybackTime();
    const onPlay = () => syncCachedPlaybackTime();
    const onPause = () => {
      cachedPlaybackTimeMs = null;
    };
    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element._scholomanceBeatListeners = { onTimeUpdate, onPlay, onPause };
  }

  function detachPlaybackListeners(element) {
    if (!element?._scholomanceBeatListeners) return;
    const { onTimeUpdate, onPlay, onPause } = element._scholomanceBeatListeners;
    element.removeEventListener('timeupdate', onTimeUpdate);
    element.removeEventListener('play', onPlay);
    element.removeEventListener('pause', onPause);
    delete element._scholomanceBeatListeners;
  }

  function emit() {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
  }

  function getPlaybackTimeMs() {
    if (!unlocked || !settings.enabled) return null;
    const element = ensureAudio();
    if (!element || element.paused) return null;
    const seconds = element.currentTime;
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }

  function isPlaybackActive() {
    return getPlaybackTimeMs() != null;
  }

  function getBeatSnapshot() {
    const timeMs = getPlaybackTimeMs();
    if (timeMs == null) return null;
    return resolveMusicBeatSnapshot(timeMs, currentPacing);
  }

  function getState() {
    const beatSnapshot = getBeatSnapshot();
    return {
      trackId: currentTrack.id,
      trackTitle: currentTrack.title,
      trackUrl,
      enabled: settings.enabled,
      active,
      unlocked,
      volume: settings.volume,
      cycleMinMs: GAME_BACKGROUND_MUSIC_CYCLE_MS.min,
      cycleMaxMs: GAME_BACKGROUND_MUSIC_CYCLE_MS.max,
      pacing: currentPacing,
      loopOnly,
      playbackTimeMs: beatSnapshot?.timeMs ?? null,
      beat: beatSnapshot?.beat ?? null,
      bar: beatSnapshot?.bar ?? null,
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  function bumpFadeGeneration() {
    fadeGeneration += 1;
    return fadeGeneration;
  }

  function isFadeCancelled(token) {
    return token !== fadeGeneration;
  }

  function runExclusive(task) {
    lifecycle = lifecycle
      .catch(() => {})
      .then(task)
      .catch((err) => {
        console.warn('[game-music] lifecycle task failed:', err);
      });
    return lifecycle;
  }

  function ensureAudio() {
    if (!canUseBrowser()) return null;
    if (isAudioElement(audio)) {
      attachPlaybackListeners(audio);
      return audio;
    }

    const element = document.createElement('audio');
    element.src = trackUrl;
    element.preload = 'auto';
    element.loop = true;
    element.volume = 0;
    element.style.cssText = 'width:0;height:0;opacity:0;pointer-events:none;position:absolute;';
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
    attachPlaybackListeners(element);
    audio = element;
    return audio;
  }

  function clearCycleTimer() {
    if (cycleTimer) {
      clearTimeout(cycleTimer);
      cycleTimer = null;
    }
  }

  async function restartCycle({ withFade = true } = {}) {
    const element = ensureAudio();
    if (!element || !active || !settings.enabled) return;

    const token = bumpFadeGeneration();
    if (withFade) {
      await fadeVolume(
        element,
        readAudioVolume(element, settings.volume),
        0,
        FADE_OUT_MS,
        () => isFadeCancelled(token) || !active,
      );
    }
    if (isFadeCancelled(token) || !active || !isAudioElement(element)) return;

    try {
      element.pause();
      element.currentTime = 0;
    } catch {
      // Ignore seek failures on teardown.
    }

    setAudioVolume(element, 0);
    scheduleNextCycle(token);

    try {
      await element.play();
    } catch (err) {
      console.warn('[game-music] playback blocked until user gesture:', err);
      return;
    }

    if (isFadeCancelled(token) || !active || !isAudioElement(element)) return;
    await fadeVolume(
      element,
      0,
      settings.volume,
      FADE_IN_MS,
      () => isFadeCancelled(token) || !active,
    );
  }

  function scheduleNextCycle(token = fadeGeneration) {
    clearCycleTimer();
    if (loopOnly) return;
    const durationMs = pickCycleDurationMs(
      GAME_BACKGROUND_MUSIC_CYCLE_MS.min,
      GAME_BACKGROUND_MUSIC_CYCLE_MS.max,
      randomFn,
    );
    cycleTimer = setTimeout(() => {
      if (isFadeCancelled(token) || !active) return;
      void restartCycle({ withFade: true });
    }, durationMs);
  }

  async function unlock() {
    if (unlocked) return true;
    const element = ensureAudio();
    if (!element) return false;

    try {
      element.muted = true;
      setAudioVolume(element, 0);
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
        if (!didUnlock || !settings.enabled || active || !intentToPlay) return;
        void runExclusive(() => startInternal());
      });
    };
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, unlockHandler, { passive: true });
    });
    unlockListenersAttached = true;
  }

  /** Preload track + register gesture unlock listeners (safe before first click). */
  function prime() {
    attachUnlockListeners();
    ensureAudio();
    emit();
  }

  async function startInternal() {
    if (!settings.enabled) return false;
    prime();
    if (!unlocked) return false;

    const element = ensureAudio();
    if (!element) return false;

    if (active && !element.paused) {
      return true;
    }

    const token = bumpFadeGeneration();
    active = true;
    emit();

    element.loop = true;
    setAudioVolume(element, 0);
    scheduleNextCycle(token);

    try {
      await element.play();
    } catch (err) {
      console.warn('[game-music] start failed:', err);
      active = false;
      emit();
      return false;
    }

    if (isFadeCancelled(token) || !active || !isAudioElement(element)) return false;

    await fadeVolume(
      element,
      0,
      settings.volume,
      FADE_IN_MS,
      () => isFadeCancelled(token) || !active,
    );
    return !isFadeCancelled(token) && active;
  }

  async function stopInternal() {
    const token = bumpFadeGeneration();
    clearCycleTimer();
    active = false;

    const element = audio;
    if (isAudioElement(element)) {
      try {
        await fadeVolume(
          element,
          readAudioVolume(element, settings.volume),
          0,
          FADE_OUT_MS,
          () => isFadeCancelled(token),
        );
      } catch {
        // Ignore fade failures during teardown.
      }

      if (!isFadeCancelled(token)) {
        try {
          element.pause();
          element.currentTime = 0;
        } catch {
          element.pause();
        }
      }
    }

    emit();
  }

  function start() {
    intentToPlay = true;
    return runExclusive(() => startInternal());
  }

  function stop() {
    intentToPlay = false;
    return runExclusive(() => stopInternal());
  }

  function setEnabled(enabled) {
    settings = { ...settings, enabled: Boolean(enabled) };
    writeSettings(storage, settings);
    emit();
    if (settings.enabled) {
      return start();
    }
    return stop();
  }

  function setVolume(volume) {
    settings = { ...settings, volume: clamp01(volume) };
    writeSettings(storage, settings);
    if (isAudioElement(audio) && active) {
      setAudioVolume(audio, settings.volume);
    }
    emit();
  }

  async function setMusicProfile(profile = {}) {
    const nextTrack = profile.track || currentTrack;
    const nextPacing = profile.pacing || currentPacing;
    const nextLoopOnly = profile.loopOnly ?? loopOnly;
    const urlChanged = nextTrack.url !== trackUrl;

    currentTrack = nextTrack;
    currentPacing = nextPacing;
    loopOnly = nextLoopOnly;

    if (!urlChanged) {
      emit();
      return true;
    }

    trackUrl = nextTrack.url;
    const wasActive = active;
    await stopInternal();

    const element = audio;
    if (isAudioElement(element)) {
      detachPlaybackListeners(element);
      try {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } catch {
        // Ignore teardown errors.
      }
      element.remove();
    }
    audio = null;
    cachedPlaybackTimeMs = null;
    emit();

    if (wasActive && settings.enabled && unlocked) {
      return startInternal();
    }
    return true;
  }

  function destroy() {
    bumpFadeGeneration();
    clearCycleTimer();
    detachUnlockListeners();
    active = false;

    const element = audio;
    if (isAudioElement(element)) {
      detachPlaybackListeners(element);
      try {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } catch {
        // Ignore teardown errors.
      }
      element.remove();
    }
    cachedPlaybackTimeMs = null;
    audio = null;
    listeners.clear();
    emit();
  }

  prime();

  return {
    subscribe,
    getState,
    getPlaybackTimeMs,
    isPlaybackActive,
    getBeatSnapshot,
    prime,
    unlock,
    start,
    stop,
    setEnabled,
    setVolume,
    setMusicProfile,
    destroy,
    pickCycleDurationMs: () => pickCycleDurationMs(
      GAME_BACKGROUND_MUSIC_CYCLE_MS.min,
      GAME_BACKGROUND_MUSIC_CYCLE_MS.max,
      randomFn,
    ),
  };
}

let singleton = null;

export function getGameBackgroundMusicService() {
  if (!singleton) {
    singleton = createGameBackgroundMusicService();
  }
  return singleton;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (singleton) {
      singleton.destroy();
      singleton = null;
    }
  });
}