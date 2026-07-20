/**
 * Character Factory
 * Declares the seam-checked route for the character compose pipeline,
 * per docs/superpowers/plans/2026-06-12-pixelbrain-character-creator-pdr.md
 * (forgeCharacter → composeSilhouette(dir) → CharacterFactory route →
 *  region-fill-amp → SpritesheetAssembler).
 *
 * Mirrors the contract-only route pattern used by the item factories
 * (factory/weapon-factory.js et al): the foundry (character-foundry.js)
 * produces the geometry outside the route, and the route's `seam`
 * declarations + `requiredOutputs` are validated against it via
 * `validateRoute` from microprocessor-route.js. No step carries an
 * `execute` body, so `validateRoute` (not `executeRoute`) is correct here.
 *
 * This closes the asymmetry where the item path ran every spec through the
 * seam-contract (item-foundry.js → executeRoute) but the character path
 * bypassed it entirely — letting a character silently compose into an empty
 * part with no structured diagnostic.
 */
import { validateRoute } from './microprocessor-route.js';

/**
 * Derive the part-id list a character spec will render for a given direction.
 *
 * Character specs carry no flat `parts` array (unlike item specs), and which
 * parts actually render is direction-dependent. Rather than couple to a
 * composed silhouette, we replicate the composer's own culling rules here
 * (character-silhouette-composer.js) so the derived set matches exactly what
 * the composer reports it drew for that direction:
 *
 *   - body / hair / clothing / accessories / details render in every direction
 *   - face features are culled entirely facing north (back of the head)
 *   - in profile (east/west) the far eye is culled: leftEye facing east,
 *     rightEye facing west
 *
 * The contract then verifies that every part the spec *declares* for that
 * direction actually stamps filled cells — precisely the silent-failure mode
 * the seam-contract exists to catch.
 */
export function characterPartIds(spec, direction = 'south') {
  const ids = [];
  const push = (id) => {
    if (typeof id === 'string' && id.length > 0 && !ids.includes(id)) ids.push(id);
  };

  if (spec?.body?.profile) push('body');

  // Face features: culled facing north; far eye culled in profile view.
  if (Array.isArray(spec?.face) && direction !== 'north') {
    const isEastWest = direction === 'east' || direction === 'west';
    for (const facePart of spec.face) {
      if (!facePart?.id) continue;
      if (isEastWest) {
        if (facePart.id === 'leftEye' && direction === 'east') continue;
        if (facePart.id === 'rightEye' && direction === 'west') continue;
      }
      push(facePart.id);
    }
  }

  if (spec?.hair?.profile) push('hair');

  for (const layer of ['clothing', 'accessories', 'details']) {
    if (Array.isArray(spec?.[layer])) {
      for (const part of spec[layer]) if (part?.id) push(part.id);
    }
  }

  return ids;
}

/**
 * Stamp `partId` onto a list of `{x,y}` cells using the composer's `partOf`
 * ownership map. The seam-contract's required-output validator selects cells
 * via `cell.partId === selector` (see countCellsForPart in seam-contract.js),
 * but the character composer emits bare `{x,y}` cells and tracks ownership
 * separately in `partOf`. This adapter aligns the two cell dialects so the
 * shared validator can see character cells. Cells with no recorded owner
 * default to 'body' (matching applyCharacterFills' fallback).
 */
export function stampCharacterCellOwnership(cells, partOf) {
  return (cells || []).map((c) => ({
    ...c,
    partId: partOf?.get(`${c.x},${c.y}`) || 'body',
  }));
}

/**
 * Build the seam-checked route definition for a character compose pass.
 *
 * `spec` + `direction` determine the declared part set (see characterPartIds).
 * Each becomes a required output that must stamp at least one filled cell —
 * turning "the spec declared a part but the fill layer produced nothing for
 * it" into a loud PB_ROUTE_REQUIRED_OUTPUT_EMPTY diagnostic instead of a
 * visual defect discovered downstream.
 *
 * When a composed `silhouette` is supplied (the foundry path), the declared
 * set is intersected with the parts the composer actually *retained ownership
 * of* in its final `partOf` map. Later layers legitimately overwrite earlier
 * ones — e.g. hair drawn over the near eye in profile view — so a part can be
 * declared yet own zero surviving cells. Requiring such a part would be a
 * false positive; intersecting with surviving ownership keeps the contract
 * honest (it still catches a fill layer that drops a part the composer owned)
 * without hardcoding occlusion rules. Callers that pass no silhouette (e.g.
 * contract-shape tests) get the full direction-aware declared set.
 */
export function buildCharacterRouteDefinition(spec, direction = 'south', silhouette = null) {
  let ids = characterPartIds(spec, direction);

  if (silhouette?.partOf instanceof Map) {
    const surviving = new Set(silhouette.partOf.values());
    ids = ids.filter((id) => surviving.has(id));
  }

  const requiredOutputs = ids.map((id) => ({
    id: `${id}-cells`,
    kind: 'partCells',
    selector: id,
    minCells: 1,
    fatal: true,
  }));

  const routeDefinition = {
    name: 'character.compose.v1',
    requiredOutputs,
    requiredOutputSteps: Object.fromEntries(requiredOutputs.map((req) => [req.id, 'SilhouetteComposer'])),
    steps: [
      {
        name: 'SilhouetteComposer',
        seam: {
          id: 'character-silhouette-v1', processor: 'pixelbrain.characterSilhouette', version: '1.0.0',
          consumes: ['spec.body', 'spec.canvas'],
          emits: [
            'silhouette.cells',
            'silhouette.partOf',
            ...ids.map((id) => `part.${id}.cells`),
          ],
        },
      },
      {
        name: 'RegionFillAMP',
        seam: {
          id: 'character-region-fill-v1', processor: 'pixelbrain.characterRegionFill', version: '1.0.0',
          consumes: ['silhouette.cells', 'silhouette.partOf'],
          emits: [
            'fills.coordinates',
            ...ids.flatMap((id) => [
              `material.${id}.fill`,
              `material.${id}.trim`,
              `material.${id}.outline`,
            ]),
          ],
        },
      },
    ],
  };

  return routeDefinition;
}

/**
 * Validate one direction's filled lattice against the character route.
 * Returns the route diagnostics (never throws). `fillsCoordinates` are the
 * applyCharacterFills output cells (already carrying `partId`).
 */
export function validateCharacterDirection(routeDefinition, spec, fillsCoordinates) {
  const context = {
    spec,
    silhouette: { cells: fillsCoordinates || [] },
    fills: { coordinates: fillsCoordinates || [] },
  };
  return validateRoute(routeDefinition, context).diagnostics;
}
