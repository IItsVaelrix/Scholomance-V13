import { canonicalStringify } from '../canonical-json.js';
import { fnv1a32Hex } from '../shared.js';

export function stableLayerHash(value) {
  return fnv1a32Hex(canonicalStringify(value));
}

export class TileForgeMicroprocessor {
  constructor({ id, version }) {
    this.id = id;
    this.version = version;
  }

  run({ intent, input, context }) {
    throw new Error("Microprocessor must implement run().");
  }
}
