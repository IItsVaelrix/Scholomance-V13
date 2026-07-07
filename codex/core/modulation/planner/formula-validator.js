import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../pixelbrain/bytecode-error.js';

export const MAX_COMPOSITE_DEPTH = 4;
export const MAX_COMPOSITE_CHILDREN = 12;
export const MAX_PARAMETRIC_N = 512;
export const MAX_FRACTAL_ITERATIONS = 5;
export const MIN_CELL_SIZE = 4;
export const MAX_SERIALIZED_BYTES = 65536;
export const MAX_TRACE_PATH_POINTS = 512;


/**
 * Validate a formula object recursively.
 * @param {Object} formula - The formula object to validate.
 * @param {number} depth - Current recursion depth.
 * @returns {string[]} List of validation error messages.
 */
export function validateFormula(formula, depth = 0) {
  const errors = [];

  if (!formula || typeof formula !== 'object') {
    return ['Formula must be a valid non-null object'];
  }

  if (depth > MAX_COMPOSITE_DEPTH) {
    return [`Recursion depth exceeds maximum limit of ${MAX_COMPOSITE_DEPTH}`];
  }

  if (!formula.type) {
    return ['Formula is missing the required "type" field'];
  }

  const validTypes = [
    'parametric_curve',
    'edge_trace',
    'fractal_iter',
    'grid_projection',
    'fibonacci',
    'template_based',
    'composite',
    'vectorized_text'
  ];

  if (!validTypes.includes(formula.type)) {
    return [`Invalid formula type: "${formula.type}"`];
  }

  // Enforce additionalProperties = false by checking allowed keys per type
  const formulaKeys = Object.keys(formula);
  let allowedKeys = ['type'];

  switch (formula.type) {
    case 'parametric_curve':
      allowedKeys.push('parameters');
      break;
    case 'edge_trace':
      allowedKeys.push('tracePath', 'unitTracePath');
      break;
    case 'fractal_iter':
      allowedKeys.push('iterations', 'baseShape', 'scale', 'cx', 'cy');
      break;
    case 'grid_projection':
      allowedKeys.push('gridType', 'cellSize', 'snapStrength', 'gridWidth', 'gridHeight');
      break;
    case 'fibonacci':
      allowedKeys.push('iterations', 'scale');
      break;
    case 'template_based':
      allowedKeys.push('template');
      break;
    case 'composite':
      allowedKeys.push('children');
      break;
    case 'vectorized_text':
      allowedKeys.push('text', 'fontSize', 'cx', 'cy', 'spacing');
      break;
  }

  const unknownKeys = formulaKeys.filter(k => !allowedKeys.includes(k));
  if (unknownKeys.length > 0) {
    errors.push(`Unknown properties for type "${formula.type}": ${unknownKeys.join(', ')}`);
  }

  // Type-specific logic checks
  if (formula.type === 'vectorized_text') {
    if (formula.text === undefined) {
      errors.push('vectorized_text must contain a "text" property');
    } else {
      if (typeof formula.text !== 'string') {
        errors.push('vectorized_text.text must be a string');
      } else {
        if (formula.text.length > 32) {
          errors.push('vectorized_text.text must be at most 32 characters');
        }
        const SUPPORTED_TEXT_RE = /^[A-Z0-9 ]*$/;
        if (!SUPPORTED_TEXT_RE.test(formula.text)) {
          errors.push('vectorized_text.text contains unsupported characters (only A-Z, 0-9, and spaces allowed)');
        }
      }
    }
    if (formula.fontSize !== undefined) {
      if (typeof formula.fontSize !== 'number') {
        errors.push('vectorized_text.fontSize must be a number');
      } else if (formula.fontSize < 10 || formula.fontSize > 100) {
        errors.push('vectorized_text.fontSize must be in range [10, 100]');
      }
    }
    if (formula.cx !== undefined && typeof formula.cx !== 'number') {
      errors.push('vectorized_text.cx must be a number');
    }
    if (formula.cy !== undefined && typeof formula.cy !== 'number') {
      errors.push('vectorized_text.cy must be a number');
    }
    if (formula.spacing !== undefined) {
      if (typeof formula.spacing !== 'number') {
        errors.push('vectorized_text.spacing must be a number');
      } else if (formula.spacing < 0.1 || formula.spacing > 5) {
        errors.push('vectorized_text.spacing must be in range [0.1, 5]');
      }
    }
  }

  if (formula.type === 'parametric_curve') {
    if (formula.parameters !== undefined) {
      if (typeof formula.parameters !== 'object' || formula.parameters === null) {
        errors.push('parametric_curve.parameters must be an object');
      } else {
        const paramKeys = Object.keys(formula.parameters);
        const allowedParams = ['cx', 'cy', 'a', 'b', 'c', 'n'];
        const unknownParams = paramKeys.filter(k => !allowedParams.includes(k));
        if (unknownParams.length > 0) {
          errors.push(`Unknown parameters in parametric_curve: ${unknownParams.join(', ')}`);
        }

        const { cx, cy, a, b, c, n } = formula.parameters;
        if (cx !== undefined && typeof cx !== 'number') errors.push('parametric_curve.parameters.cx must be a number');
        if (cy !== undefined && typeof cy !== 'number') errors.push('parametric_curve.parameters.cy must be a number');
        if (a !== undefined) {
          if (typeof a !== 'number') errors.push('parametric_curve.parameters.a must be a number');
          else if (a < -2000 || a > 2000) errors.push('parametric_curve.parameters.a must be in range [-2000, 2000]');
        }
        if (b !== undefined && typeof b !== 'number') errors.push('parametric_curve.parameters.b must be a number');
        if (c !== undefined && typeof c !== 'number') errors.push('parametric_curve.parameters.c must be a number');
        if (n !== undefined) {
          if (!Number.isInteger(n)) errors.push('parametric_curve.parameters.n must be an integer');
          else if (n < 1 || n > MAX_PARAMETRIC_N) errors.push(`parametric_curve.parameters.n must be in range [1, ${MAX_PARAMETRIC_N}]`);
        }
      }
    }
  }

  if (formula.type === 'edge_trace') {
    if (formula.tracePath !== undefined) {
      if (!Array.isArray(formula.tracePath)) {
        errors.push('edge_trace.tracePath must be an array');
      } else if (formula.tracePath.length > MAX_TRACE_PATH_POINTS) {
        errors.push(`edge_trace.tracePath must contain at most ${MAX_TRACE_PATH_POINTS} points`);
      } else {
        formula.tracePath.forEach((p, idx) => {
          if (!p || typeof p !== 'object') {
            errors.push(`edge_trace.tracePath[${idx}] must be an object`);
          } else {
            const keys = Object.keys(p);
            const extraKeys = keys.filter(k => k !== 'x' && k !== 'y');
            if (extraKeys.length > 0) errors.push(`edge_trace.tracePath[${idx}] has unknown fields: ${extraKeys.join(', ')}`);
            if (p.x === undefined || typeof p.x !== 'number') errors.push(`edge_trace.tracePath[${idx}].x must be a number`);
            if (p.y === undefined || typeof p.y !== 'number') errors.push(`edge_trace.tracePath[${idx}].y must be a number`);
          }
        });
      }
    }

    if (formula.unitTracePath !== undefined) {
      if (!Array.isArray(formula.unitTracePath)) {
        errors.push('edge_trace.unitTracePath must be an array');
      } else if (formula.unitTracePath.length > MAX_TRACE_PATH_POINTS) {
        errors.push(`edge_trace.unitTracePath must contain at most ${MAX_TRACE_PATH_POINTS} points`);
      } else {
        formula.unitTracePath.forEach((p, idx) => {
          if (!p || typeof p !== 'object') {
            errors.push(`edge_trace.unitTracePath[${idx}] must be an object`);
          } else {
            const keys = Object.keys(p);
            const extraKeys = keys.filter(k => k !== 'x' && k !== 'y');
            if (extraKeys.length > 0) errors.push(`edge_trace.unitTracePath[${idx}] has unknown fields: ${extraKeys.join(', ')}`);
            if (p.x === undefined || typeof p.x !== 'number') errors.push(`edge_trace.unitTracePath[${idx}].x must be a number`);
            else if (p.x < 0 || p.x > 1) errors.push(`edge_trace.unitTracePath[${idx}].x must be in range [0, 1]`);
            if (p.y === undefined || typeof p.y !== 'number') errors.push(`edge_trace.unitTracePath[${idx}].y must be a number`);
            else if (p.y < 0 || p.y > 1) errors.push(`edge_trace.unitTracePath[${idx}].y must be in range [0, 1]`);
          }
        });
      }
    }
  }

  if (formula.type === 'fractal_iter') {
    if (formula.iterations !== undefined) {
      if (!Number.isInteger(formula.iterations)) errors.push('fractal_iter.iterations must be an integer');
      else if (formula.iterations < 0 || formula.iterations > MAX_FRACTAL_ITERATIONS) {
        errors.push(`fractal_iter.iterations must be in range [0, ${MAX_FRACTAL_ITERATIONS}]`);
      }
    }
    if (formula.baseShape !== undefined) {
      if (!['triangle', 'square', 'circle'].includes(formula.baseShape)) {
        errors.push('fractal_iter.baseShape must be "triangle", "square", or "circle"');
      }
    }
    if (formula.scale !== undefined) {
      if (typeof formula.scale !== 'number') errors.push('fractal_iter.scale must be a number');
      else if (formula.scale < 0 || formula.scale > 100) errors.push('fractal_iter.scale must be in range [0, 100]');
    }
    if (formula.cx !== undefined && typeof formula.cx !== 'number') errors.push('fractal_iter.cx must be a number');
    if (formula.cy !== undefined && typeof formula.cy !== 'number') errors.push('fractal_iter.cy must be a number');
  }

  if (formula.type === 'grid_projection') {
    if (formula.gridType !== undefined) {
      if (!['rectangular', 'hexagonal', 'isometric'].includes(formula.gridType)) {
        errors.push('grid_projection.gridType must be "rectangular", "hexagonal", or "isometric"');
      }
    }
    if (formula.cellSize !== undefined) {
      if (typeof formula.cellSize !== 'number') errors.push('grid_projection.cellSize must be a number');
      else if (formula.cellSize < MIN_CELL_SIZE || formula.cellSize > 32) {
        errors.push(`grid_projection.cellSize must be in range [${MIN_CELL_SIZE}, 32]`);
      }
    }
    if (formula.snapStrength !== undefined) {
      if (typeof formula.snapStrength !== 'number') errors.push('grid_projection.snapStrength must be a number');
      else if (formula.snapStrength < 0 || formula.snapStrength > 1) errors.push('grid_projection.snapStrength must be in range [0, 1]');
    }
    if (formula.gridWidth !== undefined && typeof formula.gridWidth !== 'number') errors.push('grid_projection.gridWidth must be a number');
    if (formula.gridHeight !== undefined && typeof formula.gridHeight !== 'number') errors.push('grid_projection.gridHeight must be a number');
  }

  if (formula.type === 'fibonacci') {
    if (formula.iterations !== undefined) {
      if (!Number.isInteger(formula.iterations)) errors.push('fibonacci.iterations must be an integer');
      else if (formula.iterations < 0 || formula.iterations > 12) errors.push('fibonacci.iterations must be in range [0, 12]');
    }
    if (formula.scale !== undefined) {
      if (typeof formula.scale !== 'number') errors.push('fibonacci.scale must be a number');
      else if (formula.scale < 0 || formula.scale > 100) errors.push('fibonacci.scale must be in range [0, 100]');
    }
  }

  if (formula.type === 'template_based') {
    if (formula.template !== undefined) {
      if (typeof formula.template !== 'object' || formula.template === null) {
        errors.push('template_based.template must be an object');
      } else {
        const tempKeys = Object.keys(formula.template);
        const allowedTemp = ['anchorPoints', 'symmetryAxes'];
        const unknownTemp = tempKeys.filter(k => !allowedTemp.includes(k));
        if (unknownTemp.length > 0) errors.push(`Unknown fields in template: ${unknownTemp.join(', ')}`);

        const { anchorPoints, symmetryAxes } = formula.template;
        if (anchorPoints !== undefined) {
          if (!Array.isArray(anchorPoints)) {
            errors.push('template_based.template.anchorPoints must be an array');
          } else {
            anchorPoints.forEach((anchor, index) => {
              if (!anchor || typeof anchor !== 'object') {
                errors.push(`anchorPoints[${index}] must be an object`);
              } else {
                const keys = Object.keys(anchor);
                const extraKeys = keys.filter(k => k !== 'x' && k !== 'y' && k !== 'locked' && k !== 'label');
                if (extraKeys.length > 0) errors.push(`anchorPoints[${index}] has unknown fields: ${extraKeys.join(', ')}`);
                if (anchor.x === undefined || typeof anchor.x !== 'number') errors.push(`anchorPoints[${index}].x must be a number`);
                if (anchor.y === undefined || typeof anchor.y !== 'number') errors.push(`anchorPoints[${index}].y must be a number`);
                if (anchor.locked !== undefined && typeof anchor.locked !== 'boolean') errors.push(`anchorPoints[${index}].locked must be a boolean`);
                if (anchor.label !== undefined && typeof anchor.label !== 'string') errors.push(`anchorPoints[${index}].label must be a string`);
              }
            });
          }
        }
        if (symmetryAxes !== undefined) {
          if (!Array.isArray(symmetryAxes)) {
            errors.push('template_based.template.symmetryAxes must be an array');
          } else {
            symmetryAxes.forEach((axis, index) => {
              if (!['vertical', 'horizontal'].includes(axis)) {
                errors.push(`symmetryAxes[${index}] must be "vertical" or "horizontal"`);
              }
            });
          }
        }
      }
    }
  }

  if (formula.type === 'composite') {
    if (!formula.children || !Array.isArray(formula.children)) {
      errors.push('composite formula is missing required "children" array');
    } else if (formula.children.length > MAX_COMPOSITE_CHILDREN) {
      errors.push(`composite formula children count ${formula.children.length} exceeds maximum limit of ${MAX_COMPOSITE_CHILDREN}`);
    } else {
      formula.children.forEach((child, index) => {
        if (!child || typeof child !== 'object') {
          errors.push(`composite.children[${index}] must be an object`);
          return;
        }

        const childKeys = Object.keys(child);
        const allowedChildKeys = [
          'role', 'anchor', 'size', 'material', 'paletteChannel', 'formula',
          'rotation', 'rotationSpeed', 'rotationSwingRange', 'rotationSwingSpeed'
        ];
        const unknownChild = childKeys.filter(k => !allowedChildKeys.includes(k));
        if (unknownChild.length > 0) {
          errors.push(`composite.children[${index}] has unknown properties: ${unknownChild.join(', ')}`);
        }

        if (child.role === undefined || typeof child.role !== 'string') {
          errors.push(`composite.children[${index}].role must be a string`);
        }

        if (child.anchor === undefined || typeof child.anchor !== 'object' || child.anchor === null) {
          errors.push(`composite.children[${index}].anchor is required and must be an object`);
        } else {
          const keys = Object.keys(child.anchor);
          const extra = keys.filter(k => k !== 'x' && k !== 'y');
          if (extra.length > 0) errors.push(`composite.children[${index}].anchor has unknown fields: ${extra.join(', ')}`);
          if (child.anchor.x === undefined || typeof child.anchor.x !== 'number' || child.anchor.x < 0 || child.anchor.x > 1) {
            errors.push(`composite.children[${index}].anchor.x must be a number between 0 and 1`);
          }
          if (child.anchor.y === undefined || typeof child.anchor.y !== 'number' || child.anchor.y < 0 || child.anchor.y > 1) {
            errors.push(`composite.children[${index}].anchor.y must be a number between 0 and 1`);
          }
        }

        if (child.size !== undefined) {
          if (typeof child.size !== 'object' || child.size === null) {
            errors.push(`composite.children[${index}].size must be an object`);
          } else {
            const keys = Object.keys(child.size);
            const extra = keys.filter(k => k !== 'w' && k !== 'h');
            if (extra.length > 0) errors.push(`composite.children[${index}].size has unknown fields: ${extra.join(', ')}`);
            if (child.size.w === undefined || typeof child.size.w !== 'number' || child.size.w < 0 || child.size.w > 1) {
              errors.push(`composite.children[${index}].size.w must be a number between 0 and 1`);
            }
            if (child.size.h === undefined || typeof child.size.h !== 'number' || child.size.h < 0 || child.size.h > 1) {
              errors.push(`composite.children[${index}].size.h must be a number between 0 and 1`);
            }
          }
        }

        if (child.material !== undefined && typeof child.material !== 'string') {
          errors.push(`composite.children[${index}].material must be a string`);
        }

        if (child.paletteChannel !== undefined && !Number.isInteger(child.paletteChannel)) {
          errors.push(`composite.children[${index}].paletteChannel must be an integer`);
        }

        if (child.rotation !== undefined && typeof child.rotation !== 'number') {
          errors.push(`composite.children[${index}].rotation must be a number`);
        }

        if (child.rotationSpeed !== undefined && typeof child.rotationSpeed !== 'number') {
          errors.push(`composite.children[${index}].rotationSpeed must be a number`);
        }

        if (child.rotationSwingRange !== undefined && typeof child.rotationSwingRange !== 'number') {
          errors.push(`composite.children[${index}].rotationSwingRange must be a number`);
        }

        if (child.rotationSwingSpeed !== undefined && typeof child.rotationSwingSpeed !== 'number') {
          errors.push(`composite.children[${index}].rotationSwingSpeed must be a number`);
        }

        if (child.formula === undefined) {
          errors.push(`composite.children[${index}].formula is required`);
        } else {
          // Recurse with depth increment
          const childErrors = validateFormula(child.formula, depth + 1);
          childErrors.forEach(err => {
            errors.push(`composite.children[${index}].formula[${child.role || 'unknown'}]: ${err}`);
          });
        }
      });
    }
  }

  return errors;
}

