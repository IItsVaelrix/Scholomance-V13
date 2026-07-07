# Read Pro Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a freemium Stripe-backed subscription ("Read Pro") to the live Read app, with server-derived entitlement and server-enforced feature gates.

**Architecture:** A new `subscriptions` table and a pure `deriveEntitlement()` module produce a per-request entitlement snapshot attached by an auth pre-handler. Server gates (`requireProEntitlement`) protect scroll-creation, corpus search, full analysis, and rhyme astrology. Stripe Checkout + Billing Portal drive purchases; a signature-verified webhook is the **only** writer of entitlement. The client renders lock/upgrade affordances but never decides access.

**Tech Stack:** Node 20, Fastify, `@fastify/session` (session-based auth), better-sqlite3 via a `db.execute(sql, params)` wrapper, Vitest 4, React + Vite + react-router, Stripe Node SDK.

**Source spec:** `docs/scholomance-encyclopedia/PDR-archive/PDR-2026-06-27-READ-PRO-MONETIZATION.md`

## Global Constraints

- **Server is the only source of truth for entitlement.** Client fields (`entitlement`, `plan`, localStorage) are never trusted; every gated action is re-checked server-side.
- **The Stripe webhook is the only writer of entitlement.** Checkout success redirects are cosmetic and must not unlock Pro by themselves.
- **Non-destructive downgrade.** Losing Pro never deletes or hides scrolls; only *new* gated actions are blocked.
- **Prices are env-backed.** Client sends only local plan keys (`pro_monthly` | `pro_annual`); the server maps them to `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_ANNUAL`. Never accept arbitrary Stripe Price IDs from the client.
- **Free scroll limit** = `SCHOLO_FREE_SCROLL_LIMIT` (default `3`).
- **Standard error contract** for gates: `{ error: 'PRO_REQUIRED', message, upgradeUrl: '/pricing' }` (402); scroll limit: `{ error: 'FREE_SCROLL_LIMIT_REACHED', limit, upgradeUrl: '/pricing' }` (402).
- **Migrations** are appended as objects to the `USER_MIGRATIONS` array in `codex/server/user.persistence.js` (shape `{ version, name, up(database) }`, body uses `database.exec(...)`). The DB access pattern elsewhere is `await db.execute(sql, params)` returning `{ rows, rowsAffected }`.
- **Subscription status vocabulary:** `none | trialing | active | past_due | canceled | incomplete | unpaid`. Plan vocabulary: `free | pro_monthly | pro_annual`. Entitlement: `free | pro`. Source: `none | admin | subscription`.
- **Backend tests** live under `tests/qa/backend/` and run with `npx vitest run <path>`.

---

## File Structure

**Create (backend):**
- `codex/server/lib/entitlement.js` — pure `deriveEntitlement()` (no I/O, no Stripe).
- `codex/server/subscriptions.persistence.js` — subscription table reads/writes + scroll count.
- `codex/server/services/billing.service.js` — Stripe SDK wrapper.
- `codex/server/routes/billing.routes.js` — `/api/billing/*` routes.
- `codex/server/lib/proGate.js` — `requireProEntitlement(request, reply)` + `resolveEntitlement(request)`.

**Create (frontend):**
- `src/hooks/useEntitlement.js`
- `src/lib/entitlement.js` (client `isProUser`, `canUseFeature`)
- `src/components/ProGate.jsx`
- `src/components/ProRoute.jsx`
- `src/pages/Pricing/PricingPage.jsx` (+ `.css`)
- `src/pages/Account/BillingPage.jsx` (+ `.css`)

**Create (tests):**
- `tests/qa/backend/entitlement.derive.test.js`
- `tests/qa/backend/subscriptions.persistence.test.js`
- `tests/qa/backend/proGate.test.js`
- `tests/qa/backend/billing.webhook.test.js`

**Modify:**
- `codex/server/user.persistence.js` — append migration + `subscriptions` export object.
- `codex/server/auth-pre-handler.js` — attach `request.entitlement`.
- `codex/server/index.js` — register billing routes; gate `POST /api/scrolls/:id`; include entitlement in `/auth/me` payload (or wherever the me payload is built — see Task 4).
- `codex/server/routes/corpus.routes.js` — add Pro gate.
- `codex/server/routes/panelAnalysis.routes.js` — add full-analysis Pro gate.
- `codex/server/routes/rhymeAstrology.routes.js` — add Pro gate.
- `src/context/AuthContext.jsx` — extend `UserSchema` with optional entitlement; expose helpers.
- `.env.example` — document new env vars.

---

## Phase 1 — Entitlement Spine (no Stripe)

### Task 1: `subscriptions` table + persistence module

**Files:**
- Modify: `codex/server/user.persistence.js` (append to `USER_MIGRATIONS`; add `subscriptions` to the exported persistence object)
- Create: `codex/server/subscriptions.persistence.js`
- Test: `tests/qa/backend/subscriptions.persistence.test.js`

**Interfaces:**
- Produces (on the exported persistence object, alongside `scrolls`):
  - `subscriptions.getByUserId(userId) -> Promise<Row|null>`
  - `subscriptions.getByStripeCustomerId(id) -> Promise<Row|null>`
  - `subscriptions.getByStripeSubscriptionId(id) -> Promise<Row|null>`
  - `subscriptions.upsert({ userId, stripeCustomerId, stripeSubscriptionId, status, plan, currentPeriodEnd, cancelAtPeriodEnd, lastStripeEventId }) -> Promise<Row>`
  - `subscriptions.countScrollsForUser(userId) -> Promise<number>`
- Row shape: `{ userId, stripeCustomerId, stripeSubscriptionId, status, plan, currentPeriodEnd, cancelAtPeriodEnd (0|1), lastStripeEventId, updatedAt }`

- [ ] **Step 1: Add the migration.** In `codex/server/user.persistence.js`, append a new object to the END of the `USER_MIGRATIONS` array (use the next sequential `version` number after the current last entry):

