import { describe, it, expect } from 'vitest';
import {
  addClip,
  deleteClip,
  splitClip,
  mutateClip,
  type TimelineClip,
  type VideoProjectPacketV1Like,
} from '../../../../src/pages/VideoForge/lib/timelineMutator';

const mockProject = (): VideoProjectPacketV1Like => ({
  timeline: {
    tracks: [
      {
        id: 'track-1',
        clips: [
          {
            id: 'clip-1',
            startFrame: 0,
            durationFrames: 100,
            transform: { position: { x: { defaultValue: 0 }, y: { defaultValue: 0 } }, scale: { x: { defaultValue: 1 }, y: { defaultValue: 1 } }, rotation: { defaultValue: 0 } }
          }
        ],
      }
    ]
  }
});

describe('timelineMutator', () => {
  describe('addClip', () => {
    it('should add a clip to the specified track', () => {
      const p = mockProject();
      const newClip = { id: 'clip-2', startFrame: 100, durationFrames: 50 };
      const updated = addClip(p, 'track-1', newClip as any);
      expect(updated.timeline.tracks[0].clips).toHaveLength(2);
      expect(updated.timeline.tracks[0].clips[1].id).toBe('clip-2');
    });
  });

  describe('deleteClip', () => {
    it('should delete a clip by ID', () => {
      const p = mockProject();
      const updated = deleteClip(p, 'clip-1');
      expect(updated.timeline.tracks[0].clips).toHaveLength(0);
    });
  });

  describe('splitClip', () => {
    it('should split a clip correctly into two pieces', () => {
      const p = mockProject();
      const updated = splitClip(p, 'clip-1', 40, 'clip-1-right');
      const clips = updated.timeline.tracks[0].clips;
      expect(clips).toHaveLength(2);
      expect(clips[0].id).toBe('clip-1');
      expect(clips[0].durationFrames).toBe(40);
      expect(clips[1].id).toBe('clip-1-right');
      expect(clips[1].startFrame).toBe(40); // 0 + 40
      expect(clips[1].durationFrames).toBe(60); // 100 - 40
    });

    it('should not split if splitFrame is invalid', () => {
      const p = mockProject();
      const updated = splitClip(p, 'clip-1', 0, 'clip-1-right');
      expect(updated.timeline.tracks[0].clips).toHaveLength(1);
      
      const updated2 = splitClip(p, 'clip-1', 100, 'clip-1-right');
      expect(updated2.timeline.tracks[0].clips).toHaveLength(1);
    });
  });

  describe('mutateClip', () => {
    it('should map over clips and only update the specified one', () => {
      const p = mockProject();
      const updated = mutateClip(p, 'clip-1', (c) => ({ ...c, durationFrames: 200 }));
      expect(updated.timeline.tracks[0].clips[0].durationFrames).toBe(200);
    });
  });
});
