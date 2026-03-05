# Epic: Teacher/Tutor Linking (Path A)

> **Created:** 2026-03-05T03:19:31Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Enable parent-initiated sharing of student progress with teachers, tutors, and other educators. Teachers get free read-only accounts with an aggregated dashboard of linked students. Students remain parent-owned and portable across school years. Path A approach: bottom-up adoption where parents control sharing. Deferred: classroom/school model (Path B), bulk provisioning, FERPA, SSO.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Teacher Role & Schema
**Goal:** Teacher account type and share link data model

1. [ ] [RSH] Review Better-Auth role system: confirm adding "teacher" role alongside existing "admin" and default user roles. Determine if teacher needs its own org or operates independently (recommendation: no org, just a role + link table)
2. [ ] [IMP] Add `teacher_links` table: id, parentUserId, childUserId, teacherUserId, shareCode (unique, short alphanumeric), status (active/revoked), createdAt, revokedAt. Add Drizzle schema + migration
3. [ ] [IMP] Add teacher signup flow: teacher selects "I'm an educator" during signup, sets role to "teacher". Teachers don't need subscriptions — free accounts
4. [ ] [TST] Verify: teacher account creation works, teacher_links table exists, share codes are unique

**Validation:** Teacher role exists. Share link schema supports parent → child → teacher relationships. Teachers can sign up without payment.

---

## Phase 2: Sharing API
**Goal:** Parents generate share codes, teachers redeem them to link to students

1. [ ] [IMP] Parent share endpoint: `POST /api/family/children/:childId/share` — generates a unique 8-character share code, creates teacher_links row with status "pending" (no teacher yet). Returns share code for parent to give to teacher
2. [ ] [IMP] Teacher redeem endpoint: `POST /api/teacher/link` — accepts share code, sets teacherUserId, changes status to "active". Validates: code exists, not already redeemed, teacher role required
3. [ ] [IMP] Parent revoke endpoint: `DELETE /api/family/share/:linkId` — sets status to "revoked", sets revokedAt. Only parent (link owner) can revoke
4. [ ] [IMP] List endpoints: `GET /api/family/children/:childId/shares` (parent: list all links for a child), `GET /api/teacher/students` (teacher: list all linked students with basic info)
5. [ ] [TST] Verify: full flow — parent generates code → teacher redeems → link active → parent revokes → teacher loses access. Role enforcement on all endpoints

**Validation:** Share code flow works end-to-end. Only parents can generate/revoke. Only teachers can redeem. Revocation immediately removes teacher access.

---

## Phase 3: Teacher Dashboard
**Goal:** Read-only view of linked students' progress

1. [ ] [IMP] Teacher data access layer: service that queries progress, mastery, and session data scoped to only teacher's linked students. Reuse existing progress queries with teacher-link join filter
2. [ ] [IMP] Per-student view: teacher sees individual student's mastery progress (topics mastered/in-progress/not-started), recent session activity, current struggle areas (topics with high lapse count or low stability)
3. [ ] [IMP] Aggregate class view: mastery heatmap across all linked students × topics, common struggle topics (sorted by aggregate difficulty), class-wide session activity summary
4. [ ] [IMP] Teacher dashboard page (`/teacher`): student list sidebar, per-student detail panel, aggregate view toggle. Responsive layout for desktop and tablet
5. [ ] [TST] Verify: teacher sees only linked students. Data matches what parents see in family dashboard. Revoking a link immediately removes student from teacher view. Aggregate stats are correct

**Validation:** Teacher can see meaningful progress data for all linked students. Cannot see billing, family info, or unlinked students. Aggregate view helps identify class-wide patterns.

---

## Phase 4: Parent Controls & Polish
**Goal:** Full parent control over teacher access with clear UI

1. [ ] [IMP] Family settings → "Shared with Teachers" section: list active teacher links per child (teacher name, linked date), revoke button, generate new share code button. Show pending (unredeemed) codes with copy/share action
2. [ ] [IMP] Email invite alternative: parent enters teacher's email → system sends invite email with share code link. Teacher clicks link → redirected to signup/login → auto-redeems code
3. [ ] [IMP] Notifications: parent gets notified when a teacher redeems their share code (in-app notification or email). Teacher gets notified if access is revoked
4. [ ] [TST] Verify: parent UI shows all link states (pending, active, revoked). Email invite flow works. Notifications fire correctly. ARIA labels on all controls

**Validation:** Parents have full visibility and control over who sees their child's data. Teacher linking is easy (share code or email invite). Both parties are notified of status changes.