```js
{
  version: /* next sequential number */,
  name: 'add_read_pro_subscriptions',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        userId               INTEGER PRIMARY KEY,
        stripeCustomerId     TEXT,
        stripeSubscriptionId TEXT,
        status               TEXT NOT NULL DEFAULT 'none',
        plan                 TEXT NOT NULL DEFAULT 'free',
        currentPeriodEnd     INTEGER,
        cancelAtPeriodEnd    INTEGER NOT NULL DEFAULT 0,
        lastStripeEventId    TEXT,
        updatedAt            INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (userId) REFERENCES users (id)
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripeSub
        ON subscriptions (stripeSubscriptionId);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
        ON subscriptions (stripeCustomerId);
    `);
  },
},
```

- [ ] **Step 2: Create the persistence module.** `codex/server/subscriptions.persistence.js`:

```js
// Subscription persistence. The vault, not the oracle: no Stripe SDK, no
// entitlement logic, no response shaping. `db` is the shared wrapper passed in.
export function createSubscriptionsPersistence(db) {
  async function getByUserId(userId) {
    const r = await db.execute('SELECT * FROM subscriptions WHERE userId = ?', [userId]);
    return r.rows[0] || null;
  }
  async function getByStripeCustomerId(stripeCustomerId) {
    const r = await db.execute('SELECT * FROM subscriptions WHERE stripeCustomerId = ?', [stripeCustomerId]);
    return r.rows[0] || null;
  }
  async function getByStripeSubscriptionId(stripeSubscriptionId) {
    const r = await db.execute('SELECT * FROM subscriptions WHERE stripeSubscriptionId = ?', [stripeSubscriptionId]);
    return r.rows[0] || null;
  }
  async function upsert(sub) {
    const now = Date.now();
    await db.execute(`
      INSERT INTO subscriptions
        (userId, stripeCustomerId, stripeSubscriptionId, status, plan,
         currentPeriodEnd, cancelAtPeriodEnd, lastStripeEventId, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET
        stripeCustomerId     = excluded.stripeCustomerId,
        stripeSubscriptionId = excluded.stripeSubscriptionId,
        status               = excluded.status,
        plan                 = excluded.plan,
        currentPeriodEnd     = excluded.currentPeriodEnd,
        cancelAtPeriodEnd    = excluded.cancelAtPeriodEnd,
        lastStripeEventId    = excluded.lastStripeEventId,
        updatedAt            = excluded.updatedAt
    `, [
      sub.userId, sub.stripeCustomerId ?? null, sub.stripeSubscriptionId ?? null,
      sub.status ?? 'none', sub.plan ?? 'free', sub.currentPeriodEnd ?? null,
      sub.cancelAtPeriodEnd ? 1 : 0, sub.lastStripeEventId ?? null, now,
    ]);
    return getByUserId(sub.userId);
  }
  async function countScrollsForUser(userId) {
    const r = await db.execute('SELECT COUNT(*) AS n FROM scrolls WHERE userId = ?', [userId]);
    return Number(r.rows[0]?.n ?? 0);
  }
  return { getByUserId, getByStripeCustomerId, getByStripeSubscriptionId, upsert, countScrollsForUser };
}
```

- [ ] **Step 3: Wire it into the persistence export.** In `user.persistence.js`, import `createSubscriptionsPersistence`, call it with the same `db` wrapper the scroll functions use, and add `subscriptions: createSubscriptionsPersistence(db)` to the exported persistence object (the same object literal that already exposes `scrolls: { ... }`).

- [ ] **Step 4: Write the failing test.** `tests/qa/backend/subscriptions.persistence.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createSubscriptionsPersistence } from '../../../codex/server/subscriptions.persistence.js';

// In-memory fake of the db.execute wrapper.
function makeFakeDb() {
  const subs = new Map();      // userId -> row
  const scrolls = [];          // {userId}
  return {
    _scrolls: scrolls,
    async execute(sql, params) {
      if (sql.includes('FROM subscriptions WHERE userId')) {
        return { rows: subs.has(params[0]) ? [subs.get(params[0])] : [] };
      }
      if (sql.startsWith('\n      INSERT INTO subscriptions') || sql.includes('INSERT INTO subscriptions')) {
        const [userId, stripeCustomerId, stripeSubscriptionId, status, plan, currentPeriodEnd, cancelAtPeriodEnd, lastStripeEventId, updatedAt] = params;
        subs.set(userId, { userId, stripeCustomerId, stripeSubscriptionId, status, plan, currentPeriodEnd, cancelAtPeriodEnd, lastStripeEventId, updatedAt });
        return { rowsAffected: 1 };
      }
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ n: scrolls.filter((s) => s.userId === params[0]).length }] };
      }
      return { rows: [] };
    },
  };
}

describe('subscriptions.persistence', () => {
  let db, repo;
  beforeEach(() => { db = makeFakeDb(); repo = createSubscriptionsPersistence(db); });

  it('upserts and reads back a subscription', async () => {
    await repo.upsert({ userId: 1, status: 'active', plan: 'pro_monthly' });
    const row = await repo.getByUserId(1);
    expect(row.status).toBe('active');
    expect(row.plan).toBe('pro_monthly');
  });

  it('returns null for a user with no subscription', async () => {
    expect(await repo.getByUserId(999)).toBeNull();
  });

  it('counts scrolls for a user', async () => {
    db._scrolls.push({ userId: 1 }, { userId: 1 }, { userId: 2 });
    expect(await repo.countScrollsForUser(1)).toBe(2);
  });

  it('coerces cancelAtPeriodEnd to 0/1', async () => {
    await repo.upsert({ userId: 5, cancelAtPeriodEnd: true });
    expect((await repo.getByUserId(5)).cancelAtPeriodEnd).toBe(1);
  });
});
```

- [ ] **Step 5: Run the test, expect FAIL** (module exists but assertions exercise it):

Run: `npx vitest run tests/qa/backend/subscriptions.persistence.test.js`
Expected: PASS once Step 2 is in place. If it fails, fix the module — not the test.

- [ ] **Step 6: Commit**

```bash
git add codex/server/user.persistence.js codex/server/subscriptions.persistence.js tests/qa/backend/subscriptions.persistence.test.js
git commit -m "feat(billing): subscriptions table + persistence module"
```

---

### Task 2: Pure `deriveEntitlement()` module

**Files:**
- Create: `codex/server/lib/entitlement.js`
- Test: `tests/qa/backend/entitlement.derive.test.js`

**Interfaces:**
- Consumes: `isAdminUser` — replicate the check locally (admin if `user.isAdmin === true` OR `String(user.role).toLowerCase() === 'admin'`; the env allowlist is a frontend concern via `import.meta.env`, so server-side admin override here uses only `isAdmin`/`role`).
- Produces: `deriveEntitlement({ user, subscription, now }) -> EntitlementSnapshot` where
  `EntitlementSnapshot = { entitlement: 'free'|'pro', plan, source: 'none'|'admin'|'subscription', status, currentPeriodEnd: number|null, cancelAtPeriodEnd: boolean }`

- [ ] **Step 1: Write the failing test.** `tests/qa/backend/entitlement.derive.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveEntitlement } from '../../../codex/server/lib/entitlement.js';

