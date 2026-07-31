/**
 * blender-run — the only place a driver invokes Blender.
 *
 * `blender -b --python script.py` returns exit 0 when the script raises an
 * uncaught exception. execSync throws only on a non-zero exit, so every driver
 * that called Blender directly could not tell a Python error from success —
 * which is why a renamed RNA property, an unlinked node group, and a receipt
 * describing nothing all looked fine at the same time.
 *
 * Measured on 5.2.0: an uncaught raise exits 0, sys.exit(3) exits 3,
 * a caught exception re-raised as sys.exit(1) exits 1. sys.exit propagates.
 * So the body is wrapped rather than the stderr parsed: grepping for
 * "Traceback" would misfire on any script that legitimately prints one.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export class BlenderRunError extends Error {
  constructor(message, stderr = '') {
    super(message);
    this.name = 'BlenderRunError';
    this.stderr = stderr;
  }
}

/**
 * Wrap a Python body so an uncaught exception becomes a non-zero exit.
 *
 * SystemExit is re-raised untouched: test files and drivers call sys.exit
 * themselves, and swallowing it would convert a failing run into a passing one.
 */
export function wrapPythonBody(body) {
  const indented = String(body)
    .split('\n')
    .map((line) => (line.length ? `    ${line}` : line))
    .join('\n');

  return `import sys, traceback
try:
${indented}
except SystemExit:
    raise
except BaseException:
    traceback.print_exc()
    sys.exit(1)
`;
}

/**
 * Run a Python body inside Blender. Throws BlenderRunError on failure.
 *
 * @returns {{ stdout: string, blenderLines: string[] }}
 */
export function runBlenderScript({ blender, body, scriptPath, timeout = 600000 }) {
  if (typeof blender !== 'string' || blender.length === 0) {
    throw new BlenderRunError('blender must be a non-empty path');
  }
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) {
    throw new BlenderRunError('scriptPath must be a non-empty path');
  }

  writeFileSync(scriptPath, wrapPythonBody(body));

  let stdout;
  try {
    stdout = execSync(`"${blender}" -b --factory-startup --python "${scriptPath}"`, {
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = `${err.stdout ?? ''}${err.stderr ?? ''}` || err.message;
    throw new BlenderRunError(`Blender failed (exit ${err.status ?? '?'})`, stderr);
  }

  return {
    stdout,
    blenderLines: stdout.split('\n').filter((l) => l.startsWith('[blender]')),
  };
}
