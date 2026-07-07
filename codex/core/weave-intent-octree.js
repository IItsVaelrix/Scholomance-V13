/**
 * Weave Intent Octree Forest
 *
 * Each root intent class (OFFENSIVE, DEFENSIVE, HEALING, UTILITY, DISRUPTION)
 * owns an 8-ary semantic octree:
 *   depth 0 — class root
 *   depth 1 — eight octants (manner families)
 *   depth 2 — eight leaf weave tokens per octant (64 leaves per class)
 *
 * Players may speak a coarse class token (`OFFENSIVE`) or a specific leaf
 * (`REND`, `SANCTUARY`, `MEND`, …). All leaves resolve to their class intent
 * for bridge scoring; path metadata drives manner tags and future animation cues.
 */

import { INTENTS } from './intent-classes.js';

export const OCTANT_COUNT = 8;
export const LEAVES_PER_OCTANT = 8;
export const LEAVES_PER_CLASS = OCTANT_COUNT * LEAVES_PER_OCTANT;

/** Semantic axis labels shared across the forest (octant index → axis name). */
export const OCTANT_AXES = Object.freeze([
  'ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'ETA', 'THETA',
]);

/**
 * @typedef {Object} WeaveIntentLeaf
 * @property {string} token
 * @property {string} intentClass
 * @property {string} intent
 * @property {number[]} path - [octant, leaf] indices 0..7
 * @property {string} octantLabel
 * @property {string} manner
 * @property {number} powerScale
 * @property {string[]} schoolAffinity
 * @property {string} description
 */

/**
 * @typedef {Object} IntentOctantNode
 * @property {number} octant
 * @property {string} axis
 * @property {string} label
 * @property {WeaveIntentLeaf[]} leaves
 */

/**
 * @typedef {Object} IntentClassTree
 * @property {string} intentClass
 * @property {string} label
 * @property {string} description
 * @property {IntentOctantNode[]} octants
 * @property {WeaveIntentLeaf} rootLeaf
 */

const RESERVED_WEAVE_TOKENS = new Set([
  'AND', 'THEN', 'WHILE',
  'UTTER', 'SWIFT', 'TWICE', 'DEEP', 'SILENT', 'BURNING', 'FROZEN', 'SUNDERED',
  'SOUL', 'FLESH', 'MIND', 'SINEW', 'SPIRIT', 'BLOOD', 'STONE', 'AIR', 'FIRE', 'OBELISK',
]);

