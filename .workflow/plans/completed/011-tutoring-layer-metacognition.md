# Plan: Tutoring Layer & Metacognition

> **Created:** 2026-03-06T23:45:24Z
> **Completed:** 2026-03-07
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build the differentiated tutoring experience that separates this platform from quiz apps. Self-explanation capture with LLM evaluation (medium-to-large effect on transfer), confidence calibration loop integrated with FSRS for misconception detection, and smarter prerequisite-targeted remediation that pinpoints the specific skill causing failure.

These features approximate the key behaviors of an expert human tutor: asking "why did you do that?", detecting when a student is confidently wrong (critical misconception), and diagnosing exactly which foundational skill is shaky.

**Depends on:** Plan 009 (content selection — LLM evaluation needs content context), Plan 010 Phase 1 (progressive hints — remediation builds on hint tracking)

**Research basis:** `docs/learning-science.md` — §10 (self-explanation effect), §12 (confidence calibration), §13 (AI tutoring/Socratic method), §14 (targeted remediation)

**System review reference:** `docs/system-review-2026-03-06.md` — Tier 3 priorities

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓, Phase 3 ✓
**In Progress:** —
**Next:** Plan complete

---

## Phase 1: Self-Explanation Prompts ✓
**Goal:** After worked examples and guided practice, capture student explanations of *why* a step works. Evaluate with LLM. Research: combining self-explanation with faded examples produces medium-to-large effects on both near and far transfer.

1. [x] [IMP] Build `buildStudentProfile(db, userId, topicId)` helper: queries user_topic_state, review_log, and active session to produce a ~150-200 token context block injected into LLM system prompts. Includes: topic mastery state, recent struggles (last 3 incorrect reviews), session accuracy, response pace, confidence calibration. Design from RESEARCH.md "Session Context Injection" section.

2. [x] [IMP] Wire student profile into existing LLM methods: inject `buildStudentProfile()` output into system prompts for `socraticTutor` and `evaluateExplanation` in llm.ts. The tutor adapts language complexity and references specific struggle areas. The evaluator calibrates expectations to the student's level.

3. [x] [IMP] Wire frontend to existing LLM API routes: add tutor button (calls `socraticTutor`), evaluate button (calls `evaluateExplanation`), and LLM grading toggle (calls `gradeResponse`) to ProblemView and WorkedExample components. These API routes exist but have no frontend integration. Tutor button available during `guided` and `independent` phases. Evaluate button available after worked examples.

4. [x] [IMP] Add self-explanation prompt to session flow: after the `instruction` phase (worked example), before `guided` practice, insert a brief self-explanation prompt. Ask: "Can you explain why [specific step] works?" or "In your own words, what happened in step 2?" The prompt references a specific step from the worked example just shown. For K-5: simpler prompts — "How did you know to do that?" or "What would happen if the number was bigger?"

5. [x] [IMP] Build explanation capture UI: text input field (or speech-to-text for younger students via existing STT infrastructure). Student submits their explanation. Response sent to LLM for evaluation (now with student profile context injected). Keep interaction short — 1-2 exchanges max for K-5 (per learning-science.md §13).

6. [x] [IMP] Build LLM explanation evaluator: system prompt instructs the LLM to evaluate the explanation for: correct identification of the underlying principle, connection to prior knowledge, and presence of misconceptions. Returns structured response: `{quality: 'strong'|'partial'|'weak'|'misconception', feedback: string, misconceptionFlag?: string}`. Use the `cheap` LLM tier. If quality is `misconception`, flag for remediation (Phase 3 dependency).

7. [x] [TST] Verify: student profile builds correctly from DB state. LLM system prompts include profile context. Frontend tutor/evaluate/grading buttons call correct API routes. Self-explanation prompt appears after worked example. LLM evaluation returns structured quality assessment. Misconceptions are flagged. K-5 prompts are age-appropriate. LLM cost tracked in llm_usage.

