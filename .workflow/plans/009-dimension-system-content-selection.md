# Plan: Dimension System & Content Selection

> **Created:** 2026-03-06T23:45:24Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Make the content dimension system functional end-to-end. The schema supports 5 dimensions (flavor, locale, presentation, contentDepth, version) but the session service ignores all of them — `getTopicProblems()` queries `WHERE topic_id = ?` with zero dimension filtering. The content selection algorithm documented in `content-system.md` §6 is not implemented. User profile → presentation level mapping doesn't exist. Spiral depth tracking for context-layered subjects doesn't exist. Import tooling hardcodes `classic/en/individual/survey/v1`.

This plan closes the gap so that when content is generated across dimensions, it's actually served correctly to the right learner.

**Depends on:** Plan 007 (content model restructure — done), Plan 008 Phase 4 (content matrix — done)

**Feeds into:** Plan 012 (content generation pipeline) — generated multi-variant content needs selection to work

**System review reference:** `docs/system-review-2026-03-06.md` — Tier 1 priorities

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓
**In Progress:** —
**Next:** Phase 3

---

## Phase 1: Content Selection Engine ✓
**Goal:** Session service filters content by `(topicId, contentDepth, presentation, locale)` with documented fallback chain. Users receive age-appropriate content.

1. [x] [IMP] Build `resolvePresentation(user)` function: reads `birthYear` from user profile (or explicit preference if set), maps to presentation level — K-2 → `primary`, 3-5 → `intermediate`, 6-8 → `standard`, 9+ → `advanced`. Returns `standard` as default for anonymous users. Add presentation preference field to `userPreferences` table as optional override.

2. [x] [IMP] Build `resolveContentDepth(userId, topicId, disciplineId)` function: for mastery-gated disciplines, always returns `survey` (depth is in the topic graph, not content). For context-layered disciplines, reads the user's completed depth for this topic (Phase 2 schema) and returns the next uncompleted depth. For flexible, returns `survey`.

3. [x] [IMP] Refactor `getTopicProblems(topicId)` and `getTopicExamples(topicId)` in session service to accept dimension parameters `(topicId, contentDepth, presentation, locale)`. Query filters by all dimensions. Implement fallback chain from content-system.md §6:
   - a. Try adjacent presentation (standard if intermediate unavailable)
   - b. Try `classic` flavor if requested flavor unavailable
   - c. Try `en` locale if requested locale unavailable
   - d. Try `survey` depth if requested depth unavailable
   - e. Use generic fallback content (existing `makeFallbackProblem`/`makeFallbackExample`)

4. [x] [IMP] Wire content selection into session flow: `buildPhaseItem()` calls `resolvePresentation()` and `resolveContentDepth()` for the current user and topic, passes dimensions to content queries. Anonymous sessions use `standard` presentation and `survey` depth.

5. [x] [TST] Verify: user with birthYear=2020 (age 6) gets `primary` presentation content when it exists, falls back to next available. User with birthYear=2012 (age 14) gets `standard`. Content depth resolution returns correct depth per discipline type. Fallback chain works when exact match doesn't exist. All existing tests still pass.

**Validation:** Two users of different ages studying the same topic receive different presentation-level content. Fallback chain prevents blank screens when content variants don't exist.

---

## Phase 2: Spiral Depth Tracking ✓
**Goal:** Track which content_depth levels a user has completed per topic. Required for context-layered subjects to implement spiral curriculum progression.

1. [x] [IMP] Add `user_topic_depth` table (or extend `user_topic_state`): `userId`, `topicId`, `contentDepth` ('survey'|'contextual'|'analytical'|'synthesis'), `completed` (boolean), `completedAt`. Unique constraint on `(userId, topicId, contentDepth)`. This tracks per-depth completion independently of overall topic mastery.

2. [x] [IMP] Update session service `respond()`: when a student demonstrates mastery at a given content depth for a topic (correct on independent practice), mark that depth as completed. For mastery-gated disciplines, completing `survey` depth = topic mastery (existing behavior). For context-layered, topic mastery requires completing the highest depth level the student has been exposed to (or all four for full mastery).

3. [x] [IMP] Update frontier computation for context-layered disciplines: frontier includes topics where the student's current depth level has unmastered content, not just topics where the topic itself is unmastered. A student who has completed `survey` on all topics enters the `contextual` pass of the spiral — the same topics reappear at deeper content depth.

4. [x] [TST] Verify: depth completion records are created on mastery events. Context-layered frontier correctly returns topics for the next depth pass. Mastery-gated disciplines are unaffected (still topic-level mastery). Spiral progression works: student completes survey pass, then gets contextual pass on same topics.

**Validation:** A context-layered subject (e.g., US History) spirals correctly — student masters all topics at survey depth, then the same topics reappear at contextual depth with deeper content.

---

## Phase 3: Dimension-Aware Import & Tooling
**Goal:** Import pipeline reads dimension metadata from content JSON instead of hardcoding defaults. Admin matrix reflects actual dimension coverage.

1. [ ] [IMP] Update content JSON schema: problem and example JSON files can optionally include `flavor`, `locale`, `presentation`, `contentDepth` fields. When absent, defaults apply (`classic`, `en`, `standard`, `survey`). Update `tools/validate-content.ts` to validate dimension values when present.

2. [ ] [IMP] Update `tools/import-content.ts`: read dimension fields from content JSON. Insert with actual values instead of hardcoded `'classic', 'en', 'individual', 1`. Support importing multiple dimension variants for the same topic from separate files or a single file with dimension annotations.

3. [ ] [IMP] Update `tools/export-sql.ts`: same dimension-awareness as import. Export SQL includes actual dimension values.

4. [ ] [TST] Verify: content files with explicit dimensions import correctly. Content files without dimensions still import with defaults (backwards compatible). Admin content matrix shows correct dimension coverage after import. Round-trip: export → import produces identical data.

**Validation:** Content files can specify their dimensions. Import respects them. Admin matrix accurately shows what dimension combinations exist per topic.

---

## Phase 4: Integration Validation
**Goal:** End-to-end verification that multi-dimension content flows through the entire system correctly.

1. [ ] [IMP] Generate a small multi-variant test set: pick 3 topics, create content at `primary`, `intermediate`, and `standard` presentation levels. Create one topic with `survey` and `contextual` depth variants. Import all variants.

2. [ ] [TST] End-to-end integration test: create two test users (one age 6, one age 14), start sessions, verify each receives their presentation-level content. Verify fallback chain when a specific variant doesn't exist. Verify context-layered depth progression with the multi-depth topic.

3. [ ] [IMP] Update `validateDAG()` in graph service to support cross-subject prerequisite validation. Current implementation scopes to a single subject — when a second subject is added (ELA, history), cross-subject edges (e.g., reading comprehension → word problems) must be validated without false cycle detection. Validate the full connected graph across subjects, not just within one subject.

4. [ ] [DOC] Update `docs/content-system.md` §6 to reflect actual implementation details (any deviations from the documented algorithm). Update `CLAUDE.md` conventions if any patterns changed.

**Validation:** A 6-year-old and a 14-year-old user both studying the same topic receive different presentation-level content. Context-layered subject tracks spiral depth completion. Cross-subject prerequisites validate correctly. The dimension system is no longer inert.
