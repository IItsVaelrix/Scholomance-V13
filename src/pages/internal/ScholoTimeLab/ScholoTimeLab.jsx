// IMMUNE_ALLOW: LING-0F03
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFile } from "@ffmpeg/util";
import { compileScholoTimeFrame } from "../../../lib/codex/scholotime.js";
import { forgeCharacter, createSpriteCache } from "../../../lib/pixelbrain.adapter.js";
import { useFFmpeg } from "./useFFmpeg.js";
import {
  createDefaultScholoTimeProject,
  normalizeScholoTimeProject,
  timeToFrameIndex,
} from "./scholoTimeProject.js";
import {
  getTypographyMoviePlugin,
  TYPOGRAPHY_MOVIE_PLUGINS,
} from "./typographyMoviePlugins.js";
import "./ScholoTimeLab.css";

const spriteCache = createSpriteCache();

const EXPORT_SIZES = Object.freeze({
  preview: { width: 960, height: 540, label: "Preview 960 x 540" },
  hd: { width: 1280, height: 720, label: "HD 1280 x 720" },
  fullhd: { width: 1920, height: 1080, label: "Full HD 1920 x 1080" },
});

const SNOW_ANGEL_SPEC = Object.freeze({
  contract: "CHARACTER-SPEC-v1",
  id: "scholotime.snow-angel.intro",
  class: "character",
  archetype: "human",
  canvas: { width: 32, height: 48, gridSize: 1 },
  seed: 14014,
  bytecode: "SCHOLOTIME-SNOW-ANGEL-INTRO-v1",
  presentation: { gender: "feminine", heightClass: "average", buildClass: "slender" },
  directions: ["south"],
  materials: { skin: "skin_light", hair: "hair_void", eyes: "eye_blue" },
  body: { profile: "character.body.human.feminine" },
  face: [
    { id: "leftEye", profile: "character.face.eye.almond", attach: { parent: "body", at: "face.eyeLeft" } },
    { id: "rightEye", profile: "character.face.eye.almond", attach: { parent: "body", at: "face.eyeRight" } },
    { id: "nose", profile: "character.face.nose.straight", attach: { parent: "body", at: "face.nose" } },
    { id: "mouth", profile: "character.face.mouth.small", attach: { parent: "body", at: "face.mouth" } },
    { id: "leftEar", profile: "character.face.ear.pointed", attach: { parent: "body", at: "face.earLeft" } },
    { id: "rightEar", profile: "character.face.ear.pointed", attach: { parent: "body", at: "face.earRight" } },
  ],
  hair: { profile: "character.hair.longStraight", params: { color: "hair_void" }, attach: { parent: "body", at: "headTop" } },
  clothing: [
    { id: "bottom", profile: "character.clothing.bottom.beginnerSkirt" },
    { id: "top", profile: "character.clothing.top.beginnerRobe" },
    { id: "shoes", profile: "character.clothing.shoes.beginnerSlippers" },
  ],
  accessories: [
    { id: "wings", profile: "character.accessory.wings.snow", params: { color: "#f4fbff", shade: "#bfefff" } },
    { id: "halo", profile: "character.accessory.halo.ice", params: { color: "#dff6ff" } },
    { id: "crown", profile: "character.accessory.crown.crystal", params: { color: "#e9fbff", accent: "#42d9ff" } },
    { id: "mantle", profile: "character.accessory.shoulderMantle", params: { color: "#edf9ff", trim: "#d6b35f" } },
    { id: "pendant", profile: "character.accessory.jewelry.runePendant", params: { chain: "#d6b35f", gem: "#42d9ff" } },
  ],
  details: [
    { id: "robeTrim", profile: "character.detail.robeTrim.snow", params: { color: "#e9fbff" } },
    { id: "eyeGlow", profile: "character.detail.eyeGlow", params: { color: "#42d9ff" } },
    { id: "hairShine", profile: "character.detail.hairShine", params: { color: "#ffffff" } },
    { id: "cheekSigil", profile: "character.detail.cheekSigil.snow", params: { color: "#bfefff" } },
  ],
  combatProfile: { school: "PSYCHIC" },
});

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export default function ScholoTimeLab() {
  const { loaded, ffmpeg } = useFFmpeg();
  const [audioFile, setAudioFile] = useState(null);
  const [rawProjectData, setRawProjectData] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [exportProgress, setExportProgress] = useState(0);
  const [pluginId, setPluginId] = useState("first-person-maze");
  const [exportSizeId, setExportSizeId] = useState("hd");
  const [typographyStartBar, setTypographyStartBar] = useState(14);
  const [motionMode, setMotionMode] = useState("full");
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [scanlines, setScanlines] = useState(true);

  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const animationRef = useRef(null);
  const snowAngelImageRef = useRef(null);

  const project = useMemo(() => {
    if (rawProjectData) {
      return normalizeScholoTimeProject(rawProjectData, {
        duration,
        audioFileName: audioFile?.name || null,
      });
    }

    return createDefaultScholoTimeProject({
      duration,
      audioFileName: audioFile?.name || null,
    });
  }, [audioFile?.name, duration, rawProjectData]);

  const effectiveProject = useMemo(() => {
    const beatsPerBar = Number(project.timing.timeSignature?.[0]) || 4;
    const beatDurationMs = 60000 / project.timing.bpm;
    const contentStartMs = (Math.max(1, typographyStartBar) - 1) * beatsPerBar * beatDurationMs;

    return {
      ...project,
      lyrics: project.lyrics.map((lyric) => ({
        ...lyric,
        startMs: lyric.startMs + contentStartMs,
        endMs: lyric.endMs + contentStartMs,
      })),
      cues: project.cues.map((cue) => ({
        ...cue,
        startMs: cue.startMs + contentStartMs,
        endMs: cue.endMs + contentStartMs,
      })),
    };
  }, [project, typographyStartBar]);

  const typographyStartMs = useMemo(() => {
    const beatsPerBar = Number(project.timing.timeSignature?.[0]) || 4;
    const beatDurationMs = 60000 / project.timing.bpm;
    return (Math.max(1, typographyStartBar) - 1) * beatsPerBar * beatDurationMs;
  }, [project.timing.bpm, project.timing.timeSignature, typographyStartBar]);

  const selectedPlugin = useMemo(() => getTypographyMoviePlugin(pluginId), [pluginId]);
  const exportSize = EXPORT_SIZES[exportSizeId] || EXPORT_SIZES.hd;
  const maxTime = Math.max(duration, effectiveProject.timing.durationMs / 1000);
  const currentFrame = timeToFrameIndex(currentTime, effectiveProject.timing.fps);

  const [snowAngelSvgUrl, setSnowAngelSvgUrl] = useState(null);
  useEffect(() => {
    const materialsHash = JSON.stringify(SNOW_ANGEL_SPEC.materials);
    spriteCache
      .get(String(SNOW_ANGEL_SPEC.seed), materialsHash, () => {
        try {
          const result = forgeCharacter(SNOW_ANGEL_SPEC, {
            renderer: "illustrated",
            scale: 16,
            smooth: true,
            twoTone: true,
          });
          return result.svg ? svgToDataUrl(result.svg) : null;
        } catch (error) {
          console.warn("[ScholoTimeLab] Snow angel SVG forge failed:", error);
          return null;
        }
      })
      .then((url) => setSnowAngelSvgUrl(url));
  }, []);

  const renderFrame = useCallback(
    (targetCanvas, frameIndex, size = null) => {
      if (!targetCanvas) return;
      const width = size?.width || targetCanvas.width;
      const height = size?.height || targetCanvas.height;
      if (targetCanvas.width !== width) targetCanvas.width = width;
      if (targetCanvas.height !== height) targetCanvas.height = height;

      const ctx = targetCanvas.getContext("2d");
      const packet = compileScholoTimeFrame(effectiveProject, frameIndex);
      selectedPlugin.render(ctx, packet, {
        diagnostics: showDiagnostics,
        motion: motionMode,
        scanlines,
        typographyStartMs,
        introImage: snowAngelImageRef.current,
      });
    },
    [effectiveProject, motionMode, scanlines, selectedPlugin, showDiagnostics, typographyStartMs],
  );

  const renderAudioClock = useCallback(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    const audioFrame = timeToFrameIndex(audio.currentTime, effectiveProject.timing.fps);
    renderFrame(canvas, audioFrame, EXPORT_SIZES.preview);
  }, [effectiveProject.timing.fps, renderFrame]);

  useEffect(() => {
    renderFrame(canvasRef.current, currentFrame, EXPORT_SIZES.preview);
  }, [currentFrame, renderFrame]);

  useEffect(() => {
    if (!snowAngelSvgUrl) return undefined;
    const image = new Image();
    image.onload = () => {
      snowAngelImageRef.current = image;
      renderFrame(canvasRef.current, currentFrame, EXPORT_SIZES.preview);
    };
    image.src = snowAngelSvgUrl;
    return () => {
      if (snowAngelImageRef.current === image) {
        snowAngelImageRef.current = null;
      }
    };
  }, [currentFrame, renderFrame, snowAngelSvgUrl]);

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }, []);

  const handleAudioSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setStatus(`Audio loaded: ${file.name}`);

    const url = URL.createObjectURL(file);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.onloadedmetadata = () => {
        const nextDuration = audioRef.current?.duration || 0;
        setDuration(nextDuration);
        setCurrentTime(0);
      };
    }
  };

  const handleJSONSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = JSON.parse(loadEvent.target.result);
        setRawProjectData(data);
        setStatus(`Typography project loaded: ${file.name}`);
      } catch (error) {
        setStatus("Project JSON could not be parsed.");
      }
    };
    reader.readAsText(file);
  };

  const playLoop = useCallback(() => {
    if (!audioRef.current) return;
    renderAudioClock();
    setCurrentTime(audioRef.current.currentTime);
    animationRef.current = requestAnimationFrame(playLoop);
  }, [renderAudioClock]);

  const togglePlay = async () => {
    if (!audioRef.current || !audioFile) return;

    if (isPlaying) {
      audioRef.current.pause();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setIsPlaying(false);
      return;
    }

    await audioRef.current.play();
    setIsPlaying(true);
    animationRef.current = requestAnimationFrame(playLoop);
  };

  const handleScrub = (event) => {
    const time = Number(event.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    renderFrame(canvasRef.current, timeToFrameIndex(time, effectiveProject.timing.fps), EXPORT_SIZES.preview);
  };

  const exportToMp4 = async () => {
    if (!audioFile) {
      setStatus("Select audio before export.");
      return;
    }
    if (!loaded) {
      setStatus("FFmpeg is still loading.");
      return;
    }

    setIsPlaying(false);
    if (audioRef.current) audioRef.current.pause();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const fps = effectiveProject.timing.fps;
    const totalFrames = Math.ceil(effectiveProject.timing.durationMs / (1000 / fps));
    const exportCanvas = document.createElement("canvas");

    try {
      setExportProgress(0.01);
      setStatus(`Rendering ${totalFrames} deterministic ${selectedPlugin.label} frames.`);
      await ffmpeg.writeFile("audio-input", await fetchFile(audioFile));

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        renderFrame(exportCanvas, frameIndex, exportSize);
        const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
        const frameName = `frame_${frameIndex.toString().padStart(6, "0")}.png`;
        await ffmpeg.writeFile(frameName, new Uint8Array(await blob.arrayBuffer()));

        if (frameIndex % 10 === 0 || frameIndex === totalFrames - 1) {
          setExportProgress((frameIndex + 1) / totalFrames * 0.68);
          setStatus(`Rendered frame ${frameIndex + 1}/${totalFrames}`);
        }
      }

      setStatus("Encoding ScholoTime typography movie.");
      setExportProgress(0.76);
      await ffmpeg.exec([
        "-framerate",
        String(fps),
        "-i",
        "frame_%06d.png",
        "-i",
        "audio-input",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        "-shortest",
        "ScholoTime_Typography_Movie.mp4",
      ]);

      const data = await ffmpeg.readFile("ScholoTime_Typography_Movie.mp4");
      downloadBlob(new Blob([data.buffer], { type: "video/mp4" }), "ScholoTime_Typography_Movie.mp4");
      setExportProgress(1);
      setStatus("Export complete.");

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        await ffmpeg.deleteFile(`frame_${frameIndex.toString().padStart(6, "0")}.png`);
      }
      await ffmpeg.deleteFile("audio-input");
      await ffmpeg.deleteFile("ScholoTime_Typography_Movie.mp4");
    } catch (error) {
      setStatus("Export failed. Check the browser console.");
      console.error(error);
    }
  };

  return (
    <div className="scholo-time-lab">
      <header className="scholo-time-lab-header">
        <div>
          <p className="scholo-time-lab-kicker">ScholoTime Typography Movies</p>
          <h1>ScholoTimeLab</h1>
        </div>
        <p>
          Frame-packet-driven lyric cinema with pluggable renderers for hand-authored song worlds.
        </p>
      </header>

      <section className="lab-panel" aria-label="ScholoTime project inputs">
        <div className="lab-controls">
          <div className="file-input-group">
            <label htmlFor="audio-input">Audio</label>
            <input id="audio-input" type="file" accept="audio/*" onChange={handleAudioSelect} />
          </div>
          <div className="file-input-group">
            <label htmlFor="json-input">Project or beat map JSON</label>
            <input id="json-input" type="file" accept=".json,application/json" onChange={handleJSONSelect} />
          </div>
        </div>
      </section>

      <section className="lab-panel lab-director" aria-label="Typography movie direction">
        <div className="lab-field">
          <label htmlFor="movie-plugin">Typography movie plugin</label>
          <select id="movie-plugin" value={pluginId} onChange={(event) => setPluginId(event.target.value)}>
            {TYPOGRAPHY_MOVIE_PLUGINS.map((plugin) => (
              <option key={plugin.id} value={plugin.id}>{plugin.label}</option>
            ))}
          </select>
          <span>{selectedPlugin.description}</span>
        </div>

        <div className="lab-field">
          <label htmlFor="export-size">Export frame</label>
          <select id="export-size" value={exportSizeId} onChange={(event) => setExportSizeId(event.target.value)}>
            {Object.entries(EXPORT_SIZES).map(([id, size]) => (
              <option key={id} value={id}>{size.label}</option>
            ))}
          </select>
          <span>{effectiveProject.timing.fps} FPS | {formatTime(effectiveProject.timing.durationMs / 1000)} project duration</span>
        </div>

        <div className="lab-field">
          <label htmlFor="typography-start-bar">Typography starts on bar</label>
          <input
            id="typography-start-bar"
            type="number"
            min={1}
            step={1}
            value={typographyStartBar}
            onChange={(event) => setTypographyStartBar(Math.max(1, Number(event.target.value) || 1))}
          />
          <span>No text renders before bar {typographyStartBar}; the intro plays first.</span>
        </div>

        <div className="lab-switch-row">
          <label htmlFor="packet-diagnostics">
            <input
              id="packet-diagnostics"
              type="checkbox"
              checked={showDiagnostics}
              onChange={(event) => setShowDiagnostics(event.target.checked)}
            />
            Packet diagnostics
          </label>
          <label htmlFor="maze-scanlines">
            <input
              id="maze-scanlines"
              type="checkbox"
              checked={scanlines}
              onChange={(event) => setScanlines(event.target.checked)}
            />
            Maze scanlines
          </label>
          <label htmlFor="reduced-motion">
            <input
              id="reduced-motion"
              type="checkbox"
              checked={motionMode === "reduced"}
              onChange={(event) => setMotionMode(event.target.checked ? "reduced" : "full")}
            />
            Reduced motion
          </label>
        </div>
      </section>

      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={EXPORT_SIZES.preview.width}
          height={EXPORT_SIZES.preview.height}
          className="preview-canvas"
          aria-label={`${selectedPlugin.label} preview canvas`}
        />
      </div>

      <audio ref={audioRef} className="scholo-time-audio">
        <track kind="captions" />
      </audio>

      <section className="lab-panel timeline-panel" aria-label="ScholoTime timeline controls">
        <div className="timeline-readout">
          <span>{formatTime(currentTime)}</span>
          <span>Frame {currentFrame}</span>
          <span>{formatTime(maxTime)}</span>
        </div>

        <input
          type="range"
          aria-label="Timeline scrubber"
          className="timeline-scrubber"
          min={0}
          max={maxTime || 100}
          step={1 / effectiveProject.timing.fps}
          value={Math.min(currentTime, maxTime)}
          onChange={handleScrub}
          disabled={!audioFile}
        />

        <div className="action-buttons">
          <button className="btn" type="button" onClick={togglePlay} disabled={!audioFile}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={exportToMp4}
            disabled={!audioFile || !loaded}
          >
            Export MP4
          </button>
        </div>

        <div className="status-text" role="status" aria-live="polite">{status}</div>
        {exportProgress > 0 && exportProgress < 1 && (
          <progress className="progress-bar" max={1} value={exportProgress}>
            {Math.round(exportProgress * 100)}%
          </progress>
        )}
      </section>
    </div>
  );
}
