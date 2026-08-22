/**
 * Shared traversal boundary for semantic indexing and lexical search fallback.
 * Directory names only: callers decide which authored file extensions to read.
 */
export const CODEBASE_IGNORED_DIRECTORY_NAMES = Object.freeze([
  '.cache',
  '.claude',
  '.git',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.tmp',
  '.tox',
  '.worktrees',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'dist-ssr',
  'node_modules',
  'output',
  'target',
  'venv',
]);

const IGNORED = new Set(CODEBASE_IGNORED_DIRECTORY_NAMES);

/**
 * `.venv-*` names are intentionally prefix-matched because this repository
 * carries task-specific virtual environments such as `.venv-align`.
 */
export function shouldIgnoreCodebaseDirectory(name) {
  return typeof name === 'string' && (IGNORED.has(name) || name.startsWith('.venv'));
}
