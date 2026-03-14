# Plan 027: LLM Content Review & System Audit Consolidation

> **Created:** 2026-03-13T23:15:00Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build an LLM-based content review system that evaluates every topic's problems and worked examples against the platform's content authoring guidelines. **Runs via Claude Code subagents** — the same environment used for content generation. Produces a human-reviewable report; approved findings feed into `/generate-content` for targeted fixes.

**The gap this fills:** The audit system (Plan 025) checks structural/quantitative properties. It cannot evaluate whether content is *pedagogically correct*: whether problems assume the right prerequisites, whether difficulty labels match actual difficulty, whether worked examples break down the right steps. This plan adds that missing feedback loop.

**Execution model:** Claude Code subagents (sonnet) — no external API needed. Same pattern as `/atomicity-audit`: context assembler script + slash command + cached results.

**Scope boundary — text and data only:** This LLM review evaluates problems (text), worked examples (text), and topic metadata (data). It does NOT assess rich media content (images, animations, games, videos, audio). When non-text content is added, its quality will be measured through real user analytics (completion rates, engagement, learning outcomes) — not LLM review.

**Grounding principle — declared metadata, not graph structure:** The reviewer evaluates content against each topic's and problem's *own declared metadata* (`gradeLevel`, `difficulty`, `cognitiveDemand`, `presentation`, `contentDepth`, prerequisite descriptions). It does NOT use derived graph properties (depth, topological position, downstream count) as primary grounding — these change with graph restructuring and make findings fragile. The reviewer's job is: **does the content match what it claims to be?**

**Output model — human-in-the-loop:** The review produces a report (JSON + markdown summary). The user reviews findings, approves or rejects them, then feeds actionable findings into `/generate-content` for targeted fixes. The system does not auto-fix content.

**Depends on:** Plan 025 (audit framework), Plan 026 (test/audit separation — `/content-review` is an **auditing** command, not testing)

**Execution order:** Plan 026 runs first (restructures justfile and CLAUDE.md). Plan 027 adds new audit capabilities into the structure 026 establishes.

## Progress

**Completed:** —
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Core Review System

**Goal:** Build the `/content-review` slash command that uses Claude Code sonnet subagents to review content against a codified rubric. Produces a report for human review.

### Context for Execution

**Architecture (from `/atomicity-audit` pattern):**
1. A context assembler script gathers all data a reviewer needs per topic
2. The slash command reads context and spawns **sonnet subagents** for parallel review
3. Each subagent reviews a batch of ~10 topics against the rubric
4. Results cached to filesystem, keyed by content hash (up to 3 reviews per hash)

**Batch sizing: 10 topics per subagent.** Each topic has ~15 problems (~3KB each) + 2 examples (~2KB each) + prerequisite descriptions (~1KB). That's ~50KB per topic, ~500KB per batch — well within sonnet's context window with room for the rubric and response.

**Discipline parameterization:** The context assembler accepts a `--discipline` flag (default: all). When no discipline is specified, it assembles context for all disciplines and the command reviews everything.

**Non-determinism handling:** The cache stores up to 3 reviews per content hash per topic. Each `/content-review` run appends a new review (oldest replaced at cap of 3). The report aggregates across runs — findings appearing in 2+ runs are flagged as "high confidence," findings in only 1 run as "low confidence." When content hash changes, all cached reviews for that topic are invalidated.

**What the reviewer evaluates (6 criteria, prioritized):**

Each criterion produces a finding: `pass`, `warn`, `error`, or `skip`.

**High signal:**

**1. Answer correctness:**
- Stated answer is actually correct (mathematical/factual verification)
- Solution steps match the stated answer
- Hints are progressive and don't give away the answer prematurely

**2. Prerequisite assumption correctness:**
- Does each problem assume *exactly* the skills from its listed prerequisites?
- Grounded on prerequisite topics' *names and descriptions*, not graph position
- Flag problems that assume unlisted knowledge (implicit dependency)
- Flag problems that don't use any prerequisite skill (too basic for its prerequisites)

