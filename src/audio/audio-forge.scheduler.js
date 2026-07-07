/**
 * Audio Forge — Scheduler
 *
 * Coordinates: cache → worker → main-thread fallback → playback.
 *
 * AMENDMENT 1: Raw PCM Float32Array → createBuffer + copyToChannel.
 * decodeAudioData is for encoded file data (WAV/MP3/OGG), not raw samples.
 *
 * AMENDMENT 3: Stereo panning applied here via StereoPannerNode.
 * Core renderer returns mono. Adapter applies packet.routing.pan.
 *
 * AMENDMENT 4: Worker timeout/failure falls back to main-thread renderSfxBuffer
 * before the sine emergency tone. Worker is optional.
 *
 * LAYER: src/audio (browser adapter) — AudioContext required.
 */

import { AUDIO_WORKER_JOB_TYPES } from './audio-forge.worker.js';
import { createWorkerTimeoutError } from '../../codex/core/audio-forge/audio-bytecode-error.js';
import { renderSfxBuffer } from '../../codex/core/audio-forge/dsp/buffer-renderer.js';

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 96;
const audioBufferCache = new Map(); // checksum → AudioBuffer

function cacheGet(checksum) {
  return audioBufferCache.get(checksum) ?? null;
}

function cacheSet(checksum, audioBuffer) {
  if (!checksum || !audioBuffer) return;
  if (audioBufferCache.size >= MAX_CACHE_ENTRIES) {
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
 * Emergency sine burst when synthesis fails entirely.
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
    // Emergency tone also failed — silently eat it
  }
}

// ─── Worker Bridge ────────────────────────────────────────────────────────────

let _pendingJobs = new Map(); // jobId → { resolve, reject, timeoutId }

/**
 * Rejects all in-flight worker jobs (e.g. after worker crash).
 *
 * @param {Error} error
 */
export function rejectAllPendingWorkerJobs(error) {
  for (const [id, pending] of _pendingJobs.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
    _pendingJobs.delete(id);
  }
}

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

let _jobCounter = 0;

function nextJobId(eventType) {
  _jobCounter = (_jobCounter + 1) % 0xFFFFFF;
  return `AUDFOR-${eventType ?? 'JOB'}-${_jobCounter.toString(16).padStart(6, '0')}`;
}

/**
 * Renders packet PCM via worker, then main-thread fallback.
 *
 * @param {object} params
 * @param {object} params.packet
 * @param {number} params.sampleRate
 * @param {Worker|null} [params.worker]
 * @param {number} [params.workerTimeoutMs=400]
 * @returns {Promise<{ pcm: Float32Array|null, source: 'cache'|'worker'|'main'|'failed', diagnostics: string[] }>}
 */
export async function resolvePacketPcm({
  packet,
  sampleRate,
  worker = null,
  workerTimeoutMs = 400,
}) {
  const diagnostics = [];

  if (worker) {
    const jobId = nextJobId(packet.eventType);
    try {
      const response = await dispatchWorkerJob(
        worker,
        { id: jobId, type: AUDIO_WORKER_JOB_TYPES.RENDER_ONE_SHOT, packet, sampleRate },
        workerTimeoutMs,
      );
      if (response?.ok && response.buffer instanceof Float32Array && response.buffer.length > 0) {
        if (Array.isArray(response.diagnostics)) diagnostics.push(...response.diagnostics);
        return { pcm: response.buffer, source: 'worker', diagnostics };
      }
      if (response?.error) diagnostics.push(`WORKER_RENDER_FAILED:${response.error}`);
    } catch (err) {
      diagnostics.push(`WORKER_TIMEOUT_OR_ERROR:${err?.message ?? String(err)}`);
    }
  }

  const mainResult = renderSfxBuffer(packet, sampleRate);
  if (mainResult.ok && mainResult.channelData.length > 0) {
    diagnostics.push(...mainResult.diagnostics);
    return { pcm: mainResult.channelData, source: 'main', diagnostics };
  }

  diagnostics.push(...mainResult.diagnostics);
  return { pcm: null, source: 'failed', diagnostics };
}

/**
 * Resolves or renders an AudioBuffer for a packet (cache-aware).
 *
 * @param {object} params
 * @param {object} params.packet
 * @param {AudioContext} params.audioContext
 * @param {Worker|null} [params.worker]
 * @returns {Promise<{ audioBuffer: AudioBuffer|null, source: string, diagnostics: string[] }>}
 */
export async function resolvePacketAudioBuffer({ packet, audioContext, worker = null }) {
  const checksum = packet.checksum ?? '';
  const sampleRate = audioContext.sampleRate;

  const cached = checksum ? cacheGet(checksum) : null;
  if (cached) {
    return { audioBuffer: cached, source: 'cache', diagnostics: [] };
  }

  const { pcm, source, diagnostics } = await resolvePacketPcm({
    packet,
    sampleRate,
    worker,
  });

  if (!pcm || pcm.length === 0) {
    return { audioBuffer: null, source: 'failed', diagnostics };
  }

  const audioBuffer = createMonoAudioBuffer(audioContext, pcm, sampleRate);
  if (checksum) cacheSet(checksum, audioBuffer);
  return { audioBuffer, source, diagnostics };
}

/**
 * Schedules a PB-SFX-v1 packet for playback.
 *
 * @param {object} params
 * @param {object} params.packet
 * @param {AudioContext} params.audioContext
 * @param {Worker|null} [params.worker]
 * @param {import('./audio-mixer.js').AudioMixerInstance} params.mixer
 * @returns {Promise<void>}
 */
export async function schedulePacket({ packet, audioContext, worker = null, mixer }) {
  const panValue = packet?.routing?.pan ?? 0;
  const busName = packet?.routing?.bus ?? 'combat';

  const { audioBuffer } = await resolvePacketAudioBuffer({
    packet,
    audioContext,
    worker,
  });

  if (!audioBuffer) {
    playFallbackTone(packet, audioContext, mixer);
    return;
  }

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

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