const NOW = 1_000_000;           // arbitrary "now"
const FUTURE = NOW + 1000;
const PAST = NOW - 1000;
const sub = (o) => ({ status: 'none', plan: 'free', currentPeriodEnd: null, cancelAtPeriodEnd: 0, ...o });

describe('deriveEntitlement', () => {
  it('admin with no subscription -> pro/admin', () => {
    const r = deriveEntitlement({ user: { isAdmin: true }, subscription: null, now: NOW });
    expect(r.entitlement).toBe('pro'); expect(r.source).toBe('admin');
  });
  it('admin with canceled subscription -> pro/admin', () => {
    const r = deriveEntitlement({ user: { role: 'admin' }, subscription: sub({ status: 'canceled' }), now: NOW });
    expect(r.entitlement).toBe('pro'); expect(r.source).toBe('admin');
  });
  it('normal user, no row -> free/none', () => {
    const r = deriveEntitlement({ user: {}, subscription: null, now: NOW });
    expect(r.entitlement).toBe('free'); expect(r.source).toBe('none');
  });
  it('active -> pro/subscription', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'active', plan: 'pro_monthly' }), now: NOW }).entitlement).toBe('pro');
  });
  it('trialing -> pro', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'trialing' }), now: NOW }).entitlement).toBe('pro');
  });
  it('past_due before period end -> pro', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'past_due', currentPeriodEnd: FUTURE }), now: NOW }).entitlement).toBe('pro');
  });
  it('past_due after period end -> free', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'past_due', currentPeriodEnd: PAST }), now: NOW }).entitlement).toBe('free');
  });
  it('cancelAtPeriodEnd before period end -> pro', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'active', cancelAtPeriodEnd: 1, currentPeriodEnd: FUTURE }), now: NOW }).entitlement).toBe('pro');
  });
  it('cancelAtPeriodEnd after period end -> free', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'canceled', cancelAtPeriodEnd: 1, currentPeriodEnd: PAST }), now: NOW }).entitlement).toBe('free');
  });
  it('canceled immediately -> free', () => {
    expect(deriveEntitlement({ user: {}, subscription: sub({ status: 'canceled', currentPeriodEnd: null }), now: NOW }).entitlement).toBe('free');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`deriveEntitlement is not a function`):

Run: `npx vitest run tests/qa/backend/entitlement.derive.test.js`
Expected: FAIL — module not found / not a function.

- [ ] **Step 3: Implement.** `codex/server/lib/entitlement.js`:

```js
const PRO_STATUSES = new Set(['active', 'trialing']);

function isAdmin(user) {
  if (!user) return false;
  if (user.isAdmin === true) return true;
  return String(user.role || '').toLowerCase() === 'admin';
}

const FREE_SNAPSHOT = (sub) => ({
  entitlement: 'free',
  plan: sub?.plan ?? 'free',
  source: 'none',
  status: sub?.status ?? 'none',
  currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
});

export function deriveEntitlement({ user, subscription, now = Date.now() }) {
  if (isAdmin(user)) {
    return {
      entitlement: 'pro', plan: subscription?.plan ?? 'free', source: 'admin',
      status: subscription?.status ?? 'none',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    };
  }
  const sub = subscription;
  if (!sub) return FREE_SNAPSHOT(null);

  const periodActive = sub.currentPeriodEnd != null && now < sub.currentPeriodEnd;
  const pro =
    PRO_STATUSES.has(sub.status) ||
    (sub.status === 'past_due' && periodActive) ||
    (Boolean(sub.cancelAtPeriodEnd) && periodActive);

  if (!pro) return FREE_SNAPSHOT(sub);
  return {
    entitlement: 'pro', plan: sub.plan, source: 'subscription', status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
  };
}
```

- [ ] **Step 4: Run, expect PASS** (all 10 cases):

Run: `npx vitest run tests/qa/backend/entitlement.derive.test.js`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add codex/server/lib/entitlement.js tests/qa/backend/entitlement.derive.test.js
git commit -m "feat(billing): pure deriveEntitlement with full truth table"
```

---

### Task 3: Resolve + attach entitlement per request

**Files:**
- Create: `codex/server/lib/proGate.js`
- Modify: `codex/server/auth-pre-handler.js`

**Interfaces:**
- Consumes: `deriveEntitlement` (Task 2); `userPersistence.subscriptions.getByUserId` (Task 1); the session user at `request.session.user`.
- Produces:
  - `resolveEntitlement(request, deps) -> Promise<EntitlementSnapshot>` (deps = `{ subscriptions }`)
  - `requireProEntitlement(request, reply) -> Promise<boolean>` (replies 402 + returns `false` when free; returns `true` when pro)

- [ ] **Step 1: Implement the gate helpers.** `codex/server/lib/proGate.js`:

```js
import { deriveEntitlement } from './entitlement.js';

const FREE = { entitlement: 'free', plan: 'free', source: 'none', status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false };

export async function resolveEntitlement(request, { subscriptions }) {
  const user = request.session?.user;
  if (!user) return FREE;
  const subscription = await subscriptions.getByUserId(user.id);
  return deriveEntitlement({ user, subscription, now: Date.now() });
}

export function isProEntitled(request) {
  return request.entitlement?.entitlement === 'pro';
}

export async function requireProEntitlement(request, reply, feature) {
  if (isProEntitled(request)) return true;
  reply.code(402).send({
    error: 'PRO_REQUIRED',
    message: 'This action requires Read Pro.',
    ...(feature ? { feature } : {}),
    upgradeUrl: '/pricing',
  });
  return false;
}
```

- [ ] **Step 2: Attach in the auth pre-handler.** In `codex/server/auth-pre-handler.js`, after the session user is confirmed, populate `request.entitlement`. Import `resolveEntitlement` and the persistence module already used by the server, then within the authenticated branch:

```js
import { resolveEntitlement } from './lib/proGate.js';
// ...inside the pre-handler, once request.session.user is known to exist:
request.entitlement = await resolveEntitlement(request, { subscriptions: userPersistence.subscriptions });
```

If `auth-pre-handler.js` does not already import the persistence module, add `import { userPersistence } from './user.persistence.js'` (match the existing export name — verify by reading the file's other imports). For unauthenticated requests, leave `request.entitlement` undefined; gates treat that as free.

- [ ] **Step 3: Unit-test the gate helper.** Add to `tests/qa/backend/proGate.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { requireProEntitlement, isProEntitled, resolveEntitlement } from '../../../codex/server/lib/proGate.js';

function fakeReply() {
  return { _code: 200, _body: null, code(c) { this._code = c; return this; }, send(b) { this._body = b; return this; } };
}

describe('proGate', () => {
  it('allows pro requests', async () => {
    const reply = fakeReply();
    const ok = await requireProEntitlement({ entitlement: { entitlement: 'pro' } }, reply, 'corpus_search');
    expect(ok).toBe(true); expect(reply._code).toBe(200);
  });
  it('rejects free requests with 402 + contract', async () => {
    const reply = fakeReply();
    const ok = await requireProEntitlement({ entitlement: { entitlement: 'free' } }, reply, 'corpus_search');
    expect(ok).toBe(false);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'PRO_REQUIRED', feature: 'corpus_search', upgradeUrl: '/pricing' });
  });
  it('resolveEntitlement returns free when no session user', async () => {
    const snap = await resolveEntitlement({ session: {} }, { subscriptions: { getByUserId: vi.fn() } });
    expect(snap.entitlement).toBe('free');
  });
  it('resolveEntitlement loads subscription for a session user', async () => {
    const subscriptions = { getByUserId: vi.fn().mockResolvedValue({ status: 'active', plan: 'pro_annual', currentPeriodEnd: null, cancelAtPeriodEnd: 0 }) };
    const snap = await resolveEntitlement({ session: { user: { id: 7 } } }, { subscriptions });
    expect(subscriptions.getByUserId).toHaveBeenCalledWith(7);
    expect(snap.entitlement).toBe('pro');
  });
});
```

- [ ] **Step 4: Run, expect PASS:**

Run: `npx vitest run tests/qa/backend/proGate.test.js`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add codex/server/lib/proGate.js codex/server/auth-pre-handler.js tests/qa/backend/proGate.test.js
git commit -m "feat(billing): resolve + attach entitlement per request, gate helper"
```

