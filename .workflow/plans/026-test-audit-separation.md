# Plan 026: Test/Audit Separation

> **Created:** 2026-03-14T00:39:17Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Cleanly separate the codebase's quality assurance into two systems with distinct purposes, triggers, and commands:

- **Testing** ("IF the system works"): Automated, fast, deterministic. Validates code correctness — unit tests, integration tests, type checking, content structure validation, engine regression. Runs on every code change.
- **Auditing** ("HOW the system works"): Manual, on-demand, analytical. Evaluates system behavior — content quality, learning outcome simulations, system health, LLM review. Runs when the user asks, or when relevant parts change.

Currently these are conflated: `just test` runs simulation regression alongside unit tests, audit tool tests live in `tools/__tests__/`, simulation evaluation blurs testing/auditing, and there's no clear documentation of which commands belong to which system.

## Progress

**Completed:** Phase 1
**In Progress:** —
**Next:** Phase 2

---

## Phase 1: Command & Pipeline Separation ✓

**Goal:** Make `just test` purely testing, create clear audit commands, document the boundary. No functional changes to any tool — only reorganization of how they're invoked and documented.

### Context for Execution

**Current state of `just test` (justfile lines 12-15):**
```just
test:
    pnpm test
    npx tsx simulations/src/regression.ts
```

`pnpm test` runs vitest via `packages/api/package.json` `"test"` script → vitest with `@cloudflare/vitest-pool-workers`. The regression test (`simulations/src/regression.ts`) runs 3 profiles × 5 sessions (~15s) and compares against `regression-baseline.json`.

**The problem:** `just test` mixes unit/integration testing with simulation-based regression. When a developer runs `just test`, they expect "do my code changes break anything?" — not "run synthetic learners through the engine." The regression test is fast enough to be in the automated pipeline, but it's conceptually different from unit tests and should be opt-in or in a separate validation step.

**Current `just validate` (justfile line 70):**
```just
validate: typecheck validate-content
```
Only typecheck + content validation. No tests, no regression.

**Test files that test audit tooling (NOT the system):**
- `tools/__tests__/audit.test.ts` (307 lines) — Tests the audit orchestrator code: report schema, section population, markdown rendering, thresholds, historical comparison. This is a **code test** (does the audit tool work?) not an **audit** (is the system healthy?). Runs via `npx tsx tools/__tests__/audit.test.ts`. Currently NOT part of `just test` — it's run manually.
- `simulations/src/__tests__/evaluate.test.ts` — Tests the evaluation engine code (metric classification, direction handling). Code test, not audit.
- `simulations/src/__tests__/load-targets.test.ts` — Tests target file validation. Code test.
- `simulations/src/__tests__/heal-loop.test.ts` — Tests healing orchestration logic. Code test.

These tool tests are reasonable as code tests. They should stay as test files but be clearly labeled as testing tool code, not running audits.

**Target state — command landscape:**

| Command | Category | What it runs | When |
|---------|----------|-------------|------|
| `just test` | Testing | Vitest unit + integration tests only | Every code change |
| `just typecheck` | Testing | TypeScript compilation | Every code change |
| `just validate-content` | Testing | DAG, required fields, cross-discipline edges | Content changes |
| `just regression` | Testing | 3 profiles × 5 sessions (~15s) | Before committing, or standalone |
| `just validate` | Testing | typecheck + test + validate-content + regression | Full pre-commit gate |
| `just audit` | Auditing | 8-section system health report (reads cached data) | On demand |
| `just audit-all` | Auditing | simulate-all + evaluate + audit (comprehensive) | On demand |
| `just audit-check` | Auditing | What audit sections are affected by current changes? | After code changes |
| `just evaluate` | Auditing | Simulation evaluation vs targets | After simulation runs |
| `just heal-epoch` | Auditing | Healing loop iteration | When fixing system targets |
| `/content-review` | Auditing | LLM content review (Plan 026) | On demand |
| `/content-health` | Auditing | Deterministic health scoring | On demand |
| `/atomicity-audit` | Auditing | Topic atomicity assessment | On demand |

**Key design decisions:**
- `just test` becomes vitest-only (fast, ~30s). No simulation code.
- `just regression` is a standalone recipe for the simulation regression check.
- `just validate` becomes the comprehensive automated gate: typecheck + test + validate-content + regression. This is what you run before committing.
- `just audit` stays unchanged — it reads cached data and produces a report.
- `just audit-all` is new — runs full simulations + evaluation + audit report in one command.
- Simulation recipes (`just simulate-*`, `just evaluate-*`, `just heal-*`) stay unchanged but are clearly documented as auditing.

### Steps

