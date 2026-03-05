# Research

Investigation results, comparisons, and findings. Append-only.

Distinct from:
- LEARNINGS.md (gotchas, insights)
- DECISIONS.md (choices made)

---

## 2026-03-03: Learning science synthesis (from ~/source/mathacademy-graph/analysis.md)

Key principles driving the platform design:

- **Mastery learning:** Students must demonstrate mastery before advancing. Knowledge graph enforces prerequisite chains.
- **Spaced repetition (FSRS):** Optimally schedules reviews to maximize long-term retention.
- **Pretesting:** Brief pretest before instruction primes schemas and improves subsequent learning (even when students fail the pretest).
- **Worked example effect + fading:** Start with full worked examples, gradually remove scaffolding as competence grows.
- **Self-explanation:** Having students explain *why* each step works deepens understanding.
- **Interleaving:** Mix topics in practice sessions rather than blocking by topic.
- **Metacognitive calibration:** Confidence ratings help students develop self-awareness of their knowledge.
- **FIRe (Fractional Implicit Repetition):** Practicing a composite skill implicitly reviews component sub-skills, reducing total review burden.

---

## 2026-03-04: Runtime LLM Architecture — API Calls vs Agent Harness

**Source:** User session

**Context:** The MVP uses direct OpenRouter API calls for three LLM functions: self-explanation evaluation (Haiku), Socratic tutoring (Sonnet), and response grading (Haiku). Each is a single-turn or short-history call with structured JSON output. As the platform grows, the question is whether to evolve toward an agent architecture.

**Question:** Should the LLM integration remain as discrete API calls, or evolve into a stateful agent harness?

**Findings:**

| Approach | Pros | Cons |
|----------|------|------|
| **Discrete API calls** (current) | Simple, predictable cost, easy to reason about, works on Workers (no long-running processes) | No cross-turn memory, can't adapt teaching strategy mid-session, each call is independent |
| **Stateful agent harness** | Could maintain tutoring context across a full session, adapt strategy based on student behavior patterns, richer interactions | Higher latency, much higher cost per session, complex state management, may need Durable Objects or external runtime |
| **Hybrid: API calls + session context injection** | Keep current simplicity but inject session history (recent responses, struggle areas) into system prompts | Moderate complexity increase, token cost grows with context, stays within Workers constraints |

**Conclusion:** The hybrid approach is the pragmatic next step. The current three LLM functions work well as API calls. Enrich them by injecting session context (last N responses, current struggle areas, mastery level) into system prompts. A full agent harness is premature until there's evidence that single-turn calls are insufficient for learning outcomes. Revisit if/when multi-turn tutoring conversations become a priority.

**Implications:**
- Keep `createLLMService` as the integration pattern
- Add session context parameters to `socraticTutor` and `evaluateExplanation`
- Consider a `studentProfile` summary injected into system prompts
- Durable Objects only needed if real-time streaming tutoring becomes a goal

---

## 2026-03-04: Content Pipeline Architecture — Multi-Subject Expansion

**Source:** User session

**Context:** The MVP has 71 Math K-5 topics with offline-generated problems and worked examples (JSON files in `content/math-k5/`). The pipeline uses Claude Code to generate content, validation scripts to verify completeness, and an import tool to load into D1. How should this scale to multiple subjects and content types?

**Question:** What architecture supports adding new subjects (Math 6-12, Reading, Science) and content types (video scripts, interactive games)?

**Findings:**

| Dimension | Current State | Scaling Needs |
|-----------|--------------|---------------|
| **Graph structure** | Single `graph.json` with subjects/topics/prerequisites/encompassings | Per-subject graph files, cross-subject prerequisites (e.g., reading comprehension needed for word problems) |
| **Content types** | Problems (JSON) + Worked Examples (JSON) | + Video scripts, interactive simulations, game templates, adaptive hints |
| **Generation pipeline** | Ad-hoc Claude Code prompts | Structured pipeline: schema → prompt template → generate → validate → review → import |
| **Validation** | `validate-content.ts` and `validate-graph.ts` | Per-content-type validators, cross-reference validation (problem references valid topics, examples match problem types) |
| **Storage** | Flat files in `content/math-k5/` | `content/<subject>/` directories, versioned content with migration support |

