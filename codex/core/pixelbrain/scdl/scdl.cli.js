#!/usr/bin/env node
/**
 * SCDL CLI
 *
 * Usage:
 *   node scdl.cli.js compile <file.scdl> [--export json,svg,phaser] [--out <file>] [--semantic]
 *   node scdl.cli.js parse   <file.scdl> [--out <file>]
 *   node scdl.cli.js check   <file.scdl>
 *   (semantic includes annotations from SemQuant + wired engine primitives)
 *
 * Examples:
 *   node scdl.cli.js compile fixtures/void_chestplate.scdl --export json,svg,phaser
 *   node scdl.cli.js parse   fixtures/void_chestplate.scdl
 *   node scdl.cli.js check   fixtures/void_chestplate.scdl
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename, dirname, extname, join } from 'node:path';
import { compileSCDL, parseSCDL, exportSCDL } from './index.js';
import { buildAsepritePayload } from './scdl.exporters.js';
import { encodeAsepriteBinary } from '../aseprite-binary-codec.js';
import { buildSCDLDiagnosticReport, formatSCDLDiagnostic } from './scdl.diagnostics.js';

const [,, command, ...argv] = process.argv;

function parseArgs(args) {
  const opts = { flags: {}, positional: [] };
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      opts.flags[args[i].slice(2)] = args[i + 1] || true;
      i += 2;
    } else {
      opts.positional.push(args[i]);
      i++;
    }
  }
  return opts;
}

function readSource(filePath) {
  try {
    return readFileSync(resolve(filePath), 'utf8');
  } catch (e) {
    console.error(`[SCDL] Cannot read file: ${filePath}\n${e.message}`);
    process.exit(1);
  }
}

function writeOut(outPath, content) {
  try {
    if (typeof content === 'string') {
      writeFileSync(resolve(outPath), content, 'utf8');
    } else {
      writeFileSync(resolve(outPath), content);
    }
    console.log(`[SCDL] Written: ${outPath}`);
  } catch (e) {
    console.error(`[SCDL] Cannot write: ${outPath}\n${e.message}`);
    process.exit(1);
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdCompile(args) {
  const opts = parseArgs(args);
  const filePath = opts.positional[0];
  if (!filePath) { console.error('[SCDL] compile: missing <file.scdl>'); process.exit(1); }

  const source  = readSource(filePath);
  const targets = (opts.flags.export || 'json').split(',').map(s => s.trim());
  const outPath = typeof opts.flags.out === 'string' ? opts.flags.out : null;
  // Export Naming Law (SCDL v1.1): outputs default to the SOURCE file's
  // directory (never the CWD) and are always named <asset>-<target>.<ext>.
  const outDir  = typeof opts.flags['out-dir'] === 'string'
    ? resolve(opts.flags['out-dir'])
    : dirname(resolve(filePath));
  const name = basename(filePath, '.scdl');
  const includeSemantic = opts.flags.semantic || false;
  const shade = opts.flags.shade === 'material' ? 'material' : undefined;

  console.log(`[SCDL] Compiling: ${filePath}`);
  const result = compileSCDL(source);

  if (!result.ok) {
    console.error(`[SCDL] Compile FAILED (${result.errors.length} error(s)):`);
    for (const err of result.errors) {
      if (err.isError && err.isError()) console.error('  ' + formatSCDLDiagnostic(err));
    }
    process.exit(1);
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      if (err.isWarn && err.isWarn()) console.warn('  WARN: ' + err.message);
    }
  }

  const multiFrame = Boolean(result.frameLoop) && result.framePackets.length > 1;

  for (const target of targets) {
    // aseprite is inherently multi-frame: one combined file, no frame infix
    if (target === 'aseprite') {
      const payload = buildAsepritePayload(result.framePackets, result.frameLoop);
      writeOut(join(outDir, `${name}-aseprite.aseprite`), encodeAsepriteBinary(payload));
      continue;
    }

    if (multiFrame) {
      result.framePackets.forEach((framePacket, i) => {
        const out = exportSCDL(framePacket, [target], result.ast, { includeSemantic, shade })[target];
        if (!out.ok) {
          console.warn(`  [WARN] Export '${target}' (frame ${i}) failed: ${out.output}`);
          return;
        }
        writeOut(join(outDir, `${name}-f${i}-${target}.${_targetExt(target)}`), _exportBytes(out));
      });
      continue;
    }

    const out = exportSCDL(result.packet, [target], result.ast, { includeSemantic, shade })[target];
    if (!out.ok) {
      console.warn(`  [WARN] Export '${target}' failed: ${out.output}`);
      continue;
    }
    const dest = outPath
      ? _targetPath({ outPath, sourceName: name, target, multi: targets.length > 1 })
      : join(outDir, `${name}-${target}.${_targetExt(target)}`);
    writeOut(dest, _exportBytes(out));
  }

  if (multiFrame) {
    writeOut(join(outDir, `${name}-frameloop.json`), JSON.stringify(result.frameLoop, null, 2));
    console.log(`[SCDL] Frames: ${result.framePackets.length} (loop '${result.frameLoop.loop}')`);
  }

  console.log(`[SCDL] Done. Packet ID: ${result.packet.id}`);
}

function _exportBytes(out) {
  return ArrayBuffer.isView(out.output) ? out.output : String(out.output);
}

function cmdParse(args) {
  const opts    = parseArgs(args);
  const filePath = opts.positional[0];
  if (!filePath) { console.error('[SCDL] parse: missing <file.scdl>'); process.exit(1); }

  const source = readSource(filePath);
  const result = parseSCDL(source);
  const out    = JSON.stringify(result.rawAst || result, null, 2);

  if (opts.flags.out) {
    writeOut(opts.flags.out, out);
  } else {
    console.log(out);
  }

  if (result.errors.length) {
    console.warn(`[SCDL] Parse warnings: ${result.errors.length}`);
  }
}

function cmdCheck(args) {
  const opts    = parseArgs(args);
  const filePath = opts.positional[0];
  if (!filePath) { console.error('[SCDL] check: missing <file.scdl>'); process.exit(1); }

  const source = readSource(filePath);
  const result = compileSCDL(source);
  const report = buildSCDLDiagnosticReport(result);

  console.log(`[SCDL] Check: ${filePath}`);
  console.log(`  OK:     ${result.ok}`);
  console.log(`  Errors: ${report.summary.errors}`);
  console.log(`  Warns:  ${report.summary.warns}`);
  console.log(`  Infos:  ${report.summary.infos}`);

  for (const err of result.errors) {
    if (err.isError && err.isError()) {
      console.error('  ERROR: ' + formatSCDLDiagnostic(err));
    } else if (err.isWarn && err.isWarn()) {
      console.warn('  WARN:  ' + formatSCDLDiagnostic(err));
    } else {
      console.log('  INFO:  ' + formatSCDLDiagnostic(err));
    }
  }

  if (result.ok) {
    console.log(`  Packet: ${result.packet?.id}`);
    console.log(`  Coords: ${result.packet?.geometry?.coordinates?.length ?? 0}`);
  }

  process.exit(result.ok ? 0 : 1);
}

function _targetExt(target) {
  switch (target) {
    case 'svg':      return 'svg';
    case 'png':      return 'png';
    case 'aseprite': return 'aseprite';
    default:         return 'json';
  }
}

function _targetPath({ outPath, sourceName, target, multi }) {
  const ext = _targetExt(target);
  if (!outPath) {
    return multi ? `${sourceName}-${target}.${ext}` : `${sourceName}.${ext}`;
  }
  if (!multi) return outPath;

  const dir = dirname(outPath);
  const file = basename(outPath);
  const suffix = extname(file);
  const stem = suffix ? file.slice(0, -suffix.length) : file;
  return join(dir, `${stem}-${target}.${ext}`);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

switch (command) {
  case 'compile': cmdCompile(argv); break;
  case 'parse':   cmdParse(argv);   break;
  case 'check':   cmdCheck(argv);   break;
  default:
    console.log(`SCDL Compiler CLI
Usage:
  node scdl.cli.js compile <file.scdl> [--export json,svg,phaser,png,aseprite] [--out-dir <dir>] [--out <file>] [--shade material]
  node scdl.cli.js parse   <file.scdl> [--out <file>]
  node scdl.cli.js check   <file.scdl>

Outputs default to the source file's directory, named <asset>-<target>.<ext>
(multi-frame assets: <asset>-f<N>-<target>.<ext> plus <asset>-frameloop.json).
`);
}