const FOREST_SPEC = Object.freeze({
  OFFENSIVE: Object.freeze({
    label: 'Offensive Force',
    description: 'Force directed outward to harm, break, or overwhelm.',
    octants: Object.freeze([
      { label: 'Impact', manner: 'KINETIC', schoolAffinity: ['WILL'], leaves: ['STRIKE', 'SMASH', 'CRUSH', 'BATTER', 'SLAM', 'PUMMEL', 'THRUST', 'CRACK'] },
      { label: 'Rend', manner: 'CUT', schoolAffinity: ['WILL', 'SONIC'], leaves: ['SLASH', 'CLEAVE', 'REND', 'PIERCE', 'LACERATE', 'RIVE', 'CARVE', 'SHEAR'] },
      { label: 'Burn', manner: 'FLAME', schoolAffinity: ['ALCHEMY'], leaves: ['IGNITE', 'SCORCH', 'SEAR', 'INCINERATE', 'KINDLE', 'CHAR', 'BLAZE', 'IMMOLATE'] },
      { label: 'Resonance', manner: 'VIBRATION', schoolAffinity: ['SONIC'], leaves: ['ECHO', 'RESONATE', 'SHATTER', 'QUAKE', 'RUPTURE', 'VIBRATE', 'PEAL', 'FRACTURE'] },
      { label: 'Corrosion', manner: 'DECAY', schoolAffinity: ['ALCHEMY', 'VOID'], leaves: ['ROT', 'WITHER', 'CORRODE', 'ACID', 'FESTER', 'DECAY', 'MOLD', 'TARNISH'] },
      { label: 'Assault', manner: 'PSYCHIC', schoolAffinity: ['PSYCHIC'], leaves: ['SCISS', 'GAZE', 'PROBE', 'LANCE', 'SPIKE', 'NEEDLE', 'INVADE', 'STING'] },
      { label: 'Voidfeed', manner: 'HUNGER', schoolAffinity: ['VOID'], leaves: ['CONSUME', 'DEVOUR', 'DRAIN', 'LEECH', 'SIPHON', 'GNAW', 'ANNUL', 'ERODE'] },
      { label: 'Barrage', manner: 'CASCADE', schoolAffinity: ['SONIC', 'WILL'], leaves: ['BARRAGE', 'VOLLEY', 'CASCADE', 'ERUPT', 'DETONATE', 'STORM', 'HAIL', 'FLURRY'] },
    ]),
  }),
  DEFENSIVE: Object.freeze({
    label: 'Defensive Warding',
    description: 'Force turned inward or outward to protect, absorb, or deflect.',
    octants: Object.freeze([
      { label: 'Shield', manner: 'BARRIER', schoolAffinity: ['WILL'], leaves: ['SHIELD', 'AEGIS', 'BULWARK', 'BASTION', 'WARDEN', 'COVER', 'SHELL', 'GUARD'] },
      { label: 'Ward', manner: 'RITUAL', schoolAffinity: ['WILL', 'ABJURATION'], leaves: ['HALO', 'CIRCLE', 'RITUAL', 'SEAL', 'SIGIL', 'GLYPH', 'RUNE', 'VEIL'] },
      { label: 'Fortify', manner: 'HARDEN', schoolAffinity: ['WILL', 'ALCHEMY'], leaves: ['FORTIFY', 'HARDEN', 'STEEL', 'BRACE', 'ROOT', 'GRIP', 'TENSE', 'STEADY'] },
      { label: 'Absorb', manner: 'SOAK', schoolAffinity: ['VOID', 'WILL'], leaves: ['ABSORB', 'SOAK', 'BUFFER', 'CUSHION', 'DAMPEN', 'MUFFLE', 'CATCH', 'ENDURE'] },
      { label: 'Reflect', manner: 'MIRROR', schoolAffinity: ['SONIC', 'WILL'], leaves: ['REFLECT', 'RETURN', 'MIRROR', 'REBOUND', 'DEFLECT', 'TURN', 'ANGLE', 'REDIRECT'] },
      { label: 'Sanctuary', manner: 'HAVEN', schoolAffinity: ['WILL', 'ABJURATION'], leaves: ['SANCTUARY', 'REFUGE', 'HAVEN', 'SHELTER', 'COCOON', 'BOWER', 'KEEP', 'CITADEL'] },
      { label: 'Anchor', manner: 'IMMOBILE', schoolAffinity: ['WILL'], leaves: ['ANCHOR', 'MOOR', 'PIN', 'CLAMP', 'FIX', 'IMMOBILE', 'SET', 'LOCK'] },
      { label: 'Dissipate', manner: 'SCATTER', schoolAffinity: ['SONIC', 'VOID'], leaves: ['DISSIPATE', 'SCATTER', 'UNWIND', 'DISPERSE', 'DIFFUSE', 'FADE', 'QUIET', 'DIM'] },
    ]),
  }),
  HEALING: Object.freeze({
    label: 'Restorative Healing',
    description: 'Force that mends, purifies, restores, or sanctifies.',
    octants: Object.freeze([
      { label: 'Mend', manner: 'RESTORE', schoolAffinity: ['ALCHEMY'], leaves: ['MEND', 'HEAL', 'CURE', 'PATCH', 'KNIT', 'CLOSE', 'RESTORE', 'REPAIR'] },
      { label: 'Purify', manner: 'CLEANSE', schoolAffinity: ['ALCHEMY', 'WILL'], leaves: ['PURIFY', 'CLEANSE', 'FLUSH', 'WASH', 'CLEAR', 'RINSE', 'SCRUB', 'BAPTIZE'] },
      { label: 'Regrow', manner: 'RENEW', schoolAffinity: ['ALCHEMY'], leaves: ['REGROW', 'RENEW', 'BLOOM', 'SPRING', 'RISE', 'REFORM', 'REBUILD', 'REGEN'] },
      { label: 'Soothe', manner: 'EASE', schoolAffinity: ['PSYCHIC', 'ALCHEMY'], leaves: ['SOOTHE', 'EASE', 'CALM', 'SOFTEN', 'COOL', 'BALM', 'SALVE', 'COMFORT'] },
      { label: 'Revive', manner: 'RALLY', schoolAffinity: ['ALCHEMY', 'WILL'], leaves: ['REVIVE', 'RALLY', 'QUICKEN', 'WAKE', 'SPARK', 'RECALL', 'RESCUE', 'REBORN'] },
      { label: 'Bind', manner: 'STITCH', schoolAffinity: ['ALCHEMY'], leaves: ['STITCH', 'SUTURE', 'STABLE', 'CLASP', 'GRASP', 'TIE', 'LASH', 'FASTEN'] },
      { label: 'Infuse', manner: 'CHARGE', schoolAffinity: ['ALCHEMY', 'WILL'], leaves: ['INFUSE', 'FILL', 'IMBUE', 'LOAD', 'FEED', 'NOURISH', 'SATE', 'ENRICH'] },
      { label: 'Sanctify', manner: 'HALLOW', schoolAffinity: ['WILL', 'ALCHEMY'], leaves: ['SANCTIFY', 'HALLOW', 'CONSECRATE', 'GRACE', 'LIGHT', 'ELEVATE', 'UPLIFT', 'ASCEND'] },
    ]),
  }),
  UTILITY: Object.freeze({
    label: 'Utility Shaping',
    description: 'Force that alters, reveals, moves, or channels without primary harm.',
    octants: Object.freeze([
      { label: 'Transmute', manner: 'ALTER', schoolAffinity: ['ALCHEMY'], leaves: ['TRANSMUTE', 'SHIFT', 'ALTER', 'MORPH', 'CHANGE', 'CONVERT', 'TRANSFORM', 'REFORGE'] },
      { label: 'Reveal', manner: 'EXPOSE', schoolAffinity: ['DIVINATION', 'PSYCHIC'], leaves: ['REVEAL', 'SHOW', 'UNMASK', 'EXPOSE', 'GLIMPSE', 'SIGHT', 'SCAN', 'BEHOLD'] },
      { label: 'Restrain', manner: 'SNARE', schoolAffinity: ['WILL', 'PSYCHIC'], leaves: ['SNARE', 'TRAP', 'CAGE', 'NET', 'GRAPPLE', 'LASSO', 'HOOK', 'MANACLE'] },
      { label: 'Summon', manner: 'CALL', schoolAffinity: ['NECROMANCY', 'WILL'], leaves: ['SUMMON', 'CALL', 'INVOKE', 'MANIFEST', 'BRING', 'FETCH', 'CONJURE', 'RAISE'] },
      { label: 'Displace', manner: 'MOTION', schoolAffinity: ['WILL'], leaves: ['DISPLACE', 'PUSH', 'PULL', 'LIFT', 'SLIDE', 'WARP', 'BEND', 'PORT'] },
      { label: 'Amplify', manner: 'BOOST', schoolAffinity: ['SONIC', 'WILL'], leaves: ['AMPLIFY', 'BOOST', 'MAGNIFY', 'HEIGHTEN', 'INTENSIFY', 'SURGE', 'CHARGE', 'STRETCH'] },
      { label: 'Scry', manner: 'PERCEIVE', schoolAffinity: ['DIVINATION', 'PSYCHIC'], leaves: ['SCRY', 'PEER', 'WATCH', 'LISTEN', 'TRACE', 'SEEK', 'FIND', 'LOCATE'] },
      { label: 'Channel', manner: 'ROUTE', schoolAffinity: ['WILL', 'VOID'], leaves: ['CHANNEL', 'ROUTE', 'BRIDGE', 'CONDUCT', 'PIPE', 'FLOW', 'LINK', 'COUPLE'] },
    ]),
  }),
  DISRUPTION: Object.freeze({
    label: 'Disruptive Interference',
    description: 'Force that frays, silences, dispels, or destabilizes.',
    octants: Object.freeze([
      { label: 'Silence', manner: 'MUTE', schoolAffinity: ['SONIC', 'PSYCHIC'], leaves: ['SILENCE', 'MUTE', 'STILL', 'HUSH', 'GAG', 'MUZZLE', 'STIFLE', 'SUPPRESS'] },
      { label: 'Unweave', manner: 'FRAY', schoolAffinity: ['VOID', 'PSYCHIC'], leaves: ['UNWEAVE', 'FRAY', 'UNRAVEL', 'LOOSEN', 'SLIP', 'UNBIND', 'UNKNOT', 'TEASE'] },
      { label: 'Dispel', manner: 'STRIP', schoolAffinity: ['ABJURATION', 'WILL'], leaves: ['DISPEL', 'BANISH', 'STRIP', 'BREAK', 'NULL', 'VOID', 'UNMAKE', 'CANCEL'] },
      { label: 'Fear', manner: 'DREAD', schoolAffinity: ['PSYCHIC'], leaves: ['FEAR', 'DREAD', 'TERROR', 'PANIC', 'HAUNT', 'SHAKE', 'QUAIL', 'FLINCH'] },
      { label: 'Confuse', manner: 'SCRAMBLE', schoolAffinity: ['PSYCHIC'], leaves: ['CONFUSE', 'BEFUDDLE', 'MUDDLE', 'FOG', 'BLUR', 'SWIRL', 'TANGLE', 'TWIST'] },
      { label: 'Hollow', manner: 'EMPTY', schoolAffinity: ['VOID'], leaves: ['HOLLOW', 'EMPTY', 'VACATE', 'DEPLETE', 'BLEED', 'SAP', 'WANE', 'EBB'] },
      { label: 'Curse', manner: 'MALEFIC', schoolAffinity: ['NECROMANCY', 'VOID'], leaves: ['CURSE', 'BLIGHT', 'DOOM', 'MARK', 'TAINT', 'SPOIL', 'RUIN', 'AFFLICT'] },
      { label: 'Sever', manner: 'CUT_LINK', schoolAffinity: ['VOID', 'WILL'], leaves: ['SEVER', 'SPLIT', 'PART', 'DIVIDE', 'ISOLATE', 'QUARANTINE', 'EXILE', 'BAN'] },
    ]),
  }),
});

