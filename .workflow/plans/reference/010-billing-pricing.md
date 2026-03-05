# Plan: Billing & Pricing (Stripe)

> **Created:** 2026-03-05T03:19:31Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Stripe-based subscription billing with free/paid tiers, usage-capped AI features, and configurable overage spending. Implements the billing mechanics on top of plan 007 Phase 5's account model (orgs as billing layer, account_links as visibility layer, any account can learn + teach).

**Depends on:** Plan 007 Phase 5 (Account Model & Billing Restructure — orgs, account_links, and flexible roles must exist).

**Pricing model (from DECISIONS.md):**
- **Free tier:** Full learning platform minus AI features (graph, SRS, content, browser TTS)
- **$5/mo or $50/yr:** Unlocks AI features with $3/mo usage cap
- **Overage:** Configurable monthly spend cap in $5 increments (each $5 = $3 usage + $2 margin)
- **Teacher accounts:** Always free (read-only visibility via account_links, growth channel)
- **Anonymous users:** No AI features, no persistence (handled by 007 Phase 6)

**Billing layers (aligned with 007 account model):**
- **Org billing:** Org owner subscribes on behalf of org. Per-student budget (~$5/student suggested). Usage aggregated across all org members. Applies to family, school, and tutoring orgs.
- **Individual billing:** Accounts without an org self-subscribe ($5/mo or $50/yr). Same AI features.
- **Priority:** org billing > individual billing > free tier. If user belongs to a billing org, org billing takes priority.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Stripe Integration & Schema
**Goal:** Stripe SDK in Workers, subscription products/prices, DB schema for billing that supports both org-level and individual subscriptions.

1. [ ] [RSH] Research Stripe SDK in Cloudflare Workers: confirm `createFetchHttpClient()` pattern, webhook signature verification (`constructEventAsync()`), identify required Stripe products/prices setup (monthly $5, annual $50, $5 add-on).

2. [ ] [CFG] Install `stripe` package, configure in Workers with `createFetchHttpClient()`. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env bindings.

3. [ ] [IMP] Create Stripe products/prices (script or manual): "Learn Platform AI" product with monthly ($5) and annual ($50) recurring prices, plus "$5 AI Usage Add-on" one-time price.

4. [ ] [IMP] Add DB schema: `subscriptions` table — `id`, `orgId` (nullable FK -> organizations, for org billing), `userId` (nullable FK -> users, for individual billing), `stripeCustomerId`, `stripeSubscriptionId`, `plan` (monthly|annual), `status`, `currentPeriodStart`, `currentPeriodEnd`, `monthlySpendCap` (default 500 = $5), `extraUsageEnabled` (default false), `createdAt`, `updatedAt`. Constraint: exactly one of orgId or userId must be non-null. Add `usage_periods` table — `id`, `subscriptionId` (FK), `periodStart`, `periodEnd`, `aiSpendCents` (aggregated from llm_usage + speech costs), `addOnsPurchased`, `addOnsSpendCents`, `cappedAt`.

5. [ ] [IMP] Generate and apply Drizzle migration for new tables.

6. [ ] [TST] Verify: Stripe SDK initializes in Worker, migration applies, schema types correct, constraint enforces org-xor-individual.

**Validation:** Stripe SDK works in Workers. Schema supports both org-level and individual subscriptions. Products/prices created in Stripe.

---

## Phase 2: Subscription Lifecycle
**Goal:** Org owners and individual users can subscribe, cancel, and renew via Stripe Checkout.

1. [ ] [IMP] Create billing service (`createBillingService(db, stripe)`): methods for creating checkout sessions, managing subscriptions, querying status. Resolves billing context: if user belongs to a billing org, operate on org subscription; otherwise operate on individual subscription.

2. [ ] [IMP] Add billing routes (`/api/billing`): `POST /checkout` (create Stripe Checkout session — org owner subscribes for org, individual subscribes for self), `POST /portal` (Stripe billing portal for manage/cancel), `GET /status` (current subscription + usage summary — resolves org vs individual automatically).

