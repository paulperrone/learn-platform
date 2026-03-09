---
description: Run autonomous training loop — multi-epoch gradient descent on the adaptive engine
allowed-tools: Read, Write, Glob, Grep, Bash, Edit, AskUserQuestion
---

# /train — Autonomous Training Loop

Run an autonomous multi-epoch training loop on the learn-platform adaptive engine. Each epoch: simulate → evaluate → diagnose worst failure → implement fix → verify → check regressions → loop or stop.

**Analogy:** This is gradient descent. Simulations are the forward pass, learning-science targets are the loss function, root-cause diagnosis is backpropagation, code changes are weight updates, and epochs are training iterations.

## Arguments

```
/train                          # Run up to 5 epochs, fix highest-priority failures
/train --epochs N               # Run up to N epochs (default 5)
/train --target <system>        # Focus on a specific system only
/train --dry-run                # Evaluate and report status, don't make fixes
/train --continue               # Resume from previous /train state (reads history)
```

## Prerequisites

Before starting, verify:

```bash
ls simulations/targets.json          # Target definitions exist
ls simulations/src/evaluate.ts       # Evaluation engine exists
ls simulations/src/heal-loop.ts      # Orchestrator exists
just test 2>&1 | tail -5             # Unit tests pass (baseline sanity)
git status --porcelain               # Working tree is clean (for rollback safety)
```

If working tree is dirty, warn: "Uncommitted changes detected. Commit or stash before training to enable safe rollback."

---

## Loop Protocol

### Overview

```
┌─────────────────────────────────────────────────────┐
│                  /train loop                        │
│                                                     │
│  for epoch = 1..N:                                  │
│    1. Run full simulation (30 sessions × all)       │
│    2. Evaluate all systems against targets           │
│    3. Check convergence/stall → stop if met          │
│    4. Select fix target (highest priority, worst δ)  │
│    5. Create restore point (git stash)               │
│    6. Diagnose root cause (playbook + event data)    │
│    7. Implement fix + run unit tests                 │
│    8. Mini-verify on affected profiles               │
│    9. If mini-verify fails → rollback, try alt       │
│   10. Full re-evaluate → check for regressions       │
│   11. If regression → rollback, try alt or skip      │
│   12. Log epoch results                              │
│                                                     │
│  Output: training summary with before/after/delta    │
└─────────────────────────────────────────────────────┘
```

### Step-by-Step

**Step 1: Simulate**
```bash
just heal-epoch 30 42
```
This runs all profiles (30 sessions, seed 42) and evaluates.

**Step 2: Evaluate**
Read `simulations/reports/evaluation.json`. Parse system results into a status table.

If `--target <system>` is set, only consider that system for fixing (but still evaluate all for regression detection).