function powerScaleForLeaf(octantIndex, leafIndex) {
  return 0.92 + ((octantIndex * LEAVES_PER_OCTANT + leafIndex) % 9) * 0.07;
}

function buildLeaf(intentClass, octantIndex, octantSpec, token, leafIndex) {
  const upper = String(token || '').trim().toUpperCase();
  if (!upper) {
    throw new Error(`Empty weave intent leaf in ${intentClass} octant ${octantIndex}`);
  }
  if (RESERVED_WEAVE_TOKENS.has(upper)) {
    throw new Error(`Weave intent token "${upper}" collides with a reserved weave token`);
  }
  return Object.freeze({
    token: upper,
    intentClass,
    intent: INTENTS[intentClass],
    path: Object.freeze([octantIndex, leafIndex]),
    octantLabel: octantSpec.label,
    manner: octantSpec.manner,
    powerScale: powerScaleForLeaf(octantIndex, leafIndex),
    schoolAffinity: Object.freeze([...octantSpec.schoolAffinity]),
    description: `${octantSpec.label} ${upper.toLowerCase()} — ${INTENTS[intentClass]} manner ${octantSpec.manner}`,
  });
}

function buildClassTree(intentClass, spec) {
  const octants = spec.octants.map((octantSpec, octantIndex) => {
    if (!Array.isArray(octantSpec.leaves) || octantSpec.leaves.length !== LEAVES_PER_OCTANT) {
      throw new Error(`${intentClass} octant ${octantIndex} requires exactly ${LEAVES_PER_OCTANT} leaves`);
    }
    return Object.freeze({
      octant: octantIndex,
      axis: OCTANT_AXES[octantIndex],
      label: octantSpec.label,
      manner: octantSpec.manner,
      schoolAffinity: Object.freeze([...octantSpec.schoolAffinity]),
      leaves: Object.freeze(octantSpec.leaves.map((token, leafIndex) => (
        buildLeaf(intentClass, octantIndex, octantSpec, token, leafIndex)
      ))),
    });
  });

  const rootLeaf = Object.freeze({
    token: intentClass,
    intentClass,
    intent: INTENTS[intentClass],
    path: Object.freeze([]),
    octantLabel: 'Root',
    manner: 'BROAD',
    powerScale: 1,
    schoolAffinity: Object.freeze([]),
    description: `Broad ${spec.label.toLowerCase()} — unspecialized class intent`,
  });

  return Object.freeze({
    intentClass,
    label: spec.label,
    description: spec.description,
    octants,
    rootLeaf,
  });
}

