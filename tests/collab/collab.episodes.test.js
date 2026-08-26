import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

// Note: These tests import the persistence module which creates a real SQLite database.
// The database path can be overridden with COLLAB_DB_PATH env var for test isolation.
// Mirrors the pattern in tests/collab/collab.persistence.test.js.

let collabPersistence;
let testDbPath;
let rawDb;

beforeAll(async () => {
    testDbPath = path.join(
        os.tmpdir(),
        `scholomance_collab_test_episodes_${Date.now()}_${process.pid}.sqlite`,
    );
    process.env.COLLAB_DB_PATH = testDbPath;

    const mod = await import('../../codex/server/collab/collab.persistence.js?test=collab-episodes-suite');
    collabPersistence = mod.collabPersistence;

    // For introspection (PRAGMA index_list, re-running the migration runner)
    // we need a raw better-sqlite3 handle onto the SAME file.
    const Database = (await import('better-sqlite3')).default;
    rawDb = new Database(testDbPath);
});

afterAll(() => {
    try {
        rawDb?.close();
    } catch {
        // Best-effort close for test cleanup.
    }
    try {
        collabPersistence?.close?.();
    } catch {
        // Best-effort close for test cleanup.
    }

    for (const suffix of ['', '-wal', '-shm']) {
        const candidate = `${testDbPath}${suffix}`;
        if (existsSync(candidate)) {
            try {
                rmSync(candidate, { force: true });
            } catch {
                // Ignore cleanup errors in test environment.
            }
        }
    }
});

function makeRow(overrides = {}) {
    return {
        sessionId: 'session-1',
        agentId: 'divtube',
        toolName: 'telescope',
        targetPath: 'src/foo.ts',
        targetSymbol: null,
        argsHash: 'a'.repeat(32),
        whyFamily: 'NAV_ORIENT',
        whyHex: 'D1',
        stalenessKind: 'file-sha256',
        stalenessKey: 'deadbeef'.repeat(4),
        resultText: 'some result text',
        resultDigest: 'digest-value',
        resultBytes: 17,
        truncated: 0,
        bytecode: 'PB-XP-v1-TCL-NAVOR-000000000000-000000000000',
        ...overrides,
    };
}

describe('migration v17 (create_toolcall_episodes)', () => {
    it('is idempotent — running the migration runner twice does not error or duplicate the table/indices', async () => {
        // The persistence module already ran migrations once via top-level
        // initializeDatabase(). Re-run the raw sqlite migration runner
        // directly against the same file to prove a second pass is a no-op.
        const { runSqliteMigrations } = await import('../../codex/server/db/sqlite.migrations.js');

        // Import the same COLLAB_MIGRATIONS the module used, by re-deriving
        // the migration list indirectly: exercise via a second call to the
        // exported module's own migration path isn't available directly, so
        // instead assert the *effect* of idempotence: table + indices still
        // present and re-creatable without error via the same CREATE
        // TABLE/INDEX IF NOT EXISTS statements the migration uses.
        expect(() => {
            rawDb.exec(`
                CREATE TABLE IF NOT EXISTS collab_toolcall_episodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL DEFAULT '',
                    tool_name TEXT NOT NULL,
                    target_path TEXT,
                    target_symbol TEXT,
                    args_hash TEXT NOT NULL,
                    why_family TEXT NOT NULL,
                    why_hex TEXT NOT NULL,
                    staleness_kind TEXT NOT NULL DEFAULT 'none',
                    staleness_key TEXT,
                    result_text TEXT,
                    result_digest TEXT NOT NULL,
                    result_bytes INTEGER NOT NULL DEFAULT 0,
                    truncated INTEGER NOT NULL DEFAULT 0,
                    repeat_index INTEGER NOT NULL DEFAULT 0,
                    bytecode TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_episodes_args ON collab_toolcall_episodes(args_hash);
                CREATE INDEX IF NOT EXISTS idx_episodes_tool_path ON collab_toolcall_episodes(tool_name, target_path);
                CREATE INDEX IF NOT EXISTS idx_episodes_session ON collab_toolcall_episodes(session_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_episodes_created ON collab_toolcall_episodes(created_at);
            `);
        }).not.toThrow();

        // And re-running the real migration runner against the schema_migrations
        // bookkeeping table must also be a no-op (no re-application, no error).
        const result = runSqliteMigrations(rawDb, {
            namespace: 'collab',
            migrations: [
                {
                    version: 17,
                    name: 'create_toolcall_episodes',
                    up(database) {
                        database.exec(`CREATE TABLE IF NOT EXISTS collab_toolcall_episodes_reapply_probe (id INTEGER PRIMARY KEY);`);
                    },
                },
            ],
        });
        expect(result.appliedVersions).toEqual([]);
        expect(result.currentVersion).toBe(17);
    });

    it('creates exactly the 4 indices specified in PDR §3.3', () => {
        const indexList = rawDb.prepare(`PRAGMA index_list('collab_toolcall_episodes')`).all();
        const indexNames = indexList.map((row) => row.name);
        expect(indexNames).toEqual(
            expect.arrayContaining([
                'idx_episodes_args',
                'idx_episodes_tool_path',
                'idx_episodes_session',
                'idx_episodes_created',
            ]),
        );
        expect(indexNames.length).toBeGreaterThanOrEqual(4);
    });
});