3. [ ] [IMP] Implement Stripe webhook endpoint (`POST /api/billing/webhook`): handle `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.

4. [ ] [IMP] Webhook handlers: create/update subscription record, update usage period boundaries on renewal, handle cancellation (mark status, preserve data), handle failed payments (grace period or immediate disable).

5. [ ] [TST] Verify: full lifecycle with Stripe test mode — org owner subscribes → active → cancel → expired. Individual subscribes → active → cancel. Webhook events correctly update DB. Annual and monthly plans both work.

**Validation:** Org owner can subscribe for the org. Individual can self-subscribe. Both manage via Portal. All state changes flow through webhooks.

---

## Phase 3: Usage Tracking & Caps
**Goal:** Track AI spend against $3/mo cap, enforce limits per billing period. Usage aggregated across org members for org subscriptions.

1. [ ] [IMP] Create usage tracking service: sum `llm_usage.costCents` + speech transcription costs per subscription per billing period. For org subscriptions, aggregate across all org member userId's. For individual subscriptions, aggregate for the single userId. Speech costs: add `costCents` tracking to speech/transcribe route (audio duration x $0.00051/min).

2. [ ] [IMP] Add AI gating middleware: before LLM and speech routes, resolve user's active subscription (org priority > individual > none). If no subscription, return 403 `{ error: "subscription_required" }`. If subscription active, check current period's AI spend against $3 cap (or extended cap if add-ons purchased). Return 402 `{ error: "usage_cap_reached", currentSpend, cap, canPurchaseAddOn }` when exceeded.

3. [ ] [IMP] Add usage query endpoint: `GET /api/billing/usage` returns current period spend, cap, percentage used, next reset date. Resolves org vs individual automatically.

4. [ ] [IMP] Implement 80% warning: when usage crosses $2.40, set a flag queryable by frontend for a subtle banner.

5. [ ] [TST] Verify: usage accumulates correctly across LLM + speech calls. Org usage aggregates across members. Individual usage tracks solo. Cap enforced at $3. 80% threshold detected. Usage resets on new billing period.

**Validation:** AI features blocked when $3 cap reached. Usage accurately sums all AI costs across org members. Reset works on period boundary.

---

## Phase 4: Overage & Spend Cap
**Goal:** Configurable monthly spend limit with automatic add-on purchases. Org owner controls cap for org subscriptions; individual controls their own.

1. [ ] [IMP] Spend cap settings on subscription: `monthlySpendCap` (default 500 cents = $5, adjustable in 500-cent increments), `extraUsageEnabled` (boolean, default false). For org subscriptions, only org owner/admin can modify. For individual subscriptions, the user controls.

2. [ ] [IMP] Auto-charge logic: when AI usage hits a $3 boundary and `extraUsageEnabled` is true and total spend < `monthlySpendCap`, create a Stripe PaymentIntent for $5, record add-on in `usage_periods.addOnsPurchased`, extend effective cap by $3.

3. [ ] [IMP] Spend cap API: `PATCH /api/billing/spend-cap` to update monthlySpendCap and extraUsageEnabled. Validate: multiple of 500 cents, minimum 500. Permission check: org owner/admin for org subs, self for individual.

4. [ ] [TST] Verify: add-on auto-charges at $3 boundary, respects monthlySpendCap, multiple add-ons work ($15 cap = base + 2 add-ons), hard stop at cap. Org owner controls org cap. Individual controls their own.

**Validation:** Parent sets $15 cap -> usage auto-extends at $3 and $6, blocks at $9. School admin sets $10 cap for school org. Default $5 cap = no add-ons unless enabled.

---

## Phase 5: Free/Paid Tier Gating
**Goal:** Three-tier access: anonymous (no account, no AI, no persistence), free (account, no AI), paid (account + AI). All non-AI features fully functional at every tier.

1. [ ] [IMP] Add subscription check middleware to AI routes (LLM + speech): resolve billing context (org > individual > none). No subscription = 403 with `{ error: "subscription_required", upgradeUrl }`. No account (anonymous from 007 P6) = 403 with `{ error: "account_required", signupUrl }`. Skip check for free-tier-safe routes (graph, learn session without LLM, progress, family, teach mode).

2. [ ] [IMP] Frontend subscription context: composable `useSubscription()` exposing `{ isAnonymous, hasAccount, hasSubscription, plan, usage, usagePercent, capReached, canUpgrade }`. Query from `/api/billing/status` (returns null for anonymous).

3. [ ] [IMP] Graceful UI degradation: anonymous users see "Create account" prompts near AI features. Free users see "Upgrade to get AI tutoring" in place of tutor/hint buttons, hide mic button (STT). All non-AI features fully functional at every tier. Teach mode always works (no AI needed).

4. [ ] [TST] Verify: anonymous user gets full platform minus AI and persistence. Free user gets full platform minus AI. Subscriber gets everything. Expired subscriber reverts to free. No broken UI states at any tier.

**Validation:** Three tiers are distinct and functional. Free tier is a complete learning experience. Upgrade paths are clear. Teach mode works for everyone.

---

## Phase 6: Billing UI
**Goal:** Settings pages for subscription management, usage visibility, spend cap control. Single source of truth for all billing-related UI.

1. [ ] [IMP] Subscription management page: current plan display, subscribe button (free users), manage/cancel via Stripe Portal link, plan comparison (free vs AI-assisted). For org owners: shows org subscription status, member count, aggregate usage. For individuals: shows personal subscription.

2. [ ] [IMP] Usage dashboard component: current period AI spend as progress bar with $3 markers, percentage label, "resets on [date]" text, color changes at 80% (yellow) and 100% (red). For org owners: per-member usage breakdown alongside aggregate.

3. [ ] [IMP] Spend cap settings: "Monthly spend limit" dropdown in $5 increments ($5, $10, $15...), "Allow extra usage" toggle, current add-on count this period. Permission-gated: org owner/admin for org subs, self for individual.

4. [ ] [IMP] Usage cap reached state: at 100%, show "Add $5 for more AI features" button (if under cap) or "Usage limit reached, resets [date]" (if at cap). Link to adjust spend limit settings.

5. [ ] [TST] Verify: all billing UI states render correctly (anonymous, free, subscribed, near-cap, at-cap, over-cap with add-ons). Stripe Portal opens. Spend cap adjustments persist. Org owner sees aggregate view.

**Validation:** User can subscribe, see usage, adjust spend cap, and manage subscription entirely from settings UI. Org owners see org-level billing. All states clear and actionable.