function buildForest() {
  const trees = {};
  const tokenIndex = new Map();
  const seenTokens = new Set();

  for (const intentClass of Object.keys(FOREST_SPEC)) {
    const tree = buildClassTree(intentClass, FOREST_SPEC[intentClass]);
    trees[intentClass] = tree;

    const register = (leaf) => {
      const key = leaf.token.toUpperCase();
      if (seenTokens.has(key)) {
        throw new Error(`Duplicate weave intent token "${key}"`);
      }
      seenTokens.add(key);
      tokenIndex.set(key, leaf);
    };

    register(tree.rootLeaf);
    tree.octants.forEach((octant) => octant.leaves.forEach(register));
  }

  return Object.freeze({
    trees: Object.freeze(trees),
    tokenIndex,
    intentClasses: Object.freeze(Object.keys(FOREST_SPEC)),
  });
}

const FOREST = buildForest();

/**
 * @param {string} intentClass
 * @returns {IntentClassTree|null}
 */
export function getIntentClassTree(intentClass) {
  const key = String(intentClass || '').trim().toUpperCase();
  return FOREST.trees[key] || null;
}

/** @returns {IntentClassTree[]} */
export function getIntentForest() {
  return FOREST.intentClasses.map((intentClass) => FOREST.trees[intentClass]);
}

