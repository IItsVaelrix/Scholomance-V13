import { describe, it, expect } from 'vitest';
import {
  createScrollEditorToolbarScene,
  renderSceneToDomSpec,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { CODES } from '../../../src/core/compose/validate/diagnostics';

describe('compose diagnostics + DOM adapter', () => {
  it('flags duplicate node ids as PB-UI-002', () => {
    const scene = createScrollEditorToolbarScene();
    scene.root.children = [
      { id: 'dup', kind: 'button' },
      { id: 'dup', kind: 'button' },
    ];
    const result = validateComposeScene(scene);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === CODES.DUPLICATE_ID)).toBe(true);
  });

  it('DOM spec keeps toolbar role when WAND ornament removed', () => {
    const withOrn = renderSceneToDomSpec(createScrollEditorToolbarScene({ includeWandOrnament: true }));
    const without = renderSceneToDomSpec(createScrollEditorToolbarScene({ includeWandOrnament: false }));
    expect(withOrn.tag).toBe(without.tag);
    expect(withOrn.attrs.role).toBe('toolbar');
    expect(without.attrs.role).toBe('toolbar');
    expect(withOrn.children.length).toBe(without.children.length);
    expect(withOrn.attachmentSlots.length).toBeGreaterThan(0);
    expect(without.attachmentSlots.length).toBe(0);
  });

  it('lowers toolbar buttons to button tags with labels', () => {
    const dom = renderSceneToDomSpec(createScrollEditorToolbarScene());
    const labels = dom.children.map((c) => c.text);
    expect(labels).toContain('Edit');
    expect(labels).toContain('Search');
    expect(dom.children.every((c) => c.tag === 'button')).toBe(true);
  });
});
