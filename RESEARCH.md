# Research

Investigation results, comparisons, and findings. Append-only.

Distinct from:
- LEARNINGS.md (gotchas, insights)
- DECISIONS.md (choices made)
- **docs/learning-science.md** — Comprehensive learning science reference (primary reference for pedagogy decisions)

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

**Full reference:** See `docs/learning-science.md` for the comprehensive distillation of "The Math Academy Way" (Skycak, 2026), mathacademy.com pedagogy, and independent learning science research — 20 sections covering every principle, with key numbers, citations, and platform implications.

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

**Context:** The MVP has 71 Foundational Mathematics topics with offline-generated problems and worked examples (JSON files in `content/math-foundations/`). The pipeline uses Claude Code to generate content, validation scripts to verify completeness, and an import tool to load into D1. How should this scale to multiple subjects and content types?

**Question:** What architecture supports adding new subjects (Math 6-12, Reading, Science) and content types (video scripts, interactive games)?

**Findings:**

| Dimension | Current State | Scaling Needs |
|-----------|--------------|---------------|
| **Graph structure** | Single `graph.json` with subjects/topics/prerequisites/encompassings | Per-subject graph files, cross-subject prerequisites (e.g., reading comprehension needed for word problems) |
| **Content types** | Problems (JSON) + Worked Examples (JSON) | + Video scripts, interactive simulations, game templates, adaptive hints |
| **Generation pipeline** | Ad-hoc Claude Code prompts | Structured pipeline: schema → prompt template → generate → validate → review → import |
| **Validation** | `validate-content.ts` and `validate-graph.ts` | Per-content-type validators, cross-reference validation (problem references valid topics, examples match problem types) |
| **Storage** | Flat files in `content/math-foundations/` | `content/<subject>/` directories, versioned content with migration support |

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

---

## 2026-03-05: OpenRouter Management API for Provisioned Keys

**Source:** User session (Plan 004, Phase 6 research)
**Status:** Complete

### Context

Phase 6 requires each family to get its own OpenRouter API key for billing isolation. Investigated the OpenRouter Management API to understand key lifecycle, billing, and limitations.

### API Overview

Base URL: `https://openrouter.ai/api/v1/keys`
Auth: Management API key (created in OpenRouter dashboard > Settings > Provisioning) as Bearer token. Management keys **cannot** call completion endpoints — they're admin-only.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/keys` | Create key (returns raw key string — only time it's available) |
| GET | `/api/v1/keys` | List keys (paginated, 100/page) |
| GET | `/api/v1/keys/{hash}` | Get single key by hash |
| PATCH | `/api/v1/keys/{hash}` | Update key (name, limit, disabled, limitReset) |
| DELETE | `/api/v1/keys/{hash}` | Delete key |
| GET | `/api/v1/key` | Introspect current key (any key, not just management) |

### Create Key Request

```typescript
{
  name: string;                          // Required. Display name.
  limit?: number | null;                 // Spending limit in USD. null = unlimited.
  limitReset?: "daily" | "weekly" | "monthly" | null;  // Reset cadence. null = never.
  includeByokInLimit?: boolean;          // Whether BYOK counts against limit.
  expiresAt?: string | null;             // ISO 8601 expiry (set-once, not updatable).
}
```

### Create Key Response

```typescript
{
  key: string;       // Raw API key (sk-or-v1-...) — ONLY returned here, never again
  data: {
    hash: string;    // Unique ID for all subsequent operations
    name: string;
    limit: number | null;           // USD
    limitRemaining: number | null;  // USD
    limitReset: string | null;
    usage: number;                  // Total all-time USD usage
    usageMonthly: number;           // Current month USD
    disabled: boolean;
    createdAt: string;
    // ... other fields
  }
}
```

### Key Design Facts

1. **Limits are in USD** (not cents, not tokens). `limit: 5.00` = $5.00/month cap.
2. **`key` string only returned at creation** — store it immediately and securely.
3. **Keys identified by `hash`** after creation — safe to store in DB.
4. **Billing flows to parent account** — provisioned keys draw from the platform account's credits.
5. **`expiresAt` is set-once** — can only be set at creation, not updated.
6. **No model scoping** — keys cannot be restricted to specific models. Must enforce at app layer.
7. **Limit resets at midnight UTC** — daily, weekly (Mon-Sun), or monthly.

