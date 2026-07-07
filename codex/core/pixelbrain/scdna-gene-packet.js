import crypto from 'node:crypto';

export function createSCDNAGenePacket(input) {
  const coordinates = normalizeCoordinates(input.coordinates);

  const packet = {
    contract: 'PB-SCDNA-GENE-v1',
    version: '1.0.0',
    assetId: String(input.assetId),
    geneId: String(input.geneId),
    geneType: String(input.geneType),
    canvas: {
      width: toInt(input.canvas?.width),
      height: toInt(input.canvas?.height),
    },
    bounds: input.bounds ?? computeBounds(coordinates),
    role: input.role ?? 'unknown',
    materialHint: input.materialHint ?? 'source',
    paletteRoles: Object.freeze([...(input.paletteRoles ?? [])].sort()),
    coordinates: Object.freeze(coordinates),
    geometryHints: Object.freeze(input.geometryHints ?? {}),
  };

  return Object.freeze({
    ...packet,
    checksum: checksumStableJSON(packet),
  });
}

export function createSCDNAGeneReadyHealthEvent(packet, payloadRef) {
  return Object.freeze({
    code: 'PB-OK-v1-SCDNA-GENE-READY',
    status: 'OK',
    assetId: packet.assetId,
    geneId: packet.geneId,
    geneType: packet.geneType,
    payloadRef,
    checksum: packet.checksum,
    byteLength: JSON.stringify(packet).length,
  });
}

function normalizeCoordinates(coordinates) {
  return [...(coordinates ?? [])]
    .map((cell) => ({
      x: toInt(cell.x),
      y: toInt(cell.y),
      color: String(cell.color).toUpperCase(),
      role: cell.role ? String(cell.role) : undefined,
      partId: cell.partId ? String(cell.partId) : undefined,
      isMotif: Boolean(cell.isMotif),
    }))
    .sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      if ((a.role ?? '') !== (b.role ?? '')) return (a.role ?? '').localeCompare(b.role ?? '');
      return a.color.localeCompare(b.color);
    });
}

function checksumStableJSON(value) {
  const json = stableStringify(value);
  const hash = crypto.createHash('sha256').update(json).digest('base64url').replace(/[^a-zA-Z0-9]/g, '');
  return `scd64:${hash.padEnd(64, '0').slice(0, 64)}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => {
      return `${JSON.stringify(key)}:${stableStringify(value[key])}`;
    }).join(',')}}`;
  }
  return JSON.stringify(value);
}

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function computeBounds(coordinates) {
  if (coordinates.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  const xs = coordinates.map((c) => c.x);
  const ys = coordinates.map((c) => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}
