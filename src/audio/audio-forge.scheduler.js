/**
 * Audio Forge — Scheduler
 *
 * Coordinates: cache → worker → AudioBuffer → playback.
 *
 * AMENDMENT 1: Raw PCM Float32Array → createBuffer + copyToChannel.
 * decodeAudioData is for encoded file data (WAV/MP3/OGG), not raw samples.
 *
 * AMENDMENT 3: Stereo panning applied here via StereoPannerNode.
 * Core renderer returns mono. Adapter applies packet.routing.pan.
 *
 * LAYER: src/audio (browser adapter) — AudioContext required.
 */

import { AUDIO_WORKER_JOB_TYPES } from './audio-forge.worker.js';
import { createWorkerTimeoutError } from '../../codex/core/audio-forge/audio-bytecode-error.js';

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 64;
const audioBufferCache = new Map(); // checksum → AudioBuffer

function cacheGet(checksum) {
  return audioBufferCache.get(checksum) ?? null;
}

function cacheSet(checksum, audioBuffer) {
  if (audioBufferCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry (Map preserves insertion order)
    const firstKey = audioBufferCache.keys().next().value;
    audioBufferCache.delete(firstKey);
  }
  audioBufferCache.set(checksum, audioBuffer);
}

export function clearAudioBufferCache() {
  audioBufferCache.clear();
}

// ─── PCM → AudioBuffer ────────────────────────────────────────────────────────

/**
 * Converts a raw mono PCM Float32Array into an AudioBuffer.
 *
 * IMPORTANT: This uses createBuffer + copyToChannel, NOT decodeAudioData.
 * decodeAudioData decodes encoded file formats (WAV/MP3/OGG).
 * Raw PCM samples must use createBuffer + copyToChannel.
 *
 * @param {AudioContext} audioContext
 * @param {Float32Array} channelData - Mono PCM samples in [-1, 1]
 * @param {number} sampleRate
 * @returns {AudioBuffer}
 */
export function createMonoAudioBuffer(audioContext, channelData, sampleRate) {
  const audioBuffer = audioContext.createBuffer(1, channelData.length, sampleRate);
  audioBuffer.copyToChannel(channelData, 0);
  return audioBuffer;
}

// ─── Fallback Tone ────────────────────────────────────────────────────────────

/**
 * Plays a simple sine burst when the worker times out.
 * Frequency is derived from packet.routing.bus for variety.
 * Never throws — always degrades gracefully.
 *
 * @param {object} packet
 * @param {AudioContext} audioContext
 * @param {import('./audio-mixer.js').AudioMixerInstance} mixer
 */
function playFallbackTone(packet, audioContext, mixer) {
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.value = 0.15;
    const panValue = packet?.routing?.pan ?? 0;
    const panner = audioContext.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, Number.isFinite(panValue) ? panValue : 0));

    osc.connect(gain);
    gain.connect(panner);
    if (mixer) {
      mixer.connectNode(panner, packet?.routing?.bus ?? 'combat');
    } else {
      panner.connect(audioContext.destination);
    }

    const durationSec = Math.max(0.05, (packet?.durationMs ?? 200) / 1000);
    const startAt = audioContext.currentTime + 0.01;
    const stopAt = startAt + durationSec;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(0.15, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    osc.start(startAt);
    osc.stop(stopAt);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); panner.disconnect(); } catch { /* no-op */ }
    };
  } catch {
    // Fallback tone also failed — silently eat it
  }
}

// ─── Worker Bridge ────────────────────────────────────────────────────────────

let _pendingJobs = new Map(); // jobId → { resolve, reject, timeoutId }

/**
 * Sends a job to the worker and awaits response.
 *
 * @param {Worker} worker
 * @param {object} message
 * @param {number} timeoutMs
 * @returns {Promise<object>} Worker response
 */
function dispatchWorkerJob(worker, message, timeoutMs = 300) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      _pendingJobs.delete(message.id);
      reject(createWorkerTimeoutError(message.id, timeoutMs));
    }, timeoutMs);

    _pendingJobs.set(message.id, { resolve, reject, timeoutId });
    worker.postMessage(message);
  });
}

/**
 * Routes an incoming worker message to the correct pending job resolver.
 * Must be called from the forge's onmessage handler.
 *
 * @param {MessageEvent} event
 */
export function handleWorkerMessage(event) {
  const response = event.data;
  if (!response?.id) return;
  const pending = _pendingJobs.get(response.id);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  _pendingJobs.delete(response.id);
  pending.resolve(response);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let _jobCounter = 0;

function nextJobId(eventType) {
  _jobCounter = (_jobCounter + 1) % 0xFFFFFF;
  return `AUDFOR-${eventType ?? 'JOB'}-${_jobCounter.toString(16).padStart(6, '0')}`;
}

/**
 * Schedules a PB-SFX-v1 packet for playback.
 *
 * Flow:
 *   1. Cache hit → play immediately from cached AudioBuffer
 *   2. Cache miss → dispatch RENDER_ONE_SHOT to worker
 *   3. Worker returns Float32Array → createBuffer + copyToChannel → cache → play
 *   4. Worker timeout → playFallbackTone
 *
 * @param {object} params
 * @param {object} params.packet        - PB-SFX-v1 packet
 * @param {AudioContext} params.audioContext
 * @param {Worker} params.worker
 * @param {import('./audio-mixer.js').AudioMixerInstance} params.mixer
 * @returns {Promise<void>}
 */
export async function schedulePacket({ packet, audioContext, worker, mixer }) {
  const checksum = packet.checksum ?? '';
  const sampleRate = audioContext.sampleRate;
  const panValue = packet?.routing?.pan ?? 0;
  const busName = packet?.routing?.bus ?? 'combat';

  // Cache hit
  let audioBuffer = cacheGet(checksum);

  // Cache miss: render via worker
  if (!audioBuffer) {
    const jobId = nextJobId(packet.eventType);
    let response;
    try {
      response = await dispatchWorkerJob(
        worker,
        { id: jobId, type: AUDIO_WORKER_JOB_TYPES.RENDER_ONE_SHOT, packet, sampleRate },
        400, // 400ms timeout for MVP one-shot sounds
      );
    } catch (_timeoutErr) {
      playFallbackTone(packet, audioContext, mixer);
      return;
    }

    if (!response?.ok || !(response.buffer instanceof Float32Array) || response.buffer.length === 0) {
      playFallbackTone(packet, audioContext, mixer);
      return;
    }

    // AMENDMENT 1: raw PCM → createBuffer + copyToChannel. Never decodeAudioData.
    audioBuffer = createMonoAudioBuffer(audioContext, response.buffer, sampleRate);
    if (checksum) cacheSet(checksum, audioBuffer);
  }

  // Play
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  // AMENDMENT 3: pan in browser adapter, never in core
  const panner = audioContext.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, Number.isFinite(panValue) ? panValue : 0));

  source.connect(panner);

  if (mixer) {
    mixer.connectNode(panner, busName);
  } else {
    panner.connect(audioContext.destination);
  }

  source.start(audioContext.currentTime);
  source.onended = () => {
    try { source.disconnect(); panner.disconnect(); } catch { /* no-op */ }
  };
}