---

### Task 4: `GET /api/billing/status` + entitlement in the `/auth/me` payload

**Files:**
- Create: `codex/server/routes/billing.routes.js` (status route only for now; checkout/portal/webhook added in Phase 4)
- Modify: `codex/server/index.js` (register billing routes; include `entitlement` in the `/auth/me` user payload — locate where `request.session.user` is serialized for the me/login response)

**Interfaces:**
- Consumes: `request.entitlement` (Task 3).
- Produces: `GET /api/billing/status` → the `EntitlementSnapshot`; `/auth/me` user object gains an `entitlement` field.

- [ ] **Step 1: Create the route module** (status only):

```js
// codex/server/routes/billing.routes.js
export async function billingRoutes(fastify, opts) {
  const { requireAuth } = opts;
  fastify.get('/api/billing/status', { preHandler: [requireAuth] }, async (request) => {
    return request.entitlement ?? { entitlement: 'free', plan: 'free', source: 'none', status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false };
  });
}
```

- [ ] **Step 2: Register it in `index.js`.** Near the other `fastify.register(...Routes...)` calls, add:

```js
import { billingRoutes } from './routes/billing.routes.js';
// ...with the others:
fastify.register(billingRoutes, { requireAuth });
```

(`requireAuth` is the existing preHandler used by `GET /api/scrolls`; pass the same reference.)

- [ ] **Step 3: Add entitlement to the me payload.** Find where the authenticated user is returned (the `/auth/me` handler, likely in `codex/server/routes/auth.routes.js` or where `request.session.user` is echoed). Include the snapshot:

```js
return { user: { ...sessionUser, entitlement: request.entitlement } };
```

Verify the exact current response shape first and preserve every existing field — only add `entitlement`.

- [ ] **Step 4: Manual verification.** Start the server (`npm run dev:server`) and, logged in, hit `GET /api/billing/status` (browser/curl with session cookie). Expected JSON: `{"entitlement":"free","plan":"free","source":"none",...}` for a normal user. Seed a row manually (`subscriptions.upsert({ userId, status:'active', plan:'pro_monthly' })` via a one-off script) and confirm it flips to `pro`.

- [ ] **Step 5: Commit**

```bash
git add codex/server/routes/billing.routes.js codex/server/index.js codex/server/routes/auth.routes.js
git commit -m "feat(billing): GET /api/billing/status + entitlement in me payload"
```

---

## Phase 2 — Server Gates

### Task 5: Free scroll-creation limit gate

**Files:**
- Modify: `codex/server/index.js` (the `fastify.post('/api/scrolls/:id', ...)` handler near line 842)
- Test: `tests/qa/backend/proGate.test.js` (add a unit for the limit predicate)

**Interfaces:**
- Consumes: `request.entitlement`; `userPersistence.subscriptions.countScrollsForUser`; `userPersistence.scrolls.getScroll`/`get` to detect existing vs new.
- Produces: a reusable predicate `canCreateScroll({ entitlement, existingScroll, scrollCount, limit }) -> boolean`.

- [ ] **Step 1: Add the predicate to `proGate.js`:**

```js
export function canCreateScroll({ entitlement, existingScroll, scrollCount, limit }) {
  if (entitlement === 'pro') return true;        // unlimited for pro
  if (existingScroll) return true;               // editing an existing scroll is always allowed
  return scrollCount < limit;                    // free: only under the cap for NEW scrolls
}
```

- [ ] **Step 2: Write failing tests** (append to `proGate.test.js`):

