/**
 * CLI (PDR §3.1 F5).
 *
 * Runs the real script as a subprocess against a throwaway database — the same
 * way a person runs it — rather than importing its internals, so the verbs are
 * tested as an actual interface.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'scripts/amp-substrate-cli.mjs');
const PILOT_DIR = resolve(process.cwd(), 'codex/core/pixelbrain/amp-substrate/pilot-relevance');

let workDir;
let dbFile;

function amps(args, { expectFailure = false } = {}) {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, AMP_SUBSTRATE_DB: dbFile },
    });
  } catch (err) {
    if (expectFailure) return `${err.stdout ?? ''}${err.stderr ?? ''}`;
    throw new Error(`amps ${args.join(' ')} failed:\n${err.stdout ?? ''}\n${err.stderr ?? ''}`);
  }
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'amp-cli-'));
  dbFile = join(workDir, 'substrate.sqlite');
});
afterEach(() => { rmSync(workDir, { recursive: true, force: true }); });

describe('amp-substrate CLI', () => {
  it('reports an empty substrate honestly instead of pretending', () => {
    expect(amps(['list'])).toMatch(/no relevance records registered/);
    expect(amps(['select', 'specs/slime-staff.v1.json'])).toMatch(/nothing can activate/);
  });

  it('register-pilots registers all five pilot records', () => {
    const out = amps(['register-pilots']);
    expect(out).toMatch(/5\/5 pilot records registered/);
    for (const ampId of ['chestplate-amp', 'shield-rim-amp', 'shield-volume-amp', 'holyfire-motif-amp', 'symmetry-amp']) {
      expect(out).toContain(ampId);
    }
  });

  it('list prints each record with its gate rendered in plain English', () => {
    amps(['register-pilots']);
    const out = amps(['list']);
    expect(out).toMatch(/5 registered record\(s\)/);
    expect(out).toMatch(/chestplate-amp\s+v1\.0\.0\s+[0-9a-f]{8}…/);
    expect(out).not.toMatch(/chestplate-amp\s+v1\.0\.0\s+[0-9a-f]{9,}…/);
    expect(out).toMatch(/chestplate-amp[\s\S]*when: class eq armor AND archetype includes chestplate/);
    expect(out).toMatch(/symmetry-amp[\s\S]*when: always relevant/);
    expect(out).toMatch(/holyfire-motif-amp[\s\S]*OR/);
  });

  it('select separates activated from dormant, with a reason for every dormant amp', () => {
    amps(['register-pilots']);
    const specFile = join(workDir, 'chestplate.json');
    writeFileSync(specFile, JSON.stringify({ class: 'armor', archetype: 'void_chestplate', parts: [{ id: 'body' }] }));

    const out = amps(['select', specFile]);
    expect(out).toMatch(/ACTIVATED \(2\)/);
    expect(out).toMatch(/✦ chestplate-amp/);
    expect(out).toMatch(/✦ symmetry-amp/);
    expect(out).toMatch(/DORMANT \(3\)/);
    expect(out).toMatch(/shield-rim-amp\s+appliesTo did not match spec/);
  });

  it('select against a real repo spec activates only what that spec earns', () => {
    amps(['register-pilots']);
    // A real production spec that is NOT a chestplate or a kite shield.
    const out = amps(['select', 'specs/slime-staff.v1.json']);
    expect(out).toMatch(/✦ symmetry-amp/);
    expect(out).not.toMatch(/✦ chestplate-amp/);
    expect(out).not.toMatch(/✦ shield-rim-amp/);
  });

  it('refuses a tampered record and prints the validation errors, not a stack trace', () => {
    const badFile = join(workDir, 'bad.json');
    const good = JSON.parse(
      execFileSync('node', ['-e', `process.stdout.write(require('fs').readFileSync('${PILOT_DIR}/chestplate-amp.json','utf8'))`], { encoding: 'utf8' }),
    );
    writeFileSync(badFile, JSON.stringify({ ...good, version: '9.9.9' })); // checksum now stale

    const out = amps(['register', badFile], { expectFailure: true });
    expect(out).toMatch(/refused bad\.json/);
    expect(out).toMatch(/checksum: declared/);
    expect(amps(['list'])).toMatch(/no relevance records registered/);
  });

  it('stats and log reflect real activity', () => {
    amps(['register-pilots']);
    const specFile = join(workDir, 'shield.json');
    writeFileSync(specFile, JSON.stringify({ class: 'armor', archetype: 'kite_shield', parts: [] }));
    amps(['select', specFile]);
    amps(['select', specFile]);

    const stats = amps(['stats']);
    expect(stats).toMatch(/registered records : 5/);
    expect(stats).toMatch(/activation entries : 2/);
    expect(stats).toMatch(/most activated {5}: (shield-rim-amp|shield-volume-amp|symmetry-amp) \(2×\)/);

    const log = amps(['log', '--limit', '5']);
    expect(log.trim().split('\n')).toHaveLength(2);
    expect(log).toMatch(/shield-rim-amp/);
  });

  it('rejects an unknown command and prints usage', () => {
    const out = amps(['frobnicate'], { expectFailure: true });
    expect(out).toMatch(/unknown command 'frobnicate'/);
    expect(out).toMatch(/Usage:/);
  });

  it('help works without touching a database', () => {
    expect(amps(['help'])).toMatch(/AMP Activation Substrate CLI/);
  });
});
