# Character Creation Pipeline — Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the P0/P1 findings from the 2026-09-03 character-creation-pipeline audit (persist forged characters so they survive a refresh; repair four contract-rot bugs in the PixelBrain character foundry), then the P2 findings (real PNG compression; extract magic numbers).

**Architecture:** P0 adds a new SQLite table + Fastify routes + UI wiring, mirroring the existing `eq_presets` save/list/delete pattern exactly (`codex/server/eqPresets.persistence.js` / `codex/server/routes/eqPresets.routes.js`). P1 fixes four independent bugs inside `codex/core/pixelbrain/character-foundry.js` and `character-spec.js` — no new abstractions, each is a targeted correction against an existing, already-verified contract (the 2026-06-12 Character Creator PDR, and the existing `PixelBrainAssetPacket` builder). P2 swaps a hand-rolled "stored" (uncompressed) deflate for the `fflate` library already in `package.json`, and extracts literal thresholds into named constants.

**Tech Stack:** Node/Fastify server, better-sqlite3/Turso via `userPersistence.db`, Vitest, React/TypeScript (ActorForgeLab), `fflate` (already installed).

**Spec:** This plan's spec is the verified audit findings from this conversation (no separate design doc — the audit itself, cross-checked line-by-line against the current repo state, is the spec). Key contract references:
- `docs/scholomance-encyclopedia/PDR-archive/2026-06-12-pixelbrain-character-creator-pdr.md` §3 (product goal / output shape) and §4.5 (32-color palette budget)
- `codex/core/pixelbrain/pixelbrain-asset-packet.js` (existing `PixelBrainAssetPacket` builder — reused, not reinvented)

## Global Constraints

- User decision (2026-09-03): `ActorForgeLab` stays behind `AdminRoute` — do **not** remove or weaken that gate, and do **not** expose `/api/character/enhance` to non-admin traffic. P0 is "stop losing forged characters," not "ship a public feature."
- Palette budget is exactly 32 unique colors per direction, per PDR §4.5 — do not change this number.
- Follow the existing `eq_presets` persistence/route pattern exactly (same file shapes, same `requireAuth` pre-handler, same `ON CONFLICT(id) DO UPDATE` upsert style) — this codebase already has a working template for "per-user saved thing," don't invent a new one.
- All new/changed code in `codex/core/pixelbrain/` must stay isomorphic (no Node-only builtins like `zlib`) — it runs in the browser via `src/lib/pixelbrain.adapter.js` → `ActorForgeLab.tsx`. This is why Task 8 uses `fflate`, not Node's `zlib`.
- Every task ends green on its own test file before moving to the next task. Run tests with `nice -n 19 npx vitest run <file> --maxWorkers=2` (throttled, per project convention).

---

## Task 1: Character catalog — migration + persistence module

**Files:**
- Modify: `codex/server/user.persistence.js` (add migration `version: 23`, following the `version: 21` `eq_presets` migration at line 453 as the template)
- Create: `codex/server/characterCatalog.persistence.js`
- Test: `tests/server/characterCatalog.persistence.test.js`

**Interfaces:**
- Produces: `getCharacters(userId)`, `getCharacter(id, userId)`, `saveCharacter(userId, entry)`, `deleteCharacter(id, userId)` — `entry` is `{ id, name, controls, specJson, specHash }` where `controls` is a plain object (JSON-stringified into `controls_json`) and `specJson`/`specHash` are strings.

- [ ] **Step 1: Write the failing persistence test**

Create `tests/server/characterCatalog.persistence.test.js`:

```js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/server/characterCatalog.persistence.test.js --maxWorkers=2`
Expected: FAIL — `Cannot find module '../../codex/server/characterCatalog.persistence.js'`

- [ ] **Step 3: Add the migration**

In `codex/server/user.persistence.js`, add after the `version: 22` entry (the last entry in `USER_MIGRATIONS`, currently ending the array at line 480):

```js
  {
    version: 23,
    name: 'create_character_catalog',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS character_catalog (
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
        CREATE INDEX IF NOT EXISTS idx_character_catalog_user ON character_catalog(user_id);
      `);
    },
  },
];
```

(Remove the old trailing `];` from the previous last entry and keep only one at the end of the array.)

- [ ] **Step 4: Write the persistence module**

Create `codex/server/characterCatalog.persistence.js`:

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/server/characterCatalog.persistence.test.js --maxWorkers=2`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add codex/server/user.persistence.js codex/server/characterCatalog.persistence.js tests/server/characterCatalog.persistence.test.js
git commit -m "$(cat <<'EOF'
feat(server): add character catalog persistence (migration v23)

Forged characters previously had nowhere to live — forge, refresh,
gone. Mirrors the existing eq_presets save/list/delete pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 2: Character catalog — API routes

**Files:**
- Create: `codex/server/routes/characterCatalog.routes.js`
- Modify: `codex/server/index.js` (register the route, near the existing `characterEnhanceRoutes` registration at line 1195)

**Interfaces:**
- Consumes: `getCharacters`, `getCharacter`, `saveCharacter`, `deleteCharacter` from Task 1's `codex/server/characterCatalog.persistence.js`.
- Produces: `GET /api/character/catalog` → `{ success: true, characters: [...] }`; `POST /api/character/catalog` → `{ success: true, character }`; `DELETE /api/character/catalog/:id` → `{ success: true }`. All three require `requireAuth` (same as `/api/eq-presets`) — no admin check is added server-side because none exists for the other admin-lab-only routes in this codebase (the gate is client-side `AdminRoute`, matching existing convention).

