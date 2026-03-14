# Plan 027: Audit Consolidation & LLM Content Review

> **Created:** 2026-03-13T23:15:00Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Consolidate all audit infrastructure under a top-level `audit/` directory organized around three pillars, then build an LLM-based content review system that absorbs the standalone atomicity audit.

**Three-pillar audit architecture:**

1. **Learner Simulations** ("How do learners progress?") — Run synthetic learners through the engine. Produces evaluation metrics, regression checks, trajectory analysis. Lives in `audit/learner-simulations/`.
2. **Content** ("Is the content good?") — Evaluates content from every angle: structural (graph integrity), quantitative (health scores), semantic (LLM review + atomicity), and real-world (effectiveness). Lives in `audit/content/`.
3. **Report** ("Where are we and what do I fix?") — The unified 8-section report that aggregates both pillars and provides actionable recommendations. Output lives in `audit/reports/`.

**Supporting tools** (healing loop, training loop, effectiveness rollups) serve these pillars but aren't pillars themselves. They're optimization workflows that consume audit data to improve the engine.

**The gap this fills:** Audit-related code is currently scattered across `simulations/`, `tools/`, and `docs/`. The atomicity audit is a standalone system that duplicates content review infrastructure. There's no LLM-based semantic review of content quality.

**Grounding principle:** The reviewer evaluates content against each topic's *own declared metadata* (`gradeLevel`, `difficulty`, `cognitiveDemand`, `presentation`, `contentDepth`, prerequisite descriptions). It does NOT use derived graph properties (depth, topological position, downstream count) — these change with graph restructuring and make findings fragile.

**Output model — human-in-the-loop:** Review produces a report. The user reviews findings, approves or rejects them, then feeds actionable findings into `/generate-content` for targeted fixes. No auto-fix.

**Depends on:** Plan 025 (audit framework), Plan 026 (test/audit separation)

## Progress

**Completed:** Phase 1, Phase 2, Phase 3, Phase 4
**In Progress:** —
**Next:** Complete (all phases done)

---

## Phase 1: Directory Restructure ✓

**Goal:** Move all audit infrastructure under `audit/`, organize by the three pillars, update all references. No new functionality — purely mechanical reorganization.

### Context for Execution

**Target directory structure:**

```
audit/                              # The audit umbrella
│
├── content/                        # Pillar 2: content evaluation
│   ├── status.ts                   ← tools/content-status.ts
│   ├── gaps.ts                     ← tools/content-gaps.ts
│   ├── report.ts                   ← tools/content-report.ts
│   ├── atomicity-context.ts        ← tools/atomicity-context.ts (absorbed in Phase 2)
│   └── (review files added in Phase 2)
│
├── learner-simulations/             # Pillar 1: learner simulations
│   ├── src/                        ← simulations/src/ (internal structure preserved)
│   │   ├── cli.ts, runner.ts, regression.ts, evaluate.ts
│   │   ├── heal-loop.ts, analyze.ts, trajectory-analysis.ts
│   │   ├── adaptive-analysis.ts, diagnostic-analysis.ts
│   │   ├── clean.ts, types.ts, load-targets.ts, answer-engine.ts
│   │   ├── prng.ts, event-logger.ts, db-setup.ts, strands.ts, detect-changes.ts
│   │   └── __tests__/ (evaluate, heal-loop, load-targets tests)
│   ├── profiles/                   ← simulations/profiles/
│   ├── targets.json                ← simulations/targets.json
│   ├── baseline.json               ← simulations/baseline.json
│   ├── regression-baseline.json    ← simulations/regression-baseline.json
│   ├── baselines/                  ← simulations/baselines/ (l1-l5.json, multi-level.json)
│   └── runs/                       ← simulations/runs/
│
├── reports/                        # Pillar 3: all audit output
│   ├── latest.json                 ← simulations/reports/audit-latest.json (renamed)
│   ├── snapshots/                  ← simulations/reports/audits/ (renamed)
│   ├── evaluation.json             ← simulations/reports/evaluation.json
│   ├── evaluation.md               ← simulations/reports/evaluation.md
│   ├── healing/                    ← simulations/reports/healing/
│   ├── training/                   ← simulations/reports/training/
│   ├── content-quality.md          ← simulations/reports/content-quality.md
│   ├── system-readiness.md         ← simulations/reports/system-readiness.md
│   ├── diagnostic.md               ← simulations/reports/diagnostic.md
│   ├── trajectory.md               ← simulations/reports/trajectory.md
│   ├── adaptive-systems.md         ← simulations/reports/adaptive-systems.md
│   ├── simulation-charts.html      ← simulations/reports/simulation-charts.html
│   ├── fire-isolation.json         ← simulations/reports/fire-isolation.json
│   ├── atomicity-latest.md         ← docs/audits/atomicity-latest.md
│   └── content-reviews/            (created in Phase 2)
│
├── orchestrator.ts                 ← tools/audit.ts (renamed)
├── render.ts                       ← tools/audit-render.ts (renamed)
├── types.ts                        ← tools/audit-types.ts (renamed)
├── relevance.ts                    ← tools/audit-relevance.ts (renamed)
├── thresholds.json                 ← tools/audit-thresholds.json
├── rollup-effectiveness.ts         ← tools/rollup-effectiveness.ts
└── __tests__/
    ├── audit.test.ts               ← tools/__tests__/audit.test.ts
    └── audit-relevance.test.ts     ← tools/__tests__/audit-relevance.test.ts
```

