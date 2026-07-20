/**
 * Phase 10 — Skia/CanvasKit adapter stub.
 * Deliberately does NOT import or fetch CanvasKit WASM.
 */

export type SkiaProbeResult = {
  available: false;
  loadsWasm: false;
  reason: string;
};

/**
 * Probe Skia availability. Always unavailable in Phase 10 (WASM skipped).
 */
export async function probeSkiaAdapter(): Promise<SkiaProbeResult> {
  return {
    available: false,
    loadsWasm: false,
    reason: 'Skia/CanvasKit WASM skipped for Phase 10 — unavailable by design',
  };
}
