import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const run = (args) => {
  try {
    execFileSync('node', ['scripts/semantic-valence-cyclotron.mjs', ...args],
      { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stderr: '' };
  } catch (error) {
    return { code: error.status, stderr: String(error.stderr) };
  }
};

describe('semantic-valence-cyclotron runner output guard', () => {
  it('refuses a non-default trial count without --out', () => {
    const { code, stderr } = run(['--trials=10']);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/--out is required/);
  });
});
