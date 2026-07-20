/** Heuristic-pacing parameters for the syllable/BPM fallback sync. Only
    measured values belong here (honesty law) — a track with no measured
    tempo carries no pacing block and uses DEFAULT_PACING, whose sync the
    UI already labels "estimated". */
export interface TrackPacing {
  bpm: number;
  /** First chorus line index; lines from here use chorusSylPerBeat. */
  chorusStartLine?: number;
  verseSylPerBeat: number;
  chorusSylPerBeat: number;
  leadInS: number;
  tailS: number;
  /** alignPhonemes cost/phoneme ceiling for couplet bar-sharing. */
  coupletCostMax: number;
}

export interface GrimoireTrack {
  id: string;
  title: string;
  artist: string;
  model: string;
  modelVersion: string;
  duration: number;
  sunoUrl: string;
  audioUrl: string;
  coverUrl: string;
  /** Optional static stage art for the visualiser orb. Falls back to coverUrl. */
  stageArtUrl?: string;
  meta: [string, string][];
  provenance: { statement: string; tools: string[]; assistance: string };
  lyrics: string[];
  annotations: { n: number; title: string; body: string }[];
  pacing?: TrackPacing;
}

export interface GrimoireAlbumTrack {
  trackId: string;
  trackNumber: number;
  discNumber?: number;
  titleOverride?: string;
  audioUrlOverride?: string;
  coverUrlOverride?: string;
  hidden?: boolean;
  bonus?: boolean;
}

export interface GrimoireAlbum {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  description: string;
  releaseDate: string;
  tracks: GrimoireAlbumTrack[];
  model?: string;
  modelVersion?: string;
  subtitle?: string;
  genres?: string[];
  totalDuration?: number;
  featured?: boolean;
  status?: "draft" | "released" | "archived";
}

/** Generic fallback for tracks without measured pacing. Deliberately bland:
    even spread, no chorus split, no lead-in claim. */
export const DEFAULT_PACING: TrackPacing = {
  bpm: 120,
  verseSylPerBeat: 1.2,
  chorusSylPerBeat: 1.2,
  leadInS: 0,
  tailS: 0,
  coupletCostMax: 0.75,
};
