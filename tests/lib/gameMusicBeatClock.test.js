import { describe, it, expect } from 'vitest';
import { GAME_BACKGROUND_MUSIC_PACING } from '../../src/lib/audio/gameBackgroundMusic.config.js';
import {
  bpmBobOffset,
  didAdvanceBeat,
  findSnareCrossings,
  isDischargeSnareHit,
  isFourthSnareHit,
  isLastChargeSnare,
  isSnareBeatIndex,
  resolveMusicBeatSnapshot,
  snareCountFromBeatIndex,
  snaresPerDischargeCycle,
} from '../../src/lib/audio/gameMusicBeatClock.js';
import { GAME_OBELISK_MUSIC_SYNC } from '../../src/lib/audio/gameBackgroundMusic.config.js';

describe('gameMusicBeatClock', () => {
  it('marks snare beats on 2 and 4 in 4/4', () => {
    expect(isSnareBeatIndex(0)).toBe(false);
    expect(isSnareBeatIndex(1)).toBe(true);
    expect(isSnareBeatIndex(2)).toBe(false);
    expect(isSnareBeatIndex(3)).toBe(true);
    expect(isSnareBeatIndex(4)).toBe(false);
    expect(isSnareBeatIndex(7)).toBe(true);
  });

  it('counts snares and flags every fourth hit', () => {
    expect(snareCountFromBeatIndex(1)).toBe(1);
    expect(snareCountFromBeatIndex(3)).toBe(2);
    expect(snareCountFromBeatIndex(5)).toBe(3);
    expect(snareCountFromBeatIndex(7)).toBe(4);
    expect(isFourthSnareHit(4)).toBe(true);
    expect(isFourthSnareHit(8)).toBe(true);
    expect(isFourthSnareHit(3)).toBe(false);
    expect(isLastChargeSnare(3)).toBe(true);
    expect(isLastChargeSnare(7)).toBe(true);
    expect(isLastChargeSnare(4)).toBe(false);
  });

  it('detects beat crossings', () => {
    expect(didAdvanceBeat(null, 1)).toBe(false);
    expect(didAdvanceBeat(0.9, 1.1)).toBe(true);
    expect(didAdvanceBeat(1.1, 1.4)).toBe(false);
  });

  it('findSnareCrossings catches skipped frames across multiple snares', () => {
    expect(findSnareCrossings(null, 7)).toEqual([]);
    expect(findSnareCrossings(0.2, 3.1)).toEqual([1, 3]);
    expect(findSnareCrossings(6.8, 7.2)).toEqual([7]);
  });

  it('resolves beat snapshot from playback time', () => {
    const snap = resolveMusicBeatSnapshot(0, { bpm: 120, offsetMs: 0, timeSignature: [4, 4] });
    expect(snap.beat.index).toBe(0);
    expect(snap.isSnare).toBe(false);
  });

  it('bpmBobOffset oscillates with beat phase', () => {
    const a = bpmBobOffset(0, 0, 6);
    const b = bpmBobOffset(0.25, 0, 6);
    expect(a).toBe(0);
    expect(Math.abs(b)).toBeGreaterThan(0);
  });

  it('uses 85 BPM for The Beginning', () => {
    expect(GAME_BACKGROUND_MUSIC_PACING.bpm).toBe(85);
    const beatMs = 60000 / 85;
    const snap = resolveMusicBeatSnapshot(beatMs);
    expect(snap.beat.index).toBe(1);
    expect(snap.isSnare).toBe(true);
  });

  it('maps 8 measures to 16 snare hits in 4/4', () => {
    expect(snaresPerDischargeCycle(8, 4)).toBe(16);
    expect(isDischargeSnareHit(16, 16)).toBe(true);
    expect(isDischargeSnareHit(32, 16)).toBe(true);
    expect(isDischargeSnareHit(15, 16)).toBe(false);
    expect(isLastChargeSnare(15, 16)).toBe(true);
    expect(isLastChargeSnare(31, 16)).toBe(true);
  });

  it('exposes obelisk sync cadence and lead', () => {
    expect(GAME_OBELISK_MUSIC_SYNC.dischargeEveryMeasures).toBe(8);
    expect(GAME_OBELISK_MUSIC_SYNC.leadMs).toBe(500);
  });
});