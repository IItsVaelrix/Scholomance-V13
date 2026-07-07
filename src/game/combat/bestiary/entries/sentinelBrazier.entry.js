import { SYNTACTIC_ARCHETYPE_PROFILES } from '../../../../../codex/core/combat.syntax-chess.js';
import {
  getSentinelDefinition,
  getSentinelIntelligenceProfile,
  isSentinelId,
  SENTINEL_STAT_DEFAULTS,
} from '../../sentinelRobots.js';
import { getIntelligenceTier } from '../../combatIntelligence.js';
import { computeBasicAttackDamage } from '../../scholomanceStats.js';

export const SENTINEL_BRAZIER_BESTIARY_ID = 'sentinel-brazier';

const PROFILE = SYNTACTIC_ARCHETYPE_PROFILES.SENTINEL_BRAZIER_BASE;

function readVitals(context) {
  const entity = context.entity || context.entitySnapshot || {};
  const record = context.record || {};
  const definition = getSentinelDefinition(context.enemyId);
  const hp = Number.isFinite(entity.hp) ? entity.hp : SENTINEL_STAT_DEFAULTS.hp;
  const maxHp = Number.isFinite(entity.maxHp) ? entity.maxHp : SENTINEL_STAT_DEFAULTS.maxHp;
  const defeated = !!record.defeated || hp <= 0;
  const aggroed = !!(record.aggroed ?? entity.aggroed);
  const intProfile = getSentinelIntelligenceProfile(context.enemyId);
  const intelligence = Number.isFinite(entity.intelligence)
    ? entity.intelligence
    : intProfile.intelligence;
  return {
    hp,
    maxHp,
    defeated,
    aggroed,
    intelligence,
    intelligenceTier: getIntelligenceTier(intelligence),
    cognitionNote: intProfile.roleNote,
    tx: definition?.tx ?? context.target?.tx,
    ty: definition?.ty ?? context.target?.ty,
    shortLabel: definition?.shortLabel || context.target?.metadata?.shortLabel || 'Sentinel',
    label: definition?.label || context.target?.label || 'Brazier Sentinel',
  };
}

/** @type {import('../combatBestiary.types.js').CombatBestiaryEntry} */
export const sentinelBrazierBestiaryEntry = {
  id: SENTINEL_BRAZIER_BESTIARY_ID,
  priority: 120,
  matches: (context) => (
    isSentinelId(context.enemyId)
    || context.target?.metadata?.role === 'sentinel'
    || context.record?.role === 'sentinel'
  ),
  buildDefender(context) {
    if (!this.matches(context)) return null;
    const vitals = readVitals(context);
    if (vitals.defeated) return null;
    return {
      id: context.enemyId,
      name: vitals.label,
      school: SENTINEL_STAT_DEFAULTS.school,
      role: 'sentinel',
      bestiaryId: SENTINEL_BRAZIER_BESTIARY_ID,
      syntacticProfile: PROFILE,
      hp: vitals.hp,
      maxHp: vitals.maxHp,
    };
  },
  buildDossier(context) {
    if (!this.matches(context)) return null;
    const vitals = readVitals(context);
    const stance = vitals.defeated
      ? 'Offline — containment matrix collapsed'
      : vitals.aggroed
        ? 'Aggro — perimeter defense engaged'
        : 'Dormant — wakes when the obelisk is threatened';

    return {
      enemyId: context.enemyId,
      title: vitals.shortLabel,
      subtitle: vitals.label,
      school: SENTINEL_STAT_DEFAULTS.school,
      epithet: 'Armillary Brazier Matrix',
      sections: [
        {
          id: 'vitals',
          label: 'Field Readout',
          lines: [
            `Integrity: ${vitals.hp}/${vitals.maxHp}`,
            `Stance: ${stance}`,
            `Lattice: (${vitals.tx}, ${vitals.ty})`,
            `INT: ${vitals.intelligence} (${vitals.intelligenceTier})`,
            vitals.cognitionNote || 'Doctrine: flank obelisk sentinel',
          ],
          tags: vitals.aggroed ? ['AGGRO'] : vitals.defeated ? ['DEFEATED'] : ['DORMANT'],
        },
        {
          id: 'behavior',
          label: 'Combat Behavior',
          lines: [
            'Matrix Burn — +10 damage per turn for 4 turns (5-turn cooldown).',
            'WiFi Mental Link — +25% damage while another sentinel is aggroed.',
            'Sentinel Alert — 50% proc; while active, attacks never miss and deal x2 damage.',
            'Machine Learning — after surviving 2 turns post-cast, mirrors your weakness counters.',
            'INT varies per sentinel — α tactical (58), β mastermind (82).',
            'Raise CODEX / KSYN to delay their Machine Learning reads.',
            'Accepts weave objects: FLESH, STONE, FIRE, SPIRIT.',
          ],
        },
        {
          id: 'scholomance',
          label: 'Scholomance Signature',
          lines: [
            `BAPO ${SENTINEL_STAT_DEFAULTS.scholomanceOverrides.BAPO} — reinforced plating`,
            `SONIC ${SENTINEL_STAT_DEFAULTS.scholomanceOverrides.SONIC} — matrix resonance`,
          ],
        },
      ],
      chess: {
        archetype: PROFILE.archetype,
        weaknessFamilies: [...PROFILE.weaknessFamilies],
        resistanceFamilies: [...PROFILE.resistanceFamilies],
        syntaxWeaknesses: [...PROFILE.syntaxWeaknesses],
        syntaxResistances: [...PROFILE.syntaxResistances],
        counsel: 'Press DISSONANCE and FRACTURE imagery with PROBE or COMMAND sentence forms. Avoid feeding RESONANCE or sustained LITANY/WARD chains — you strengthen the matrix.',
      },
    };
  },
  combatAI: {
    buildProfile() {
      return {
        isRanged: true,
        preferredRange: 3,
        minRange: 1,
        role: 'caster',
        aggression: 0.7,
        weightOverrides: {},
      };
    },
    buildAbilityKit(context) {
      const entity = context?.entity || {};
      const damage = computeBasicAttackDamage(entity.scholomance);
      const attackRange = Number.isFinite(entity.attackRange) ? entity.attackRange : 2;
      return {
        isRanged: true,
        preferredRange: 3,
        minRange: 1,
        estimateAttackDamage: () => damage,
        canActFromRange: (dist) => dist <= attackRange,
      };
    },
  },
};