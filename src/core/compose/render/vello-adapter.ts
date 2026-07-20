/**
 * Phase 10 — Vello/WebGPU experimental stub (unshipped).
 */

export type VelloProbeResult = {
  available: false;
  loadsWasm: false;
  experimental: true;
  reason: string;
};

/**
 * Probe Vello availability. Always experimental + unavailable.
 */
export async function probeVelloAdapter(): Promise<VelloProbeResult> {
  return {
    available: false,
    loadsWasm: false,
    experimental: true,
    reason: 'Vello/WebGPU remains experimental and unshipped',
  };
}
