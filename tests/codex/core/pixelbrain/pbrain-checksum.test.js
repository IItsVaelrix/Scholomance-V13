import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  computePbrainChecksumFromText,
  verifyPbrainText,
  stampPbrainChecksum,
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
