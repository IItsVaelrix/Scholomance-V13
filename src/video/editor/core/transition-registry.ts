export interface TransitionDefinition {
  id: string;
  name: string;
  description: string;
  defaultDurationFrames: number;
}

export const TRANSITION_REGISTRY: TransitionDefinition[] = [
  { id: 'crossfade', name: 'Crossfade', description: 'Smoothly fade between two clips', defaultDurationFrames: 30 },
  { id: 'wipe-left', name: 'Wipe Left', description: 'Wipe from right to left', defaultDurationFrames: 30 },
  { id: 'dip-to-color', name: 'Dip to Color', description: 'Dip to a solid color', defaultDurationFrames: 30 },
  { id: 'glitch', name: 'Glitch', description: 'Digital glitch transition', defaultDurationFrames: 15 },
];

export function getTransitionDefinition(id: string): TransitionDefinition | undefined {
  return TRANSITION_REGISTRY.find(t => t.id === id);
}