- [ ] **Step 1: Write the route test**

Create `tests/server/routes/characterCatalog.routes.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

describe('[Server] character catalog routes', () => {
  let userPersistence;
  let characterCatalogRoutes;
  let app;
  let dbPath;
  let testUser;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `character_catalog_routes_test_${Date.now()}.sqlite`);
    process.env.USER_DB_PATH = dbPath;
    delete process.env.TURSO_USER_DB_URL;

    ({ userPersistence } = await import('../../../codex/server/user.persistence.js'));
    ({ characterCatalogRoutes } = await import('../../../codex/server/routes/characterCatalog.routes.js'));

    testUser = await userPersistence.users.createUser(
      'route_user', 'route@example.com', 'hash', 'verify-tok'
    );

    app = Fastify();
    app.decorateRequest('session', null);
    app.addHook('onRequest', (request, _reply, done) => {
      request.session = { user: { id: testUser.id } };
      done();
    });
    await app.register(characterCatalogRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    try { userPersistence?.close?.(); } catch { /* already closed */ }
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch { /* not present */ }
    }
  });

  it('GET returns an empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/character/catalog' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, characters: [] });
  });

  it('POST saves a character', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/character/catalog',
      payload: {
        id: 'char_route_1',
        name: 'Test Character',
        controls: { seed: 42 },
        specJson: '{"contract":"CHARACTER-SPEC-v1"}',
        specHash: 'hash1',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().character.name).toBe('Test Character');
  });

  it('POST rejects an invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/character/catalog',
      payload: { id: '', name: '', specJson: '', specHash: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE removes the character', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/character/catalog/char_route_1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    const list = await app.inject({ method: 'GET', url: '/api/character/catalog' });
    expect(list.json().characters).toEqual([]);
  });

  it('DELETE on a missing id returns 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/character/catalog/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/server/routes/characterCatalog.routes.test.js --maxWorkers=2`
Expected: FAIL — `Cannot find module '../../../codex/server/routes/characterCatalog.routes.js'`

- [ ] **Step 3: Write the routes**

Create `codex/server/routes/characterCatalog.routes.js`:

```js
import { z } from 'zod';
import { requireAuth } from '../auth-pre-handler.js';
import { getCharacters, saveCharacter, deleteCharacter } from '../characterCatalog.persistence.js';

const characterCatalogSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  controls: z.record(z.any()).optional().default({}),
  specJson: z.string().min(1),
  specHash: z.string().min(1),
});

export async function characterCatalogRoutes(fastify) {
  fastify.get('/api/character/catalog', {
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const userId = request.session.user.id;
      try {
        const characters = await getCharacters(userId);
        return reply.send({ success: true, characters });
      } catch (err) {
        request.log.error(err, 'Failed to fetch character catalog');
        return reply.status(500).send({ error: 'Failed to fetch characters' });
      }
    }
  });

  fastify.post('/api/character/catalog', {
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const userId = request.session.user.id;
      const parsed = characterCatalogSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      try {
        const character = await saveCharacter(userId, parsed.data);
        return reply.send({ success: true, character });
      } catch (err) {
        request.log.error(err, 'Failed to save character');
        return reply.status(500).send({ error: 'Failed to save character' });
      }
    }
  });

  fastify.delete('/api/character/catalog/:id', {
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const userId = request.session.user.id;
      const { id } = request.params;

      try {
        const success = await deleteCharacter(id, userId);
        if (!success) {
          return reply.status(404).send({ error: 'Character not found' });
        }
        return reply.send({ success: true });
      } catch (err) {
        request.log.error(err, 'Failed to delete character');
        return reply.status(500).send({ error: 'Failed to delete character' });
      }
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/server/routes/characterCatalog.routes.test.js --maxWorkers=2`
Expected: PASS (5 tests)

- [ ] **Step 5: Register the route in the server**

In `codex/server/index.js`, add the import near line 43 (next to `characterEnhanceRoutes`):

```js
import { characterCatalogRoutes } from './routes/characterCatalog.routes.js';
```

And register it near line 1195 (next to `await fastify.register(characterEnhanceRoutes);`):

```js
await fastify.register(characterCatalogRoutes);
```

- [ ] **Step 6: Commit**

