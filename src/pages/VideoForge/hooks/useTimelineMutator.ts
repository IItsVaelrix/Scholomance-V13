import { useMemo } from 'react';
import {
  addClip,
  deleteClip,
  splitClip,
  addAsset,
  addEffectToClip,
  addLegacyTransition,
  mutateClip,
  removeEffectFromClip,
  setTransformDefault,
  setOpacityDefault,
  updateEffectParam,
  toggleEffectInClip,
  moveEffectInClip,
  removeLegacyTransition,
  type ClipEffect,
  type ClipId,
  type TimelineClip,
  type ClipMutator,
  type VideoProjectPacketV1Like,
} from '../lib/timelineMutator';

type SetProject<TProject> = any;

export function useTimelineMutator<TProject extends VideoProjectPacketV1Like>(
  setProject: SetProject<TProject>
) {
  return useMemo(
    () => ({
      mutateClip(clipId: ClipId, mutator: ClipMutator) {
        setProject((project: any) => mutateClip(project, clipId, mutator));
      },

      addClip(trackId: string, clip: TimelineClip) {
        setProject((project: any) => addClip(project, trackId, clip));
      },

      deleteClip(clipId: ClipId) {
        setProject((project: any) => deleteClip(project, clipId));
      },

      splitClip(clipId: ClipId, splitFrameLocal: number, newClipId: string) {
        setProject((project: any) => splitClip(project, clipId, splitFrameLocal, newClipId));
      },

      addAsset(asset: any) {
        setProject((project: any) => addAsset(project, asset));
      },

      setTransformDefault(clipId: ClipId, prop: 'position.x' | 'position.y' | 'scale.x' | 'scale.y', val: number) {
        setProject((project: any) => setTransformDefault(project, clipId, prop, val));
      },

      setOpacityDefault(clipId: ClipId, val: number) {
        setProject((project: any) => setOpacityDefault(project, clipId, val));
      },

      addEffectToClip(clipId: ClipId, effect: ClipEffect) {
        setProject((project: any) => addEffectToClip(project, clipId, effect));
      },

      toggleEffectInClip(clipId: ClipId, index: number) {
        setProject((project: any) => toggleEffectInClip(project, clipId, index));
      },

      moveEffectInClip(clipId: ClipId, index: number, delta: number) {
        setProject((project: any) => moveEffectInClip(project, clipId, index, delta));
      },

      removeEffectFromClip(clipId: ClipId, index: number) {
        setProject((project: any) => removeEffectFromClip(project, clipId, index));
      },

      updateEffectParam(
        clipId: ClipId,
        index: number,
        paramKey: string,
        value: unknown
      ) {
        setProject((project: any) =>
          updateEffectParam(project, clipId, index, paramKey, value)
        );
      },

      addLegacyTransition(clipId: ClipId, transition: unknown) {
        setProject((project: any) => addLegacyTransition(project, clipId, transition));
      },

      removeLegacyTransition(clipId: ClipId, index: number) {
        setProject((project: any) => removeLegacyTransition(project, clipId, index));
      },
    }),
    [setProject]
  );
}
