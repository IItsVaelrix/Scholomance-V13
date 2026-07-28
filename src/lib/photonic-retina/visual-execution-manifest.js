/**
 * PB-VISUAL-EXECUTION-MANIFEST-v1
 */

import {
  MANIFEST_SCHEMA,
  contentHash,
  deepFreeze,
  stableStringify,
} from './realization-equivalence/schema.js';

/**
 * @param {object} input
 */
export function buildVisualExecutionManifest(input = {}) {
  const manifest = {
    schema: MANIFEST_SCHEMA,
    geneHash: input.geneHash ?? null,
    schemaVersions: Object.freeze({ ...(input.schemaVersions ?? {}) }),
    compilerPassVersions: Object.freeze([...(input.compilerPassVersions ?? [])]),
    AMPManifest: Object.freeze(input.AMPManifest ?? null),
    orderedAMPInvocations: Object.freeze([...(input.orderedAMPInvocations ?? [])]),
    quantizationMode: input.quantizationMode ?? 'fixed-6dp',
    tieBreakRules: input.tieBreakRules ?? 'stable-sort-yx',
    seed: input.seed ?? 0,
    rendererBackend: input.rendererBackend ?? 'unspecified',
    resourceBudget: Object.freeze({ ...(input.resourceBudget ?? {}) }),
    intermediateArtifactHashes: Object.freeze({ ...(input.intermediateArtifactHashes ?? {}) }),
    finalArtifactHash: input.finalArtifactHash ?? null,
    perceptualEvidenceHash: input.perceptualEvidenceHash ?? null,
    equivalenceHash: input.equivalenceHash ?? null,
    createdAt: input.createdAt ?? null,
  };

  const bodyHash = contentHash({
    geneHash: manifest.geneHash,
    schemaVersions: manifest.schemaVersions,
    compilerPassVersions: manifest.compilerPassVersions,
    AMPManifest: manifest.AMPManifest,
    orderedAMPInvocations: manifest.orderedAMPInvocations,
    quantizationMode: manifest.quantizationMode,
    tieBreakRules: manifest.tieBreakRules,
    seed: manifest.seed,
    rendererBackend: manifest.rendererBackend,
    resourceBudget: manifest.resourceBudget,
    intermediateArtifactHashes: manifest.intermediateArtifactHashes,
    finalArtifactHash: manifest.finalArtifactHash,
    perceptualEvidenceHash: manifest.perceptualEvidenceHash,
    equivalenceHash: manifest.equivalenceHash,
  });

  return deepFreeze({ ...manifest, manifestHash: bodyHash });
}

/**
 * Assert replay invariant:
 * identical manifest identity fields + same final hash OR classified backend-equivalent.
 *
 * @param {object} original
 * @param {object} replayed
 * @param {{ equivalenceClass?: string }} [context]
 */
export function assertManifestReplay(original, replayed, context = {}) {
  if (!original?.manifestHash || !replayed?.manifestHash) {
    throw new Error('VISUAL_MANIFEST_REPLAY_INVALID: missing manifestHash');
  }

  const identityKeys = [
    'geneHash', 'quantizationMode', 'tieBreakRules', 'seed',
    'rendererBackend',
  ];
  for (const k of identityKeys) {
    if (stableStringify(original[k]) !== stableStringify(replayed[k])) {
      throw new Error(`VISUAL_MANIFEST_REPLAY_MISMATCH: ${k}`);
    }
  }

  if (original.finalArtifactHash === replayed.finalArtifactHash) {
    return deepFreeze({
      ok: true,
      result: 'identical',
      originalHash: original.manifestHash,
      replayedHash: replayed.manifestHash,
    });
  }

  if (context.equivalenceClass === 'backend-equivalent') {
    return deepFreeze({
      ok: true,
      result: 'backend-equivalent',
      originalHash: original.manifestHash,
      replayedHash: replayed.manifestHash,
      finalArtifactHashDelta: {
        from: original.finalArtifactHash,
        to: replayed.finalArtifactHash,
      },
    });
  }

  throw new Error(
    `VISUAL_MANIFEST_REPLAY_DIVERGENT: finalArtifactHash ${original.finalArtifactHash} ≠ ${replayed.finalArtifactHash}`,
  );
}
