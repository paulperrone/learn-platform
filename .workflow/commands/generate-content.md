# /generate-content — Content Generation Workflow

Generate problems, worked examples, or full content for a subject. Encodes discipline-specific rules, quality gates, and verification loops.

## Arguments

```
/generate-content <subject>
/generate-content <subject> --graph-only
/generate-content <subject> --problems-only
/generate-content <subject> --examples-only
/generate-content <subject> --lessons-only
/generate-content <subject> --dry-run
```

- `<subject>`: Subject directory name in `learn-content` repo (e.g., `math`, `ela`, `history`)
- `--graph-only`: Only design/update the knowledge graph (`graph.json`)
- `--problems-only`: Only author problems for existing topics
- `--examples-only`: Only author worked examples for existing topics
- `--lessons-only`: Only author lessons for existing topics
- `--dry-run`: Describe what would be generated without writing files

## Workflow

### 1. Load Subject Context

```bash
cat ../learn-content/$SUBJECT/graph.json | head -20   # Get subjectId, disciplineId, progressionModel
just content-status $SUBJECT                  # Current health
just content-gaps $SUBJECT                    # Known gaps
```

Read `graph.json` to detect discipline and progression model. If the subject directory doesn't exist, you're creating a new subject — ask for discipline and grade range.

### 2. Detect Discipline & Select Workflow

Read `progressionModel` from `graph.json` (or from the discipline definition):

| Progression Model | Discipline Examples | Workflow |
|---|---|---|
| `mastery-gated` | math, CS, grammar | Procedural generators (if applicable) + LLM supplementary |
| `context-layered` | history, philosophy | LLM-only, multi-depth content |
| `flexible` | vocabulary, geography | LLM-only, recall-based |

### 3. Execute Discipline-Specific Workflow

#### 3a. Mastery-Gated (Math, CS, Grammar)

**Graph rules:**
- All prerequisite edges MUST be `type: "required"` unless there's an explicit reason for `recommended`
- Depth levels map to skill progression — each level builds directly on the previous
- Content at depth N can assume mastery of all content at depths 0 through N-1

**Problem generation:**
1. Check if procedural generators exist (`tools/generators/index.ts` registry)
2. For topics with generators: `just generate-problems --topic <topic-id> --count 50 --seed 42`
3. For topics without generators or below 20 total problems: LLM-author supplementary problems
   - 15 per topic, mix of conceptual/application/reasoning/error-analysis demands
   - All get `"source": "supplementary"` in JSON
4. If generators were run AND supplementary content was added, re-run generators to ensure generated files weren't overwritten

**Difficulty distribution:** 30% easy / 40% medium / 30% hard

**Cognitive demand targets by grade:**
- K-2: 60% procedural, 20% conceptual, 15% application, 5% reasoning
- 3-5: 40% procedural, 20% conceptual, 20% application, 15% reasoning, 5% error-analysis
- 6-8: 30% procedural, 20% conceptual, 20% application, 20% reasoning, 10% error-analysis

#### 3b. Context-Layered (History, Philosophy)

**Graph rules:**
- Most prerequisite edges should be `type: "recommended"` (60-75%)
- Use `type: "required"` sparingly (5-10%) — only for truly foundational skills
- Use `type: "enriching"` for cross-era/thematic connections (20-30%)
- Graph depth: 3-5 (shallow — breadth-first progression)

**Problem generation (LLM-only):**
1. **Survey depth** (all topics): "What happened?" — recall, sequencing, identification
   - Easy: single-fact recall, Medium: connect 2 facts, Hard: sequence/compare
2. **Contextual depth** (anchor topics): "Why did it happen?" — causes, effects, perspectives
   - Use rubric-based scoring (1-4 scale) where appropriate, not just right/wrong
   - Include `typeProperties: { rubric: [...] }` for rubric-scored items
3. All problems get `"source": "hand-authored"`

**Presentation levels:** Author at 2+ levels per topic:
- `intermediate` (ages 8-10) and `standard` (ages 11-14) minimum
- Adapt vocabulary and engagement style, NOT analytical sophistication

#### 3c. Flexible (Vocabulary, Geography)

**Graph rules:**
- Most edges should be `type: "enriching"`
- Topics are largely independent — order matters little

**Problem generation (LLM-only):**
- Recall-based: definitions, identification, matching
- All problems get `"source": "hand-authored"`

### 4. Platform-Medium Constraints (ALL Disciplines)

Every problem and example MUST work on a screen with text input only. NEVER include:

- Physical actions: "hold up fingers", "point to", "touch each", "use your hands"
- Drawing/crafting: "draw a", "sketch", "cut out", "fold"
- Speaking: "say aloud", "read out loud"
- Physical objects: "use blocks", "get a ruler", "use manipulatives"

These patterns are checked by `just validate-content`. If you generate content with these patterns, the validation step will catch them.

### 5. Author Worked Examples

For every topic, generate 2+ worked examples with step-by-step breakdowns:

```json
{
  "id": "<topic-id>-ex1",
  "topicId": "<topic-id>",
  "title": "Example title",
  "presentation": "<from topic defaultPresentation>",
  "contentDepth": "<from topic contentDepth>",
  "locale": "en",
  "flavor": "classic",
  "steps": [
    {
      "subgoalLabel": "Step label",
      "instruction": "What to do",
      "work": "The actual work shown",
      "explanation": "Why this step works"
    }
  ]
}
```

