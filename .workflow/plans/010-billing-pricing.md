# Epic: Billing & Pricing (Stripe)

> **Created:** 2026-03-05T03:19:31Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Add Stripe-based subscription billing with free/paid tiers, usage-capped AI features, and configurable overage spending. Two plans: $5/mo and $50/yr. Each billing period includes $3 of AI usage (LLM tutoring/grading/hints + speech-to-text). Parents can set a monthly spend cap in $5 increments to allow automatic overage add-ons. 40% gross margin at every price point. Free tier retains full learning platform without AI features. Builds on existing family accounts, llm_usage tracking, and OpenRouter budget enforcement.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Stripe Integration & Schema
**Goal:** Stripe SDK in Workers, subscription products/prices, DB schema for billing

1. [ ] [RSH] Research Stripe SDK in Cloudflare Workers: confirm `createFetchHttpClient()` pattern, webhook signature verification (`constructEventAsync()`), identify required Stripe products/prices setup (monthly $5, annual $50, $5 add-on)
2. [ ] [CFG] Install `stripe` package, configure in Workers with `createFetchHttpClient()`. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to env bindings
3. [ ] [IMP] Create Stripe products/prices (script or manual): "Learn Platform AI" product with monthly ($5) and annual ($50) recurring prices, plus "$5 AI Usage Add-on" one-time price
4. [ ] [IMP] Add DB schema: `subscriptions` table (id, orgId, stripeCustomerId, stripeSubscriptionId, plan: monthly|annual, status, currentPeriodStart, currentPeriodEnd, monthlySpendCap, extraUsageEnabled, createdAt, updatedAt). Add `usage_periods` table (id, orgId, periodStart, periodEnd, aiSpendCents, addOnsPurchased, addOnsSpendCents, cappedAt)
5. [ ] [IMP] Generate and apply Drizzle migration for new tables
6. [ ] [TST] Verify: Stripe SDK initializes in Worker, migration applies, schema types are correct

**Validation:** Stripe SDK works in Workers environment. New tables exist with correct columns. Products/prices created in Stripe dashboard.

---

## Phase 2: Subscription Lifecycle
**Goal:** Users can subscribe, cancel, and renew via Stripe Checkout

