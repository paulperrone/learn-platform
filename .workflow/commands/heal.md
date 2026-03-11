---
description: Run healing iterations on the adaptive engine — diagnose, fix, verify failing systems
allowed-tools: Read, Write, Glob, Grep, Bash, Edit, AskUserQuestion
---

# /heal — Run Healing Iteration

Run one or more healing iterations on the learn-platform adaptive engine. Reads evaluation output, traces root causes in service code, makes targeted fixes, verifies with mini-sim, and checkpoints.

**Analogy:** Simulations are the forward pass, learning-science targets are the loss function, root-cause analysis is backpropagation, code changes are weight updates.

## Arguments

```
/heal                          # Fix up to 3 failing systems, then checkpoint
/heal --evaluate-only          # Just run evaluation, show status, don't fix
/heal --full                   # Run full evaluation with paired FIRe sims (slower, definitive)
/heal --verify <system>        # Verify a manual fix for a specific system
/heal --system <id>            # Target a specific system only
/heal --max <N>                # Fix up to N systems (default 3)
```

## Prerequisites

Before starting, verify:

```bash
ls simulations/targets.json          # Target definitions exist
ls simulations/src/evaluate.ts       # Evaluation engine exists
ls simulations/src/heal-loop.ts      # Orchestrator exists
just test 2>&1 | tail -5             # Unit tests pass (baseline sanity)
```

If any prerequisite is missing, stop and report what's needed.

---

## Workflow

### Step 1: Evaluate Current State

Run evaluation to get the current system health:

```bash
# Evaluate system health (includes FIRe compression by default, ~10s)
just evaluate

# Skip FIRe for faster iteration
just evaluate --skip-fire

# If no recent data exists (< 1 hour old), run a full epoch first:
just heal-epoch
```

**Note:** FIRe compression runs by default (~10s). Use `--skip-fire` only when iterating on non-FIRe metrics.

Read the output:
- `simulations/reports/evaluation.json` — machine-readable results
- `simulations/reports/evaluation.md` — human-readable report

**Parse the evaluation JSON:**
- Sort systems by priority (P0 first, then P1, then P2)
- Within each priority, sort by delta magnitude (worst first)
- Identify the highest-priority FAIL system — that's the fix target

**If `--evaluate-only` or `--full` without other flags:** Print the status table and stop.

**If `--verify <system>`:**
- Run `just heal-verify <system> --sessions 10`
- Compare before/after for that specific system
- Report result and stop

### Step 2: Diagnose Root Cause

For the target failing system, read its `investigationArea` from the evaluation JSON:

1. **Read the suggested source files** — use TLDR for structure first, then read specific functions
2. **Read the relevant simulation events** — check `simulations/runs/` for the contributing profiles
3. **Inspect simulation data for the failing system** (see system-specific inspection below)
4. **Trace the failing metric through the code path:**
   - Start at the metric computation in `evaluate.ts` — understand what's being measured
   - Follow to the service code — understand what's producing the measured behavior
   - Identify the specific code that causes the metric to miss its target
5. **Form a hypothesis** — state clearly: "The metric fails because [X] in [file:function] causes [Y behavior]"

#### System-Specific Event Inspection

When diagnosing a failing system, automatically inspect the relevant simulation data for the worst-contributing profile:

Run structure: `simulations/runs/<profile>-<timestamp>/` contains `events.jsonl`, `summary.json`, `diagnostic-result.json`. Find the latest run for the worst-contributing profile:

```bash
# Find latest run for a profile (e.g., average-older)
ls -t simulations/runs/<profile>-* | head -1
```

**For interleaving:**
```bash
# Read events for worst-contributing profile — check strand adjacency
cat simulations/runs/<latest-run>/events.jsonl | head -200
```
Look for: consecutive same-topic problems, especially at session start (warmup phase). Count strand transitions vs same-strand adjacencies. If adjacency is clustered in warmup, the fix is warmup diversity; if spread throughout, the fix is shuffle algorithm.

**For mastery_convergence:**
```bash
# Read summary — check mastery trajectory across sessions
cat simulations/runs/<latest-run>/summary.json
```
Check `masteryCount` vs `materializedMasteryCount` in state snapshots. If `masteryCount` is flat but `materializedMasteryCount` grows, the student IS learning but total isn't updating. If both are flat, no progress.

