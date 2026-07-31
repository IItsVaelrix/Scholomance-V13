/**
 * The meta-defect these tests exist for: `blender -b --python` exits 0 when a
 * script raises. execSync only throws on a non-zero exit, so a Python error was
 * indistinguishable from success and three separate broken things looked fine.
 *
 * sys.exit DOES propagate (measured: exit 3 and exit 1), so the fix is to turn
 * uncaught exceptions into sys.exit(1) rather than to grep stderr for
 * "Traceback" — a legitimate script may print one.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  wrapPythonBody,
  runBlenderScript,
  BlenderRunError,
} from '../../../../codex/core/blender-bridge/blender-run.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const hasBlender = existsSync(BLENDER);

describe('wrapPythonBody', () => {
  it('keeps the original body reachable', () => {
    expect(wrapPythonBody('print("hello")')).toContain('print("hello")');
  });

  it('converts an uncaught exception into a non-zero exit', () => {
    const wrapped = wrapPythonBody('raise RuntimeError("boom")');
    expect(wrapped).toContain('sys.exit(1)');
    expect(wrapped).toContain('traceback.print_exc()');
  });

  it('lets an explicit SystemExit through unchanged', () => {
    // Test files call sys.exit(0)/sys.exit(1) themselves. Swallowing SystemExit
    // would turn a failing suite into a passing one — the exact bug class.
    expect(wrapPythonBody('pass')).toContain('except SystemExit');
  });

  it('indents the body so it sits inside the try block', () => {
    const wrapped = wrapPythonBody('a = 1\nb = 2');
    expect(wrapped).toContain('    a = 1\n    b = 2');
  });
});

describe.skipIf(!hasBlender)('runBlenderScript', () => {
  it('returns stdout when the script succeeds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-run-ok-'));
    const res = runBlenderScript({
      blender: BLENDER,
      body: 'print("[blender] alive")',
      scriptPath: join(dir, 's.py'),
    });
    expect(res.blenderLines).toContain('[blender] alive');
  });

  it('THROWS when the script raises — the whole point', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-run-boom-'));
    expect(() =>
      runBlenderScript({
        blender: BLENDER,
        body: 'raise RuntimeError("deliberate")',
        scriptPath: join(dir, 's.py'),
      }),
    ).toThrow(BlenderRunError);
  });

  it('carries the traceback text on the error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-run-tb-'));
    try {
      runBlenderScript({
        blender: BLENDER,
        body: 'raise RuntimeError("deliberate")',
        scriptPath: join(dir, 's.py'),
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BlenderRunError);
      expect(err.stderr).toContain('deliberate');
    }
  });
});
