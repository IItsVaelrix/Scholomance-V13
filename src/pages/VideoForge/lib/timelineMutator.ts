import type {
  AssetRecord,
  EffectInstance,
  LegacyClipTransitionBinding,
  TimelineClip as CanonicalTimelineClip,
  TimelineTrack as CanonicalTimelineTrack,
  VideoAssetRecord,
  VideoProjectPacketV1,
} from '../../../video/editor/core/video-project-packet';

export type ClipId = string;
export type EffectId = string;
export type ClipEffect = EffectInstance;
export type TimelineClip = CanonicalTimelineClip;
export type TimelineTrack = CanonicalTimelineTrack;
export type VideoProjectPacketV1Like = VideoProjectPacketV1;

export type ClipMutator = (clip: TimelineClip) => TimelineClip;

export function mutateClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  mutate: ClipMutator
): TProject {
  let projectChanged = false;

  const tracks = project.timeline.tracks.map((track) => {
    let trackChanged = false;

    const clips = track.clips.map((clip) => {
      if (clip.id !== clipId) return clip;

      const nextClip = mutate(clip);
      if (nextClip === clip) return clip;

      trackChanged = true;
      projectChanged = true;
      return nextClip;
    });

    return trackChanged ? { ...track, clips } : track;
  });

  if (!projectChanged) return project;

  return {
    ...project,
    timeline: {
      ...project.timeline,
      tracks,
    },
  };
}

export function addClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  trackId: string,
  newClip: TimelineClip
): TProject {
  const tracks = project.timeline.tracks.map((track) =>
    track.id === trackId ? { ...track, clips: [...track.clips, newClip] } : track
  );
  return { ...project, timeline: { ...project.timeline, tracks } };
}

export function deleteClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: string
): TProject {
  const tracks = project.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((c) => c.id !== clipId),
  }));
  return { ...project, timeline: { ...project.timeline, tracks } };
}

export function splitClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: string,
  splitFrameLocal: number,
  newClipId: string
): TProject {
  const tracks = project.timeline.tracks.map((track) => {
    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) return track;

    const clip = track.clips[clipIndex];
    if (splitFrameLocal <= 0 || splitFrameLocal >= clip.durationFrames) return track;

    const leftDur = splitFrameLocal;
    const rightDur = clip.durationFrames - splitFrameLocal;

    const left: TimelineClip = { ...clip, durationFrames: leftDur };
    const right: TimelineClip = {
      ...clip,
      id: newClipId,
      startFrame: clip.startFrame + leftDur,
      durationFrames: rightDur,
    };

    const newClips = [...track.clips];
    newClips.splice(clipIndex, 1, left, right);

    return { ...track, clips: newClips };
  });

  return { ...project, timeline: { ...project.timeline, tracks } };
}

export function addAsset<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  asset: AssetRecord | VideoAssetRecord
): TProject {
  return { ...project, assets: [...(project.assets || []), asset] };
}


export function setTransformDefault<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  prop: 'position.x' | 'position.y' | 'scale.x' | 'scale.y',
  val: number
): TProject {
  return mutateClip(project, clipId, (clip) => {
    const nt = { ...clip.transform };
    if (prop === 'position.x') nt.position.x = { ...nt.position.x, defaultValue: val };
    else if (prop === 'position.y') nt.position.y = { ...nt.position.y, defaultValue: val };
    else if (prop === 'scale.x') nt.scale.x = { ...nt.scale.x, defaultValue: val };
    else nt.scale.y = { ...nt.scale.y, defaultValue: val };
    return { ...clip, transform: nt };
  });
}

export function setOpacityDefault<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  val: number
): TProject {
  return mutateClip(project, clipId, (clip) => {
    return { ...clip, opacity: { ...clip.opacity, defaultValue: val } };
  });
}

export function addEffectToClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  effect: ClipEffect
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    effects: [...(clip.effects ?? []), effect],
  }));
}

export function toggleEffectInClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  index: number
): TProject {
  return mutateClip(project, clipId, (clip) => {
    const effects = [...(clip.effects || [])];
    if (effects[index]) effects[index] = { ...effects[index], enabled: !effects[index].enabled };
    return { ...clip, effects };
  });
}

export function moveEffectInClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  index: number,
  delta: number
): TProject {
  return mutateClip(project, clipId, (clip) => {
    const effects = [...(clip.effects || [])];
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= effects.length) return clip;
    [effects[index], effects[newIndex]] = [effects[newIndex], effects[index]];
    effects.forEach((e, i) => (e.order = i));
    return { ...clip, effects };
  });
}

export function removeEffectFromClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  index: number
): TProject {
  return mutateClip(project, clipId, (clip) => {
    const effects = (clip.effects ?? []).filter((_, i) => i !== index);
    effects.forEach((e, i) => (e.order = i));
    return { ...clip, effects };
  });
}

export function updateEffectParam<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  index: number,
  paramKey: string,
  value: unknown
): TProject {
  return mutateClip(project, clipId, (clip) => {
    const effects = [...(clip.effects ?? [])];
    const eff = { ...effects[index] };
    if (typeof value === 'string') {
      eff.params = { ...(eff.params || {}), [paramKey]: value };
    } else {
      eff.params = { ...(eff.params || {}), [paramKey]: { defaultValue: value } };
    }
    effects[index] = eff;
    return { ...clip, effects };
  });
}

export function addLegacyTransition<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  transition: LegacyClipTransitionBinding
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    transitions: [...(clip.transitions ?? []), transition],
  }));
}

export function removeLegacyTransition<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  index: number
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    transitions: (clip.transitions ?? []).filter((_, i) => i !== index),
  }));
}