**For review_new_balance:**
```bash
# Read events — check review vs new problem counts per session
cat simulations/runs/<latest-run>/events.jsonl | grep '"type":"session"' | head -30
```
Look for: sessions with 0 new topics (all review), review ratio per session, whether new-topic count changes over time.

**For fire_compression:**
```bash
# Check evaluation results (requires --full for paired FIRe data)
cat simulations/reports/evaluation.json
```
Look at fire_compression metric details. Check fire-enabled vs fire-disabled review counts per profile. If counts are similar, FIRe credit is not meaningful enough. Also check encompassing edge density in `content/*/graph.json`.

**For mastery_preservation:**
```bash
# Read summary — check session 0 vs session 1 mastery counts
cat simulations/runs/<latest-run>/summary.json
```
Look for: mastery drop between session 0 (post-diagnostic) and session 1. If significant drop, check which topics lost mastery in `events.jsonl` and why (hard questions on warmup review).

### Step 3: Design Fix

Before coding:

1. **State the fix** — one sentence describing the change
2. **Assess regression risk** — which other systems could this affect?
3. **Choose the simplest approach** — prefer parameter tuning over architectural changes
4. **Document the rationale** — why this fix, why this value

If multiple approaches exist, list them with trade-offs and pick the simplest.

### Step 4: Implement Fix

1. Make the code change in the relevant service file(s)
2. Run `just test` — unit tests must pass
3. If tests fail, fix the test issue before proceeding
4. If the fix requires updating test expectations (because behavior correctly changed), update them

### Step 5: Verify Fix

Run a focused mini-simulation:

```bash
just heal-verify <system-id> --profiles <relevant-profiles> --sessions 10
```

**Interpret results:**
- **Metric improved toward target:** Fix is working. Proceed.
- **Metric unchanged:** Fix didn't address root cause. Try alternative approach (max 2 alternatives).
- **Metric regressed or other system regressed:** Revert fix, try different approach.
- **All approaches fail:** Document the failure with what was tried, move to next system.

### Step 6: Iterate or Checkpoint

After each successful fix:
- Update the running status (which systems fixed, which remain)
- If `--max` systems fixed (default 3): create checkpoint and report
- If more systems remain and under the limit: go back to Step 2 for the next failing system

**Create checkpoint:**
```bash
just heal-checkpoint
```

**Report to user:**
```
## Healing Iteration Complete

### Fixed
- [system-id]: [before] → [after] ([what was changed])

### Remaining Failures
- [system-id]: [status] — [brief description]

### Regressions (if any)
- [system-id]: [before] → [after] — [cause]

### Next Steps
- Run `/heal` to continue with remaining failures
- Run `just heal-status` to see full history
```

---

## Escalation — When to Stop and Ask

Stop iterating and ask the user when:

- **Stalled:** Two consecutive fix attempts on the same system failed
- **Regression:** A fix caused another system to regress from PASS → FAIL
- **Architectural question:** The fix requires changing a core design decision (session structure, FSRS parameters, mastery criterion)
- **Target question:** The evaluation suggests the target itself may be wrong (e.g., the system behaves correctly but the target is too strict)
- **Cross-system conflict:** Improving one system necessarily degrades another (trade-off requires human judgment)

When escalating, provide:
1. What was tried and why it failed
2. The specific trade-off or decision needed
3. Recommended options with pros/cons

---

## System-Specific Diagnosis Playbooks

### mastery_convergence (P0)
**What it measures:** Non-struggling profiles reaching ≥50% mastery by session 30.
**Target:** ≥4 of 8 non-struggling profiles.

**Important — implicit vs materialized mastery (post-017.7):**
- `StateSnapshot.masteryCount` = total mastery (materialized + implicit from diagnostic estimates)
- `StateSnapshot.materializedMasteryCount` = earned SRS mastery only (topics in `user_topic_state` with `mastered=true`)
- Mastery convergence uses `masteryCount` (total). The metric counts ALL mastered topics, not just materialized ones.
- Topics below placement grade are implicitly mastered via `diagnosticSessions.topicEstimatesJson` — they are NOT in `user_topic_state` but DO count toward mastery.
- When diagnosing, distinguish "initial mastery from diagnostic" (implicit, set at session 0) vs "earned mastery through learning" (materialized, grows across sessions). Flat `masteryCount` with growing `materializedMasteryCount` means the student is earning real mastery.

