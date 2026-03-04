# Epic: Family Accounts & Parent Dashboard

> **Created:** 2026-03-04T23:26:01Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Add family/team accounts using Better-Auth's organization plugin. A parent creates a "family" org, adds child learner accounts, views all children's progress, and manages shared billing. Children get individual learning experiences with separate progress tracking. Uses Better-Auth organization plugin (family = org, parent = owner, children = members) plus admin plugin for parent-managed child account creation.

## Progress

**Completed:** Phase 1, Phase 2, Phase 3, Phase 4
**In Progress:** —
**Next:** Phase 5

---

## Phase 1: Schema & Auth Plugin Setup ✓
**Goal:** Better-Auth organization + admin plugins wired up with D1

1. [x] [RSH] Review Better-Auth organization + admin plugin docs, confirm D1/SQLite compatibility, identify all new tables needed (organization, member, invitation, plus session columns)
2. [x] [IMP] Add organization and admin plugins to Better-Auth config in `packages/api/src/routes/auth.ts`, add `managedBy` custom field to user schema
3. [x] [IMP] Generate Drizzle migration for new tables (organization, member, invitation, session columns for activeOrganizationId), apply to local D1
4. [x] [TST] Verify: create an org via API, add a member, confirm schema works end-to-end locally

**Validation:** Can create an organization, invite/add a member, and query memberships via Better-Auth API. All new tables exist in D1 with correct columns.

---

## Phase 2: Family Management API ✓
**Goal:** API endpoints for family CRUD, child account creation, role enforcement

1. [x] [IMP] Create family routes (`/api/family`): create family (wraps org create), get family details, update family settings
2. [x] [IMP] Add child management endpoints: parent creates child account (admin plugin `createUser`), adds to family org as member, lists children in family
3. [x] [IMP] Add role-based middleware: verify parent (owner) role for family management endpoints, verify membership for child-scoped data access
4. [x] [IMP] Add parent view endpoints: get progress summary for all children in family, get individual child's detailed progress
5. [x] [TST] Verify: parent creates family → adds child → child logs in → parent sees child's progress data

**Validation:** Full API flow works: create family, add children, query per-child and aggregate progress. Role enforcement blocks unauthorized access.

---

## Phase 3: Parent Dashboard UI ✓
**Goal:** Parent-facing views for managing children and viewing progress

1. [x] [IMP] Create family setup flow: after signup, prompt to create family or join as child, family name/settings form
2. [x] [IMP] Build child management page: add child (name, birth year), edit child details, remove child from family
3. [x] [IMP] Build per-child progress view: reuse existing progress page components scoped to selected child
4. [x] [IMP] Build family overview dashboard: all children's progress at a glance (topics mastered, sessions completed, streaks), combined family LLM usage
5. [x] [TST] Verify: parent signup → create family → add 2 children → children complete sessions → parent sees both children's progress

**Validation:** Parent can manage children and view their learning progress. Child accounts work independently for learning. Dashboard shows aggregate and per-child views.

---

## Phase 4: Child Experience Guards ✓
**Goal:** Age-appropriate UX restrictions for child accounts

1. [x] [IMP] Restrict child account self-modification: children can't change email, delete account, or manage family. Simplified settings page for children.
2. [x] [IMP] Add simplified child navigation: hide family management, billing, and admin sections. Focus on learning, progress, and explore views.
3. [x] [TST] Verify: child login shows simplified UI, cannot access parent-only routes, learning experience is unchanged

**Validation:** Child accounts have a clean, focused learning experience. Parent-only features are hidden and API-enforced (not just UI-hidden).

---

## Phase 5: Usage Tracking & Billing Foundation
**Goal:** Per-user LLM usage tracking rolled up to family level

1. [ ] [IMP] Aggregate LLM usage by family: query `llm_usage` for all family members, sum costs, break down by child and purpose
2. [ ] [IMP] Add usage limits and alerts: configurable per-family monthly LLM budget, warn at 80%/100%, block at limit (graceful degradation — learning works, tutoring paused)
3. [ ] [TST] Verify: children use LLM features → parent sees per-child and total usage → hitting limit pauses LLM features without breaking core learning

**Validation:** Parent can see exactly how much LLM usage each child generates. Usage limits are enforced at the API level. Core learning (non-LLM) continues even when limit is hit.
