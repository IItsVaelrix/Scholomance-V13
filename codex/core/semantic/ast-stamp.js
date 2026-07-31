/**
 * AST STAMP — a fingerprint over the rare syntactic kinds a file carries.
 *
 * WHY THIS EXISTS. Band 0 of ast-topography averages a distribution over the
 * closed inventory, so the kinds carrying the most information are the ones with
 * the fewest counts. Measured over 1200 files, the kinds appearing in under 5% of
 * them were:
 *
 *   shape:catchEmpty  shape:catchRethrows  shape:effectWithCleanup
 *   shape:effectWithoutCleanup  fact:concurrentCallback  fact:externalRequest
 *
 * which is the cleri pathology family list, near one-to-one. Rarity and
 * diagnosticity are the same set, and the vector structurally cannot carry them:
 * one or two counts against dozens of `fact:call` disappear into the mean. A
 * stamp is a separate channel for exactly that signal — high precision, low
 * recall, complementing a vector that is good at neighbourhoods and bad at
 * specifics.
 *
 * WHAT IT IS NOT. A stamp NOMINATES; it never identifies. In the 1200-file
 * measurement the largest stamp bucket held 35 files and only 38% of stamps
 * resolved to one. A stamp says "one of these". Read as "this file", it becomes
 * a check that cannot fail.
 *
 * Coverage is the tail, not the corpus: 86.6% of files carried no rare kind at
 * the 5% threshold and therefore have no stamp. `stampFor` returns
 * `{ stamp: null }` for those, and returns `null` outright for source that will
 * not parse — the same declared-absence contract as `ast-topography` and as
 * `SkillScores.semantic` in `src/lib/career/graph/contracts.ts`.
 *
 * RARITY IS CORPUS-RELATIVE. Document frequencies live in the manifest beside
 * the stamps, and every stamp carries the `corpusId` that minted it. A threshold
 * frozen into this file would be the `STABLE_MIN` error one level up: an
 * absolute cut applied across distributions.
 *
 * SPEED IS AMORTIZATION, NOT A FAST PATH. Nothing can know a file contains
 * `shape:catchRethrows` without parsing it. `contentHash` comes from the parser
 * and is the cache key: parse once, stamp once, reuse until the bytes change.
 */

import { resolveAstKinds } from './ast-topography.js';

/** Nomination source id. NOT in cleri's frozen NOMINATION_SOURCES — see below. */
export const STAMP_SOURCE = 'STAMP';

/**
 * Rare kinds that evidence each pathology family. A stamp bucket is only
 * nominated for a pathology when it carries one of these.
 */
