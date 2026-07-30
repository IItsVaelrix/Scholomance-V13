/* @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'node:fs';

describe('[Server] OAuth routes integration (mock flow)', () => {
  let fastify;
  let userDbPath;

  beforeAll(async () => {
    const tempBase = path.join(os.tmpdir(), `scholomance-oauth-routes-${Date.now()}-${process.pid}`);
    userDbPath = `${tempBase}-user.sqlite`;
    process.env.USER_DB_PATH = userDbPath;
    delete process.env.TURSO_USER_DB_URL;
    
    // Set environment variables to enable mock OAuth
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH = 'true';
    process.env.ENABLE_COLLAB_API = 'false';
    process.env.ENABLE_REDIS_SESSIONS = 'false';

    // Use explicit mock sentinel credentials. The auto-mock fallback in
    // oauth.providers.js is (correctly) disabled under VITEST, so we can't rely on
    // it here — instead we hand the registry mock-prefixed creds directly, which it
    // accepts without consulting isDevMockActive(). The 'mock-' prefix then routes
    // the flow through the mock consent path in oauth.routes.js.
    process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

    const mod = await import('../../codex/server/index.js?test=oauth-routes');
    fastify = mod.fastify;
    await fastify.ready();
  // Booting the real Fastify server runs DB migrations plus the world seed.
  // Measured ~6s alone; four of these suites boot concurrently, which exceeds
  // vitest's 10s default hookTimeout on a slower machine. Not contention --
  // each suite gets its own temp DB -- just genuinely more work than 10s.
  }, 60_000);

  afterAll(async () => {
    if (fastify) {
      await fastify.close();
    }
    try {
      const userPersistence = await import('../../codex/server/user.persistence.js');
      await userPersistence.userPersistence?.close?.();
    } catch {
      // ignore
    }

    if (userDbPath) {
      for (const suffix of ['', '-wal', '-shm']) {
        const candidate = `${userDbPath}${suffix}`;
        if (fs.existsSync(candidate)) {
          try { fs.rmSync(candidate, { force: true }); } catch { /* ignore */ }
        }
      }
    }
  });

  it('performs mock Google OAuth login for a brand-new email and registers the user', async () => {
    // 1. Initiate OAuth by requesting /auth/oauth/google
    const initiateRes = await fastify.inject({
      method: 'GET',
      url: '/auth/oauth/google',
    });

    expect(initiateRes.statusCode).toBe(302);
    const redirectUrl = new URL(initiateRes.headers.location);
    expect(redirectUrl.pathname).toBe('/auth/oauth/mock-consent');
    
    const state = redirectUrl.searchParams.get('state');
    const provider = redirectUrl.searchParams.get('provider');
    expect(provider).toBe('google');

    // Extract the session cookie
    const sessionCookie = initiateRes.headers['set-cookie'];
    expect(sessionCookie).toBeDefined();

    // 2. Submit the mock consent screen
    const submitRes = await fastify.inject({
      method: 'GET',
      url: `/auth/oauth/mock-submit?state=${state}&provider=google&email=brandnew-oauth@example.com&emailVerified=true`,
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(submitRes.statusCode).toBe(302);
    const callbackUrl = new URL(submitRes.headers.location);
    expect(callbackUrl.pathname).toBe('/auth/oauth/google/callback');
    expect(callbackUrl.searchParams.get('code')).toBe('mock-code');
    expect(callbackUrl.searchParams.get('state')).toBe(state);

    const submitCookie = submitRes.headers['set-cookie'] || sessionCookie;

    // 3. Request the callback
    const callbackRes = await fastify.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=mock-code&state=${state}`,
      headers: {
        cookie: submitCookie,
      },
    });

    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toContain('/read?oauth=created');

    // Verify user was created in the database
    const { userPersistence } = await import('../../codex/server/user.persistence.js');
    const user = await userPersistence.users.findByEmail('brandnew-oauth@example.com');
    expect(user).toBeDefined();
    expect(user.username).toBe('brandnewoauth');
    expect(user.verified).toBe(1);
  });

  it('refuses unverified emails and redirects to /auth?oauth=unverified', async () => {
    // 1. Initiate OAuth
    const initiateRes = await fastify.inject({
      method: 'GET',
      url: '/auth/oauth/google',
    });

    const redirectUrl = new URL(initiateRes.headers.location);
    const state = redirectUrl.searchParams.get('state');
    const cookie = initiateRes.headers['set-cookie'];

    // 2. Submit with unverified email checkbox unchecked
    const submitRes = await fastify.inject({
      method: 'GET',
      url: `/auth/oauth/mock-submit?state=${state}&provider=google&email=unverified-oauth@example.com&emailVerified=false`,
      headers: { cookie },
    });

    const callbackRes = await fastify.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=mock-code&state=${state}`,
      headers: { cookie: submitRes.headers['set-cookie'] || cookie },
    });

    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toContain('/auth?oauth=unverified');
  });

  it('prevents silent merges when email matches an existing password account', async () => {
    const { userPersistence } = await import('../../codex/server/user.persistence.js');
    
    // Create an existing password-based account
    await userPersistence.users.createUser(
      'existingpwduser', 'existing-pwd@example.com', 'ExistingPassword123!', null
    );

    // 1. Initiate OAuth
    const initiateRes = await fastify.inject({
      method: 'GET',
      url: '/auth/oauth/google',
    });

    const redirectUrl = new URL(initiateRes.headers.location);
    const state = redirectUrl.searchParams.get('state');
    const cookie = initiateRes.headers['set-cookie'];

    // 2. Submit with existing user's email
    const submitRes = await fastify.inject({
      method: 'GET',
      url: `/auth/oauth/mock-submit?state=${state}&provider=google&email=existing-pwd@example.com&emailVerified=true`,
      headers: { cookie },
    });

    const callbackRes = await fastify.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=mock-code&state=${state}`,
      headers: { cookie: submitRes.headers['set-cookie'] || cookie },
    });

    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toContain('/auth?oauth=link_required&email=existing-pwd%40example.com');
  });
});