**What stays in `tools/`** (content pipeline, not audit):
```
tools/
├── validate-graph.ts
├── validate-content.ts
├── validate-cross-discipline.ts
├── import-content.ts
├── generate-bundles.ts
├── deploy-content.ts
├── generate-problems.ts
├── content-dir.ts                  # Shared utility — audit code imports from here
└── visualize-graph.py
```

**Import update patterns — audit orchestration files:**

These files move from `tools/` to `audit/`. Each has import changes:

| File (new path) | Import changes |
|---|---|
| `audit/orchestrator.ts` | `./content-dir.js` → `../tools/content-dir.js`; `./content-status.js` → `./content/status.js`; `./content-gaps.js` → `./content/gaps.js`; `./content-report.js` → `./content/report.js`; `./audit-render.js` → `./render.js`; `./audit-types.js` → `./types.js` |
| `audit/render.ts` | `./audit-types.js` → `./types.js` |
| `audit/types.ts` | No imports (type definitions only) |
| `audit/relevance.ts` | No code imports (Node builtins only). **MAPPING_RULES patterns** must update: `tools\/audit[^/]*\.ts` → `audit\/[^/]*\.ts`; `tools\/content-[^/]*\.ts` → `audit\/content\/[^/]*\.ts`; `simulations\/targets\.json` → `learner-simulations\/targets\.json`; `simulations\/profiles\/` → `learner-simulations\/profiles\/` |
| `audit/rollup-effectiveness.ts` | `./audit-types.js` → `./types.js` |
| `audit/content/status.ts` | `./content-dir.js` → `../../tools/content-dir.js` |
| `audit/content/gaps.ts` | `./content-dir.js` → `../../tools/content-dir.js` |
| `audit/content/report.ts` | `./content-dir.js` → `../../tools/content-dir.js` |
| `audit/content/atomicity-context.ts` | `./content-dir.js` → `../../tools/content-dir.js` |
| `audit/__tests__/audit.test.ts` | `../audit.js` → `../orchestrator.js`; `../content-status.js` → `../content/status.js`; `../content-gaps.js` → `../content/gaps.js`; `../content-report.js` → `../content/report.js`; `../audit-render.js` → `../render.js`; `../audit-types.js` → `../types.js` |
| `audit/__tests__/audit-relevance.test.ts` | `../audit-relevance.js` → `../relevance.js` |

**Import update patterns — simulation files:**

The `simulations/src/` directory moves one level deeper (to `audit/learner-simulations/src/`). Two categories of path updates:

*Category A — `../../packages/api/` imports (2 files):*
These relative imports gain one `../` level:
- `audit/learner-simulations/src/runner.ts`: `../../packages/api/src/...` → `../../../packages/api/src/...` (imports: session, diagnostic, srs, content-r2, graph, schema, DB type)
- `audit/learner-simulations/src/db-setup.ts`: `../../packages/api/src/...` → `../../../packages/api/src/...` (imports: schema, DB type, content-r2)

*Category B — hardcoded `process.cwd()` paths (14 files):*
All files using `join(process.cwd(), "simulations", ...)` must update to `join(process.cwd(), "audit", "learner-simulations", ...)`. The path segment `"simulations"` becomes `"learner-simulations"` everywhere:
- `cli.ts`: profiles path, runs output path
- `runner.ts`: runs output path
- `regression.ts`: profiles path, `regression-baseline.json` path
- `evaluate.ts`: profiles path, runs path, `baselines/` directory path (lines 1069, 1095)
- `analyze.ts`: profiles path, runs path, reports path, baseline path
- `clean.ts`: runs path
- `load-targets.ts`: `targets.json` path, profiles path
- `heal-loop.ts`: module-level constants `LEARNER_SIM_DIR`, `REPORTS_DIR` — change to `audit/learner-simulations` and `audit/reports`
- `detect-changes.ts`: healing history path (now `audit/reports/healing/`)
- `diagnostic-analysis.ts`: profiles path, reports output path
- `adaptive-analysis.ts`: profiles path, runs path, reports path
- `trajectory-analysis.ts`: runs path, reports output path
- `strands.ts`: content dir path (no change — resolves to `../learn-content`)

