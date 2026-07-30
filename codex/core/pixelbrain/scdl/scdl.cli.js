#!/usr/bin/env node
/**
 * SCDL CLI
 *
 * Usage:
 *   node scdl.cli.js compile <file.scdl> [--export json,svg,phaser] [--out <file>] [--semantic]
 *   node scdl.cli.js preview <file.scdl> [--scale N]
 *   node scdl.cli.js parse   <file.scdl> [--out <file>]
 *   node scdl.cli.js check   <file.scdl>
 *   (semantic includes annotations from SemQuant + wired engine primitives)
 *
 * Examples:
 *   node scdl.cli.js compile fixtures/void_chestplate.scdl --export json,svg,phaser
 *   node scdl.cli.js preview fixtures/void_chestplate.scdl --scale 8
 *   node scdl.cli.js parse   fixtures/void_chestplate.scdl
 *   node scdl.cli.js check   fixtures/void_chestplate.scdl
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename, dirname, extname, join } from 'node:path';
import { compileSCDL, parseSCDL, exportSCDL } from './index.js';
import { buildAsepritePayload, exportFilmstripPNG, MAX_PNG_SCALE } from './scdl.exporters.js';
import { encodeAsepriteBinary } from '../aseprite-binary-codec.js';
import { buildSCDLDiagnosticReport, formatSCDLDiagnostic } from './scdl.diagnostics.js';

const [,, command, ...argv] = process.argv;

/** Big enough to read a 16–32px asset on a normal display without squinting. */
const DEFAULT_PREVIEW_SCALE = 8;

function parseArgs(args) {
  const opts = { flags: {}, positional: [] };
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      // Only take a value if the next token is not itself a flag. Consuming it
      // unconditionally made a valueless flag eat the one after it:
      // `--strict --out-dir /tmp` set strict='--out-dir', left `--out-dir` unset,
      // and pushed the path into positionals — so the flag silently did nothing
      // and the output landed somewhere else.
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts.flags[args[i].slice(2)] = next;
        i += 2;
      } else {
        opts.flags[args[i].slice(2)] = true;
        i += 1;
      }
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
  // Canonical exports are 1x by default: the raster must match the declared
  // canvas unless the author explicitly asks otherwise. Use `preview` to look
  // at an asset without changing what the compiler emits.
  const scale = opts.flags.scale === undefined ? 1 : _previewScale(opts.flags.scale);

  console.log(`[SCDL] Compiling: ${filePath}`);
  const result = compileSCDL(source, { strict: opts.flags.strict === true });

  if (!result.ok) {
    // Under --strict a warning is what failed the compile, and its severity is
    // still WARN. Printing only isError() diagnostics would announce a failure
    // and then explain nothing.
    const blocking = result.errors.filter(e => e.isError?.() || (opts.flags.strict === true && e.isWarn?.()));
    console.error(`[SCDL] Compile FAILED (${blocking.length} blocking diagnostic(s)):`);
    for (const err of blocking) {
      console.error('  ' + formatSCDLDiagnostic(err));
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
        const out = exportSCDL(framePacket, [target], result.ast, { includeSemantic, shade, scale })[target];
        if (!out.ok) {
          console.warn(`  [WARN] Export '${target}' (frame ${i}) failed: ${out.output}`);
          return;
        }
        writeOut(join(outDir, `${name}-f${i}-${target}.${_targetExt(target)}`), _exportBytes(out));
      });
      continue;
    }

    const out = exportSCDL(result.packet, [target], result.ast, { includeSemantic, shade, scale })[target];
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

/**
 * `preview` — render the asset large enough for a human to actually look at.
 *
 * The authoring loop's last step is "view the PNG", but a canonical export is
 * the exact SCDL canvas (16×24, 24×24 …), which is unreadable on screen and
 * must stay unscaled: downstream consumers and the isometric law both depend on
 * the raster matching the declared canvas. So magnification gets its own
 * artifact rather than changing what `--export png` means.
 *
 * Preview files are named `<asset>-preview-<N>x.png` (multi-frame:
 * `<asset>-f<I>-preview-<N>x.png` plus a `<asset>-preview-<N>x-strip.png`
 * filmstrip) — outside the `<asset>-<target>.<ext>` namespace of the Export
 * Naming Law, so a preview can never be mistaken for a compiler output or
 * picked up by a loader globbing for `-png.png`.
 */
