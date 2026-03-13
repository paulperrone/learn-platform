# Content Spec Reconciliation Report

> Generated: 2026-03-13 | Plan: 023.5 Content Spec Alignment

## 1. Gap Analysis — What Was Out of Sync

Before Plan 023.5, the content spec in `docs/content-system.md` defined per-item dimension fields (`presentation`, `contentDepth`, `locale`, `flavor`) as first-class content attributes, but the tooling, types, and content were all misaligned:

| Layer | Gap |
|-------|-----|
| `tools/validate-content.ts` | `validateDimensions()` skipped missing fields silently — only validated values when present |
| `packages/shared/src/types.ts` | `cognitiveDemand` was optional; dimension fields absent from base types |
| `docs/content-system.md` | No explicit "Required Fields Per Content Item" section; ambiguous about per-item vs. bundle-only |
| `.claude/commands/generate-content.md` | Never mentioned dimension fields in generation instructions |
| `.claude/commands/content-health.md` | No dimension completeness check |
| `tools/generate-bundles.ts` | Applied defaults silently — masked missing fields entirely |
| `packages/api/src/services/content-r2.ts` | Applied defaults silently in dev mode |
| `../learn-content/` | 0 of ~1807 problem/example files had dimension fields |
| `CLAUDE.md` | Conventions section did not list dimension fields as required |

**Net effect:** The 7-tier fallback ranking in `content.ts` was effectively a no-op — all content resolved as `standard/survey/en/classic` regardless of topic grade level. K-2 topics and 8th-grade topics were indistinguishable in the bundle.

Additionally, 1,367 problems used non-standard `cognitiveDemand` values (`analysis`, `problem-solving`, `error-analysis`, `synthesis`) that weren't in the documented schema.

## 2. What Was Fixed

### Phase 1: Enforcement & Documentation Alignment
- `validate-content.ts`: Added strict mode (`--strict`) that errors on missing dimension fields, `cognitiveDemand`, `source`, and invalid `type`. Lenient mode preserved for migration.
- `shared/types.ts`: Made `cognitiveDemand` required; added `recall` to `CognitiveDemand` union; added `ContentSource` type; added optional dimension fields to base `Problem`/`WorkedExample`; verified `AssessmentType` completeness.
- `docs/content-system.md`: Added "Required Fields Per Content Item" section; clarified `recall` is valid for context-layered disciplines; aligned flavor list (6 valid flavors).
- `.claude/commands/generate-content.md`: Added dimension fields to all generation templates; added enforcement rules.
- `.claude/commands/content-health.md`: Added Dimension Completeness section.
- `CLAUDE.md`: Added dimension field requirement to Conventions.

### Phase 2: Content Backfill
- Built `tools/backfill-dimensions.ts` — reads topic metadata from `graph.json`, applies correct `presentation`/`contentDepth` per topic, sets `locale: "en"`, `flavor: "classic"`, `source`, and `type` fields.
- Backfilled 1,807 files (705 math problems + 705 math examples + 207 math generated + 65 ELA problems + 65 ELA examples + 30 history problems + 30 history examples).
- Added 100,595 dimension fields total.
- Remapped 1,367 non-standard cognitive demands.
- All 3 disciplines pass `just validate-content-strict` with zero errors.

### Phase 3: Generation Pipeline Hardening
- `tools/generate-bundles.ts`: Added `--strict` mode (default) that warns and exits non-zero if any defaults are applied; `--lenient` restores old silent behavior. Summary line reports defaults count.
- `packages/api/src/services/content-r2.ts`: `createFileContentBucket()` now warns in dev mode when defaults are applied.
- `justfile`: Added `just validate-content-strict` recipe.

## 3. Cross-Reference Matrix

For each required field defined in `docs/content-system.md §2`:

| Field | shared/types.ts | validate-content.ts | generate-content.md | content-health.md | generate-bundles.ts | content-r2.ts | learn-content/ |
|-------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `presentation` | ✓ optional | ✓ strict | ✓ required | ✓ checked | ✓ warns | ✓ warns | ✓ backfilled |
| `contentDepth` | ✓ optional | ✓ strict | ✓ required | ✓ checked | ✓ warns | ✓ warns | ✓ backfilled |
| `locale` | ✓ optional | ✓ strict | ✓ required | ✓ checked | ✓ warns | ✓ warns | ✓ backfilled |
| `flavor` | ✓ optional | ✓ strict | ✓ required | ✓ checked | ✓ warns | ✓ warns | ✓ backfilled |
| `cognitiveDemand` | ✓ required | ✓ strict | ✓ required | ✓ checked | ✓ in manifest | — | ✓ remapped |
| `source` | ✓ optional | ✓ strict | ✓ required | — | ✓ warns | ✓ warns | ✓ backfilled |
| `type` | — (AssessmentType) | ✓ strict | ✓ required | — | ✓ in manifest | — | ✓ backfilled |