Save to `../learn-content/<subject>/examples/<topic-id>.json`.

### 5b. Author Lessons

For every topic, generate 1+ lesson with 3+ sections. A lesson is the primary teaching vehicle — it replaces standalone worked examples as the instruction delivery mechanism. Worked examples are now one section type within a lesson.

**Structure per discipline:**

**Mastery-gated (math, CS):**
```
explanation → worked-example → practice (2-3 problems)
```
Explanation teaches the core concept concisely. Worked example demonstrates the procedure. Practice lets them try with the lesson visible.

**Context-layered (history, philosophy):**
```
explanation (multi-depth treatment) → primary sources/perspectives → practice
```

**Flexible (vocabulary, geography):**
```
explanation (definition + context) → practice
```

**Lesson JSON format:**

```json
[
  {
    "id": "<topic-id>-lesson-1",
    "topicId": "<topic-id>",
    "title": "Lesson title",
    "presentation": "<from topic defaultPresentation>",
    "contentDepth": "<from topic contentDepth>",
    "locale": "en",
    "flavor": "classic",
    "sections": [
      {
        "type": "explanation",
        "title": "Section title",
        "content": "Prose text teaching the concept. Markdown supported."
      },
      {
        "type": "worked-example",
        "title": "Example title",
        "content": "Introduction text for the example.",
        "example": {
          "id": "<topic-id>-ex-lesson",
          "topicId": "<topic-id>",
          "title": "Example title",
          "steps": [
            { "subgoalLabel": "Step", "instruction": "What to do", "work": "Result", "explanation": "Why" }
          ]
        }
      },
      {
        "type": "practice",
        "title": "Try It",
        "content": "Practice what you've learned.",
        "problems": [
          { "id": "...", "topicId": "...", "question": "...", "answer": "...", "hints": [...], "solution": "..." }
        ]
      }
    ]
  }
]
```

Save to `../learn-content/<subject>/lessons/<topic-id>.json`.

See `docs/lesson-format.md` for the full schema reference.

**Quality gates:**
- Every topic must have at least 1 lesson with 3+ sections
- Lessons must start with an explanation and end with practice
- All text follows platform-medium constraints
- Dimension fields match topic defaults

### Dimension Field Rules

Every problem MUST include these dimension and metadata fields:
- `cognitiveDemand` — appropriate demand type (see §16 of content-system.md)
- `source` — `"hand-authored"` for Claude Code sessions, `"generated"` for procedural generators, `"supplementary"` for LLM gap-fill
- `type` — `"text-qa"` default, or appropriate `AssessmentType`
- `presentation` — match the topic's `defaultPresentation` from graph.json
- `contentDepth` — match the topic's `contentDepth` from graph.json
- `locale` — `"en"` unless generating localized content
- `flavor` — `"classic"` unless generating themed content

Every worked example MUST include:
- `presentation` — match the topic's `defaultPresentation` from graph.json
- `contentDepth` — match the topic's `contentDepth` from graph.json
- `locale` — `"en"` unless generating localized content
- `flavor` — `"classic"` unless generating themed content

### 6. Post-Generation Verification Loop

Run these in sequence. Fix any issues and re-validate until clean:

```bash
just validate-content        # DAG integrity, platform constraints, field validation
just content-status $SUBJECT # Per-topic health scores — flag topics below threshold
just content-gaps $SUBJECT   # Ranked gap list — fill highest-impact gaps first
just visualize $SUBJECT      # Visual inspection of graph structure
```

**Quality gates (must all pass before phase is complete):**
- `just validate-content`: 0 errors, 0 warnings
- All topics have 5+ problems (20+ for math computation topics)
- All topics have 2+ worked examples
- Difficulty distribution within 10% of targets
- Cognitive demand distribution appropriate for grade level
- No platform-incompatible instructions

**Optional: LLM content review** (recommended for new topics):
```
/content-review $SUBJECT --topic <topic-id>   # Review specific topic
```
Review findings for answer correctness, prerequisite assumptions, difficulty calibration. Fix any errors before proceeding.

### 7. Import

```bash
just import-content   # Load into local D1 — verify source column populated
```

## File Locations

| Content | Path |
|---|---|
| Knowledge graph | `../learn-content/<subject>/graph.json` |
| Hand-authored problems | `../learn-content/<subject>/problems/<topic-id>.json` |
| Generated problems | `../learn-content/<subject>/problems-generated/<topic-id>.json` |
| Worked examples | `../learn-content/<subject>/examples/<topic-id>.json` |
| Lessons | `../learn-content/<subject>/lessons/<topic-id>.json` |
| Procedural generators | `tools/generators/` |
| Validation | `tools/validate-content.ts`, `tools/validate-graph.ts` |

## Source Tracking

Every problem JSON must include a `source` field for DB provenance:

| Source Value | Meaning |
|---|---|
| `"hand-authored"` | Original content written by human or LLM in Claude Code session |
| `"generated"` | Procedural generator output (`tools/generators/`) |
| `"supplementary"` | LLM-authored gap-fill content (added to reach coverage targets) |

Legacy problems without a `source` field default to `"hand-authored"` on import.
