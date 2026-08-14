import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  computePbrainChecksumFromText,
  verifyPbrainText,
  stampPbrainChecksum,
  loadPbrainFile,
  PbrainIntegrityError,
  PBRAIN_CHECKSUM_ALGORITHM,
} from '../../../../codex/core/pixelbrain/pbrain-checksum.js';
import { parseCanonicalJson, pyFloat } from '../../../../codex/core/pixelbrain/canonical-json.js';

// import.meta.url is http-scheme under vitest's jsdom transform; the vitest
// root is the repo root, so cwd-relative resolution is the stable choice.
const CLAYMORE = `${process.cwd()}/output/holy_fire_claymore.pbrain`;

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('pbrain checksum (JS mirror of pbrain_checksum.py)', () => {
  it.skipIf(!existsSync(CLAYMORE))(
    'verifies the Holy Fire Claymore golden fixture (historically Python-only)',
    () => {
      const text = readFileSync(CLAYMORE, 'utf8');
      const result = verifyPbrainText(text);
      expect(result.expected).toBe('6DB23A1A');
      expect(result).toMatchObject({ ok: true, recomputed: '6DB23A1A' });
    }
  );

  it('detects tampering: any mutated float byte changes the checksum', () => {
    const text = '{"kind":"pixelbrain.asset.v1","canvas":{"width":64.0},"checksum":{"value":"X"}}';
    const a = computePbrainChecksumFromText(text);
    const b = computePbrainChecksumFromText(text.replace('64.0', '65.0'));
    expect(a).not.toBe(b);
  });

  it('stamps packets built in JS using pyFloat markers', () => {
    const body = new Map([
      ['kind', 'pixelbrain.asset.v1'],
      ['canvas', new Map([['width', pyFloat(64)], ['height', pyFloat(128)]])],
    ]);
    const stamp = stampPbrainChecksum(body);
    expect(stamp.algorithm).toBe(PBRAIN_CHECKSUM_ALGORITHM);
    expect(stamp.value).toMatch(/^[0-9A-F]{8}$/);
    // The lexeme-preserving text path agrees with the pyFloat emit path.
    expect(computePbrainChecksumFromText('{"kind":"pixelbrain.asset.v1","canvas":{"width":64.0,"height":128.0}}'))
      .toBe(stamp.value);
  });

  it.skipIf(!hasPython)('agrees with Python json.dumps byte-for-byte on hostile inputs', () => {
    const cases = [
      '{"w":64.0,"h":64,"neg":-0.0,"big":1e+16,"tiny":1e-05,"frac":31.5}',
      '{"s":"glyph \\u2728 and \\"quotes\\"","list":[1,2.5,true,null],"nested":{"10":"a","2":"b"}}',
      '{"coords":[{"x":0.1,"y":0.2},{"x":11.5,"y":11.5}],"checksum":{"value":"AAAAAAAA"}}',
    ];
    const py = [
      'import json,sys',
      'packet=json.loads(sys.stdin.read())',
      'body={k:v for k,v in packet.items() if k!="checksum"}',
      't=json.dumps(body,separators=(",",":"))',
      'h=2166136261',
      'for ch in t:',
      '    h^=ord(ch); h=(h*16777619)&0xFFFFFFFF',
      'print(format(h,"08X"))',
    ].join('\n');
    for (const text of cases) {
      const expected = execFileSync('python3', ['-c', py], { input: text }).toString().trim();
      expect(computePbrainChecksumFromText(text), `packet: ${text}`).toBe(expected);
    }
  });

  it('excludes only the top-level checksum key from the digest scope', () => {
    const withStamp = '{"a":1,"checksum":{"value":"FFFFFFFF"},"b":{"checksum":"nested-stays"}}';
    const without = '{"a":1,"b":{"checksum":"nested-stays"}}';
    expect(computePbrainChecksumFromText(withStamp)).toBe(computePbrainChecksumFromText(without));
    expect(parseCanonicalJson(without).get('b').get('checksum')).toBe('nested-stays');
  });
});