Key: `heal-loop.ts` defines constants at module level that derive all paths. Update the base constants and all downstream paths follow. **Also** has 2 `execSync` calls with literal `npx tsx simulations/src/cli.ts` command strings (lines 241, 428) that must be updated separately — these bypass the module-level constants.

**Output path updates (files writing to `simulations/reports/`):**

All audit output converges on `audit/reports/`. Files that currently write to `simulations/reports/` must write to `audit/reports/`:
- `orchestrator.ts`: `audit-latest.json` → `latest.json` in `audit/reports/`; `audits/` → `snapshots/`
- `evaluate.ts`: `evaluation.json`, `evaluation.md` → `audit/reports/`
- `heal-loop.ts`: `healing/` → `audit/reports/healing/`
- `analyze.ts`: charts, readiness reports → `audit/reports/`
- `diagnostic-analysis.ts`: `diagnostic.md` → `audit/reports/`
- `adaptive-analysis.ts`: `adaptive-systems.md` → `audit/reports/`
- `trajectory-analysis.ts`: `trajectory.md` → `audit/reports/`
- `rollup-effectiveness.ts`: `effectiveness-rollups/` → `audit/reports/effectiveness-rollups/`
- `content-status.ts`: reads `baseline.json` and `content-quality.md` — update read paths

**isCLI guard updates (renamed files):**
- `orchestrator.ts`: **CRITICAL** — current guard `includes("audit") && !includes("audit-")` will match ANY file under `audit/` directory. Must change to `endsWith("orchestrator.ts") || endsWith("orchestrator.js")`
- `content/status.ts`: `includes("content-status")` → `endsWith("status.ts")`
- `content/gaps.ts`: `includes("content-gaps")` → `endsWith("gaps.ts")`
- `content/report.ts`: `includes("content-report")` → `endsWith("report.ts")`
- `relevance.ts`: already uses `endsWith("audit-relevance.ts")` → `endsWith("relevance.ts")`
- `rollup-effectiveness.ts`: `includes("rollup-effectiveness")` → still works (filename unchanged)

**Justfile recipe updates (~30 recipes):**
All `npx tsx simulations/src/` → `npx tsx audit/learner-simulations/src/`
All `npx tsx tools/audit` → `npx tsx audit/` (with new filenames: `orchestrator.ts`, `relevance.ts`)
All `npx tsx tools/content-status.ts` → `npx tsx audit/content/status.ts` (similarly for gaps, report)
`npx tsx tools/rollup-effectiveness.ts` → `npx tsx audit/rollup-effectiveness.ts`
`npx tsx tools/atomicity-context.ts` → `npx tsx audit/content/atomicity-context.ts`
`simulate-compare` baseline: `simulations/baseline.json` → `audit/learner-simulations/baseline.json`

**Slash command updates:**
- `.claude/commands/atomicity-audit.md`: `tools/atomicity-context.ts` → `audit/content/atomicity-context.ts`; `docs/audits/` → `audit/reports/`
- `.claude/commands/heal.md`: references to `simulations/` paths
- `.claude/commands/heal-update.md`: references to `simulations/` paths
- `.claude/commands/train.md`: references to `simulations/` paths
- `.claude/commands/content-health.md`: check for path references
- `.claude/commands/generate-content.md`: check for path references

**Other documentation:**
- `CLAUDE.md`: Structure section (directory tree), Commands section
- `AGENTS.md`: mirrors CLAUDE.md
- `.gitignore`: `simulations/runs/` → `audit/learner-simulations/runs/`; `simulations/reports/evaluation.json` → `audit/reports/evaluation.json`; `simulations/reports/evaluation.md` → `audit/reports/evaluation.md`; `simulations/reports/healing/` → `audit/reports/healing/`

### Steps

