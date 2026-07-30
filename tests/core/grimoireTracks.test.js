import { describe, expect, it } from 'vitest';
import { GRIMOIRE_TRACKS } from '../../src/pages/Visualiser/tracks';

describe('GRIMOIRE_TRACKS registry', () => {
  it('has at least two tracks, Petrichor first (default track)', () => {
    expect(GRIMOIRE_TRACKS.length).toBeGreaterThanOrEqual(2);
    expect(GRIMOIRE_TRACKS[0].title).toBe('Petrichor');
    expect(GRIMOIRE_TRACKS.map((t) => t.title)).toContain('Big Father');
  });

  it('has unique ids', () => {
    const ids = GRIMOIRE_TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GRIMOIRE_TRACKS.map((t) => [t.title, t]))('%s is well-formed', (_title, t) => {
    const isLocal = t.model === 'local';
    // Remote tracks use UUIDs; local tracks may use slugs.
    if (isLocal) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
    } else {
      expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(t.duration).toBeGreaterThan(0);
    // sunoUrl is a provenance link for remote tracks; local tracks may omit.
    if (!isLocal) {
      expect(t.sunoUrl).toMatch(/^https:\/\//);
    }
    // audioUrl / coverUrl may be HTTPS CDN, local media paths, or empty for local.
    for (const url of [t.audioUrl, t.coverUrl]) {
      if (url) expect(url).toMatch(/^(https:\/\/|\/)/);
    }
    expect(t.lyrics.length).toBeGreaterThan(0);
    for (const line of t.lyrics) {
      expect(typeof line).toBe('string');
      expect(line.trim()).not.toBe('');
    }
    // Section markers ([Chorus] etc.) are allowed in local tracks with raw lyrics.
    if (!isLocal) {
      for (const line of t.lyrics) {
        expect(line.startsWith('[')).toBe(false);
      }
    }
    for (const a of t.annotations ?? []) {
      expect(a.n).toBeGreaterThanOrEqual(0);
      expect(a.n).toBeLessThan(t.lyrics.length);
    }
    if (t.pacing) {
      expect(t.pacing.bpm).toBeGreaterThan(0);
      expect(t.pacing.verseSylPerBeat).toBeGreaterThan(0);
    }
  });
});