describe('loadPbrainFile — verification on the load path', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'pbrain-load-'));

  /** Write a packet whose stamped value is `value` (or omit the stamp). */
  function writePacket(name, { value } = {}) {
    // 64.0 is deliberate: the float literal JSON.parse would collapse to 64,
    // which is the whole reason verification reads raw text.
    const body = '{"canvas":{"width":64.0},"kind":"pixelbrain.asset.v1"}';
    const text = value === undefined
      ? body
      : `{"canvas":{"width":64.0},"checksum":{"value":"${value}"},"kind":"pixelbrain.asset.v1"}`;
    const path = join(scratch, name);
    writeFileSync(path, text);
    return { path, trueChecksum: computePbrainChecksumFromText(body) };
  }

  it('returns the parsed packet when the checksum verifies', () => {
    const { trueChecksum } = writePacket('probe.pbrain');
    const { path } = writePacket('good.pbrain', { value: trueChecksum });

    const packet = loadPbrainFile(path);

    expect(packet.kind).toBe('pixelbrain.asset.v1');
    expect(packet.canvas.width).toBe(64);
    expect(packet.checksum.value).toBe(trueChecksum);
  });

  it('refuses a packet whose contents no longer match its stamp', () => {
    const { path } = writePacket('tampered.pbrain', { value: 'A1B2C3D4' });

    expect(() => loadPbrainFile(path)).toThrow(PbrainIntegrityError);
    try {
      loadPbrainFile(path);
    } catch (error) {
      expect(error.reason).toBe('mismatch');
      expect(error.expected).toBe('A1B2C3D4');
      expect(error.recomputed).toMatch(/^[0-9A-F]{8}$/);
      expect(error.path).toBe(path);
      expect(error.message).toContain('A1B2C3D4');
    }
  });

  it('refuses a packet carrying no checksum at all', () => {
    // Deleting the stamp must not be an easier bypass than forging it.
    const { path } = writePacket('unstamped.pbrain');

    expect(() => loadPbrainFile(path)).toThrow(PbrainIntegrityError);
    try {
      loadPbrainFile(path);
    } catch (error) {
      expect(error.reason).toBe('absent');
      expect(error.path).toBe(path);
    }
  });

  it('verifies raw text, not a reparsed object (the 64.0 collapse trap)', () => {
    const { path, trueChecksum } = writePacket('floats.pbrain');
    writeFileSync(path, `{"canvas":{"width":64.0},"checksum":{"value":"${trueChecksum}"},"kind":"pixelbrain.asset.v1"}`);

    // Round-tripping through JSON.parse would emit 64 and break the digest;
    // the loader must still accept this file.
    expect(() => loadPbrainFile(path)).not.toThrow();
  });

  it('reports the offending path when the file cannot be read', () => {
    expect(() => loadPbrainFile(join(scratch, 'absent.pbrain')))
      .toThrow(/absent\.pbrain/);
  });

  it('verifies every .pbrain fixture the repository ships', () => {
    // A fleet-wide assertion: no packet in the tree may fail the loader that
    // production now runs. This is what caught A1B2C3D4 in the first place.
    const fixtures = [
      'output/holy_fire_claymore.pbrain',
      'tests/fixtures/multi-energy-asset.pbrain',
      'tests/fixtures/godot-export/pixelbrain-basic.pbrain',
      'tests/fixtures/godot-export/pixelbrain-painted-basic.pbrain',
      'tests/fixtures/godot-export/pixelbrain-erased-basic.pbrain',
      'tests/fixtures/godot-export/pixelbrain-out-of-bounds.pbrain',
    ].filter((f) => existsSync(`${process.cwd()}/${f}`));

    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      expect(() => loadPbrainFile(`${process.cwd()}/${fixture}`), fixture).not.toThrow();
    }
  });
});

describe('digest scope', () => {
  it('excludes only the top-level checksum key', () => {
    const withStamp = '{"a":1,"checksum":{"value":"FFFFFFFF"},"b":{"checksum":"nested-stays"}}';
    const without = '{"a":1,"b":{"checksum":"nested-stays"}}';
    expect(computePbrainChecksumFromText(withStamp)).toBe(computePbrainChecksumFromText(without));
    expect(parseCanonicalJson(without).get('b').get('checksum')).toBe('nested-stays');
  });
});
