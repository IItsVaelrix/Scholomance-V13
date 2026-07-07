/**
 * align-track.mjs — WhisperX forced alignment pipeline
 *
 * Produces a .align.json sidecar for a GrimoireTrack:
 *   - Downloads audio from Suno CDN (cached locally)
 *   - Runs WhisperX forced alignment against the track's lyrics
 *   - Annotates each word with G2P-derived school and ScholoTime beat state
 *   - Writes src/pages/Visualiser/tracks/<trackId>.align.json
 *   - Emits confidence report for words scoring below 0.8
 *
 * Prerequisites:
 *   pip install whisperx
 *   ffmpeg on PATH
 *   HuggingFace token for the alignment model (set HF_TOKEN env var)
 *
 * Usage:
 *   npx tsx scripts/align-track.mjs <trackId>
 *   npx tsx scripts/align-track.mjs petrichor
 */

import { spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const trackId = process.argv[2];
if (!trackId) {
  console.error("Usage: npx tsx scripts/align-track.mjs <trackId>");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load track
// ---------------------------------------------------------------------------

const trackModule = await import(`../src/pages/Visualiser/tracks/${trackId}.ts`);
const track = Object.values(trackModule).find(
  (v) => v && typeof v === "object" && (v as any).id
) as any;

if (!track) {
  console.error(`No track found for trackId: ${trackId}`);
  process.exit(1);
}

if (!track.pacing?.bpm) {
  console.error(
    `[align] Track ${trackId} has no measured BPM (pacing.bpm). ` +
    `Measure it and add a pacing block before aligning.`
  );
  process.exit(1);
}

const { bpm, leadInS = 0 } = track.pacing;
const offsetMs = leadInS * 1000;

// ---------------------------------------------------------------------------
// Download audio (cached)
// ---------------------------------------------------------------------------

const tmpDir = resolve(__dirname, "../.tmp/align");
mkdirSync(tmpDir, { recursive: true });

const audioPath = resolve(tmpDir, `${trackId}.mp3`);
if (!existsSync(audioPath)) {
  console.log(`Downloading audio: ${track.audioUrl}`);
  const resp = await fetch(track.audioUrl);
  if (!resp.ok) {
    console.error(`Audio download failed: ${resp.status} ${track.audioUrl}`);
    process.exit(1);
  }
  await pipeline(resp.body as any, createWriteStream(audioPath));
  console.log("Downloaded and cached.");
} else {
  console.log(`Using cached audio: ${audioPath}`);
}

// Hash the audio for the sidecar
const audioBytes = readFileSync(audioPath);
const audioHash = createHash("sha256").update(audioBytes).digest("hex").slice(0, 16);

// Hash the lyrics for stale detection
const lyricsText = track.lyrics.join("\n");
const lyricsHash = createHash("sha256").update(lyricsText).digest("hex").slice(0, 16);

// Write lyrics text file for WhisperX
const lyricsPath = resolve(tmpDir, `${trackId}.lyrics.txt`);
writeFileSync(lyricsPath, lyricsText, "utf8");

// ---------------------------------------------------------------------------
// Run WhisperX forced alignment
// ---------------------------------------------------------------------------

const whisperxOut = resolve(tmpDir, `${trackId}_whisperx`);
mkdirSync(whisperxOut, { recursive: true });

console.log("Running WhisperX forced alignment...");
const result = spawnSync(
  "whisperx",
  [
    audioPath,
    "--align_model", "WAV2VEC2_ASR_LARGE_LV60K_960H",
    "--output_dir", whisperxOut,
    "--output_format", "json",
    "--language", "en",
  ],
  { stdio: "inherit", env: { ...process.env } }
);

if (result.status !== 0) {
  console.error(
    "WhisperX failed. Check:\n" +
    "  1. pip install whisperx\n" +
    "  2. ffmpeg on PATH\n" +
    "  3. HF_TOKEN env var set for alignment model\n" +
    "  4. CPU/CUDA availability"
  );
  process.exit(1);
}

// WhisperX JSON output filename matches the audio basename
const whisperxJsonPath = resolve(whisperxOut, `${trackId}.json`);
if (!existsSync(whisperxJsonPath)) {
  console.error(`WhisperX output not found: ${whisperxJsonPath}`);
  process.exit(1);
}

const whisperxData = JSON.parse(readFileSync(whisperxJsonPath, "utf8"));
// WhisperX output: { segments: [{ words: [{ word, start, end, score }] }] }
const rawWords: Array<{ word: string; start: number; end?: number; score?: number }> =
  whisperxData.segments?.flatMap((seg: any) => seg.words ?? []) ?? [];

if (rawWords.length === 0) {
  console.error("WhisperX returned no word-level timestamps. Check alignment model compatibility.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// G2P + ScholoTime annotation
// ---------------------------------------------------------------------------

const { runG2PJury } = await import("../codex/core/phonology/g2p/g2p.adapter.js");
const { VOWEL_FAMILY_TO_SCHOOL } = await import("../codex/core/constants/schools.js");
const { resolveBeatState, resolveBarState } = await import(
  "../codex/core/scholotime/scholotime.math.js"
);

// ARPAbet vowel families have optional stress marker (0, 1, 2) — strip it
function stripStress(phoneme: string): string {
  return phoneme.replace(/[012]$/, "");
}

async function wordToSchool(word: string): Promise<string> {
  try {
    const clean = word.replace(/[^a-zA-Z']/g, "").toUpperCase();
    if (!clean) return "VOID";
    const { verdict } = await runG2PJury(clean);
    const phonemes: string[] = verdict?.winner?.phonemes ?? [];
    const vowels = phonemes
      .map(stripStress)
      .filter((p) => VOWEL_FAMILY_TO_SCHOOL[p]);
    if (vowels.length === 0) return "VOID";
    // Use the stressed vowel if present, otherwise first vowel
    const stressed = phonemes
      .filter((p) => /[12]$/.test(p))
      .map(stripStress)
      .find((p) => VOWEL_FAMILY_TO_SCHOOL[p]);
    return VOWEL_FAMILY_TO_SCHOOL[stressed ?? vowels[0]] ?? "VOID";
  } catch {
    return "VOID";
  }
}

const suspiciousWords: Array<{ word: string; startMs: number; confidence: number }> = [];

const wordTimings = await Promise.all(
  rawWords
    .filter((w) => w.word && typeof w.start === "number")
    .map(async (w) => {
      const startMs = Math.round(w.start * 1000);
      const endMs = Math.round((w.end ?? w.start + 0.2) * 1000);
      const confidence = w.score ?? 1;

      const school = await wordToSchool(w.word);

      const beatState = resolveBeatState(startMs, { bpm, offsetMs });
      const barState = resolveBarState(beatState);

      if (confidence < 0.8) {
        suspiciousWords.push({ word: w.word, startMs, confidence });
      }

      return {
        word: w.word,
        startMs,
        endMs,
        beat: {
          index: beatState.index,
          phase: Number(beatState.phase.toFixed(4)),
          bar: barState.index,
          barPhase: Number(barState.phase.toFixed(4)),
        },
        school,
        confidence: Number(confidence.toFixed(3)),
      };
    })
);

// ---------------------------------------------------------------------------
// Write sidecar
// ---------------------------------------------------------------------------

const sidecar = {
  schemaVersion: "scholomance.align.v1",
  trackId: track.id,
  bpm,
  offsetMs,
  lyricsHash,
  audioUrl: track.audioUrl,
  audioHash,
  generatedAt: new Date().toISOString(),
  wordTimings,
};

const sidecarPath = resolve(
  __dirname,
  `../src/pages/Visualiser/tracks/${trackId}.align.json`
);
writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");

console.log(`\nWrote ${wordTimings.length} word timings → ${sidecarPath}`);

// ---------------------------------------------------------------------------
// Confidence report
// ---------------------------------------------------------------------------

if (suspiciousWords.length > 0) {
  console.warn(
    `\n⚠  ${suspiciousWords.length} suspicious word(s) (confidence < 0.8):`
  );
  for (const sw of suspiciousWords) {
    console.warn(
      `   "${sw.word}" at ${sw.startMs}ms — score ${sw.confidence.toFixed(2)}`
    );
  }
  console.warn(
    "\nReview these in the sidecar. Ad libs, doubled vocals, and Suno " +
    "pronunciation drift are the most common causes. Add manualOffsetMs " +
    "to correct individual words without re-running alignment."
  );
} else {
  console.log("All words aligned with confidence ≥ 0.8 ✓");
}
