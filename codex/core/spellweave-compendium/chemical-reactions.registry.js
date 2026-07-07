import { TIER_IDS } from './compendium.schema.js';
import { countLemmaHits } from './compendium.tokens.js';

/** @type {readonly object[]} */
export const CHEMICAL_REACTIONS = Object.freeze([
  { id: 'metal_oxidize', reagents: ['iron', 'metal', 'moisture', 'rust', 'oxide'], products: ['rust'], requiredObject: 'STONE', requiredIntentClass: 'OFFENSIVE', valchMin: 12, amplifier: 0.14, statusEffect: 'CORRODE' },
  { id: 'salt_brine', reagents: ['salt', 'brine', 'water'], products: ['brine'], requiredIntentClass: 'DISRUPTION', valchMin: 10, amplifier: 0.1 },
  { id: 'sulfur_flame', reagents: ['sulfur', 'flame', 'sulfurous'], products: ['sulfurous'], requiredIntentClass: 'OFFENSIVE', valchMin: 12, amplifier: 0.11 },
  { id: 'iron_vitriol', reagents: ['iron', 'bile', 'vitriol'], products: ['vitriol'], requiredObject: 'STONE', requiredIntentClass: 'OFFENSIVE', valchMin: 18, amplifier: 0.15 },
  { id: 'silver_mirror', reagents: ['silver', 'moonlight', 'mirror'], products: ['mirror'], requiredIntentClass: 'DISRUPTION', valchMin: 14, amplifier: 0.12 },
  { id: 'blood_cinder', reagents: ['blood', 'cinder', 'ash'], products: ['cinder'], requiredObject: 'FLESH', requiredIntentClass: 'OFFENSIVE', valchMin: 10, amplifier: 0.1 },
  { id: 'copper_verdigris', reagents: ['copper', 'verdigris', 'patina'], products: ['verdigris'], requiredObject: 'STONE', valchMin: 11, amplifier: 0.1 },
  { id: 'salt_purify', reagents: ['salt', 'purify', 'scour'], products: ['brine'], requiredIntentClass: 'HEALING', valchMin: 12, amplifier: 0.09 },
  { id: 'mercury_quicksilver', reagents: ['mercury', 'quicksilver'], products: ['quicksilver'], valchMin: 16, amplifier: 0.13 },
  { id: 'char_soot', reagents: ['char', 'soot', 'smoke'], products: ['soot'], requiredIntentClass: 'DISRUPTION', valchMin: 9, amplifier: 0.08 },
  { id: 'acid_corrode', reagents: ['acid', 'corrode', 'etch'], products: ['corrosion'], requiredObject: 'STONE', valchMin: 13, amplifier: 0.12 },
  { id: 'gold_aqua_regia', reagents: ['gold', 'aqua', 'regia'], products: ['dissolve'], valchMin: 20, amplifier: 0.16 },
  { id: 'lead_weight', reagents: ['lead', 'weight', 'sink'], products: ['plumb'], requiredIntentClass: 'UTILITY', valchMin: 10, amplifier: 0.08 },
  { id: 'tin_pewter', reagents: ['tin', 'pewter'], products: ['pewter'], valchMin: 10, amplifier: 0.07 },
  { id: 'phosphor_glow', reagents: ['phosphor', 'glow', 'luminesce'], products: ['glow'], requiredIntentClass: 'UTILITY', valchMin: 11, amplifier: 0.09 },
  { id: 'niter_saltpeter', reagents: ['niter', 'saltpeter'], products: ['saltpeter'], requiredIntentClass: 'OFFENSIVE', valchMin: 12, amplifier: 0.1 },
  { id: 'ammonia_spirit', reagents: ['ammonia', 'spirit', 'volatile'], products: ['spirit'], valchMin: 13, amplifier: 0.1 },
  { id: 'ethanol_distill', reagents: ['ethanol', 'distill', 'alembic'], products: ['distillate'], valchMin: 14, amplifier: 0.11 },
  { id: 'calcium_lime', reagents: ['calcium', 'lime', 'chalk'], products: ['lime'], requiredObject: 'STONE', valchMin: 10, amplifier: 0.08 },
  { id: 'carbon_soot', reagents: ['carbon', 'soot', 'coal'], products: ['soot'], requiredIntentClass: 'DISRUPTION', valchMin: 9, amplifier: 0.08 },
  { id: 'ozone_ionize', reagents: ['ozone', 'ionize', 'plasma'], products: ['ion'], requiredIntentClass: 'OFFENSIVE', valchMin: 15, amplifier: 0.12 },
  { id: 'tar_pitch', reagents: ['tar', 'pitch', 'seal'], products: ['pitch'], requiredIntentClass: 'UTILITY', valchMin: 10, amplifier: 0.08 },
  { id: 'wax_seal', reagents: ['wax', 'seal', 'bind'], products: ['seal'], requiredIntentClass: 'DEFENSIVE', valchMin: 10, amplifier: 0.08 },
  { id: 'vinegar_etch', reagents: ['vinegar', 'etch', 'corrode'], products: ['etch'], requiredObject: 'STONE', valchMin: 11, amplifier: 0.1 },
]);

/**
 * @param {object} ctx
 */
export function detectChemicalTier(ctx) {
  const {
    verseTokens = [],
    bridge = null,
    grammarFactor = 1,
    statFactor = 1,
    valch = 10,
    ksyn = 10,
  } = ctx;

  const objects = (bridge?.objects || []).map((entry) => String(entry).toUpperCase());
  const intentClass = String(bridge?.intent || '').toUpperCase();
  const chainReady = bridge?.chainType === 'SEQUENCE' && ksyn >= 25;

  let best = null;
  for (const reaction of CHEMICAL_REACTIONS) {
    const hits = countLemmaHits(verseTokens, reaction.reagents);
    if (!hits.length) continue;
    if (valch < reaction.valchMin) continue;
    if (reaction.requiredObject && !objects.includes(reaction.requiredObject)) continue;
    if (reaction.requiredIntentClass && intentClass !== reaction.requiredIntentClass) continue;

    const chainBonus = chainReady ? 0.02 : 0;
    const reagentBonus = Math.min(0.06, Math.max(0, hits.length - 1) * 0.02);
    const amplifier = (reaction.amplifier + chainBonus + reagentBonus) * grammarFactor * statFactor;
    if (!best || amplifier > best.amplifier) {
      best = {
        tierId: TIER_IDS.CHEMICAL,
        band: reaction.id.toUpperCase(),
        entryId: `chemical.${reaction.id}`,
        matchedLexemes: hits,
        rawSignal: Math.min(1, hits.length / 2),
        grammarFactor,
        statFactor,
        amplifier,
        counsel: `Chemical ${reaction.id.toUpperCase()} — verbal alchemy converted ${hits[0].toLowerCase()} reagents.`,
        statusEffect: reaction.statusEffect || null,
      };
    }
  }

  return best;
}

export const CHEMICAL_COMPENDIUM_ENTRIES = CHEMICAL_REACTIONS.map((reaction) => ({
  entryId: `chemical.${reaction.id}`,
  tierId: TIER_IDS.CHEMICAL,
  band: reaction.id.toUpperCase(),
  title: reaction.id.replace(/_/g, ' '),
  baseAmplifier: reaction.amplifier,
  statGates: { VALCH: reaction.valchMin },
  weavePrompt: `${reaction.requiredIntentClass || 'OFFENSIVE'} ${reaction.requiredObject || 'STONE'}`,
}));