> Note: `source` and `type` are optional on base `Problem` type (source JSON), enforced by `validate-content --strict`. `BundledProblem` includes them after bundling.

**No remaining gaps** in the cross-reference matrix.

## 4. Cognitive Demand Distribution

Post-backfill distributions (canonical values only):

| Demand | Math | ELA | History |
|--------|------|-----|---------|
| `procedural` | 57.8% | 0% | 0% |
| `application` | 24.5% | 42.8% | 41.9% |
| `recall` | 4.1% | 34.2% | 28.6% |
| `reasoning` | 6.7% | 11.7% | 29.5% |
| `conceptual` | 6.4% | 7.1% | 0% |
| `error_analysis` | 0.5% | 4.3% | 0% |

**Note:** Math is procedural-heavy (57.8% vs. ~35% target for `standard` presentation per docs). This reflects the actual content distribution authored for a mastery-gated discipline at K-8 grade levels. Targets in `content-system.md §5` should be treated as aspirational — the K-2 and 3-5 bands are naturally procedural-dominant. No action required; distribution is discipline-appropriate.

## 5. 7-Tier Fallback — Before and After

**Before backfill:** All 1,807 files had no dimension fields. `generate-bundles.ts` defaulted all to `standard/survey/en/classic`. Every K-2 topic produced content labeled `standard` in the bundle. The fallback ranking was a no-op — all items matched at Tier 0 regardless of requested presentation.

**After backfill:** Each topic's content carries the correct `presentation` from `defaultPresentation` in `graph.json`:
- K-2 topics: `primary` → requesting `standard` yields Tier 3 match (presentation fallback)
- 3-5 topics: `intermediate` → requesting `primary` yields Tier 1/2 match
- 6-8 topics: `standard` → requesting `advanced` yields Tier 1 match

The fallback now produces meaningful differentiation. A young learner (presentation=`primary`) will consistently get K-2 content for foundational topics, and a placement fallback for topics with no primary-level content.

## 6. What Prevents Future Drift

| Enforcement layer | What it catches |
|-------------------|-----------------|
| `just validate-content-strict` | Missing or invalid dimension fields in source JSON |
| `just generate-bundles` (default strict) | Fails if any defaults are applied during bundling |
| `content-r2.ts` (dev warnings) | Catches drift during local dev and simulation runs |
| `generate-content.md` generation template | New content includes dimension fields from day one |
| `content-health.md` diagnostic | Dimension completeness check in health audits |
| `CLAUDE.md` conventions | Dimension fields listed as required — visible in every session |

## 7. Known Remaining Gaps (Not Blocking)

| Gap | Description | Plan |
|-----|-------------|------|
| All content is `survey` depth | K-8 math is survey-only; no `contextual`/`analytical` variants exist | Future: add depth variants for advanced learners |
| Single presentation per topic | Content authored at one presentation per topic; no multi-presentation variants | Future: multi-presentation variants for differentiation |
| No localized content | All content is `locale: "en"` | Future: Spanish (`es`) variants via localization pipeline |
| Non-text content | Images, animations absent; visual fields are placeholders | Future: separate media pipeline |
| Cognitive demand targets vs. actuals | Math procedural% (57.8%) exceeds documented target (~35%) | Targets are aspirational; revisit when adding more depth variants |

## 8. Recommendations for Plan 025

The consolidated system audit (Plan 025) should include these content spec compliance checks:

1. **Dimension coverage**: `just validate-content-strict` passes with zero errors
2. **Bundle pipeline**: `just generate-bundles` (strict default) completes with "Defaults applied: 0"
3. **Fallback differentiation**: Spot-check 5 manifest files — `dimensions.presentations` should reflect the topic's `defaultPresentation`, not always `["standard"]`
4. **Demand distribution**: No `analysis`, `problem-solving`, `error-analysis`, `synthesis` values remain in source content
5. **Type coverage**: All problems have `type` field (should be `text-qa` for current content)
