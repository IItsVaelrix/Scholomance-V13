/**
 * Animation AMP — useAnimationSubmitter Hook
 * 
 * Provides an imperative function to submit animation intents to the AMP.
 * Ideal for use in event handlers or effects where the intent is dynamic.
 * 
 * @see ARCH_CONTRACT_OVERLAY_INTEGRITY.md - Layer separation requirements
 */

import { useCallback } from 'react';
import { submitAmpIntent } from '../../../lib/amp-client.js';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion.js';
import type { AnimationIntent, ResolvedMotionOutput } from '../../../types/animation';

/**
 * Hook to get a submission function for animation intents
 * 
 * @returns {Object} { submitIntent }
 */
export function useAnimationSubmitter() {
  const prefersReducedMotion = usePrefersReducedMotion();

  const submitIntent = useCallback(async (intent: AnimationIntent): Promise<ResolvedMotionOutput> => {
    // Augment intent with accessibility constraints
    const augmentedIntent = {
      ...intent,
      constraints: {
        reducedMotion: prefersReducedMotion,
        ...intent.constraints,
      }
    };

    // V12 PERFORMANCE: Submit intent which correctly bridges Main Thread lighting and WebWorker composition
    return await submitAmpIntent(augmentedIntent);
  }, [prefersReducedMotion]);

  return { submitIntent };
}
