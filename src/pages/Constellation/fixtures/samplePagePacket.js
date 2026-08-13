/** @typedef {import('../../../hooks/constellation.types.js').ConstellationPhase1Packet} ConstellationPhase1Packet */

/** The channel name a packet wears when it never reached the engine at all. */
export const LIVE_ENGINE_CHANNEL = 'live engine';

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
      nearKin: [],
      counterfield: [],
      etymology: null,
      rarity: null,
      relations: { broader: [], narrower: [], akin: [] },
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
      { id: 'wound.injury', gloss: 'injury / opening in flesh', confidence: 0.52, pos: 'noun', examples: ['she bound the wound', 'a wound that would not close'] },
      { id: 'wound.past', gloss: 'past tense of wind', confidence: 0.41, pos: 'verb', examples: [] },
    ],
    warnings: ['Margin below selection threshold — ambiguity is data'],
    nearKin: ['gash', 'lesion', 'hurt'],
    counterfield: ['heal', 'mend'],
    etymology: 'Old English wund "hurt, injury", from Proto-Germanic *wundō.',
    rarity: { band: 5, max: 9, label: 'uncommon' },
    relations: {
      broader: ['injury', 'trauma'],
      narrower: ['laceration', 'gash', 'gunshot'],
      akin: ['hurt', 'lesion', 'sore', 'cut'],
    },
  },
  rhymeAstrology: {
    phonemes: ['DH', 'AH0', 'B', 'R', 'AY1', 'T', 'W', 'UW1', 'N', 'D'],
    stress: 'x / x / x',
    cadenceFamily: 'iambic-adjacent',
    exactRhymes: ['mooring', 'warning'],
    slantRhymes: ['mourning'],
    ipa: '/ˈmɔːnɪŋ/',
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

/**
 * Stamp a fixture as what it is: an answer that never reached the engine.
 *
 * `SAMPLE_BRIGHT_WOUND_PACKET` ships `degradedChannels: []` and `warnings: []`
 * — a truthful claim about the fixture and a LIE about the page, because the
 * shell reads exactly that field to decide whether to raise the "Partial sky"
 * banner. Substituted verbatim on a 500, it renders a fully-populated answer
 * that asserts perfect health while the service is down, and the only tell
 * reaching the reader is a provenance line reading `phase1-fixture`.
 *
 * Every adapter failure already declares itself in `degradedChannels`. A
 * whole-service failure is the largest degradation there is and was the one
 * that declared nothing.
 *
 * @param {ConstellationPhase1Packet} packet
 * @param {string} reason why the live engine was not reached
 * @returns {ConstellationPhase1Packet}
 */
export function markEngineUnreached(packet, reason) {
  const diagnostics = packet.diagnostics ?? { degradedChannels: [], warnings: [] };
  const degradedChannels = diagnostics.degradedChannels ?? [];
  return {
    ...packet,
    diagnostics: {
      ...diagnostics,
      degradedChannels: degradedChannels.includes(LIVE_ENGINE_CHANNEL)
        ? degradedChannels
        : [LIVE_ENGINE_CHANNEL, ...degradedChannels],
      warnings: [
        `Live engine unreachable (${reason}) — showing the offline fixture, not an analysis of this query.`,
        ...(diagnostics.warnings ?? []),
      ],
    },
  };
}
