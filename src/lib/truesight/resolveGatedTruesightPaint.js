/**
 * resolveGatedTruesightPaint — COLOR_DRAGON paint authority for Lexical/Scribe.
 *
 * gene BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK:
 * When the resonance gate is active, hue may come ONLY from backend token fields.
 * Frontend G2P (wordTruesight / analyzeDeep) must never invent a vowel family for
 * a gated word, and must never paint when tokenData is absent.
 *
 * Mirrors visualizerTruesightAmp.js so Visualiser and Scribe cannot drift apart.
 *
 * @param {{
 *   resonantCharStarts: Map<number, 'rhyme' | 'assonance'> | null | undefined,
 *   charStart: number,
 *   tokenData: object | null | undefined,
 *   word: string,
 *   isQuarantined?: boolean,
 * }} args
 * @returns {{
 *   shouldColor: boolean,
 *   tier: 'rhyme' | 'assonance' | null,
 *   color: string | null,
 *   school: string | null,
 *   truesightClass: string,
 *   truesight: { color: string, school: string, analysis: any } | null,
 * }}
 */
import { tokenTruesight } from '../../pages/Visualiser/truesightColor.ts';

function tierColorClass(school, tier) {
  const tierClass = tier === 'assonance' ? 'grimoire-word--assonant' : 'grimoire-word--active';
  return `grimoire-word--${school} ${tierClass}`;
}

export function resolveGatedTruesightPaint({
  resonantCharStarts,
  charStart,
  tokenData,
  word,
  isQuarantined = false,
}) {
  const isGated = resonantCharStarts instanceof Map;
  const tier = isGated ? (resonantCharStarts.get(charStart) || null) : null;

  // No gate, empty gate, or non-resonant position: grey. Never wordTruesight —
  // that path is the COLOR_DRAGON (love/move, though/tough invert).
  if (!isGated || tier == null) {
    return {
      shouldColor: false,
      tier: null,
      color: null,
      school: null,
      truesightClass: 'grimoire-word--grey',
      truesight: null,
    };
  }

  // Gate says resonant but backend token fields are missing: leave grey.
  // Inventing hue via client G2P would paint a lie with confidence.
  if (!tokenData || typeof tokenData !== 'object') {
    return {
      shouldColor: false,
      tier,
      color: null,
      school: null,
      truesightClass: 'grimoire-word--grey',
      truesight: null,
    };
  }

  const truesight = tokenTruesight(tokenData, word, { allowFrontendFallback: false });
  const school = truesight?.school || null;
  // Backend-only path can still refuse (no usable family) — stay grey, do not G2P.
  if (!school || school === 'VOID') {
    return {
      shouldColor: false,
      tier,
      color: null,
      school: null,
      truesightClass: 'grimoire-word--grey',
      truesight: null,
    };
  }

  const shouldColor = true;
  const color = (!isQuarantined && truesight?.color) ? truesight.color : null;

  return {
    shouldColor,
    tier,
    color,
    school,
    truesightClass: tierColorClass(school, tier),
    truesight,
  };
}
