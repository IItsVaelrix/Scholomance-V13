import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('[Server] character catalog persistence (migration v23)', () => {
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
});
