/**
 * Audio Forge — Main Facade
 *
 * Creates and owns the AudioForge instance: AudioContext lifecycle,
 * worker bridge, packet queue, and the public API.
 *
 * AMENDMENT 2: AudioContext ownership is explicit.
 * AMENDMENT 4: Worker is optional; synthesis falls back to main thread.
 *
 * LAYER: src/audio (browser adapter) — requires browser APIs.
 */

import { createAudioMixer, AUDIO_BUSES } from './audio-mixer.js';
import {
  schedulePacket,
  handleWorkerMessage,
  clearAudioBufferCache,
  rejectAllPendingWorkerJobs,
  resolvePacketAudioBuffer,
} from './audio-forge.scheduler.js';
import { resolveIntent } from './sfx-intent-resolver.js';

function createOwnedAudioContext() {
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    return new AudioCtx();
  } catch {
    return null;
  }
}

function createForgeWorker() {
  try {
    return new Worker(
      new URL('./audio-forge.worker.js', import.meta.url),
      { type: 'module' },
    );
  } catch {
    return null;
  }
}

const MAX_QUEUE_SIZE = 64;

/**
 * Creates a PixelBrain Audio Forge instance.
 *
 * @param {object} [options]
 * @param {AudioContext} [options.audioContext] - External context (forge will NOT close it)
 * @returns {AudioForgeInstance}
 */
export function createPixelBrainAudioForge(options = {}) {
  const externalContext = options.audioContext ?? null;
  let audioContext = externalContext ?? createOwnedAudioContext();
  const ownsContext = externalContext === null;

  let worker = createForgeWorker();
  let workerEnabled = worker != null;
  let mixer = audioContext ? createAudioMixer(audioContext) : null;
  let disposed = false;
  let muted = false;
  const pendingQueue = [];

  function disableWorker(reason) {
    if (!workerEnabled) return;
    workerEnabled = false;
    rejectAllPendingWorkerJobs(new Error(reason ?? 'AudioForge worker disabled'));
    worker?.terminate();
    worker = null;
    console.warn('[AudioForge] Worker disabled:', reason);
  }

  if (worker) {
    worker.onmessage = (event) => handleWorkerMessage(event);
    worker.onerror = (err) => {
      disableWorker(err?.message ?? 'worker error');
    };
  }

  async function ensureContextRunning() {
    if (!audioContext) return false;
    if (audioContext.state === 'suspended' || audioContext.state === 'interrupted') {
      try {
        await audioContext.resume();
      } catch {
        return false;
      }
    }
    return audioContext.state === 'running';
  }

  async function flushQueue() {
    if (pendingQueue.length === 0) return;
    const running = await ensureContextRunning();
    if (!running) return;
    while (pendingQueue.length > 0) {
      const packet = pendingQueue.shift();
      _playPacketNow(packet).catch(() => {});
    }
  }

  async function _playPacketNow(packet) {
    if (!audioContext || !mixer || disposed) return;
    await schedulePacket({
      packet,
      audioContext,
      worker: workerEnabled ? worker : null,
      mixer,
    });
  }

  return {
    get ready() {
      return !disposed && audioContext?.state === 'running';
    },

    get muted() {
      return muted;
    },

    async unlock() {
      if (disposed || !audioContext) return;
      await ensureContextRunning();
      await flushQueue();
    },

    async playPacket(packet) {
      if (disposed || muted) return;
      const running = await ensureContextRunning();
      if (!running) {
        if (pendingQueue.length < MAX_QUEUE_SIZE) {
          pendingQueue.push(packet);
        }
        return;
      }
      await _playPacketNow(packet);
    },

    async scheduleSfx(eventType, eventData = {}) {
      if (disposed || muted) return;
      try {
        const { packet } = resolveIntent(eventType, eventData);
        await this.playPacket(packet);
      } catch (err) {
        console.warn(`[AudioForge] scheduleSfx failed for "${eventType}":`, err?.message ?? err);
      }
    },

    async emitSfx(eventType, eventData = {}) {
      return this.scheduleSfx(eventType, eventData);
    },

    setMuted(value) {
      muted = Boolean(value);
    },

    async prewarmEventTypes(eventTypes = []) {
      if (disposed || !audioContext || !Array.isArray(eventTypes)) return;
      const running = await ensureContextRunning();
      if (!running) return;
      for (const eventType of eventTypes) {
        try {
          const { packet } = resolveIntent(eventType, { surface: 'stone', stepIndex: 0 });
          await resolvePacketAudioBuffer({
            packet,
            audioContext,
            worker: workerEnabled ? worker : null,
          });
        } catch {
          // Best-effort cache warm.
        }
      }
    },

    setVolume(bus, value) {
      if (disposed || !mixer) return;
      mixer.setVolume(bus, value);
    },

    dispose({ closeAudioContext = false } = {}) {
      if (disposed) return;
      disposed = true;

      disableWorker('dispose');
      mixer?.disconnect();
      mixer = null;
      pendingQueue.length = 0;
      clearAudioBufferCache();

      if (audioContext && ownsContext && closeAudioContext) {
        audioContext.close().catch(() => {});
      }
      audioContext = null;
    },

    BUSES: AUDIO_BUSES,
  };
}