/**
 * Gate parity: apply AMP must honor baked multis the same way Scribe's
 * buildResonanceGate does. Rebuilds the bake pipeline in-process so vitest's
 * DOM env cannot drift from a CLI-baked JSON.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DICT = join(ROOT, 'scholomance_dict.sqlite');
const WIRE_EXCLUDED = new Set(['phrase_compound']);

describe('visualizer ↔ Scribe gate parity (Petrichor)', () => {
  it.skipIf(!existsSync(DICT))('in-process bake+apply matches Scribe gate; disk artifact has multis', async () => {
    const { PhonemeEngine } = await import(
      pathToFileURL(join(ROOT, 'codex/core/phonology/phoneme.engine.js')).href
    );
    const { DeepRhymeEngine } = await import(
      pathToFileURL(join(ROOT, 'codex/core/rhyme-astrology/deepRhyme.engine.js')).href
    );
    const { findMultiRhymes } = await import(
      pathToFileURL(join(ROOT, 'codex/core/rhyme-astrology/multiRhyme.engine.js')).href
    );
    const { compileVerseToIR } = await import(
      pathToFileURL(join(ROOT, 'codex/core/shared/truesight/compiler/compileVerseToIR.js')).href
    );
    const { buildSelfDictionaryAPI } = await import(
      pathToFileURL(join(ROOT, 'codex/server/adapters/selfDictionary.authority.js')).href
    );
    const { buildResonanceGate } = await import(
      pathToFileURL(join(ROOT, 'src/lib/truesight/buildResonanceGate.js')).href
    );
    const {
      applyVisualizerTruesight,
      digestSourceText,
      TRUESIGHT_ARTIFACT_SCHEMA,
    } = await import(
      pathToFileURL(join(ROOT, 'src/lib/truesight/visualizerTruesightAmp.js')).href
    );
    const { WORD_REGEX_GLOBAL } = await import(
      pathToFileURL(join(ROOT, 'codex/core/constants/regex.js')).href
    );
    const { PETRICHOR } = await import(
      pathToFileURL(join(ROOT, 'src/pages/Visualiser/tracks/petrichor.ts')).href
    );

    const lyrics = PETRICHOR.lyrics;
    const text = lyrics.join('\n');
    const uniqueWords = [...new Set(text.match(WORD_REGEX_GLOBAL) || [])];
    const dictionaryAPI = buildSelfDictionaryAPI({ log: { info() {}, warn() {}, error() {} } });

    PhonemeEngine.authorityFailure = null;
    PhonemeEngine.clearCache?.();
    await PhonemeEngine.primeAuthorityBatch(uniqueWords, dictionaryAPI);
    await PhonemeEngine.primeG2PBatch?.(uniqueWords);

    const engine = new DeepRhymeEngine();
    const analysis = await engine.analyzeDocument(text, {
      authorityMode: 'blocking',
      dictionaryAPI,
    });
    await engine.primeRhymeFamilies(uniqueWords, dictionaryAPI);

    const connections = (analysis?.allConnections || []).filter((c) => c && !WIRE_EXCLUDED.has(c.type));
    const verseIR = compileVerseToIR(text, {
      phonemeEngine: PhonemeEngine,
      mode: analysis?.compiler?.mode || 'balanced',
    });
    const multis = findMultiRhymes(verseIR, { phonemeEngine: PhonemeEngine })
      .map(({ __start, ...chain }) => chain);

    expect(multis.length).toBeGreaterThan(0);

    const wordsByCharStart = {};
    for (const line of analysis?.lines || []) {
      for (const w of line?.words || []) {
        const cs = Number(w?.charStart);
        if (!Number.isFinite(cs)) continue;
        wordsByCharStart[String(cs)] = {
          token: w.word || '',
          charStart: cs,
          rhymeKey: w.rhymeKey || w.analysis?.rhymeKey || null,
          rhymeFamily: w.rhymeFamily || null,
          vowelFamily: w.vowelFamily || null,
          phonemes: Array.isArray(w.analysis?.phonemes) ? w.analysis.phonemes : [],
        };
      }
    }

    const artifact = {
      schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
      trackId: PETRICHOR.id,
      sourceTextDigest: await digestSourceText(text),
      authorityUnavailable: Boolean(PhonemeEngine.authorityFailure),
      wordsByCharStart,
      connections,
      multis,
      bakedAt: new Date().toISOString(),
    };

    const scribeGate = buildResonanceGate(connections, {
      authorityUnavailable: artifact.authorityUnavailable,
      multis,
    });
    const withoutMultis = buildResonanceGate(connections, {
      authorityUnavailable: false,
      multis: [],
    });
    expect(scribeGate.size).toBeGreaterThan(withoutMultis.size);

    const applied = await applyVisualizerTruesight({
      lyrics,
      artifact,
      trackId: PETRICHOR.id,
    });
    expect(applied.syncMode).toBe('gated');

    // Apply omits a serialized gate Map (lines already carry tier). Parity is
    // gateSize plus per-tier counts on painted tokens.
    expect(applied.gateSize).toBe(scribeGate.size);
    const vizTierCounts = { rhyme: 0, assonance: 0 };
    for (const row of applied.lines || []) {
      for (const tok of row) {
        if (tok?.tier === 'rhyme' || tok?.tier === 'assonance') vizTierCounts[tok.tier] += 1;
      }
    }
    const scribeTierCounts = { rhyme: 0, assonance: 0 };
    for (const tier of scribeGate.values()) scribeTierCounts[tier] += 1;
    expect(vizTierCounts).toEqual(scribeTierCounts);

    // Disk bake must include the multi pass (Approach A regression).
    const diskPath = join(ROOT, `public/data/truesight/${PETRICHOR.id}.truesight-v1.json`);
    expect(existsSync(diskPath)).toBe(true);
    const disk = JSON.parse(readFileSync(diskPath, 'utf8'));
    expect(disk.multis?.length ?? 0).toBeGreaterThan(0);
    const diskDigest = createHash('sha256').update(text, 'utf8').digest('hex');
    expect(disk.sourceTextDigest).toBe(diskDigest);
  }, 60000);
});