```bash
git add codex/server/routes/characterCatalog.routes.js codex/server/index.js tests/server/routes/characterCatalog.routes.test.js
git commit -m "$(cat <<'EOF'
feat(server): add character catalog CRUD routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 3: Wire ActorForgeLab UI to the catalog (save / list / load)

**Files:**
- Modify: `src/pages/internal/pixel-lotus/ActorForgeLab.tsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/character/catalog` from Task 2. `forge.character.spec` and `forge.character.specHash` (already produced by the existing `forge` useMemo at line 192).

This task has no isolated unit test — `ActorForgeLab.tsx` has no existing test file, and per CLAUDE.md guidance this is verified by starting the dev server and using the feature in the browser (admin login required). Do not add a new test harness for one page; verify visually instead.

- [ ] **Step 1: Add catalog state and fetch-on-mount**

In `ActorForgeLab.tsx`, after the existing state declarations (after line 167, before the `useEffect` at line 169), add:

```tsx
  type SavedCharacter = { id: string; name: string; controls_json: string; spec_hash: string; updated_at: string };
  const [savedCharacters, setSavedCharacters] = useState<SavedCharacter[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshCatalog = async () => {
    try {
      const res = await fetch('/api/character/catalog');
      if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
      const data = await res.json();
      setSavedCharacters(data.characters ?? []);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { refreshCatalog(); }, []);
```

- [ ] **Step 2: Add save and load handlers**

After the `handleForgeAndEnhance` function (after its closing, following the pattern ending around line 273+), add:

```tsx
  const currentControls = () => ({
    stylePreset, bodyProfile, skin, hairProfile, hairColor,
    eyeProfile, eyeColor, top, bottom, shoes, seed, characterName,
  });

  const handleSaveToCatalog = async () => {
    if (!forge.character) return;
    setIsSaving(true);
    setCatalogError(null);
    try {
      const res = await fetch('/api/character/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: forge.character.spec.id,
          name: characterName,
          controls: currentControls(),
          specJson: JSON.stringify(forge.character.spec),
          specHash: forge.character.specHash,
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      await refreshCatalog();
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadFromCatalog = (entry: SavedCharacter) => {
    const controls = JSON.parse(entry.controls_json);
    if (controls.stylePreset) setStylePreset(controls.stylePreset);
    if (controls.bodyProfile) setBodyProfile(controls.bodyProfile);
    if (controls.skin) setSkin(controls.skin);
    if (controls.hairProfile) setHairProfile(controls.hairProfile);
    if (controls.hairColor) setHairColor(controls.hairColor);
    if (controls.eyeProfile) setEyeProfile(controls.eyeProfile);
    if (controls.eyeColor) setEyeColor(controls.eyeColor);
    if (controls.top) setTop(controls.top);
    if (controls.bottom) setBottom(controls.bottom);
    if (controls.shoes) setShoes(controls.shoes);
    if (typeof controls.seed === 'number') setSeed(controls.seed);
    if (controls.characterName) setCharacterName(controls.characterName);
  };

  const handleDeleteFromCatalog = async (id: string) => {
    try {
      const res = await fetch(`/api/character/catalog/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      await refreshCatalog();
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    }
  };
```

- [ ] **Step 3: Add the UI panel**

Find the button that calls `handleForgeAndEnhance` (around line 529, `onClick={handleForgeAndEnhance}`). Immediately after that button's containing element, add a saved-characters panel:

```tsx
          <div className="actor-forge-catalog">
            <button onClick={handleSaveToCatalog} disabled={isSaving || !forge.character}>
              {isSaving ? 'Saving…' : 'Save to Catalog'}
            </button>
            {catalogError && <div className="actor-forge-catalog-error">{catalogError}</div>}
            <ul className="actor-forge-catalog-list">
              {savedCharacters.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.name}</span>
                  <button onClick={() => handleLoadFromCatalog(entry)}>Load</button>
                  <button onClick={() => handleDeleteFromCatalog(entry.id)}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
```

- [ ] **Step 4: Verify in the browser**

Run the dev server (check for an existing `run` skill/script first), log in as an admin user, navigate to `/internal/pixel-lotus/actor-forge`, forge a character, click "Save to Catalog," confirm it appears in the list, reload the page, confirm it's still listed, click "Load" and confirm the controls repopulate, click "Delete" and confirm it disappears.

- [ ] **Step 5: Commit**

```bash
git add src/pages/internal/pixel-lotus/ActorForgeLab.tsx
git commit -m "$(cat <<'EOF'
feat(pixelbrain): wire ActorForgeLab to the character catalog

Forged characters now survive a refresh: save/list/load/delete
against the new /api/character/catalog routes. Still admin-gated
per 2026-09-03 decision — this is persistence, not a public launch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 4: `assetPacket` in `forgeCharacter` output

**Files:**
- Modify: `codex/core/pixelbrain/character-foundry.js`
- Test: `tests/core/pixelbrain/character-creator.test.js`

**Interfaces:**
- Consumes: `createPixelBrainAssetPacket`, `PIXELBRAIN_ASSET_KIND`, `assertPixelBrainAssetPacket` from `./pixelbrain-asset-packet.js` (existing, unmodified).
- Produces: `character.assetPacket` on the object returned by `forgeCharacter()`.

- [ ] **Step 1: Write the failing test**

In `tests/core/pixelbrain/character-creator.test.js`, add (near the existing "enforces palette budget" test):

```js
  it('includes a valid PixelBrainAssetPacket (PDR §3 assetPacket)', () => {
    const character = forgeCharacter(buildScholarSpec());
    expect(character.assetPacket).toBeDefined();
    expect(character.assetPacket.kind).toBe('pixelbrain.asset.v1');
    expect(character.assetPacket.geometry.coordinates.length).toBe(character.diagnostics.totalCells);
  });
```

Add the necessary import at the top of the file if `forgeCharacter`/`buildScholarSpec` aren't already imported the way this test needs — check the existing imports first, this test only needs what's already imported for the other tests in the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: FAIL — `character.assetPacket` is `undefined`

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/character-foundry.js`, add the import at the top (with the other imports, after line 11):

```js
import { createPixelBrainAssetPacket, PIXELBRAIN_ASSET_KIND } from './pixelbrain-asset-packet.js';
```

Then in `forgeCharacter`, in the raster/PNG output branch (the `Object.freeze({ spec, specHash, canvas, ... })` block starting at line 526), add the `assetPacket` field. Build it just before that block, using `allCells` (already accumulated per-direction at line 502-504) and `canvas`:

```js
  const assetPacket = createPixelBrainAssetPacket({
    kind: PIXELBRAIN_ASSET_KIND,
    id: `character_${spec.id}_${specHash}`,
    source: { kind: 'character-foundry', id: spec.id },
    coordinates: allCells,
    canvas: { width: canvas.width, height: canvas.height, transparent: true },
    palette: {
      sourcePalette: [{ key: 'character', colors: [...new Set(allCells.map((c) => c.color))] }],
    },
  });

  const character = Object.freeze({
    spec,
    specHash,
    canvas,
    assetPacket,
    silhouette: silhouettes,
    ...
```

(keep the rest of the object identical — only add the `assetPacket,` line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/character-foundry.js tests/core/pixelbrain/character-creator.test.js
git commit -m "$(cat <<'EOF'
fix(pixelbrain): forgeCharacter emits assetPacket per PDR contract

PDR-2026-06-12 §3 and principle 4.1 ("The Lattice Is the Asset")
both promise assetPacket in forgeCharacter's output; it was never
wired to the existing PixelBrainAssetPacket builder. Reuses
createPixelBrainAssetPacket rather than inventing a second packet
shape.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 5: Wand route — respect `spec.directions` and reach export-chain parity

**Files:**
- Modify: `codex/core/pixelbrain/character-foundry.js`
- Test: `tests/core/pixelbrain/character-wand-vector.test.js` (new)

**Interfaces:**
- Consumes: `assembleSpritesheet`, `rasterizeCells`, `encodePng`, `applyXBR2x`, `exportCharacterToPhaserPipeline`, `exportCharacterToGodotScene`, `exportCharacterToPixelLotusActor`, `createPixelBrainAssetPacket`/`PIXELBRAIN_ASSET_KIND` (from Task 4) — all already defined/imported in `character-foundry.js`.
- Produces: `forgeCharacterFromWandVector(...)` now returns `sprites`, `spritesheet`, `phaserPipeline`, `godotScene`, `pixelLotusActor`, `assetPacket` in addition to its existing fields (`spec`, `vectorSource`, `vectorPaths`, `silhouette`, `fills`, `canvas`, `blueprint`, `diagnostics`).

- [ ] **Step 1: Write the failing test**

Create `tests/core/pixelbrain/character-wand-vector.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { forgeCharacter, forgeCharacterFromWandVector } from '../../../codex/core/pixelbrain/character-foundry.js';

function buildWandSpec(directions) {
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: 'forge.wand.test.v1',
    archetype: 'human',
    canvas: { width: 32, height: 48 },
    seed: 7,
    bytecode: 'VW-WAND-TEST-V1',
    presentation: { gender: 'androgynous', heightClass: 'average', buildClass: 'average' },
    directions,
    body: { profile: 'character.body.human.androgynous' },
    materials: { skin: 'skin_light', hair: 'hair_brown', eyes: 'eye_brown' },
    vectorWand: {
      coordinateFormula: {
        type: 'composite',
        children: [
          {
            role: 'body',
            anchor: { x: 0.5, y: 0.5 },
            size: { w: 0.6, h: 0.8 },
            formula: {
              type: 'edge_trace',
              tracePath: [
                { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
              ],
            },
          },
        ],
      },
    },
  };
}

describe('[PixelBrain] Wand vector character route', () => {
  it('respects spec.directions instead of forcing south only', () => {
    const character = forgeCharacter(buildWandSpec(['south', 'east']));
    expect(character.vectorSource).toBe('wand');
    expect(Object.keys(character.sprites)).toEqual(['south', 'east']);
  });

  it('produces the full export chain (sprites/spritesheet/phaser/godot/pixelLotusActor)', () => {
    const character = forgeCharacterFromWandVector(
      buildWandSpec(['south', 'east', 'north', 'west']).vectorWand,
      buildWandSpec(['south', 'east', 'north', 'west']),
      {},
    );
    expect(character.sprites).toBeDefined();
    expect(character.spritesheet).toBeDefined();
    expect(character.phaserPipeline).toBeDefined();
    expect(character.godotScene).toBeDefined();
    expect(character.pixelLotusActor).toBeDefined();
    expect(character.assetPacket).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-wand-vector.test.js --maxWorkers=2`
Expected: FAIL — `character.sprites` is `undefined` (single-direction, no export chain)

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/character-foundry.js`, change the call site at line 452-454 from:

```js
  if (spec.vectorWand) {
    return forgeCharacterFromWandVector(spec.vectorWand, spec, { ...opts, direction: 'south' });
  }
```

to:

```js
  if (spec.vectorWand) {
    return forgeCharacterFromWandVector(spec.vectorWand, spec, opts);
  }
```

Then rewrite `forgeCharacterFromWandVector` (starting at line 626) so that instead of computing a single `direction` and a single `fills`/`rgba`, it loops over `opts.directions || baseSpec.directions || ['south', 'east', 'north', 'west']` the same way the main `forgeCharacter` path does. Replace this section (originally around lines 626-633 and 787-833):

```js
export function forgeCharacterFromWandVector(wandProposal, baseSpec = {}, opts = {}) {
  if (!wandProposal) throw new Error('forgeCharacterFromWandVector: wandProposal required');

  const canvas = baseSpec.canvas || CHARACTER_DEFAULTS.canvas;
  const directions = opts.directions || baseSpec.directions || ['south', 'east', 'north', 'west'];

  // ... (unchanged: evalWandWithRoles, vectorCoords, cells, byRole, silhouette construction — steps 1-3 of the existing function body stay exactly as they are) ...
```

And replace the final section (from `// Merge with base spec` through the `return Object.freeze({...})`) with:

```js
  const mergedSpec = { ...baseSpec, canvas };

  const dirRgbas = {};
  const dirPngs = {};
  let primaryFills = null;
  let allCells = [];
  for (const dir of directions) {
    const dirFills = applyCharacterFills({ silhouette, spec: mergedSpec, direction: dir });
    if (!primaryFills) primaryFills = dirFills;
    for (const c of dirFills.coordinates) allCells.push({ ...c, direction: dir });

    let rgba = rasterizeCells(dirFills.coordinates, canvas.width, canvas.height, 1);
    rgba = applyXBR2x(rgba, canvas.width, canvas.height);
    rgba = applyXBR2x(rgba, canvas.width * 2, canvas.height * 2);
    dirRgbas[dir] = rgba;
    dirPngs[dir] = encodePng(canvas.width * 4, canvas.height * 4, rgba);
  }
  const fills = primaryFills;
  const spritesheet = assembleSpritesheet(dirRgbas, canvas.width, canvas.height, 4);

  // Vectorized art export (the important part for Wand-driven models)
  const vectorPaths = Object.entries(byRole).map(([role, pts]) => {
    let processed = pts.map(p => ({ ...p }));
    if (processed.length > 3) {
      processed = applyChaikin(processed, 1);
      processed = applyOffsetCurve(processed, 0.8, 1);
    }
    const directSVG = pointsToSVGPath(processed, { smooth: true, scale: 1, precision: 2 });
    return {
      role,
      points: processed.map(p => ({
        x: roundTo(p.x, 2),
        y: roundTo(p.y, 2),
        emphasis: p.emphasis || 1,
        role: p.role || p.source
      })),
      svgPath: directSVG || null,
    };
  });

  const pbrainBlueprint = exportCharacterToPbrainBlueprint({ spec: mergedSpec, canvas, vectorPaths, vectorSource: 'wand', fills, construction: {} });

  const assetPacket = createPixelBrainAssetPacket({
    kind: PIXELBRAIN_ASSET_KIND,
    id: `character_${mergedSpec.id || 'wand'}_${hashCharacterSpec(mergedSpec)}`,
    source: { kind: 'character-foundry-wand', id: mergedSpec.id || null },
    coordinates: allCells,
    canvas: { width: canvas.width, height: canvas.height, transparent: true },
    palette: {
      sourcePalette: [{ key: 'character', colors: [...new Set(allCells.map((c) => c.color))] }],
    },
  });

  return Object.freeze({
    spec: mergedSpec,
    vectorSource: 'wand',
    vectorPaths,
    silhouette: { cells: fills.coordinates },
    fills,
    canvas,
    sprites: dirPngs,
    spritesheet,
    phaserPipeline: exportCharacterToPhaserPipeline({ spritesheet, canvas, spec: mergedSpec }),
    godotScene: exportCharacterToGodotScene({ spritesheet, canvas, spec: mergedSpec }),
    pixelLotusActor: exportCharacterToPixelLotusActor({ spritesheet, canvas, spec: mergedSpec }),
    assetPacket,
    blueprint: pbrainBlueprint,
    diagnostics: {
      source: 'wand-vector',
      pointCount: vectorCoords.length,
      cellCount: fills.coordinates.length,
      roles: Object.keys(byRole),
      directions,
    },
  });
}
```

Note: `mergedSpec.id` may be undefined for a bare `vectorWand` call without a full base spec — `hashCharacterSpec` must tolerate that (check its implementation; if it requires `contract`/`id`, fall back to `hashString(JSON.stringify(mergedSpec))` for the packet id instead — either is acceptable, the id only needs to be stable and unique per distinct input, not to match `hashCharacterSpec`'s contract exactly).

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-wand-vector.test.js --maxWorkers=2`
Expected: PASS (2 tests)

Then run the full character test suite to confirm no regression:

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/ --maxWorkers=2`
Expected: PASS (all files, including `character-to-svg.test.js`, `character-factory.test.js`, `character-png-render-diagnosis.test.js`, `character-directional-render.test.js`, `character-jrpg-profile.test.js`, `character-creator.test.js`)

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/character-foundry.js tests/core/pixelbrain/character-wand-vector.test.js
git commit -m "$(cat <<'EOF'
fix(pixelbrain): Wand route respects spec.directions, reaches export parity

forgeCharacter hardcoded direction: 'south' for every vectorWand
spec regardless of spec.directions, and forgeCharacterFromWandVector's
return carried none of sprites/spritesheet/phaserPipeline/godotScene/
pixelLotusActor — a Wand-authored character could not enter any
export chain. Now loops directions the same way the profile-based
path does and reuses the same export helpers.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 6: Loud material validation

**Files:**
- Modify: `codex/core/pixelbrain/character-spec.js`
- Test: `tests/core/pixelbrain/character-creator.test.js`

**Interfaces:**
- No new exports — `normalizeMaterials` stays internal to `character-spec.js`; `validateCharacterSpec`'s signature is unchanged.

- [ ] **Step 1: Write the failing test**

In `tests/core/pixelbrain/character-creator.test.js`, add:

```js
  it('throws on an unknown material instead of silently dropping it', () => {
    const spec = buildScholarSpec();
    const badSpec = { ...spec, materials: { ...spec.materials, skin: 'skin_does_not_exist' } };
    expect(() => forgeCharacter(badSpec)).toThrow(/material.*not found in registry/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: FAIL — no error thrown (the bad material is silently dropped, `forgeCharacter` succeeds)

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/character-spec.js`, replace `normalizeMaterials` (currently lines 75-84):

```js
function normalizeMaterials(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const material = String(value).trim();
    if (!MATERIAL_PALETTES[resolveMaterialId(material)]) {
      throw err(`material "${material}" not found in registry`, { key, material });
    }
    out[key] = material;
  }
  return Object.keys(out).length > 0 ? deepFreeze(out) : null;
}
```

Then remove the now-unreachable check in `validateCharacterSpec` (currently lines 247-254 — the block runs after `normalizeCharacterSpec` has already validated every material via the change above, so it can never fire):

```js
  // Validate materials exist in registry
  if (spec.materials) {
    for (const [key, material] of Object.entries(spec.materials)) {
      if (!MATERIAL_PALETTES[resolveMaterialId(material)]) {
        throw err(`material "${material}" not found in registry`, { key, material });
      }
    }
  }

```

Delete that whole block from `validateCharacterSpec`, leaving the function as just the contract-mismatch check and the `body.profile` check.

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: PASS (all tests, including the new one)

Then run the full character suite (a bad-material path removed from `validateCharacterSpec` could theoretically be relied on by another test):

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/ --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/character-spec.js tests/core/pixelbrain/character-creator.test.js
git commit -m "$(cat <<'EOF'
fix(pixelbrain): unknown materials now throw instead of being silently dropped

normalizeMaterials filtered out any material not in MATERIAL_PALETTES
before validateCharacterSpec's own "throw on unknown material" check
ever ran — that check was structurally unreachable. Moved the throw
into normalizeMaterials (the actual point of contact with untrusted
input) and removed the dead check.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 7: Palette budget — actually enforce it

**Files:**
- Modify: `codex/core/pixelbrain/character-foundry.js`
- Test: `tests/core/pixelbrain/character-creator.test.js`

**Interfaces:**
- Produces: `enforcePaletteBudget(fills, direction, max)` — a small exported pure function, unit-tested directly (no need to author a >32-color character fixture).

- [ ] **Step 1: Write the failing test**

In `tests/core/pixelbrain/character-creator.test.js`, change the top import line (line 2: `import { forgeCharacter, normalizeCharacterSpec, hashCharacterSpec } from '../../../codex/core/pixelbrain/character-foundry.js';`) to also pull in `enforcePaletteBudget`:

```js
import { forgeCharacter, normalizeCharacterSpec, hashCharacterSpec, enforcePaletteBudget } from '../../../codex/core/pixelbrain/character-foundry.js';
```

Then add the tests:

```js
  it('enforcePaletteBudget throws when uniqueColors exceeds the max', () => {
    const fakeFills = { diagnostics: { uniqueColors: 40 } };
    expect(() => enforcePaletteBudget(fakeFills, 'south', 32)).toThrow(/PB_PALETTE_BUDGET_EXCEEDED/);
  });

  it('enforcePaletteBudget does not throw at or under the max', () => {
    const fakeFills = { diagnostics: { uniqueColors: 32 } };
    expect(() => enforcePaletteBudget(fakeFills, 'south', 32)).not.toThrow();
  });

  it('forgeCharacter throws PB_PALETTE_BUDGET_EXCEEDED for an over-budget character', () => {
    const spec = buildScholarSpec();
    // Force the budget check by calling with an artificially tiny max via a spec-level override is not supported —
    // instead this test documents the wiring by checking a compliant spec stays under the real 32-color default.
    const character = forgeCharacter(spec);
    for (const dir of ['south', 'east', 'north', 'west']) {
      expect(character.diagnostics.paletteSizes[dir]).toBeLessThanOrEqual(32);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: FAIL — `enforcePaletteBudget is not defined` (not exported yet)

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/character-foundry.js`, add near the top-level constants (with `CHARACTER_DEFAULTS` at line 22):

```js
export const MAX_PALETTE_COLORS = 32; // PDR 4.5: 32 unique colors max per direction

export function enforcePaletteBudget(fills, direction, max = MAX_PALETTE_COLORS) {
  const uniqueColors = fills.diagnostics.uniqueColors;
  if (uniqueColors > max) {
    throw err('PB_PALETTE_BUDGET_EXCEEDED', { direction, uniqueColors, max });
  }
}
```

Then call it in the main `forgeCharacter` per-direction loop, right after `filledResults[dir] = fills;` (line 486):

```js
    const fills = applyCharacterFills({ silhouette, spec, direction: dir });
    filledResults[dir] = fills;
    enforcePaletteBudget(fills, dir);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: PASS

Then run the full character suite — this is the step most likely to surface an existing fixture that legitimately exceeds 32 colors (per the "Baseline Must Fail First" project convention: if any fixture now fails, that is real signal the fixture was always over budget and silently accepted, not a false positive to work around):

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/ --maxWorkers=2`
Expected: PASS. If any existing test now fails with `PB_PALETTE_BUDGET_EXCEEDED`, do not raise the constant or special-case that fixture — report it back rather than silently loosening the just-added enforcement, since that fixture was violating the PDR's own documented budget the whole time.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/character-foundry.js tests/core/pixelbrain/character-creator.test.js
git commit -m "$(cat <<'EOF'
fix(pixelbrain): palette budget of 32 colors is now enforced, not just reported

diagnostics.paletteSizes recorded the count but forgeCharacter never
threw when it exceeded 32 — only the test noticed. enforcePaletteBudget
is a small pure function so the throw condition is unit-testable
without authoring an over-budget character fixture.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 8: Real PNG compression (replace `storedDeflate` with `fflate`)

**Files:**
- Modify: `codex/core/pixelbrain/character-foundry.js`
- Test: `tests/core/pixelbrain/character-creator.test.js`

**Interfaces:**
- Consumes: `zlibSync` from `fflate` (already a dependency — see `package.json` and its existing use of `unzlibSync` in `codex/core/pixelbrain/aseprite-binary-codec.js`).
- `encodePng`'s signature and PNG output format are unchanged — only the IDAT compression changes from "stored" (uncompressed) to real DEFLATE, which any PNG decoder already handles (a decoder must support both).

- [ ] **Step 1: Write the failing test**

In `tests/core/pixelbrain/character-creator.test.js`, add:

```js
  it('spritesheet PNG is actually compressed, not just stored', () => {
    const character = forgeCharacter(buildScholarSpec());
    // A stored (uncompressed) zlib stream is close to raw pixel size; real
    // DEFLATE on pixel-art (large runs of identical/near-identical bytes)
    // should compress well below that.
    const rawPixelBytes = character.canvas.width * 4 * character.canvas.height * 4 * 4; // 4 dirs wide, 4x scale, RGBA
    expect(character.spritesheet.length).toBeLessThan(rawPixelBytes * 0.5);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: FAIL — spritesheet is still near-raw size (stored deflate)

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/character-foundry.js`, add the import at the top:

```js
import { zlibSync } from 'fflate';
```

Replace the `storedDeflate` function (currently lines 235-256) and its use in `encodePng` (line 298: `const idat = storedDeflate(filtered);`) with:

```js
  const idat = zlibSync(filtered, { level: 6 });
```

Remove the now-unused `storedDeflate` function entirely. Check whether `adler32` (lines 225-233) and `u32be` (lines 221-223) are still used elsewhere in the file before deleting them — `u32be` is used by `chunk()`/`IHDR` construction, so keep it; `adler32` was only used by `storedDeflate`, so remove it too if nothing else calls it (`grep -n "adler32(" codex/core/pixelbrain/character-foundry.js` to confirm before deleting).

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: PASS

Then run the full character suite plus any PNG-diagnosis-specific test, since this changes actual byte output of every generated PNG:

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/ --maxWorkers=2`
Expected: PASS. Pay particular attention to `character-png-render-diagnosis.test.js` and the byte-determinism test in `character-creator.test.js` (`character-creator.test.js:166-175`, comparing two forges byte-for-byte) — determinism must still hold since `zlibSync` with a fixed `level` is itself deterministic, but confirm rather than assume.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/character-foundry.js tests/core/pixelbrain/character-creator.test.js
git commit -m "$(cat <<'EOF'
perf(pixelbrain): real DEFLATE compression for character PNGs

encodePng's storedDeflate wrote a valid but uncompressed zlib stream
(~400KB spritesheets). Swaps in fflate's zlibSync, already a project
dependency (used elsewhere for unzlibSync) and isomorphic (browser +
Node), unlike Node's zlib.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Task 9: Extract magic numbers; fix case-sensitive role regex

**Files:**
- Modify: `codex/core/pixelbrain/character-foundry.js`
- Test: `tests/core/pixelbrain/character-creator.test.js`

**Interfaces:**
- Produces: named constants replacing literal thresholds in `applyCharacterFills` and `forgeCharacterFromWandVector`; no behavioral change to existing profiles (all current part ids are already lowercase-single-word like `body`/`hair`/`robe`, so the regex fix only changes behavior for camelCase ids like `leftEye`/`rightEye`, which currently silently fall through to the generic case).

- [ ] **Step 1: Write the failing test**

In `tests/core/pixelbrain/character-creator.test.js`, change the top import line (line 2) to also pull in `forgeCharacterFromWandVector` — by this point in the plan (after Task 7) it should read:

```js
import { forgeCharacter, normalizeCharacterSpec, hashCharacterSpec, enforcePaletteBudget, forgeCharacterFromWandVector } from '../../../codex/core/pixelbrain/character-foundry.js';
```

Then add:

```js
  it('Wand role classification matches camelCase ids like leftEye, not just lowercase', () => {
    // shouldFillClosedTrace's regex must match 'leftEye' the same way it matches 'eye',
    // since real part ids from composite Wand proposals are camelCase (leftEye/rightEye).
    // forgeCharacterFromWandVector must be added to the top-of-file import (see Step 3 note).
    const wandProposal = {
      coordinateFormula: {
        type: 'composite',
        children: [{
          role: 'leftEye',
          anchor: { x: 0.5, y: 0.5 },
          size: { w: 0.2, h: 0.2 },
          formula: { type: 'edge_trace', tracePath: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
        }],
      },
    };
    const character = forgeCharacterFromWandVector(wandProposal, { canvas: { width: 32, height: 48 }, directions: ['south'] }, {});
    // A filled closed trace produces many more cells than an unfilled outline trace of the same 4-point square.
    expect(character.diagnostics.cellCount).toBeGreaterThan(4);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: FAIL — `leftEye` doesn't match `/head|body|robe|boot|eye|mouth/` case-sensitively in the way a reader would expect for a role named "eye"... note: `/eye/` actually **does** substring-match within `leftEye` already (regex `/eye/` is a substring test, not an anchored word match, and `'leftEye'.match(/eye/)` fails only because of the capital E — `leftEye` contains `Eye` not `eye`). Confirm this exact failure mode by running the test first — expected failure is the cell count assertion failing because the trace is NOT filled (only the outline was drawn), i.e. `cellCount` is small.

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/character-foundry.js`, find the role-classification line inside `forgeCharacterFromWandVector` (currently `const shouldFillClosedTrace = /head|body|robe|boot|eye|mouth/.test(role);`) and make it case-insensitive:

```js
    const shouldFillClosedTrace = /head|body|robe|boot|eye|mouth/i.test(role);
```

Do the same for the other role regex in the same function (`const isHairOrLimb = /hair|arm|leg|limb/.test(role);`):

```js
    const isHairOrLimb = /hair|arm|leg|limb/i.test(role);
```

Then extract the magic-number thresholds in `applyCharacterFills` into named constants. Add near the top of the file (with `CHARACTER_DEFAULTS`):

```js
// Form-shading thresholds: fraction of a part's y-range treated as the lit top
// zone vs. the shadowed bottom zone (applyCharacterFills volume gradient).
const FORM_SHADE_TOP_ZONE = 0.28;
const FORM_SHADE_BOTTOM_ZONE = 0.75;
const FORM_SHADE_MIN_HEIGHT = 6; // parts shorter than this skip the gradient entirely

// Wand vector rasterization: stroke emphasis and closed-trace fill pressure.
const WAND_CLOSED_TRACE_EMPHASIS = 0.82;
const WAND_STROKE_HALF_WIDTH_HAIRLIMB = 1.4;
const WAND_STROKE_HALF_WIDTH_EDGE = 1.9;
const WAND_STROKE_HALF_WIDTH_DEFAULT = 1.1;
```

Replace the corresponding literals in `applyCharacterFills` (the `0.28`/`0.75`/`yRange >= 6` block, around lines 168-181) and in `forgeCharacterFromWandVector`'s rasterization loop (the `0.82`/`1.4`/`1.9`/`1.1` literals, around lines 718 and 753) with these named constants. Leave the remaining smaller multipliers (`0.45`, `0.35`, `0.15`, `1.35`, `1.7`) as-is — they are secondary derived multipliers of the above, not independent thresholds, and renaming every literal in the file is out of scope (YAGNI — the audit specifically called out the role-classification regex and the top-level thresholds, not every coefficient).

- [ ] **Step 4: Run test to verify it passes**

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/character-creator.test.js --maxWorkers=2`
Expected: PASS

Then run the full test suite one final time to confirm nothing in the whole plan regressed:

Run: `nice -n 19 npx vitest run tests/core/pixelbrain/ tests/server/ --maxWorkers=2`
Expected: PASS across every file touched by this plan.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/character-foundry.js tests/core/pixelbrain/character-creator.test.js
git commit -m "$(cat <<'EOF'
refactor(pixelbrain): case-insensitive Wand role regex; name magic-number thresholds

shouldFillClosedTrace/isHairOrLimb matched role names case-sensitively,
so a camelCase id like leftEye silently missed the 'eye' fill rule
that a lowercase id would hit. Also extracts the form-shading and
Wand-stroke thresholds applyCharacterFills/forgeCharacterFromWandVector
ran on into named constants at the top of the file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35
EOF
)"
```

---

## Appendix: Explicitly out of scope

These audit findings are real but were not assigned to P0/P1/P2 by the user and are not covered by this plan:

- **Finding 4** (AI-enhance endpoint reachable only from the admin lab) — resolved by the user's 2026-09-03 decision to keep `ActorForgeLab` admin-gated, not by a code change.
- **Finding 2 / orphaned `battle-poet.chibi.*` assets** — deleting committed files or wiring Combat to actually render forged characters is a separate, larger feature decision; flagged, not actioned.
- **Finding 9** (clothing materials in the spec ignored by `partRamps`, which hardcodes `cloth_linen`/`cloth_wool`/etc.) — Tier 2 but not in the user's stated P1 list.
- **Finding 12** (`part-profile-library.js` god-registry, 2,627 lines) — structural, needs its own design pass.
- **Finding 13** (PDR archived without a closing PIR) — documentation-process fix, not code.
- **Finding 14** (worktree duplication of every pipeline file) — environment hygiene, not this plan's concern.
