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
import { createAmpRelevanceRecord } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

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

/**
 * Hand-author a valid, checksummed v2 relevance record and register it via the
 * real CLI (same pattern the "refuses a tampered record" test already uses:
 * write a JSON file into the temp workDir, then `register` it). Registering
 * our own fixtures — rather than depending on `register-pilots` — is what lets
 * these new --pipeline tests run without the still-v1-shape real pilot files.
 */
function registerV2Fixture(overrides) {
  const record = createAmpRelevanceRecord({
    pipeline: 'item',
    ampId: 'fixture-amp',
    order: 1,
    description: 'Test fixture record.',
    concept: 'structural',
    version: '1.0.0',
    appliesTo: [],
    requires: [],
    ...overrides,
  });
  const file = join(workDir, `${record.ampId}.json`);
  writeFileSync(file, JSON.stringify(record));
  amps(['register', file]);
  return record;
}

describe('amp-substrate CLI', () => {
  it('reports an empty substrate honestly instead of pretending', () => {
    expect(amps(['list'])).toMatch(/no relevance records registered/);
    expect(amps(['select', 'specs/slime-staff.v1.json', '--pipeline', 'item'])).toMatch(/nothing can activate/);
  });

  // The five tests below call `register-pilots`, which registers the real
  // `codex/core/pixelbrain/amp-substrate/pilot-relevance/*.json` files. Task 6
  // migrated those files to PB-AMP-RELEVANCE-v2 shape, so `registerAmpRelevance`
  // now accepts every one of them and these run for real.
  //
  // Note: `symmetry-amp` moved to the `cross-cutting` pipeline as part of that
  // migration, so it no longer activates within the `item` pipeline `select`
  // calls below — the item pipeline now has only the 4 item-pipeline pilots.

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
    expect(out).toMatch(/chestplate-amp\s+order 8\s+v2\.0\.0/);
    expect(out).toMatch(/chestplate-amp[\s\S]*when: class eq armor AND archetype includes chestplate/);
    expect(out).toMatch(/symmetry-amp[\s\S]*when: always relevant/);
    expect(out).toMatch(/holyfire-motif-amp[\s\S]*OR/);
  });

  it('select separates activated from dormant, with a reason for every dormant amp', () => {
    amps(['register-pilots']);
    const specFile = join(workDir, 'chestplate.json');
    writeFileSync(specFile, JSON.stringify({ class: 'armor', archetype: 'void_chestplate', parts: [{ id: 'body' }] }));

    const out = amps(['select', specFile, '--pipeline', 'item']);
    expect(out).toMatch(/ACTIVATED \(1/);
    expect(out).toMatch(/✦ chestplate-amp/);
    expect(out).toMatch(/DORMANT \(3\)/);
    expect(out).toMatch(/shield-rim-amp\s+appliesTo did not match spec/);
  });

  it('select against a real repo spec activates only what that spec earns', () => {
    amps(['register-pilots']);
    // A real production spec that is NOT a chestplate or a kite shield.
    const out = amps(['select', 'specs/slime-staff.v1.json', '--pipeline', 'item']);
    expect(out).toMatch(/ACTIVATED \(0/);
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
    amps(['select', specFile, '--pipeline', 'item']);
    amps(['select', specFile, '--pipeline', 'item']);

    const stats = amps(['stats']);
    expect(stats).toMatch(/registered records : 5/);
    expect(stats).toMatch(/activation entries : 2/);
    // symmetry-amp now lives in the cross-cutting pipeline, so it never enters
    // an `item`-scoped select at all; shield-rim-amp and shield-volume-amp tie
    // at 2 each and the tie breaks alphabetically, making shield-rim-amp the
    // deterministic winner.
    expect(stats).toMatch(/most activated {5}: shield-rim-amp \(2×\)/);

    const log = amps(['log', '--limit', '5']);
    expect(log.trim().split('\n')).toHaveLength(2);
    expect(log).toMatch(/shield-rim-amp/);
  });

  // Not from the brief — a live sentinel, inverted now that Task 6 has
  // migrated pilot-relevance/ to v2: pins down that register-pilots succeeds
  // against the real files, so this file screams if a future change
  // regresses one of them back out of v2 shape.
  it('documents post-Task-6 state: register-pilots accepts the real v2-shape files', () => {
    const out = amps(['register-pilots']);
    expect(out).toMatch(/5\/5 pilot records registered/);
  });

  it("list --pipeline filters to only that pipeline's records", () => {
    registerV2Fixture({ ampId: 'region-fill-amp', pipeline: 'item', order: 10 });
    registerV2Fixture({ ampId: 'symmetry-amp', pipeline: 'cross-cutting', order: 1 });

    const out = amps(['list', '--pipeline', 'item']);
    expect(out).toMatch(/in pipeline 'item'/);
    expect(out).toContain('region-fill-amp');
    expect(out).not.toContain('symmetry-amp');
  });

  it('select requires --pipeline and refuses to run without it', () => {
    const out = amps(['select', 'specs/slime-staff.v1.json'], { expectFailure: true });
    expect(out).toMatch(/--pipeline/);
  });

  it("list --pipeline=value (equals-joined) filters the same as the space-separated form", () => {
    registerV2Fixture({ ampId: 'region-fill-amp', pipeline: 'item', order: 10 });
    registerV2Fixture({ ampId: 'symmetry-amp', pipeline: 'cross-cutting', order: 1 });

    const out = amps(['list', '--pipeline=item']);
    expect(out).toMatch(/in pipeline 'item'/);
    expect(out).toContain('region-fill-amp');
    expect(out).not.toContain('symmetry-amp');
  });

  it('select --pipeline=value (equals-joined) is honored, not silently ignored', () => {
    registerV2Fixture({ ampId: 'always-on-amp', pipeline: 'item', order: 1, appliesTo: [] });
    registerV2Fixture({ ampId: 'other-pipeline-amp', pipeline: 'cross-cutting', order: 1, appliesTo: [] });
    const specFile = join(workDir, 'spec.json');
    writeFileSync(specFile, JSON.stringify({ class: 'armor', archetype: 'chestplate', parts: [] }));

    const out = amps(['select', specFile, '--pipeline=item']);
    expect(out).toMatch(/pipeline 'item'/);
    expect(out).toMatch(/✦ always-on-amp/);
    expect(out).not.toContain('other-pipeline-amp');
  });

  it('select runs against a specific pipeline once --pipeline is given', () => {
    registerV2Fixture({ ampId: 'always-on-amp', pipeline: 'item', order: 1, appliesTo: [] });
    registerV2Fixture({ ampId: 'other-pipeline-amp', pipeline: 'cross-cutting', order: 1, appliesTo: [] });
    const specFile = join(workDir, 'spec.json');
    writeFileSync(specFile, JSON.stringify({ class: 'armor', archetype: 'chestplate', parts: [] }));

    const out = amps(['select', specFile, '--pipeline', 'item']);
    expect(out).toMatch(/pipeline 'item'/);
    expect(out).toMatch(/✦ always-on-amp/);
    // other-pipeline-amp belongs to a different pipeline entirely, so it must
    // not even appear as dormant for this selection — it isn't in scope.
    expect(out).not.toContain('other-pipeline-amp');
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
