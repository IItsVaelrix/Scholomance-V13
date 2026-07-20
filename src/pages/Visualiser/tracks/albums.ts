import type { GrimoireAlbum } from './types';
// Import track modules directly — never via ./index — to avoid a circular
// dependency (index re-exports albums; albums must not import the barrel).
import { PETRICHOR } from './petrichor';
import { BIG_FATHER } from './bigFather';
import { POLARITY } from './polarity';
import { DAYDREAMING_NIGHTMARES } from './daydreaming-nightmares';
import { SCHOLOMANCER } from './scholomancer';
import { SONIC_THAUMATURGY } from './sonic-thaumaturgy';
import { REGRET } from './regret';
import { BOTTLED_MESSAGE } from './bottled-message';
import { BROWN_DWARF } from './brown-dwarf';

export const GRIMOIRE_ALBUMS: GrimoireAlbum[] = [
  {
    id: 'grimoire-vol-1',
    title: 'Grimoire Vol. I',
    artist: 'Vaelrix',
    coverUrl: PETRICHOR.coverUrl,
    description: 'The first collection of Suno incantations — cinematic emo rock, hyperpop, and dark ambient forged through the Vaelrix persona.',
    releaseDate: '2026-06-10',
    status: 'released',
    genres: ['Cinematic Emo Rock', 'Hyperpop', 'Dark Ambient'],
    tracks: [
      { trackId: PETRICHOR.id, trackNumber: 1 },
      { trackId: BIG_FATHER.id, trackNumber: 2 },
      { trackId: POLARITY.id, trackNumber: 3 },
      { trackId: DAYDREAMING_NIGHTMARES.id, trackNumber: 4 },
    ],
  },
  {
    id: 'scholomancer',
    title: 'Scholomancer',
    artist: 'Vaelrix',
    // Damien's own cover art, not the Suno-generated image the tracks carry.
    // BASE_URL-relative so it survives a deploy under a subpath, matching how
    // useLyricAlignment resolves its artifacts.
    coverUrl: `${import.meta.env.BASE_URL}media/scholomancer-cover.png`,
    description: 'Dense internal rhyme over a custom Suno model.',
    releaseDate: '2026-07-15',
    status: 'released',
    genres: ['Hip-Hop', 'Rap', 'Hyperpop', 'Emo'],
    tracks: [
      { trackId: SCHOLOMANCER.id, trackNumber: 1 },
      { trackId: SONIC_THAUMATURGY.id, trackNumber: 2 },
      { trackId: REGRET.id, trackNumber: 3 },
      { trackId: BOTTLED_MESSAGE.id, trackNumber: 4 },
      { trackId: BROWN_DWARF.id, trackNumber: 5 },
    ],
  },
];