1. [x] [IMP] Create directory structure and move all files:
   - Create `audit/`, `audit/content/`, `audit/learner-simulations/`, `audit/reports/`, `audit/__tests__/`
   - Move simulation infrastructure: `simulations/src/`, `simulations/profiles/`, `simulations/targets.json`, `simulations/baseline.json`, `simulations/regression-baseline.json`, `simulations/baselines/`, `simulations/runs/` → `audit/learner-simulations/`
   - Move reports: all files from `simulations/reports/` → `audit/reports/`; rename `audit-latest.json` → `latest.json`; rename `audits/` → `snapshots/`
   - Move atomicity output: `docs/audits/atomicity-latest.md` → `audit/reports/atomicity-latest.md`
   - Move audit orchestration: `tools/audit.ts` → `audit/orchestrator.ts`, `tools/audit-render.ts` → `audit/render.ts`, `tools/audit-types.ts` → `audit/types.ts`, `tools/audit-relevance.ts` → `audit/relevance.ts`, `tools/audit-thresholds.json` → `audit/thresholds.json`
   - Move tests: `tools/__tests__/audit.test.ts` → `audit/__tests__/audit.test.ts`, `tools/__tests__/audit-relevance.test.ts` → `audit/__tests__/audit-relevance.test.ts`
   - Move content evaluation: `tools/content-status.ts` → `audit/content/status.ts`, `tools/content-gaps.ts` → `audit/content/gaps.ts`, `tools/content-report.ts` → `audit/content/report.ts`, `tools/atomicity-context.ts` → `audit/content/atomicity-context.ts`
   - Move data collection: `tools/rollup-effectiveness.ts` → `audit/rollup-effectiveness.ts`
   - Clean up empty directories: verify `simulations/` and `docs/audits/` are empty, then remove

2. [x] [IMP] Update all imports in moved files:
   - Update audit orchestration imports per the table above (orchestrator.ts has ~6 import changes)
   - Update content evaluation imports (`../../tools/content-dir.js` for status, gaps, report, atomicity-context)
   - Update simulation imports: `runner.ts` and `db-setup.ts` need `../../../packages/api/` (one more `../`)
   - Update test file imports (audit.test.ts has ~6 import changes, audit-relevance.test.ts has 1)
   - Update all `isCLI` guards for renamed files
   - Update relevance mapping rules (regex patterns referencing `tools/audit*` and `tools/content-*`)

3. [x] [IMP] Update all hardcoded paths in source code:
   - Simulation files (14 files): `join(process.cwd(), "simulations", ...)` → `join(process.cwd(), "audit", "learner-simulations", ...)`
   - Report output paths: `join(process.cwd(), "simulations", "reports", ...)` → `join(process.cwd(), "audit", "reports", ...)`
   - `heal-loop.ts`: update module-level `LEARNER_SIM_DIR` and `REPORTS_DIR` constants; **also** update 2 `execSync` calls with literal `npx tsx simulations/src/cli.ts` (lines 241, 428) → `npx tsx audit/learner-simulations/src/cli.ts`
   - Test files: `evaluate.test.ts` (lines 153, 209, 227: `simulations/runs`, `simulations/reports/evaluation.*`); `load-targets.test.ts` (lines 124, 175, 234: `simulations/src/__tests__/tmp` → `audit/learner-simulations/src/__tests__/tmp`)
   - `orchestrator.ts`: thresholds path, evaluation path, report output paths, snapshot paths
   - `content/status.ts`: baseline read path, content-quality.md read path
   - `content/gaps.ts`: baseline read path
   - `rollup-effectiveness.ts`: output path
   - `content/atomicity-context.ts`: output path (`docs/audits/` → `audit/reports/`)
   - Verify: `grep -r "simulations/" . --include="*.ts" | grep -v node_modules | grep -v .git | grep -v __tests__` shows no stale path references (except in-code comments or strings that are descriptive, not paths)

4. [x] [IMP] Update justfile recipes:
   - All `npx tsx simulations/src/` → `npx tsx audit/learner-simulations/src/` (~20 recipes)
   - All `npx tsx tools/audit.ts` → `npx tsx audit/orchestrator.ts`
   - `npx tsx tools/audit-relevance.ts` → `npx tsx audit/relevance.ts`
   - `npx tsx tools/content-status.ts` → `npx tsx audit/content/status.ts`
   - `npx tsx tools/content-gaps.ts` → `npx tsx audit/content/gaps.ts`
   - `npx tsx tools/content-report.ts` → `npx tsx audit/content/report.ts`
   - `npx tsx tools/rollup-effectiveness.ts` → `npx tsx audit/rollup-effectiveness.ts`
   - `npx tsx tools/atomicity-context.ts` → `npx tsx audit/content/atomicity-context.ts`
   - `simulate-compare` baseline: `simulations/baseline.json` → `audit/learner-simulations/baseline.json`
   - Verify: `just --list` shows all recipes without parse errors

