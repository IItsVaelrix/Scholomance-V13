import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

describe('resolveDatabasePath', () => {
  let tempDir = null;
  let previousNodeEnv;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    vi.resetModules();
  });

  async function loadResolver({ nodeEnv }) {
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
    vi.resetModules();
    return import('../../codex/server/utils/pathResolution.js');
  }

  it('honors an explicit absolute path that exists in production (do not prefer stale /var/data)', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'path-resolution-'));
    const baked = path.join(tempDir, 'scholomance_dict.sqlite');
    writeFileSync(baked, 'rich');

    // Simulate a stale volume file without patching real /var/data: the resolver
    // must return the explicit baked path when it exists, regardless of volume.
    const { resolveDatabasePath } = await loadResolver({ nodeEnv: 'production' });
    expect(resolveDatabasePath(baked, 'scholomance_dict.sqlite')).toBe(baked);
  });

  it('resolves relative paths in non-production without volume hijack', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'path-resolution-dev-'));
    const local = path.join(tempDir, 'scholomance_dict.sqlite');
    writeFileSync(local, 'dev');
    mkdirSync(tempDir, { recursive: true });

    const { resolveDatabasePath } = await loadResolver({ nodeEnv: 'development' });
    const cwd = process.cwd();
    try {
      process.chdir(tempDir);
      expect(resolveDatabasePath('./scholomance_dict.sqlite', 'scholomance_dict.sqlite')).toBe(
        path.resolve(tempDir, 'scholomance_dict.sqlite'),
      );
    } finally {
      process.chdir(cwd);
    }
  });
});
