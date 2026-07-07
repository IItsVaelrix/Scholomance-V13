/**
 * AMP Runtime Pipeline
 * 
 * Exposes Animation Motion Processor (AMP) functions via the eventBus
 * to allow UI components to interact with Codex without direct imports.
 * 
 * @see ARCH_CONTRACT_OVERLAY_INTEGRITY.md - Layer separation requirements
 */

import { on, emit } from './eventBus.js';
import { getAmpStatus, getAllActiveAnimations, getActiveAnimation } from '../../src/lib/amp-client.js';

/**
 * Get the current AMP status
 * @returns {Promise<Object>} AMP status object
 */
export async function getAmpRuntimeStatus() {
  return getAmpStatus();
}

/**
 * Get all active animations
 * @returns {Promise<Map<string, any>>} Map of targetId to animation output
 */
export async function getAmpActiveAnimations() {
  const entries = await getAllActiveAnimations();
  return entries;
}

/**
 * Get a single active animation by targetId
 * @param {string} targetId 
 * @returns {Promise<any>} Animation output or undefined
 */
export async function getAmpAnimation(targetId) {
  return getActiveAnimation(targetId);
}

/**
 * Setup the AMP pipeline event listeners
 * @returns {Function} Cleanup function
 */
export function setupAmpPipeline() {
  /**
   * Handle getAmpStatus requests
   */
  on('amp:getStatus', async (payload) => {
    const { responseEventName } = payload;
    const status = await getAmpRuntimeStatus();
    emit(responseEventName, { status });
  });

  /**
   * Handle getActiveAnimations requests
   */
  on('amp:getActiveAnimations', async (payload) => {
    const { responseEventName } = payload;
    const animations = await getAmpActiveAnimations();
    emit(responseEventName, { animations });
  });

  /**
   * Handle getActiveAnimation requests for a specific targetId
   */
  on('amp:getActiveAnimation', async (payload) => {
    const { targetId, responseEventName } = payload;
    const animation = await getAmpAnimation(targetId);
    emit(responseEventName, { animation: animation || null });
  });

  console.log('[AMP Pipeline] Initialized');

  return () => {
    // Cleanup function - eventBus handles removal via off()
    console.log('[AMP Pipeline] Cleanup complete');
  };
}

// Auto-setup when imported (runtime pipeline pattern)
let unsubscribe = null;

export function initializeAmpPipeline() {
  if (!unsubscribe) {
    unsubscribe = setupAmpPipeline();
  }
  return unsubscribe;
}

export function cleanupAmpPipeline() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