5. [x] [DOC] Update all documentation, slash commands, and .gitignore:
   - `CLAUDE.md`: Structure section (update directory tree to show `audit/`), Commands section (update any path references)
   - `AGENTS.md`: mirrors CLAUDE.md changes
   - `.claude/commands/atomicity-audit.md`: tool path and output path
   - `.claude/commands/heal.md`: simulation/report paths
   - `.claude/commands/heal-update.md`: simulation/report paths
   - `.claude/commands/train.md`: simulation/report paths
   - `.claude/commands/content-health.md`: check for stale paths
   - `.claude/commands/generate-content.md`: check for stale paths
   - `.gitignore`: update all `simulations/` entries to `audit/` equivalents
   - LEARNINGS.md, DECISIONS.md: check for stale path references

6. [x] [TST] Verify everything works:
   - `just typecheck` passes
   - `just test` passes (vitest — no audit path changes in packages/api tests)
   - `just regression` runs standalone
   - `just audit-check` runs
   - `npx tsx audit/__tests__/audit.test.ts` passes
   - `npx tsx audit/__tests__/audit-relevance.test.ts` passes
   - `npx tsx audit/learner-simulations/src/__tests__/evaluate.test.ts` passes
   - `npx tsx audit/content/status.ts math` produces output (standalone CLI)
   - `just --list` shows all recipes without errors
   - Stale reference check (two passes):
     1. Old locations: `grep -rn "simulations/src/\|simulations/reports/\|simulations/runs/\|simulations/profiles/\|simulations/targets\|simulations/baseline\|simulations/baselines\|tools/audit\|tools/content-status\|tools/content-gaps\|tools/content-report\|tools/atomicity\|tools/rollup" . --include="*.ts" --include="*.md" --include="justfile" --include=".gitignore" | grep -v node_modules | grep -v .git` returns zero matches
     2. Unrenamed directory: `grep -rn '"simulations"' . --include="*.ts" | grep -v node_modules | grep -v .git` — should return zero matches (all `"simulations"` path segments should now be `"learner-simulations"`)
   - Also verify: no code still uses `SIMULATIONS_DIR` (should be `LEARNER_SIM_DIR`)

**Validation:** All tests pass. All justfile recipes work with new paths. No stale references to old `simulations/` or `tools/audit*` paths. No bare `"simulations"` path segments remain in code. Directory structure matches the three-pillar design with `learner-simulations/` naming. `audit/reports/` contains all audit output.

---

## Phase 2: Core Review System ✓

**Goal:** Build the `/content-review` slash command that uses Claude Code sonnet subagents to review content against a codified rubric. Absorbs atomicity assessment as criterion 7. Produces a report for human review.

### Context for Execution

**Architecture (from `/atomicity-audit` pattern):**
1. A context assembler script gathers all data a reviewer needs per topic
2. The slash command reads context and spawns **sonnet subagents** for parallel review
3. Each subagent reviews a batch of ~10 topics against the rubric
4. Results cached to filesystem, keyed by content hash (up to 3 reviews per hash)

**Batch sizing: 10 topics per subagent.** Each topic has ~15 problems (~3KB each) + 2 examples (~2KB each) + prerequisite descriptions (~1KB). That's ~50KB per topic, ~500KB per batch — well within sonnet's context window with room for the rubric and response.

**Discipline parameterization:** The context assembler accepts a `--discipline` flag (default: all).

**Non-determinism handling:** Cache stores up to 3 reviews per content hash per topic. Findings in 2+ runs = "high confidence," 1 run = "low confidence." Hash change invalidates all cached reviews.

**Atomicity absorbed as criterion 7:** The existing `audit/content/atomicity-context.ts` (211 lines, hardcoded `const discipline = "math"` on line 65) assembles graph context for atomicity assessment. This phase absorbs its logic into `review-context.ts`, parameterized by discipline. The standalone `/atomicity-audit` command is deprecated in Phase 3.

**What the reviewer evaluates (7 criteria, prioritized):**

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
- Grounded on: `cognitiveDemand` label, `contentDepth` dimension, `gradeLevel`
- NOT grounded on graph depth ranges
- Note: `/content-health` checks demand *distribution counts* deterministically. This checks whether labels *match the actual cognitive requirement*.

**6. Dimension alignment (semantic, not structural):**
- Does the *content itself* match the claimed dimension?
- A problem with `presentation: primary` that uses algebra terminology → warn
- A problem with `contentDepth: survey` that requires analytical reasoning → warn
- Structural field matching is already checked by `validate-content`

