# Content Review Rubric

You are reviewing educational content for a mastery-learning platform. For each topic, evaluate against the 7 criteria below. Produce a JSON array of `ReviewFinding` objects.

## Grounding Rules

- Evaluate content against its **declared metadata** (gradeLevel, difficulty, cognitiveDemand, presentation, contentDepth, prerequisite names/descriptions).
- Do **NOT** use graph depth, topological position, downstream topic count, or any derived graph property. These change with restructuring and make findings fragile.
- You are reviewing **text content only**. Ignore references to future media (images, animations, audio) — these are planned but not yet available.

## Output Format

For each criterion, produce one or more findings:

```json
{
  "criterion": "answer-correctness",
  "status": "pass" | "warn" | "error" | "skip",
  "detail": "Human-readable explanation",
  "evidence": "Quote or reference from the content",
  "problemId": "optional — specific problem ID if applicable"
}
```

- `pass`: No issues found
- `warn`: Minor concern worth noting
- `error`: Clear problem that should be fixed
- `skip`: Cannot evaluate (e.g., no examples to review)

One finding per criterion minimum. Multiple findings per criterion allowed when issues affect different problems.

## Criteria

### 1. Answer Correctness (HIGH SIGNAL)

Verify that:
- The stated answer is actually correct (mathematical/factual verification)
- Solution steps in hints lead to the stated answer
- Hints are progressive and don't give away the answer prematurely
- For multi-step problems, intermediate results are consistent

**error**: Wrong answer, steps contradict answer, first hint reveals answer
**warn**: Minor ambiguity in answer format, hints could be more progressive
**pass**: All answers correct, hints well-sequenced

### 2. Prerequisite Assumption Correctness (HIGH SIGNAL)

Check whether each problem assumes *exactly* the skills from its listed prerequisites:
- Grounded on prerequisite topics' **names and descriptions**, not graph position
- Flag problems that assume unlisted knowledge (implicit dependency)
- Flag problems that don't use any prerequisite skill (too basic for its position)
- Consider the discipline's progression model:
  - **Mastery-gated** (math, cs): prerequisites are hard gates — content MUST assume prior mastery
  - **Context-layered** (history): prerequisites provide context, not gates
  - **Flexible** (vocabulary): prerequisites are suggestions

**error**: Problem requires knowledge from an unlisted prerequisite
**warn**: Problem doesn't exercise any prerequisite skill
**pass**: Problems correctly assume prerequisite skills

### 3. Difficulty Calibration (HIGH SIGNAL)

Verify that `difficulty` labels (easy/medium/hard) are correct *relative to each other* within the topic:
- Grounded on: `difficulty` labels, `gradeLevel`, `presentation` dimension
- Flag difficulty inversions ("easy" problem harder than "hard" problem)
- Consider cognitive load, number of steps, complexity of operations

**error**: Clear difficulty inversion (easy harder than hard)
**warn**: Difficulty labels feel slightly off but not inverted
**pass**: Difficulty progression is logical

### 4. Worked Example Quality (HIGH SIGNAL)

For worked examples, verify:
- Steps build logically from prerequisite knowledge
- Explanations are meaningful (not just restating the calculation)
- Complexity appropriate for `gradeLevel` and `presentation` level
- Steps are complete — no logical jumps

**error**: Steps have logical gaps, explanations are wrong
**warn**: Explanations could be clearer, missing a minor step
**pass**: Examples are well-structured and educational
**skip**: No examples available for this topic

### 5. Cognitive Demand Appropriateness (MEDIUM SIGNAL)

Check whether `cognitiveDemand` labels match what problems actually require:
- `procedural`: Apply a known procedure step-by-step
- `application`: Apply a concept to a new context
- `conceptual`: Understand why, not just how
- `reasoning`: Multi-step logical deduction
- `error_analysis`: Find and explain mistakes
- Grounded on: `cognitiveDemand` label, `contentDepth`, `gradeLevel`

**error**: Label clearly wrong (e.g., rote addition labeled "reasoning")
**warn**: Label is debatable
**pass**: Labels match actual cognitive requirements

### 6. Dimension Alignment (MEDIUM SIGNAL)

Check whether content *itself* matches its claimed dimensions:
- `presentation: primary` content should use simple language, concrete examples — flag if it uses algebra or abstract notation
- `presentation: advanced` content should be rigorous — flag if too simple
- `contentDepth: survey` should be introductory — flag if analytically demanding
- `contentDepth: synthesis` should require integration — flag if just recall

**error**: Content clearly mismatches its presentation or depth claim
**warn**: Content is borderline for its claimed dimension
**pass**: Content matches dimensions

### 7. Topic Atomicity (MEDIUM SIGNAL)

Assess whether the topic is properly scoped:
- Grounded on: topic description, prerequisite count, encompassing edges, problem diversity
- **Too broad**: Topic covers multiple distinct skills that should be separate topics (problems test fundamentally different knowledge)
- **Too narrow**: Topic is a trivial variant of a neighbor (could be merged)
- **Well-scoped**: Topic represents one coherent, testable skill

**error**: Topic clearly too broad (covers 3+ distinct skills) or too narrow (trivial variant)
**warn**: Topic scope is questionable but defensible
**pass**: Topic is well-scoped

## Progression Model Notes

### Mastery-Gated (math, cs, languages grammar, music technique)
- Every problem should have a clear right/wrong answer
- Difficulty should increase within the topic, not across prerequisites
- Easy problems test the core skill; hard problems add complexity or edge cases

### Context-Layered (history, philosophy, literature)
- Assessment may use rubric-based scoring, not just right/wrong
- "Prerequisites" provide context, not gates — content should be understandable without them
- Higher depth levels should introduce multiple perspectives

### Flexible (vocabulary, geography, anatomy)
- Topics are largely independent — order matters little
- Assessment is typically recall-based
- Prerequisite references should be minimal

## Overall Grade

After evaluating all criteria, assign an overall grade:
- **A**: No errors, at most minor warns
- **B**: No errors, some warns worth noting
- **C**: 1-2 errors or many warns
- **D**: Multiple errors across criteria
- **F**: Fundamental issues (wrong answers, broken prerequisites)

Include a 1-2 sentence summary of the review.
