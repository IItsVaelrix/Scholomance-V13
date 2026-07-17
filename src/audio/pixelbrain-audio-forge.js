/**
 * Audio Forge — Main Facade
 *
 * Creates and owns the AudioForge instance: AudioContext lifecycle,
 * worker bridge, packet queue, and the public API.
 *
 * AMENDMENT 2: AudioContext ownership is explicit.
 * dispose({ closeAudioContext }) defaults to false.
 * External contexts (ambience, music) are never closed blindly.
 *
 * LAYER: src/audio (browser adapter) — requires browser APIs.
 */

import { createAudioMixer, AUDIO_BUSES } from './audio-mixer.js';
import { schedulePacket, handleWorkerMessage, clearAudioBufferCache } from './audio-forge.scheduler.js';
import { resolveIntent } from './sfx-intent-resolver.js';

// ─── Context Creation ─────────────────────────────────────────────────────────

function createOwnedAudioContext() {
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    return new AudioCtx();
  } catch {
    return null;
  }
}

// ─── Worker Factory ───────────────────────────────────────────────────────────

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

// ─── Packet Queue (for pre-gesture buffering) ─────────────────────────────────

const MAX_QUEUE_SIZE = 32;

// ─── Forge Factory ────────────────────────────────────────────────────────────

/**
 * Creates a PixelBrain Audio Forge instance.
 *
 * @param {object} [options]
 * @param {AudioContext} [options.audioContext] - External context (forge will NOT close it)
 * @returns {AudioForgeInstance}
 */
export function createPixelBrainAudioForge(options = {}) {
  // Ownership tracking — critical for AMENDMENT 2
  const externalContext = options.audioContext ?? null;
  let audioContext = externalContext ?? createOwnedAudioContext();
  const ownsContext = externalContext === null;

  let worker = createForgeWorker();
  let mixer = audioContext ? createAudioMixer(audioContext) : null;
  let disposed = false;
  let muted = false;

  // Pre-gesture packet queue
  const pendingQueue = [];

  // Wire worker message handler
  if (worker) {
    worker.onmessage = (event) => handleWorkerMessage(event);
    worker.onerror = (err) => {
      console.warn('[AudioForge] Worker error:', err.message);
    };
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────────

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
    if (!audioContext || !worker || !mixer || disposed) return;
    await schedulePacket({ packet, audioContext, worker, mixer });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    /** Whether the AudioContext is running. */
    get ready() {
      return !disposed && audioContext?.state === 'running';
    },

    /** Whether globally muted. */
    get muted() {
      return muted;
    },

    /**
     * Unlocks the AudioContext after a user gesture.
     * Call from a pointerdown or keydown handler.
     */
    async unlock() {
      if (disposed || !audioContext) return;
      await ensureContextRunning();
      await flushQueue();
    },

    /**
     * Plays a pre-built PB-SFX-v1 packet directly.
     * If context is suspended, queues the packet until unlock().
     *
     * @param {object} packet
     * @returns {Promise<void>}
     */
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

    /**
     * Resolves a game event into a packet, then schedules it.
     * The canonical path for combat and game events.
     *
     * @param {string} eventType
     * @param {object} [eventData]
     * @returns {Promise<void>}
     */
    async scheduleSfx(eventType, eventData = {}) {
      if (disposed || muted) return;
      try {
        const { packet } = resolveIntent(eventType, eventData);
        await this.playPacket(packet);
      } catch (err) {
        // Intent resolution or playback failed — never propagate to combat
        console.warn(`[AudioForge] scheduleSfx failed for "${eventType}":`, err?.message ?? err);
      }
    },

    /**
     * Alias for scheduleSfx — event-bus compatible.
     * Combat and Phaser can emitSfx without knowing audio internals.
     */
    async emitSfx(eventType, eventData = {}) {
      return this.scheduleSfx(eventType, eventData);
    },

    /**
     * Sets the volume for a named bus.
     *
     * @param {string} bus - One of AUDIO_BUSES values
     * @param {number} value - [0, 1]
     */
    setVolume(bus, value) {
      if (disposed || !mixer) return;
      mixer.setVolume(bus, value);
    },

    /**
     * Disposes the forge.
     *
     * AMENDMENT 2: closeAudioContext defaults to false.
     * Only close the context if this forge created and owns it.
     *
     * @param {object} [opts]
     * @param {boolean} [opts.closeAudioContext=false]
     */
    dispose({ closeAudioContext = false } = {}) {
      if (disposed) return;
      disposed = true;

      // Always: terminate worker, disconnect mixer, clear pending queue
      worker?.terminate();
      worker = null;
      mixer?.disconnect();
      mixer = null;
      pendingQueue.length = 0;
      clearAudioBufferCache();

      // Close context only if we own it AND caller explicitly opts in
      if (audioContext && ownsContext && closeAudioContext) {
        audioContext.close().catch(() => {});
      }
      audioContext = null;
    },

    // Expose bus names for consumers
    BUSES: AUDIO_BUSES,
  };
}
