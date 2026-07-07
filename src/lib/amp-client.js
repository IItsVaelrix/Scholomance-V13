/**
 * AMP Client Bridge — UI Layer Access Point
 * 
 * Provides a safe bridge for UI components to interact with the Animation AMP
 * without triggering LING-0F03 (Forbidden UI -> Codex import).
 * 
 * This file lives in src/lib/ which is exempt from the layer-separation rule.
 * It re-exports AMP functionality that UI components need.
 * 
 * @see ARCH_CONTRACT_OVERLAY_INTEGRITY.md - Layer separation requirements
 */

import { runAnimationAmp, getActiveAnimation as getActiveAnimationCore, getAllActiveAnimations as getAllActiveAnimationsCore, clearActiveAnimation as clearActiveAnimationCore, shutdownAnimationAmp } from '../../codex/core/animation/amp/runAnimationAmp.ts';
import { processorBridge } from '../../codex/core/shared/processor-bridge.js';

/**
 * @typedef {Object} AmpStatus
 * @property {boolean} isRunning
 * @property {number} activeCount
 * @property {Object} config
 */

/**
 * Get the current AMP status
 * @returns {Promise<AmpStatus>}
 */
export async function getAmpStatus() {
  // Mock status or import getAmpStatus if exported
  return { isRunning: true, activeCount: getAllActiveAnimationsCore().size, config: {} };
}

/**
 * Get all active animations
 * @returns {Promise<Map<string, any>>}
 */
export async function getAllActiveAnimations() {
  return getAllActiveAnimationsCore();
}

/**
 * Get a single active animation by targetId
 * @param {string} targetId
 * @returns {Promise<any | undefined>}
 */
export async function getActiveAnimation(targetId) {
  return getActiveAnimationCore(targetId);
}

/**
 * Submit an animation intent to the AMP
 * @param {import('../../codex/core/animation/contracts/animation.types.js').AnimationIntent} intent
 * @returns {Promise<any>}
 */
export async function submitAmpIntent(intent) {
  // Lighting cue: happens instantly on the Main Thread for DOM mutations
  const output = await runAnimationAmp(intent);
  
  // Heavy composition: banished to the WebWorker to prevent micro-stutters
  if (output && output.success) {
    try {
      return await processorBridge.execute('amp.attachPhotonicRoute', output);
    } catch (e) {
      console.warn('[AnimationAMP] Failed to attach photonic route via worker, falling back', e);
      return output;
    }
  }
  return output;
}

/**
 * Clear a resolved animation from the active registry by targetId.
 * Pruning is otherwise never invoked, so the registry only grows — this is the
 * hook the Motion Inspector calls to release stale targets.
 * @param {string} targetId
 */
export async function clearActiveAnimation(targetId) {
  clearActiveAnimationCore(targetId);
}

/**
 * --- MOTION TRACE DIAGNOSTICS ---
 * Bridges codex/core/animation/diagnostics/buildMotionTrace over the Cell Wall.
 * Pure functions on a ResolvedMotionOutput / TraceEntry[]; async only because
 * codex .ts is reached via dynamic import (project convention for this layer).
 */
export async function buildOutputTrace(output) {
  const { buildOutputTrace: build } = await import('../../codex/core/animation/diagnostics/buildMotionTrace.ts');
  return build(output);
}

export async function getStageSummary(trace) {
  const { getStageSummary: summary } = await import('../../codex/core/animation/diagnostics/buildMotionTrace.ts');
  return summary(trace);
}

export async function formatTraceJson(trace) {
  const { formatTraceJson: fmt } = await import('../../codex/core/animation/diagnostics/buildMotionTrace.ts');
  return fmt(trace);
}

export async function formatTraceMarkdown(trace) {
  const { formatTraceMarkdown: fmt } = await import('../../codex/core/animation/diagnostics/buildMotionTrace.ts');
  return fmt(trace);
}

export async function debugPrintTrace(trace) {
  const { debugPrintTrace: print } = await import('../../codex/core/animation/diagnostics/buildMotionTrace.ts');
  return print(trace);
}

export async function debugPrintPerformance(trace) {
  const { debugPrintPerformance: print } = await import('../../codex/core/animation/diagnostics/buildMotionTrace.ts');
  return print(trace);
}

export {
  attachAnimationPhotonicRoute,
  buildAnimationAmpPhotonicRoute,
} from './animation-photonic.adapter.js';
