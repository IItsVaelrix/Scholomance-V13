import { describe, expect, it } from 'vitest';
import {
  GAME_BATTLE_MUSIC_TRACK,
  GAME_BACKGROUND_MUSIC_TRACK,
  GAME_BATTLE_MUSIC_PACING,
  GAME_BACKGROUND_MUSIC_PACING,
  GAME_FOREST_MUSIC_PACING,
  GAME_FOREST_MUSIC_TRACKS,
  isCombatMusicRoute,
  pickForestMusicTrack,
  resetForestMusicTrackCursor,
  resolveBattleMusicProfile,
  resolveForestMusicProfile,
  resolveMusicProfileForPath,
} from '../../src/lib/audio/gameBackgroundMusic.config.js';

describe('gameBackgroundMusic.config', () => {
  it('uses ambient music on combat routes during free roam', () => {
    const profile = resolveMusicProfileForPath('/combat');
    expect(profile.track).toEqual(GAME_BACKGROUND_MUSIC_TRACK);
    expect(profile.pacing).toEqual(GAME_BACKGROUND_MUSIC_PACING);
    expect(profile.loopOnly).toBe(false);
  });

  it('uses ambient music on non-combat routes', () => {
    const profile = resolveMusicProfileForPath('/read');
    expect(profile.track).toEqual(GAME_BACKGROUND_MUSIC_TRACK);
    expect(profile.pacing).toEqual(GAME_BACKGROUND_MUSIC_PACING);
    expect(profile.loopOnly).toBe(false);
  });

  it('exposes battle music only through the battle profile resolver', () => {
    const profile = resolveBattleMusicProfile();
    expect(profile.track).toEqual(GAME_BATTLE_MUSIC_TRACK);
    expect(profile.pacing).toEqual(GAME_BATTLE_MUSIC_PACING);
    expect(profile.loopOnly).toBe(true);
  });

  it('recognizes combat routes', () => {
    expect(isCombatMusicRoute('/combat')).toBe(true);
    expect(isCombatMusicRoute('/combat/arena')).toBe(true);
    expect(isCombatMusicRoute('/read')).toBe(false);
  });

  it('exposes both Arboreal Nexus forest tracks', () => {
    expect(GAME_FOREST_MUSIC_TRACKS).toHaveLength(2);
    expect(GAME_FOREST_MUSIC_TRACKS[0].url).toContain('the-arboreal-nexus.mp3');
    expect(GAME_FOREST_MUSIC_TRACKS[1].url).toContain('the-arboreal-nexus-2.mp3');
  });

  it('alternates forest tracks across entries', () => {
    resetForestMusicTrackCursor();
    const first = pickForestMusicTrack();
    const second = pickForestMusicTrack();
    expect(first.id).toBe('the-arboreal-nexus');
    expect(second.id).toBe('the-arboreal-nexus-2');
  });

  it('resolves forest profile with looping Arboreal Nexus', () => {
    resetForestMusicTrackCursor();
    const profile = resolveForestMusicProfile();
    expect(GAME_FOREST_MUSIC_TRACKS).toContainEqual(profile.track);
    expect(profile.pacing).toEqual(GAME_FOREST_MUSIC_PACING);
    expect(profile.loopOnly).toBe(true);
  });
});