```js
import { canCreateScroll } from '../../../codex/server/lib/proGate.js';

describe('canCreateScroll', () => {
  it('pro user is unlimited', () => {
    expect(canCreateScroll({ entitlement: 'pro', existingScroll: null, scrollCount: 99, limit: 3 })).toBe(true);
  });
  it('free user editing existing scroll is allowed even over limit', () => {
    expect(canCreateScroll({ entitlement: 'free', existingScroll: { id: 'x' }, scrollCount: 99, limit: 3 })).toBe(true);
  });
  it('free user under limit can create', () => {
    expect(canCreateScroll({ entitlement: 'free', existingScroll: null, scrollCount: 2, limit: 3 })).toBe(true);
  });
  it('free user at limit cannot create new', () => {
    expect(canCreateScroll({ entitlement: 'free', existingScroll: null, scrollCount: 3, limit: 3 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run, expect PASS:**

Run: `npx vitest run tests/qa/backend/proGate.test.js`
Expected: PASS.

- [ ] **Step 4: Wire the gate into the route.** In `index.js`, inside the `POST /api/scrolls/:id` handler, before calling `userPersistence.scrolls.save(...)`:

```js
const LIMIT = Number(process.env.SCHOLO_FREE_SCROLL_LIMIT ?? 3);
const userId = request.session.user.id;
const existingScroll = await userPersistence.scrolls.get(request.params.id, userId); // existing getter
const scrollCount = await userPersistence.subscriptions.countScrollsForUser(userId);
const allowed = canCreateScroll({
  entitlement: request.entitlement?.entitlement ?? 'free',
  existingScroll, scrollCount, limit: LIMIT,
});
if (!allowed) {
  return reply.code(402).send({ error: 'FREE_SCROLL_LIMIT_REACHED', limit: LIMIT, upgradeUrl: '/pricing' });
}
```

Import `canCreateScroll` at the top of `index.js`. Verify the exact name of the existing single-scroll getter on the persistence object (`getScroll` is exported internally; confirm whether the public object exposes it as `scrolls.get` or `scrolls.getOne` and use the real name).

- [ ] **Step 5: Manual verification.** As a free user, create scrolls until the 4th is rejected with `402 FREE_SCROLL_LIMIT_REACHED`; confirm editing an existing scroll still succeeds.

- [ ] **Step 6: Commit**

```bash
git add codex/server/lib/proGate.js codex/server/index.js tests/qa/backend/proGate.test.js
git commit -m "feat(billing): free scroll-creation limit gate"
```

---

### Task 6: Corpus search, full analysis, and rhyme astrology gates

**Files:**
- Modify: `codex/server/routes/corpus.routes.js`
- Modify: `codex/server/routes/panelAnalysis.routes.js`
- Modify: `codex/server/routes/rhymeAstrology.routes.js`

**Interfaces:**
- Consumes: `requireProEntitlement(request, reply, feature)` (Task 3).

- [ ] **Step 1: Read each route file** to find the handler(s) that perform the gated work (corpus full-text search; the *full* 8-heuristic analysis vs basic scoring; the rhyme-astrology computation). Note the existing preHandler/auth pattern each uses.

- [ ] **Step 2: Gate corpus search.** At the start of the corpus search handler body, before doing any work:

```js
import { requireProEntitlement } from '../lib/proGate.js';
// inside the handler:
if (!(await requireProEntitlement(request, reply, 'corpus_search'))) return;
```

- [ ] **Step 3: Gate full analysis.** In `panelAnalysis.routes.js`, identify the branch that returns the full 8-heuristic breakdown. Keep basic scoring open; gate only the full path:

```js
if (request.body?.mode === 'full' && !(await requireProEntitlement(request, reply, 'full_analysis'))) return;
```

(Confirm the real field that distinguishes basic vs full; if the route is full-only, gate the whole handler.)

- [ ] **Step 4: Gate rhyme astrology.** At the top of the rhyme-astrology handler:

```js
if (!(await requireProEntitlement(request, reply, 'rhyme_astrology'))) return;
```

- [ ] **Step 5: Manual verification (security).** With a free session cookie, `curl` each endpoint directly and confirm `402 PRO_REQUIRED` with the right `feature`. With a seeded pro subscription, confirm `200`.

- [ ] **Step 6: Commit**

```bash
git add codex/server/routes/corpus.routes.js codex/server/routes/panelAnalysis.routes.js codex/server/routes/rhymeAstrology.routes.js
git commit -m "feat(billing): server gates for corpus search, full analysis, rhyme astrology"
```

---

## Phase 3 — Frontend Gates

### Task 7: Entitlement in AuthContext + `useEntitlement` + client `isProUser`

**Files:**
- Modify: `src/context/AuthContext.jsx` (extend `UserSchema`, expose nothing new beyond `user`)
- Create: `src/lib/entitlement.js`
- Create: `src/hooks/useEntitlement.js`

**Interfaces:**
- Produces: `useEntitlement() -> { isPro, entitlement, plan, status, source, currentPeriodEnd, cancelAtPeriodEnd }`; `isProUser(user)`, `canUseFeature(user, featureKey)`.

- [ ] **Step 1: Extend `UserSchema`** in `AuthContext.jsx` so the zod parse does not strip/reject the new field. Add an optional entitlement object (use `.passthrough()` or an explicit optional shape):

```js
const EntitlementSchema = z.object({
  entitlement: z.enum(['free', 'pro']),
  plan: z.string(),
  source: z.string(),
  status: z.string(),
  currentPeriodEnd: z.number().nullable(),
  cancelAtPeriodEnd: z.boolean(),
}).partial().optional();
// add `entitlement: EntitlementSchema` to UserSchema's object shape
```

Verify the `/auth/me` payload now carries `entitlement` (Task 4) so this parses.

- [ ] **Step 2: Client entitlement helpers.** `src/lib/entitlement.js`:

```js
const PRO_FEATURES = new Set(['corpus_search', 'full_analysis', 'rhyme_astrology', 'export', 'unlimited_scrolls']);

export function isProUser(user) {
  return user?.entitlement?.entitlement === 'pro';
}
export function canUseFeature(user, featureKey) {
  if (!PRO_FEATURES.has(featureKey)) return true;   // non-gated features always allowed
  return isProUser(user);
}
```

- [ ] **Step 3: Hook.** `src/hooks/useEntitlement.js`:

```js
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function useEntitlement() {
  const { user } = useContext(AuthContext) ?? {};
  const e = user?.entitlement;
  return {
    isPro: e?.entitlement === 'pro',
    entitlement: e?.entitlement ?? 'free',
    plan: e?.plan ?? 'free',
    status: e?.status ?? 'none',
    source: e?.source ?? 'none',
    currentPeriodEnd: e?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: e?.cancelAtPeriodEnd ?? false,
  };
}
```

- [ ] **Step 4: Verify** with `npm run lint` on the changed files and a quick dev-server check that a logged-in user's `useEntitlement().isPro` reflects the seeded subscription.

- [ ] **Step 5: Commit**

```bash
git add src/context/AuthContext.jsx src/lib/entitlement.js src/hooks/useEntitlement.js
git commit -m "feat(billing): client entitlement context, helpers, and hook"
```

---

### Task 8: `ProGate` + `ProRoute` and wire the Read panels

**Files:**
- Create: `src/components/ProGate.jsx`
- Create: `src/components/ProRoute.jsx`
- Modify: `src/pages/Read/SearchPanel.jsx`, `src/pages/Read/AnalysisPanel.jsx`, `src/pages/Read/ScrollList.jsx` (lock affordances)

**Interfaces:**
- Consumes: `useEntitlement` (Task 7), `AdminRoute.jsx` as the structural template.
- Produces: `<ProGate feature="corpus_search">…children…</ProGate>`; `<ProRoute>…</ProRoute>`.

- [ ] **Step 1: `ProGate.jsx`** — renders children for pro; lock + upgrade CTA for free:

```jsx
import { Link } from 'react-router-dom';
import { useEntitlement } from '../hooks/useEntitlement.js';

