export const RHYME_ADAPTER_VERSION = 'ra-adapter-1';

/** Label the cadence from the stress contour's leading beat. Structural, deterministic. */
export function cadenceFamilyFromStress(stress) {
  const marks = String(stress || '').replace(/\s+/g, '');
  if (!marks) return 'unmetered';
  if (marks.startsWith('x/')) return 'iambic-adjacent';
  if (marks.startsWith('/x')) return 'trochaic-adjacent';
  return 'mixed-cadence';
}

/**
 * @param {object} rhymeQueryEngine
 * @param {object} rhymeLexiconRepo
 * @param {object} identity  resolveQueryIdentity output
 */
export async function analyzeRhyme(rhymeQueryEngine, rhymeLexiconRepo, identity) {
  const mode = identity.kind === 'word' ? 'word' : 'line';
  const result = await rhymeQueryEngine.query({ text: identity.normalized, mode });

  const constellation = (result.constellations && result.constellations[0]) || null;
  const stress = constellation?.dominantStressPattern || '';
  const dominantVowelFamily = constellation?.dominantVowelFamily?.[0] || null;
  const exactRhymes = constellation ? [...constellation.members] : [];
  const exactSet = new Set(exactRhymes);
  const slantRhymes = (result.topMatches || [])
    .map((m) => m.token)
    .filter((t) => !exactSet.has(t));

  const anchor = identity.primaryContentToken || identity.tokens[identity.tokens.length - 1] || identity.normalized;
  const node = rhymeLexiconRepo.lookupNodeByNormalized(anchor);
  const phonemes = Array.isArray(node?.phonemes) ? node.phonemes : [];

  return {
    phonemes,
    stress,
    cadenceFamily: cadenceFamilyFromStress(stress),
    exactRhymes,
    slantRhymes,
    dominantVowelFamily,
    engineVersion: RHYME_ADAPTER_VERSION,
  };
}
