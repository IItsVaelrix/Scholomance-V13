import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_ROOT = join(process.cwd(), 'tests/fixtures/godot-export');

const KINDS = {
  pixelbrain: 'scholomance.pixelbrain.godot.v1',
  wand: 'scholomance.wand.godot.v1',
  divwand: 'scholomance.divwand.godot.v1',
};

const SUPPORTED_WAND_FORMULAS = new Set([
  'parametric_curve',
  'grid_projection',
  'fibonacci',
  'fractal_iter',
  'composite',
  'vectorized_text',
]);

const SUPPORTED_DIVWAND_ROLES = new Set([
  'button',
  'text',
  'badge',
  'wrapper',
  'container',
  'card',
  'header',
  'content',
  'footer',
  'row',
  'glow-container',
]);

function readFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, name), 'utf8'));
}

function validateCommon(artifact, kind) {
  return artifact?.kind === kind && artifact.version === 1;
}

function validatePixelBrainStrict(artifact) {
  if (!validateCommon(artifact, KINDS.pixelbrain)) return false;
  const { canvas, coordinates } = artifact;
  if (!canvas || canvas.width <= 0 || canvas.height <= 0 || canvas.gridSize <= 0) return false;
  if (!Array.isArray(coordinates)) return false;
  return coordinates.every((coord) => {
    const x = coord.snappedX ?? coord.x;
    const y = coord.snappedY ?? coord.y;
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < canvas.width && y >= 0 && y < canvas.height;
  });
}

function validateWandStrict(artifact) {
  if (!validateCommon(artifact, KINDS.wand)) return false;
  const proposal = artifact.proposal;
  const proposedFormula = proposal?.proposedFormula ?? proposal;
  const formula = proposedFormula?.formula ?? {};
  return SUPPORTED_WAND_FORMULAS.has(formula.type);
}

function validateDivWandNode(node) {
  if (!node || !SUPPORTED_DIVWAND_ROLES.has(node.role ?? 'container')) return false;
  if (node.children != null && !Array.isArray(node.children)) return false;
  return (node.children ?? []).every(validateDivWandNode);
}

function validateDivWandStrict(artifact) {
  if (!validateCommon(artifact, KINDS.divwand)) return false;
  return validateDivWandNode(artifact.proposal?.proposedLayout ?? artifact.proposal);
}

describe('Godot importer strict fixture parity', () => {
  it('accepts exported PixelBrain fixtures that fit their canvas', () => {
    expect(validatePixelBrainStrict(readFixture('pixelbrain-basic.pbrain'))).toBe(true);
  });

  it('rejects PixelBrain coordinates outside canvas bounds', () => {
    expect(validatePixelBrainStrict(readFixture('pixelbrain-out-of-bounds.pbrain'))).toBe(false);
  });

  it('accepts Wand fixtures with a supported formula type', () => {
    expect(validateWandStrict(readFixture('wand-grid-projection-strict.wand'))).toBe(true);
  });

  it('rejects Wand shadow fixtures with unsupported formula shape in strict mode', () => {
    expect(validateWandStrict(readFixture('wand-linear.wand'))).toBe(false);
  });

  it('accepts DivWand fixtures using supported roles', () => {
    expect(validateDivWandStrict(readFixture('divwand-container.divwand'))).toBe(true);
  });

  it('rejects DivWand unsupported roles in strict mode', () => {
    expect(validateDivWandStrict(readFixture('divwand-unsupported-role.divwand'))).toBe(false);
  });
});
