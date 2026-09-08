/**
 * Truthful Typed Adapter for pixelbrain.heraldry.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Constructs heraldic partitions and charges onto escutcheon geometry.
 */

export const HeraldryAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        heraldryApplied: false,
        charge: 'none',
      });
    }
    const charge = typeof params.charge === 'string' ? params.charge : 'lion';
    const division = typeof params.division === 'string' ? params.division : 'pale';

    return Object.freeze({
      ...geometry,
      heraldryApplied: true,
      charge,
      division,
      fieldPartition: division,
    });
  },
});

export default HeraldryAdapter;
