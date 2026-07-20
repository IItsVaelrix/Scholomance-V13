/**
 * Phase 10 — renderer capability negotiation.
 * Skia WASM is intentionally unshipped; Vello remains experimental.
 */

import type { PbUiSceneV1 } from '../schema/packets';
import { CODES, diag, type ComposeDiagnostic } from '../validate/diagnostics';

export type RendererBackendId = 'dom' | 'canvas' | 'skia' | 'vello';

export type RendererBackendInfo = {
  id: RendererBackendId;
  available: boolean;
  /** True only if this backend would fetch a WASM binary at runtime. */
  loadsWasm: boolean;
  experimental?: boolean;
  capabilities: string[];
  description: string;
};

export type NegotiateRendererOptions = {
  preferred?: RendererBackendId[];
  /** When true, only backends advertising gpu/webgpu/skia-paint are eligible. */
  requireGpu?: boolean;
};

export type NegotiateRendererResult = {
  ok: boolean;
  selected: RendererBackendId | null;
  backends: RendererBackendInfo[];
  diagnostics: ComposeDiagnostic[];
};

export type NegotiateSceneResult = {
  ok: boolean;
  selected: RendererBackendId | null;
  diagnostics: ComposeDiagnostic[];
  unmetRequired: string[];
  unmetOptional: string[];
};

const DOM_CAPS = [
  'focusable-controls',
  'semantic-text',
  'native-dom',
  'css-flow',
] as const;

const CANVAS_CAPS = [
  'canvas-2d',
  'procedural-glow',
  'geometry-paint',
] as const;

/**
 * Static registry — no dynamic WASM imports here.
 */
export function listRendererBackends(): RendererBackendInfo[] {
  return [
    {
      id: 'dom',
      available: true,
      loadsWasm: false,
      capabilities: [...DOM_CAPS],
      description: 'Primary semantic DOM + CSS renderer',
    },
    {
      id: 'canvas',
      available: typeof document !== 'undefined',
      loadsWasm: false,
      capabilities: [...CANVAS_CAPS],
      description: 'HTML Canvas 2D for creative attachment hosts',
    },
    {
      id: 'skia',
      available: false,
      loadsWasm: false,
      capabilities: ['skia-paint', 'procedural-glow', 'geometry-paint'],
      description: 'CanvasKit/Skia — skipped for Phase 10 (no WASM)',
    },
    {
      id: 'vello',
      available: false,
      loadsWasm: false,
      experimental: true,
      capabilities: ['vello-scene', 'webgpu'],
      description: 'Vello/WebGPU — experimental, unshipped',
    },
  ];
}

function isGpuEligible(info: RendererBackendInfo): boolean {
  return info.capabilities.some(
    (c) => c.startsWith('gpu-') || c === 'webgpu' || c === 'skia-paint',
  );
}

/**
 * Pick an available backend from preference order; fall back to dom then canvas.
 */
export function negotiateRenderer(
  options: NegotiateRendererOptions = {},
): NegotiateRendererResult {
  const backends = listRendererBackends();
  const diagnostics: ComposeDiagnostic[] = [];
  const preferred = options.preferred?.length
    ? options.preferred
    : (['dom'] as RendererBackendId[]);

  const eligible = (info: RendererBackendInfo): boolean => {
    if (!info.available) return false;
    if (options.requireGpu) return isGpuEligible(info);
    return true;
  };

  for (const id of preferred) {
    const info = backends.find((b) => b.id === id);
    if (!info) continue;
    if (!info.available || !eligible(info)) {
      diagnostics.push(
        diag(
          CODES.RENDER_FALLBACK,
          'WARN',
          `Backend ${id} unavailable or ineligible; continuing negotiation`,
          {
            adapter: id,
            recovery: 'Use dom or canvas for attachment hosts',
          },
        ),
      );
      continue;
    }
    return { ok: true, selected: id, backends, diagnostics };
  }

  for (const id of ['dom', 'canvas'] as RendererBackendId[]) {
    const info = backends.find((b) => b.id === id);
    if (info && eligible(info)) {
      diagnostics.push(
        diag(
          CODES.RENDER_FALLBACK,
          'WARN',
          `Fell back to ${id} after preferred backends failed`,
          {
            adapter: id,
            recovery: 'Disable requireGpu or wait for opt-in creative backend',
          },
        ),
      );
      return { ok: true, selected: id, backends, diagnostics };
    }
  }

  diagnostics.push(
    diag(CODES.RENDER_FAIL, 'ERROR', 'No renderer backend available', {
      recovery: 'Ensure DOM environment is present',
    }),
  );
  return { ok: false, selected: null, backends, diagnostics };
}

/**
 * Negotiate a backend for a scene and check declared capability requirements
 * against the *selected* backend only (hybrid creative caps are mounted separately).
 */
export function negotiateSceneCapabilities(
  scene: PbUiSceneV1,
  options: NegotiateRendererOptions = {},
): NegotiateSceneResult {
  const negotiation = negotiateRenderer(options);
  const diagnostics = [...negotiation.diagnostics];
  const unmetRequired: string[] = [];
  const unmetOptional: string[] = [];
  const selectedInfo = negotiation.backends.find((b) => b.id === negotiation.selected);
  const provided = new Set(selectedInfo?.capabilities ?? []);

  for (const def of Object.values(scene.definitions)) {
    for (const cap of def.capabilities ?? []) {
      if (provided.has(cap.id)) continue;
      if (cap.required) {
        unmetRequired.push(cap.id);
        diagnostics.push(
          diag(CODES.REQUIRED_CAP, 'ERROR', `Required capability unmet: ${cap.id}`, {
            adapter: negotiation.selected ?? undefined,
            recovery: 'Select a backend that provides this capability or relax the requirement',
            context: { capability: cap.id, kind: def.kind },
          }),
        );
      } else {
        unmetOptional.push(cap.id);
        diagnostics.push(
          diag(CODES.OPTIONAL_CAP, 'WARN', `Optional capability unmet: ${cap.id}`, {
            adapter: negotiation.selected ?? undefined,
            recovery: 'Attachment may render without this enhancement',
            context: { capability: cap.id, kind: def.kind },
          }),
        );
      }
    }
  }

  return {
    ok: unmetRequired.length === 0 && negotiation.ok,
    selected: negotiation.selected,
    diagnostics,
    unmetRequired,
    unmetOptional,
  };
}
