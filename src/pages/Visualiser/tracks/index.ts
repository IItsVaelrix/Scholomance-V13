export type { GrimoireTrack, TrackPacing } from './types';
export { DEFAULT_PACING } from './types';
export { PETRICHOR } from './petrichor';
export { BIG_FATHER } from './bigFather';
export { POLARITY } from './polarity';
export { DAYDREAMING_NIGHTMARES } from './daydreaming-nightmares';

import type { GrimoireTrack } from './types';
import { PETRICHOR } from './petrichor';
import { BIG_FATHER } from './bigFather';
import { POLARITY } from './polarity';
import { DAYDREAMING_NIGHTMARES } from './daydreaming-nightmares';

/** Shelf order = release order; first entry is the default track. */
export const GRIMOIRE_TRACKS: GrimoireTrack[] = [PETRICHOR, BIG_FATHER, POLARITY, DAYDREAMING_NIGHTMARES];
