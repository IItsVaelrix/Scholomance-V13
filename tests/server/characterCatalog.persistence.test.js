import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

describe('[Server] character catalog persistence (migrations v23-v24)', () => {
  let userPersistence;
  let characterCatalogPersistence;
  let dbPath;
  let testUser;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `character_catalog_test_${Date.now()}.sqlite`);
    process.env.USER_DB_PATH = dbPath;
    delete process.env.TURSO_USER_DB_URL;

    ({ userPersistence } = await import('../../codex/server/user.persistence.js'));
    characterCatalogPersistence = await import('../../codex/server/characterCatalog.persistence.js');

    testUser = await userPersistence.users.createUser(
      'forge_user', 'forge@example.com', 'hash', 'verify-tok'
    );
  });

  afterAll(() => {
    try { userPersistence?.close?.(); } catch { /* already closed */ }
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch { /* not present */ }
    }
  });

  it('starts with an empty list for a new user', async () => {
    const rows = await characterCatalogPersistence.getCharacters(testUser.id);
    expect(rows).toEqual([]);
  });

  it('saves a character and reads it back', async () => {
    const saved = await characterCatalogPersistence.saveCharacter(testUser.id, {
      id: 'char_001',
      name: 'Apprentice Scholar',
      controls: { stylePreset: 'astralKnight', seed: 1337 },
      specJson: JSON.stringify({ contract: 'CHARACTER-SPEC-v1', id: 'forge.custom.astralKnight' }),
      specHash: 'abc123',
    });
    expect(saved.id).toBe('char_001');
    expect(saved.name).toBe('Apprentice Scholar');
    expect(JSON.parse(saved.controls_json)).toEqual({ stylePreset: 'astralKnight', seed: 1337 });

    const fetched = await characterCatalogPersistence.getCharacter('char_001', testUser.id);
    expect(fetched.spec_hash).toBe('abc123');
  });

  it('lists saved characters newest-updated first', async () => {
    const rows = await characterCatalogPersistence.getCharacters(testUser.id);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('char_001');
  });

  it('upserts on save with the same id', async () => {
    await characterCatalogPersistence.saveCharacter(testUser.id, {
      id: 'char_001',
      name: 'Renamed Scholar',
      controls: { stylePreset: 'astralKnight', seed: 1337 },
      specJson: JSON.stringify({ contract: 'CHARACTER-SPEC-v1', id: 'forge.custom.astralKnight' }),
      specHash: 'abc124',
    });
    const rows = await characterCatalogPersistence.getCharacters(testUser.id);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Renamed Scholar');
  });

  it('deletes a character, scoped to the owning user', async () => {
    const ok = await characterCatalogPersistence.deleteCharacter('char_001', testUser.id);
    expect(ok).toBe(true);
    const rows = await characterCatalogPersistence.getCharacters(testUser.id);
    expect(rows).toEqual([]);
  });

  it('does not delete another user\'s character', async () => {
    await characterCatalogPersistence.saveCharacter(testUser.id, {
      id: 'char_002', name: 'X', controls: {}, specJson: '{}', specHash: 'h',
    });
    const ok = await characterCatalogPersistence.deleteCharacter('char_002', 999999);
    expect(ok).toBe(false);
  });

  it('two different users can save under the same id without overwriting each other', async () => {
    const userA = await userPersistence.users.createUser('user_a', 'a@example.com', 'hash', 'tok-a');
    const userB = await userPersistence.users.createUser('user_b', 'b@example.com', 'hash', 'tok-b');

    await characterCatalogPersistence.saveCharacter(userA.id, {
      id: 'shared_id', name: 'Alice Character', controls: {}, specJson: '{}', specHash: 'ha',
    });
    await characterCatalogPersistence.saveCharacter(userB.id, {
      id: 'shared_id', name: 'Bob Character', controls: {}, specJson: '{}', specHash: 'hb',
    });

    const aliceRow = await characterCatalogPersistence.getCharacter('shared_id', userA.id);
    const bobRow = await characterCatalogPersistence.getCharacter('shared_id', userB.id);

    expect(aliceRow.name).toBe('Alice Character');
    expect(aliceRow.spec_hash).toBe('ha');
    expect(bobRow.name).toBe('Bob Character');
    expect(bobRow.spec_hash).toBe('hb');
  });

  it('upgrades a database that already recorded v23 to the per-user primary key', () => {
    const legacyDbPath = path.join(os.tmpdir(), `character_catalog_v23_${Date.now()}.sqlite`);
    const legacyDb = new Database(legacyDbPath);
    legacyDb.exec(`
      CREATE TABLE schema_migrations (
        namespace TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (namespace, version)
      );
      INSERT INTO schema_migrations (namespace, version, name)
      VALUES ('user', 23, 'create_character_catalog');

      CREATE TABLE users (id INTEGER PRIMARY KEY);
      INSERT INTO users (id) VALUES (1), (2);

      CREATE TABLE character_catalog (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        controls_json TEXT NOT NULL,
        spec_json TEXT NOT NULL,
        spec_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_character_catalog_user ON character_catalog(user_id);
      INSERT INTO character_catalog (
        id, user_id, name, controls_json, spec_json, spec_hash
      ) VALUES ('shared_id', 1, 'Preserved Character', '{}', '{}', 'original-hash');

      CREATE TABLE _world_meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO _world_meta (key, value) VALUES ('seed_version', '1.0.0');
    `);
    legacyDb.close();

    const persistenceUrl = pathToFileURL(
      path.resolve('codex/server/user.persistence.js'),
    ).href;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', `
        const { userPersistence } = await import(${JSON.stringify(persistenceUrl)});
        await userPersistence.close();
      `],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          USER_DB_PATH: legacyDbPath,
          TURSO_USER_DB_URL: '',
          TURSO_USER_DB_TOKEN: '',
        },
        encoding: 'utf8',
      },
    );

    try {
      expect(child.status, child.stderr).toBe(0);

      const upgradedDb = new Database(legacyDbPath);
      const primaryKey = upgradedDb.prepare(`PRAGMA table_info('character_catalog')`)
        .all()
        .filter((column) => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name);
      expect(primaryKey).toEqual(['user_id', 'id']);

      const preserved = upgradedDb.prepare(
        'SELECT user_id, id, name, spec_hash FROM character_catalog WHERE user_id = 1 AND id = ?',
      ).get('shared_id');
      expect(preserved).toEqual({
        user_id: 1,
        id: 'shared_id',
        name: 'Preserved Character',
        spec_hash: 'original-hash',
      });

      upgradedDb.prepare(`
        INSERT INTO character_catalog (
          id, user_id, name, controls_json, spec_json, spec_hash
        ) VALUES (?, ?, ?, '{}', '{}', ?)
      `).run('shared_id', 2, 'Second User Character', 'second-hash');
      expect(upgradedDb.prepare(
        'SELECT COUNT(*) AS count FROM character_catalog WHERE id = ?',
      ).get('shared_id').count).toBe(2);

      const migration = upgradedDb.prepare(
        "SELECT name FROM schema_migrations WHERE namespace = 'user' AND version = 24",
      ).get();
      expect(migration?.name).toBe('scope_character_catalog_primary_key_per_user');
      upgradedDb.close();
    } finally {
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(`${legacyDbPath}${suffix}`); } catch { /* not present */ }
      }
    }
  });
});