export function validateProposal(proposal) {
  const errors = [];

  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, ok: false, code: 'FORMULA_PROPOSAL_REJECTED', errors: ['Proposal must be a valid non-null object'] };
  }

  // Enforce MAX_SERIALIZED_BYTES check
  try {
    const serialized = JSON.stringify(proposal);
    if (serialized.length > MAX_SERIALIZED_BYTES) {
      errors.push(`Proposal serialized length of ${serialized.length} bytes exceeds maximum limit of ${MAX_SERIALIZED_BYTES} bytes`);
    }
  } catch (e) {
    errors.push('Proposal is not stringifiable as valid JSON');
  }

  const proposalKeys = Object.keys(proposal);
  const allowedProposalKeys = [
    'rationale',
    'confidence',
    'reviewRequired',
    'sourceIntentHash',
    'evalSuiteId',
    'proposedFormula'
  ];

  const unknownProposalKeys = proposalKeys.filter(k => !allowedProposalKeys.includes(k));
  if (unknownProposalKeys.length > 0) {
    errors.push(`Unknown properties in proposal: ${unknownProposalKeys.join(', ')}`);
  }

  // Required proposal fields
  if (proposal.rationale === undefined || typeof proposal.rationale !== 'string') {
    errors.push('Proposal is missing required "rationale" field of type string');
  }
  if (proposal.confidence === undefined || typeof proposal.confidence !== 'number') {
    errors.push('Proposal is missing required "confidence" field of type number');
  } else if (proposal.confidence < 0 || proposal.confidence > 1) {
    errors.push('Proposal confidence must be a number between 0 and 1');
  }
  if (proposal.reviewRequired === undefined || typeof proposal.reviewRequired !== 'boolean') {
    errors.push('Proposal is missing required "reviewRequired" field of type boolean');
  }

  if (proposal.sourceIntentHash !== undefined && typeof proposal.sourceIntentHash !== 'string') {
    errors.push('Proposal.sourceIntentHash must be a string');
  }
  if (proposal.evalSuiteId !== undefined && typeof proposal.evalSuiteId !== 'string') {
    errors.push('Proposal.evalSuiteId must be a string');
  }

  if (proposal.proposedFormula === undefined || typeof proposal.proposedFormula !== 'object' || proposal.proposedFormula === null) {
    errors.push('Proposal is missing required "proposedFormula" object');
  } else {
    const pfKeys = Object.keys(proposal.proposedFormula);
    const allowedPf = ['role', 'material', 'paletteChannel', 'formula'];
    const unknownPf = pfKeys.filter(k => !allowedPf.includes(k));
    if (unknownPf.length > 0) {
      errors.push(`Unknown properties in proposedFormula: ${unknownPf.join(', ')}`);
    }

    const { role, material, paletteChannel, formula } = proposal.proposedFormula;
    if (role === undefined || typeof role !== 'string') {
      errors.push('proposedFormula.role must be a string');
    }
    if (material !== undefined && typeof material !== 'string') {
      errors.push('proposedFormula.material must be a string');
    }
    if (paletteChannel !== undefined && !Number.isInteger(paletteChannel)) {
      errors.push('proposedFormula.paletteChannel must be an integer');
    }

    if (formula === undefined) {
      errors.push('proposedFormula.formula is required');
    } else {
      const formulaErrors = validateFormula(formula, 0);
      errors.push(...formulaErrors);
    }
  }

  if (errors.length > 0) {
    const bytecodeError = new BytecodeError(
      ERROR_CATEGORIES.FORMULA,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMG_FORMULA,
      ERROR_CODES.FORMULA_INVALID_SYNTAX,
      { errors }
    );
    return {
      valid: false,
      ok: false,
      code: 'FORMULA_PROPOSAL_REJECTED',
      bytecodeError,
      errors
    };
  }

  return {
    valid: true,
    ok: true,
    errors: []
  };
}
