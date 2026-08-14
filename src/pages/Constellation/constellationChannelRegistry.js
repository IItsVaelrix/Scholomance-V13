/**
 * Canonical constellation channel table — UI-owned presentation noun.
 *
 * One frozen home for id / packet field / degrade names / dock target /
 * tone / 3D position. The page service's degrade() strings are asserted
 * against `degrade` by the registry contract test. Coordinates stay here:
 * they are presentation, not packet truth.
 *
 * `LIVE_ENGINE_DEGRADE` is the whole-sky failure name the hook stamps when
 * the page never reached the engine. It is not a service degrade() name and
 * must not appear in any entry.degrade array.
 */
export const LIVE_ENGINE_DEGRADE = 'live engine';
export const CONSTELLATION_CHANNEL_REGISTRY = Object.freeze({
  identity: Object.freeze({
    id: 'identity',
    label: 'Phrase identity',
    field: 'query',
    degrade: Object.freeze([]),
    targetId: 'cos-masthead-query',
    tone: 'gold',
    pos: Object.freeze([0, 0.35, 1.35]),
  }),
  meaning: Object.freeze({
    id: 'meaning',
    label: 'Meaning field',
    field: 'leximancy',
    degrade: Object.freeze([
      'leximancy',
      'leximancy.relations',
      'semanticInquiry',
      'semanticInquiry.phonology',
    ]),
    targetId: 'cos-leximancy',
    tone: 'amethyst',
    pos: Object.freeze([-4.15, 1.55, -0.8]),
  }),
  sound: Object.freeze({
    id: 'sound',
    label: 'Sound field',
    field: 'rhymeAstrology',
    degrade: Object.freeze(['rhymeAstrology']),
    targetId: 'cos-rhyme',
    tone: 'arc',
    pos: Object.freeze([4.15, 1.35, -0.45]),
  }),
  genome: Object.freeze({
    id: 'genome',
    label: 'Phrase genome',
    field: 'phraseGenome',
    degrade: Object.freeze(['phraseGenome']),
    targetId: 'cos-genome',
    tone: 'amethyst',
    pos: Object.freeze([0.15, -2.55, 0]),
  }),
  readings: Object.freeze({
    id: 'readings',
    label: 'Readings',
    field: 'readings',
    degrade: Object.freeze([]),
    targetId: 'cos-readings',
    tone: 'gold',
    pos: Object.freeze([-3.45, -2.3, -1.5]),
  }),
  scale: Object.freeze({
    id: 'scale',
    label: 'Scale field',
    field: 'scaleField',
    degrade: Object.freeze(['scaleField']),
    targetId: 'cos-scale',
    tone: 'arc',
    pos: Object.freeze([3.55, -2.2, -1.65]),
  }),
  discovery: Object.freeze({
    id: 'discovery',
    label: 'Discovery field',
    field: 'discovery',
    degrade: Object.freeze(['discovery']),
    targetId: 'cos-discovery',
    tone: 'amethyst',
    pos: Object.freeze([0, 3.35, -2.1]),
  }),
  provenance: Object.freeze({
    id: 'provenance',
    label: 'Provenance',
    field: 'provenance',
    degrade: Object.freeze([]),
    targetId: 'cos-provenance',
    tone: 'gold',
    pos: Object.freeze([0, -4.15, -3.2]),
  }),
});

export const CONSTELLATION_CHANNELS = Object.freeze(
  Object.values(CONSTELLATION_CHANNEL_REGISTRY).map((entry) => Object.freeze({
    id: entry.id,
    label: entry.label,
    targetId: entry.targetId,
    tone: entry.tone,
  })),
);
