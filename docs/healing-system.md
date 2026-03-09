# Healing System

The healing system is a continuous quality assurance loop for the learn-platform's adaptive engine. It treats the engine like a neural network: simulations are the forward pass, learning-science targets are the loss function, root-cause analysis is backpropagation, and code changes are weight updates.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌───────────────────┐
│ targets.json    │────▶│ evaluate.ts  │────▶│ Healing Report    │
│ (loss function) │     │ (comparison) │     │ (PASS/WARN/FAIL)  │
└─────────────────┘     └──────────────┘     └───────────────────┘
                              ▲                       │
                              │                       ▼
                    ┌─────────────────┐     ┌───────────────────┐
                    │ Simulation runs │     │ /heal skill       │
                    │ (forward pass)  │     │ (backprop + fix)  │
                    └─────────────────┘     └───────────────────┘
                              ▲                       │
                              │                       ▼
                    ┌─────────────────┐     ┌───────────────────┐
                    │ heal-loop.ts    │     │ Service code      │
                    │ (orchestrator)  │     │ (weight update)   │
                    └─────────────────┘     └───────────────────┘
```

**Data flow:**
1. `heal-loop.ts` runs simulations for all learner profiles
2. `evaluate.ts` compares simulation results against `targets.json`
3. The healing report identifies PASS/WARN/FAIL for each adaptive system
4. `/heal` skill reads the report, traces root causes, makes targeted fixes
5. Mini-simulation verifies each fix
6. Checkpoint commits progress

### Components

| Component | Path | Role |
|-----------|------|------|
| Targets | `simulations/targets.json` | Loss function: 10 system targets + 12 profile expectations |
| Target types | `simulations/src/types.ts` | TypeScript definitions for the target system |
| Target loader | `simulations/src/load-targets.ts` | Load + validate targets.json |
| Evaluator | `simulations/src/evaluate.ts` | Compare simulation metrics against targets |
| Orchestrator | `simulations/src/heal-loop.ts` | Run epoch cycles: simulate → evaluate → checkpoint |
| Change detector | `simulations/src/detect-changes.ts` | Detect codebase changes that affect targets |
| `/heal` skill | `.claude/commands/heal.md` | AI-in-the-loop: diagnose, fix, verify |
| `/heal-update` skill | `.claude/commands/heal-update.md` | Evolve targets after codebase changes |
| Target docs | `docs/simulation-targets.md` | How targets are derived from learning science |
| Changelog | `simulations/targets-changelog.md` | Version history of target changes |

---

## Running the System

### Quick Start

```bash
# Check system health
just evaluate

# Full heal cycle (simulate + evaluate + report)
just heal-epoch

# AI-assisted healing (diagnose + fix + verify)
/heal

# Verify a manual fix
just heal-verify fire_compression

