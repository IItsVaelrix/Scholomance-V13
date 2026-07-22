/** @typedef {import('../types.js').ConstellationPhase1Packet} ConstellationPhase1Packet */

function normalizeQuery(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function countGraphemes(s) {
  return [...s].length;
}

function countTokens(normalized) {
  if (!normalized) return 0;
  return normalized.split(' ').filter(Boolean).length;
}

/**
 * @param {string} rawQuery
 * @returns {ConstellationPhase1Packet}
 */
export function buildAwaitingPacket(rawQuery) {
  const raw = String(rawQuery || '');
  const normalized = normalizeQuery(raw);
  return {
    version: 1,
    schema_id: 'scholomance/constellation-os-page-phase1',
    pageBytecode: `COS-PAGE-v1-AWAITING-${normalized || 'empty'}`,
    query: {
      raw,
      normalized,
      kind: normalized.includes(' ') ? 'phrase' : 'word',
      tokenCount: countTokens(normalized),
      graphemeCount: countGraphemes(normalized),
    },
    leximancy: {
      status: 'unsupported',
      selectedInterpretationId: null,
      interpretations: [],
      warnings: ['Leximancy constellation_atlas not wired in v1'],
    },
    rhymeAstrology: null,
    phraseGenome: {
      syllables: 0,
      devicesHint: [],
      schoolHint: null,
    },
    diagnostics: {
      degradedChannels: ['leximancy', 'rhymeAstrology'],
      warnings: ['Fixture awaiting-engine packet'],
    },
    provenance: {
      engineVersions: {
        constellationOS: 'phase1-fixture',
        leximancy: 'unwired',
        rhymeAstrology: 'unwired',
      },
    },
  };
}

/** Canonical literary fixture — ambiguity preserved (PDR §7.4). */
export const SAMPLE_BRIGHT_WOUND_PACKET = Object.freeze({
  version: 1,
  schema_id: 'scholomance/constellation-os-page-phase1',
  pageBytecode: 'COS-PAGE-v1-BRIGHT-WOUND-001',
  query: {
    raw: 'the bright wound of morning',
    normalized: 'the bright wound of morning',
    kind: 'phrase',
    tokenCount: 5,
    graphemeCount: 27,
  },
  leximancy: {
    status: 'ambiguous',
    selectedInterpretationId: null,
    interpretations: [
      { id: 'wound.injury', gloss: 'injury / opening in flesh', confidence: 0.52 },
      { id: 'wound.past', gloss: 'past tense of wind', confidence: 0.41 },
    ],
    warnings: ['Margin below selection threshold — ambiguity is data'],
  },
  rhymeAstrology: {
    phonemes: ['DH', 'AH0', 'B', 'R', 'AY1', 'T', 'W', 'UW1', 'N', 'D'],
    stress: 'x / x / x',
    cadenceFamily: 'iambic-adjacent',
    exactRhymes: ['mooring', 'warning'],
    slantRhymes: ['mourning'],
  },
  phraseGenome: {
    syllables: 7,
    devicesHint: ['metaphor-candidate'],
    schoolHint: 'PSYCHIC',
  },
  diagnostics: {
    degradedChannels: [],
    warnings: [],
  },
  provenance: {
    engineVersions: {
      constellationOS: 'phase1-fixture',
      leximancy: 'fixture-1',
      rhymeAstrology: 'fixture-1',
    },
  },
});

/**
 * @param {string} rawQuery
 * @returns {ConstellationPhase1Packet}
 */
export function resolveConstellationFixture(rawQuery) {
  const normalized = normalizeQuery(rawQuery);
  if (normalized === SAMPLE_BRIGHT_WOUND_PACKET.query.normalized) {
    return {
      ...SAMPLE_BRIGHT_WOUND_PACKET,
      query: { ...SAMPLE_BRIGHT_WOUND_PACKET.query, raw: String(rawQuery).trim() },
    };
  }
  return buildAwaitingPacket(rawQuery);
}