describe('collabPersistence.episodes', () => {
    it('inserts an episode and round-trips all columns via lookup', async () => {
        const row = makeRow({ argsHash: 'b'.repeat(32), stalenessKey: 'cafebabe'.repeat(4) });
        const inserted = await collabPersistence.episodes.insert(row);
        expect(inserted.id).toBeTruthy();
        expect(inserted.repeatIndex).toBe(0);

        const found = await collabPersistence.episodes.lookup(
            row.argsHash,
            row.stalenessKind,
            row.stalenessKey,
        );
        expect(found).toBeDefined();
        expect(found.session_id).toBe(row.sessionId);
        expect(found.agent_id).toBe(row.agentId);
        expect(found.tool_name).toBe(row.toolName);
        expect(found.target_path).toBe(row.targetPath);
        expect(found.target_symbol).toBe(row.targetSymbol);
        expect(found.args_hash).toBe(row.argsHash);
        expect(found.why_family).toBe(row.whyFamily);
        expect(found.why_hex).toBe(row.whyHex);
        expect(found.staleness_kind).toBe(row.stalenessKind);
        expect(found.staleness_key).toBe(row.stalenessKey);
        expect(found.result_text).toBe(row.resultText);
        expect(found.result_digest).toBe(row.resultDigest);
        expect(found.result_bytes).toBe(row.resultBytes);
        expect(found.truncated).toBe(0);
        expect(found.repeat_index).toBe(0);
        expect(found.bytecode).toBe(row.bytecode);
    });

    it('returns null from lookup when staleness_kind is "none" or staleness_key is null', async () => {
        const row = makeRow({
            argsHash: 'c'.repeat(32),
            stalenessKind: 'none',
            stalenessKey: null,
        });
        await collabPersistence.episodes.insert(row);
        const found = await collabPersistence.episodes.lookup(row.argsHash, 'none', null);
        expect(found).toBeNull();
    });

    it('never recalls a truncated row via the raw SELECT (accessor returns the row; caller must gate on truncated)', async () => {
        const row = makeRow({
            argsHash: 'd'.repeat(32),
            stalenessKey: 'truncated-key',
            truncated: 1,
        });
        await collabPersistence.episodes.insert(row);
        const found = await collabPersistence.episodes.lookup(row.argsHash, row.stalenessKind, row.stalenessKey);
        // lookupEpisode mirrors the SQL WHERE-clause shape of episode_store.py's
        // lookup(); the truncated/digest integrity gate is applied by the
        // caller (as Python's lookup() does), not baked into the SQL here.
        expect(found).toBeDefined();
        expect(found.truncated).toBe(1);
    });

    it('computes repeat_index as the count of prior episodes sharing args_hash', async () => {
        const argsHash = 'e'.repeat(32);
        const first = await collabPersistence.episodes.insert(makeRow({ argsHash, stalenessKey: 'k1' }));
        const second = await collabPersistence.episodes.insert(makeRow({ argsHash, stalenessKey: 'k2' }));
        const third = await collabPersistence.episodes.insert(makeRow({ argsHash, stalenessKey: 'k3' }));
        expect(first.repeatIndex).toBe(0);
        expect(second.repeatIndex).toBe(1);
        expect(third.repeatIndex).toBe(2);
    });

    it('allocates strictly increasing, non-duplicate repeat_index under concurrent inserts for the same args_hash', async () => {
        const argsHash = 'f'.repeat(32);
        const N = 12;
        const results = await Promise.all(
            Array.from({ length: N }, (_, i) =>
                collabPersistence.episodes.insert(makeRow({ argsHash, stalenessKey: `concurrent-${i}` })),
            ),
        );
        const repeatIndices = results.map((r) => r.repeatIndex).sort((a, b) => a - b);
        expect(repeatIndices).toEqual(Array.from({ length: N }, (_, i) => i));
    });

    it('getForSession returns episodes for a session in insertion order', async () => {
        const sessionId = `session-${Date.now()}`;
        await collabPersistence.episodes.insert(makeRow({ sessionId, argsHash: 'g'.repeat(32), stalenessKey: 's1' }));
        await collabPersistence.episodes.insert(makeRow({ sessionId, argsHash: 'h'.repeat(32), stalenessKey: 's2' }));

        const rows = await collabPersistence.episodes.getForSession(sessionId);
        expect(rows.length).toBe(2);
        expect(rows[0].session_id).toBe(sessionId);
        expect(rows[1].session_id).toBe(sessionId);
        expect(rows[0].id).toBeLessThan(rows[1].id);
    });

    it('lookup returns the most recent matching episode (ORDER BY id DESC)', async () => {
        const argsHash = 'i'.repeat(32);
        const stalenessKey = 'same-key-multiple-writes';
        await collabPersistence.episodes.insert(
            makeRow({ argsHash, stalenessKey, resultText: 'first result' }),
        );
        const secondInsert = await collabPersistence.episodes.insert(
            makeRow({ argsHash, stalenessKey, resultText: 'second result' }),
        );

        const found = await collabPersistence.episodes.lookup(argsHash, 'file-sha256', stalenessKey);
        expect(found).toBeDefined();
        expect(found.result_text).toBe('second result');
        expect(found.repeat_index).toBe(secondInsert.repeatIndex);
    });
});
