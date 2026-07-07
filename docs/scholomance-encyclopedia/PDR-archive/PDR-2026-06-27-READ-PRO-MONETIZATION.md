PDR: Read Pro — Freemium Monetization v2
Date: 2026-06-27
Status: Draft v2
Surface: Read, grimoire IDE, src/pages/Read/
Owner: Damien
Depends on: PDR-2026-06-03-ACCOUNTS-EMAIL-OAUTH.md
Change class: Structural + behavioral
Risk profile: Revenue-critical, security-sensitive, moderate implementation risk
1. Executive Summary

Read is already deployed and authenticated, but it currently has no monetization layer. The v1 PDR correctly identifies the core business problem: users can sign up and use the product, but there is no payment processor, subscription state, tier model, or entitlement enforcement.

This PDR adds Read Pro, a freemium subscription model backed by Stripe Checkout, Stripe Billing Portal, and server-derived entitlement.

A stranger should be able to:

Create a free account.
Use the core Read editor.
Hit a Pro-gated feature.
Upgrade through Stripe Checkout.
Return to Read.
Gain Pro access only after the Stripe webhook confirms subscription state.
Manage cancellation and card updates through the Stripe Billing Portal.

The system must not rely on client-side trust. The client may show locks, pricing, and upgrade prompts, but every protected action must be re-checked on the server.

2. Guiding Decision
Core architectural decision

The server is the only source of truth for entitlement.

The frontend can ask:

“Is this user Pro?”

But it cannot decide:

“This user is Pro.”

That decision is derived backend-side from:

Admin status.
Subscription status.
Subscription period.
Billing lifecycle state.

This preserves the strongest principle from the original draft: entitlement belongs on the server, while the client only renders lock/unlock affordances.

3. Product Goal

A new user can complete this path in one sitting:

Signup → Free usage → Pro gate → Pricing → Stripe Checkout → Webhook sync → Pro unlocked
Success state

The user experiences Read as:

Free enough to evaluate.
Limited enough to create upgrade pressure.
Trustworthy enough that billing state feels immediate.
Safe enough that cancellation never destroys data.

The original product goal already defines the correct upgrade journey: free signup, hit a Pro feature, pay through Checkout, return unlocked, then self-manage through the portal.

4. Non-Goals

This PDR does not include:

Team plans.
Seat billing.
Organization accounts.
Coupons.
Affiliates.
Referral credits.
Usage credits.
Metered billing.
Free trials.
Tax implementation beyond optional Stripe Tax configuration.
Monetization for Combat, DivTube, Vaelrix, or other Scholomance surfaces.

Read Pro is a single-user freemium subscription.

No hydra billing. One head. One sword. 🗡️

5. Plans and Pricing
Plan	Price	Stripe object	Notes
Free	$0	none	Default for all users
Pro Monthly	$8/mo	STRIPE_PRICE_PRO_MONTHLY	Flexible entry
Pro Annual	$60/yr	STRIPE_PRICE_PRO_ANNUAL	Discounted annual plan

Prices are stored in environment variables and must never be hard-coded in app logic.

The original pricing boundary is retained: Free is the default, Pro monthly is $8/month, and Pro annual is $60/year.

6. Free vs Pro Boundary
Capability	Free	Pro
Editor	✅	✅
Basic Truesight coloring	✅	✅
Saved scrolls	3	Unlimited
Basic score	✅	✅
Full 8-heuristic analysis	❌	✅
Deep Truesight / rhyme diagramming	❌	✅
Rhyme Astrology	❌	✅
Corpus search	❌	✅
Export	❌	✅

The feature split preserves the v1 draft’s monetization line: the free user can experience the core editor, while deeper analysis, corpus access, exports, and unlimited saved scrolls become Pro.

7. Entitlement Model
7.1 Entitlement snapshot

Every authenticated request should resolve an entitlement snapshot:

type EntitlementSnapshot = {
  entitlement: 'free' | 'pro'
  plan: 'free' | 'pro_monthly' | 'pro_annual'
  source: 'none' | 'admin' | 'subscription'
  status:
    | 'none'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'incomplete'
    | 'unpaid'
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
}
7.2 Derivation rule
if isAdminUser(user):
  entitlement = 'pro'
  source = 'admin'