### Implications for Implementation

- Store `hash` in org metadata (safe, non-secret). Store raw `key` encrypted or in a secrets table.
- Convert family `monthlyBudgetCents` to USD for OpenRouter API: `limit = monthlyBudgetCents / 100`.
- Use `limitReset: "monthly"` for family keys.
- Disable key (PATCH `disabled: true`) on family deletion rather than DELETE to preserve usage records.
- Need `OPENROUTER_MANAGEMENT_KEY` env var separate from `OPENROUTER_API_KEY`.
- Internal `llm_usage` table still tracks per-user telemetry regardless of which key is used.

### Security Considerations

- Raw provisioned keys are secrets — don't store in plaintext metadata.
- Consider encrypting with a derived key from `BETTER_AUTH_SECRET` or storing in a dedicated encrypted column.
- Management key has full control over all provisioned keys — protect it carefully.

---

## 2026-03-04: Speech Controls — TTS & STT Technology Assessment

**Source:** Plan 005, Phase 1 research
**Status:** Complete

### Context

K-5 learners (especially K-2) can't read fluently. Speech controls are critical: TTS to read problems aloud, STT for verbal answers. Evaluated browser-native APIs, Cloudflare Workers AI, and external services. Also reviewed the existing `~/source/assistant` project which has a production Cloudflare Workers AI Whisper implementation.

### 1. Text-to-Speech (TTS) — Browser Compatibility Matrix

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| SpeechSynthesis API | Full | Full | Full | Full |
| Voice count | 20-30+ | 20+ (system) | 3-5 | 20-30+ |
| Voice quality | Good (Google voices) | Good (Apple voices) | Basic | Good |
| `voiceschanged` event | Required (async) | Sync getVoices() | Sync | Required |
| Rate/pitch control | Yes | Yes | Yes | Yes |
| Sentence boundary events | Yes | Partial | Partial | Yes |

**Assessment:** SpeechSynthesis is well-supported across all target browsers. Voice quality is good on Chrome and Safari (our primary targets). Voices are OS/browser-dependent — need runtime selection logic. No child-specific voices in standard API, but rate/pitch adjustment helps.

**Math pronunciation challenge:** SpeechSynthesis reads raw text, so "3 + 5 = ?" reads as "three plus five equals question mark." Need a math-to-speech text converter (e.g., "×" → "times", "÷" → "divided by", "?" → "what").

### 2. Speech-to-Text (STT) — Technology Comparison

| Approach | Accuracy (children) | Browser Support | Cost | Latency | Privacy |
|----------|---------------------|-----------------|------|---------|---------|
| **Web Speech API (SpeechRecognition)** | Fair — trained on adult speech, struggles with children's voices | Chrome + Edge only. Safari partial. No Firefox. | Free | Low (streaming) | Poor — audio sent to Google/Apple servers, no control |
| **Cloudflare Workers AI Whisper** (`@cf/openai/whisper-large-v3-turbo`) | Good — Whisper v3 handles diverse speakers well | All browsers (record → upload) | $0.00051/min | 1-3s per clip | Good — audio stays in CF infrastructure |
| **Deepgram Nova 3** | Excellent — dedicated child speech models available | All browsers (record → upload) | ~$0.0059/min | <1s (streaming) | Good |
| **OpenAI Whisper API** | Good | All browsers | $0.006/min | 2-5s | Good |
| **Browser-local (Transformers.js)** | Good (Whisper) | WebGPU required | Free | 10-30s for 30s clip | Excellent — local |

### 3. Existing Pattern: Assistant Project STT

The `~/source/assistant` project has a proven Cloudflare Workers AI Whisper implementation:

**Architecture:**
```
Browser (MediaRecorder, WebM/Opus) → FormData upload → Hono API → CF Workers AI Whisper → text
```

