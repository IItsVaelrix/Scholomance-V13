/**
 * Evidence Map — join requirements to résumé bullets via the tiered bridge (spec §4.4).
 *
 * For each requirement, evaluate the bridge against each bullet and keep the strongest
 * tier. Bullets are referenced by stable `bulletId` (not span). `support` is the strongest
 * tier across bullets: demonstrated > adjacent > missing.
 */
import { bridgeEvidenceDetail } from './skill-phrase-bridge.js';
import type { BridgeResult } from './skill-phrase-bridge.js';
import type {
  Requirement,
  RequirementEvidence,
  RequirementSupport,
  EvidenceMap,
  ResumeBullet,
} from './types.js';

export type BridgeFn = (requirement: Requirement, bulletText: string) => BridgeResult;

const TIER_RANK: Record<'demonstrated' | 'adjacent' | 'none', number> = {
  demonstrated: 2,
  adjacent: 1,
  none: 0,
};

function strongestSupport(tiers: Array<'demonstrated' | 'adjacent' | 'none'>): RequirementSupport {
  let best = 0;
  for (const t of tiers) best = Math.max(best, TIER_RANK[t]);
  if (best === 2) return 'demonstrated';
  if (best === 1) return 'adjacent';
  return 'missing';
}

export function mapEvidence(
  requirements: Requirement[],
  bullets: ResumeBullet[],
  bridge: BridgeFn = bridgeEvidenceDetail
): EvidenceMap {
  const map: EvidenceMap = [];

  for (const requirement of requirements) {
    const evidenceBullets: RequirementEvidence['bullets'] = [];
    const tiers: Array<'demonstrated' | 'adjacent' | 'none'> = [];

    for (const bullet of bullets) {
      const result = bridge(requirement, bullet.rawText);
      tiers.push(result.tier);
      if (result.tier === 'demonstrated' || result.tier === 'adjacent') {
        evidenceBullets.push({
          bulletId: bullet.id,
          tier: result.tier,
          matchedPhrase: result.matchedPhrase,
        });
      }
    }

    // Order supporting bullets: demonstrated first, then by bulletId for determinism.
    evidenceBullets.sort((a, b) => {
      const rankDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
      if (rankDiff !== 0) return rankDiff;
      return a.bulletId < b.bulletId ? -1 : a.bulletId > b.bulletId ? 1 : 0;
    });

    map.push({
      requirement,
      support: strongestSupport(tiers),
      bullets: evidenceBullets,
    });
  }

  return map;
}