**Proposed architecture:**
1. **Subject packs** — Each subject is a self-contained directory: `content/<subject>/graph.json`, `problems/`, `examples/`
2. **Content schema** — Formal JSON schemas for each content type, validated at generation time
3. **Generation templates** — Reusable prompt templates parameterized by subject, grade level, and learning objectives
4. **Import pipeline** — Generalized `import-content.ts` that discovers and imports all subject packs
5. **Cross-subject graph** — Optional cross-subject prerequisite edges (e.g., "Reading Comprehension" → "Word Problems")

**Implications:**
- Current `tools/` scripts need parameterization by subject
- DB schema already supports multiple subjects via `subjects` table
- Graph validation needs cycle detection across cross-subject edges
- Content generation cost scales linearly with topic count (~$2-5 per topic for problems + examples)

---

## 2026-03-04: Post-MVP Capabilities Assessment

**Source:** User session

**Context:** The SPEC lists several non-goals for MVP that represent future capability areas. Assessing feasibility, complexity, and priority for each.

**Question:** Which post-MVP capabilities should be prioritized, and what do they require?

**Findings:**

| Capability | Complexity | Dependencies | Priority |
|------------|-----------|--------------|----------|
| **Math 6-12** | Medium | Content pipeline scaling, more complex problem types (algebra, geometry require diagram support) | High — natural next subject, reuses all existing infrastructure |
| **Reading/ELA** | High | New content types (passages, comprehension questions), different assessment model (not just right/wrong) | Medium — different enough to stress-test the architecture |
| **Parent/Teacher Dashboard** | Medium | New role system, read-only views of child progress, possibly separate auth flow | High — critical for K-5 audience where parents set up accounts |
| **Speech/TTS** | Medium | External API integration (e.g., ElevenLabs, browser Web Speech API), audio player UI | Low — nice-to-have for young learners, but not blocking |
| **Social/Leaderboards** | Low-Medium | Anonymized comparison metrics, streak tracking, achievement system | Low — fun but not pedagogically critical |
| **Adaptive Learning Paths (RL)** | Very High | Requires significant data collection first, ML pipeline, possibly separate inference service | Future — need months of user data before this is viable |
| **Interactive Simulations** | High | Canvas/WebGL components, per-topic custom UI, significant frontend work | Medium — high impact for geometry/measurement topics |

**Recommended next epics (in priority order):**
1. **Parent Dashboard + Role System** — Enables the target audience (K-5 parents) to manage children's accounts and monitor progress
2. **Math 6-12 Content Expansion** — Doubles the platform's scope with minimal architecture changes
3. **Enhanced LLM Tutoring** — Session context injection, streaming responses, hint system
4. **Reading/ELA Subject** — Validates the multi-subject architecture

---

## 2026-03-04: Enhanced LLM Tutoring — Architecture Design

**Source:** Plan 004, Phase 1 research
**Status:** Complete

### 1. Current LLM Service Audit

The LLM integration in `packages/api/src/services/llm.ts` has **three stateless methods** plus usage tracking:

| Method | Purpose | Tier | ~Input Tokens | ~Output Tokens | ~Cost/call |
|--------|---------|------|---------------|----------------|------------|
| `evaluateExplanation` | Grade self-explanation of worked example step | Haiku | 250 | 50 | $0.0004¢ |
| `socraticTutor` | Socratic guidance for stuck students | Sonnet | 300-700 | 40 | $0.0015¢ |
| `gradeResponse` | Grade free-text against correct answer | Haiku | 280 | 40 | $0.0004¢ |
| `getUsage` | Usage analytics (DB query only) | — | — | — | — |

