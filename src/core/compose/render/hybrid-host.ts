/**
 * Phase 10 — hybrid DOM host for WAND/SCDL visual attachment slots.
 * Semantic DOM owns the host; canvas 2d may paint inside when available.
 * Skia is never selected (WASM skipped).
 */

import type { PbUiSceneV1, VisualAttachment } from '../schema/packets';
import { CODES, diag, type ComposeDiagnostic } from '../validate/diagnostics';
import {
  negotiateRenderer,
  type RendererBackendId,
} from './capabilities';
import type { SemanticGeometry } from './geometry';

export type SceneAttachment = VisualAttachment & {
  visualId: string;
};

export type HybridHostOptions = {
  widthPx: number;
  heightPx: number;
  preferredBackend?: RendererBackendId;
};

export type HybridMountResult = {
  ok: boolean;
  backend: RendererBackendId;
  geometry: SemanticGeometry;
  diagnostics: ComposeDiagnostic[];
  element: HTMLElement | null;
};

/**
 * Collect visual attachments from a scene with their visualIds.
 */
export function collectSceneAttachments(scene: PbUiSceneV1): SceneAttachment[] {
  return Object.entries(scene.visuals).map(([visualId, visual]) => ({
    ...visual,
    visualId,
  }));
}

function paintWandPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  formulaId: string,
): void {
  ctx.clearRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, 'hsla(190, 70%, 55%, 0.35)');
  grad.addColorStop(1, 'hsla(43, 48%, 48%, 0.45)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'hsla(43, 48%, 60%, 0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Keep formulaId out of painted pixels as text (geometry-only contract);
  // stash on canvas dataset via caller.
  void formulaId;
}

/**
 * Mount a visual attachment into a DOM host.
 * Preference: canvas (creative) → dom placeholder. Skia/Vello never win.
 */
export function mountHybridAttachment(
  host: HTMLElement,
  attachment: SceneAttachment,
  options: HybridHostOptions,
): HybridMountResult {
  const diagnostics: ComposeDiagnostic[] = [];
  const geometry: SemanticGeometry = {
    x: 0,
    y: 0,
    width: options.widthPx,
    height: options.heightPx,
  };

  const preferred: RendererBackendId[] = options.preferredBackend
    ? [options.preferredBackend, 'canvas', 'dom']
    : ['canvas', 'dom'];

  const negotiation = negotiateRenderer({ preferred });
  diagnostics.push(...negotiation.diagnostics);

  let backend: RendererBackendId = negotiation.selected ?? 'dom';
  if (backend === 'skia' || backend === 'vello') {
    backend = 'canvas';
    diagnostics.push(
      diag(CODES.RENDER_FALLBACK, 'WARN', 'Creative GPU backend refused; using canvas/dom', {
        adapter: backend,
      }),
    );
  }

  host.replaceChildren();

  const shell = document.createElement('div');
  shell.setAttribute('data-compose-hybrid', 'true');
  shell.setAttribute('data-compose-visual', attachment.visualId);
  shell.setAttribute('data-compose-kind', attachment.kind);
  shell.setAttribute('data-compose-slot', attachment.placementSlot);
  shell.setAttribute('aria-hidden', 'true');
  shell.style.width = `${geometry.width}px`;
  shell.style.height = `${geometry.height}px`;
  shell.style.display = 'inline-block';
  shell.style.position = 'relative';

  if (backend === 'canvas' && attachment.kind === 'wand') {
    const canvas = document.createElement('canvas');
    canvas.width = geometry.width;
    canvas.height = geometry.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.dataset.formulaId = attachment.formulaId;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      paintWandPlaceholder(ctx, geometry.width, geometry.height, attachment.formulaId);
      shell.appendChild(canvas);
      host.appendChild(shell);
      return { ok: true, backend: 'canvas', geometry, diagnostics, element: shell };
    }
    diagnostics.push(
      diag(CODES.RENDER_FALLBACK, 'WARN', 'Canvas 2D context unavailable; using DOM host', {
        adapter: 'canvas',
        recovery: 'Render empty semantic host',
      }),
    );
    backend = 'dom';
  }

  // DOM host (native-dom, token, scdl-asset, or canvas fallback)
  if (attachment.kind === 'native-dom' && attachment.className) {
    shell.className = attachment.className;
  }
  if (attachment.kind === 'wand') {
    shell.dataset.formulaId = attachment.formulaId;
    shell.dataset.composeRole = attachment.role;
  }
  if (attachment.kind === 'token') {
    shell.dataset.tokenPath = attachment.tokenPath;
  }
  if (attachment.kind === 'scdl-asset') {
    shell.dataset.packetId = attachment.packetId;
  }

  host.appendChild(shell);
  return { ok: true, backend: 'dom', geometry, diagnostics, element: shell };
}
