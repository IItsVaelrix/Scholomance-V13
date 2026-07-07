/**
 * ANATOMY-REGISTRY
 *
 * The canonical database for PixelBrain anatomical structures.
 * Defines the rigid skeletal constraints, anchor points, and topological trees
 * for different species and forms (Humanoid, Quadruped, Avian, etc.).
 * 
 * Used by the Character Forge and SCDL Semantic Unifier to guarantee that
 * when a user builds a "humanoid", they provide all required anatomy anchors,
 * and that AI-generated coordinate layouts adhere to a recognizable structural manifold.
 */

import { CanonicalRoles } from './semantic-registry.js';

export const AnatomySpecies = Object.freeze({
  HUMANOID: 'humanoid',
  QUADRUPED: 'quadruped',
  AVIAN: 'avian',
  ARACHNID: 'arachnid',
  AMORPHOUS: 'amorphous',
});

// Defines the topological relationship of body parts (parent -> child)
// and the required skeletal anchors for each semantic group.
export const AnatomySchemas = Object.freeze({
  [AnatomySpecies.HUMANOID]: {
    root: 'torso',
    groups: {
      head: {
        role: CanonicalRoles.BODY,
        parent: 'torso',
        requiredAnchors: ['headTop', 'headCenter', 'headChin'],
        optionalAnchors: ['earL', 'earR', 'hornL', 'hornR'],
      },
      face: {
        role: CanonicalRoles.EYE, // Generic fallback, but handles eyes/mouth
        parent: 'head',
        requiredAnchors: ['eyeL', 'eyeR'],
        optionalAnchors: ['nose', 'mouth', 'thirdEye'],
      },
      torso: {
        role: CanonicalRoles.BODY,
        parent: null,
        requiredAnchors: ['shoulderL', 'shoulderR', 'hipL', 'hipR'],
        optionalAnchors: ['chestCenter', 'spine'],
      },
      armL: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['shoulderL', 'elbowL', 'wristL', 'handL'],
        optionalAnchors: [],
      },
      armR: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['shoulderR', 'elbowR', 'wristR', 'handR'],
        optionalAnchors: [],
      },
      legL: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['hipL', 'kneeL', 'ankleL', 'footL'],
        optionalAnchors: [],
      },
      legR: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['hipR', 'kneeR', 'ankleR', 'footR'],
        optionalAnchors: [],
      },
    },
  },

  [AnatomySpecies.QUADRUPED]: {
    root: 'torso',
    groups: {
      head: {
        role: CanonicalRoles.BODY,
        parent: 'torso',
        requiredAnchors: ['headTop', 'headCenter', 'snout'],
        optionalAnchors: ['earL', 'earR'],
      },
      torso: {
        role: CanonicalRoles.BODY,
        parent: null,
        requiredAnchors: ['shoulderL', 'shoulderR', 'hipL', 'hipR'],
        optionalAnchors: ['tailBase'],
      },
      frontLegL: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['shoulderL', 'frontKneeL', 'frontPawL'],
        optionalAnchors: [],
      },
      frontLegR: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['shoulderR', 'frontKneeR', 'frontPawR'],
        optionalAnchors: [],
      },
      backLegL: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['hipL', 'backKneeL', 'backPawL'],
        optionalAnchors: [],
      },
      backLegR: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['hipR', 'backKneeR', 'backPawR'],
        optionalAnchors: [],
      },
      tail: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['tailBase', 'tailTip'],
        optionalAnchors: ['tailMid'],
      },
    },
  },

  [AnatomySpecies.AVIAN]: {
    root: 'torso',
    groups: {
      head: {
        role: CanonicalRoles.BODY,
        parent: 'torso',
        requiredAnchors: ['headTop', 'headCenter', 'beak'],
        optionalAnchors: [],
      },
      torso: {
        role: CanonicalRoles.BODY,
        parent: null,
        requiredAnchors: ['wingBaseL', 'wingBaseR', 'hipL', 'hipR'],
        optionalAnchors: ['tailBase'],
      },
      wingL: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['wingBaseL', 'wingTipL'],
        optionalAnchors: ['wingMidL'],
      },
      wingR: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['wingBaseR', 'wingTipR'],
        optionalAnchors: ['wingMidR'],
      },
      legL: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['hipL', 'talonL'],
        optionalAnchors: ['kneeL'],
      },
      legR: {
        role: CanonicalRoles.LIMB,
        parent: 'torso',
        requiredAnchors: ['hipR', 'talonR'],
        optionalAnchors: ['kneeR'],
      },
    },
  },
});

/**
 * Get the skeletal schema for a specific species.
 */
export function getAnatomySchema(speciesId) {
  return AnatomySchemas[speciesId] || AnatomySchemas[AnatomySpecies.AMORPHOUS];
}

/**
 * Validate that a provided skeleton object fulfills the required anchors
 * for a specific species schema.
 * 
 * @param {string} speciesId - e.g. 'humanoid'
 * @param {Object} skeleton - flat key-value pairs of anchor names to coordinates {x, y}
 * @returns {Object} { valid: boolean, missingAnchors: string[] }
 */
export function validateSkeletonCompleteness(speciesId, skeleton = {}) {
  const schema = getAnatomySchema(speciesId);
  if (!schema || !schema.groups) {
    return { valid: true, missingAnchors: [] }; // Amorphous is always valid
  }

  const missingAnchors = [];
  for (const groupName of Object.keys(schema.groups)) {
    const group = schema.groups[groupName];
    for (const reqAnchor of group.requiredAnchors) {
      if (!skeleton[reqAnchor] || typeof skeleton[reqAnchor].x !== 'number' || typeof skeleton[reqAnchor].y !== 'number') {
        missingAnchors.push(reqAnchor);
      }
    }
  }

  return {
    valid: missingAnchors.length === 0,
    missingAnchors,
  };
}

export default {
  AnatomySpecies,
  AnatomySchemas,
  getAnatomySchema,
  validateSkeletonCompleteness,
};
