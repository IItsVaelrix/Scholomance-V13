import { useMemo } from 'react';
import { AudioReactivityAdapter, AudioReactiveBinding } from '../../../video/editor/core/audio-reactivity-adapter';
import type { VideoProjectPacketV1Like } from '../../../video/editor/core/video-project-packet';

type SetProject<TProject> = any;

export function useAudioReactivity<TProject extends VideoProjectPacketV1Like>(
  setProject: SetProject<TProject>
) {
  return useMemo(
    () => ({
      applyAudioReactivity(binding: AudioReactiveBinding, durationFrames: number) {
        setProject((project: any) => AudioReactivityAdapter.applyAudioReactivity(project, binding, durationFrames));
      }
    }),
    [setProject]
  );
}
