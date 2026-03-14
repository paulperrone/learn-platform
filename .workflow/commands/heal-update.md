---
description: Analyze codebase changes and update healing system targets, profiles, and evaluation logic
allowed-tools: Read, Write, Glob, Grep, Bash, Edit, AskUserQuestion
---

# /heal-update — Update Healing System

Analyzes recent codebase changes and proposes updates to targets, profiles, and evaluation logic. Ensures the healing system stays current as the platform evolves.

## When to Run

- After completing a plan that adds/modifies adaptive systems
- After adding new content (subjects, question types)
- After changing FSRS parameters or session logic
- Before running `/heal` if significant changes have been made since last heal
- After adding new learner profiles

## Arguments

```
/heal-update                    # Full analysis: detect changes, propose updates
/heal-update --check            # Just check for staleness, don't propose changes
/heal-update --expand <subject> # Run expansion checklist for a new subject
```

## Prerequisites

```bash
ls audit/learner-simulations/targets.json          # Target definitions exist
ls audit/learner-simulations/src/detect-changes.ts # Change detection exists
ls audit/learner-simulations/src/evaluate.ts       # Evaluation engine exists
```

---

## Workflow

### Step 1: Detect Changes

Run change detection to understand what's different since the last healing epoch:

```bash
npx tsx audit/learner-simulations/src/detect-changes.ts
```

Read the output. It will show:
- Git changes since last heal epoch (categorized by area)
- Which adaptive systems are potentially affected
- Whether targets.json is stale relative to code changes

**If `--check`:** Print staleness summary and stop.

### Step 2: Analyze Impact

For each detected change, determine the impact:

1. **Service code changes** (`packages/api/src/services/`)
   - Read the diff to understand what behavior changed
   - Map changed functions to affected targets (use `source_files` in `targets.json`)
   - Determine if target values need adjustment or if new targets are needed

2. **Schema changes** (`packages/api/src/db/schema.ts`)
   - New tables/columns may indicate new features needing new targets
   - Modified columns may change metric computation

3. **Content changes** (`content/`)
   - New subjects need the expansion checklist (Step 5)
   - New topics may change topic counts in existing targets
   - New question types may need new cognitive demand targets

4. **Simulation changes** (`audit/learner-simulations/`)
   - New profiles need profile expectations added to `targets.json`
   - Changed profiles may need updated expectations
   - Changed evaluation logic should be reviewed for correctness

5. **Configuration changes** (FSRS parameters, session config)
   - May shift expected values for mastery, review scheduling, and convergence targets

### Step 3: Propose Updates

For each proposed change, present a structured diff:

```
## Proposed Target Updates

### 1. [system-id]: Adjust target value
- **Reason:** [What code change necessitates this]
- **Current:** target=X, tolerance=Y
- **Proposed:** target=X', tolerance=Y'
- **Derivation:** [How the new value was calculated, citing learning science if applicable]
- **Risk:** [What could break if this is wrong]

### 2. New Target: [system-id]
- **Reason:** [What new capability needs a target]
- **Full entry:** [JSON for new target definition]
- **signal_source:** engine | content | bridge
```

### Step 4: Apply Updates (with user approval)

After presenting all proposals, ask: "Apply these updates? (y/n/partial)"

For each approved update:
1. Update `audit/learner-simulations/targets.json` with new/modified targets
2. Bump the `version` field
3. Update `lastUpdated` and `lastUpdatedReason`
4. Create new profile files in `audit/learner-simulations/profiles/` if needed
5. Update `audit/learner-simulations/src/evaluate.ts` if new metric computation is needed
6. Append to `audit/learner-simulations/targets-changelog.md`
7. Run `npx tsx audit/learner-simulations/src/load-targets.ts` to validate the updated targets

### Step 5: Expansion Checklists

**If `--expand <subject>` or new subject detected:**

Run the appropriate checklist based on discipline type.

#### Adding a New Subject (all disciplines)

1. Identify discipline type from `content/<subject>/graph.json` → look for `discipline` and `progressionModel`
2. Create subject-specific profiles in `audit/learner-simulations/profiles/`:
   - At minimum: strong, average, struggling variants with ability curves for the new content
   - Set appropriate misconceptions for the subject domain
3. Add profile expectations to `audit/learner-simulations/targets.json` `profile_expectations`
4. Check if discipline type introduces new evaluation dimensions:
   - **Mastery-gated:** Standard targets apply. Verify prerequisite graph is strict.
   - **Context-layered:** Add `depth_progression` target (students advance through survey → contextual → analytical). Adjust mastery thresholds (softer gates). Consider rubric-based scoring targets.
   - **Flexible:** Lower mastery gate thresholds. Add recall-accuracy targets. Remove hard prerequisite targets.
5. Update `evaluate.ts` if new metrics are needed
6. Run baseline simulation with new profiles: `just simulate-all --sessions 30`
7. Run evaluation to verify targets: `just evaluate`

#### Adding a New Question Type

1. Check if the type affects cognitive demand distribution (update `cognitive_demand_entropy` target if needed)
2. Check if it changes difficulty calibration expectations (update `content_quality` thresholds)
3. Verify `audit/learner-simulations/src/answer-engine.ts` can handle the new type
4. Update content quality thresholds if the type has different accuracy expectations

#### Adding Cross-Discipline Prerequisites

1. Create cross-discipline profiles (e.g., strong in math, weak in reading)
2. Add prerequisite enforcement targets if they don't exist
3. Verify FIRe credit works across discipline boundaries
4. Add interleaving targets for cross-discipline topic mixing

#### Modifying FSRS Parameters

1. Re-derive stability-based targets (mastery threshold, review intervals)
2. Run baseline simulation to establish new expected values
3. Increase tolerance bands temporarily (parameter changes increase variance)
4. After 2-3 healing epochs with new parameters, tighten tolerances back

---

## Signal Source Rules

Every target in `targets.json` must have `signal_source`:

- **`engine`** — Validated by simulations, fixed via `/heal`. Examples: mastery convergence, interleaving, difficulty targeting.
- **`content`** — Advisory only until live-data pipeline exists. Examples: cognitive demand entropy (when root cause is content skew), difficulty calibration.
- **`bridge`** — Partially validated by simulations, partially by content quality. Examples: difficulty targeting (engine selects, but content must span the range).

When adding new targets:
- Default to `engine` if the metric is fully controlled by service code
- Use `content` if fixing requires content generation (Plan 018+)
- Use `bridge` if both engine and content contribute to the metric

Content-signal targets should output advisory warnings, not FAIL status, until the live-data feedback pipeline is built.

---

## Key Project Conventions

- Services are factory functions: `createXService(db)` returning method objects
- Strict TypeScript, no `any`
- Run `just test` (never `pnpm vitest run` directly)
- Target derivation methodology is documented in `docs/simulation-targets.md`

- Every target must cite a learning science finding or architectural requirement