**Key implementation details:**
- **Frontend:** `VoiceMicButton.vue` — uses `navigator.mediaDevices.getUserMedia()`, records WebM with Opus codec via MediaRecorder, uploads as FormData
- **Backend:** Separate `stt-worker` using `@cf/openai/whisper-large-v3-turbo` via AI binding. Audio converted to base64, passed to `env.AI.run()`
- **Auth:** Bearer token between services
- **Error handling:** Graceful fallback when STT unavailable, 60s timeout, empty transcription detection
- **Cost:** ~$0.00051/min, free tier covers ~200+ min/day

**Adaptation for learn-platform:** Since our API already runs on Cloudflare Workers, we can call Workers AI **directly from the existing Worker** using the AI binding — no need for a separate STT worker. Simpler architecture.

### 4. Recommended Approach

#### TTS: Browser-native SpeechSynthesis API

**Why:**
- Free, zero latency, works offline
- Supported on Chrome + Safari (our primary targets)
- Good enough quality for reading math problems aloud
- No API calls, no cost scaling with usage

**Implementation plan:**
- `useSpeech.ts` composable wrapping SpeechSynthesis
- Math-to-speech text converter for notation
- Voice selection preferring high-quality system voices
- Rate control (slower for K-2, adjustable in settings)

#### STT: Cloudflare Workers AI Whisper (same pattern as assistant project)

**Why:**
- Proven pattern in our stack — assistant project uses it in production
- Works on ALL browsers (no SpeechRecognition API dependency)
- $0.00051/min is effectively free at our scale
- Better accuracy for children's voices than Web Speech API
- Audio stays in Cloudflare infrastructure (better privacy than Web Speech API which sends to Google)
- Can add AI binding to existing Worker — no separate service needed

**Why NOT Web Speech API for STT:**
- Chrome/Edge only — excludes Safari (a primary target for iPad-using families)
- Audio sent to Google servers with no control
- Trained primarily on adult speech
- Flaky across browsers, well-documented Safari issues

**Why NOT Deepgram/OpenAI:**
- 10x more expensive than CF Workers AI for same quality tier
- Adds external dependency when we're already on Cloudflare

### 5. Implementation Architecture