**3. Difficulty calibration:**
- Are the `difficulty` labels (easy/medium/hard) correct *relative to each other* within the topic?
- Flag difficulty inversions ("easy" problem harder than "hard" problem)
- Grounded on: `difficulty` labels, `gradeLevel`, `presentation` dimension
- NOT grounded on graph depth or topological position

**4. Worked example quality:**
- Steps build logically from prerequisite knowledge
- Explanations are meaningful (not restating the work)
- Complexity appropriate for `gradeLevel` and `presentation` level

**Medium signal:**

**5. Cognitive demand appropriateness:**
- Does the `cognitiveDemand` label match what the problem actually requires?
- A problem labeled `procedural` that requires multi-step reasoning → error
- A problem labeled `reasoning` that is simple recall → warn
- Grounded on: `cognitiveDemand` label, `contentDepth` dimension, `gradeLevel`
- NOT grounded on graph depth ranges
- Note: `/content-health` checks demand *distribution counts* deterministically. This criterion checks whether labels *match the actual cognitive requirement*.

**6. Dimension alignment (semantic, not structural):**
- Structural field matching is already checked by `validate-content`
- This checks: does the *content itself* match the claimed dimension?
- A problem with `presentation: primary` that uses algebra terminology → warn
- A problem with `contentDepth: survey` that requires analytical reasoning → warn
- Grounded on: declared dimension values vs actual vocabulary, complexity, analytical depth

**Rubric footnotes (checked but not weighted heavily):**
- **Progression model compliance:** mastery-gated content has clear right/wrong; context-layered has multiple perspectives
- **Platform compatibility:** LLM catches what regex misses ("visualize the rotation", "measure the angle")

### Steps

1. [ ] [IMP] Define review types (`tools/review-types.ts`):
   - `ReviewFinding`: `{ criterion: string; status: "pass" | "warn" | "error" | "skip"; detail: string; evidence?: string; problemId?: string; confidence?: "high" | "low" }`
   - `TopicReview`: `{ topicId: string; discipline: string; timestamp: string; findings: ReviewFinding[]; overallGrade: "A" | "B" | "C" | "D" | "F"; summary: string; contentHash: string }`
   - `TopicReviewCache`: `{ contentHash: string; reviews: TopicReview[] }` (up to 3 reviews per hash)
   - `ReviewReport`: `{ timestamp: string; discipline: string | "all"; topicsReviewed: number; gradeDistribution: Record<string, number>; highConfidenceFindings: number; lowConfidenceFindings: number; topicReviews: TopicReview[] }`
   - `TopicContext`: `{ topicId: string; discipline: string; name: string; description: string; strand: string; gradeLevel: number; progressionModel: string; prerequisites: { id: string; name: string; description: string }[]; problems: any[]; examples: any[]; presentation: string; contentDepth: string }`

2. [ ] [IMP] Build context assembler (`tools/review-context.ts`):
   - **Parameterized by discipline** — `--discipline <name>` flag, defaults to all disciplines
   - `assembleTopicContext(topicId: string, discipline: string): TopicContext`
   - Reads graph.json for topic metadata (gradeLevel, strand, progressionModel, defaultPresentation, contentDepth)
   - Reads prerequisite topics' metadata (name, description — NOT full problems, NOT graph position)
   - Reads problems/{topicId}.json and examples/{topicId}.json
   - `assembleReviewBatch(discipline: string, opts?: { strand?: string; topicIds?: string[] }): TopicContext[]`
   - Computes content hash per topic (hash of problems + examples files, for cache invalidation)
   - CLI entry: `npx tsx tools/review-context.ts [--discipline <name>] [--topic <id>] [--strand <name>] --output <file>`
   - Outputs JSON array of `TopicContext` objects
   - Share or duplicate graph-loading logic with `atomicity-context.ts` as appropriate
   - Note: `atomicity-context.ts` (211 lines) is hardcoded `const discipline = "math"` on line 65 and outputs to `docs/audits/context.json`. Phase 2 moves atomicity output to `simulations/reports/atomicity/` — the context assembler should be aware of this upcoming move but doesn't need to handle it