function cmdPreview(args) {
  const opts = parseArgs(args);
  const filePath = opts.positional[0];
  if (!filePath) { console.error('[SCDL] preview: missing <file.scdl>'); process.exit(1); }

  const scale = _previewScale(opts.flags.scale);
  const outDir = typeof opts.flags['out-dir'] === 'string'
    ? resolve(opts.flags['out-dir'])
    : dirname(resolve(filePath));
  const name = basename(filePath, '.scdl');
  const shade = opts.flags.shade === 'material' ? 'material' : undefined;

  const source = readSource(filePath);
  const result = compileSCDL(source, { strict: opts.flags.strict === true });

  if (!result.ok) {
    console.error(`[SCDL] preview: compile FAILED (${result.errors.length} error(s)):`);
    for (const err of result.errors) {
      if (err.isError && err.isError()) console.error('  ' + formatSCDLDiagnostic(err));
    }
    process.exit(1);
  }
  for (const err of result.errors) {
    if (err.isWarn && err.isWarn()) console.warn('  WARN: ' + formatSCDLDiagnostic(err));
  }

  const packets = (result.frameLoop && result.framePackets.length > 1)
    ? result.framePackets
    : [result.packet];
  const multiFrame = packets.length > 1;

  console.log(`[SCDL] Preview: ${filePath} @ ${scale}x`);

  packets.forEach((packet, i) => {
    const out = exportSCDL(packet, ['png'], result.ast, { shade, scale }).png;
    if (!out.ok) {
      console.warn(`  [WARN] preview (frame ${i}) failed: ${out.output}`);
      return;
    }
    const infix = multiFrame ? `-f${i}` : '';
    writeOut(join(outDir, `${name}${infix}-preview-${scale}x.png`), out.output);
  });

  if (multiFrame) {
    const strip = exportFilmstripPNG(packets, result.ast, { shade, scale });
    writeOut(join(outDir, `${name}-preview-${scale}x-strip.png`), strip);
    console.log(`[SCDL] Frames: ${packets.length} (loop '${result.frameLoop.loop}')`);
  }

  const canvas = packets[0]?.canvas || { width: 0, height: 0 };
  console.log(`[SCDL] Canvas ${canvas.width}x${canvas.height} → ${canvas.width * scale}x${canvas.height * scale}`);
}

function _previewScale(raw) {
  if (raw === undefined || raw === true) return DEFAULT_PREVIEW_SCALE;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) {
    console.error(`[SCDL] preview: --scale must be a positive integer (got '${raw}')`);
    process.exit(1);
  }
  if (n > MAX_PNG_SCALE) {
    console.warn(`  WARN: --scale ${n} clamped to ${MAX_PNG_SCALE}`);
    return MAX_PNG_SCALE;
  }
  return n;
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
  const strict = opts.flags.strict === true;
  const result = compileSCDL(source, { strict });
  const report = buildSCDLDiagnosticReport(result);

  console.log(`[SCDL] Check: ${filePath}${strict ? ' (strict)' : ''}`);
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
  case 'preview': cmdPreview(argv); break;
  case 'parse':   cmdParse(argv);   break;
  case 'check':   cmdCheck(argv);   break;
  default:
    console.log(`SCDL Compiler CLI
Usage:
  node scdl.cli.js compile <file.scdl> [--export json,svg,phaser,png,aseprite] [--out-dir <dir>] [--out <file>] [--shade material] [--scale N] [--strict]
  node scdl.cli.js preview <file.scdl> [--scale N] [--out-dir <dir>] [--shade material] [--strict]
  node scdl.cli.js parse   <file.scdl> [--out <file>]
  node scdl.cli.js check   <file.scdl> [--strict]

Outputs default to the source file's directory, named <asset>-<target>.<ext>
(multi-frame assets: <asset>-f<N>-<target>.<ext> plus <asset>-frameloop.json).

preview writes human-viewable magnifications named <asset>-preview-<N>x.png
(default ${DEFAULT_PREVIEW_SCALE}x, max ${MAX_PNG_SCALE}x) plus a -strip.png filmstrip for loops.
These sit outside the Export Naming Law namespace and are never compiler inputs.

--strict promotes warnings (notably SCDL-005 unknown material, which silently
falls back to 'source') to errors.
`);
}