**Validation:** Students explain their reasoning after worked examples. LLM evaluates quality and provides brief feedback. Misconceptions are detected and flagged for the remediation system.

---

## Phase 2: Confidence Calibration ✓
**Goal:** Collect confidence ratings after problems, integrate with FSRS, detect critical misconceptions (high confidence + wrong answer). Show calibration accuracy over time.

1. [x] [IMP] Build confidence rating UI component: for K-5 students, binary — two buttons: "I think I got it right" / "I'm not sure" (maps to confidence 4 and 2 on a 1-5 scale). For older students (presentation level `standard` or `advanced`), 1-5 slider. Show after `independent` and `review` phase problems (where `askConfidence` is true in session state). Capture the rating before revealing whether the answer was correct.

2. [x] [IMP] Integrate confidence with FSRS scheduling: update `scheduleReview()` to use confidence signal:
   - **High confidence + correct** → stable knowledge, can extend interval (FSRS Rating.Good or Easy)
   - **Low confidence + correct** → fragile knowledge, schedule sooner review (FSRS Rating.Good but shorter interval)
   - **High confidence + wrong** → **critical misconception** — flag immediately, trigger remediation, log as high-priority review item
   - **Low confidence + wrong** → expected difficulty, normal remediation flow

   Update the existing `confidenceAccuracy` EMA tracking to use the new confidence data.

3. [x] [IMP] Build calibration accuracy display: on the progress page, show the student's calibration accuracy over time — "You're right about how well you know things 73% of the time." Simple visualization (line chart or percentage). For parents/teachers: flag students with consistently high overconfidence (they think they know it but don't).

4. [x] [TST] Verify: confidence UI shows at correct phases. Binary version for K-5, slider for older. Confidence captured before answer reveal. FSRS scheduling adjusts based on confidence signal. High-confidence-wrong triggers misconception flag. Calibration accuracy calculates correctly. Existing SRS tests updated.

**Validation:** Students rate their confidence. The system uses this to schedule reviews more intelligently. Critical misconceptions (confidently wrong) are immediately flagged. Students see their calibration accuracy improving over time.

---

## Phase 3: Targeted Remediation ✓
**Goal:** When a student struggles, identify the *specific* prerequisite skill causing failure rather than sending them back to the entire prerequisite topic. Maps to Math Academy's "key prerequisite" concept.

1. [x] [IMP] Add `keyPrerequisiteId` to assessment content: optional field linking a problem to the specific prerequisite topic that's most likely to cause failure on this problem. For example, a multi-digit multiplication problem's key prerequisite might be "single-digit multiplication" rather than the broader "addition" topic. Populate for existing math content where the mapping is clear. For new content, include in generation prompts.

2. [x] [IMP] Build error pattern heuristic: when a student fails a problem, check if the error matches a known prerequisite weakness pattern. For problems without `keyPrerequisiteId`, use the prerequisite chain: check the student's FSRS state on each direct prerequisite. The prerequisite with the lowest stability (most fragile knowledge) is the likely culprit. Rank prerequisites by `(1 - retrievability)` — the most forgotten prerequisite is the most likely failure cause.

3. [x] [IMP] Update remediation flow in session service: instead of generic "go back to basics" with an easy problem from the current topic, route to the identified key prerequisite. Load a problem from the key prerequisite topic. If the student gets it right, the issue is elsewhere — try the next most fragile prerequisite. If wrong, confirm the gap — provide instruction (worked example) on the prerequisite before returning to the original topic.

4. [x] [TST] Verify: remediation targets key prerequisite when available. Without key prereq, targets lowest-stability prerequisite. Student is routed to prerequisite content, not just easier content on the same topic. Successful prerequisite review returns to original topic. Failed prerequisite triggers deeper prerequisite tracing (recursive). Misconception flags from Phase 1 and Phase 2 feed into remediation priority.

**Validation:** A student failing at multi-digit multiplication is identified as weak on single-digit multiplication facts specifically, gets targeted practice on that prerequisite, then returns to the original topic. Remediation is surgical, not blanket.