**7. Topic atomicity:**
- Is the topic properly scoped? Not too broad ("all of algebra") or too narrow ("adding 3+2 specifically")
- Grounded on: topic description, prerequisite count, encompassing edges, problem diversity within the topic
- Absorbs logic from `audit/content/atomicity-context.ts`

**Rubric footnotes (checked but not weighted heavily):**
- **Progression model compliance:** mastery-gated content has clear right/wrong; context-layered has multiple perspectives
- **Platform compatibility:** LLM catches what regex misses ("visualize the rotation", "measure the angle")

### Steps

1. [x] [IMP] Define review types (`audit/content/review-types.ts`):
   - `ReviewFinding`: `{ criterion: string; status: "pass" | "warn" | "error" | "skip"; detail: string; evidence?: string; problemId?: string; confidence?: "high" | "low" }`
   - `TopicReview`: `{ topicId: string; discipline: string; timestamp: string; findings: ReviewFinding[]; overallGrade: "A" | "B" | "C" | "D" | "F"; summary: string; contentHash: string }`
   - `TopicReviewCache`: `{ contentHash: string; reviews: TopicReview[] }` (up to 3 reviews per hash)
   - `ReviewReport`: `{ timestamp: string; discipline: string | "all"; topicsReviewed: number; gradeDistribution: Record<string, number>; highConfidenceFindings: number; lowConfidenceFindings: number; topicReviews: TopicReview[] }`
   - `TopicContext`: `{ topicId: string; discipline: string; name: string; description: string; strand: string; gradeLevel: number; progressionModel: string; prerequisites: { id: string; name: string; description: string }[]; encompassingEdges: { parentId: string; childId: string; weight: number }[]; problems: any[]; examples: any[]; presentation: string; contentDepth: string }`

2. [x] [IMP] Build context assembler (`audit/content/review-context.ts`):
   - Absorbs logic from `audit/content/atomicity-context.ts` (parameterized by discipline, not hardcoded math)
   - `assembleTopicContext(topicId: string, discipline: string): TopicContext`
   - Reads graph.json for topic metadata (gradeLevel, strand, progressionModel, defaultPresentation, contentDepth)
   - Reads prerequisite topics' metadata (name, description — NOT full problems, NOT graph position)
   - Reads encompassing edges for the topic (needed for atomicity criterion 7)
   - Reads problems/{topicId}.json and examples/{topicId}.json
   - `assembleReviewBatch(discipline: string, opts?: { strand?: string; topicIds?: string[] }): TopicContext[]`
   - Computes content hash per topic (hash of problems + examples files, for cache invalidation)
   - CLI entry: `npx tsx audit/content/review-context.ts [--discipline <name>] [--topic <id>] [--strand <name>] --output <file>`
   - Outputs JSON array of `TopicContext` objects

3. [x] [IMP] Build review rubric document (`audit/content/review-rubric.md`):
   - Human-readable rubric included in subagent prompts
   - 7 criteria with priority levels, descriptions, pass/warn/error definitions
   - Criterion 7 (atomicity): assess topic scope using description, prerequisite count, encompassing edges, problem diversity
   - **Grounding rules:** "Evaluate content against its declared metadata. Do NOT use graph depth, topological position, or downstream topic counts."
   - Discipline-specific notes per progression model
   - Example findings for calibration
   - Expected output format: JSON array of `ReviewFinding` objects
   - Scope note: "You are reviewing TEXT content only. Ignore references to future media."

4. [x] [IMP] Build review cache (`audit/content/review-cache.ts`):
   - Cache directory: `audit/reports/content-reviews/{discipline}/`
   - Per-topic file: `{topic-id}.json` containing `TopicReviewCache` (content hash + up to 3 reviews)
   - `getCache(topicId, discipline): TopicReviewCache | null`
   - `isFresh(topicId, discipline, contentHash): boolean`
   - `isFull(topicId, discipline, contentHash): boolean` (3 reviews stored)
   - `appendReview(topicId, discipline, review: TopicReview): void` (appends; if hash changed, replaces all; if at cap, replaces oldest)
   - `loadAllCached(discipline: string): TopicReviewCache[]`
   - `aggregateFindings(cache: TopicReviewCache): ReviewFinding[]` (dedup, mark confidence: 2+ runs = high, 1 = low)

5. [x] [IMP] Build `/content-review` slash command (`.claude/commands/content-review.md`):
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
     5. Write aggregate report to `audit/reports/content-reviews/{discipline}-report.json`
     6. Write markdown summary to `audit/reports/content-reviews/{discipline}-report.md`
     7. Present summary: grade distribution, high-confidence findings by criterion, worst topics
     8. "Review the report — approved findings can be fed into /generate-content for targeted fixes."