**Where to look:**
- `packages/api/src/services/srs.ts` → `processReview()`, `checkMasteryCriterion()`
- `packages/api/src/services/session.ts` → `getSessionMix()`
- `packages/api/src/services/graph.ts` → `computeFrontier()` (implicit mastery query)

**Common root causes:**
1. **Stability threshold too strict** — mastery requires too many consecutive correct answers. Check `MASTERY_THRESHOLD` and `CONSECUTIVE_CORRECT_REQUIRED` in srs.ts.
2. **Consecutive correct counter not incrementing** — the counter may reset on review failures for OTHER topics. Verify counter is per-topic.
3. **Session mix starving new topics** — if review queue dominates, students never see enough new material to master it. Check review cap in getSessionMix().
4. **Mastery preservation bypassed** — diagnostic mastery not surviving into session 1. Check hysteresis logic in processReview().
5. **Frontier exhaustion from over-materialization** — too many topics materialized at diagnostic → all added to startedIds → excluded from `computeFrontier()` → tiny frontier → few new topics to master.

**Diagnostic trace:** Read `state-snapshots.json` for failing profiles. Compare `masteryCount` vs `materializedMasteryCount` across sessions. Look for: flat lines (no progress), sawtooth (gaining then losing), late starts (mastery only begins in later sessions), or stagnant `materializedMasteryCount` (not earning new mastery despite high total).

---

### mastery_preservation (P0)
**What it measures:** Diagnostic mastery retained through session 1 (≤10% loss).

**Where to look:**
- `packages/api/src/services/srs.ts` → `processReview()`, hysteresis logic

**Common root causes:**
1. **Hysteresis threshold too low** — a single wrong answer removes mastery. Check the threshold for mastery loss (should require multiple failures).
2. **Diagnostic mastery not setting consecutive correct count** — materialized topics should start with a correct count matching their mastery confidence.
3. **Review of mastered topics with hard questions** — mastered topics hit with hard problems that the student hasn't actually studied, causing false negatives.

---

### difficulty_targeting (P1)
**What it measures:** Profiles with rolling 10-problem accuracy in [0.80, 0.90] zone.
**Target:** ≥7 of 10 profiles.

**Where to look:**
- `packages/api/src/services/session.ts` → difficulty selection logic
- Content files → difficulty distribution across problems

**Common root causes:**
1. **No adaptive difficulty selection** — problems chosen randomly by difficulty instead of targeting 85% accuracy.
2. **Content doesn't span difficulty range** — all problems at similar difficulty, preventing adaptation.
3. **Difficulty mismatch** — labeled difficulty doesn't match actual difficulty for certain profiles.

---

### review_new_balance (P1)
**What it measures:** Review ratio across sessions in [0.50, 0.70] range.
**Target:** Average review ratio in range.

**Post-017.7 context:** Reduced materialization improved review ratio from 0.96→0.88 but still above the 0.50-0.70 target. The improvement came from fewer materialized topics = smaller review queue. Further improvement requires: (a) session mix algorithm enforcing a new-topic minimum, (b) FIRe compression reducing review load, or (c) more aggressive frontier expansion.

**Where to look:**
- `packages/api/src/services/session.ts` → `getSessionMix()` slot allocation, new-topic minimum
- `packages/api/src/services/graph.ts` → `computeFrontier()` — frontier size determines available new topics
- `packages/api/src/services/diagnostic.ts` → `materializeMastery()` — controls how many topics start in review queue

