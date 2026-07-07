import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADDON_ROOT = join(process.cwd(), 'addons/scholomance_godot_bridge');

function readAddonFile(path) {
  return readFileSync(join(ADDON_ROOT, path), 'utf8');
}

describe('Scholomance Godot bridge addon', () => {
  it('declares the Godot editor plugin', () => {
    const plugin = readAddonFile('plugin.cfg');

    expect(plugin).toContain('name="Scholomance Godot Bridge"');
    expect(plugin).toContain('script="scholomance_godot_bridge_plugin.gd"');
  });

  it('registers PixelBrain, Wand, DivWand, QBIT World, and frame importers', () => {
    const plugin = readAddonFile('scholomance_godot_bridge_plugin.gd');

    expect(plugin).toContain('importers/pixelbrain_importer.gd');
    expect(plugin).toContain('importers/wand_importer.gd');
    expect(plugin).toContain('importers/divwand_importer.gd');
    expect(plugin).toContain('importers/qbit_world_importer.gd');
    expect(plugin).toContain('importers/frame_timeline_importer.gd');
    expect(plugin.match(/add_import_plugin/g)).toHaveLength(5);
  });

  it('renders PixelBrain artifacts into ImageTexture scenes', () => {
    const renderer = readAddonFile('runtime/pixelbrain_renderer.gd');
    const importer = readAddonFile('importers/pixelbrain_importer.gd');

    expect(renderer).toContain('func render_pixelbrain_texture');
    expect(renderer).toContain('ImageTexture.create_from_image');
    expect(renderer).toContain('Sprite2D');
    expect(importer).toContain('ArtifactLoader.PIXELBRAIN_KIND');
  });

  it('keeps Wand and DivWand imports in shadow mode with warnings', () => {
    const wandBuilder = readAddonFile('runtime/wand_builder.gd');
    const divwandBuilder = readAddonFile('runtime/divwand_builder.gd');
    const readme = readAddonFile('README.md');

    expect(wandBuilder).toContain('push_warning');
    expect(wandBuilder).toContain('metadata-only scene');
    expect(divwandBuilder).toContain('unsupported DivWand role');
    expect(divwandBuilder).toContain('PanelContainer fallback');
    expect(readme).toContain('Shadow Mode');
  });

  it('exposes Phase 4 strict validation before scene creation', () => {
    const loader = readAddonFile('runtime/artifact_loader.gd');
    const pixelbrainImporter = readAddonFile('importers/pixelbrain_importer.gd');
    const wandImporter = readAddonFile('importers/wand_importer.gd');
    const divwandImporter = readAddonFile('importers/divwand_importer.gd');
    const readme = readAddonFile('README.md');

    expect(loader).toContain('func validate_pixelbrain_artifact');
    expect(loader).toContain('func validate_wand_artifact');
    expect(loader).toContain('func validate_divwand_artifact');
    expect(loader).toContain('SUPPORTED_VERSION := 1');
    expect(pixelbrainImporter).toContain('Strict Validation');
    expect(wandImporter).toContain('ERR_INVALID_DATA');
    expect(divwandImporter).toContain('strict_validation');
    expect(readme).toContain('Strict Validation');
  });

  it('uses specific artifact extensions so importers self-select', () => {
    const pixelbrainImporter = readAddonFile('importers/pixelbrain_importer.gd');
    const wandImporter = readAddonFile('importers/wand_importer.gd');
    const divwandImporter = readAddonFile('importers/divwand_importer.gd');

    expect(pixelbrainImporter).toContain('PackedStringArray(["pbrain"])');
    expect(wandImporter).toContain('PackedStringArray(["wand"])');
    expect(divwandImporter).toContain('PackedStringArray(["divwand"])');
  });

  it('validates PixelBrain color strings before calling Color.html', () => {
    const renderer = readAddonFile('runtime/pixelbrain_renderer.gd');

    expect(renderer).toContain('Color.html_is_valid');
    expect(renderer).toContain('invalid PixelBrain color');
    expect(renderer).toContain('Color.html(color_text)');
  });
});
