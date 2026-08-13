/** @vitest-environment jsdom */
/**
 * The WebGL probe's lifecycle.
 *
 * Asking "does this browser do WebGL?" costs a real GPU context, and browsers
 * cap how many a page may hold — Chrome evicts the OLDEST past the cap, which is
 * the live `<Canvas>` the probe exists to authorise. A probe that keeps its
 * context spends one of a small shared budget per mount and the symptom lands
 * somewhere else entirely: the spatial field goes black after N visits, with
 * nothing in this file to blame.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeWebGL } from '../../../src/pages/Constellation/ConstellationViewport3D.jsx';

const realGetContext = HTMLCanvasElement.prototype.getContext;

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.restoreAllMocks();
});

/** A context that records whether anyone asked for it back. */
function stubContext({ hasExtension = true } = {}) {
  const loseContext = vi.fn();
  const getExtension = vi.fn((name) =>
    (hasExtension && name === 'WEBGL_lose_context' ? { loseContext } : null));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension }));
  return { loseContext, getExtension };
}

describe('probeWebGL — the probe gives the context back', () => {
  it('releases the context it acquired on the success path', () => {
    const { loseContext } = stubContext();
    const result = probeWebGL();
    expect(result.ok).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('releases it once per call, so repeated mounts do not accumulate', () => {
    const { loseContext } = stubContext();
    probeWebGL();
    probeWebGL();
    probeWebGL();
    expect(loseContext).toHaveBeenCalledTimes(3);
  });

  it('still reports success when the release extension is unavailable', () => {
    // Releasing is best-effort: a browser without WEBGL_lose_context must not
    // turn a working GPU into a fallback render.
    const { loseContext } = stubContext({ hasExtension: false });
    expect(probeWebGL().ok).toBe(true);
    expect(loseContext).not.toHaveBeenCalled();
  });

  it('names the absence rather than reporting a bare false', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
    const result = probeWebGL();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no webgl2 or webgl context/i);
  });

  it('names a throwing context creation and carries the error', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => { throw new Error('blocklisted driver'); });
    const result = probeWebGL();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/blocklisted driver/);
    expect(result.error).toBeInstanceOf(Error);
  });
});