6. [x] [TST] Test context assembler and cache (`audit/content/__tests__/review.test.ts`):
   - Add clarifying comment: "Tests the review tool code (context assembly, cache logic, finding aggregation), not content quality"
   - Unit test: context assembler loads math topic with prerequisites and encompassing edges
   - Unit test: context assembler parameterized by discipline (not hardcoded math)
   - Unit test: content hash changes when problems file changes
   - Unit test: cache stores up to 3 reviews per hash, replaces oldest at cap
   - Unit test: cache invalidates all reviews when hash changes
   - Unit test: aggregateFindings marks confidence correctly (2+ runs = high, 1 = low)
   - Manual test: `/content-review math --topic add-within-20` produces valid review with 7 criteria
   - `just typecheck` passes

**Validation:** `/content-review math --topic add-within-20` reviews a single topic against all 7 criteria (including atomicity). Cache stores up to 3 reviews, marks confidence. `/content-review math --strand fractions` spawns subagents. Report is human-readable with actionable findings.

---

## Phase 3: Audit Integration & Finalization ✓

**Goal:** Wire content review into the unified audit report (Section 8). Update `/generate-content` pipeline. Deprecate standalone atomicity audit. Add justfile recipe.

### Context for Execution

**Current audit report has 7 sections.** Phase 3 adds Section 8: Content Review (including atomicity findings).

**Audit orchestrator:** `audit/orchestrator.ts` — reads cached data to populate each section. Section 8 reads from `audit/reports/content-reviews/`.

**Audit renderer:** `audit/render.ts` — renders each section to markdown. Section 8 rendering goes here (no separate renderer).

**`/generate-content` verification loop:** `.claude/commands/generate-content.md` lines 151-168 — add `/content-review` as a final verification step.

**`/atomicity-audit` deprecation:** `.claude/commands/atomicity-audit.md` — redirect to `/content-review`. Delete `audit/content/atomicity-context.ts` once `review-context.ts` fully absorbs it.

**Audit relevance:** `audit/relevance.ts` — content file changes should also map to Section 8 (already partially mapped from Plan 026 Phase 2; verify and complete).

### Steps

1. [x] [IMP] Add Section 8: Content Review to audit report:
   - New type in `audit/types.ts`: `ContentReviewSection`
   - Fields: `status`, `items`, `topicsReviewed`, `gradeDistribution`, `highConfidenceIssues`, `worstTopics: { topicId: string; discipline: string; grade: string; topFindings: string[] }[]`, `topRecurringIssues: { criterion: string; count: number; severity: string }[]`, `lastReviewTimestamp: string | null`
   - In `audit/orchestrator.ts`: `auditContentReview()` reads cached reviews from `audit/reports/content-reviews/`
   - Aggregates findings across all cached topic reviews (including atomicity criterion 7)
   - Status: `pass` (all A/B), `warn` (any C), `fail` (any D/F), `pending` (no reviews)
   - If no cached reviews: `pending` with "Run `/content-review` to generate"

2. [x] [IMP] Add Section 8 rendering in `audit/render.ts`:
   - Grade distribution table
   - High-confidence issues count
   - Worst topics table with top findings
   - Recurring issues summary (including atomicity findings)
   - Recommendations

3. [x] [IMP] Deprecate `/atomicity-audit`:
   - Update `.claude/commands/atomicity-audit.md`: redirect message explaining it's now part of `/content-review` (criterion 7)
   - Delete `audit/content/atomicity-context.ts` (logic absorbed into `review-context.ts`)
   - Remove `just atomicity-context` recipe from justfile

4. [x] [IMP] Update `/generate-content` post-verification loop:
   - Target: `.claude/commands/generate-content.md` Section "6. Post-Generation Verification Loop"
   - Add `/content-review <subject> --topic <topic-id>` after existing checks
   - Present review findings for user approval before proceeding to import

5. [x] [IMP] Add `just review-content` justfile recipe:
   - Place under `# ── Auditing ──` section
   - `just review-content [discipline]` — renders cached review report (markdown to stdout)
   - Prints instructions to run `/content-review` in Claude Code if no cache exists

6. [x] [IMP] Update audit relevance mapping in `audit/relevance.ts`:
   - Verify content file patterns (`problems/*.json`, `examples/*.json`, `graph.json`) map to Section 8
   - These mappings were partially set up in Plan 026 Phase 2 — verify they work with the new directory structure

