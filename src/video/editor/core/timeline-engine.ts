import { TimelineClip, ClipTransitionBinding } from './video-project-packet';

export function getTransitionRenderWindow(args: {
  fromClip: TimelineClip;
  toClip: TimelineClip;
  transition: ClipTransitionBinding;
}) {
  const { fromClip, toClip, transition } = args;
  const duration = Math.max(0, Math.round(transition.durationFrames));

  const overlapStart = Math.max(
    fromClip.startFrame + fromClip.durationFrames - duration,
    toClip.startFrame - duration
  );

  const overlapEnd = overlapStart + duration;

  return {
    fromClipId: fromClip.id,
    toClipId: toClip.id,
    overlapStart,
    overlapEnd,
    durationFrames: duration,
  };
}
