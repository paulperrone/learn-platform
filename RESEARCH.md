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