else if subscription.status in active/trialing:
  entitlement = 'pro'
  source = 'subscription'

else if subscription.status is past_due and now < currentPeriodEnd:
  entitlement = 'pro'
  source = 'subscription'

else if subscription.cancelAtPeriodEnd is true and now < currentPeriodEnd:
  entitlement = 'pro'
  source = 'subscription'

else:
  entitlement = 'free'
  source = 'none'
7.3 Why this is better

The original draft had the correct simple rule: admins are Pro, active or trialing subscriptions are Pro, everyone else is Free.

This v2 expands that into a production-safe shape by explicitly handling:

Admin override.
Grace period.
Cancel-at-period-end.
Past-due access.
UI messaging.
Billing portal visibility.
8. Data Model

Add a named migration in:

codex/server/db/sqlite.migrations.js

Migration name:

add_read_pro_subscriptions
8.1 Table
CREATE TABLE IF NOT EXISTS subscriptions (
  userId                  INTEGER PRIMARY KEY,
  stripeCustomerId        TEXT,
  stripeSubscriptionId    TEXT,
  status                  TEXT NOT NULL DEFAULT 'none',
  plan                    TEXT NOT NULL DEFAULT 'free',
  currentPeriodEnd        INTEGER,
  cancelAtPeriodEnd       INTEGER NOT NULL DEFAULT 0,
  lastStripeEventId       TEXT,
  updatedAt               INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripeSub
  ON subscriptions (stripeSubscriptionId);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON subscriptions (stripeCustomerId);
8.2 Field meanings
Field	Purpose
userId	Local user identity
stripeCustomerId	Reuse customer across checkouts
stripeSubscriptionId	Idempotent webhook updates
status	Normalized Stripe subscription state
plan	Local product tier
currentPeriodEnd	Determines grace/cancel access
cancelAtPeriodEnd	Distinguishes canceled-later from canceled-now
lastStripeEventId	Optional replay/debug trace
updatedAt	Local mutation time
8.3 Default behavior

Existing users require no backfill.

A user with no subscription row resolves as:

{
  "entitlement": "free",
  "plan": "free",
  "source": "none",
  "status": "none",
  "currentPeriodEnd": null,
  "cancelAtPeriodEnd": false
}
9. Backend Modules
9.1 subscriptions.persistence.js

Responsibilities:

getByUserId(userId)
getByStripeCustomerId(stripeCustomerId)
getByStripeSubscriptionId(stripeSubscriptionId)
upsertFromStripeSubscription(userId, stripeSubscription)
markPastDue(stripeSubscriptionId, currentPeriodEnd)
markCanceled(stripeSubscriptionId, currentPeriodEnd, cancelAtPeriodEnd)
countScrollsForUser(userId)

Rules:

No Stripe SDK calls in persistence.
No entitlement logic in persistence.
No frontend-specific response shaping in persistence.

Persistence is the vault, not the oracle.

9.2 lib/entitlement.js

Pure server module.

deriveEntitlement({
  user,
  subscription,
  now
}): EntitlementSnapshot

Must be unit-tested independently.

Test cases:

User	Subscription	Expected
Admin	none	Pro
Admin	canceled	Pro
Normal	none	Free
Normal	active	Pro
Normal	trialing	Pro
Normal	past_due before period end	Pro
Normal	past_due after period end	Free
Normal	cancel at period end before period end	Pro
Normal	cancel at period end after period end	Free
Normal	canceled immediately	Free
9.3 services/billing.service.js

Thin Stripe wrapper.

Responsibilities:

createCheckoutSession({ user, plan })
createPortalSession({ user })
syncSubscriptionFromStripe({ subscription })
resolvePlanFromPriceId(priceId)

Rules:

Stripe SDK belongs here.
Env validation belongs here or in centralized config.
Never let the client send arbitrary Stripe Price IDs.
Client sends only local plan keys:
pro_monthly
pro_annual

Server maps them to env-backed Stripe Price IDs.

9.4 routes/billing.routes.js

Routes:

POST /api/billing/checkout
POST /api/billing/portal
POST /api/billing/webhook
GET  /api/billing/status
POST /api/billing/checkout

Auth required.

Request:

{
  "plan": "pro_monthly"
}

Response:

{
  "url": "https://checkout.stripe.com/..."
}

Validation:

User must be authenticated.
Plan must be pro_monthly or pro_annual.
Server maps plan to Stripe Price ID.
Existing stripeCustomerId is reused.
POST /api/billing/portal

Auth required.

Response:

{
  "url": "https://billing.stripe.com/..."
}

Validation:

User must be authenticated.
User must have stripeCustomerId.
If no customer exists, return 404 BILLING_CUSTOMER_NOT_FOUND.
POST /api/billing/webhook

No auth.

Requires raw body.

Must verify Stripe signature with:

STRIPE_WEBHOOK_SECRET

Handles:

checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
invoice.payment_succeeded

Rules:

Invalid signature returns 400.
Unknown event types return 200.
Duplicate events must not corrupt state.
Checkout redirect must not grant Pro by itself.
Webhook sync is the real unlock.

This preserves the original design principle that the webhook is the entitlement writer and Checkout redirects are cosmetic.

GET /api/billing/status

Auth required.

Response:

{
  "entitlement": "pro",
  "plan": "pro_monthly",
  "source": "subscription",
  "status": "active",
  "currentPeriodEnd": 1790400000,
  "cancelAtPeriodEnd": false
}

Used by:

Account billing page.
Post-checkout refresh.
Debugging entitlement state.
10. Auth Integration

Extend the authenticated user/session payload to include:

{
  "user": {
    "id": 123,
    "email": "user@example.com",
    "entitlement": {
      "entitlement": "pro",
      "plan": "pro_monthly",
      "source": "subscription",
      "status": "active",
      "currentPeriodEnd": 1790400000,
      "cancelAtPeriodEnd": false
    }
  }
}
Server rule

Every authenticated request should have:

request.user.entitlement

attached by the auth pre-handler.

Why

This gives all server routes one consistent way to ask:

isProEntitled(request.user)

No scattered subscription reads. No haunted copy-paste gates.

11. Server-Side Gates
11.1 Gate helper

Create:

requireProEntitlement(request, reply)

Behavior:

If entitlement is Pro:
  allow

If entitlement is Free:
  reject with 402 Payment Required

Response:

{
  "error": "PRO_REQUIRED",
  "message": "This action requires Read Pro.",
  "upgradeUrl": "/pricing"
}
11.2 Scroll creation gate

Free users may create a scroll only when:

existingOwnedScrollCount < SCHOLO_FREE_SCROLL_LIMIT

Default:

SCHOLO_FREE_SCROLL_LIMIT=3

Free limit response:

{
  "error": "FREE_SCROLL_LIMIT_REACHED",
  "limit": 3,
  "upgradeUrl": "/pricing"
}

Important:

Reading existing scrolls is never blocked.
Editing existing scrolls should remain allowed unless product intentionally decides otherwise.
Creating new scrolls past the limit is blocked.
11.3 Corpus search gate

Free users calling the corpus search endpoint directly must receive:

{
  "error": "PRO_REQUIRED",
  "feature": "corpus_search",
  "upgradeUrl": "/pricing"
}
11.4 Full analysis gate

Free users may receive basic scoring only.

Full analysis requires Pro:

{
  "error": "PRO_REQUIRED",
  "feature": "full_analysis",
  "upgradeUrl": "/pricing"
}
11.5 Export gate

Export requires Pro.

The server must verify entitlement before generating or returning export output.

12. Frontend Modules
12.1 src/hooks/useEntitlement.js

Reads entitlement from auth context.

Returns:

{
  isPro: boolean
  entitlement: 'free' | 'pro'
  plan: string
  status: string
  source: string
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
}
12.2 src/lib/entitlement.js

Client helper:

isProUser(user)
canUseFeature(user, featureKey)

Warning:

This is only for UX rendering.

Server enforcement remains mandatory.

12.3 src/components/ProGate.jsx

Usage:

<ProGate feature="corpus_search">
  <SearchPanel />
</ProGate>

Free fallback:

Lock icon.
Short explanation.
Upgrade button.
Optional “What Pro unlocks” mini-list.
12.4 src/components/ProRoute.jsx

Protects whole pages when needed.

Example:

<Route
  path="/read/corpus"
  element={
    <ProRoute>
      <CorpusPage />
    </ProRoute>
  }
/>
12.5 /pricing

Content:

Free vs Pro comparison.
Monthly/annual toggle.
CTA buttons.
“No data loss on cancel” reassurance.
Stripe Checkout redirect.

CTA behavior:

Click plan → POST /api/billing/checkout → redirect to returned URL
12.6 /account/billing

Content:

Current plan.
Subscription status.
Renewal/cancel date.
Billing Portal button.

Button behavior:

Click Manage Billing → POST /api/billing/portal → redirect to returned URL
12.7 Post-checkout state

Checkout success URL:

/read?upgraded=1

Client behavior:

Show temporary “confirming upgrade” state.
Refetch /me or /api/billing/status.
If Pro, show success.
If still Free, say upgrade is still syncing.

Do not unlock from query param alone.

13. Config and Secrets

Required server env:

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_ANNUAL
SCHOLO_FREE_SCROLL_LIMIT
APP_PUBLIC_URL

Required client env:

VITE_STRIPE_PUBLISHABLE_KEY

Optional:

ENABLE_STRIPE_TAX

Startup validation:

The server should fail loudly if billing routes are enabled but required Stripe env vars are missing.

14. Edge Cases
Case	Required behavior
Webhook arrives before redirect	Webhook upserts subscription. Redirect only refetches state.
Redirect arrives before webhook	UI shows “confirming upgrade” until /me reflects Pro.
Duplicate webhook	Idempotent update. No duplicate rows.
Failed payment	Keep Pro until currentPeriodEnd, then downgrade.
Cancel at period end	Keep Pro until currentPeriodEnd.
Immediate cancellation	Downgrade on webhook sync.
Downgrade with many scrolls	Keep all scrolls readable. Block only new gated actions.
Client tampers with entitlement	Server ignores client fields.
Invalid webhook signature	Return 400 and mutate nothing.
Existing Stripe customer	Reuse stripeCustomerId.
Price ID mismatch	Reject and log safely.
Admin with canceled sub	Still Pro via admin source.

The non-destructive downgrade rule preserves the v1 principle: losing Pro must never delete user data.

15. Implementation Phases
Phase 1: Entitlement spine, no Stripe

Implement:

subscriptions migration.
subscriptions.persistence.js.
lib/entitlement.js.
Auth pre-handler entitlement attachment.
/api/billing/status.
Unit tests for entitlement truth table.

Use seeded/manual subscription rows for local verification.

Phase 2: Server gates

Implement:

requireProEntitlement.
Scroll creation limit.
Corpus search gate.
Full analysis gate.
Export gate.
Direct API tests.

Goal:

Free user cannot bypass Pro by skipping the frontend.
Phase 3: Minimal frontend gates

Implement:

useEntitlement.
ProGate.
ProRoute.
Basic /pricing page.
Basic /account/billing page.

Goal:

The product feels monetized before Stripe is attached.
Phase 4: Stripe wiring

Implement:

Stripe service wrapper.
Checkout route.
Portal route.
Webhook route.
Stripe test products/prices.
Fly secrets.

Goal:

Stripe test checkout unlocks Pro only through webhook sync.
Phase 5: QA and launch hardening

Implement:

Webhook replay tests.
Direct bypass tests.
Cancellation tests.
Past-due tests.
Checkout duplicate tests.
Production env validation.
Live Stripe smoke test.
16. QA Checklist
Unit
[ ] deriveEntitlement: admin with no subscription → Pro
[ ] deriveEntitlement: admin with canceled subscription → Pro
[ ] deriveEntitlement: normal user with no row → Free
[ ] deriveEntitlement: active subscription → Pro
[ ] deriveEntitlement: trialing subscription → Pro
[ ] deriveEntitlement: past_due before period end → Pro
[ ] deriveEntitlement: past_due after period end → Free
[ ] deriveEntitlement: cancelAtPeriodEnd before period end → Pro
[ ] deriveEntitlement: cancelAtPeriodEnd after period end → Free
[ ] deriveEntitlement: canceled immediate → Free
Integration
[ ] Checkout creates/reuses Stripe customer
[ ] Checkout rejects unknown plan keys
[ ] Webhook verifies raw body signature
[ ] Webhook rejects invalid signature with 400
[ ] Webhook handles subscription created
[ ] Webhook handles subscription updated
[ ] Webhook handles subscription deleted
[ ] Webhook handles invoice payment failed
[ ] Webhook replay is idempotent
Security
[ ] Free user direct API call to corpus search is rejected
[ ] Free user direct API call to full analysis is rejected
[ ] Free user direct API call to export is rejected
[ ] Forged client plan field is ignored
[ ] Forged localStorage/session value is ignored
[ ] Checkout redirect param does not unlock Pro
Product behavior
[ ] Free user can create scrolls 1, 2, and 3
[ ] Free user cannot create scroll 4
[ ] Pro user has unlimited scroll creation
[ ] Downgraded user with more than 3 scrolls can still read old scrolls
[ ] Downgraded user with more than 3 scrolls cannot create another scroll
[ ] Canceling in portal preserves Pro until period end
[ ] Failed payment preserves Pro until period end
[ ] Billing page shows correct status
[ ] Pricing page CTA opens Stripe Checkout

The v1 QA requirements already covered the essential security spine: direct gated endpoint calls, forged client plans, webhook signature failure, and test-mode E2E.

17. Success Criteria

Read Pro is successful when:

A brand-new account can upgrade through Stripe test checkout.
Pro unlock occurs only after webhook-confirmed subscription sync.
No gated action can be accessed through direct API calls by a Free user.
Canceling does not delete or hide existing user data.
Past-due and cancel-at-period-end users retain access only until currentPeriodEnd.
Existing free-user behavior does not regress.
Admin users remain Pro regardless of subscription state.
Stripe customer reuse prevents duplicate customer sprawl.
All billing secrets are env-based.
The implementation is small enough to land in phased PRs.
18. Risks and Mitigations
Risk	Mitigation
Client-only bypass	Server gate every protected route
Stripe webhook body parsing bug	Preserve raw body for webhook route
Duplicate webhook events	Idempotent upsert by subscription ID
Confusing cancellation state	Store cancelAtPeriodEnd explicitly
Pro unlock feels delayed	Post-checkout “confirming upgrade” state
User loses trust on downgrade	Never delete scrolls
Price spoofing	Client sends plan key, server maps to env Price ID
Admin billing weirdness	Admin source overrides subscription state
Env misconfiguration	Server startup validation
Hidden regression	Phase rollout with direct API tests
19. Implementation Notes
Recommended file additions
codex/server/subscriptions.persistence.js
codex/server/services/billing.service.js
codex/server/lib/entitlement.js
codex/server/routes/billing.routes.js

src/hooks/useEntitlement.js
src/lib/entitlement.js
src/components/ProGate.jsx
src/components/ProRoute.jsx
src/pages/Pricing/PricingPage.jsx
src/pages/Account/BillingPage.jsx
Recommended edits
codex/server/db/sqlite.migrations.js
codex/server/auth-pre-handler.js
codex/server/routes/read.routes.js
codex/server/routes/search.routes.js
codex/server/routes/analysis.routes.js

src/context/AuthContext.jsx
src/pages/Read/SearchPanel.jsx
src/pages/Read/AnalysisPanel.jsx
src/pages/Read/ScrollList.jsx
src/pages/Read/ExportButton.jsx
20. Final Verdict

This v2 keeps the original PDR’s best bones:

Freemium subscription.
Stripe Checkout.
Webhook-derived Pro state.
Server-side enforcement.
Reuse of existing auth, user, scroll, admin, and route patterns.

The main improvements are:

A richer entitlement snapshot.
Explicit cancelAtPeriodEnd.
Structured error contracts.
Clear API shapes.
Safer phase ordering.
Stronger QA coverage.
Better downgrade semantics.

Recommendation: build Phase 1 and Phase 2 first. Get the entitlement spine and server gates working before attaching Stripe. Once the skeleton walks, give it the money cloak. 🧾✨
