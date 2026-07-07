// Pared down to a single soundscape for now — the focus-mode mixer exposes just
// one knob (Rain + Forest Stream). Re-add 'cafe'/'wind' here to restore them.
export const AMBIENCE_CHANNELS = ['rain'];

export const AMBIENCE_ASSETS = Object.freeze({
  rain: '/audio/ambience/rain-forest-stream.mp3',
});

export const AMBIENCE_STORAGE_KEY = 'scholomance.focus.ambience.v1';

const CHANNEL_FADE_MS = 120;
const MASTER_FADE_MS = 400;
const MASTER_TRIM_MS = 60;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function createAmbienceMixerService({ createEngine }) {
  let engine = null;
  const listeners = new Set();
  const state = {
    running: false,
    master: 0.7,
    channels: {
      rain: { enabled: false, volume: 0.5, available: true },

    },
  };

  function snapshot() {
    return {
      running: state.running,
      master: state.master,
      channels: Object.fromEntries(
        AMBIENCE_CHANNELS.map((id) => [id, { ...state.channels[id] }]),
      ),
    };
  }

  function emit() {
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  }

  function ensureEngine() {
    if (!engine) {
      engine = createEngine();
      engine.onAvailabilityChange((availability) => {
        for (const id of AMBIENCE_CHANNELS) {
          state.channels[id].available = Boolean(availability[id]);
        }
        for (const id of AMBIENCE_CHANNELS) applyChannelGain(id, CHANNEL_FADE_MS);
        emit();
      });
    }
    return engine;
  }

  function applyChannelGain(id, rampMs) {
    if (!engine) return;
    const ch = state.channels[id];
    const value = ch.enabled && ch.available ? ch.volume : 0;
    engine.setChannelGain(id, value, rampMs);
  }

  async function start() {
    const e = ensureEngine();
    await e.resume();
    state.running = true;
    e.setMasterGain(state.master, MASTER_FADE_MS);
    for (const id of AMBIENCE_CHANNELS) applyChannelGain(id, CHANNEL_FADE_MS);
    emit();
  }

  async function stop() {
    if (engine) {
      engine.setMasterGain(0, MASTER_FADE_MS);
      await engine.suspend();
    }
    state.running = false;
    emit();
  }

  function setMasterVolume(value) {
    state.master = clamp01(value);
    if (state.running) ensureEngine().setMasterGain(state.master, MASTER_TRIM_MS);
    emit();
  }

  async function setChannelEnabled(id, enabled) {
    if (!state.channels[id]) return;
    state.channels[id].enabled = Boolean(enabled);
    if (enabled && !state.running) {
      await start();
      return;
    }
    applyChannelGain(id, CHANNEL_FADE_MS);
    emit();
  }

  function setChannelVolume(id, value) {
    if (!state.channels[id]) return;
    state.channels[id].volume = clamp01(value);
    applyChannelGain(id, CHANNEL_FADE_MS);
    emit();
  }

  function loadConfig(config) {
    if (!config) return;
    if (config.master != null) state.master = clamp01(config.master);
    for (const id of AMBIENCE_CHANNELS) {
      const c = config.channels && config.channels[id];
      if (!c) continue;
      if (c.volume != null) state.channels[id].volume = clamp01(c.volume);
      state.channels[id].enabled = Boolean(c.enabled);
    }
    emit();
  }

  return {
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setMasterVolume,
    setChannelEnabled,
    setChannelVolume,
    start,
    stop,
    loadConfig,
  };
}

export function createWebAudioEngine() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const availability = {};
  const reportedAvailability = {};
  let availabilityCb = null;
  const channels = {};
  const desiredGain = {};

  for (const id of AMBIENCE_CHANNELS) {
    availability[id] = false;
    reportedAvailability[id] = null; // unknown — forces first update through
    desiredGain[id] = 0;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const el = new Audio(AMBIENCE_ASSETS[id]);
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.addEventListener('canplaythrough', () => {
      if (reportedAvailability[id] === true) return;
      availability[id] = true;
      reportedAvailability[id] = true;
      if (availabilityCb) availabilityCb({ ...availability });
    }, { once: true });
    el.addEventListener('error', () => {
      if (reportedAvailability[id] === false) return;
      availability[id] = false;
      reportedAvailability[id] = false;
      if (availabilityCb) availabilityCb({ ...availability });
    });
    const src = ctx.createMediaElementSource(el);
    src.connect(gain);
    channels[id] = { gain, el };
  }

  function ramp(param, value, rampMs) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + rampMs / 1000);
  }

  return {
    setChannelGain(id, value, rampMs) {
      const c = channels[id];
      if (!c) return;
      desiredGain[id] = value;
      ramp(c.gain.gain, value, rampMs);
      if (value > 0) {
        if (c.el.paused) c.el.play().catch(() => {});
      } else {
        c.el.pause();
      }
    },
    setMasterGain(value, rampMs) { ramp(master.gain, value, rampMs); },
    async resume() {
      await ctx.resume();
      for (const id of AMBIENCE_CHANNELS) {
        if (desiredGain[id] > 0) channels[id].el.play().catch(() => {});
      }
    },
    async suspend() {
      for (const id of AMBIENCE_CHANNELS) channels[id].el.pause();
      await ctx.suspend();
    },
    onAvailabilityChange(cb) { availabilityCb = cb; },
  };
}

let singleton = null;
export function getAmbienceMixerService() {
  if (!singleton) {
    singleton = createAmbienceMixerService({ createEngine: createWebAudioEngine });
  }
  return singleton;
}
