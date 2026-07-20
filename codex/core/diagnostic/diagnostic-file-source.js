import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DEFAULT_SCAN_LIMITS = Object.freeze({
  maxFiles: 10_000,
  maxFileBytes: 1_000_000,
  maxTotalBytes: 100_000_000,
});

export const DEFAULT_SKIP_DIRS = Object.freeze([
  'node_modules',
  '.git',
  '.claude',
  'dist',
  'build',
  'coverage',
  '.next',
  '.codex',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.vite',
  'out',
  'tmp',
  'ARCHIVE REFERENCE DOCS',
  'docs',
  'public',
  // Large binary/asset trees — readableExt matches *.json so these abort scans
  // when a single Phaser/tile JSON exceeds maxFileBytes.
  'assets',
  'generated-assets',
  'output',
  'media',
  'nlp_chatbot',
  '.venv',
  '.venv-align',
  'venv',
  'target',
  'squashfs-root',
  '.worktrees',
]);

export const DEFAULT_READABLE_EXT = /\.(m?[jt]sx?|cjs|json)$/;

export function normalizeScanLimits(limits = {}) {
  return {
    maxFiles: validatePositiveInteger(limits.maxFiles ?? DEFAULT_SCAN_LIMITS.maxFiles, 'maxFiles'),
    maxFileBytes: validatePositiveInteger(limits.maxFileBytes ?? DEFAULT_SCAN_LIMITS.maxFileBytes, 'maxFileBytes'),
    maxTotalBytes: validatePositiveInteger(limits.maxTotalBytes ?? DEFAULT_SCAN_LIMITS.maxTotalBytes, 'maxTotalBytes'),
  };
}

export function createArrayFileSource(files = [], limits = {}) {
  const normalizedLimits = normalizeScanLimits(limits);
  const records = files.map(file => ({
    path: file.path,
    content: file.content ?? '',
    sizeBytes: file.sizeBytes ?? Buffer.byteLength(file.content ?? '', 'utf8'),
  }));

  return {
    limits: normalizedLimits,
    async *listPaths() {
      let count = 0;
      let totalBytes = 0;
      for (const record of records) {
        count += 1;
        totalBytes += record.sizeBytes;
        assertWithinScanLimits({ count, totalBytes, sizeBytes: record.sizeBytes, limits: normalizedLimits });
        yield { path: record.path, sizeBytes: record.sizeBytes };
      }
    },
    async read(filePath) {
      const record = records.find(file => file.path === filePath);
      if (!record) throw new Error(`[diagnostic] file not found in source: ${filePath}`);
      return record;
    },
    async *readRecords() {
      for await (const listed of this.listPaths()) {
        yield this.read(listed.path);
      }
    },
  };
}

export function createFilesystemFileSource({
  rootDir,
  limits = {},
  skipDirs = DEFAULT_SKIP_DIRS,
  readableExt = DEFAULT_READABLE_EXT,
} = {}) {
  if (!rootDir) {
    throw new Error('[diagnostic] createFilesystemFileSource requires rootDir');
  }

  const normalizedLimits = normalizeScanLimits(limits);
  const skipSet = new Set(skipDirs);

  return {
    rootDir,
    limits: normalizedLimits,
    async *listPaths() {
      let count = 0;
      let totalBytes = 0;

      for await (const listed of walkReadableFiles(rootDir, '', skipSet, readableExt)) {
        // Soft-skip oversized files so a single asset JSON cannot abort the scan.
        if (listed.sizeBytes > normalizedLimits.maxFileBytes) {
          continue;
        }
        const nextCount = count + 1;
        const nextTotal = totalBytes + listed.sizeBytes;
        if (nextCount > normalizedLimits.maxFiles) {
          break;
        }
        if (nextTotal > normalizedLimits.maxTotalBytes) {
          break;
        }
        count = nextCount;
        totalBytes = nextTotal;
        yield listed;
      }
    },
    async read(filePath) {
      const abs = path.join(rootDir, filePath);
      const stat = await fs.stat(abs);
      assertWithinScanLimits({
        count: 1,
        totalBytes: stat.size,
        sizeBytes: stat.size,
        limits: normalizedLimits,
      });
      return {
        path: filePath,
        content: await fs.readFile(abs, 'utf8'),
        sizeBytes: stat.size,
      };
    },
    async *readRecords() {
      for await (const listed of this.listPaths()) {
        yield this.read(listed.path);
      }
    },
  };
}

export async function collectFileSource(fileSource) {
  const files = [];
  for await (const recordPromise of fileSource.readRecords()) {
    files.push(await recordPromise);
  }
  return files;
}

export function createScanContext({ snapshot, fileSource, limits = fileSource?.limits } = {}) {
  if (!fileSource) {
    throw new Error('[diagnostic] createScanContext requires fileSource');
  }

  return {
    snapshot,
    limits: normalizeScanLimits(limits),
    files: fileSource.readRecords(),
    collectFiles: () => collectFileSource(fileSource),
  };
}

async function* walkReadableFiles(rootDir, relDir, skipSet, readableExt) {
  const absDir = path.join(rootDir, relDir);
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith('.git') && entry.name !== '.github') continue;
    if (skipSet.has(entry.name)) continue;

    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkReadableFiles(rootDir, rel, skipSet, readableExt);
    } else if (entry.isFile() && readableExt.test(entry.name)) {
      try {
        const stat = await fs.stat(path.join(rootDir, rel));
        yield { path: rel, sizeBytes: stat.size };
      } catch {
        /* unreadable, skip */
      }
    }
  }
}

function assertWithinScanLimits({ count, totalBytes, sizeBytes, limits }) {
  if (sizeBytes > limits.maxFileBytes) {
    throw new Error(
      `[diagnostic] file byte limit exceeded (${sizeBytes} > ${limits.maxFileBytes}). ` +
      'Use --max-file-bytes <n> to raise the cap or narrow --root.',
    );
  }
  if (count > limits.maxFiles) {
    throw new Error(
      `[diagnostic] file limit exceeded (${limits.maxFiles}). ` +
      'Use --max-files <n> to raise the cap or narrow --root.',
    );
  }
  if (totalBytes > limits.maxTotalBytes) {
    throw new Error(
      `[diagnostic] total byte limit exceeded (${totalBytes} > ${limits.maxTotalBytes}). ` +
      'Use --max-total-bytes <n> to raise the cap or narrow --root.',
    );
  }
}

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`[diagnostic] invalid ${name}: ${value}. Expected a positive integer.`);
  }
  return value;
}
