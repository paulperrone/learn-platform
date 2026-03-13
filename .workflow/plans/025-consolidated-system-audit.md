# Plan 025: Consolidated System Audit

> **Created:** 2026-03-13T16:59:02Z
> **Completed:** 2026-03-13
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Create a unified `just audit` command that orchestrates all validation, content health, simulation evaluation, live analytics, and LLM tracking checks into a single markdown + JSON report. Integrates static checks (filesystem + learn-content), simulation data (baselines + evaluation results), R2/ContentBucket manifest inventory (from Plan 023), D1 review_log queries, and Analytics Engine content effectiveness data. Supports offline mode (pre-launch: static + simulation only) and live mode (post-launch: adds real user data from D1 + AE).

**Depends on:** Plan 023 (R2 architecture, AE events, ContentBucket abstraction), Plan 024 (LLM attribution in AE + D1)
**Data sources:**
- Filesystem: learn-content JSON files, graph.json, simulation baselines/reports
- R2 manifests (via ContentBucket): dimension coverage, version freshness, media inventory
- D1 review_log: long-term SRS data (permanent, compact)
- D1 llm_usage: LLM cost and attribution (permanent)
- Analytics Engine: per-problem granularity (90-day TTL)

## Progress

**Completed:** Phase 1, Phase 2, Phase 3
**In Progress:** —
**Next:** —

---

## Phase 1: Audit Orchestrator & Static Report ✓
**Goal:** Build `tools/audit.ts` that runs all static validation and simulation checks, producing a structured JSON + markdown report. Works fully offline — no deployed API or user data needed.

### Context for Execution

