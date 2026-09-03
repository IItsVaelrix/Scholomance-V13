import { userPersistence } from './user.persistence.js';

export async function getCharacters(userId) {
  const { db } = userPersistence;
  const result = await db.execute(
    'SELECT * FROM character_catalog WHERE user_id = ? ORDER BY updated_at DESC',
    [userId]
  );
  return result.rows || [];
}

export async function getCharacter(id, userId) {
  const { db } = userPersistence;
  const result = await db.execute(
    'SELECT * FROM character_catalog WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function saveCharacter(userId, entry) {
  const { db } = userPersistence;
  const now = new Date().toISOString();
  const controlsJson = typeof entry.controls === 'string' ? entry.controls : JSON.stringify(entry.controls ?? {});

  await db.execute(`
    INSERT INTO character_catalog (
      id, user_id, name, controls_json, spec_json, spec_hash, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?
    ) ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      controls_json = excluded.controls_json,
      spec_json = excluded.spec_json,
      spec_hash = excluded.spec_hash,
      updated_at = excluded.updated_at
  `, [
    entry.id,
    userId,
    entry.name,
    controlsJson,
    entry.specJson,
    entry.specHash,
    now,
    now,
  ]);

  return await getCharacter(entry.id, userId);
}

export async function deleteCharacter(id, userId) {
  const { db } = userPersistence;
  const result = await db.execute(
    'DELETE FROM character_catalog WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.rowsAffected > 0;
}