1. [x] [IMP] Restructure justfile test/validate/audit recipes:
   - **`just test`**: Remove `npx tsx simulations/src/regression.ts`. Keep only `pnpm test`.
   - **`just regression`**: New recipe — `npx tsx simulations/src/regression.ts {{args}}`. Standalone.
   - **`just validate`**: Change from `typecheck validate-content` to `typecheck test validate-content regression`. This is the full automated gate.
   - **`just audit-all`**: New recipe — runs `just simulate-all 30` + `just evaluate` + `just audit`. Comprehensive on-demand audit.
   - **`just audit-check`**: New recipe — runs `npx tsx tools/audit-relevance.ts` (built in Phase 2). Placeholder for now that prints "audit-check not yet implemented".
   - Keep all existing `just simulate-*`, `just evaluate-*`, `just heal-*` recipes unchanged.

2. [x] [IMP] Add section comments to justfile for clarity:
   - Group recipes under clear headers:
     ```
     # ── Testing (automated, run on code changes) ──
     # ── Content Pipeline ──
     # ── Auditing (manual, on-demand) ──
     # ── Simulations (auditing) ──
     # ── Deployment ──
     ```
   - Each group gets a 1-line comment explaining when to use it.

3. [x] [DOC] Update CLAUDE.md Commands section:
   - Replace the current flat command list with two sections: **Testing** and **Auditing**
   - Document the distinction: "Testing validates code correctness (run automatically). Auditing evaluates system behavior (run on demand)."
   - Document `just validate` as the pre-commit gate
   - Document that `tools/__tests__/audit.test.ts` tests the audit *tool code*, not the system
   - Note: simulation regression is in `just validate` (not `just test`) because it tests engine behavior, not individual functions

4. [x] [DOC] Add clarifying comments to test files that test audit tooling:
   - `tools/__tests__/audit.test.ts` line 1-5: Add comment explaining this tests the audit tool's code (schema, rendering, thresholds), NOT whether the system is healthy
   - `simulations/src/__tests__/evaluate.test.ts`: Same — tests evaluation engine code
   - `simulations/src/__tests__/heal-loop.test.ts`: Same — tests healing orchestration code
   - `simulations/src/__tests__/load-targets.test.ts`: Same — tests target loading code

5. [x] [TST] Verify separation:
   - `just test` runs in <60s with no simulation output
   - `just regression` runs standalone (~15s)
   - `just validate` runs test + typecheck + content validation + regression
   - `just audit` still produces 7-section report (8 after Plan 026)
   - `just audit-all` runs simulations + evaluation + audit
   - `just typecheck` passes

**Validation:** `just test` runs vitest only — no simulation output, no regression baseline comparison. `just validate` runs everything automated including regression. `just audit-all` runs the full audit suite on demand. CLAUDE.md clearly documents which commands are testing vs auditing.

---

## Phase 2: Audit Relevance Guard

**Goal:** Build a lightweight tool that maps code changes to affected audit sections, so you know which parts of the audit are stale after making changes.

### Context for Execution

**The problem:** After making code changes, you don't know which audit sections need re-running. Did changing `srs.ts` affect simulation results? Did changing problems files affect content quality? Currently you either re-run everything (slow) or guess (unreliable).

**Design:** A simple file-path-to-audit-section mapping. Given `git diff --name-only` output, determine which audit sections are potentially affected and print advisory recommendations.

**Mapping rules:**

| File pattern | Affected audit section(s) | Recommended action |
|-------------|--------------------------|-------------------|
| `packages/api/src/services/srs.ts` | 3 (Simulation), 4 (Effectiveness) | `just simulate-regression` or `just evaluate` |
| `packages/api/src/services/graph.ts` | 1 (Graph Integrity), 3 (Simulation) | `just audit`, `just simulate-regression` |
| `packages/api/src/services/session.ts` | 3 (Simulation) | `just simulate-regression` |
| `packages/api/src/services/diagnostic.ts` | 3 (Simulation) | `just simulate-regression` |
| `packages/api/src/services/llm.ts` | 5 (LLM Tracking) | `just audit` |
| `packages/api/src/services/content-r2.ts` | 2 (Content Quality) | `just audit` |
| `../learn-content/**/graph.json` | 1 (Graph), 2 (Content), 8 (Review) | `just audit`, `/content-review` |
| `../learn-content/**/problems/*.json` | 2 (Content), 8 (Review) | `just audit`, `/content-review` |
| `../learn-content/**/examples/*.json` | 2 (Content), 8 (Review) | `just audit`, `/content-review` |
| `simulations/targets.json` | 3 (Simulation) | `just evaluate` |
| `simulations/profiles/*.json` | 3 (Simulation) | `just simulate-regression` |
| `tools/audit*.ts` | All | `just audit` (tool code changed) |
| `tools/content-*.ts` | 2 (Content) | `just audit` |
| `packages/api/src/db/schema.ts` | All | Full re-audit recommended |

