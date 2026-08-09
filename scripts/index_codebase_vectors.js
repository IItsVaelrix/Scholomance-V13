/**
 * scripts/index_codebase_vectors.js
 * 
 * Indexes the codebase into a vector space using TurboQuant.
 * Enables INSTANT codebase search for the Scholomance team.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { collabPersistence } from '../codex/server/collab/collab.persistence.js';
import { embedFloat } from '../codex/core/semantic/amp/runVectorAmp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGET_DIM = 256;
const CHUNK_SIZE = 2000; // chars

// Regenerable build artifacts / vendored deps — never semantically indexed.
// (ripgrep honours .gitignore for forensic search; the indexer needs its own
// list since it walks the tree directly.) Any dir starting with `.venv` is also
// skipped. Mirrors .gitignore: build, dist, coverage, target, .venv-align, etc.
const IGNORED_DIRS = new Set([
    'node_modules', '.git', 'dist', 'dist-ssr', 'build', '.tmp', 'output',
    '.claude', 'coverage', 'target', '.cache',
]);

async function indexFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(ROOT, filePath);

        // Chunk content
        const chunks = [];
        for (let i = 0; i < content.length; i += CHUNK_SIZE) {
            chunks.push(content.slice(i, i + CHUNK_SIZE));
        }

        const entries = chunks.map((chunk, index) => {
            // One lens, shared with search/probe. Full-precision unit vector —
            // exact cosine, no quantization loss. Token-less chunks have no
            // direction (ok:false) and are skipped, never indexed as ghosts.
            const { ok, vector } = embedFloat(chunk, { dimension: TARGET_DIM });
            if (!ok || !vector?.length) return null;

            // id = hash of path + index
            const id = crypto.createHash('md5').update(`${relativePath}:${index}`).digest('hex');

            return {
                id,
                file_path: relativePath,
                chunk_index: index,
                content_preview: chunk.slice(0, 100).replace(/\s+/g, ' ').trim(),
                vector_tq: Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
            };
        }).filter(Boolean);

        await collabPersistence.codebase.index(entries);
        return chunks.length;
    } catch (e) {
        console.error(`[INDEX] Failed to process ${filePath}:`, e.message);
        return 0;
    }
}

async function walk(dir, callback) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.venv')) continue;
            await walk(fullPath, callback);
        } else if (/\.(js|jsx|ts|tsx|py|md|toml|jsonc)$/.test(entry.name)) {
            // NOTE: .py added so steamdeck_brain/, blender addons, and the
            // divtube Python services are semantically searchable too.
            await callback(fullPath);
        }
    }
}

async function main() {
    console.log('[RITUAL] Initiating Codebase Vector Ascension...');
    
    // Clear old index
    await collabPersistence.codebase.clear();
    
    let fileCount = 0;
    let chunkCount = 0;

    await walk(ROOT, async (filePath) => {
        const n = await indexFile(filePath);
        if (n > 0) {
            fileCount++;
            chunkCount += n;
            if (fileCount % 50 === 0) console.log(`  - Ascended ${fileCount} files (${chunkCount} chunks)...`);
        }
    });

    console.log(`[RITUAL] Ascension Complete. Indexed ${fileCount} files into ${chunkCount} semantic vector chunks.`);
    process.exit(0);
}

main().catch(err => {
    console.error('[RITUAL] Ascension Failed:', err);
    process.exit(1);
});