export function ProGate({ feature, title = 'Read Pro', children }) {
  const { isPro } = useEntitlement();
  if (isPro) return children;
  return (
    <div className="pro-gate" role="group" aria-label={`${title} required`}>
      <div className="pro-gate__lock">🔒</div>
      <p className="pro-gate__msg">{title} unlocks this feature.</p>
      <Link className="pro-gate__cta" to="/pricing" state={{ feature }}>Upgrade to Pro</Link>
    </div>
  );
}
```

- [ ] **Step 2: `ProRoute.jsx`** — cloned from `src/components/AdminRoute.jsx`, redirecting free users to `/pricing`:

```jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useEntitlement } from '../hooks/useEntitlement.js';

export function ProRoute({ children }) {
  const { isPro } = useEntitlement();
  const location = useLocation();
  if (!isPro) return <Navigate to="/pricing" state={{ from: location }} replace />;
  return children;
}
```

- [ ] **Step 3: Wrap the panels.** In `SearchPanel.jsx` wrap the corpus-search UI (or render `<ProGate feature="corpus_search">` around it from the parent). In `AnalysisPanel.jsx`, show the full-breakdown section behind `<ProGate feature="full_analysis">` while leaving basic score visible. In `ScrollList.jsx`, when a free user is at the limit, render the "New scroll" control as a locked CTA to `/pricing`. Keep each change minimal and follow existing styling tokens (see `src/pages/Read/IDE.css` / panel CSS).

- [ ] **Step 4: Add minimal `.pro-gate` styles** to the relevant Read CSS (or a small `ProGate.css`), matching existing panel aesthetics — lock glyph, message, accented CTA. Reuse existing color tokens; do not introduce new hardcoded hexes (repo runs `verify:css-tokens`).

- [ ] **Step 5: Verify.** `npm run lint`; dev-server check that a free user sees locks and a seeded pro user sees the real panels.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProGate.jsx src/components/ProRoute.jsx src/pages/Read/SearchPanel.jsx src/pages/Read/AnalysisPanel.jsx src/pages/Read/ScrollList.jsx
git commit -m "feat(billing): ProGate/ProRoute + Read panel lock affordances"
```

---

### Task 9: `/pricing` and `/account/billing` pages + post-checkout state

**Files:**
- Create: `src/pages/Pricing/PricingPage.jsx` (+ `.css`)
- Create: `src/pages/Account/BillingPage.jsx` (+ `.css`)
- Modify: `src/App.jsx` (routes) and the Read success-state handling for `/read?upgraded=1`

**Interfaces:**
- Consumes: `useEntitlement`; endpoints `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/status` (checkout/portal land in Phase 4 — until then the buttons call the endpoints and will 404; that is expected and verified in Phase 4).

- [ ] **Step 1: Pricing page.** Monthly/annual toggle, Free-vs-Pro table (mirror the PDR §6 boundary), "No data loss on cancel" reassurance, CTA per plan:

```jsx
async function startCheckout(plan) {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }), // 'pro_monthly' | 'pro_annual'
  });
  if (!res.ok) return; // surface an error toast
  const { url } = await res.json();
  window.location.href = url;
}
```

Pricing copy: Free $0; Pro **$8/mo** or **$60/yr**.

- [ ] **Step 2: Billing page.** Show current plan/status/renewal-or-cancel date from `GET /api/billing/status`; "Manage Billing" button → `POST /api/billing/portal` → redirect to returned `url`.

- [ ] **Step 3: Routes.** In `src/App.jsx`, add `<Route path="/pricing" element={<PricingPage/>} />` and `<Route path="/account/billing" element={<BillingPage/>} />` (billing page behind the existing auth gate pattern).

- [ ] **Step 4: Post-checkout state.** On Read, when `?upgraded=1` is present: show a transient "Confirming your upgrade…" banner, refetch `GET /api/billing/status` (and/or re-run the auth `/me` refresh), reveal success when `entitlement==='pro'`, otherwise show "still syncing". **Never** unlock from the query param alone.

- [ ] **Step 5: Verify.** `npm run lint`; dev-server: pages render, toggle works, CTA issues the POST (404 until Phase 4 is expected).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Pricing src/pages/Account src/App.jsx src/pages/Read/ReadPage.jsx
git commit -m "feat(billing): pricing + billing pages and post-checkout confirm state"
```

---

## Phase 4 — Stripe Wiring

### Task 10: Install Stripe + config validation

**Files:**
- Modify: `package.json` (add `stripe`), `.env.example`
- Create: `codex/server/lib/billingConfig.js`

**Interfaces:**
- Produces: `getBillingConfig() -> { secretKey, webhookSecret, prices: { pro_monthly, pro_annual }, publicUrl, taxEnabled }`; throws on missing required vars when billing is enabled.

- [ ] **Step 1: Install the SDK.**

Run: `npm install stripe`
Expected: `stripe` appears in `package.json` dependencies.

- [ ] **Step 2: Config module.** `codex/server/lib/billingConfig.js`:

```js
export function getBillingConfig(env = process.env) {
  const cfg = {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    prices: { pro_monthly: env.STRIPE_PRICE_PRO_MONTHLY, pro_annual: env.STRIPE_PRICE_PRO_ANNUAL },
    publicUrl: env.APP_PUBLIC_URL,
    taxEnabled: env.ENABLE_STRIPE_TAX === 'true',
  };
  const missing = [];
  if (!cfg.secretKey) missing.push('STRIPE_SECRET_KEY');
  if (!cfg.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!cfg.prices.pro_monthly) missing.push('STRIPE_PRICE_PRO_MONTHLY');
  if (!cfg.prices.pro_annual) missing.push('STRIPE_PRICE_PRO_ANNUAL');
  if (!cfg.publicUrl) missing.push('APP_PUBLIC_URL');
  if (missing.length) throw new Error(`Billing enabled but missing env: ${missing.join(', ')}`);
  return cfg;
}
```

- [ ] **Step 3: Document env.** Add to `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `APP_PUBLIC_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`, `SCHOLO_FREE_SCROLL_LIMIT=3`, `ENABLE_STRIPE_TAX=false` — each with a short comment.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example codex/server/lib/billingConfig.js
git commit -m "feat(billing): install stripe + validated billing config"
```

---

### Task 11: `billing.service.js` (Stripe wrapper)

**Files:**
- Create: `codex/server/services/billing.service.js`

**Interfaces:**
- Consumes: `getBillingConfig` (Task 10); `userPersistence.subscriptions` (Task 1).
- Produces:
  - `createCheckoutSession({ user, plan }) -> Promise<{ url }>`
  - `createPortalSession({ user }) -> Promise<{ url }>`
  - `resolvePlanFromPriceId(priceId) -> 'pro_monthly'|'pro_annual'|null`
  - `syncSubscriptionFromStripe({ subscription }) -> Promise<void>` (maps a Stripe subscription object to `subscriptions.upsert`, looking up the local user via `stripeCustomerId`)

- [ ] **Step 1: Implement** (sketch — fill from current Stripe Node API):

```js
import Stripe from 'stripe';
import { getBillingConfig } from '../lib/billingConfig.js';

