import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
let reportPath;
let ledgerPath;

const report = {
  contract: 'PB-SEMANTIC-CYCLOTRON-REPORT-v1',
  schemaVersion: '1.0.0',
  seed: 1, requestedTrials: 10, completedTrials: 10,
  atomBankChecksum: 'atombank1:aaaa',
  groundingIndexChecksum: 'grnd1:bbbb',
  chemistryProvenance: { schema: 'PB-CONCEPT-CHEM-v1', version: 'v2', weights: { relation: 0.45 } },
  configuration: { maxMoleculeSize: 5 },
  control: { bar: 0.2, percentile: 0.99, samples: 2 },
  counts: { nuclei: 1, shortlisted: 2 },
  candidates: [{
    finalScore: 0.77,
    molecule: { atomIds: ['a', 'b'], energy: 0.7, novelty: 0.3, grounding: 0.7 },
    conceptChemistry: { feasibility: 0.6 },
  }],
  checksum: 'cyclotron1:deadbeef',
};

// These fixtures are synthetic and carry no real engine checksum, so every
// invocation passes --trust-report. The shell prints TRUSTED_REPORT_UNVERIFIED
// whenever that flag is used, so the exemption can never be silent.
const run = (args) => {
  try {
    const stdout = execFileSync('node',
      ['scripts/cyclotron-sensor.mjs', '--trust-report', ...args],
      { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status, stdout: String(error.stdout) + String(error.stderr) };
  }
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'c-sensor-'));
  reportPath = join(dir, 'report.json');
  ledgerPath = join(dir, 'ledger.json');
  writeFileSync(reportPath, JSON.stringify(report));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('cyclotron-sensor CLI', () => {
  it('reports NO_BASELINE and exits 0 when the ledger is absent', () => {
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/NO_BASELINE/);
  });

  it('refuses to approve without a reason', () => {
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve']);
    expect(code).toBe(2);
    expect(stdout).toMatch(/--reason/);
  });

  it('approves, then reports STABLE on the same report', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/STABLE/);
  });

  it('reports DEVIATION and exits 1 when an output moved under identical inputs', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    writeFileSync(reportPath, JSON.stringify({
      ...report, counts: { nuclei: 7, shortlisted: 2 }, checksum: 'cyclotron1:moved',
    }));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(1);
    expect(stdout).toMatch(/DEVIATION/);
    expect(stdout).toMatch(/count\.nuclei/);
  });

  it('ABSTAINs and exits 0 when an input changed', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    writeFileSync(reportPath, JSON.stringify({ ...report, seed: 999 }));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/ABSTAIN/);
    expect(stdout).toMatch(/seed/);
  });

  it('refuses to issue any verdict when the ledger self-seal is broken', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    const tampered = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    tampered.baselines[Object.keys(tampered.baselines)[0]].outputs['count.nuclei'] = 999;
    writeFileSync(ledgerPath, JSON.stringify(tampered));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(2);
    expect(stdout).toMatch(/LEDGER_SEAL_MISMATCH/);
    expect(stdout).not.toMatch(/STABLE/);
  });

  it('refuses a report with no chemistry provenance', () => {
    const { chemistryProvenance, ...stripped } = report;
    writeFileSync(reportPath, JSON.stringify(stripped));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(2);
    expect(stdout).toMatch(/NO_CHEMISTRY_PROVENANCE/);
  });

  it('keeps every superseded approval — re-approval never overwrites history', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    const afterFirst = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    expect(afterFirst.baselineHistory).toBeUndefined();
    const theClass = Object.keys(afterFirst.baselines)[0];

    // Same inputs (only outputs moved) → same input class → re-approval path.
    writeFileSync(reportPath, JSON.stringify({
      ...report, counts: { nuclei: 3, shortlisted: 2 }, checksum: 'cyclotron1:v2',
    }));
    const second = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=reactor v2']);
    expect(second.code).toBe(0);

    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    expect(ledger.baselineHistory?.[theClass]).toHaveLength(1);
    expect(ledger.baselineHistory[theClass][0].approval.reason).toBe('first baseline');
    expect(ledger.baselines[theClass].approval.reason).toBe('reactor v2');
    expect(ledger.baselines[theClass].approval.supersedes.reason).toBe('first baseline');

    // The seal covers the new history field — the ledger still verifies, and
    // the new baseline is immediately usable.
    const replay = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(replay.code).toBe(0);
    expect(replay.stdout).toMatch(/STABLE/);
  });
});
