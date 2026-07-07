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
import { dirname, resolve, basename, extname } from "path";
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
  (v) => v && typeof v === "object" && v.id
);

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
// Run Demucs vocal-stem separation
// ---------------------------------------------------------------------------

const demucsOut = resolve(tmpDir, `${trackId}_demucs`);
console.log("Running Demucs vocal separation...");
const demucsResult = spawnSync(
  "uvx",
  ["--with", "demucs", "--with", "torchcodec", "demucs", "--two-stems", "vocals", audioPath, "-o", demucsOut],
  { stdio: "inherit", env: { ...process.env } }
);

if (demucsResult.status !== 0) {
  console.error("Demucs failed. Ensure uv is available.");
  process.exit(1);
}

const trackBasename = basename(audioPath, extname(audioPath));
const vocalsPath = resolve(demucsOut, "htdemucs", trackBasename, "vocals.wav");

if (!existsSync(vocalsPath)) {
  console.error(`Demucs vocals not found at: ${vocalsPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run WhisperX forced alignment
// ---------------------------------------------------------------------------

const whisperxOut = resolve(tmpDir, `${trackId}_whisperx`);
mkdirSync(whisperxOut, { recursive: true });

console.log("Running WhisperX forced alignment on isolated vocals...");
const result = spawnSync(
  "whisperx",
  [
    vocalsPath,
    "--align_model", "WAV2VEC2_ASR_LARGE_LV60K_960H",
    "--output_dir", whisperxOut,
    "--output_format", "json",
    "--language", "en",
    "--compute_type", "float32",
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
// Restore True Lyrics (Needleman-Wunsch Alignment)
// ---------------------------------------------------------------------------

const trueWords = track.lyrics
  .join(" ")
  .replace(/\[.*?\]/g, "") // remove structural markers like [Chorus]
  .split(/\s+/)
  .filter(Boolean);

console.log(`Aligning ${rawWords.length} transcribed words to ${trueWords.length} true lyric words...`);

// Needleman-Wunsch DP
const m = trueWords.length;
const n = rawWords.length;
const score = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
const gapPenalty = -2;

function wordSimilarity(w1, w2) {
  const s1 = w1.toLowerCase().replace(/[^\w]/g, "");
  const s2 = (w2.word || "").toLowerCase().replace(/[^\w]/g, "");
  if (s1 === s2) return 2;
  if (s1.startsWith(s2) || s2.startsWith(s1)) return 1;
  return -1;
}

for (let i = 0; i <= m; i++) score[i][0] = i * gapPenalty;
for (let j = 0; j <= n; j++) score[0][j] = j * gapPenalty;

for (let i = 1; i <= m; i++) {
  for (let j = 1; j <= n; j++) {
    const match = score[i - 1][j - 1] + wordSimilarity(trueWords[i - 1], rawWords[j - 1]);
    const deleteScore = score[i - 1][j] + gapPenalty;
    const insertScore = score[i][j - 1] + gapPenalty;
    score[i][j] = Math.max(match, deleteScore, insertScore);
  }
}

// Backtrack
let i = m;
let j = n;
const mappedTrueWords = []; // Array of { word, start, end, score }

while (i > 0 || j > 0) {
  if (i > 0 && j > 0 && score[i][j] === score[i - 1][j - 1] + wordSimilarity(trueWords[i - 1], rawWords[j - 1])) {
    mappedTrueWords.unshift({
      word: trueWords[i - 1], // USE TRUE WORD (restores punctuation & intended meaning)
      start: rawWords[j - 1].start,
      end: rawWords[j - 1].end,
      score: rawWords[j - 1].score
    });
    i--;
    j--;
  } else if (i > 0 && (j === 0 || score[i][j] === score[i - 1][j] + gapPenalty)) {
    // True word deleted by whisper (wasn't transcribed)
    mappedTrueWords.unshift({
      word: trueWords[i - 1],
      start: null, // Will interpolate later
      end: null,
      score: 0.1
    });
    i--;
  } else {
    // Whisper hallucinated a word (insert), we discard it
    j--;
  }
}

// Interpolate missing timestamps
for (let k = 0; k < mappedTrueWords.length; k++) {
  if (mappedTrueWords[k].start === null) {
    let prev = 0;
    for (let p = k - 1; p >= 0; p--) {
      if (mappedTrueWords[p].end !== null) { prev = mappedTrueWords[p].end; break; }
    }
    let next = prev + 0.2;
    for (let nIdx = k + 1; nIdx < mappedTrueWords.length; nIdx++) {
      if (mappedTrueWords[nIdx].start !== null) { next = mappedTrueWords[nIdx].start; break; }
    }
    mappedTrueWords[k].start = prev + (next - prev) * 0.1; // Place it slightly after prev
    mappedTrueWords[k].end = mappedTrueWords[k].start + 0.2;
  }
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

// Load resonance sidecar for onset snapping
const resonanceSidecarPath = resolve(__dirname, `../public/data/resonance/${trackId}.resonance.json`);
let onsets = [];
if (existsSync(resonanceSidecarPath)) {
  const resData = JSON.parse(readFileSync(resonanceSidecarPath, "utf8"));
  onsets = (resData.frames || [])
    .filter((f) => f.spectral && f.spectral.onset === 1)
    .map((f) => f.timeMs);
  console.log(`Loaded ${onsets.length} onsets from resonance sidecar for word-snapping.`);
} else {
  console.warn("No resonance sidecar found. Cannot snap word timings to onsets.");
}

const wordTimings = [];
for (const w of mappedTrueWords) {
  if (!w.word) continue;
  let startMs = Math.round((w.start || 0) * 1000);
  
  // Snap to closest onset within 100ms
  if (onsets.length > 0) {
    let closestOnset = null;
    let minDistance = 100;
    for (const onset of onsets) {
      const dist = Math.abs(onset - startMs);
      if (dist < minDistance) {
        minDistance = dist;
        closestOnset = onset;
      }
    }
    if (closestOnset !== null) {
      startMs = closestOnset;
    }
  }

  const endMs = Math.round((w.end ?? w.start + 0.2) * 1000);
  const confidence = w.score ?? 1;

  const school = await wordToSchool(w.word);

  const beatState = resolveBeatState(startMs, { bpm, offsetMs });
  const barState = resolveBarState(beatState);

  if (confidence < 0.8) {
    suspiciousWords.push({ word: w.word, startMs, confidence });
  }

  wordTimings.push({
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
  });
}

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
