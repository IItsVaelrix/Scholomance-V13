/**
 * Visualizer Truesight AMP — apply path (gated coloring from baked artifacts).
 *
 * COLOR_DRAGON: when artifact word profiles exist, hue comes from tokenTruesight
 * (backend/baked fields). Client analyzeDeep is never used for those tokens.
 */

import { buildResonanceGate } from './buildResonanceGate.js';
import { tokenTruesight } from '../../pages/Visualiser/truesightColor.ts';
import { WORD_PATTERN } from '../../../codex/core/constants/regex.js';

export const TRUESIGHT_ARTIFACT_SCHEMA = 'scholomance.truesight.v1';
export const AMP_ID = 'amp.visualizer.truesight';

const WORD_SPLIT = new RegExp(`(${WORD_PATTERN}|\\s+|[^A-Za-z\\s]+)`, 'g');

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex — Node bake and browser apply must agree. */
export async function digestSourceText(text) {
  const data = String(text || '');
  if (globalThis.process?.versions?.node) {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return bytesToHex(new Uint8Array(buf));
  }
  // Deterministic fallback if neither crypto surface exists (tests / odd hosts).
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a32_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function joinLyricLines(lyrics) {
  return (Array.isArray(lyrics) ? lyrics : []).map((l) => String(l ?? '')).join('\n');
}

/**
 * Map each lyric line into tokens with global charStarts.
 * Whitespace is NEVER a token — it advances the cursor and becomes `padLeft`
 * on the following token so layout survives without a span flood.
 * Convention matches Scribe: lines joined by a single \\n.
 */
export function tokenizeLyricsWithCharStarts(lyrics) {
  const lines = Array.isArray(lyrics) ? lyrics : [];
  const out = [];
  let global = 0;
  const wordRe = new RegExp(`^${WORD_PATTERN}$`);
  const spaceRe = /^\s+$/;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = String(lines[lineIndex] ?? '');
    const tokens = [];
    WORD_SPLIT.lastIndex = 0;
    const parts = line.match(WORD_SPLIT) || (line ? [line] : []);
    let local = 0;
    let padLeft = '';
    for (const part of parts) {
      if (spaceRe.test(part)) {
        padLeft += part;
        local += part.length;
        continue;
      }
      const isWord = wordRe.test(part);
      tokens.push({
        word: part,
        charStart: isWord ? global + local : null,
        isWord,
        padLeft,
      });
      padLeft = '';
      local += part.length;
    }
    out.push({ lineIndex, tokens });
    global += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
  }
  return out;
}

function blankLinesFromLyrics(lyrics) {
  return tokenizeLyricsWithCharStarts(lyrics).map(({ tokens }) =>
    tokens.map((tok) => ({
      word: tok.word,
      color: null,
      school: null,
      analysis: null,
      tier: null,
      isWord: tok.isWord,
      padLeft: tok.padLeft || '',
    })),
  );
}

/**
 * @param {{ lyrics: string[], artifact?: object|null, trackId?: string }} payload
 */
