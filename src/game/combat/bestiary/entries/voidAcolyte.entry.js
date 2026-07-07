import { SYNTACTIC_ARCHETYPE_PROFILES } from '../../../../../codex/core/combat.syntax-chess.js';
import { getIntelligenceTier } from '../../combatIntelligence.js';
import { computeBasicAttackDamage } from '../../scholomanceStats.js';
import { ICICLE_BLAST_RANGE } from '../../voidAcolyteCombatAbilities.js';
import { isPortalWardenId, VOID_ACOLYTE_STAT_DEFAULTS } from '../../voidAcolyteRobots.js';

export const VOID_ACOLYTE_BESTIARY_ID = 'void-acolyte';

const PROFILE = SYNTACTIC_ARCHETYPE_PROFILES.SHADE_BASE;

/** @type {import('../combatBestiary.types.js').CombatBestiaryEntry} */
export const voidAcolyteBestiaryEntry = {
  id: VOID_ACOLYTE_BESTIARY_ID,
  priority: 130,
  matches: (context) => (
    isPortalWardenId(context.enemyId)
    || context.record?.role === 'void-acolyte'
    || context.target?.metadata?.role === 'void-acolyte'
  ),
  buildDefender(context) {
    if (!this.matches(context)) return null;
    const entity = context.entity || {};
    const hp = Number.isFinite(entity.hp) ? entity.hp : VOID_ACOLYTE_STAT_DEFAULTS.hp;
    const maxHp = Number.isFinite(entity.maxHp) ? entity.maxHp : VOID_ACOLYTE_STAT_DEFAULTS.maxHp;
    if (hp <= 0) return null;
    return {
      id: context.enemyId,
      name: VOID_ACOLYTE_STAT_DEFAULTS.label,
      school: VOID_ACOLYTE_STAT_DEFAULTS.school,
      role: 'void-acolyte',
      bestiaryId: VOID_ACOLYTE_BESTIARY_ID,
      syntacticProfile: PROFILE,
      hp,
      maxHp,
    };
  },
  buildDossier(context) {
    if (!this.matches(context)) return null;
    const entity = context.entity || {};
    const hp = Number.isFinite(entity.hp) ? entity.hp : VOID_ACOLYTE_STAT_DEFAULTS.hp;
    const maxHp = Number.isFinite(entity.maxHp) ? entity.maxHp : VOID_ACOLYTE_STAT_DEFAULTS.maxHp;
    const intelligence = Number.isFinite(entity.intelligence)
      ? entity.intelligence
      : VOID_ACOLYTE_STAT_DEFAULTS.intelligence;
    return {
      enemyId: context.enemyId,
      title: VOID_ACOLYTE_STAT_DEFAULTS.shortLabel,
      subtitle: VOID_ACOLYTE_STAT_DEFAULTS.label,
      school: VOID_ACOLYTE_STAT_DEFAULTS.school,
      epithet: 'Void1 — Portal Seal Warden',
      sections: [
        {
          id: 'vitals',
          label: 'Field Readout',
          lines: [
            `Integrity: ${hp}/${maxHp}`,
            'Stance: fierce — fights to execute',
            `INT: ${intelligence} (${getIntelligenceTier(intelligence)})`,
          ],
          tags: ['AGGRO'],
        },
        {
          id: 'behavior',
          label: 'Combat Behavior',
          lines: [
            `Icicle Blast — three sky-born rime spikes slam you from up to ${ICICLE_BLAST_RANGE} tiles away.`,
            'VOID Gravity — pulls you adjacent and locks movement for 3 turns.',
            'Void Execution — ~40 burst damage when you are anchored.',
            'Kill window: 2–3 turns if Gravity catches you.',
          ],
        },
      ],
      chess: {
        archetype: PROFILE.archetype,
        weaknessFamilies: [...PROFILE.weaknessFamilies],
        resistanceFamilies: [...PROFILE.resistanceFamilies],
        syntaxWeaknesses: [...PROFILE.syntaxWeaknesses],
        syntaxResistances: [...PROFILE.syntaxResistances],
        counsel: 'Name and fracture the hollow with LIGHT and REVELATION imagery. WARD chains feed the void.',
      },
    };
  },
  combatAI: {
    buildProfile() {
      return {
        isRanged: true,
        preferredRange: ICICLE_BLAST_RANGE,
        minRange: 2,
        role: 'bruiser',
        aggression: 0.95,
        weightOverrides: { SURVIVAL_BRAIN: 0.3 },
      };
    },
    buildAbilityKit(context) {
      const entity = context?.entity || {};
      const damage = computeBasicAttackDamage(entity.scholomance);
      const attackRange = Number.isFinite(entity.attackRange) ? entity.attackRange : ICICLE_BLAST_RANGE;
      return {
        isRanged: true,
        preferredRange: ICICLE_BLAST_RANGE,
        minRange: 2,
        estimateAttackDamage: () => damage,
        canActFromRange: (dist) => dist >= 2 && dist <= attackRange,
      };
    },
  },
};