**Output format:**
```
$ just audit-check
Checking changes against audit relevance map...

Changed files (3):
  packages/api/src/services/srs.ts
  packages/api/src/services/session.ts
  ../learn-content/math/problems/add-within-20.json

Affected audit sections:
  ⚠️  Section 2: Content Quality — content files changed
  ⚠️  Section 3: Simulation Results — engine code changed
  ⚠️  Section 8: Content Review — problem files changed

Recommended:
  just regression          # Quick engine regression check (~15s)
  just audit               # Refresh audit report
  /content-review math     # Re-review changed content (in Claude Code)

Unaffected sections: 1 (Graph), 4 (Effectiveness), 5 (LLM), 6 (Media), 7 (Multi-Discipline)
```

**This is advisory, not blocking.** It prints recommendations, doesn't prevent anything. The user decides what to re-run.

### Steps

1. [ ] [IMP] Build `tools/audit-relevance.ts`:
   - Reads `git diff --name-only` (or accepts file list via stdin/args)
   - Also checks `git diff --name-only` against content dir (`CONTENT_DIR` env var)
   - Maps file patterns to audit sections using the rules above
   - Outputs affected sections with recommended commands
   - Exports `checkRelevance(changedFiles: string[]): AuditRelevance` for programmatic use
   - CLI entry: `npx tsx tools/audit-relevance.ts [--content-dir <path>]`

2. [ ] [IMP] Wire up `just audit-check` recipe:
   - Replace Phase 1 placeholder with actual implementation
   - Recipe runs `audit-relevance.ts` with git diff of uncommitted changes
   - Also checks content dir changes if content dir exists
   - Exits 0 always (advisory only)

3. [ ] [IMP] Add `--check` flag to `just audit`:
   - When `just audit --check` is passed, run relevance check first, then audit
   - Print which sections were flagged before the full report
   - This gives context when reading the audit: "these sections may be stale"

4. [ ] [TST] Test audit relevance:
   - Unit test: SRS file change maps to sections 3, 4
   - Unit test: problem file change maps to sections 2, 8
   - Unit test: schema change maps to all sections
   - Unit test: unrelated file (e.g., README) maps to no sections
   - Unit test: content dir changes detected
   - `just typecheck` passes

**Validation:** `just audit-check` prints relevant sections based on uncommitted changes. Changing `srs.ts` flags simulation sections. Changing problem files flags content sections. Output is advisory with clear recommended commands.

---

## Design Notes

### Why regression stays in `just validate` (not `just test`)

The regression test (`simulations/src/regression.ts`) is a bridge between testing and auditing:
- **Testing aspect:** "Did we break the engine?" — deterministic, fast (~15s), has a baseline
- **Auditing aspect:** "How do learner profiles perform?" — runs full simulations

It belongs in `just validate` (the comprehensive pre-commit gate) because:
1. It's fast enough to not slow down the commit flow
2. It catches regressions that unit tests miss (cross-cutting engine behavior)
3. It's deterministic (seeded random, frozen time)
4. Developers should know if their changes break learner outcomes before committing

It does NOT belong in `just test` because:
1. `just test` should be pure code tests — no simulation infrastructure
2. Developers running `just test` during development shouldn't wait for profile simulations
3. The regression test depends on profile files, targets, and baseline — not just code

### Why audit tool tests stay as test files

`tools/__tests__/audit.test.ts` tests whether the audit *tool code* works correctly:
- Does `runAudit()` return a valid schema?
- Does the markdown renderer produce expected output?
- Do thresholds change status correctly?
- Does historical comparison work?

This is code testing, not system auditing. The fact that it calls `runAudit()` is like a unit test calling a function — it tests the function, not the system. These files stay in `__tests__/` directories with clarifying comments.

### Simulations serve both systems

The simulation framework (`simulations/src/`) is infrastructure used by both:
- **Testing:** `regression.ts` runs 3 profiles × 5 sessions as a fast smoke test
- **Auditing:** `cli.ts` + `evaluate.ts` run 30+ profiles × 30-360 sessions for deep analysis

The same `SimulationRunner` powers both. The difference is scope and intent, not code.

### What changes vs what stays

| Component | Change? | Notes |
|-----------|---------|-------|
| `just test` | **Yes** — remove regression | Vitest only |
| `just validate` | **Yes** — add test + regression | Full automated gate |
| `just regression` | **New** | Standalone regression recipe |
| `just audit-all` | **New** | Comprehensive audit in one command |
| `just audit-check` | **New** | Relevance advisory |
| `just audit` | Unchanged | Still reads cached data |
| `just simulate-*` | Unchanged | Still auditing commands |
| `just evaluate-*` | Unchanged | Still auditing commands |
| `just heal-*` | Unchanged | Still auditing commands |
| `tools/__tests__/audit.test.ts` | **Comment only** | Add clarifying header |
| `simulations/src/__tests__/*.test.ts` | **Comment only** | Add clarifying headers |
| CLAUDE.md | **Yes** — restructure | Document testing vs auditing |
| Vitest tests | Unchanged | Already correctly categorized |
| Content validation | Unchanged | Already correctly categorized |
