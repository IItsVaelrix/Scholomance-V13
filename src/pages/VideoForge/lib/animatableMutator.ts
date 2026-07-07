import { ClipId, TimelineClip, VideoProjectPacketV1Like, mutateClip } from './timelineMutator';

export type AnimatableTargetRef =
  | { kind: 'clip'; clipId: ClipId }
  | { kind: 'effect'; clipId: ClipId; effectId: string }
  | { kind: 'transition'; clipId: ClipId; transitionId?: string }
  | { kind: 'shader'; clipId: ClipId; shaderId: string };

export interface KeyframeData {
  frame: number;
  value: number;
  easing?: any;
}

export interface AnimatableProperty {
  defaultValue: number;
  keyframes?: KeyframeData[];
}

export const AnimatableMutator = {
  getAnimatableTarget(clip: TimelineClip, targetRef: AnimatableTargetRef): any {
    if (targetRef.kind === 'clip') return clip;
    if (targetRef.kind === 'effect') {
      return (clip.effects ?? []).find(e => e.id === targetRef.effectId)?.params;
    }
    return clip;
  },

  getPropertyValue(target: any, path: string): AnimatableProperty {
    const parts = path.split('.');
    let curr: any = target;
    for (const p of parts) {
      if (curr === undefined || curr === null) return { defaultValue: 0 };
      curr = curr[p];
    }
    if (typeof curr === 'number') return { defaultValue: curr };
    if (typeof curr === 'object' && curr !== null && 'defaultValue' in curr) {
       return curr;
    }
    return { defaultValue: 0 };
  },

  setPropertyValue(target: any, path: string, value: AnimatableProperty): any {
    const parts = path.split('.');
    const result = { ...target };
    let curr = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      curr[p] = { ...curr[p] };
      curr = curr[p];
    }
    curr[parts[parts.length - 1]] = value;
    return result;
  },

  setAnimatableProperty<TProject extends VideoProjectPacketV1Like>(
    project: TProject,
    targetRef: AnimatableTargetRef,
    propertyPath: string,
    value: AnimatableProperty
  ): TProject {
    return mutateClip(project, targetRef.clipId, (clip) => {
      if (targetRef.kind === 'clip') {
        return this.setPropertyValue(clip, propertyPath, value);
      } else if (targetRef.kind === 'effect') {
        const effects = (clip.effects ?? []).map(e => {
          if (e.id !== targetRef.effectId) return e;
          return {
            ...e,
            params: this.setPropertyValue(e.params || {}, propertyPath, value)
          };
        });
        return { ...clip, effects };
      }
      return clip;
    });
  },

  addKeyframe<TProject extends VideoProjectPacketV1Like>(
    project: TProject,
    targetRef: AnimatableTargetRef,
    propertyPath: string,
    keyframe: KeyframeData
  ): TProject {
    return mutateClip(project, targetRef.clipId, (clip) => {
      const target = this.getAnimatableTarget(clip, targetRef);
      if (!target) return clip;
      const prop = this.getPropertyValue(target, propertyPath);
      const existing = prop.keyframes ? [...prop.keyframes] : [];
      const filtered = existing.filter(k => k.frame !== keyframe.frame);
      const updatedProp = {
        ...prop,
        keyframes: [...filtered, keyframe].sort((a, b) => a.frame - b.frame)
      };
      
      if (targetRef.kind === 'clip') {
        return this.setPropertyValue(clip, propertyPath, updatedProp);
      } else if (targetRef.kind === 'effect') {
        const effects = (clip.effects ?? []).map(e => {
          if (e.id !== targetRef.effectId) return e;
          return {
            ...e,
            params: this.setPropertyValue(e.params || {}, propertyPath, updatedProp)
          };
        });
        return { ...clip, effects };
      }
      return clip;
    });
  },

  deleteKeyframe<TProject extends VideoProjectPacketV1Like>(
    project: TProject,
    targetRef: AnimatableTargetRef,
    propertyPath: string,
    frame: number
  ): TProject {
    return mutateClip(project, targetRef.clipId, (clip) => {
      const target = this.getAnimatableTarget(clip, targetRef);
      if (!target) return clip;
      const prop = this.getPropertyValue(target, propertyPath);
      if (!prop.keyframes) return clip;

      const updatedProp = {
        ...prop,
        keyframes: prop.keyframes.filter(k => k.frame !== frame)
      };
      
      if (targetRef.kind === 'clip') {
        return this.setPropertyValue(clip, propertyPath, updatedProp);
      } else if (targetRef.kind === 'effect') {
        const effects = (clip.effects ?? []).map(e => {
          if (e.id !== targetRef.effectId) return e;
          return {
            ...e,
            params: this.setPropertyValue(e.params || {}, propertyPath, updatedProp)
          };
        });
        return { ...clip, effects };
      }
      return clip;
    });
  },

  updateKeyframe<TProject extends VideoProjectPacketV1Like>(
    project: TProject,
    targetRef: AnimatableTargetRef,
    propertyPath: string,
    oldFrame: number,
    patch: Partial<KeyframeData>
  ): TProject {
    return mutateClip(project, targetRef.clipId, (clip) => {
      const target = this.getAnimatableTarget(clip, targetRef);
      if (!target) return clip;
      const prop = this.getPropertyValue(target, propertyPath);
      if (!prop.keyframes) return clip;

      const idx = prop.keyframes.findIndex(k => k.frame === oldFrame);
      if (idx === -1) return clip;

      const newKfs = [...prop.keyframes];
      newKfs[idx] = { ...newKfs[idx], ...patch };

      const updatedProp = {
        ...prop,
        keyframes: newKfs.sort((a, b) => a.frame - b.frame)
      };

      if (targetRef.kind === 'clip') {
        return this.setPropertyValue(clip, propertyPath, updatedProp);
      } else if (targetRef.kind === 'effect') {
        const effects = (clip.effects ?? []).map(e => {
          if (e.id !== targetRef.effectId) return e;
          return {
            ...e,
            params: this.setPropertyValue(e.params || {}, propertyPath, updatedProp)
          };
        });
        return { ...clip, effects };
      }
      return clip;
    });
  }
};
