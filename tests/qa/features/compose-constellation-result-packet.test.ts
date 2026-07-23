/**
 * ConstellationResult PB scene — the answer plate's presentation contract.
 *
 * Unlike the sky (a presentation backdrop), the result plate is the ANSWER, so
 * its packet is a full anatomical contract: six declared channels, four honest
 * states, token-bound visuals. These tests pin the contract so a change to the
 * presentation anatomy is a deliberate re-seal, not an accident.
 */
import { describe, it, expect } from 'vitest';
import {
  createConstellationResultScene,
  createConstellationResultDefinition,
  CONSTELLATION_RESULT_KIND,
  CONSTELLATION_RESULT_ID,
  CONSTELLATION_RESULT_VERSION,
  RESULT_PARTS,
  canonicalizePacket,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';

/**
 * Frozen golden checksum. The scene is a pure function of frozen constants, so
 * this value is stable across environments and builds. If you intentionally
 * change the plate anatomy, re-seal by updating this constant (and say why).
 */
const GOLDEN_CHECKSUM = 'scd64:672f55146b2753a4';

describe('ConstellationResult PB scene (answer plate contract)', () => {
  it('emits a PB-UI-SCENE-v1 whose children are the six declared plates, in order', () => {
    const scene = createConstellationResultScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe(CONSTELLATION_RESULT_KIND);
    expect(scene.root.id).toBe(CONSTELLATION_RESULT_ID);

    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual(
      RESULT_PARTS.map((p) => `${CONSTELLATION_RESULT_ID}.${p.id}`),
    );
    // Order is load-bearing: identity → meaning → sound → genome → verdict → seal.
    expect(ids).toEqual([
      'constellation-result.hero-figure',
      'constellation-result.masthead',
      'constellation-result.meaning-field',
      'constellation-result.sound-field',
      'constellation-result.genome-field',
      'constellation-result.verdict-field',
      'constellation-result.provenance-seal',
    ]);
  });

  it('validates cleanly and carries no runtime library objects', () => {
    const scene = createConstellationResultScene();
    expect(validateComposeScene(scene).ok).toBe(true);
    expect(() => assertNoRuntimeLibraryObjects(scene)).not.toThrow();
  });

  it('declares the four honest-refusal states with safe defaults', () => {
    const def = createConstellationResultDefinition();
    const states = Object.fromEntries(def.states.map((s) => [s.name, s.default]));
    expect(states).toEqual({
      reducedMotion: false,
      degraded: false,
      heteronym: false,
      evidenced: false,
    });
    // The scene root initialises every declared state.
    const scene = createConstellationResultScene();
    expect(scene.root.state).toEqual(states);
  });

  it('requires semantic-text but treats glow/choreography as optional capabilities', () => {
    const def = createConstellationResultDefinition();
    const caps = Object.fromEntries((def.capabilities ?? []).map((c) => [c.id, c.required]));
    expect(caps['semantic-text']).toBe(true);
    expect(caps['deterministic-choreography']).toBe(false);
    expect(caps['procedural-glow']).toBe(false);
  });

  it('binds visuals to design tokens, never raw hex', () => {
    const scene = createConstellationResultScene();
    const visualKinds = Object.values(scene.visuals).map((v) => v.kind);
    expect(visualKinds.every((k) => k === 'token')).toBe(true);
    // Every visualRef on the root resolves to a declared visual.
    for (const ref of scene.root.visualRefs ?? []) {
      expect(scene.visuals[ref]).toBeTruthy();
    }
  });

  it('declares both layout intents (plate stack + field grid) and references them', () => {
    const scene = createConstellationResultScene();
    expect(scene.layouts['result-plate-stack']?.mode).toBe('flow');
    expect(scene.layouts['result-field-grid']?.mode).toBe('grid');
    expect(scene.root.layoutRef).toBe('result-plate-stack');
    // The two analysis fields share the grid; the rest stack full-width.
    const byId = Object.fromEntries((scene.root.children ?? []).map((c) => [c.id, c]));
    expect(byId['constellation-result.meaning-field'].layoutRef).toBe('result-field-grid');
    expect(byId['constellation-result.sound-field'].layoutRef).toBe('result-field-grid');
    expect(byId['constellation-result.masthead'].layoutRef).toBeUndefined();
  });

  it('is deterministic: two emissions canonicalize identically and match the golden checksum', () => {
    const a = createConstellationResultScene();
    const b = createConstellationResultScene();
    expect(canonicalizePacket(a)).toBe(canonicalizePacket(b));
    expect(a.sourceChecksum).toBe(b.sourceChecksum);
    expect(a.sourceChecksum).toBe(GOLDEN_CHECKSUM);
  });

  it('stamps the contract version on the root for the shell to render', () => {
    const scene = createConstellationResultScene();
    expect(scene.root.props?.version).toBe(CONSTELLATION_RESULT_VERSION);
    expect(scene.root.props?.['aria-labelledby']).toBe('cos-masthead-query');
  });
});
