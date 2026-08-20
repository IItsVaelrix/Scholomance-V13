/**
 * Assemble the atlas ledger.
 *
 * @module codex/research/parser-failure-atlas/build-atlas
 */

import { ATLAS_CONTRACT, PLATES, SEALED_SPLIT } from './atlas-schema.js';
import { plateAtlas } from './plate.js';
import { rankConstructionHoles, rankLeftoverTypes } from './rank-constructions.js';

export function buildAtlas(cases) {
  const design = (cases || []).filter((c) => c.split !== SEALED_SPLIT);
  const plated = plateAtlas(design);
  const plates = Object.create(null);
  for (const plate of PLATES) plates[plate] = plated[plate].length;

  return Object.freeze({
    contract: ATLAS_CONTRACT,
    cases: design.length,
    plates: Object.freeze(plates),
    constructions: Object.freeze(rankConstructionHoles(design)),
    leftovers: Object.freeze(rankLeftoverTypes(design)),
    classifier: Object.freeze({
      grammar: plates.GRAMMAR || 0,
      withFrontier: design.filter((c) => c.plate === 'GRAMMAR' && (c.diagnosis?.categories || []).length > 0).length,
    }),
    testOpened: false,
  });
}