**Existing tools to orchestrate (import their logic, don't shell out):**
- `tools/validate-graph.ts` — DAG integrity, density guardrails, bottleneck detection, encompassing quality
- `tools/validate-content.ts` — problem structure, platform compatibility, dimension validation
- `tools/content-status.ts` — per-topic health score (0-100 composite)
- `tools/content-gaps.ts` — gap detection ranked by impact
- `tools/content-report.ts` — density & coverage overview
- `simulations/reports/evaluation.json` — latest simulation evaluation results
- `simulations/baselines/*.json` — baseline snapshots per maturity level
- `simulations/targets.json` — system metric targets

**Report sections (7):**
1. **Graph Integrity** — DAG valid, topic/edge counts, density vs targets, bottlenecks, cross-discipline edges
2. **Content Quality** — topics with problems/examples, health score distribution, gap summary, demand diversity
3. **Simulation Results** — system metric pass/warn/fail, per-profile highlights, content flags (too hard/easy)
4. **Content Effectiveness** — [live only] per-topic accuracy, difficulty spikes, hint patterns
5. **LLM Tracking** — instrumentation completeness check, cost summary, [live only] effectiveness metrics
6. **Media Readiness** — visual component inventory, R2 media asset counts, future media gaps
7. **Multi-Discipline Coverage** — per-discipline topic counts, content completeness, progression model status

1. [x] [IMP] Define audit report schema (`tools/audit-types.ts`):
   - TypeScript types for each of the 7 report sections
   - Overall `AuditReport` type with metadata (timestamp, mode, versions)
   - Per-item status: `pass` | `warn` | `fail` | `info` | `pending` (for live-only sections)
   - Threshold definitions: what constitutes pass/warn/fail for each metric

2. [x] [IMP] Build `tools/audit.ts` — main orchestrator:
   - Import and call validation logic from existing tools (not subprocess — direct function calls)
   - Graph section: call validate-graph logic, extract counts, density, bottlenecks
   - Content section: call content-status logic for health scores, content-gaps for gap summary
   - Simulation section: load latest `evaluation.json` from `simulations/reports/`, summarize system metrics
   - LLM section: check schema completeness (do `llm_usage` columns exist? does AE schema include llmAssisted?)
   - Media section: scan learn-content for visual assets in problems/examples, count by type
   - Multi-discipline section: iterate disciplines in learn-content, count topics/problems/examples per discipline
   - Handle missing data gracefully (no simulation runs yet, no content for a discipline, etc.)

3. [x] [IMP] Build markdown renderer (`tools/audit-render.ts`):
   - Takes `AuditReport` JSON, produces formatted markdown
   - Pass/warn/fail indicators: ✅ / ⚠️ / ❌
   - Summary section at top with overall health
   - Expandable detail sections for each of the 7 areas
   - Actionable recommendations at bottom (e.g., "42 topics below 50 health — run `/content-health math` to investigate")

4. [x] [IMP] Add `just audit` recipe to justfile:
   - `just audit` — runs static-only audit, outputs markdown to stdout + JSON to `simulations/reports/audit-latest.json`
   - `just audit --json` — JSON only (for programmatic consumption)
   - `just audit --save` — saves to `simulations/reports/audits/{timestamp}.json`

5. [x] [IMP] Refactor existing tools for importability:
   - Ensure `validate-graph.ts`, `content-status.ts`, `content-gaps.ts` export their core logic as functions (not just CLI entry points)
   - If they currently only run as scripts, extract the logic into exported functions with a CLI wrapper
   - Keep CLI entry points working (backward compat with existing `just validate-content`, etc.)

6. [x] [TST] Test audit orchestrator:
   - Unit test: report schema validates correctly
   - Unit test: graph section populates from learn-content math graph
   - Unit test: content section populates health scores
   - Unit test: simulation section loads evaluation.json correctly
   - Unit test: missing data produces `pending` status (not crash)
   - Integration test: `just audit` produces valid markdown output
   - `just test` passes, `just typecheck` passes

**Validation:** `just audit` produces a complete 7-section report. Static sections (graph, content, simulation, media, multi-discipline) are fully populated. Live sections (content effectiveness, LLM details) show "awaiting user data." Report accurately reflects known issues (254 too-hard topics, FIRe disabled at 1.01 density, ELA/history stubs).

---

## Phase 2: R2 Manifest & Live Analytics Integration ✓
**Goal:** Add R2/ContentBucket manifest inventory for content dimension coverage, and live analytics sections that query D1 + AE when `--live` flag is passed.

### Context for Execution

**R2/ContentBucket integration:**
- `packages/api/src/services/content-r2.ts` — `ContentBucket` interface, `createFileContentBucket()`
- R2 manifests contain: problem counts, difficulty distribution, demand distribution, available dimensions (presentations, depths, locales, flavors), content hash, version
- For CLI tool: use `createFileContentBucket()` to read from learn-content filesystem (same as simulations)
- Can also read generated bundles from `/tmp/learn-content-bundles/` if available

**Live data sources (require deployed API or direct D1 access):**
- D1 `review_log` — per-topic accuracy, hint usage, response time, confidence, content_version, llm_assisted
- D1 `user_topic_state` — mastery counts, lapse rates, stability
- D1 `llm_usage` — cost, purpose, topic attribution (from Plan 024)
- AE — per-problem granularity (query via Cloudflare REST API or admin endpoint proxy)

**Design decision:** For `--live` mode, query the deployed admin API endpoints directly (requires `AUDIT_API_URL` env var). This avoids duplicating query logic and works with any environment (preview, production). Alternative: direct D1 access via wrangler — but admin endpoints already have the right aggregation logic.

1. [x] [IMP] Build R2 manifest scanner:
   - Use `createFileContentBucket()` to iterate all disciplines and topics
   - For each topic: read manifest.json (if exists), extract:
     - Problem count, example count, media asset count
     - Available dimensions: presentations, depths, locales, flavors
     - Content hash, generated timestamp
     - Difficulty distribution, demand distribution, question type distribution
   - Aggregate per discipline:
     - Total problems, examples, media assets
     - Dimension coverage matrix (how many topics have primary? intermediate? standard? advanced?)
     - Version freshness (oldest/newest content, median age)
     - Media type inventory (number-line, fraction-bar, etc.)
   - Integrate into audit report section 6 (Media Readiness) and section 2 (Content Quality)

2. [x] [IMP] Add `--live` mode to audit orchestrator:
   - Accept `AUDIT_API_URL` env var (e.g., `https://learn.perrone.dev/api` or `http://localhost:8787/api`)
   - Accept `AUDIT_API_TOKEN` env var (admin auth token)
   - When `--live` passed:
     - Query `/admin/stats` — user count, review count, LLM cost
     - Query `/admin/analytics/content-effectiveness` — per-topic accuracy, mastery rate
     - Query `/admin/analytics/difficulty-spikes` — prerequisite pair issues
     - Query `/admin/analytics/learning-patterns` — hint escalation, confidence
     - Query `/admin/analytics/llm-effectiveness` (from Plan 024) — LLM impact
   - Populate Content Effectiveness section (4) and LLM Tracking section (5) with real data
   - Handle API errors gracefully (timeout, auth failure → mark section as `error` with message)

3. [x] [IMP] Add content version tracking to report:
   - Compare `topic_content_versions` (D1 or from manifest scan) with learn-content source files
   - Flag topics where source has changed but bundles haven't been regenerated (stale deploys)
   - Flag topics with no content version (never deployed)
   - Include in Content Quality section

4. [x] [IMP] Add LLM instrumentation completeness check:
   - Verify `llm_usage` table has `topic_id` and `problem_id` columns (Plan 024 Phase 1)
   - Verify `review_log` has `llm_assisted` column (Plan 024 Phase 1)
   - Verify AE event schema includes `llmAssisted` blob
   - If any are missing: report LLM Tracking section as `warn` with "instrumentation incomplete"
   - If Plan 024 not yet executed: report as `pending` with actionable note

5. [x] [TST] Test manifest scanner and live mode:
   - Unit test: manifest scanner aggregates dimension coverage correctly
   - Unit test: stale deploy detection flags outdated content versions
   - Unit test: live mode handles API errors gracefully (returns error status, not crash)
   - Unit test: LLM instrumentation check detects missing columns
   - Integration test: `just audit --live` with local dev API produces populated report
   - `just test` passes

**Validation:** Audit report includes R2 content inventory (dimension coverage, media counts, version freshness). `--live` mode populates effectiveness sections from real admin API data. Stale deploy detection works. LLM instrumentation check correctly identifies Plan 024 completion status.

---

## Phase 3: Effectiveness Rollups, Thresholds & History ✓
**Goal:** Configurable warning/error thresholds, AE data rollup for long-term effectiveness tracking (solves 90-day TTL), historical audit snapshots for trend comparison.

### Context for Execution

**The 90-day problem:** Analytics Engine events auto-expire after 90 days. Content effectiveness data (per-topic accuracy, hint rate, misconception rate) needs to persist longer for trend analysis. A periodic rollup (weekly or on-demand) aggregates AE data into permanent storage.

**Threshold configurability:** Different stages of the project have different expectations. Pre-launch: graph density warnings are informational. Post-launch with 100 users: content accuracy below 70% is critical. Thresholds should be configurable without code changes.

1. [x] [IMP] Create threshold configuration (`tools/audit-thresholds.json`):
   - Per-section configurable thresholds:
     ```json
     {
       "graph": {
         "prereqDensityMin": { "warn": 1.2, "fail": 0.8 },
         "encompassingDensityMin": { "warn": 1.0, "fail": 0.5 },
         "bottleneckMax": { "warn": 3, "fail": 8 }
       },
       "content": {
         "healthScoreMin": { "warn": 70, "fail": 50 },
         "problemsPerTopicMin": { "warn": 10, "fail": 5 },
         "demandDiversityMin": { "warn": 0.6, "fail": 0.3 }
       },
       "simulation": {
         "masteryConvergenceMin": { "warn": 15, "fail": 10 },
         "difficultyTargetingMin": { "warn": 15, "fail": 10 }
       },
       "live": {
         "topicAccuracyMin": { "warn": 0.70, "fail": 0.50 },
         "hintRateMax": { "warn": 0.40, "fail": 0.60 },
         "difficultySpikeDeltaMax": { "warn": 0.15, "fail": 0.25 }
       },
       "llm": {
         "llmAccuracyDeltaMin": { "warn": 0.05, "fail": -0.05 }
       }
     }
     ```
   - Audit orchestrator reads thresholds and applies to all metrics
   - Override via `--thresholds <file>` flag

2. [x] [IMP] Build AE effectiveness rollup (`tools/rollup-effectiveness.ts`):
   - Query AE for per-topic aggregates (accuracy, hint rate, misconception rate, avg response time)
   - Group by content version for version comparison
   - Save to `simulations/reports/effectiveness-rollups/{date}.json`
   - Include in audit report when rollup data exists
   - Run via `just rollup-effectiveness` recipe
   - Optional: triggered by `just audit --rollup` (queries AE and saves before generating report)
   - Solves the 90-day TTL: rollup data persists indefinitely on filesystem

3. [x] [IMP] Add historical audit comparison:
   - `just audit --save` saves report to `simulations/reports/audits/{timestamp}.json`
   - `just audit --compare <previous>` loads a previous audit JSON and computes deltas:
     - Graph: density changed by ±X
     - Content: N topics improved health, M topics degraded
     - Simulation: system metrics improved/regressed
     - Live: accuracy trends up/down
     - LLM: effectiveness improved/declined
   - Delta summary at top of report: "vs [previous date]: 3 improved, 1 regressed, 3 unchanged"
   - Markdown rendering includes delta indicators (↑ ↓ →)

4. [x] [TST] Test thresholds, rollups, and history:
   - Unit test: threshold application correctly classifies pass/warn/fail
   - Unit test: custom threshold file overrides defaults
   - Unit test: rollup produces valid aggregation from mock AE data
   - Unit test: historical comparison computes deltas correctly
   - Unit test: delta rendering shows correct indicators
   - Integration test: `just audit --save` creates file, `just audit --compare` loads and compares
   - `just test` passes

**Validation:** Audit report uses configurable thresholds (can tighten as platform matures). AE rollup preserves content effectiveness data beyond 90 days. `just audit --compare` shows improvement/regression vs previous snapshot. Full audit pipeline works: `just audit --live --rollup --save` → queries AE → rolls up → generates report → saves snapshot.
