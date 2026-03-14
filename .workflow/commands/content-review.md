# /content-review — LLM Content Review

Review content quality using Claude Code sonnet subagents against a codified rubric. Evaluates 7 criteria including answer correctness, prerequisite assumptions, difficulty calibration, worked examples, cognitive demand, dimension alignment, and topic atomicity.

## Arguments

```
/content-review                              # Review all disciplines
/content-review <discipline>                 # Review one discipline
/content-review <discipline> --topic <id>    # Review single topic
/content-review <discipline> --strand <name> # Review one strand
/content-review --force                      # Ignore cache, re-review everything
```

## Workflow

### 1. Assemble Context

```bash
# Determine scope from arguments
DISCIPLINE="${1:-all}"  # first arg or "all"
```

Use the context assembler to gather topic data:

```typescript
import { assembleTopicContext, assembleReviewBatch, listDisciplines } from "audit/content/review-context.js";
```

- Single topic: call `assembleTopicContext(topicId, discipline)`
- Batch: call `assembleReviewBatch(discipline, { strand })` or iterate all disciplines via `listDisciplines()`

Run the context assembler CLI to get JSON:
```bash
npx tsx audit/content/review-context.ts --discipline <disc> [--strand <name>] [--topic <id>]
```

### 2. Check Cache

```typescript
import { isFull, getCache } from "audit/content/review-cache.js";
```

For each topic in the assembled context:
- If `isFull(topicId, discipline, contentHash)` and `--force` was NOT passed → skip (already reviewed 3 times)
- Otherwise → include in review queue

Report: "X topics to review, Y already cached (skipping)"

### 3. Read the Rubric

Read `audit/content/review-rubric.md` — this is the full rubric that reviewers apply.

### 4. Review Topics

**Single topic (no subagent):**
If only 1 topic to review, evaluate it directly against the rubric. Produce a `TopicReview` object.

**Batch (sonnet subagents):**
Split topics into batches of ~10. For each batch, spawn a **sonnet subagent**:

```
Agent(subagent_type="general-purpose", model="sonnet", prompt=`
You are reviewing educational content for a mastery-learning platform.

## Rubric
${rubricContent}

## Topics to Review
${JSON.stringify(batchContexts)}

For each topic, evaluate against all 7 criteria and produce:
{
  "topicId": "...",
  "discipline": "...",
  "timestamp": "${new Date().toISOString()}",
  "findings": [ReviewFinding, ...],
  "overallGrade": "A" | "B" | "C" | "D" | "F",
  "summary": "1-2 sentence summary",
  "contentHash": "..."
}

Return a JSON array of TopicReview objects, one per topic.
`)
```

### 5. Cache Results

For each `TopicReview` returned by subagents:

```typescript
import { appendReview } from "audit/content/review-cache.js";
appendReview(review.topicId, review.discipline, review);
```

### 6. Generate Report

After all reviews are cached, generate aggregate reports:

```typescript
import { loadAllCached, aggregateFindings } from "audit/content/review-cache.js";
```

Write JSON report: `audit/reports/content-reviews/{discipline}-report.json`
Write markdown summary: `audit/reports/content-reviews/{discipline}-report.md`

The markdown report should include:
- **Grade distribution table** (A/B/C/D/F counts)
- **High-confidence findings** (appeared in 2+ review runs)
- **Worst topics** (D/F grades with top findings)
- **Recurring issues by criterion** (most common error/warn findings)
- **Recommendations** (what to fix first)

### 7. Present Summary

Print a concise summary:
- Topics reviewed, grade distribution
- High-confidence issues count
- Top 5 worst topics with their grades and primary issues
- "Review the full report at `audit/reports/content-reviews/{discipline}-report.md`"
- "Approved findings can be fed into `/generate-content` for targeted fixes."

## Guidelines

- **Human-in-the-loop**: This produces a report. The user reviews findings, approves or rejects them, then feeds actionable findings into `/generate-content`. No auto-fix.
- **Batch size**: 10 topics per subagent. Each topic ~50KB of context.
- **Cache behavior**: Up to 3 reviews per content hash. Findings in 2+ runs = "high confidence", 1 run = "low confidence".
- **Grounding**: Reviewers evaluate against declared metadata, NOT graph position or derived properties.
- **Criterion 7 (atomicity)**: Absorbed from the standalone `/atomicity-audit`. Assesses topic scope using description, prerequisites, encompassing edges, and problem diversity.
- **Progression models**: Mastery-gated expects clear right/wrong; context-layered allows rubric-based scoring; flexible has minimal prerequisites.