const PATHOLOGY_STAMP_KINDS = Object.freeze({
  LEAKED_LISTENER_SUBSCRIPTION: Object.freeze(['shape:effectWithoutCleanup', 'shape:effectWithCleanup']),
  SWALLOWED_ERROR: Object.freeze(['shape:catchEmpty', 'shape:catchRethrows', 'fact:catch']),
  CONCURRENT_SHARED_STATE_MUTATION: Object.freeze(['fact:concurrentCallback']),
  UNSAFE_EXTERNAL_RESPONSE_ACCESS: Object.freeze(['fact:externalRequest']),
  UNSEEDED_RANDOMNESS: Object.freeze([])
});

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function hex32(n) {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/**
 * Count, per inventory kind, how many files in the corpus contain it.
 *
 * @param {{ path: string, content: string }[]} sources
 * @returns {{ corpusId: string, totalFiles: number, df: Record<string, number>, refused: string[] }}
 */
export function buildDocumentFrequency(sources) {
  const df = Object.create(null);
  const refused = [];
  const accepted = [];

  for (const source of sources || []) {
    const resolved = resolveAstKinds(source);
    if (!resolved) {
      refused.push(source?.path ?? '');
      continue;
    }
    accepted.push(source?.path ?? '');
    // Document frequency: a kind counts once per FILE, however often it occurs.
    for (const kind of new Set(resolved.kinds)) {
      df[kind] = (df[kind] || 0) + 1;
    }
  }

  // Identity of the corpus, so a stamp can refuse to be read against another.
  const corpusId = `corpus:${hex32(fnv1aHash([...accepted].sort().join('\n')))}:${accepted.length}`;

  return Object.freeze({
    corpusId,
    totalFiles: accepted.length,
    df: Object.freeze({ ...df }),
    refused: Object.freeze(refused)
  });
}

/**
 * Kinds appearing in fewer than `threshold` of the corpus's files.
 *
 * @param {ReturnType<typeof buildDocumentFrequency>} manifest
 * @param {number} threshold fraction in (0, 1]
 * @returns {Set<string>}
 */
export function rareKindsFor(manifest, threshold) {
  const rare = new Set();
  const total = manifest?.totalFiles || 0;
  if (total === 0) return rare;
  for (const [kind, count] of Object.entries(manifest.df || {})) {
    if (count / total < threshold) rare.add(kind);
  }
  return rare;
}

/**
 * Stamp a single file against a corpus manifest.
 *
 * @returns {{ path, stamp: string|null, rareKinds: string[], contentHash: string, corpusId: string } | null}
 *   null when the parser refuses the source.
 */
export function stampFor(source, manifest, threshold) {
  const resolved = resolveAstKinds(source);
  if (!resolved) return null;

  const rare = rareKindsFor(manifest, threshold);
  const rareKinds = [...new Set(resolved.kinds)].filter(k => rare.has(k)).sort();

  return Object.freeze({
    path: source?.path ?? '',
    // No rare kind means no stamp. An empty string would index every ordinary
    // file into one enormous bucket and read as coverage.
    stamp: rareKinds.length === 0 ? null : `stamp:${hex32(fnv1aHash(rareKinds.join(',')))}`,
    rareKinds: Object.freeze(rareKinds),
    contentHash: String(resolved.facts.contentHash),
    corpusId: manifest.corpusId
  });
}

/**
 * Inverted index: stamp → the files carrying it.
 *
 * @param {object} [options] `expectCorpusId` refuses a manifest from elsewhere.
 * @returns {Map<string, { path: string, rareKinds: string[], contentHash: string }[]>}
 */
export function buildStampIndex(sources, manifest, threshold, options = {}) {
  if (options.expectCorpusId && options.expectCorpusId !== manifest.corpusId) {
    throw new Error(
      `AST_STAMP_CORPUS_MISMATCH: stamps were minted against corpus ${options.expectCorpusId} ` +
      `but this manifest is ${manifest.corpusId}. Rarity is a property of a corpus, ` +
      'so a stamp read against foreign document frequencies means nothing.'
    );
  }

  const index = new Map();
  for (const source of sources || []) {
    const stamped = stampFor(source, manifest, threshold);
    if (!stamped || !stamped.stamp) continue;
    if (!index.has(stamped.stamp)) index.set(stamped.stamp, []);
    index.get(stamped.stamp).push({
      path: stamped.path,
      rareKinds: stamped.rareKinds,
      contentHash: stamped.contentHash
    });
  }
  for (const bucket of index.values()) bucket.sort((a, b) => a.path.localeCompare(b.path));
  return index;
}

/** Files carrying a stamp. Empty array for an unknown stamp — never a guess. */
export function lookupByStamp(index, stamp) {
  if (!stamp) return [];
  return index.get(stamp) ? [...index.get(stamp)] : [];
}

/**
 * Nominate candidates whose rare kinds evidence the planned pathology.
 *
 * ⚠ `mergeCandidates` DROPS THESE TODAY. `retrieval.js:377` filters every
 * nomination against the frozen `NOMINATION_SOURCES`, silently and with no
 * error, and `STAMP` is not in it. Wiring this into production cleri is a
 * one-line addition to that array; it is deliberately not made here, and
 * `ast-stamp.test.js` asserts the gap so it cannot be forgotten.
 *
 * @returns {{ path, factId, pathologyClass, source, score, span }[]}
 */
export function retrieveStampNominations(sources, plan, options = {}) {
  const { manifest, index, threshold } = options;
  if (!manifest || !index) return [];

  const pathologyClass = plan?.pathologyClass ? String(plan.pathologyClass) : null;
  const evidenceKinds = pathologyClass ? PATHOLOGY_STAMP_KINDS[pathologyClass] : null;
  if (!evidenceKinds || evidenceKinds.length === 0) return [];

  const nominations = [];
  for (const source of sources || []) {
    const stamped = stampFor(source, manifest, threshold);
    if (!stamped || !stamped.stamp) continue;

    const matched = stamped.rareKinds.filter(k => evidenceKinds.includes(k));
    if (matched.length === 0) continue;

    // Score is the share of the pathology's evidence kinds this file carries.
    // It ranks within the nominated set and asserts nothing about the defect —
    // a stamp nominates, a verifier decides.
    const bucket = lookupByStamp(index, stamped.stamp);
    nominations.push({
      path: stamped.path,
      factId: null,
      pathologyClass,
      source: STAMP_SOURCE,
      score: Math.min(1, matched.length / evidenceKinds.length),
      stamp: stamped.stamp,
      bucketSize: bucket.length,
      matchedKinds: matched,
      span: { path: stamped.path, startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }
    });
  }

  nominations.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return nominations;
}