3. [ ] [IMP] Build review rubric document (`tools/review-rubric.md`):
   - Human-readable rubric included in subagent prompts
   - Each criterion: name, priority (high/medium), description, what constitutes pass/warn/error
   - **Grounding rules:** "Evaluate content against its declared metadata (gradeLevel, difficulty, cognitiveDemand, presentation, contentDepth, prerequisite descriptions). Do NOT use graph depth, topological position, or downstream topic counts."
   - Discipline-specific notes per progression model
   - Example findings for calibration
   - Expected output format: JSON array of `ReviewFinding` objects
   - Explicit scope note: "You are reviewing TEXT content only. Ignore references to future media (images, animations, games). Evaluate the text as-is."

4. [ ] [IMP] Build review cache (`tools/review-cache.ts`):
   - Cache directory: `simulations/reports/content-reviews/{discipline}/`
   - Per-topic file: `{topic-id}.json` containing `TopicReviewCache` (content hash + up to 3 reviews)
   - `getCache(topicId, discipline): TopicReviewCache | null`
   - `isFresh(topicId, discipline, contentHash): boolean` (hash matches, at least 1 review)
   - `isFull(topicId, discipline, contentHash): boolean` (hash matches, 3 reviews stored)
   - `appendReview(topicId, discipline, review: TopicReview): void` (appends; if hash changed, replaces all; if at cap, replaces oldest)
   - `loadAllCached(discipline: string): TopicReviewCache[]`
   - `aggregateFindings(cache: TopicReviewCache): ReviewFinding[]` (dedup across runs, mark confidence based on recurrence: 2+ runs = high, 1 run = low)

5. [ ] [IMP] Build `/content-review` slash command (`.claude/commands/content-review.md`):
   - Usage:
     - `/content-review` — review all disciplines (comprehensive)
     - `/content-review <discipline>` — review one discipline
     - `/content-review <discipline> --topic <id>` — review single topic
     - `/content-review <discipline> --strand <name>` — review one strand
     - `/content-review --force` — ignore cache, re-review everything
   - Workflow:
     1. Run context assembler for target scope
     2. Check cache — skip topics where cache is full (3 reviews with matching hash), unless `--force`
     3. Single topic: Claude Code reviews directly (no subagent)
     4. Batch: spawn **sonnet subagents**, 10 topics per batch
        - Each subagent reads rubric + topic contexts, produces `TopicReview[]`
        - Main agent collects results, appends to cache
     5. Write aggregate report to `simulations/reports/content-reviews/{discipline}-report.json` (or `all-report.json`)
     6. Write markdown summary to `simulations/reports/content-reviews/{discipline}-report.md`
     7. Present summary: grade distribution, high-confidence findings by criterion, worst topics
     8. "Review the report at simulations/reports/content-reviews/{discipline}-report.md — approved findings can be fed into /generate-content for targeted fixes."

6. [ ] [TST] Test context assembler and cache (`tools/__tests__/review.test.ts`):
   - Add clarifying comment: "Tests the review tool code (context assembly, cache logic, finding aggregation), not content quality"
   - Unit test: context assembler loads math topic with prerequisites (grounded on metadata, not depth)
   - Unit test: context assembler loads all disciplines when none specified
   - Unit test: content hash changes when problems file changes
   - Unit test: cache stores up to 3 reviews per hash, replaces oldest at cap
   - Unit test: cache invalidates all reviews when hash changes
   - Unit test: aggregateFindings marks confidence correctly (2+ runs = high, 1 = low)
   - Manual test: `/content-review math --topic add-within-20` produces valid review
   - `just typecheck` passes

**Validation:** `/content-review math --topic add-within-20` reviews a single topic against all 6 criteria, produces report grounded on declared metadata. `/content-review math --strand fractions` spawns subagents reviewing all fraction topics. `/content-review` (no args) reviews all disciplines. Cache stores up to 3 reviews, marks confidence. Report is human-readable with actionable findings.