**Key findings:**
- All three LLM endpoints are defined in routes but **not yet called from frontend** — ProblemView uses client-side matching, WorkedExample has no evaluate button, no tutor button exists
- `socraticTutor` accepts `conversationHistory` param (multi-turn ready) but no UI supports it
- No streaming support anywhere
- `llm_usage` table tracks user/model/tokens/cost/purpose but **no topicId or problemId** — limits analytics
- Budget enforcement exists (per-family monthly limit) but no 80% warning threshold
- Hints are flat `string[]` in Problem schema — no levels or progression

### 2. Session Context Injection Design

**Goal:** Inject ~300-500 tokens of student context into LLM system prompts so the tutor adapts to the individual.

#### Student Profile Format

A `buildStudentProfile()` function queries DB and returns a compact text block:

```
STUDENT PROFILE:
- Topic: {topicName} (Grade {gradeLevel})
- Mastery: {state} ({reps} reviews, {lapses} lapses, stability {stability})
- Session: {totalCorrect}/{totalAttempts} correct, phase: {currentPhase}
- Recent struggles: {last 3 incorrect review_log entries: topic, rating, responseMs}
- Pace: {avg responseMs over last 5 attempts}ms avg response time
- Confidence calibration: {confidenceAccuracy or "not enough data"}
```

**Token budget:** ~150-200 tokens for the profile block.

**Data sources:**

| Field | Source Table | Query |
|-------|-------------|-------|
| Mastery state | `user_topic_state` | WHERE userId AND topicId |
| Recent struggles | `review_log` | WHERE userId ORDER BY createdAt DESC LIMIT 5, filter correct=false |
| Session stats | `learnSessions.stateJson` | Current active session |
| Confidence calibration | `user_topic_state.confidenceAccuracy` | Same as mastery |
| Topic metadata | `topics` | JOIN for name, gradeLevel |

**Injection points:**

| Method | Where to inject | How it helps |
|--------|----------------|--------------|
| `socraticTutor` | Append to system prompt after rules | Tutor adapts language complexity, references specific struggle areas, adjusts pacing |
| `evaluateExplanation` | Append to system prompt | Evaluator calibrates expectations to student's level, gives appropriate feedback |
| `gradeResponse` | Not injected (stateless grading is fine) | Correctness is objective — context doesn't help |

**Token impact:**
- `socraticTutor`: 300 → 500 input tokens (+67%), cost increase negligible (~$0.0006¢)
- `evaluateExplanation`: 250 → 400 input tokens (+60%), cost increase negligible
- Total context budget: **500 tokens max** (hard limit, truncate oldest struggles first)

#### Implementation Approach

1. Add `buildStudentProfile(db, userId, topicId)` to llm service (or as a helper)
2. `socraticTutor` and `evaluateExplanation` call it before constructing messages
3. Profile text appended to system prompt: `\n\n${studentProfile}`
4. Profile is regenerated per-call (no caching — data changes between calls)

### 3. Hint Progression Model

**Goal:** Multi-level hints that scaffold without giving answers. Each level reveals more, tracked for SRS impact.

#### Hint Levels

| Level | Name | Description | Source | Token Cost |
|-------|------|-------------|--------|------------|
| 1 | **Nudge** | Conceptual reminder — "Think about what multiplication means" | Static (from problem `hints[0]`) | 0 (no LLM) |
| 2 | **Guiding Question** | Leads toward the approach — "What happens when you group 3 sets of 4?" | Static (from problem `hints[1]`) or LLM-generated | 0 or ~40 |
| 3 | **Partial Reveal** | Shows the first step of the solution | LLM-generated from solution + "reveal only the first step" | ~60 |
| 4 | **Worked Step** | Full worked step with explanation | LLM-generated from solution + student context | ~100 |

**Design decisions:**
- Levels 1-2 use **static hints** from the problem bank when available (zero cost)
- Levels 3-4 are **LLM-generated** only when requested (cost-conscious)
- If problem has no static hints, Level 1 is LLM-generated (cheap tier)
- Each level builds on previous — Level 3 prompt includes what Level 1-2 said

#### Escalation Rules

