#!/usr/bin/env node
/**
 * Pre-analyzes Dark Star Mirror.wav and writes AudioAnalysis JSON.
 * Mirrors the browser analyzeAudio() algorithm exactly using raw PCM via ffmpeg.
 * Output matches AudioAnalysis from src/video/editor/core/audio-analysis.ts.
 */
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INPUT = join(ROOT, 'lyrics', 'Dark Star Mirror.wav');
const OUTPUT = join(ROOT, 'src', 'video', 'dark-star-mirror.analysis.json');

const FPS = 30;
const SAMPLE_RATE = 44100;
const WINDOW_MS = 50; // matches browser analyzeAudio default
const WINDOW_SAMPLES = Math.floor(SAMPLE_RATE * (WINDOW_MS / 1000)); // 2205

function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', d => (out += d));
    proc.on('close', code => {
      if (code !== 0) reject(new Error('ffprobe failed'));
      else resolve(parseFloat(out.trim()));
    });
    proc.on('error', reject);
  });
}

// Decode audio to raw mono float32 PCM at SAMPLE_RATE via ffmpeg
function extractPCM(filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proc = spawn('ffmpeg', [
      '-i', filePath,
      '-vn',
      '-ac', '1',           // mono
      '-ar', String(SAMPLE_RATE),
      '-f', 'f32le',        // float32 little-endian
      'pipe:1',
    ]);
    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.stderr.on('data', () => {}); // suppress ffmpeg chatter
    proc.on('close', () => resolve(Buffer.concat(chunks)));
    proc.on('error', reject);
  });
}

async function main() {
  console.log('Getting duration…');
  const duration = await getDuration(INPUT);
  console.log(`Duration: ${duration.toFixed(2)}s (${Math.floor(duration / 60)}m${Math.floor(duration % 60)}s)`);

  console.log('Decoding PCM via ffmpeg…');
  const pcmBuf = await extractPCM(INPUT);
  const samples = new Float32Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.length / 4);
  console.log(`Samples: ${samples.length.toLocaleString()} @ ${SAMPLE_RATE} Hz`);

  const totalWindows = Math.floor(samples.length / WINDOW_SAMPLES);
  console.log(`Computing RMS over ${totalWindows} windows (${WINDOW_MS}ms each)…`);

  // — RMS per window (mirrors browser analyzeAudio exactly) ——————————————————
  const rms = new Array(totalWindows);
  for (let w = 0; w < totalWindows; w++) {
    const start = w * WINDOW_SAMPLES;
    let sum = 0;
    for (let i = 0; i < WINDOW_SAMPLES; i++) {
      const s = samples[start + i] ?? 0;
      sum += s * s;
    }
    rms[w] = Math.min(1, Math.sqrt(sum / WINDOW_SAMPLES) * 3); // same 3× boost as browser
  }

  // — Beat detection (mirrors browser detectBeats) ——————————————————————————
  const THRESHOLD = 0.4;
  const MIN_GAP_FRAMES = Math.floor(FPS * 0.2); // 200ms
  const beats = [];
  let lastBeatFrame = -999;

  for (let i = 1; i < rms.length - 1; i++) {
    if (rms[i] > THRESHOLD && rms[i] > rms[i - 1] && rms[i] > rms[i + 1]) {
      // Convert window index → video frame number (same formula as browser)
      const frame = Math.floor((i * WINDOW_SAMPLES / SAMPLE_RATE) * FPS);
      if (frame - lastBeatFrame > MIN_GAP_FRAMES) {
        beats.push(frame);
        lastBeatFrame = frame;
      }
    }
  }

  // — BPM —————————————————————————————————————————————————————————————————
  let bpm;
  if (beats.length > 1) {
    const intervals = [];
    for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const candidate = Math.round((60 * FPS) / avg);
    if (candidate >= 50 && candidate <= 220) bpm = candidate;
  }

  // windowSize in frames: how many video frames one RMS window spans
  const windowSizeFrames = Math.max(1, Math.floor((WINDOW_SAMPLES / SAMPLE_RATE) * FPS));

  console.log(`RMS windows: ${rms.length}  beats: ${beats.length}  BPM: ${bpm ?? 'n/a'}  windowSize: ${windowSizeFrames}f`);

  const analysis = { bpm, beats, rms, windowSize: windowSizeFrames, duration };
  writeFileSync(OUTPUT, JSON.stringify(analysis));
  const kb = Math.round(JSON.stringify(analysis).length / 1024);
  console.log(`Saved → ${OUTPUT} (${kb} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