export async function applyVisualizerTruesight(payload = {}) {
  const lyrics = Array.isArray(payload.lyrics) ? payload.lyrics : [];
  const trackId = String(payload.trackId || '');
  const artifact = payload.artifact && typeof payload.artifact === 'object' ? payload.artifact : null;
  const sourceText = joinLyricLines(lyrics);
  const digest = await digestSourceText(sourceText);
  const emptyLines = blankLinesFromLyrics(lyrics);

  if (!artifact) {
    return {
      ampId: AMP_ID,
      syncMode: 'empty',
      dominantSchool: 'SONIC',
      gateSize: 0,
      gate: [],
      lines: emptyLines,
      sourceTextDigest: digest,
    };
  }

  if (artifact.schemaVersion !== TRUESIGHT_ARTIFACT_SCHEMA) {
    return {
      ampId: AMP_ID,
      syncMode: 'mismatch',
      dominantSchool: 'SONIC',
      gateSize: 0,
      gate: [],
      lines: emptyLines,
      sourceTextDigest: digest,
      reason: 'schema',
    };
  }

  if (trackId && artifact.trackId && artifact.trackId !== trackId) {
    return {
      ampId: AMP_ID,
      syncMode: 'mismatch',
      dominantSchool: 'SONIC',
      gateSize: 0,
      gate: [],
      lines: emptyLines,
      sourceTextDigest: digest,
      reason: 'trackId',
    };
  }

  if (artifact.sourceTextDigest && artifact.sourceTextDigest !== digest) {
    return {
      ampId: AMP_ID,
      syncMode: 'mismatch',
      dominantSchool: 'SONIC',
      gateSize: 0,
      gate: [],
      lines: emptyLines,
      sourceTextDigest: digest,
      reason: 'digest',
    };
  }

  const authorityUnavailable = Boolean(artifact.authorityUnavailable);
  const connections = Array.isArray(artifact.connections) ? artifact.connections : [];
  const multis = Array.isArray(artifact.multis) ? artifact.multis : [];
  const wordsByCharStart = artifact.wordsByCharStart && typeof artifact.wordsByCharStart === 'object'
    ? artifact.wordsByCharStart
    : {};

  const gate = buildResonanceGate(connections, { authorityUnavailable, multis });
  const tokenized = tokenizeLyricsWithCharStarts(lyrics);
  const schoolCounts = {};

  // Whitespace is not a token (see tokenizeLyricsWithCharStarts). Punct stays
  // so "(PANDA!!!!)" remains layout-faithful without a span per space.
  const lines = tokenized.map(({ tokens }) => {
    const row = [];
    for (const tok of tokens) {
      const padLeft = tok.padLeft || '';
      if (!tok.isWord) {
        row.push({
          word: tok.word,
          color: null,
          school: null,
          analysis: null,
          tier: null,
          padLeft,
        });
        continue;
      }
      const tier = gate.get(tok.charStart) || null;
      const tokenData = wordsByCharStart[String(tok.charStart)] ?? null;

      if (authorityUnavailable || gate.size === 0 || tier == null) {
        row.push({
          word: tok.word,
          color: null,
          school: null,
          analysis: null,
          tier: null,
          padLeft,
        });
        continue;
      }

      // COLOR_DRAGON: gated without baked tokenData → leave grey. Never wordTruesight
      // (client G2P) — that recomputes vowel-family truth when backend fields are absent.
      if (!tokenData) {
        row.push({
          word: tok.word,
          color: null,
          school: null,
          analysis: null,
          tier,
          padLeft,
        });
        continue;
      }

      const ts = tokenTruesight(tokenData, tok.word);
      if (ts?.school) schoolCounts[ts.school] = (schoolCounts[ts.school] || 0) + 1;
      row.push({
        word: tok.word,
        color: ts?.color ?? null,
        school: ts?.school ?? null,
        analysis: {
          rhymeKey: tokenData.rhymeKey ?? null,
          rhymeFamily: tokenData.rhymeFamily ?? null,
          vowelFamily: tokenData.vowelFamily ?? null,
          syllableCount: tokenData.syllableCount,
        },
        tier,
        padLeft,
      });
    }
    return row;
  });

  const dominantSchool = Object.entries(schoolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'SONIC';
  const syncMode = authorityUnavailable
    ? 'degraded'
    : (gate.size === 0 ? 'empty' : 'gated');

  return {
    ampId: AMP_ID,
    syncMode,
    dominantSchool,
    gateSize: gate.size,
    // Intentionally omit serialized gate — consumers use colored lines only.
    // Returning the full gate duplicated resonance state already applied above.
    lines,
    sourceTextDigest: digest,
  };
}

/** Microprocessor entry. */
export async function runVisualizerTruesightAmp(payload, _context) {
  return applyVisualizerTruesight(payload);
}
