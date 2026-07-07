/**
 * Deterministic JSON serialization for Godot bridge artifacts.
 * Object keys are sorted recursively so repeated exports remain byte-stable.
 */

function serializeJsonValue(value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return JSON.stringify(null);
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeJsonValue).join(',')}]`;
  }

  const entries = Object.keys(value)
    .filter((key) => {
      const entryValue = value[key];
      return entryValue !== undefined && typeof entryValue !== 'function' && typeof entryValue !== 'symbol';
    })
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeJsonValue(value[key])}`);

  return `{${entries.join(',')}}`;
}

export function serializeStable(value) {
  return serializeJsonValue(value);
}
