import React from "react";
import { Composition } from "remotion";
import { KineticLyricsVideo } from "./KineticLyricsVideo";
import { MazeLyricsVideo } from "./MazeLyricsVideo";
import { PolarityAmbientVideo } from "./PolarityAmbientVideo";
import { PETRICHOR } from "../pages/Visualiser/tracks/petrichor";
import petrichorAlign from "../pages/Visualiser/tracks/petrichor.align.json";
import { POLARITY } from "../pages/Visualiser/tracks/polarity";
import polarityAlign from "../pages/Visualiser/tracks/polarity.align.json";
import polarityVideo from "../pages/Visualiser/tracks/polarity.video.json";
import { POLARITY_REMIX } from "../pages/Visualiser/tracks/polarity-remix";
import { MAZE_SCREENSAVER } from "../pages/Visualiser/tracks/maze-screensaver";

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
    </>
  );
}