7. [x] [TST] Test audit integration:
   - Update `audit/__tests__/audit.test.ts`: section count assertion from 7 → 8
   - Unit test: Section 8 populates from cached reviews
   - Unit test: empty cache → pending status
   - Unit test: grade distribution aggregation correct
   - Unit test: audit markdown includes Section 8 header
   - `just typecheck` passes, `just test` passes

**Validation:** `just audit` shows 8 sections. Section 8 populated from cached content reviews (including atomicity) or shows pending. `/generate-content` includes review as final verification. `/atomicity-audit` redirects to `/content-review`. `just review-content` renders cached reports.

---

## Phase 4: Initial Rubric Validation (Pre-028)

**Goal:** Run the review system on 1-2 more strands to validate the rubric infrastructure works at scale. Defer deep rubric tuning (especially around difficulty calibration and lesson quality) to after Plan 028, which eliminates per-topic difficulty levels and adds lesson content.

**Why defer full tuning:** Plan 028 will (a) remove difficulty as a per-topic concept (criterion 3 becomes "problem equivalence"), (b) add a lesson quality criterion, and (c) change what `/generate-content` produces. Tuning the rubric deeply now would require re-tuning after those changes. This phase validates the *system* works; Plan 028 Phase 5 handles the rubric evolution.

### Steps

1. [x] [IMP] Run `/content-review math --strand fractions` and `/content-review math --strand expressions-equations`:
   - Validate the batch review pipeline works at scale (~30-40 topics per strand)
   - Spot-check findings: are high-confidence findings real? Are obvious problems missed?
   - Pay special attention to criterion 7 (atomicity) — does it flag real scope issues?
   - Note: counting-cardinality was already reviewed in this session (15 topics, all A/B)

2. [x] [DOC] Document initial findings for Plan 028/029 input:
   - Which criteria had high/low signal across the 3 strands
   - Recurring content patterns that should inform lesson authoring
   - Any false positives that are clearly rubric wording issues (fix obvious ones now, defer judgment calls)
   - Record in DECISIONS.md: "Rubric tuning deferred to post-028 — difficulty model and lesson content will change what the rubric evaluates"

**Deferred to Plan 028 Phase 5:**
- Criterion 3 (difficulty calibration) → replaced with "problem equivalence" criterion
- New criterion 8 (lesson quality) → added when lesson content exists
- Generation feedback integration → `/generate-content` will be updated for lesson authoring
- Full rubric re-tuning against content that includes lessons

**Validation:** Review pipeline runs successfully on 2 additional strands. Findings documented for Plan 028 input. No deep rubric changes — the system works, the criteria will evolve with the content model.

---

## Future: OpenRouter Headless Backend (Unscheduled)

**Deferred until:** Live product with frequent content changes justifies automated review outside of Claude Code sessions.

**Design notes (preserved for when needed):**
- OpenRouter API client sending same rubric prompts to Haiku/Sonnet
- Same cache format — reviews from OpenRouter and Claude Code subagents are interchangeable
- Cost guard (`--max-cost`) and CI exit codes (`--ci` mode)
- `just review-content-ci [discipline]` recipe for headless execution
- Straightforward when needed: same types, same rubric, different transport

---

## Design Notes

### Why atomicity is absorbed into content review

The atomicity audit was built as a standalone system before the content review infrastructure existed. It uses the same pattern (context assembler + LLM subagent + cached results) to answer a related question ("is this topic properly scoped?"). Keeping it separate means two context assemblers, two cache systems, two slash commands doing overlapping work. Absorbing it as criterion 7 means one system, one cache, one report — and the atomicity assessment benefits from seeing the full content (problems, examples) alongside graph structure.

### Three pillars vs flat structure

The previous organization grew organically: `simulations/` for simulation code + all output, `tools/` for everything else, `docs/audits/` for atomicity. The three-pillar `audit/` structure makes the mental model explicit: when you think "audit," you think learner simulations (pillar 1), content (pillar 2), report (pillar 3). Supporting tools (healing, training, rollups) live in the structure but aren't confused with the audit itself.

### Why `learner-simulations` not `simulations`

"Simulations" is vague — simulations of what? The directory name `learner-simulations` makes the purpose immediately clear: we're simulating **learners** to assess how the learning system performs. This clarity matters because the audit directory contains multiple pillars, and at a glance you should know that `learner-simulations/` tests learner progression, `content/` evaluates content quality, and `reports/` aggregates findings. Justfile recipe names stay as `simulate-*` (imperative verbs describing the action), while the directory name describes what the infrastructure IS.