export function createBillingService({ subscriptions }) {
  const cfg = getBillingConfig();
  const stripe = new Stripe(cfg.secretKey);

  function priceIdFor(plan) {
    const id = cfg.prices[plan];
    if (!id) throw new Error(`Unknown plan key: ${plan}`);
    return id;
  }
  function resolvePlanFromPriceId(priceId) {
    if (priceId === cfg.prices.pro_monthly) return 'pro_monthly';
    if (priceId === cfg.prices.pro_annual) return 'pro_annual';
    return null;
  }

  async function createCheckoutSession({ user, plan }) {
    const existing = await subscriptions.getByUserId(user.id);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      customer: existing?.stripeCustomerId || undefined,
      customer_email: existing?.stripeCustomerId ? undefined : user.email,
      client_reference_id: String(user.id),
      success_url: `${cfg.publicUrl}/read?upgraded=1`,
      cancel_url: `${cfg.publicUrl}/pricing`,
      ...(cfg.taxEnabled ? { automatic_tax: { enabled: true } } : {}),
    });
    return { url: session.url };
  }

  async function createPortalSession({ user }) {
    const existing = await subscriptions.getByUserId(user.id);
    if (!existing?.stripeCustomerId) { const e = new Error('BILLING_CUSTOMER_NOT_FOUND'); e.code = 'BILLING_CUSTOMER_NOT_FOUND'; throw e; }
    const session = await stripe.billingPortal.sessions.create({
      customer: existing.stripeCustomerId,
      return_url: `${cfg.publicUrl}/account/billing`,
    });
    return { url: session.url };
  }

  async function syncSubscriptionFromStripe({ subscription, userId, eventId }) {
    const item = subscription.items?.data?.[0];
    const plan = resolvePlanFromPriceId(item?.price?.id) ?? 'free';
    await subscriptions.upsert({
      userId,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,                                  // active|trialing|past_due|canceled|...
      plan,
      currentPeriodEnd: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastStripeEventId: eventId,
    });
  }

  return { stripe, createCheckoutSession, createPortalSession, resolvePlanFromPriceId, syncSubscriptionFromStripe };
}
```

- [ ] **Step 2: Unit-test `resolvePlanFromPriceId`** with a stubbed config (inject env via `getBillingConfig`-friendly test or export a small pure mapper). Minimal: assert monthly/annual/unknown mapping. Add to `billing.webhook.test.js` or a small `billing.service.test.js`.

- [ ] **Step 3: Commit**

```bash
git add codex/server/services/billing.service.js tests/qa/backend/
git commit -m "feat(billing): stripe service wrapper (checkout, portal, sync)"
```

---

### Task 12: Checkout + portal routes

**Files:**
- Modify: `codex/server/routes/billing.routes.js`

**Interfaces:**
- Consumes: `billingService` (Task 11), `requireAuth`.
- Produces: `POST /api/billing/checkout` `{plan}` → `{url}`; `POST /api/billing/portal` → `{url}` or `404 BILLING_CUSTOMER_NOT_FOUND`.

- [ ] **Step 1: Add routes** to `billing.routes.js`:

```js
const VALID_PLANS = new Set(['pro_monthly', 'pro_annual']);

fastify.post('/api/billing/checkout', { preHandler: [requireAuth] }, async (request, reply) => {
  const { plan } = request.body ?? {};
  if (!VALID_PLANS.has(plan)) return reply.code(400).send({ error: 'INVALID_PLAN' });
  const { url } = await billingService.createCheckoutSession({ user: request.session.user, plan });
  return { url };
});

