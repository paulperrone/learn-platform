# Content Authoring Workflow

Guide to creating, validating, and importing content for the learn platform.

## Quick Start

```bash
# Create content for a new subject using the Claude Code command
/generate-content <subject>

# Check content health for an existing subject
/content-health <subject>
/content-health --all
```

The `/generate-content` command is the canonical workflow. It encodes discipline-specific rules, quality gates, and post-generation verification. Follow the prompts.

## Overview

Content flows through this pipeline:

```
Design graph → Author problems → Author examples → Validate → Import → Visualize
```

All content authoring happens in **Claude Code sessions**. OpenRouter is reserved for runtime tutoring/grading only.

## Content Structure

```
content/<subject>/
  graph.json              # Knowledge graph: topics, prerequisites, encompassings
  problems/<topic>.json   # Hand-authored problems (5+ per topic)
  examples/<topic>.json   # Worked examples (2+ per topic)
  problems-generated/     # Procedural generator output (math only)
```

**Source of truth:** Files in `content/` (committed to git). D1 is a disposable read model rebuilt by `just import-content`.

## Step 1: Design the Knowledge Graph

Create `content/<subject>/graph.json` with:

- **Topics**: id, name, description, gradeLevel, standardCode, strand
- **Prerequisites**: edges between topics (from → to) with type and strength
- **Encompassings**: parent-child edges with weight (for FIRe credit)
- **Metadata**: subjectId, subjectName, disciplineId, gradeRange, progressionModel

### Discipline-Specific Edge Rules

| Discipline | Model | Edge Types | Example |
|-----------|-------|------------|---------|
| Math, ELA, CS | mastery-gated | Almost all `required` | Can't multiply without adding |
| History, Philosophy | context-layered | Mostly `recommended` + `enriching` | WWI enriches WWII study |
| Vocabulary, Geography | flexible | Mostly `enriching` | Latin roots help medical vocab |

### Cross-Subject Prerequisites

Use `subject:topic-id` format in the `from` field:

```json
{ "from": "ela-k5:key-details", "to": "primary-sources-intro", "type": "required", "strength": 0.7 }
```

The import system resolves the prefix. Cross-subject edges should almost always be `required`.

## Step 2: Author Problems

Create `content/<subject>/problems/<topic-id>.json`:

- 5+ problems per topic at 3 difficulty levels (easy/medium/hard)
- Target distribution: 30% easy / 40% medium / 30% hard
- Platform-medium constraints: **screen + text input only**
  - No physical manipulation (fold, cut, hold up fingers)
  - No drawing or pointing
  - No audio-dependent tasks
- Cognitive demand distribution varies by grade level (see `docs/content-system.md`)
- Each problem: id, topicId, difficulty, question, answer, hints[], solution

### For Math: Procedural Generators

Math computation topics can use procedural generators for volume:

```bash
just generate-problems               # Generate for all registered topics
just generate-problems --topic add-within-100 --count 50
```

Output goes to `problems-generated/`. Import merges both directories.

## Step 3: Author Worked Examples

Create `content/<subject>/examples/<topic-id>.json`:

- 2+ examples per topic
- 3-5 steps each with subgoalLabel, instruction, work, explanation
- Strategy-based for comprehension topics (show thinking process)
- Grade-appropriate complexity

## Step 4: Validate

```bash
just validate-content    # DAG integrity, platform constraints, all subjects
just content-status      # Per-topic health scores
just content-gaps        # Ranked gap list by impact
```

Fix all errors before import. Warnings are advisory.

## Step 5: Import and Visualize

```bash
just import-content              # Load all subjects into local D1
just visualize <subject>         # Interactive graph HTML
just visualize                   # Default: math-foundations
```

## Simulation Validation

After content changes, run simulations to verify engine behavior:

```bash
just simulate-all 5 42           # Quick: all profiles, 5 sessions
just simulate-all 30 42          # Full L2: 30 sessions
just evaluate                    # Compare against targets
```

Multi-subject profiles test cross-discipline behavior:
- `multi-math-strong` — K-8 math progression
- `multi-average` — math + ELA interleaving
- `multi-strong-math-weak-ela` — cross-discipline prerequisite blocking
- `multi-history-focus` — context-layered progression
- `multi-all-subjects` — full cross-discipline integration

Use `--subject` flag for single-subject testing:

```bash
npx tsx simulations/src/cli.ts average-older --subject ela-k5 --sessions 10
npx tsx simulations/src/cli.ts average-older --subject math-foundations,math-middle --sessions 30
```

## Adding a New Subject

1. Create `content/<subject>/graph.json` following the discipline model
2. Run `/generate-content <subject>` to author problems and examples
3. Run `/content-health <subject>` to verify
4. Add cross-discipline prerequisite edges if needed
5. Create simulation profiles with `subjects: ["<subject>"]` in `simulations/profiles/`
6. Add profile expectations to `simulations/targets.json`
7. Run `just validate-content && just import-content`
