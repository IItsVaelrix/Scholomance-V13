/**
 * Truthful Typed Adapter for pixelbrain.school-tag.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable school tag affiliation descriptors.
 */

export const SchoolTagAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const school = typeof params.school === 'string' ? params.school : 'void';

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'SCHOOL_TAG',
      targetId,
      school,
    });
  },
});

export default SchoolTagAdapter;
