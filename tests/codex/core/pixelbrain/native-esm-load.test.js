import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Vitest's module transform does not enforce native ESM named-export linking,
 * so a broken `import { x } from ...` can pass every unit test while the CLI
 * and every plain-Node consumer crash at load (this exact failure shipped in
 * scdl/passes/lower-booleans.js). This test loads the public PixelBrain entry
 * modules in a real Node process so linking errors fail CI.
 */

// import.meta.url is http-scheme under vitest's jsdom transform; the vitest
// root is the repo root, so cwd-relative resolution is the stable choice.
const ROOT = process.cwd();
const ROOT_URL = `${pathToFileURL(ROOT).href}/`;

const ENTRY_MODULES = [
  'codex/core/pixelbrain/scdl/index.js',
  'codex/core/pixelbrain/semantic/index.js',
  'codex/core/pixelbrain/pixelbrain-asset-packet.js',
  'codex/core/pixelbrain/semantic-bridge.js',
  'codex/core/pixelbrain/semantic-registry.js',
  'codex/core/pixelbrain/pipeline-golden-corpus.js',
  'codex/core/pixelbrain/canonical-json.js',
  'codex/core/pixelbrain/pbrain-checksum.js',
  'codex/core/pixelbrain/color-codec.js',
  'codex/core/pixelbrain/item-foundry.js',
  'codex/core/pixelbrain/nl-compile.js',
  'codex/core/pixelbrain/edit-compiler.js',
  'codex/core/pixelbrain/foundry-aseprite-bridge.js',
  'codex/core/pixelbrain/template-grid-asset-bridge.js',
  'codex/core/pixelbrain/chunked-world-volume.js',
];

describe('native ESM linking', () => {
  it('loads every PixelBrain entry module in a real Node process', () => {
    const script = `
      const entries = ${JSON.stringify(ENTRY_MODULES)};
      const failures = [];
      await Promise.all(entries.map(async (entry) => {
        try { await import(new URL(entry, '${ROOT_URL}').href); }
        catch (e) { failures.push(entry + ': ' + e.message); }
      }));
      if (failures.length) { console.error(failures.join('\\n')); process.exit(1); }
    `;
    expect(() =>
      execFileSync('node', ['--input-type=module', '-e', script], { cwd: ROOT, stdio: 'pipe' })
    ).not.toThrow();
  }, 30000);
});
