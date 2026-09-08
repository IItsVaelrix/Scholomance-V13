/**
 * Scholomium Ink — Tree Family AMP Manifest Record
 *
 * Conforms to PB-STUDIO-AMP-MANIFEST-v1.
 */

import { computeCanonicalDigest256 } from '../../scd128/scd128.canonical.js';

export const TREE_AMP_MANIFEST_RECORD = Object.freeze({
  contract: 'PB-STUDIO-AMP-MANIFEST-v1',
  ampId: 'scholomium.tree.v1',
  modulePath: 'codex/core/pixelbrain/scholomium-ink/families/tree/tree-derivation.js',
  system: 'scholomium-ink',
  status: 'pilot-active',
  kind: 'runnable',
  tab: 'foundry',
  pipeline: 'tree-generation',
  order: 128,
  adapterId: 'tree-projection.adapter',
  mutates: false,
  reads: Object.freeze(['FORM64', 'REALIZATION64', 'SCD128-COUNSEL-RECEIPT']),
  writes: Object.freeze(['SCDL-V2-SOURCE', 'LAYER-SURFACES-IR']),
  exports: Object.freeze(['generateTreeDescendant', 'projectCounseledTreeToSCDLV2']),
  summary: 'Scholomium Ink seven-tree art intelligence and deterministic derivation AMP.',
  consumerIds: Object.freeze(['PixelBrainStudio', 'ScholomiumInkCorpus']),
  checksum: computeCanonicalDigest256({
    contract: 'PB-STUDIO-AMP-MANIFEST-v1',
    ampId: 'scholomium.tree.v1',
  }),
});