# Check healing history
just heal-status
```

### Justfile Recipes

| Recipe | Description |
|--------|-------------|
| `just evaluate` | Evaluate latest simulation runs against targets |
| `just evaluate-fire` | Evaluate with FIRe comparison (runs paired simulations) |
| `just heal-epoch` | Full epoch: simulate all profiles × 30 sessions → evaluate → report |
| `just heal-verify <system>` | Mini-simulation to verify a fix for a specific system |
| `just heal-status` | Show healing loop status and epoch history |
| `just heal-checkpoint` | Force a healing checkpoint (commit + report) |

### Manual Workflow

1. Run `just heal-epoch` to produce a fresh evaluation
2. Read `simulations/reports/evaluation.md` for the human-readable report
3. Identify failing systems (sorted by priority)
4. Fix the root cause in service code
5. Run `just test` to verify no unit test breakage
6. Run `just heal-verify <system>` to confirm the metric improved
7. Repeat for each failing system
8. Run `just heal-checkpoint` to commit progress

### AI-Assisted Workflow

Run `/heal` in a Claude Code session. It automates steps 2-7 above:
- Reads evaluation data and prioritizes failures
- Uses system-specific playbooks to trace root causes
- Makes targeted code changes
- Verifies with mini-simulations
- Checkpoints after fixing N systems (default 3)

---

## Target System

### How Targets Work

Each target represents a measurable property of the adaptive engine, grounded in learning science research. Targets have:

- **Metric**: What is measured (e.g., mastery convergence count)
- **Target value**: Expected result (e.g., ≥6 of 8 non-struggling profiles)
- **Tolerance**: Acceptable variance (±1)
- **Direction**: `higher_better`, `lower_better`, or `in_range`
- **Priority**: P0 (system broken without), P1 (degrades quality), P2 (optimization)
- **Signal source**: `engine` (simulation-validated), `content` (advisory), `bridge` (both)

See `docs/simulation-targets.md` for the full derivation methodology.

### The 10 Adaptive Systems

| System | Priority | Signal | Target | Description |
|--------|----------|--------|--------|-------------|
| mastery_convergence | P0 | engine | ≥4/8 profiles | Non-struggling reach 50% mastery |
| mastery_preservation | P0 | engine | ≤10% loss | Diagnostic mastery retained in session 1 |
| remediation_routing | P0 | engine | ≥5 events | Misconception profiles get remediation |
| difficulty_targeting | P1 | bridge | ≥7/10 profiles | Rolling accuracy in [0.80, 0.90] |
| review_new_balance | P1 | engine | [0.50, 0.70] | Review ratio across sessions |
| interleaving | P1 | engine | ≤10% adjacency | Same-strand adjacency rate |
| fire_compression | P1 | engine | ≥20% reduction | FIRe review compression |
| presentation_drift | P2 | engine | ≥6/10 stable | Presentation center stabilizes |
| diagnostic_placement | P2 | engine | 10/10 within ±1 | Diagnostic places accurately |
| cognitive_demand_entropy | P2 | bridge | ≥0.90 bits | Shannon entropy of demand distribution |

### Reading Evaluation Output

**JSON** (`simulations/reports/evaluation.json`):
```json
{
  "systems": [{
    "systemId": "mastery_convergence",
    "status": "PASS",
    "actual": 7,
    "target": 6,
    "delta": 1,
    "investigationArea": { "files": [...], "functions": [...] }
  }],
  "summary": { "passCount": 8, "warnCount": 1, "failCount": 1 }
}
```

**Status meanings:**
- **PASS**: Metric meets or exceeds target (within tolerance)
- **WARN**: Metric is within tolerance band but below target
- **FAIL**: Metric is outside tolerance band

---

## Evolution & Maintenance

### When to Run `/heal-update`

Run `/heal-update` after:
- Completing a plan that modifies adaptive systems
- Adding new content (subjects, question types)
- Changing FSRS parameters or session configuration
- Adding new learner profiles
- Before running `/heal` if significant changes have been made

### How It Works

1. **Detect changes** — `simulations/src/detect-changes.ts` analyzes git history since the last healing epoch, categorizes changes (service, schema, content, simulation, config), and maps them to affected targets
2. **Assess impact** — For each changed file, determines which targets are affected based on `source_files` in `targets.json`
3. **Propose updates** — Presents structured diffs for target value adjustments, new targets, or profile updates
4. **Apply with approval** — Updates `targets.json`, bumps version, appends to changelog

### Target Versioning

`targets.json` has a `version` field (integer, bumped on each update). All changes are recorded in `simulations/targets-changelog.md` with:
- What changed
- Why the update was needed
- What triggered the change (plan reference, code change, etc.)

### Expansion Checklists

When adding new subjects, question types, or cross-discipline prerequisites, `/heal-update` walks through a structured checklist:

**New subject:**
1. Identify discipline type (mastery-gated, context-layered, flexible)
2. Create subject-specific learner profiles
3. Add profile expectations to targets.json
4. Add discipline-specific targets if needed
5. Run baseline simulation and evaluation

**New question type:**
1. Check cognitive demand distribution impact
2. Verify answer-engine.ts compatibility
3. Update content quality thresholds if needed

**FSRS parameter changes:**
1. Re-derive stability-based targets
2. Run baseline with new parameters
3. Temporarily widen tolerances, tighten after 2-3 epochs

### Signal Source Rules

Every target must have a `signal_source`:
- **`engine`**: Validated by simulations, fixed via `/heal`
- **`content`**: Advisory only until live-data feedback pipeline exists
- **`bridge`**: Both engine and content contribute

Content-signal targets produce advisory warnings, not FAIL, until the live-data pipeline is built.

---

## Troubleshooting

### Stalled Healing Loop

**Symptom:** No system improved in 2+ consecutive epochs.

**Diagnosis:**
1. Run `just heal-status` to see epoch history
2. Check if fixes are actually being applied (review git log)
3. Check if the failing metric is a content issue (`signal_source: "content"`) — engine fixes won't help

**Resolution:**
- If engine issue: try a different fix approach, or escalate for architectural review
- If content issue: flag for content generation (Plan 018+)
- If target is miscalibrated: run `/heal-update` to adjust the target

### False PASS/FAIL

**Symptom:** System reports PASS but behavior is wrong (or FAIL but behavior is correct).

**Diagnosis:**
1. Check the metric computation in `evaluate.ts` — is it measuring what it claims to?
2. Check the target value in `targets.json` — is it derived correctly from learning science?
3. Check the tolerance band — too wide masks real issues, too narrow creates false failures

**Resolution:**
- Fix metric computation if the measurement is wrong
- Adjust target value if the expectation is wrong (use `/heal-update`)
- Adjust tolerance if variance is higher/lower than expected

### Simulation Errors

**Symptom:** Simulation crashes or produces incomplete data.

**Diagnosis:**
1. Run `just simulate-all --sessions 5` for a quick test
2. Check for schema mismatches (content imported vs code expectations)
3. Check `simulations/src/db-setup.ts` for hardcoded DDL that may be stale

**Resolution:**
- Run `just db-generate && just db-migrate && just import-content` to sync
- Update `db-setup.ts` DDL if schema changed (see LEARNINGS.md)

### How to Adjust Targets

When research findings change or the system architecture evolves:
1. Review `docs/simulation-targets.md` for derivation methodology
2. Use `/heal-update` to propose changes
3. Bump version and document in `simulations/targets-changelog.md`
4. Run a full epoch to validate: `just heal-epoch`

### When to Involve the User

The system should iterate autonomously when:
- The fix is parameter tuning (changing constants)
- The fix is within a single service file
- No other system regresses

Escalate to the user when:
- Multiple fix attempts on the same system fail
- A fix regresses another system
- The fix requires an architectural decision
- The target itself appears wrong
- Two systems conflict (trade-off needed)
