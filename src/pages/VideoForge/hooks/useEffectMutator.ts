import { useMemo } from 'react';
import { EffectMutatorRegistry } from '../lib/effectMutatorRegistry';
import type { VideoProjectPacketV1Like, ClipId } from '../lib/timelineMutator';

type SetProject<TProject> = any;

export function useEffectMutator<TProject extends VideoProjectPacketV1Like>(
  setProject: SetProject<TProject>
) {
  return useMemo(
    () => ({
      addEffect(clipId: ClipId, effectType: string, overrides?: Record<string, any>) {
        setProject((project: any) => EffectMutatorRegistry.addEffect(project, clipId, effectType, overrides));
      },
      updateEffectParam(effectId: string, paramKey: string, value: unknown) {
        setProject((project: any) => EffectMutatorRegistry.updateEffectParam(project, effectId, paramKey, value));
      },
      toggleEffect(effectId: string, enabled?: boolean) {
        setProject((project: any) => EffectMutatorRegistry.toggleEffect(project, effectId, enabled));
      },
      reorderEffect(effectId: string, direction: -1 | 1) {
        setProject((project: any) => EffectMutatorRegistry.reorderEffect(project, effectId, direction));
      },
      removeEffect(effectId: string) {
        setProject((project: any) => EffectMutatorRegistry.removeEffect(project, effectId));
      },
    }),
    [setProject]
  );
}
