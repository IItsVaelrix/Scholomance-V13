import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADDON_ROOT = join(process.cwd(), 'addons/scholomance_godot_bridge');

function readAddonFile(path) {
  return readFileSync(join(ADDON_ROOT, path), 'utf8');
}

describe('Godot PixelBrain strict promotion (Phase 4)', () => {
  it('dock exposes use_strict_validation variable', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('var use_strict_validation');
  });

  it('strict mode defaults to false — shadow mode is still the out-of-box experience', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('var use_strict_validation := false');
  });

  it('toolbar exposes a CheckButton for toggling strict mode', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('CheckButton');
    expect(dock).toContain('use_strict_validation = on');
  });

  it('save_and_reimport passes use_strict_validation to save_to_path', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('save_to_path(path, use_strict_validation)');
  });

  it('artifact_loader validates out-of-bounds coordinates in strict mode', () => {
    const loader = readAddonFile('runtime/artifact_loader.gd');
    expect(loader).toContain('exceeds canvas bounds');
    expect(loader).toMatch(/_report\(.*strict_validation\)/);
  });

  it('artifact_loader validates required canvas fields in strict mode', () => {
    const loader = readAddonFile('runtime/artifact_loader.gd');
    expect(loader).toContain('canvas.%s must be a positive number');
  });

  it('strict validation rejects empty artifact — _report returns false when strict', () => {
    const loader = readAddonFile('runtime/artifact_loader.gd');
    expect(loader).toContain('return not strict_validation');
  });

  it('strict mode is available as a CheckButton with tooltip explaining its purpose', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('tooltip_text');
    expect(dock).toContain('recommended');
  });
});
