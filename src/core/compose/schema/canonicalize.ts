/**
 * Deterministic JSON canonicalize for PB packet identity.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeysDeep(value[key]);
  }
  return out;
}

/** Stable JSON string (sorted keys, no incidental whitespace). */
export function canonicalizePacket(packet: unknown): string {
  return JSON.stringify(sortKeysDeep(packet));
}

/** scd64-style short checksum over canonical JSON. */
export function checksumCanonical(packet: unknown): string {
  const text = canonicalizePacket(packet);
  // FNV-1a 64-bit hex for deterministic short id (not crypto).
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return `scd64:${h.toString(16).padStart(16, '0')}`;
}

const FORBIDDEN_KEYS = new Set([
  '$$typeof',
  '_owner',
  '_store',
  'ref',
  'stateNode',
  '__reactFiber$',
]);

/** Ensure packet contains intent only — no React/DOM/machine handles. */
export function assertNoRuntimeLibraryObjects(packet: unknown, path = '$'): void {
  if (packet == null) return;
  if (typeof packet === 'function') {
    throw new Error(`Runtime function at ${path}`);
  }
  if (typeof Element !== 'undefined' && packet instanceof Element) {
    throw new Error(`DOM Element at ${path}`);
  }
  if (typeof packet !== 'object') return;
  if (Array.isArray(packet)) {
    packet.forEach((item, i) => assertNoRuntimeLibraryObjects(item, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(packet as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k) || k.startsWith('__react')) {
      throw new Error(`Forbidden runtime key ${k} at ${path}`);
    }
    // Constructors that must never appear
    if (v && typeof v === 'object' && 'constructor' in v) {
      const name = (v as { constructor?: { name?: string } }).constructor?.name;
      if (name && /^(HTML|SVG|React|Machine|Actor|Interpreter)/.test(name)) {
        throw new Error(`Forbidden runtime object ${name} at ${path}.${k}`);
      }
    }
    assertNoRuntimeLibraryObjects(v, `${path}.${k}`);
  }
}