---

## Phase 2: Audit Integration & Generation Loop

**Goal:** Integrate content review results into the unified system audit (Section 8). Update `/generate-content` to include review as final verification. Consolidate output directories.

### Context for Execution

**Current state — scattered across 4 locations:**
- `simulations/reports/` — audit JSON, evaluation, healing epochs, charts
- `simulations/reports/audits/` — timestamped audit snapshots
- `simulations/reports/content-reviews/` — content review cache (Phase 1)
- `docs/audits/` — atomicity audit results
- `tools/` — audit orchestrator, content-status, content-gaps, etc.

**Target state — unified under `simulations/reports/`:**

```
simulations/reports/
├── audit-latest.json            # Full system audit (8 sections)
├── audits/                      # Timestamped audit snapshots
├── atomicity/                   # Atomicity audit results (moved from docs/audits/)
├── content-reviews/             # LLM review cache per discipline
│   ├── math/                    # Per-topic review JSONs
│   ├── ela/
│   ├── history/
│   ├── math-report.json         # Aggregate report
│   └── math-report.md           # Human-readable report
├── evaluation.json              # Simulation evaluation vs targets
├── healing/                     # Healing loop history
├── effectiveness-rollups/       # AE data rollups (Plan 025)
└── training/                    # Training loop state
```

**Where new commands land (per Plan 026 test/audit separation):**

All content review commands are **auditing** (manual, on-demand) — they go under the `# ── Auditing ──` section in the justfile that Plan 026 establishes.

| Command | What it does | Category |
|---------|-------------|----------|
| `/content-review` | LLM content review → report (Claude Code) | Auditing |
| `just review-content` | Render cached review report (CLI) | Auditing |
| `just audit` | Full system audit including Section 8 (reads cached data) | Auditing |
| `just audit-all` | Comprehensive: simulate + evaluate + audit (Plan 026) | Auditing |
| `just audit-check` | What sections need re-running? (Plan 026) | Auditing |

These commands produce results that feed into `just audit` Sections 1-8. Testing commands (`just test`, `just validate`) are separate per Plan 027.

### Steps

1. [ ] [IMP] Add Section 8: Content Review to audit report:
   - New type in `audit-types.ts`: `ContentReviewSection`
   - Fields: `status`, `items`, `topicsReviewed`, `gradeDistribution`, `highConfidenceIssues`, `worstTopics: { topicId: string; discipline: string; grade: string; topFindings: string[] }[]`, `topRecurringIssues: { criterion: string; count: number; severity: string }[]`, `lastReviewTimestamp: string | null`
   - In `audit.ts`: `auditContentReview()` reads cached reviews from `simulations/reports/content-reviews/`
   - Aggregates findings across all cached topic reviews
   - Status: `pass` (all A/B), `warn` (any C), `fail` (any D/F), `pending` (no reviews)
   - If no cached reviews: `pending` with "Run `/content-review` to generate"

2. [ ] [IMP] Add Section 8 rendering in `audit-render.ts` (no separate renderer):
   - Grade distribution table
   - High-confidence issues count
   - Worst topics table with top findings
   - Recurring issues summary
   - Recommendations

3. [ ] [IMP] Consolidate audit output directories:
   - Move atomicity audit output to `simulations/reports/atomicity/` (update `/atomicity-audit` command)
   - Update `/atomicity-audit` command (`.claude/commands/atomicity-audit.md` line 28): change `docs/audits/context.json` → `simulations/reports/atomicity/context.json`
   - Update `atomicity-context.ts` output path accordingly
   - Ensure all QA tools write to `simulations/reports/`
   - Update `.gitignore` if needed for new directories

