import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ANCHOR_MANIFESTS } from '../../../../../codex/core/pixelbrain/scdl/v2/amp-manifests/index.js';

const ROOT = resolve(process.cwd());
const CATALOG_SCRIPT = join(ROOT, 'scripts/pixelbrain-effect-catalog.mjs');
const SCDL_CLI = join(ROOT, 'codex/core/pixelbrain/scdl/scdl.cli.js');
const EFFECT_CATALOG_MD = join(ROOT, 'codex/core/pixelbrain/EFFECT_CATALOG.md');

describe('SCDL v2 Universal AMP Catalog Gate and CLI', () => {
  it('EFFECT_CATALOG.md contains the SCDL ABI column and anchor reporting', () => {
    expect(existsSync(EFFECT_CATALOG_MD)).toBe(true);
    const content = readFileSync(EFFECT_CATALOG_MD, 'utf8');
    expect(content).toContain('| SCDL ABI |');
    expect(content).toContain('PB-AMP-ABI-v1');
    expect(content).toContain('have SCDL PB-AMP-ABI-v1 manifests');
  });

  it('scripts/pixelbrain-effect-catalog.mjs --check-abi passes on committed manifests', () => {
    const out = execFileSync('node', [CATALOG_SCRIPT, '--check-abi'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(out).toContain(`All ${ANCHOR_MANIFESTS.length} PB-AMP-ABI-v1 manifests are valid.`);
  });

  it('scripts/pixelbrain-effect-catalog.mjs --check-abi fails on malformed manifest JSON', () => {
    const badManifestPath = join(ROOT, 'codex/core/pixelbrain/scdl/v2/amp-manifests/temp-broken.amp.json');
    try {
      writeFileSync(badManifestPath, '{ broken json: true ');
      let failed = false;
      try {
        execFileSync('node', [CATALOG_SCRIPT, '--check-abi'], {
          encoding: 'utf8',
          cwd: ROOT,
          stdio: 'pipe',
        });
      } catch (err) {
        failed = true;
        expect(err.status).toBe(1);
        const output = String(err.stderr || '') + String(err.stdout || '');
        expect(output).toContain('Malformed JSON');
      }
      expect(failed).toBe(true);
    } finally {
      try { unlinkSync(badManifestPath); } catch {}
    }
  });

  it('scripts/pixelbrain-effect-catalog.mjs --check succeeds and verifies ABI freshness', () => {
    const out = execFileSync('node', [CATALOG_SCRIPT, '--check'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(out).toContain('EFFECT_CATALOG.md is current');
  });

  it('scdl amps list --json returns all registered manifests', () => {
    const raw = execFileSync('node', [SCDL_CLI, 'amps', 'list', '--json'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(ANCHOR_MANIFESTS.length);
    const ids = parsed.map((m) => m.ampId);
    expect(ids).toContain('pixelbrain.facet');
    expect(ids).toContain('pixelbrain.pixel-aa');
    expect(ids).toContain('pixelbrain.image-segmentation');
    expect(ids).toContain('pixelbrain.gear-glide');
    expect(ids).toContain('pixelbrain.noise-fill');
  });

  it('scdl amps describe <amp-id> --json returns exact manifest fields', () => {
    const raw = execFileSync('node', [SCDL_CLI, 'amps', 'describe', 'pixelbrain.facet', '--json'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    const manifest = JSON.parse(raw);
    expect(manifest.ampId).toBe('pixelbrain.facet');
    expect(manifest.contract).toBe('PB-AMP-ABI-v1');
    expect(manifest.execution).toBe('COMPILE');
    expect(manifest.stage).toBe('SHAPE_POST');
    expect(manifest.order).toBe(40);
  });

  it('scdl amps validate passes on all manifests', () => {
    const out = execFileSync('node', [SCDL_CLI, 'amps', 'validate'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(out).toContain(`All ${ANCHOR_MANIFESTS.length} manifest(s) valid.`);
  });

  it('scdl amps plan <file> --json computes deterministic activation and dormant reasons', () => {
    const fixturePath = join(ROOT, 'codex/core/pixelbrain/scdl/v2/test-plan-fixture.scdl');
    const testScdl = `SCDL 2
ASSET plan_test
CANVAS WIDTH 32 HEIGHT 32

SELECT_AMPS PIPELINE render-fidelity

LAYER main ORDER 10 {
  PAINT (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8)) FILL #ff0000 RASTER CENTER
}
`;
    // Run via node inline or pass fixture
    const out = execFileSync('node', [
      '-e',
      `
      import { writeFileSync, unlinkSync } from 'node:fs';
      import { execFileSync } from 'node:child_process';
      const tmp = '${fixturePath.replace(/\\/g, '/')}';
      writeFileSync(tmp, ${JSON.stringify(testScdl)});
      try {
        const res = execFileSync('node', ['${SCDL_CLI.replace(/\\/g, '/')}', 'amps', 'plan', tmp, '--json'], { encoding: 'utf8' });
        console.log(res);
      } finally {
        try { unlinkSync(tmp); } catch {}
      }
      `
    ], { encoding: 'utf8', cwd: ROOT });

    const plan = JSON.parse(out);
    expect(plan.selectedAmps.length).toBeGreaterThanOrEqual(1);
    const pixelAa = plan.selectedAmps.find((a) => a.ampId === 'pixelbrain.pixel-aa');
    expect(pixelAa).toBeDefined();
    expect(pixelAa.activationReason).toContain('All relevance criteria satisfied');

    const dormant = plan.ampPlan.filter((p) => p.source === 'DORMANT');
    expect(dormant.length).toBeGreaterThanOrEqual(1);
    expect(dormant.some((d) => d.skipReason && d.skipReason.length > 0)).toBe(true);
  });

  it('scripts/pixelbrain-effect-catalog.mjs --check-abi detects and rejects mismatched checksums', () => {
    const badManifestPath = join(ROOT, 'codex/core/pixelbrain/scdl/v2/amp-manifests/temp-checksum-mismatch.amp.json');
    try {
      const goodFacet = JSON.parse(readFileSync(join(ROOT, 'codex/core/pixelbrain/scdl/v2/amp-manifests/pixelbrain.facet.amp.json'), 'utf8'));
      const tampered = { ...goodFacet, ampId: 'pixelbrain.temp-tampered', checksum: 'sha256-invalidbadhash000000000000000000000000000000000000000000000000' };
      writeFileSync(badManifestPath, JSON.stringify(tampered, null, 2));
      let failed = false;
      try {
        execFileSync('node', [CATALOG_SCRIPT, '--check-abi'], {
          encoding: 'utf8',
          cwd: ROOT,
          stdio: 'pipe',
        });
      } catch (err) {
        failed = true;
        expect(err.status).toBe(1);
        const output = String(err.stderr || '') + String(err.stdout || '');
        expect(output).toContain('checksum mismatch');
      }
      expect(failed).toBe(true);
    } finally {
      try { unlinkSync(badManifestPath); } catch {}
    }
  });

  it('guarantees JSON manifests in amp-manifests/ are strictly synchronized with JS ANCHOR_MANIFESTS', () => {
    const manifestsDir = join(ROOT, 'codex/core/pixelbrain/scdl/v2/amp-manifests');
    const jsonFiles = readdirSync(manifestsDir).filter((f) => f.endsWith('.amp.json'));
    expect(jsonFiles.length).toBe(ANCHOR_MANIFESTS.length);

    for (const file of jsonFiles) {
      const jsonContent = JSON.parse(readFileSync(join(manifestsDir, file), 'utf8'));
      const jsMatch = ANCHOR_MANIFESTS.find((m) => m.ampId === jsonContent.ampId);
      expect(jsMatch).toBeDefined();
      expect(jsonContent.checksum).toBe(jsMatch.checksum);
      expect(jsonContent.contract).toBe(jsMatch.contract);
      expect(jsonContent.execution).toBe(jsMatch.execution);
      expect(jsonContent.stage).toBe(jsMatch.stage);
    }
  });
});
