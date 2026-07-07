import { useMemo } from 'react';
import { AnimatableMutator, AnimatableTargetRef, KeyframeData, AnimatableProperty } from '../lib/animatableMutator';
import type { VideoProjectPacketV1Like } from '../lib/timelineMutator';

type SetProject<TProject> = any;

export function useAnimatableMutator<TProject extends VideoProjectPacketV1Like>(
  setProject: SetProject<TProject>
) {
  return useMemo(
    () => ({
      setAnimatableProperty(targetRef: AnimatableTargetRef, propertyPath: string, value: AnimatableProperty) {
        setProject((project: any) => AnimatableMutator.setAnimatableProperty(project, targetRef, propertyPath, value));
      },
      addKeyframe(targetRef: AnimatableTargetRef, propertyPath: string, keyframe: KeyframeData) {
        setProject((project: any) => AnimatableMutator.addKeyframe(project, targetRef, propertyPath, keyframe));
      },
      deleteKeyframe(targetRef: AnimatableTargetRef, propertyPath: string, frame: number) {
        setProject((project: any) => AnimatableMutator.deleteKeyframe(project, targetRef, propertyPath, frame));
      },
      updateKeyframe(targetRef: AnimatableTargetRef, propertyPath: string, oldFrame: number, patch: Partial<KeyframeData>) {
        setProject((project: any) => AnimatableMutator.updateKeyframe(project, targetRef, propertyPath, oldFrame, patch));
      }
    }),
    [setProject]
  );
}
