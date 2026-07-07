import { AudioAnalysis, getRmsAtFrame, getBeatPulse } from './audio-analysis';
import { AnimatableTargetRef, KeyframeData, AnimatableMutator } from '../../../pages/VideoForge/lib/animatableMutator';
import { VideoProjectPacketV1Like } from './video-project-packet';

export interface AudioReactiveBinding {
  id: string;
  sourceAssetId: string;
  targetRef: AnimatableTargetRef;
  targetPath: string;
  feature: 'rms' | 'beat';
  scale: number;
  offset: number;
}

export const AudioReactivityAdapter = {
  getAudioFeatures(analysis: AudioAnalysis | undefined, frame: number) {
    if (!analysis) return { rms: 0, beat: 0, hasAnalysis: false };
    const rms = getRmsAtFrame(analysis, frame);
    const beat = getBeatPulse(analysis, frame, 12);
    return { rms, beat, hasAnalysis: true };
  },

  generateAudioKeyframes(
    analysis: AudioAnalysis,
    durationFrames: number,
    feature: 'rms' | 'beat',
    scale: number,
    offset: number
  ): KeyframeData[] {
    const steps = 20;
    const step = Math.max(1, Math.floor(durationFrames / steps));
    const newKfs: KeyframeData[] = [];

    for (let f = 0; f < durationFrames; f += step) {
      const rms = getRmsAtFrame(analysis, f);
      const bt = getBeatPulse(analysis, f, 10);

      let val = offset;
      if (feature === 'rms') {
        val += rms * scale;
      } else if (feature === 'beat') {
        val += bt * scale;
      }

      newKfs.push({ frame: f, value: val, easing: 'linear' });
    }

    return newKfs;
  },

  applyAudioReactivity<TProject extends VideoProjectPacketV1Like>(
    project: TProject,
    binding: AudioReactiveBinding,
    durationFrames: number
  ): TProject {
    // 1. Find the audio asset analysis
    const audioAsset = project.assets.find(a => a.id === binding.sourceAssetId && a.kind === 'audio');
    const analysis = (audioAsset as any)?.audioAnalysis as AudioAnalysis | undefined;
    
    if (!analysis) {
      console.warn('AudioReactivityAdapter: No audio analysis found for asset', binding.sourceAssetId);
      return project;
    }

    // 2. Generate keyframes
    const keyframes = this.generateAudioKeyframes(
      analysis,
      durationFrames,
      binding.feature,
      binding.scale,
      binding.offset
    );

    // 3. Find current prop to preserve defaultValue
    let defaultVal = 0;
    const clip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === binding.targetRef.clipId);
    if (clip) {
      const targetObj = AnimatableMutator.getAnimatableTarget(clip as any, binding.targetRef);
      if (targetObj) {
         const prop = AnimatableMutator.getPropertyValue(targetObj, binding.targetPath);
         defaultVal = prop.defaultValue;
      }
    }

    // 4. Set the animatable property with the new keyframes
    return AnimatableMutator.setAnimatableProperty(
      project,
      binding.targetRef,
      binding.targetPath,
      { defaultValue: defaultVal, keyframes }
    );
  }
};