```
Request hint:
  if hintsUsed == 0 → Level 1 (nudge)
  if hintsUsed == 1 AND timeSinceLastHint > 30s → Level 2
  if hintsUsed == 1 AND timeSinceLastHint <= 30s → "Try thinking about it a bit more first"
  if hintsUsed == 2 → Level 3 (always, student is stuck)
  if hintsUsed == 3 → Level 4 (full scaffolding)
  if hintsUsed == 4 → Show full solution, mark as "assisted"
```

**Time gate:** 30-second minimum between Level 1→2 prevents rapid hint consumption without thought.

#### Hint API Design

```typescript
// POST /api/llm/hint
type HintRequest = {
  userId: string;
  topicId: string;
  problemId: string;
  problemQuestion: string;
  problemSolution: string;
  staticHints: string[];       // from problem.hints[]
  currentHintLevel: number;    // 0-3 (what they've seen so far)
  studentResponse?: string;    // what they've tried
};

type HintResponse = {
  level: number;               // 1-4
  hint: string;                // the hint text
  source: "static" | "llm";   // was LLM called?
  isMaxLevel: boolean;         // true if this is the last hint before solution
};
```

#### SRS Scheduling Impact

Hint usage affects the FSRS rating passed to the SRS scheduler:

| Hints Used | Rating Adjustment | Rationale |
|------------|-------------------|-----------|
| 0 | No change | Student solved independently |
| 1 (nudge only) | No change | Minimal help, still demonstrates understanding |
| 2 (guiding question) | Cap at "Good" (3) | Needed directional help |
| 3 (partial reveal) | Cap at "Hard" (2) | Significant scaffolding needed |
| 4 (worked step) | Force "Again" (1) | Essentially shown the answer — needs review |

**Tracking:** Add `hintsUsed: number` to `review_log` entries (new column, nullable for backwards compat). The SRS service reads this when calculating the next review interval.

#### Token Budget for Hints

| Scenario | LLM Calls | Input Tokens | Output Tokens | Cost |
|----------|-----------|-------------|---------------|------|
| Student uses 1 static hint, solves | 0 | 0 | 0 | $0 |
| Student uses 2 static hints, solves | 0 | 0 | 0 | $0 |
| Student needs Level 3 (LLM) | 1 Haiku call | ~300 | ~60 | $0.0005¢ |
| Student needs all 4 levels | 2 Haiku calls | ~600 | ~120 | $0.001¢ |
| Worst case per problem | 2 | ~600 | ~120 | $0.001¢ |

### 4. Implementation Path (Phases 2-4)

**Phase 2 — Session Context Injection:**
1. Add `buildStudentProfile()` helper in `llm.ts`
2. Inject into `socraticTutor` and `evaluateExplanation` system prompts
3. Wire up frontend to actually call LLM endpoints (tutor button, evaluate button, LLM grading toggle)

**Phase 3 — Streaming:**
1. Add `stream: true` option to OpenRouter `call()` method
2. New `/api/llm/tutor-stream` SSE endpoint using Hono's streaming response
3. Vue `StreamingText` component with progressive text reveal
4. Fallback: if streaming fails, degrade to non-streaming call

**Phase 4 — Progressive Hints:**
1. Add `hintsUsed` column to `review_log`
2. Implement `/api/llm/hint` endpoint with level progression logic
3. Hint UI in ProblemView: "Need a hint?" button, progressive reveal, hint counter
4. Wire `hintsUsed` into SRS rating adjustment

### 5. Open Questions

- **Multi-turn tutoring UI:** `socraticTutor` already supports conversation history. Should Phase 3 streaming also enable a chat-like UI, or keep it single-turn with streaming?
  - **Recommendation:** Keep single-turn for Phase 3. Multi-turn chat UI is a Phase 4+ enhancement if data shows students benefit from extended conversations.
- **LLM hint generation quality:** Need to test whether Haiku produces good partial reveals without leaking the full answer. May need to use Sonnet for Level 3-4 hints if Haiku over-reveals.
  - **Recommendation:** Start with Haiku, add a `hintModelOverride` config option if quality is insufficient.