1. [ ] [IMP] Create billing service (`createBillingService(db, stripe)`): methods for creating checkout sessions, managing subscriptions, querying status
2. [ ] [IMP] Add billing routes (`/api/billing`): `POST /checkout` (create Stripe Checkout session for monthly or annual), `POST /portal` (create Stripe billing portal session for manage/cancel), `GET /status` (current subscription + usage summary)
3. [ ] [IMP] Implement Stripe webhook endpoint (`POST /api/billing/webhook`): handle `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. [ ] [IMP] Webhook handlers: create/update subscription record in DB, update usage period boundaries on renewal, handle cancellation (mark status, don't delete data), handle failed payments (grace period or immediate disable)
5. [ ] [TST] Verify: full lifecycle with Stripe test mode — subscribe → active → cancel → expired. Webhook events correctly update DB. Annual and monthly plans both work.

**Validation:** User can subscribe via Checkout, manage via Portal, cancel, and re-subscribe. All state changes flow through webhooks to DB. Test mode end-to-end.

---

## Phase 3: Usage Tracking & Caps
**Goal:** Track AI spend against $3/mo cap, enforce limits per billing period

1. [ ] [IMP] Create usage tracking service: sum `llm_usage.costCents` + speech transcription costs per org per billing period. Speech costs: add `costCents` tracking to speech/transcribe route (calculate from audio duration × $0.00051/min)
2. [ ] [IMP] Add AI gating middleware: before LLM and speech routes, check current period's AI spend against $3 cap (or extended cap if add-ons purchased). Return 402 with `{ error: "usage_cap_reached", currentSpend, cap, canPurchaseAddOn }` when exceeded
3. [ ] [IMP] Add usage query endpoint: `GET /api/billing/usage` returns current period spend, cap, percentage used, next reset date
4. [ ] [IMP] Implement 80% warning: when usage crosses $2.40, set a flag that frontend can query to show a subtle banner
5. [ ] [TST] Verify: usage accumulates correctly across LLM + speech calls, cap enforced at $3, 80% threshold detected, usage resets on new billing period

**Validation:** AI features blocked when $3 cap reached. Usage accurately sums all AI costs. Reset works on period boundary. 80% warning fires at correct threshold.

---

## Phase 4: Overage & Spend Cap
**Goal:** Configurable monthly spend limit with automatic add-on purchases

1. [ ] [IMP] Add spend cap settings to subscription: `monthlySpendCap` (default 500 cents = $5, adjustable in 500-cent increments), `extraUsageEnabled` (boolean, default false). Store in subscriptions table
2. [ ] [IMP] Implement auto-charge logic: when AI usage hits a $3 boundary and `extraUsageEnabled` is true and total spend < `monthlySpendCap`, automatically create a Stripe PaymentIntent for $5, record add-on in `usage_periods.addOnsPurchased`, extend the effective cap by $3
3. [ ] [IMP] Add spend cap API: `PATCH /api/billing/spend-cap` to update monthlySpendCap and extraUsageEnabled. Validate: must be multiple of 500 cents, minimum 500 (base subscription)
4. [ ] [TST] Verify: add-on auto-charges at $3 boundary, respects monthlySpendCap, multiple add-ons work for high caps ($15 cap = base + 2 add-ons), hard stop at cap

**Validation:** Parent sets $15 cap → usage auto-extends at $3 and $6, blocks at $9. Default $5 cap → no add-ons unless enabled. Stripe charges are correct.

---

## Phase 5: Free/Paid Tier Gating
**Goal:** AI features gated behind active subscription, free tier fully functional

1. [ ] [IMP] Add subscription check middleware to AI routes (LLM + speech): if no active subscription for user's org, return 403 with `{ error: "subscription_required", upgradeUrl }`. Skip check for free-tier-safe routes (graph, learn session without LLM, progress, family management)
2. [ ] [IMP] Frontend subscription context: composable `useSubscription()` that exposes `{ hasSubscription, plan, usage, usagePercent, capReached, canUpgrade }`. Query from `/api/billing/status`
3. [ ] [IMP] Graceful UI degradation: hide mic button (STT) when no subscription, show "Upgrade to get AI tutoring" in place of tutor/hint buttons, keep all non-AI features fully functional
4. [ ] [TST] Verify: free user gets full platform minus AI features. Subscriber gets everything. Expired subscriber reverts to free. UI shows correct upgrade prompts without broken states

**Validation:** Free tier is a complete, functional learning experience. Paid features are clearly gated with upgrade paths. No broken UI states for any subscription status.

---

## Phase 6: Billing UI
**Goal:** Settings pages for subscription management, usage visibility, spend cap control

1. [ ] [IMP] Subscription management page: current plan display, subscribe button (free users), manage/cancel via Stripe Portal link, plan comparison (free vs AI-assisted)
2. [ ] [IMP] Usage dashboard component: current period AI spend as progress bar with $3 markers, percentage label, "resets on [date]" text, color changes at 80% (yellow) and 100% (red)
3. [ ] [IMP] Spend cap settings: "Monthly spend limit" dropdown/slider in $5 increments ($5, $10, $15, $20, $25...), "Allow extra usage" toggle (enables auto add-ons), current add-on count this period
4. [ ] [IMP] Usage cap reached state: when at 100%, show clear message with "Add $5 for more AI features" button (if under cap) or "Usage limit reached, resets [date]" (if at cap). Link to adjust spend limit settings
5. [ ] [TST] Verify: all billing UI states render correctly (free, subscribed, near-cap, at-cap, over-cap with add-ons). Stripe Portal opens. Spend cap adjustments persist

**Validation:** Parent can subscribe, see usage, adjust spend cap, and manage subscription entirely from the settings UI. All states are clear and actionable.
