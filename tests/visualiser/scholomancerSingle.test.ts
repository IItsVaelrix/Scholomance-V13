import { describe, it, expect } from 'vitest';
import { GRIMOIRE_ALBUMS } from '../../src/pages/Visualiser/tracks/albums';
import { GRIMOIRE_TRACKS } from '../../src/pages/Visualiser/tracks/index';

// Every value asserted here was sourced, not invented:
//   id / created  -> the mp3's ID3 comment tag ("made with suno; created=...; id=...")
//   lyrics        -> the mp3's embedded lyrics-eng tag
//   duration      -> ffprobe (174.42s)
//   sunoUrl       -> verified HTTP 200
//   audioUrl      -> verified HTTP 206
//   coverUrl      -> og:image on the song page, verified HTTP 200
// model/modelVersion came from Damien (a custom Suno model), which the tags and
// the Suno page do not carry.
const SUNO_ID = '8aa6dea3-0ba7-4f36-a419-9ee34fa16211';
const THAUMATURGY_ID = '5c6aee94-2583-435f-bbad-1439de23772d';
const REGRET_ID = 'b5a2ff2a-a16b-407f-8691-409da736599f';

describe('Scholomancer — the title track', () => {
  it('opens its album, which now also carries Sonic Thaumaturgy V2 and Regret V3', () => {
    const album = GRIMOIRE_ALBUMS.find((a) => a.id === 'scholomancer');
    expect(album).toBeDefined();
    expect(album!.title).toBe('Scholomancer');
    expect(album!.artist).toBe('Vaelrix');
    expect(album!.releaseDate).toBe('2026-07-15');
    // Editorial, not sourced from a tag (see the provenance note above): the
    // curated list was widened to four on 2026-07-18 (e7b43f71), a day after
    // this test was written, and the test had not caught up.
    expect(album!.genres).toEqual(['Hip-Hop', 'Rap', 'Hyperpop', 'Emo']);
    // Grew to seven; the opening three below are the part this test pins.
    expect(album!.tracks).toHaveLength(7);
    expect(album!.tracks[0]).toMatchObject({ trackId: SUNO_ID, trackNumber: 1 });
    expect(album!.tracks[1]).toMatchObject({ trackId: THAUMATURGY_ID, trackNumber: 2 });
    expect(album!.tracks[2]).toMatchObject({ trackId: REGRET_ID, trackNumber: 3 });
    // trackNumber must stay 1..n contiguous however many tracks are added —
    // the invariant the running order depends on, which a bare count is not.
    expect(album!.tracks.map((t) => t.trackNumber)).toEqual(
      album!.tracks.map((_, i) => i + 1),
    );
  });

  // The album's running order is Damien's artistic choice; the shelf claims to
  // be chronological. Regret V3's tag dates it July 1 — before Scholomancer —
  // so the two orders genuinely disagree, and this pins that they may.
  it('sits third on the album but earlier on the chronological shelf', () => {
    const shelf = GRIMOIRE_TRACKS.map((t) => t.id);
    expect(shelf.indexOf(REGRET_ID)).toBeLessThan(shelf.indexOf(SUNO_ID));
    expect(shelf.indexOf(SUNO_ID)).toBeLessThan(shelf.indexOf(THAUMATURGY_ID));
  });

  it('resolves to a real, playable track in the registry', () => {
    const t = GRIMOIRE_TRACKS.find((x) => x.id === SUNO_ID);
    expect(t).toBeDefined();
    expect(t!.title).toBe('Scholomancer');
    expect(t!.artist).toBe('Vaelrix');
    // 174.42s measured by ffprobe, floored — the meta row claims 2:54.
    expect(t!.duration).toBe(174);
    expect(t!.sunoUrl).toBe(`https://suno.com/song/${SUNO_ID}`);
    expect(t!.audioUrl).toBe(`https://cdn1.suno.ai/${SUNO_ID}.mp3`);
    expect(t!.coverUrl).toBe(`https://cdn2.suno.ai/image_${SUNO_ID}.jpeg`);
  });

  it('carries the embedded lyrics as sung text only', () => {
    const t = GRIMOIRE_TRACKS.find((x) => x.id === SUNO_ID)!;
    expect(t.lyrics.length).toBeGreaterThan(50);
    expect(t.lyrics[0]).toBe('Verbal tetrahedron');
    expect(t.lyrics.at(-1)).toBe('Scholomancer.');
    // The registry's law: no blank lines, no [Section] stage directions.
    for (const line of t.lyrics) {
      expect(line.trim()).not.toBe('');
      expect(line.startsWith('[')).toBe(false);
    }
  });

  it('declares only the pacing values Damien supplied', () => {
    // Honesty law (tracks/types.ts): "Only measured values belong here."
    // bpm 95 and the 12s instrumental lead-in come from Damien, who made the
    // track. The rest stay at DEFAULT_PACING's deliberately bland values —
    // an even spread with no chorus split — because nobody has measured them,
    // and a bland default is not a claim.
    const t = GRIMOIRE_TRACKS.find((x) => x.id === SUNO_ID)!;
    expect(t.pacing).toBeDefined();
    expect(t.pacing!.bpm).toBe(95);
    expect(t.pacing!.leadInS).toBe(12);
    expect(t.pacing!.verseSylPerBeat).toBe(1.2);
    expect(t.pacing!.chorusSylPerBeat).toBe(1.2);
    expect(t.pacing!.chorusStartLine).toBeUndefined();
  });
});