**Common root causes:**
1. **Review queue dominance** — too many topics due for review, consuming all session slots. Check if there's a review cap or new-topic minimum guarantee.
2. **~~Diagnostic over-materialization~~** *(partially fixed in 017.7 Phase 7)* — reduced materialization brought ratio from 0.96→0.88. Further reduction may come from FIRe compression.
3. **No minimum new-topic guarantee** — session should always introduce at least N new topics regardless of review queue size.
4. **Frontier exhaustion** — if `computeFrontier()` returns few topics (because prerequisites aren't met), there aren't enough new topics to balance the ratio even with a minimum guarantee. Check frontier size in session events.

**Connection to other systems:** Strongly connected to `fire_compression` (FIRe reduces review load → better ratio) and `mastery_convergence` (faster mastery → topics leave review queue → better ratio). Fix FIRe and mastery convergence first; review/new balance may improve as a side effect.

---

### interleaving (P1)
**What it measures:** Same-strand adjacency rate (consecutive problems on same topic).
**Target:** ≤10%.

**Post-017.7 context:** Reduced materialization caused PASS→FAIL regression (0.071→0.144). Root cause: fewer mastered warmup candidates → less strand diversity at session start → more same-strand adjacency. When review ratio >95%, interleaving is insensitive to shuffle algorithm — reviews of diverse topics naturally intersperse. Fix interleaving AFTER fixing review/new balance.

**Where to look:**
- `packages/api/src/services/session.ts` → `getSessionMix()` topic ordering, warmup candidate selection
- `packages/api/src/services/srs.ts` → warmup pool size (depends on mastered + near-due topics)

**Common root causes:**
1. **Small warmup pool** — after reduced materialization, fewer topics are mastered in `user_topic_state`, so the warmup candidate pool is small. Sessions start with consecutive problems on the same few topics. Check warmup candidate count in session events.
2. **No strand-aware shuffle** — topics are presented in order rather than interleaved.
3. **Review queue overwhelms** — all review topics are the same strand because they were learned together.
4. **Learning loop phases keep same topic** — pretest → instruction → guided → independent is naturally sequential. Adjacency should be measured at topic-transition level, not every event.

**Diagnostic trace:** Read session events for worst-contributing profile. Check strand transitions. If adjacency is clustered at session start (warmup phase), the fix is warmup diversity. If spread throughout, the fix is shuffle algorithm.

---

### fire_compression (P1)
**What it measures:** Review count reduction vs no-FIRe baseline.
**Target:** ≥20% reduction.
**Current:** ~1.2% average (strong-older at +25%, average-older at -12.9%, misconception-fractions at -8.5%).

**Architecture (virtual FSRS reviews):** `applyFIReCredit()` gives encompassed children virtual FSRS reviews when a parent is reviewed successfully. Calls `repeat(card, Rating.Good)` and interpolates the stability increase by encompassing weight. Updates `stability`, `due`, `lastReview` — keeps FSRS state coherent. Skips children with retrievability > 0.9 (too fresh) and children not in FSRS Review state. Previous due-date extension approach was abandoned because it caused FSRS to interpret longer gaps as memory decay, producing negative compression. Upward penalty (`applyUpwardPenalty`) is disabled — it has no research basis in the FIRe model and produced net negative compression by generating more reviews than FIRe saved for struggling profiles.

**Where to look:**
- `packages/api/src/services/srs.ts` → `applyFIReCredit()` (virtual FSRS reviews), `compressReviews()` (greedy set-cover session selection)
- `content/*/graph.json` → encompassing edge density (more edges = more credit opportunities)
- `docs/content-system.md` §4 → weight assignment rubric and encompassing design guide

**Common root causes:**
1. **~~Diagnostic over-materialization~~** *(fixed in 017.7 Phase 7)* — materializing ALL topics below placement filled the review budget. Now only placement-and-above topics are materialized.
2. **~~Due-date extension model~~** *(fixed: replaced with virtual FSRS reviews)* — extending `due` without updating `lastReview`/`stability` caused FSRS to interpret longer gaps as memory decay, increasing review frequency.
3. **~~Upward penalty~~** *(fixed: disabled)* — `applyUpwardPenalty()` pulled parent due dates closer on child failure. No research basis in FIRe model. Produced net negative compression for struggling profiles (penalty-driven reviews exceeded FIRe credit savings). Remediation routing handles prerequisite gaps instead.
4. **~~Non-Review state virtual reviews~~** *(fixed: State.Review filter)* — Virtual FSRS reviews on Learning/Relearning/New state cards produced 0 or negative stability changes. Now skipped.
5. **Insufficient encompassing density** — FIRe credit scales with the number of encompassing edges. Current graph has only 15 edges for 71 topics (target 1.0-2.0 edges/topic). Cross-strand edges provide the most compression value. Check `graph.json` encompassing count. **This is the primary remaining bottleneck.**
6. **Weight accuracy** — Inaccurate weights mean virtual reviews over- or under-credit stability. Audit weights using the rubric in `docs/content-system.md` §4.
7. **Review pool too small** — FIRe compression = `1 - (fire_reviews / baseline_reviews)`. If few non-mastered topics are due for review, even good credit doesn't compress many reviews.

**Evaluation note:** FIRe compression runs paired simulations by default (~10s). Use `--skip-fire` only when iterating on non-FIRe metrics.

---

### remediation_routing (P0)
**What it measures:** Remediation events for misconception profiles.
**Target:** ≥5 events in 15 sessions.

**Where to look:**
- `packages/api/src/services/session.ts` → remediation trigger conditions

**Common root causes:**
1. **Trigger only fires in specific phase** — remediation should trigger on accumulated failures across any phase, not just independent practice.
2. **Accumulated failure tracking not implemented** — no counter tracking consecutive failures on prerequisite concepts.
3. **Prerequisite lookup returns empty** — the graph query for prerequisites of the failing topic returns no results (graph not loaded, or edges missing).

---

### presentation_drift (P2)
**What it measures:** Profiles drifting in expected direction and stabilizing.
**Target:** ≥6 of 10 profiles.

**Where to look:**
- `packages/api/src/services/content.ts` → `nudgeDistribution()`, `DRIFT_RATES`, EMA + hysteresis

**Common root causes:**
1. **Drift rate too small** — weights change too slowly to converge in 15 sessions. Check `DRIFT_RATES` constants.
2. **No smoothing/dampening** — weights oscillate instead of converging. Check for EMA or momentum in the update logic.
3. **No hysteresis on center level** — center level flips back and forth between adjacent levels. Need a minimum delta before shifting center.
4. **Conflicting signals** — remediation pushes presentation down while high accuracy pushes up. The stronger signal should win.

---

### diagnostic_placement (P2)
**What it measures:** All profiles placed within ±1 grade of expected.
**Target:** 10 of 10.

**Where to look:**
- `packages/api/src/services/diagnostic.ts` → binary search bounds, convergence

**Common root causes:**
1. **searchLow only ratchets up** — search bounds don't correctly narrow from both directions.
2. **Premature convergence** — converges at MIN_QUESTIONS before enough data to place correctly.
3. **One-way presentation seeding** — only seeds presentation downward, not upward for advanced students.

---

### cognitive_demand_entropy (P2)
**What it measures:** Shannon entropy of cognitive demand distribution across problems.
**Target:** ≥0.90 bits.

**Where to look:**
- `packages/api/src/services/session.ts` → problem selection
- Content files → cognitive demand tags on problems

**Common root causes:**
1. **No demand-aware selection** — problems selected purely by difficulty/topic without considering cognitive demand type.
2. **Content skewed toward procedural** — most problems tagged as "procedural" or "recall", few "analytical" or "transfer". Fix requires content generation, not engine changes.
3. **Missing demand tags** — problems without cognitive demand tags default to one type, artificially reducing entropy.

**Note:** If the root cause is content-skewed, this is a content issue (signal_source: "content"), not an engine fix. Document it and flag for Plan 018 content generation.

---

## Iteration State Tracking

Track progress within the current healing session:

```
Systems attempted: []
Systems fixed: []
Systems failed: []
Systems skipped: []
Fix count: 0
Max fixes: 3 (or --max value)
```

After each fix+verify cycle:
- Add to `fixed` or `failed` list
- If `fix count >= max`: checkpoint and report
- If user says "continue": increase max and proceed
- If user says "stop": checkpoint with current progress

---

## Key Project Conventions

When making fixes, follow these project conventions:
- Services are factory functions: `createXService(db)` returning method objects
- Strict TypeScript, no `any` — use `unknown` and narrow
- Early returns over nested conditionals
- `type` over `interface`
- Run `just test` (never `pnpm vitest run` directly)
- Tests in co-located `__tests__/` directories, `*.test.ts` naming
- Content is source of truth in `content/` — D1 is disposable
- Simulations use `simulations/src/` tooling with justfile recipes