4. [ ] [IMP] Update `/generate-content` post-verification loop:
   - Target: `.claude/commands/generate-content.md` lines 151-168 (Section "6. Post-Generation Verification Loop")
   - Add `/content-review <subject> --topic <topic-id>` after the existing bash commands (line 159) and before the quality gates (line 162)
   - This is additive — existing quality gates remain unchanged
   - Present review findings for user approval before proceeding to step 7 (import)

5. [ ] [IMP] Add `just review-content` justfile recipe:
   - Place under `# ── Auditing ──` section (per Plan 026 structure)
   - `just review-content [discipline]` — renders cached review report (markdown to stdout)
   - `just review-content [discipline] --json` — JSON output
   - Prints instructions to run `/content-review` in Claude Code if no cache exists

6. [ ] [TST] Test audit integration (add to `tools/__tests__/audit.test.ts`):
   - Unit test: Section 8 populates from cached reviews
   - Unit test: empty cache → pending status
   - Unit test: grade distribution aggregation correct
   - Unit test: audit markdown includes Section 8 header
   - Update existing section count assertion from 7 → 8
   - `just typecheck` passes, `just validate` passes (per Plan 026, `just validate` is the comprehensive gate)

7. [ ] [IMP] Update Plan 026's audit-relevance mapping (if 026 Phase 2 is already complete):
   - Add content review file patterns to `tools/audit-relevance.ts`: `../learn-content/**/problems/*.json` and `../learn-content/**/examples/*.json` → Section 8 (Content Review)
   - If 027 Phase 2 hasn't run yet, note this mapping in the 027 plan for when it does

**Validation:** `just audit` shows 8 sections. Section 8 populated from cached content reviews or shows pending. All QA outputs live under `simulations/reports/`. `/content-review math` results appear in next `just audit` run. `/generate-content` includes content review as final verification step. `just validate` is the verification gate (not `just test`).

---

## Phase 3: Rubric Tuning & Feedback

**Goal:** Validate the rubric against real content, tune criteria, and feed recurring issues back into the generation pipeline.

### Context for Execution

**Approach:** Run `/content-review` on sample strands, manually assess whether findings are correct, tune the rubric iteratively. No formal calibration dataset or precision/recall framework — the rubric is tuned qualitatively based on false positives and misses.

### Steps

1. [ ] [IMP] Run `/content-review math --strand <strand>` on 3 representative strands (~50 topics):
   - Pick strands with diverse content: one early (counting/cardinality), one mid (fractions), one late (expressions-equations)
   - Manually assess: are high-confidence findings real issues? Are there obvious problems the reviewer missed?

2. [ ] [IMP] Tune rubric based on results:
   - Adjust criteria where false positives are common (tighten wording, add "do not flag X" exclusions)
   - Adjust criteria where real issues are missed (add examples, clarify what to look for)
   - Update `tools/review-rubric.md` with improved wording and examples

3. [ ] [IMP] Extract recurring issues into generation feedback:
   - Identify patterns across reviewed topics (e.g., "42 topics have hints that give away the answer")
   - Add a "common mistakes to avoid" section to `/generate-content` prompt
   - Structure as concrete rules: "Hints must be progressive — hint 1 should not reveal more than hint 2 reveals"

4. [ ] [DOC] Document tuning results:
   - Which criteria had high/low signal
   - What rubric changes improved accuracy
   - Recurring content issues found and how they were addressed

**Validation:** Rubric produces fewer false positives after tuning. Recurring issues documented and fed into generation pipeline. Re-running `/content-review` on same strands shows improved grades after content fixes.

---

## Future: OpenRouter Headless Backend (Unscheduled)

**Deferred until:** Live product with frequent content changes justifies automated review outside of Claude Code sessions.

**Design notes (preserved for when needed):**
- OpenRouter API client sending same rubric prompts to Haiku/Sonnet
- Same cache format — reviews from OpenRouter and Claude Code subagents are interchangeable
- Cost guard (`--max-cost`) and CI exit codes (`--ci` mode)
- `just review-content-ci [discipline]` recipe for headless execution
- Build is straightforward when the need arises: same types, same rubric, different transport
