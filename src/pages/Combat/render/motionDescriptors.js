/**
 * motionDescriptors.js
 *
 * PixelBrain-friendly visual envelopes for combat animations.
 * Decouples "What to show" (intent) from "How it feels" (descriptor).
 */

export const MOTION_ENVELOPES = {
  // --- Unit Envelopes ---
  PHONEMIC_STEP: {
    anticipation: { duration: 250, ease: 'Sine.easeInOut', scaleY: 0.8 },
    traversal: { duration: 1100, ease: 'Cubic.easeInOut', scaleY: 1.05 },
    settle: { duration: 200, ease: 'Back.easeOut', scaleY: 1.0 },
    particles: { frequency: 15, alpha: 0.4, lifespan: 800 }
  },

  LEXICAL_CHARGE: {
    anticipation: { duration: 300, ease: 'Sine.easeInOut', angle: 15, scale: 1.1 },
    pulse: { duration: 400, ease: 'Expo.easeOut', scale: 3.0, alpha: 0 },
    particles: { quantity: 20, speed: 80 }
  },

  // --- Tile Envelopes ---
  IMPACT_FLASH: {
    flash: { duration: 200, alpha: 0.8 },
    shake: { duration: 150, intensity: 0.005 },
    particles: { quantity: 15, speed: 150 }
  },

  // --- Board Envelopes ---
  TURN_SWEEP: {
    dim: { duration: 400, alpha: 0.6 },
    aura: { duration: 400, scale: 1.2, ease: 'Back.easeOut' }
  }
};

/**
 * Maps linguistic signals to motion descriptor overrides.
 * High resonance increases speed and intensity.
 */
export function deriveDescriptorFromSignals(intentType, signals = {}) {
  const base = MOTION_ENVELOPES[intentType] || {};
  const resonance = signals.resonance || 0.5; // 0.0 to 1.0

  // Deep clone for mutation
  const descriptor = JSON.parse(JSON.stringify(base));

  if (intentType === 'IMPACT_FLASH') {
    descriptor.shake.intensity *= (0.5 + resonance);
    descriptor.flash.duration *= (0.8 + resonance * 0.4);
    descriptor.particles.quantity = Math.round(descriptor.particles.quantity * (0.8 + resonance));
  }

  if (intentType === 'LEXICAL_CHARGE') {
    descriptor.anticipation.duration /= (0.8 + resonance * 0.4);
    descriptor.pulse.scale *= (0.8 + resonance * 0.4);
  }

  return descriptor;
}
