# Assessment System

Multi-topic assessments for standards-based reporting. Implemented in Plan 030.

## Overview

Assessment sessions are **separate from learning sessions**. They measure current mastery across multiple topics and produce a scored, reportable result. They do not affect SRS state (FSRS scheduling).

```
Assessment flow:
  startAssessment(userId, config)
    → select N problems across M topics/strands
    → AssessmentItem[] (no hints, no scaffolding)
  submitAnswer(sessionId, itemId, answer)
    → graded locally by grading.ts
  finishAssessment(sessionId)
    → AssessmentResult (score, strand breakdown, standards alignment)
```

## Architecture

### Service

`packages/api/src/services/assessment.ts` — `createAssessmentService(db, contentBucket)`

**Key methods:**
- `startAssessment(userId, config)` — creates session, selects items via 7-tier ranking
- `submitAnswer(sessionId, itemId, answer)` — grades with `gradeProblem()`, records to `assessment_sessions_items`
- `finishAssessment(sessionId)` — aggregates scores, calls `recordAssessmentResult()`

### Schema

```sql
assessment_sessions       -- header: userId, config, status, score, startedAt, finishedAt
assessment_session_items  -- per-item: topicId, problemId, answer, correct, score, gradedAt
```

### Routes

`packages/api/src/routes/assessment.ts`
- `POST /api/assessment/start`
- `POST /api/assessment/:sessionId/answer`
- `POST /api/assessment/:sessionId/finish`
- `GET  /api/assessment/:sessionId/result`
- `GET  /api/assessment/history`

## Scoring Model

**Item score:** Same `gradeProblem()` as learning sessions. Multi-step items use partial credit (fraction of correct steps).

**Session score:** `sum(itemScores) / itemCount` → 0.0–1.0

**Strand breakdown:** Items grouped by `standardCode` domain. Each strand reported with score, item count, and component standards.

**Standards alignment:** Topics with `standardCode` (e.g., `K.CC.4`) are mapped to CCSS Math domain labels. Topics without a standard code are grouped under "Other".

## Assessment Configuration

```typescript
type AssessmentConfig = {
  scope: {
    type: "comprehensive" | "strand" | "standard" | "topic-set";
    strandIds?: string[];
    standardCodes?: string[];
    topicIds?: string[];
  };
  questionCount?: number;  // default: 10
};
```

**Comprehensive**: samples from all assessable topics (those with `standardCode`), balanced across strands.

**Strand/Standard**: targets specific curriculum areas, useful for focused practice check-ins.

**Topic-set**: explicit list, useful for teacher-assigned assessments.

## Item Selection

Items are selected using the same 7-tier content ranking as learning sessions, but with assessment-specific constraints:
- No lesson-phase items (examples only)
- Problems only (`assessment_content`)
- No scaffolding, no hints provided at runtime
- Prefer topics the user has seen before (mastery signal is more meaningful)

## Standards Service

`packages/api/src/services/standards.ts` — `createStandardsService(db)`

Aggregates FSRS mastery state into standards-based reports.

**Key methods:**
- `getStandardsReport(userId, subject)` — domain → standards → topics hierarchy with mastery %
- `recordAssessmentResult(userId, result)` — persists assessment outcome for history

**Parsing:** CCSS Math format only (`K.CC.4` → grade K, domain CC, standard 4). Non-Math codes pass through with raw code as domain label.

**Domain proficiency:** A domain is "proficient" when ≥80% of its standards are proficient. A standard is "proficient" when ≥80% of its topics are mastered.

## Audit Integration

The audit system (Section 9: `assessmentHealth`) reports:
- Topics with `standardCode` (assessable topics)
- Unique standards count
- Average topics per standard
- Status: `ok` when ≥50% of topics have standard codes, `warning` otherwise

Run `just audit` to see the assessment health section.

## Simulation Mode

The learner simulation runner supports `--mode assessment` to verify assessment sessions work correctly after a simulated learning period:

```bash
npx tsx audit/learner-simulations/src/cli.ts --profile average-older --sessions 10 --mode assessment
```

This runs 10 learning sessions then triggers `runAssessmentVerification()`, which logs:
- Assessment score vs. mastery percentage (correlation check)
- Strand coverage (expect ≥2 strands for a 10-question comprehensive assessment)

## Learning Session Architecture (Plan 031)

Learning sessions use a **pull-based atomic model**. Each `startSession()` call covers exactly one topic — the system picks the highest-priority work item via `getNextItem()`:

```
Priority 1: { type: "assessment" }   ← system-triggered checkpoint (Plan 031 Phase 4)
Priority 2: { type: "review" }       ← SRS-scheduled retrieval (R dropped below threshold)
Priority 3: { type: "lesson" }       ← first encounter with a frontier topic
Priority 4: { type: "complete" }     ← nothing due, nothing new
```

The frontend calls `startSession()` after each unit completes — this is the pull loop. Each session progresses through one topic's phase sequence (lesson → independent → review → remediation) via `respond()` calls, then returns `{ type: "complete" }`.

Prerequisite-direction FIRe credit (`applyPrereqCredit`) runs automatically after qualifying correct reviews, extending mastered prerequisites' stability without explicit review. See `docs/fire.md` for details.

## Relationship to Learning Sessions

| Dimension | Learning Session | Assessment Session |
|-----------|-----------------|-------------------|
| Goal | Acquire/reinforce mastery | Measure current mastery |
| Items | lesson + independent + review | problems only |
| Scaffolding | hints, worked examples | none |
| FSRS effect | yes — updates scheduling | no — read-only |
| Output | next topic unlocked | score + standards report |
| Storage | `learn_sessions`, `review_log` | `assessment_sessions`, `assessment_session_items` |