fastify.post('/api/billing/portal', { preHandler: [requireAuth] }, async (request, reply) => {
  try {
    const { url } = await billingService.createPortalSession({ user: request.session.user });
    return { url };
  } catch (e) {
    if (e.code === 'BILLING_CUSTOMER_NOT_FOUND') return reply.code(404).send({ error: 'BILLING_CUSTOMER_NOT_FOUND' });
    throw e;
  }
});
```

Construct `billingService` once (in `index.js` where routes register, or lazily inside `billingRoutes` via `opts`) and pass it through `opts`. Guard construction so the server still boots when billing env is absent in non-billing environments (wrap `getBillingConfig()` and register billing routes only when `STRIPE_SECRET_KEY` is set; log a warning otherwise).

- [ ] **Step 2: Verify** with Stripe test keys: `POST /api/billing/checkout {plan:'pro_monthly'}` returns a `checkout.stripe.com` URL; invalid plan → 400; portal without a customer → 404.

- [ ] **Step 3: Commit**

```bash
git add codex/server/routes/billing.routes.js codex/server/index.js
git commit -m "feat(billing): checkout + portal routes"
```

---

### Task 13: Webhook route (the entitlement writer)

**Files:**
- Modify: `codex/server/routes/billing.routes.js` (webhook)
- Modify: `codex/server/index.js` (ensure raw body is available for the webhook path)
- Test: `tests/qa/backend/billing.webhook.test.js`

**Interfaces:**
- Consumes: `billingService.stripe` (for `webhooks.constructEvent`), `billingService.syncSubscriptionFromStripe`, `subscriptions`.
- Produces: `POST /api/billing/webhook` — 400 on bad signature, 200 otherwise; idempotent.

- [ ] **Step 1: Ensure raw body.** Stripe signature verification needs the raw bytes. Add a content-type parser scoped to the webhook route (Fastify: `addContentTypeParser` for `application/json` on that route, or register the route with `config: { rawBody: true }` and a raw parser). Confirm the global JSON parser does not consume it first. Document the exact mechanism used in a code comment.

- [ ] **Step 2: Implement the handler:**

```js
fastify.post('/api/billing/webhook', { config: { rawBody: true } }, async (request, reply) => {
  let event;
  try {
    event = billingService.stripe.webhooks.constructEvent(request.rawBody, request.headers['stripe-signature'], cfg.webhookSecret);
  } catch {
    return reply.code(400).send({ error: 'INVALID_SIGNATURE' });
  }

  // Idempotency: skip events already applied.
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = Number(obj.client_reference_id);
      const sub = await billingService.stripe.subscriptions.retrieve(obj.subscription);
      await billingService.syncSubscriptionFromStripe({ subscription: sub, userId, eventId: event.id });
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const existing = await subscriptions.getByStripeCustomerId(obj.customer);
      if (existing) await billingService.syncSubscriptionFromStripe({ subscription: obj, userId: existing.userId, eventId: event.id });
      break;
    }
    case 'invoice.payment_failed':
    case 'invoice.payment_succeeded': {
      const existing = await subscriptions.getByStripeCustomerId(obj.customer);
      if (existing && obj.subscription) {
        const sub = await billingService.stripe.subscriptions.retrieve(obj.subscription);
        await billingService.syncSubscriptionFromStripe({ subscription: sub, userId: existing.userId, eventId: event.id });
      }
      break;
    }
    default: /* unknown event types -> 200 no-op */ break;
  }
  return reply.code(200).send({ received: true });
});
```

Idempotency note: re-applying the same Stripe subscription state via `upsert` (keyed on `userId`) is naturally idempotent; `lastStripeEventId` records the last event for debugging.

- [ ] **Step 3: Write webhook tests** with a stubbed `billingService` (inject a fake `stripe.webhooks.constructEvent` that throws for a bad-signature case and returns a crafted event otherwise). Assert: invalid signature → 400 and no `upsert`; `customer.subscription.updated` with a known customer → `syncSubscriptionFromStripe` called with the right `userId`; unknown event type → 200 and no writes; replayed identical event → second call produces identical row (no duplication).

- [ ] **Step 4: Run, expect PASS:**

Run: `npx vitest run tests/qa/backend/billing.webhook.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/server/routes/billing.routes.js codex/server/index.js tests/qa/backend/billing.webhook.test.js
git commit -m "feat(billing): signature-verified webhook as sole entitlement writer"
```

---

## Phase 5 — QA & Launch Hardening

### Task 14: End-to-end + security verification and launch checklist

**Files:**
- Create/Modify: `tests/qa/backend/` integration tests as needed; a short `docs/scholomance-encyclopedia/Scholomance LAW/` or runbook note for go-live (optional).

- [ ] **Step 1: Full backend suite green.**

Run: `npx vitest run tests/qa/backend`
Expected: PASS for entitlement, persistence, proGate, webhook.

- [ ] **Step 2: Security pass (direct API, no frontend).** With a free session cookie, `curl` each gated endpoint (`/api/scrolls/:id` 4th create, corpus search, full analysis, rhyme astrology) and confirm 402 with the right contract. Confirm a forged client `entitlement`/`plan` field changes nothing (server ignores client-supplied entitlement). Confirm `/read?upgraded=1` alone does not unlock Pro.

- [ ] **Step 3: Lifecycle (Stripe test mode).** Run the journey end to end: signup → hit gate → `/pricing` → Stripe test card `4242 4242 4242 4242` → return to `/read?upgraded=1` → Pro unlocks only after the webhook lands. Then in the Billing Portal: cancel-at-period-end (stays Pro until `currentPeriodEnd`), and a failed-payment scenario (stays Pro until `currentPeriodEnd`, then downgrades). Confirm a downgraded user with >3 scrolls can still read all scrolls but cannot create a new one.

- [ ] **Step 4: Config validation.** Boot the server without billing env and confirm it still starts (billing routes skipped with a warning); boot with billing env and confirm routes are live. Confirm `getBillingConfig()` throws clearly when a required var is missing while billing is enabled.

- [ ] **Step 5: Run repo self-checks** before declaring done:

Run: `npm run lint && npm run scd64:intellisense`
Expected: clean (address any SCD64 fossils flagged on changed files).

- [ ] **Step 6: Go-live.** Create live Stripe products/prices, set Fly secrets (`fly secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… STRIPE_PRICE_PRO_MONTHLY=… STRIPE_PRICE_PRO_ANNUAL=… APP_PUBLIC_URL=https://… VITE_STRIPE_PUBLISHABLE_KEY=…`), register the production webhook endpoint in the Stripe dashboard pointing at `/api/billing/webhook`, deploy, and run one live smoke purchase + refund.

- [ ] **Step 7: Commit / tag**

```bash
git add -A
git commit -m "test(billing): e2e + security verification for Read Pro"
```

---

## Self-Review

**Spec coverage** (PDR §-by-§): entitlement snapshot/derivation (§7) → Task 2; data model (§8) → Task 1; backend modules (§9) → Tasks 1,3,4,11,12,13; auth integration (§10) → Tasks 3,4; server gates (§11) → Tasks 5,6; frontend modules (§12) → Tasks 7,8,9; config/secrets (§13) → Task 10; edge cases (§14) → Tasks 5,9,13 + Task 14 verification; phases (§15) → phase headers; QA checklist (§16) → Tasks covered + Task 14; risks (§18) → addressed across gates/webhook/config. **Export gate (§11.5):** corpus/full-analysis data is already Pro-gated at the source; export is gated client-side in Task 8 and no separate server export endpoint was found in the codebase — if one is later added, gate it with `requireProEntitlement(request, reply, 'export')`. This is the one intentional deviation from the PDR's implied server export gate, made because the endpoint does not currently exist.

**Type/name consistency:** `EntitlementSnapshot` fields are identical across Tasks 2/3/4/7; `requireProEntitlement(request, reply, feature)` signature is consistent in Tasks 3/6; `subscriptions.upsert(...)` field set matches the table in Task 1 and the writer in Task 11; plan keys `pro_monthly`/`pro_annual` are consistent client→route→service.

**Known verifications the implementer MUST do (flagged inline, not placeholders):** exact name of the single-scroll getter on the persistence object (Task 5), the existing `/auth/me` response shape (Task 4), the basic-vs-full analysis discriminator field (Task 6), and the Fastify raw-body mechanism actually available in this server (Task 13).
