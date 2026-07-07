import { ClipEffect, ClipId, TimelineClip, VideoProjectPacketV1Like, mutateClip } from './timelineMutator';
import { getEffect } from '../../../video/editor/core/effect-registry';

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const EffectMutatorRegistry = {
  createEffect(type: string, overrides?: Record<string, any>): ClipEffect | null {
    const def = getEffect(type);
    if (!def) return null;
    return {
      id: makeId('eff'),
      effectId: type,
      enabled: true,
      params: { ...def.defaultParams, ...overrides },
    };
  },

  addEffect<TProject extends VideoProjectPacketV1Like>(project: TProject, clipId: ClipId, effectType: string, overrides?: Record<string, any>): TProject {
     const newEffect = this.createEffect(effectType, overrides);
     if (!newEffect) return project;
     return mutateClip(project, clipId, (clip) => {
         const effects = [...(clip.effects ?? [])];
         newEffect.order = effects.length;
         return { ...clip, effects: [...effects, newEffect] };
     });
  },

  // Helper to find which clip owns an effect
  _findClipForEffect<TProject extends VideoProjectPacketV1Like>(project: TProject, effectId: string): ClipId | null {
     for (const track of project.timeline.tracks) {
        for (const clip of track.clips) {
           if (clip.effects?.some(e => e.id === effectId)) {
               return clip.id;
           }
        }
     }
     return null;
  },

  updateEffectParam<TProject extends VideoProjectPacketV1Like>(project: TProject, effectId: string, paramKey: string, value: unknown): TProject {
      const clipId = this._findClipForEffect(project, effectId);
      if (!clipId) return project;
      return mutateClip(project, clipId, (clip) => {
         const effects = (clip.effects ?? []).map(e => {
             if (e.id !== effectId) return e;
             const paramUpdate = typeof value === 'string' ? value : { defaultValue: value };
             return { ...e, params: { ...(e.params || {}), [paramKey]: paramUpdate } };
         });
         return { ...clip, effects };
      });
  },

  toggleEffect<TProject extends VideoProjectPacketV1Like>(project: TProject, effectId: string, enabled?: boolean): TProject {
      const clipId = this._findClipForEffect(project, effectId);
      if (!clipId) return project;
      return mutateClip(project, clipId, (clip) => {
          const effects = (clip.effects ?? []).map(e => {
             if (e.id !== effectId) return e;
             return { ...e, enabled: enabled !== undefined ? enabled : !e.enabled };
          });
          return { ...clip, effects };
      });
  },

  reorderEffect<TProject extends VideoProjectPacketV1Like>(project: TProject, effectId: string, direction: -1 | 1): TProject {
      const clipId = this._findClipForEffect(project, effectId);
      if (!clipId) return project;
      return mutateClip(project, clipId, (clip) => {
          const effects = [...(clip.effects ?? [])];
          const index = effects.findIndex(e => e.id === effectId);
          if (index < 0) return clip;
          const newIndex = index + direction;
          if (newIndex < 0 || newIndex >= effects.length) return clip;
          [effects[index], effects[newIndex]] = [effects[newIndex], effects[index]];
          effects.forEach((e, i) => (e.order = i));
          return { ...clip, effects };
      });
  },

  removeEffect<TProject extends VideoProjectPacketV1Like>(project: TProject, effectId: string): TProject {
      const clipId = this._findClipForEffect(project, effectId);
      if (!clipId) return project;
      return mutateClip(project, clipId, (clip) => {
          const effects = (clip.effects ?? []).filter(e => e.id !== effectId);
          effects.forEach((e, i) => (e.order = i));
          return { ...clip, effects };
      });
  }
};