```
┌─────────────────────────────────┐
│  Browser                        │
│  ┌───────────┐  ┌────────────┐ │
│  │ useSpeech │  │useDictation│ │
│  │ (TTS)     │  │ (STT)      │ │
│  │ Browser   │  │ MediaRec → │ │
│  │ SpeechSyn │  │ FormData   │ │
│  └───────────┘  └─────┬──────┘ │
└─────────────────────────┼───────┘
                          │ POST /api/speech/transcribe
                          ▼
┌─────────────────────────────────┐
│  Cloudflare Worker (existing)   │
│  Hono API                       │
│  ┌────────────────────────────┐ │
│  │ env.AI.run(                │ │
│  │  '@cf/openai/whisper-      │ │
│  │   large-v3-turbo',        │ │
│  │  { audio: base64 }        │ │
│  │ )                          │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

**Key difference from assistant project:** No separate STT worker. The AI binding is added directly to the existing Worker's `wrangler.toml`:
```toml
[ai]
binding = "AI"
```

### 6. Cost Projection

| Feature | Usage Estimate (per student/day) | Cost |
|---------|----------------------------------|------|
| TTS (browser) | Unlimited | $0 |
| STT (Whisper) | ~20 problems × 5s each = ~1.7 min | $0.00087 |
| STT monthly (30 days, 100 students) | ~5,100 min | $2.60 |

At scale (1,000 students): ~$26/month. Well within CF Workers AI free tier for early growth.

### 7. Open Questions

- **Audio format optimization:** WebM/Opus works well for Whisper. Consider if shorter clips (per-answer vs continuous recording) improve accuracy for young learners.
- **Number word conversion quality:** Need to test how well children say numbers ("twenty-three" vs "two three") and tune conversion logic.
- **Noise handling:** Classroom/home environments may be noisy. Whisper's VAD preprocessing option may help.

---

## 2026-03-05: Comprehensive learning science reference created

**Source:** "The Math Academy Way" (Skycak, 2026), mathacademy.com/pedagogy, independent learning science research, PhysicsGraph (physicsgraph.com).

Created `docs/learning-science.md` — a 20-section reference document distilling all learning science principles relevant to platform design. Covers: Bloom's Two-Sigma, working memory/cognitive load, knowledge graph design, mastery learning, worked examples/fading, retrieval practice, FSRS spaced repetition, FIRe credit, interleaving, self-explanation, pretesting, confidence calibration, AI tutoring, targeted remediation, automaticity, motivation/SDT, habit formation, assessment design, content design guidelines, and key numbers/thresholds.

Key numbers for quick reference: 85% optimal success rate (Wilson et al., 2019), 7:1 active-to-passive ratio, 95% first-attempt pass rate target, ~1 explicit review per topic with FIRe, 20-30% fewer reviews with FSRS vs SM-2.

**Status:** Complete. Living document — update as new research or platform experience warrants.

---

## 2026-03-05: PhysicsGraph — peer platform analysis

**Source:** physicsgraph.com, @JeffreyBiles Twitter updates (Aug 2025 - Feb 2026)

**What they are:** Knowledge graph + spaced repetition platform for AP Physics. Founded by Jeffrey Biles. Similar architecture to Math Academy but for physics.

**Key observations:**
- ~200 topics in Physics 1 knowledge graph, 10 units
- Content velocity improved from 2 days/topic to ~1.14 days/topic between first two units
- Notable question types beyond multiple choice: numerical input, equation input, graph drawing, matching, dynamic select, multi-step, Free Response Questions (FRQs)
- FRQs use AI grading for point-by-point feedback (mimics AP exam format)
- Curriculum rewrite after student feedback: shorter/clearer lessons, more tikz diagrams and manim animations, Engelmann's Direct Instruction framework for sequencing, smoother difficulty curves
- Diagnostic test identifies knowledge frontier before course start
- Pricing: $29/mo core, $99/mo test prep (FRQs + practice tests)
- Growth: purely word-of-mouth + Twitter, MRR growing month-over-month
- B2B deal signed (Alpha School partnership)
- Team: 3 people (founder + physicist + content creator)

**Relevance to us:**
- Validates the knowledge graph + mastery learning approach for non-math subjects
- Their curriculum rewrite validates "fix the content, not the standard" principle
- Question type diversity (beyond multiple choice) improves retrieval practice depth — short-answer g=0.70 vs MC g=0.48
- FRQ/free-response format is relevant for future Reading/ELA content (constructed responses)
- Their content velocity improvements offer a benchmark for our content pipeline
- SSR for marketing/explore pages is important for growth (they invested in this)

**Status:** Complete. Monitor for future updates.

---

### 2026-03-09: FIRe Compression Bottleneck Analysis

**Source:** User session

**Context:** FIRe compression was showing -10.5% average (net negative — MORE reviews with encompassings). Needed to isolate whether the issue was architectural, content density, or evaluation methodology.

**Question:** Why does enabling encompassing edges increase total reviews instead of decreasing them? Is graph density enough to fix this?

**Findings:**

Investigation isolated four independent factors contributing to negative compression:

| Factor | Impact | Status |
|--------|--------|--------|
| Due-date extension (old approach) | FSRS interpreted longer gaps as decay → more reviews | Fixed (virtual FSRS reviews) |
| Upward penalty (`applyUpwardPenalty`) | Parent due dates pulled closer on child failure → more reviews for struggling profiles | Fixed (disabled, no research basis) |
| Non-Review state virtual reviews | FSRS Learning/New states produce 0 or negative stability from Good rating | Fixed (State.Review filter) |
| Low encompassing density | 15 edges / 71 topics (0.21/topic) — too few for meaningful compression | Content gap, needs 1.0-2.0/topic |

Key discoveries:
- **Paired evaluation is reliable**: SimulationRunner seeds Math.random (for FSRS fuzz) with a separate seeded PRNG. Both paired runs are deterministic. Earlier suspicion of fuzz noise was incorrect.
- **Upward penalty was the largest single factor**: Removing it swung compression from -10.5% to +1.2% average. misconception-fractions went from -33.8% to -8.5%.
- **strong-older proves mechanism works**: +25% compression (only profile that rarely fails → no penalty drag, and enough encompassing edges touch its review pool).
- **New-topic inflation exists but is secondary**: When `compressReviews` frees review slots, those become new topic introductions creating future review debt. Attempted fix (capping new topic count) made results worse — reverted.

**Conclusion:** The architecture is sound after the three code fixes. Remaining gap to 20% target is a content problem (encompassing graph density), not an engine problem. Need ~71-142 encompassing edges (1.0-2.0 per topic) with emphasis on cross-strand edges for maximum compression value.

**Status:** Superseded — further analysis (2026-03-10) identified binary mastery as the primary structural bottleneck, not just graph density. See "Graduated Mastery & FIRe Structural Analysis" below.

---

### 2026-03-10: Graduated Mastery & FIRe Structural Analysis

**Source:** User session

**Context:** After fixing FIRe's due date bug (Phase 1, -3.1% → +8.4%) and interleaving measurement (Phase 2), FIRe compression was still FAIL at -1.1% on latest evaluation. Needed to understand why compression remains flat despite good encompassing density (1.77 edges/topic).

**Question:** Why does FIRe compression plateau near 0% despite correct algorithm and adequate graph density? What structural changes would unlock meaningful compression?

**Discovery:**
Binary `mastered: boolean` retires topics from SRS at stability ≥ 4 days. This creates a shrinking FIRe pool:

| Session range | What happens | FIRe pool size |
|---------------|-------------|----------------|
| 1–5 | Topics acquired, entering Review state | Small (few in Review) |
| 5–10 | More topics in Review → FIRe's best window | Medium |
| 10–20 | Topics hit mastery → exit FIRe scope | Shrinking |
| 20+ | Most early topics mastered | Near zero |

FIRe can only operate on non-mastered topics in Review state with retrievability ≤ 0.9. The mastery threshold is easy to achieve (2 consecutive correct + stability ≥ 4 days, or 3 consecutive correct in any state). A moderate learner masters topics within 3–4 successful reviews, giving FIRe a window of ~5–10 sessions per topic.

Math Academy's approach: topics stay in SRS with growing intervals. FIRe credit extends intervals without explicit reviews, eventually reaching very high stability (months → years). They don't retire topics at a low stability threshold — the combination of sparse explicit reviews and frequent implicit FIRe credit produces "one explicit review per topic" over a full course.

**Implications:**
- Graph density is necessary but not the primary bottleneck — 1.77 edges/topic is adequate
- The 20% compression target is calibrated for systems where FIRe operates on a large, stable topic pool
- Graduated mastery (5 tiers based on stability: Learning → Practicing → Recently Mastered → Solidly Mastered → Permanently Mastered) would keep topics in FIRe's scope until stability > 90 days
- FIRe evaluation takes only 10 seconds — should run by default, not behind `--run-fire` flag
- Cross-strand encompassing edges provide the highest compression value (different review schedules → more opportunity for implicit credit)

**Status:** Resolved — Phase 2.7 isolation experiments completed. See below.

---

### 2026-03-11: FIRe Isolation Experiment — Credit vs Ordering Attribution

**Source:** User session — Plan 019 Phase 2.7

**Context:** FIRe efficiency at -25% (L2, 15 sessions). The "without FIRe" baseline disables TWO mechanisms simultaneously: (1) `applyFIReCredit()` virtual FSRS reviews and (2) `compressReviews()` set-cover ordering. Needed to attribute the negative efficiency to each mechanism independently.

**Question:** Is the -25% FIRe efficiency caused by virtual credit, set-cover ordering, or both?

**Method:** 4-mode isolation experiment via `--fire-isolation` flag:
- Mode A: Both credit + ordering (current production)
- Mode B: Credit only (ordering disabled via `disableOrdering` flag)
- Mode C: Ordering only (credit disabled via `disableCredit` flag)
- Mode D: Neither (control baseline)

**Findings:**

| Profile | A: Both (r/m) | B: Credit (r/m) | C: Ordering (r/m) | D: Neither (r/m) |
|---------|---------------|-----------------|-------------------|-------------------|
| average-older | 82/49 (1.67) | 82/49 (1.67) | 68/56 (1.21) | 68/56 (1.21) |
| misconception-fractions | 64/62 (1.03) | 70/64 (1.09) | 72/71 (1.01) | 72/71 (1.01) |
| fast-learner | 82/34 (2.41) | 77/33 (2.33) | 86/36 (2.39) | 82/46 (1.78) |

| Profile | Credit effect | Ordering effect | Combined | Interaction |
|---------|--------------|-----------------|----------|-------------|
| average-older | -37.8% | 0.0% | -37.8% | 0.0% |
| misconception-fractions | -7.9% | 0.0% | -1.8% | +6.1% |
| fast-learner | -30.9% | -34.0% | -35.3% | +29.6% |

**Discovery:**
1. **Credit hurts all 3 profiles** (avg -25.5%). Virtual FSRS stability boosts on child topics delay their natural mastery at 15 sessions by extending stability without actual practice.
2. **Ordering is neutral for 2/3 profiles** but hurts fast-learner (-34.0%). For average-older, set-cover selects the SAME reviews as most-overdue (Mode A = B exactly, Mode C = D exactly).
3. **Large non-additive interaction** in fast-learner (+29.6%): when both mechanisms are active, they partially cancel each other's damage. Credit's stability boosts compensate for ordering's suboptimal selection.
4. The mechanisms are NOT independent — measuring them separately overestimates total damage.

**Implications:**
- At 15 sessions, FIRe credit is counterproductive — stability extension delays mastery instead of accelerating it
- Set-cover ordering rarely matters because at this short horizon, the most-overdue topic is usually also the best coverage candidate
- L3+ data (90+ sessions) needed to determine if credit helps at longer horizons where stability compounds more meaningfully
- If credit still hurts at L3: implement retrieval-dependent credit (only apply when post-credit R > 0.85)
- If credit helps at L3: the short-horizon penalty is acceptable — recalibrate L2 target accordingly

**Status:** Complete. Results in `simulations/reports/fire-isolation.json`. Phase 5.5 will use L3/L4/L5 data to make implementation decision.

---

### 2026-03-12: MA K-8 Genuine Topic Count Methodology

**Source:** User session — Plan 021 Phase 6

**Context:** Plan 021 uses Math Academy K-8 as a density benchmark. We needed to know how many topics MA actually has in genuine K-8 content vs. HS content embedded in their "Foundations" courses.

**Discovery:**
MA's graph JSON (`~/source/mathacademy-graph/export/graph.json`) has 3688 total topics and 5622 edges. The `courses` field on each node is a list of objects with `course_name` and `unit_name`. Filtering by K-8 course names alone gives 1277 topics — but ~584 of those are HS-level units (Trigonometry: 104, Linear Algebra: 74, Differentiation: 57, Integration: 59, Conic Sections: 54, etc.) that MA includes in their "Foundations" curriculum for accelerated learners. Filtering to exclude those HS units yields **693 genuine K-8 topics** — matching our 705-topic expanded graph at 102% coverage.

**HS units to exclude from K-8 courses:** Trigonometry, Linear Algebra, Integration Techniques, Differentiation, Conic Sections, Vectors, Limits & Continuity, Contextual Applications of Calculus, Definite Integrals, Quadratics, Complex Numbers, Exponentials & Logarithms, Introduction to Calculus, Parametric & Polar Coordinates, Radical & Rational Functions, Exponential Functions, Differential Equations, Radical & Rational Expressions, Sequences and Series, Probability & Combinatorics, Finite Series, Number Systems, Absolute Value, Inequalities.

**Remaining gaps vs. genuine MA K-8:** Equations & Inequalities (MA 79 vs our 55), Ratios & Percentages (MA 75 vs our 47), Exponents & Radicals (MA 67 vs our 35), Polynomials (MA 48 vs our 20) — MA includes some HS-bridge content in these units even after filtering.
