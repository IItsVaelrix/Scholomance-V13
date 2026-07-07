import React from "react";
import { Composition } from "remotion";
import { KineticLyricsVideo } from "./KineticLyricsVideo";
import { SacredGeometryVisualizer } from "./SacredGeometryVisualizer";
import { DarkStarMirrorVisualizer } from "./DarkStarMirrorVisualizer";
import { MazeLyricsVideo } from "./MazeLyricsVideo";
import { PolarityAmbientVideo } from "./PolarityAmbientVideo";
import { Windows98Visualizer } from "./Windows98Visualizer";
import { PETRICHOR } from "../pages/Visualiser/tracks/petrichor";
import petrichorAlign from "../pages/Visualiser/tracks/petrichor.align.json";
import { POLARITY } from "../pages/Visualiser/tracks/polarity";
import polarityAlign from "../pages/Visualiser/tracks/polarity.align.json";
import polarityVideo from "../pages/Visualiser/tracks/polarity.video.json";
import { POLARITY_REMIX } from "../pages/Visualiser/tracks/polarity-remix";
import { MAZE_SCREENSAVER } from "../pages/Visualiser/tracks/maze-screensaver";
import { TimelineComposition } from "./editor/remotion/TimelineComposition";
import type { VideoProjectPacketV1 } from "./editor/core/video-project-packet";

const PETRICHOR_WITH_ALIGNMENT = {
  ...PETRICHOR,
  wordTimings: petrichorAlign.wordTimings,
  alignmentMeta: (({ wordTimings: _, ...meta }: typeof petrichorAlign) => meta)(petrichorAlign),
};

const POLARITY_WITH_ALIGNMENT = {
  ...POLARITY,
  wordTimings: polarityAlign.wordTimings,
  alignmentMeta: (({ wordTimings: _, ...meta }: typeof polarityAlign) => meta)(polarityAlign),
};

const POLARITY_REMIX_VIDEO = (() => {
  const scenes = polarityVideo.scenes.map((scene, idx, arr) => {
    if (idx === arr.length - 1) {
      return { ...scene, endMs: POLARITY_REMIX.duration * 1000 };
    }
    return scene;
  });
  return { ...polarityVideo, trackId: "polarity-remix", scenes };
})();

const POLARITY_REMIX_WITH_ALIGNMENT = {
  ...POLARITY_REMIX,
  wordTimings: [],
  alignmentMeta: undefined,
};

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="KineticLyricsVideo"
        component={KineticLyricsVideo as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * Math.ceil(PETRICHOR.duration)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ track: PETRICHOR_WITH_ALIGNMENT }}
      />
      <Composition
        id="PolarityLyricsVideo"
        component={KineticLyricsVideo as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * Math.ceil(POLARITY.duration)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ track: POLARITY_WITH_ALIGNMENT, video: polarityVideo }}
      />
      <Composition
        id="PolarityAmbientVideo"
        component={PolarityAmbientVideo as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * Math.ceil(POLARITY.duration)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ track: POLARITY_WITH_ALIGNMENT, video: polarityVideo }}
      />
      <Composition
        id="PolarityRemixAmbientVideo"
        component={PolarityAmbientVideo as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * Math.ceil(POLARITY_REMIX.duration)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ track: POLARITY_REMIX_WITH_ALIGNMENT, video: POLARITY_REMIX_VIDEO }}
      />
      <Composition
        id="MazeLyricsVideo"
        component={MazeLyricsVideo as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * Math.ceil(MAZE_SCREENSAVER.duration)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ track: MAZE_SCREENSAVER }}
      />
      <Composition
        id="Windows98Visualizer"
        component={Windows98Visualizer as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * Math.ceil(PETRICHOR.duration)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ track: PETRICHOR_WITH_ALIGNMENT, themeName: "crtBlue", reactivityAmount: 1.0 }}
      />

      {/* Dark Star Mirror — sacred geometry synced to the track */}
      <Composition
        id="DarkStarMirrorVisualizer"
        component={DarkStarMirrorVisualizer as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={Math.ceil(248.68 * 30)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ caption: '' }}  /* ← add caption text here */
      />

      {/* Sacred Geometry Visualizer — audio-reactive mandala */}
      <Composition
        id="SacredGeometryVisualizer"
        component={SacredGeometryVisualizer as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * 60}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ schoolId: 'default' }}
      />

      {/* Scholomance Remotion Forge — packet-driven composition */}
      <Composition
        id="ScholomanceVideoForge"
        component={TimelineComposition as unknown as React.ComponentType<Record<string, unknown>>}
        calculateMetadata={({ props }) => {
          const project = (props as any).project as VideoProjectPacketV1;
          if (!project || !project.canvas) {
            return { durationInFrames: 30 * 60, fps: 30, width: 1920, height: 1080, props };
          }
          return {
            durationInFrames: project.canvas.durationFrames || 30 * 60,
            fps: project.canvas.fps || 30,
            width: project.canvas.width || 1920,
            height: project.canvas.height || 1080,
            props
          };
        }}
        durationInFrames={30 * 60} // Fallback
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          project: null as unknown as VideoProjectPacketV1,
        }}
      />
    </>
  );
}