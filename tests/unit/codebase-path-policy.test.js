import { describe, expect, it } from 'vitest';
import { shouldIgnoreCodebaseDirectory } from '../../codex/core/codebase-path-policy.js';

describe('shouldIgnoreCodebaseDirectory', () => {
  it.each([
    'node_modules',
    '.git',
    'dist',
    'dist-ssr',
    'build',
    'coverage',
    'target',
    'venv',
    '.venv',
    '.venv-align',
    '.worktrees',
    '__pycache__',
    '.pytest_cache',
    '.tox',
  ])('excludes generated or dependency directory %s', (name) => {
    expect(shouldIgnoreCodebaseDirectory(name)).toBe(true);
  });

  it.each(['codex', 'constellation', 'steamdeck_brain', 'docs', 'src'])(
    'retains authored directory %s',
    (name) => {
      expect(shouldIgnoreCodebaseDirectory(name)).toBe(false);
    },
  );

  it('does not coerce non-string path segments', () => {
    expect(shouldIgnoreCodebaseDirectory(null)).toBe(false);
    expect(shouldIgnoreCodebaseDirectory({ toString: () => 'venv' })).toBe(false);
  });
});
