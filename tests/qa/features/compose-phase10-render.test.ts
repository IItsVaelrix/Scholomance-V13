/**
 * PDR Phase 10 — Advanced Rendering (Skia WASM skipped)
 *
 * Capability negotiation, hybrid DOM attachment hosts, canvas 2d fallback,
 * Skia/Vello stubs that never load WASM, semantic geometry parity.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { featureFlags, COMPOSE_FLAGS } from '../../../src/core/compose/flags';
import { CODES } from '../../../src/core/compose/validate/diagnostics';
import { createScrollEditorToolbarScene } from '../../../src/core/compose/packets';
import {
  negotiateRenderer,
  negotiateSceneCapabilities,
  listRendererBackends,
  type RendererBackendId,
} from '../../../src/core/compose/render/capabilities';
import {
  mountHybridAttachment,
  collectSceneAttachments,
  type HybridHostOptions,
} from '../../../src/core/compose/render/hybrid-host';
import {
  compareSemanticGeometry,
  type SemanticGeometry,
} from '../../../src/core/compose/render/geometry';
import { probeSkiaAdapter } from '../../../src/core/compose/render/skia-adapter';
import { probeVelloAdapter } from '../../../src/core/compose/render/vello-adapter';
import { createRenderer } from '../../../src/core/compose/render';

describe('Compose Phase 10 — capability negotiation', () => {
  beforeEach(() => {
    featureFlags.clear();
  });

  it('lists backends with dom/canvas available and skia/vello unavailable', () => {
    const backends = listRendererBackends();
    const byId = Object.fromEntries(backends.map((b) => [b.id, b]));
    expect(byId.dom?.available).toBe(true);
    expect(byId.canvas?.available).toBe(true);
    expect(byId.skia?.available).toBe(false);
    expect(byId.vello?.available).toBe(false);
    expect(byId.skia?.loadsWasm).toBe(false);
    expect(byId.vello?.experimental).toBe(true);
  });

  it('prefers dom for ordinary semantic UI', () => {
    const result = negotiateRenderer({
      preferred: ['skia', 'dom'],
      requireGpu: false,
    });
    expect(result.selected).toBe('dom');
    expect(result.diagnostics.some((d) => d.code === CODES.RENDER_FALLBACK)).toBe(true);
  });

  it('selects canvas when preferred and available', () => {
    const result = negotiateRenderer({ preferred: ['canvas'] });
    expect(result.selected).toBe('canvas');
    expect(result.ok).toBe(true);
  });

  it('never selects skia or vello (WASM skipped / experimental)', () => {
    for (const preferred of [['skia'], ['vello'], ['skia', 'vello']] as RendererBackendId[][]) {
      const result = negotiateRenderer({ preferred });
      expect(result.selected).not.toBe('skia');
      expect(result.selected).not.toBe('vello');
      expect(['dom', 'canvas', null]).toContain(result.selected);
    }
  });

  it('emits PB-UI-007 when a required capability is unmet', () => {
    const scene = createScrollEditorToolbarScene();
    // Inject a required capability that no backend claims
    scene.definitions['toolbar'].capabilities = [
      { id: 'gpu-raytrace', required: true },
    ];
    const result = negotiateSceneCapabilities(scene, { preferred: ['dom'] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === CODES.REQUIRED_CAP)).toBe(true);
  });

  it('emits PB-UI-006 when an optional capability is unmet', () => {
    const scene = createScrollEditorToolbarScene();
    const result = negotiateSceneCapabilities(scene, { preferred: ['dom'] });
    // toolbar declares optional procedural-glow
    expect(result.diagnostics.some((d) => d.code === CODES.OPTIONAL_CAP)).toBe(true);
    expect(result.ok).toBe(true);
  });
});

describe('Compose Phase 10 — Skia/Vello stubs (no WASM)', () => {
  it('probeSkiaAdapter reports unavailable and does not load WASM', async () => {
    const probe = await probeSkiaAdapter();
    expect(probe.available).toBe(false);
    expect(probe.loadsWasm).toBe(false);
    expect(probe.reason).toMatch(/skipped|unshipped|unavailable/i);
  });

  it('probeVelloAdapter reports experimental and unavailable', async () => {
    const probe = await probeVelloAdapter();
    expect(probe.available).toBe(false);
    expect(probe.experimental).toBe(true);
    expect(probe.loadsWasm).toBe(false);
  });

  it('createRenderer(skia) returns a disposer that never paints via WASM', () => {
    const renderer = createRenderer('skia');
    expect(renderer).toBeDefined();
    const canvas = document.createElement('canvas');
    expect(() =>
      renderer.render(
        { root: { id: 'r', type: 'rectangle', width: 10, height: 10 }, version: '1' } as any,
        { target: 'skia', canvas },
      ),
    ).not.toThrow();
    renderer.destroy();
  });
});

describe('Compose Phase 10 — hybrid DOM attachment host', () => {
  beforeEach(() => {
    featureFlags.clear();
    document.body.innerHTML = '';
  });

  it('collects wand attachments from toolbar scene', () => {
    const scene = createScrollEditorToolbarScene({ includeWandOrnament: true });
    const attachments = collectSceneAttachments(scene);
    expect(attachments.some((a) => a.kind === 'wand')).toBe(true);
  });

  it('mounts wand attachment into a hybrid host with semantic geometry', () => {
    const scene = createScrollEditorToolbarScene({ includeWandOrnament: true });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const [wand] = collectSceneAttachments(scene).filter((a) => a.kind === 'wand');

    const result = mountHybridAttachment(host, wand, {
      widthPx: 24,
      heightPx: 24,
    } satisfies HybridHostOptions);

    expect(result.ok).toBe(true);
    expect(result.geometry).toEqual({
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
    expect(host.querySelector('[data-compose-hybrid="true"]')).toBeTruthy();
    expect(result.backend === 'canvas' || result.backend === 'dom').toBe(true);
  });

  it('falls back with PB-RENDER-002 when preferred backend unavailable', () => {
    const scene = createScrollEditorToolbarScene({ includeWandOrnament: true });
    const host = document.createElement('div');
    const [wand] = collectSceneAttachments(scene).filter((a) => a.kind === 'wand');

    const result = mountHybridAttachment(host, wand, {
      widthPx: 16,
      heightPx: 16,
      preferredBackend: 'skia',
    });

    expect(result.diagnostics.some((d) => d.code === CODES.RENDER_FALLBACK)).toBe(true);
    expect(result.backend).not.toBe('skia');
  });
});

describe('Compose Phase 10 — semantic geometry parity (visual regression contract)', () => {
  it('passes when geometries match within tolerance', () => {
    const a: SemanticGeometry = { x: 0, y: 0, width: 100, height: 40 };
    const b: SemanticGeometry = { x: 0.4, y: -0.3, width: 100.2, height: 39.8 };
    const cmp = compareSemanticGeometry(a, b, { tolerancePx: 1 });
    expect(cmp.ok).toBe(true);
    expect(cmp.maxDelta).toBeLessThanOrEqual(1);
  });

  it('fails when geometries diverge beyond tolerance', () => {
    const a: SemanticGeometry = { x: 0, y: 0, width: 100, height: 40 };
    const b: SemanticGeometry = { x: 0, y: 0, width: 120, height: 40 };
    const cmp = compareSemanticGeometry(a, b, { tolerancePx: 1 });
    expect(cmp.ok).toBe(false);
    expect(cmp.diffs.some((d) => d.field === 'width')).toBe(true);
  });
});

describe('Compose Phase 10 — render flag gating', () => {
  beforeEach(() => {
    featureFlags.clear();
  });

  it('creative render path stays off until compose:render is enabled', () => {
    expect(featureFlags.isEnabled(COMPOSE_FLAGS.RENDER)).toBe(false);
    featureFlags.enable(COMPOSE_FLAGS.RENDER);
    expect(featureFlags.isEnabled(COMPOSE_FLAGS.RENDER)).toBe(true);
  });
});