**Step 3: Check termination conditions**
See [Convergence & Stall Criteria](#convergence--stall-criteria) below.

**Step 4: Select fix target**
Priority ordering:
1. Sort by priority: P0 > P1 > P2
2. Within same priority: sort by normalized delta (worst first)
3. Skip systems with `signal_source: "content"` (these need content generation, not engine fixes)
4. Skip systems already in `failed_approaches` with 2+ failed attempts this session

**Step 5: Create restore point**
```bash
git stash push -m "train-epoch-N-before-<system-id>"
```

**Step 6: Diagnose root cause**
Follow the system-specific playbook from `/heal`:
1. Read `investigationArea` from evaluation JSON (files, functions, events)
2. Inspect simulation events for worst-contributing profile (see `/heal` Step 2)
3. Trace metric through code path
4. Form hypothesis

**Step 7: Implement fix**
1. Make the minimal code change
2. Run `just test` — must pass
3. If tests fail, fix the test issue (don't skip tests)

**Step 8: Mini-verify**
```bash
just heal-verify <system-id> --profiles <contributing-profiles> --sessions 10
```
- **Improved:** Proceed to Step 10
- **Unchanged/regressed:** Go to [Rollback Protocol](#regression-safety-protocol)

**Step 9: Full re-evaluate**
```bash
just heal-epoch 30 42
```
Compare ALL systems against the pre-fix epoch. Check for regressions.

**Step 10: Check regressions**
- Any system moved from PASS → FAIL (other than the fix target): **regression detected**
- Any system's metric worsened by more than its tolerance: **soft regression**
- Regression detected → [Rollback Protocol](#regression-safety-protocol)
- No regression → Log success, proceed to next epoch

**Step 11: Log epoch**
Record in training state:
- System targeted, fix applied, before/after metrics
- Whether fix was successful, rolled back, or skipped

---

## Convergence & Stall Criteria

Check these after every evaluation (Step 3):

| Condition | Detection | Action |
|-----------|-----------|--------|
| **Converged** | All systems PASS or WARN. No FAIL remaining. | Stop. Output success report. Update baselines. |
| **Content-converged** | All remaining FAILs have `signal_source: "content"` | Stop. Report remaining failures as content issues for Plan 018+. |
| **Stalled** | 2 consecutive epochs with: same PASS/FAIL counts AND no metric moved > 5% of its target | Stop. Output stall report with what was tried. |
| **Regression halt** | A fix caused PASS → FAIL on a non-target system, and 2 alternative approaches also regressed | Skip this system. If all remaining systems are skipped, stop. |
| **Max epochs** | Epoch count reached `--epochs N` | Stop. Output progress report with remaining failures. |
| **Context budget** | Conversation approaching context limit (heuristic: >80% used) | Checkpoint progress. Instruct user to run `/train --continue`. |

### Metric movement calculation

For "no metric moved > 5%":
- `higher_better`: movement = `(current - previous) / target`
- `lower_better`: movement = `(previous - current) / target`
- `in_range`: movement = `abs(current - previous) / range_width`

---

## Regression Safety Protocol

### Before each fix

```bash
git stash push -m "train-epoch-N-before-<system-id>"
```

### On regression or failed mini-verify

1. **Rollback:**
   ```bash
   git stash pop
   ```
2. **Log failed approach** in session state:
   ```json
   {
     "system": "interleaving",
     "approach": "increased warmup diversity by sampling from implicit mastery pool",
     "result": "mini-verify unchanged (0.144 → 0.142)",
     "epoch": 2
   }
   ```
3. **Try alternative** (max 2 alternatives per system per training run):
   - Re-diagnose with knowledge of what didn't work
   - Design a different fix approach
   - If 2 alternatives fail: skip this system, move to next
4. **Track failed approaches** to avoid retrying:
   ```
   failed_approaches = {
     "interleaving": [
       { approach: "...", result: "..." },
       { approach: "...", result: "..." }
     ]
   }
   ```

### Multi-system regression

If fixing system A regresses system B:
1. Rollback system A fix
2. Check if system B is higher priority than system A
3. If yes: skip system A (can't fix without breaking more important system)
4. If no: try to find a fix for A that doesn't affect B
5. If no safe fix exists after 2 attempts: skip system A, document the trade-off

---

## Training State

Track progress across epochs within a single `/train` invocation:

```json
{
  "started_at": "2026-03-09T22:00:00Z",
  "max_epochs": 5,
  "target_system": null,
  "epochs_completed": 0,
  "current_status": "running",
  "systems_fixed": [],
  "systems_skipped": [],
  "failed_approaches": {},
  "epoch_snapshots": [
    {
      "epoch": 1,
      "systems": {
        "mastery_convergence": { "actual": 2, "target": 4, "status": "FAIL" },
        "interleaving": { "actual": 0.14, "target": 0.10, "status": "FAIL" }
      },
      "fix_target": "mastery_convergence",
      "fix_result": "improved",
      "fix_description": "increased stability window from 3 to 5 reviews"
    }
  ]
}
```

Save to `simulations/reports/training/train-<timestamp>.json` on completion.

---

## Progress Reporting

### After each epoch

Print a status table:

```
## Epoch 2/5 Complete

| System               | Before | After  | Target | Status | Δ      |
|----------------------|--------|--------|--------|--------|--------|
| mastery_convergence  | 2      | 3      | ≥4     | FAIL   | +1 ↑   |
| mastery_preservation | 8%     | 8%     | ≤10%   | PASS   | —      |
| review_new_balance   | 0.88   | 0.82   | 0.50-0.70 | FAIL | -0.06 ↑|
| interleaving         | 0.14   | 0.14   | ≤0.10  | FAIL   | —      |
| fire_compression     | 8.5%   | 8.5%   | ≥20%   | FAIL   | —      |
| ...                  |        |        |        |        |        |

Fix applied: mastery_convergence — reduced stability threshold in processReview()
Result: metric improved 2 → 3 (target: ≥4). Continuing.
```

### On completion

```
## Training Complete

**Status:** [converged | stalled | max epochs | content-converged]
**Epochs run:** 3 of 5
**Duration:** ~15 min

### Systems Fixed
- mastery_convergence: 2 → 4 (FAIL → PASS) — reduced stability threshold
- review_new_balance: 0.88 → 0.65 (FAIL → PASS) — added new-topic minimum

### Systems Remaining
- interleaving: 0.14 → 0.12 (FAIL) — improved but not converged
- fire_compression: 8.5% (FAIL) — signal_source: bridge, needs content density

### Failed Approaches
- interleaving: 2 approaches tried (warmup diversity, shuffle algorithm) — both insufficient

### Baselines
- Updated simulations/baseline.json
- Updated simulations/regression-baseline.json

### Next Steps
- Run `/train` again if systems remain (may need architectural changes)
- Run `/heal --system interleaving` for manual investigation
- Content density improvements planned in Plan 018
```

---

## Dry Run Mode

`/train --dry-run` runs evaluation only:

1. Run `just heal-epoch 30 42` (or use cached data < 1 hour old)
2. Print status table (all systems, PASS/WARN/FAIL, delta from target)
3. Print fix priority queue (what would be targeted first)
4. Print convergence state
5. Do NOT make any code changes

---

## Continue Mode

`/train --continue` resumes from previous training:

1. Read `simulations/reports/healing/history.json`
2. Load last epoch results
3. Skip systems already in `systems_fixed` or `systems_skipped`
4. Continue epoch counter from where it left off
5. Useful after context compaction or manual investigation breaks

---

## Key Constraints

- **Determinism:** All simulations use `--seed 42` for reproducibility. If a fix doesn't change the metric with the same seed, it genuinely didn't help.
- **Unit tests:** `just test` must pass after every fix. No exceptions.
- **Minimal changes:** Prefer parameter tuning over architectural rewrites. The simplest fix that moves the metric is the best fix.
- **One system per epoch:** Fix ONE system per epoch, then re-evaluate everything. Don't batch fixes — isolate variables.
- **Content vs engine:** Systems with `signal_source: "content"` need content changes (Plan 018+), not engine fixes. Skip them automatically.
- **No `any`:** Strict TypeScript. Use `unknown` and narrow.
- **Factory services:** Services are `createXService(db)` returning method objects.
- **Test runner:** Always `just test`, never `pnpm vitest run` directly.