/**
 * @param {string} token
 * @returns {WeaveIntentLeaf|null}
 */
export function lookupWeaveIntent(token) {
  const key = String(token || '').trim().toUpperCase();
  if (!key) return null;
  return FOREST.tokenIndex.get(key) || null;
}

/**
 * Flat registry shape consumed by semantics.registry lookupWeaveToken.
 * @returns {Record<string, object>}
 */
export function flattenWeaveIntentRegistry() {
  const registry = {};
  FOREST.tokenIndex.forEach((leaf, token) => {
    registry[token] = Object.freeze({
      intent: leaf.intent,
      intentClass: leaf.intentClass,
      manner: leaf.manner,
      powerScale: leaf.powerScale,
      schoolAffinity: leaf.schoolAffinity,
      path: leaf.path,
      octantLabel: leaf.octantLabel,
      description: leaf.description,
    });
  });
  return Object.freeze(registry);
}

/** @returns {string[]} */
export function listAllWeaveIntentTokens() {
  return [...FOREST.tokenIndex.keys()].sort();
}

/**
 * @param {string} token
 * @returns {string}
 */
export function formatIntentPath(token) {
  const leaf = lookupWeaveIntent(token);
  if (!leaf) return '';
  if (leaf.path.length === 0) return leaf.intentClass;
  const tree = getIntentClassTree(leaf.intentClass);
  const octant = tree?.octants[leaf.path[0]];
  return `${leaf.intentClass}/${octant?.label || leaf.path[0]}/${leaf.token}`;
}

/**
 * Walk an octree path under a class root.
 * @param {string} intentClass
 * @param {number[]} path - [octant, leaf] or []
 * @returns {WeaveIntentLeaf|null}
 */
export function resolveIntentPath(intentClass, path = []) {
  const tree = getIntentClassTree(intentClass);
  if (!tree) return null;
  if (!Array.isArray(path) || path.length === 0) return tree.rootLeaf;
  const [octantIndex, leafIndex] = path;
  const octant = tree.octants[octantIndex];
  if (!octant) return null;
  return octant.leaves[leafIndex] || null;
}

/**
 * @param {string} intentClass
 * @returns {{ octant: number, label: string, tokens: string[] }[]}
 */
export function listOctantsForClass(intentClass) {
  const tree = getIntentClassTree(intentClass);
  if (!tree) return [];
  return tree.octants.map((octant) => ({
    octant: octant.octant,
    axis: octant.axis,
    label: octant.label,
    manner: octant.manner,
    tokens: octant.leaves.map((leaf) => leaf.token),
  }));
}

export const WEAVE_INTENT_FOREST = FOREST;