#!/usr/bin/env node
/**
 * Bake Visualizer Truesight artifacts (scholomance.truesight.v1).
 *
 *   npm run bake:visualiser:truesight
 *   npm run bake:visualiser:truesight -- --track=petrichor
 *   npm run bake:visualiser:truesight -- --require-authority
 *
 * Runs DeepRhymeEngine offline, writes public/data/truesight/<id>.truesight-v1.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/data/truesight');
const WIRE_EXCLUDED = new Set(['phrase_compound']);

function parseArgs(argv) {
  const track = argv.find((a) => a.startsWith('--track='))?.slice('--track='.length) || null;
  const requireAuthority = argv.includes('--require-authority');
  return { track, requireAuthority };
}

function digest(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

async function loadTracks() {
  // Import track modules directly — tracks/index pulls albums.ts which reads
  // import.meta.env.BASE_URL (Vite-only) and blows up under Node bake.
  const modules = await Promise.all([
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/petrichor.ts')).href),
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/bigFather.ts')).href),
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/polarity.ts')).href),
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/daydreaming-nightmares.ts')).href),
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/regret.ts')).href),
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/scholomancer.ts')).href),
    import(pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/sonic-thaumaturgy.ts')).href),
  ]);
  const keys = ['PETRICHOR', 'BIG_FATHER', 'POLARITY', 'DAYDREAMING_NIGHTMARES', 'REGRET', 'SCHOLOMANCER', 'SONIC_THAUMATURGY'];
  return modules.map((mod, i) => mod[keys[i]]).filter(Boolean);
}

async function bakeTrack(track, { requireAuthority }) {
  const { PhonemeEngine } = await import(pathToFileURL(join(ROOT, 'codex/core/phonology/phoneme.engine.js')).href);
  const { DeepRhymeEngine } = await import(pathToFileURL(join(ROOT, 'codex/core/rhyme-astrology/deepRhyme.engine.js')).href);
  const { TRUESIGHT_ARTIFACT_SCHEMA } = await import(pathToFileURL(join(ROOT, 'src/lib/truesight/visualizerTruesightAmp.js')).href);
  const { verseIRMicroprocessors } = await import(pathToFileURL(join(ROOT, 'codex/core/microprocessors/index.js')).href);

  const lyrics = Array.isArray(track.lyrics) ? track.lyrics : [];
  const text = lyrics.join('\n');
  const uniqueWords = [...new Set((text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []))];

  // Connect Scholomance Dictionary via microprocessor (self-sqlite in Node —
  // same authority path as panelAnalysis). Bare primeAuthorityBatch() fetches
  // and fails offline, leaving authorityUnavailable=true and blank colors.
  const { buildSelfDictionaryAPI } = await import(
    pathToFileURL(join(ROOT, 'codex/server/adapters/selfDictionary.authority.js')).href
  );
  const dictionaryAPI = buildSelfDictionaryAPI({ log: console });
  const primed = await verseIRMicroprocessors.execute('dict.primeAuthority', {
    words: uniqueWords,
    text,
    dictionaryAPI,
  });

  const engine = new DeepRhymeEngine();
  // Match panelAnalysis order: analyze first, then prime rhyme families,
  // then compileVerseToIR + findMultiRhymes (multis never come from DeepRhyme).
  const analysis = await engine.analyzeDocument(text, {
    authorityMode: 'blocking',
    dictionaryAPI,
  });
  if (typeof engine.primeRhymeFamilies === 'function') {
    await engine.primeRhymeFamilies(uniqueWords, dictionaryAPI);
  }

  const authorityUnavailable = Boolean(PhonemeEngine.authorityFailure) || Boolean(primed?.authorityUnavailable);
  if (requireAuthority && authorityUnavailable) {
    throw new Error(`[bake:truesight] authority unavailable for ${track.id} — refuse bake`);
  }

  const connections = (Array.isArray(analysis?.allConnections) ? analysis.allConnections : [])
    .filter((c) => c && !WIRE_EXCLUDED.has(c.type));

  // Multis are a SEPARATE pipeline (same as panelAnalysis) — DeepRhyme never
  // fills analysis.multis. Without this pass the Visualizer gate under-colors
  // vs Scribe (~70 words / 78 tier upgrades on Petrichor).
  const { compileVerseToIR } = await import(
    pathToFileURL(join(ROOT, 'codex/core/shared/truesight/compiler/compileVerseToIR.js')).href
  );
  const { findMultiRhymes } = await import(
    pathToFileURL(join(ROOT, 'codex/core/rhyme-astrology/multiRhyme.engine.js')).href
  );
  let multis = [];
  try {
    const verseIR = compileVerseToIR(text, {
      phonemeEngine: PhonemeEngine,
      mode: analysis?.compiler?.mode || 'balanced',
    });
    multis = findMultiRhymes(verseIR, { phonemeEngine: PhonemeEngine })
      .map(({ __start, ...chain }) => chain);
  } catch (err) {
    console.warn(
      `[bake:truesight] multi-rhyme pass failed for ${track.id}; continuing without multis:`,
      err?.message || err,
    );
  }

  const wordsByCharStart = {};
  const lines = Array.isArray(analysis?.lines) ? analysis.lines : [];
  for (const line of lines) {
    const words = Array.isArray(line?.words) ? line.words : [];
    for (const w of words) {
      const cs = Number(w?.charStart);
      if (!Number.isFinite(cs)) continue;
      wordsByCharStart[String(cs)] = {
        token: w.word || '',
        charStart: cs,
        lineIndex: line.lineIndex ?? w.lineIndex,
        rhymeKey: w.rhymeKey || w.analysis?.rhymeKey || null,
        rhymeFamily: w.rhymeFamily || null,
        vowelFamily: w.vowelFamily || null,
        phonemes: Array.isArray(w.analysis?.phonemes) ? w.analysis.phonemes : [],
        syllableCount: Number(w.syllableCount) || undefined,
      };
    }
  }

  const artifact = {
    schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
    trackId: track.id,
    sourceTextDigest: digest(text),
    authorityUnavailable,
    wordsByCharStart,
    connections,
    multis,
    bakedAt: new Date().toISOString(),
    stats: {
      wordProfiles: Object.keys(wordsByCharStart).length,
      connections: connections.length,
      multis: multis.length,
      gateEligible: !authorityUnavailable && (connections.length > 0 || multis.length > 0),
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${track.id}.truesight-v1.json`);
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return { outPath, artifact, primed };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tracks = await loadTracks();
  const selected = opts.track
    ? tracks.filter((t) => {
        const q = opts.track.toLowerCase();
        return t.id === opts.track
          || String(t.id).startsWith(opts.track)
          || String(t.title || '').toLowerCase().includes(q)
          || String(t.title || '').toLowerCase().replace(/\s+/g, '-') === q;
      })
    : tracks;

  if (!selected.length) {
    console.error(opts.track
      ? `[bake:truesight] no track id=${opts.track}`
      : '[bake:truesight] no GRIMOIRE_TRACKS');
    process.exitCode = 1;
    return;
  }

  for (const track of selected) {
    const { outPath, artifact, primed } = await bakeTrack(track, opts);
    console.log(
      `[bake:truesight] ${track.id} → ${outPath} `
      + `(words=${artifact.stats.wordProfiles} connections=${artifact.stats.connections} `
      + `multis=${artifact.stats.multis} `
      + `authorityUnavailable=${artifact.authorityUnavailable} prime=${primed?.source || '?'})`,
    );
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
