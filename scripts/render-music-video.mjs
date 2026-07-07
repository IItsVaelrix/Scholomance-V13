import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { validateAlignmentSidecar } from "../src/video/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const trackId = process.argv[2];
if (!trackId) {
  console.error("Usage: npx tsx scripts/render-music-video.mjs <trackId>");
  console.error("Example: npx tsx scripts/render-music-video.mjs petrichor");
  process.exit(1);
}

// Dynamically import the track definition
const trackModule = await import(`../src/pages/Visualiser/tracks/${trackId}.ts`);
const track = Object.values(trackModule).find(
  (v) => v && typeof v === "object" && v.id
);

if (!track) {
  console.error(`No track found for id: ${trackId}`);
  process.exit(1);
}

// Merge .align.json sidecar if present
const sidecarPath = resolve(
  __dirname,
  `../src/pages/Visualiser/tracks/${trackId}.align.json`
);
if (existsSync(sidecarPath)) {
  const raw = JSON.parse(readFileSync(sidecarPath, "utf8"));
  if (validateAlignmentSidecar(raw)) {
    if (raw.trackId !== track.id) {
      console.error(`[align] Sidecar trackId mismatch: expected ${track.id}, got ${raw.trackId}`);
      process.exit(1);
    }
    const { wordTimings, ...alignmentMeta } = raw;
    Object.assign(track, { wordTimings, alignmentMeta });
    console.log(`Merged ${wordTimings.length} word timings from sidecar.`);
  } else {
    console.warn(`Warning: ${trackId}.align.json failed validation — rendering without word timings.`);
  }
} else {
  console.warn(`No sidecar found for ${trackId} — rendering without word timings.`);
}

const outputPath = resolve(__dirname, `../output/videos/${trackId}.mp4`);

console.log("Bundling composition...");
const bundleLocation = await bundle({
  entryPoint: resolve(__dirname, "../src/video/index.ts"),
});

console.log("Copying public assets to bundle location...");
import { copyFileSync } from "fs";
if (existsSync(resolve(__dirname, `../public/${trackId}.wav`))) {
  copyFileSync(
    resolve(__dirname, `../public/${trackId}.wav`),
    resolve(bundleLocation, `${trackId}.wav`)
  );
} else if (existsSync(resolve(__dirname, `../public/${trackId}.mp3`))) {
  copyFileSync(
    resolve(__dirname, `../public/${trackId}.mp3`),
    resolve(bundleLocation, `${trackId}.mp3`)
  );
}

import { mkdirSync } from "fs";
const resonanceDir = resolve(bundleLocation, "data/resonance");
if (!existsSync(resonanceDir)) {
  mkdirSync(resonanceDir, { recursive: true });
}
if (existsSync(resolve(__dirname, `../public/data/resonance/${trackId}.resonance.json`))) {
  copyFileSync(
    resolve(__dirname, `../public/data/resonance/${trackId}.resonance.json`),
    resolve(resonanceDir, `${trackId}.resonance.json`)
  );
}

console.log("Selecting composition...");
const composition = await selectComposition({
  serveUrl: bundleLocation,
  id: "KineticLyricsVideo",
  inputProps: { track },
});

console.log(`Rendering ${track.duration}s at 30fps → ${outputPath}`);
await renderMedia({
  composition,
  serveUrl: bundleLocation,
  codec: "h264",
  outputLocation: outputPath,
  inputProps: { track },
  onProgress: ({ progress }) => {
    process.stdout.write(`\rProgress: ${Math.round(progress * 100)}%`);
  },
});

console.log(`\nDone: ${outputPath}`);
