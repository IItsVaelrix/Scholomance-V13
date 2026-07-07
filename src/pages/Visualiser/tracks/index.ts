export type { GrimoireTrack, TrackPacing } from './types';
export { DEFAULT_PACING } from './types';
export { PETRICHOR } from './petrichor';
export { BIG_FATHER } from './bigFather';
export { POLARITY } from './polarity';

import type { GrimoireTrack } from './types';
import { PETRICHOR } from './petrichor';
import { BIG_FATHER } from './bigFather';
import { POLARITY } from './polarity';

/** Shelf order = release order; first entry is the default track. */
export const GRIMOIRE_TRACKS: GrimoireTrack[] = [PETRICHOR, BIG_FATHER, POLARITY];
