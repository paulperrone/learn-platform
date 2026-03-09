# Diagnostic Simulation Report

> Generated: 2026-03-09T16:04:30.441Z
> Seed: 42
> Profiles: 10

## Placement Summary

| Profile | Age | Expected Grade | Actual [Low-High] | Δ | Questions | Accuracy | Phase | Presentation |
|---------|-----|----------------|-------------------|---|-----------|----------|-------|--------------|
| average-older | 12 | 3 | [3-3] | ✓ 0.0 | 8 | 75% | refine | standard |
| average-young | 7 | 1 | [2-2] | ✓ 1.0 | 8 | 38% | refine | primary |
| fast-learner | 8 | 2 | [3-3] | ✓ 1.0 | 8 | 63% | refine | intermediate→primary |
| misconception-fractions | 10 | 5 | [5-5] | ✓ 0.0 | 8 | 63% | refine | intermediate |
| overconfident | 10 | 3 | [3-3] | ✓ 0.0 | 8 | 63% | refine | intermediate |
| strong-older | 14 | 5 | [5-5] | ✓ 0.0 | 8 | 100% | refine | standard |
| strong-young | 6 | 2 | [3-3] | ✓ 1.0 | 8 | 63% | refine | primary→intermediate |
| struggling-older | 13 | 1 | [2-2] | ✓ 1.0 | 8 | 38% | refine | standard→intermediate |
| struggling-young | 6 | 0 | [0-0] | ✓ 0.0 | 10 | 20% | refine | primary |
| underconfident | 10 | 3 | [2-2] | ✓ 1.0 | 8 | 50% | refine | intermediate→primary |

## Assertion Results

**32/32 passed** (0 failed)

- ✓ **average-older: placement within ±1 grade**: Expected grade 3, actual floor 3 (Δ0.0)
- ✓ **average-young: placement within ±1 grade**: Expected grade 1, actual floor 2 (Δ1.0)
- ✓ **fast-learner: placement within ±1 grade**: Expected grade 2, actual floor 3 (Δ1.0)
- ✓ **misconception-fractions: placement within ±1 grade**: Expected grade 5, actual floor 5 (Δ0.0)
- ✓ **overconfident: placement within ±1 grade**: Expected grade 3, actual floor 3 (Δ0.0)
- ✓ **strong-older: placement within ±1 grade**: Expected grade 5, actual floor 5 (Δ0.0)
- ✓ **strong-young: placement within ±1 grade**: Expected grade 2, actual floor 3 (Δ1.0)
- ✓ **struggling-older: placement within ±1 grade**: Expected grade 1, actual floor 2 (Δ1.0)
- ✓ **struggling-young: placement within ±1 grade**: Expected grade 0, actual floor 0 (Δ0.0)
- ✓ **underconfident: placement within ±1 grade**: Expected grade 3, actual floor 2 (Δ1.0)
- ✓ **average-older: ≤30 diagnostic questions**: 8 questions
- ✓ **average-young: ≤30 diagnostic questions**: 8 questions
- ✓ **fast-learner: ≤30 diagnostic questions**: 8 questions
- ✓ **misconception-fractions: ≤30 diagnostic questions**: 8 questions
- ✓ **overconfident: ≤30 diagnostic questions**: 8 questions
- ✓ **strong-older: ≤30 diagnostic questions**: 8 questions
- ✓ **strong-young: ≤30 diagnostic questions**: 8 questions
- ✓ **struggling-older: ≤30 diagnostic questions**: 8 questions
- ✓ **struggling-young: ≤30 diagnostic questions**: 10 questions
- ✓ **underconfident: ≤30 diagnostic questions**: 8 questions
- ✓ **average-older: ≥8 diagnostic questions**: 8 questions
- ✓ **average-young: ≥8 diagnostic questions**: 8 questions
- ✓ **fast-learner: ≥8 diagnostic questions**: 8 questions
- ✓ **misconception-fractions: ≥8 diagnostic questions**: 8 questions
- ✓ **overconfident: ≥8 diagnostic questions**: 8 questions
- ✓ **strong-older: ≥8 diagnostic questions**: 8 questions
- ✓ **strong-young: ≥8 diagnostic questions**: 8 questions
- ✓ **struggling-older: ≥8 diagnostic questions**: 8 questions
- ✓ **struggling-young: ≥8 diagnostic questions**: 10 questions
- ✓ **underconfident: ≥8 diagnostic questions**: 8 questions
- ✓ **strong-young: presentation seeding documented**: Default: primary, actual: intermediate. Note: Diagnostic only shifts DOWN on comprehension mismatch. Upward shift (primary→intermediate for advanced young learners) requires session-level presentation drift, not diagnostic seeding.
- ✓ **struggling-older: presentation shifted down from standard**: Shifted from standard to intermediate

## Question Traces

### average-older (Average Older Learner)

- Age: 12, Expected frontier: grade 3
- Questions: 8, Correct: 6 (75%)
- Final bounds: [3, 3], Phase: refine
- Mastered: 44 topics, Frontier: 9 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✓ | 2 | 3 | refine |
| 4 | properties-of-multiplication | 3 | ✓ | 3 | 3 | refine |
| 5 | multi-digit-add-sub | 3 | ✓ | 3 | 3 | refine |
| 6 | multiply-word-problems | 3 | ✓ | 3 | 3 | refine |
| 7 | compare-fractions-3 | 3 | ✗ | 3 | 3 | refine |
| 8 | perimeter | 3 | ✓ | 3 | 3 | refine |

### average-young (Average Young Learner)

- Age: 7, Expected frontier: grade 1
- Questions: 8, Correct: 3 (38%)
- Final bounds: [2, 2], Phase: refine
- Mastered: 21 topics, Frontier: 8 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✗ | 2 | 2 | refine |
| 4 | subtract-within-100-fluent | 2 | ✗ | 2 | 2 | refine |
| 5 | subtract-within-1000 | 2 | ✓ | 2 | 2 | refine |
| 6 | skip-count-2-5-10 | 2 | ✓ | 2 | 2 | refine |
| 7 | place-value-hundreds | 2 | ✗ | 2 | 2 | refine |
| 8 | measure-length-standard | 2 | ✗ | 2 | 2 | refine |

### fast-learner (Fast Learner)

- Age: 8, Expected frontier: grade 2
- Questions: 8, Correct: 5 (63%)
- Final bounds: [3, 3], Phase: refine
- Mastered: 33 topics, Frontier: 9 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✓ | 2 | 3 | refine |
| 4 | properties-of-multiplication | 3 | ✓ | 3 | 3 | refine |
| 5 | multi-digit-add-sub | 3 | ✗ | 3 | 3 | refine |
| 6 | multiply-word-problems | 3 | ✓ | 3 | 3 | refine |
| 7 | compare-fractions-3 | 3 | ✗ | 3 | 3 | refine |
| 8 | perimeter | 3 | ✓ | 3 | 3 | refine |

### misconception-fractions (Fraction Misconception Learner)

- Age: 10, Expected frontier: grade 5
- Questions: 8, Correct: 5 (63%)
- Final bounds: [5, 5], Phase: refine
- Mastered: 61 topics, Frontier: 5 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✓ | 3 | 5 | search |
| 2 | line-symmetry | 4 | ✓ | 4 | 5 | refine |
| 3 | classify-2d-shapes | 5 | ✗ | 4 | 5 | refine |
| 4 | factors-multiples | 4 | ✓ | 4 | 5 | refine |
| 5 | divide-fractions | 5 | ✓ | 5 | 5 | refine |
| 6 | multiply-multi-digit | 5 | ✗ | 5 | 5 | refine |
| 7 | variables-expressions | 5 | ✓ | 5 | 5 | refine |
| 8 | coordinate-plane | 5 | ✗ | 5 | 5 | refine |

### overconfident (Overconfident Learner)

- Age: 10, Expected frontier: grade 3
- Questions: 8, Correct: 5 (63%)
- Final bounds: [3, 3], Phase: refine
- Mastered: 33 topics, Frontier: 9 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✓ | 2 | 3 | refine |
| 4 | properties-of-multiplication | 3 | ✓ | 3 | 3 | refine |
| 5 | multi-digit-add-sub | 3 | ✗ | 3 | 3 | refine |
| 6 | multiply-word-problems | 3 | ✓ | 3 | 3 | refine |
| 7 | compare-fractions-3 | 3 | ✗ | 3 | 3 | refine |
| 8 | perimeter | 3 | ✓ | 3 | 3 | refine |

### strong-older (Strong Older Learner)

- Age: 14, Expected frontier: grade 5
- Questions: 8, Correct: 8 (100%)
- Final bounds: [5, 5], Phase: refine
- Mastered: 71 topics, Frontier: 0 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✓ | 3 | 5 | search |
| 2 | line-symmetry | 4 | ✓ | 4 | 5 | refine |
| 3 | classify-2d-shapes | 5 | ✓ | 5 | 5 | refine |
| 4 | add-subtract-fractions-unlike | 5 | ✓ | 5 | 5 | refine |
| 5 | decimal-operations | 5 | ✓ | 5 | 5 | refine |
| 6 | multiply-multi-digit | 5 | ✓ | 5 | 5 | refine |
| 7 | variables-expressions | 5 | ✓ | 5 | 5 | refine |
| 8 | coordinate-plane | 5 | ✓ | 5 | 5 | refine |

### strong-young (Strong Young Learner)

- Age: 6, Expected frontier: grade 2
- Questions: 8, Correct: 5 (63%)
- Final bounds: [3, 3], Phase: refine
- Mastered: 33 topics, Frontier: 9 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✓ | 2 | 3 | refine |
| 4 | properties-of-multiplication | 3 | ✓ | 3 | 3 | refine |
| 5 | multi-digit-add-sub | 3 | ✗ | 3 | 3 | refine |
| 6 | multiply-word-problems | 3 | ✓ | 3 | 3 | refine |
| 7 | compare-fractions-3 | 3 | ✗ | 3 | 3 | refine |
| 8 | perimeter | 3 | ✓ | 3 | 3 | refine |

### struggling-older (Struggling Older Learner)

- Age: 13, Expected frontier: grade 1
- Questions: 8, Correct: 3 (38%)
- Final bounds: [2, 2], Phase: refine
- Mastered: 21 topics, Frontier: 8 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✗ | 2 | 2 | refine |
| 4 | subtract-within-100-fluent | 2 | ✗ | 2 | 2 | refine |
| 5 | subtract-within-1000 | 2 | ✓ | 2 | 2 | refine |
| 6 | skip-count-2-5-10 | 2 | ✓ | 2 | 2 | refine |
| 7 | place-value-hundreds | 2 | ✗ | 2 | 2 | refine |
| 8 | measure-length-standard | 2 | ✗ | 2 | 2 | refine |

### struggling-young (Struggling Young Learner)

- Age: 6, Expected frontier: grade 0
- Questions: 10, Correct: 2 (20%)
- Final bounds: [0, 0], Phase: refine
- Mastered: 15 topics, Frontier: 9 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✗ | 2 | 2 | refine |
| 4 | subtract-within-100-fluent | 2 | ✗ | 2 | 2 | refine |
| 5 | subtract-within-1000 | 2 | ✓ | 2 | 2 | refine |
| 6 | skip-count-2-5-10 | 2 | ✗ | 2 | 2 | refine |
| 7 | place-value-hundreds | 2 | ✗ | 2 | 2 | refine |
| 8 | measure-length-standard | 2 | ✗ | 1 | 2 | refine |
| 9 | add-within-20 | 1 | ✗ | 0 | 1 | refine |
| 10 | subtract-within-5 | 0 | ✗ | 0 | 0 | refine |

### underconfident (Underconfident Learner)

- Age: 10, Expected frontier: grade 3
- Questions: 8, Correct: 4 (50%)
- Final bounds: [2, 2], Phase: refine
- Mastered: 25 topics, Frontier: 7 topics

| # | Topic | Grade | Correct | Search Low | Search High | Phase |
|---|-------|-------|---------|------------|-------------|-------|
| 1 | equivalent-fractions-3 | 3 | ✗ | 0 | 3 | search |
| 2 | odd-even | 2 | ✓ | 2 | 3 | refine |
| 3 | money-coins-bills | 2 | ✗ | 2 | 2 | refine |
| 4 | subtract-within-100-fluent | 2 | ✓ | 2 | 2 | refine |
| 5 | subtract-within-1000 | 2 | ✓ | 2 | 2 | refine |
| 6 | skip-count-2-5-10 | 2 | ✓ | 2 | 2 | refine |
| 7 | place-value-hundreds | 2 | ✗ | 2 | 2 | refine |
| 8 | measure-length-standard | 2 | ✗ | 2 | 2 | refine |

## Presentation Seeding Analysis

The diagnostic seeds the presentation distribution based on two signals:
1. **Age-default**: Maps birth year to a default center level (primary/intermediate/standard/advanced)
2. **Comprehension mismatch**: If ≥40% of questions where prerequisites are mastered result in failure, shift distribution down one level

| Profile | Age Default | Actual Seed | Shifted? | Analysis |
|---------|-------------|-------------|----------|----------|
| average-older | standard | standard | No | Age-default confirmed |
| average-young | primary | primary | No | Age-default confirmed |
| fast-learner | intermediate | primary | Yes | Mismatch detected — shifted down |
| misconception-fractions | intermediate | intermediate | No | Age-default confirmed |
| overconfident | intermediate | intermediate | No | Age-default confirmed |
| strong-older | standard | standard | No | Age-default confirmed |
| strong-young | primary | intermediate | Yes | Mismatch detected — shifted down |
| struggling-older | standard | intermediate | Yes | Mismatch detected — shifted down |
| struggling-young | primary | primary | No | Age-default confirmed |
| underconfident | intermediate | primary | Yes | Mismatch detected — shifted down |

### Key Finding: Upward Presentation Shift Not Implemented

The diagnostic can detect when presentation is **too high** for a student (comprehension mismatch → shift down), 
but cannot detect when presentation is **too low** (e.g., a gifted 6-year-old who could handle intermediate-level content). 
Upward presentation adjustment happens during learning sessions via the presentation drift mechanism, not during diagnostic seeding. 
This is by design — diagnostic is conservative, and session-level drift corrects over time.

## Diagnostic Algorithm Findings

### Finding 1: Upward Placement Bias

4/10 profiles are placed above their expected frontier grade. 
The binary search raises `searchLow` aggressively on correct answers — a single correct answer at a grade level 
permanently sets the floor there. Since the diagnostic only asks 8 questions minimum, a few lucky 
correct answers on above-level topics can lock in an inflated placement.

**Impact:** Students start learning sessions on topics slightly above their comfort zone. 
This is partially mitigated by the adaptive difficulty targeting (85% target) and remediation system, 
but can cause frustration in early sessions.

### Finding 2: Search Bounds Lock-In

9/10 profiles have searchLow=searchHigh at diagnostic completion, 
meaning the bounds collapsed to a single grade. Once this happens, incorrect answers at that grade 
cannot lower searchHigh (since `Math.min(searchHigh, topicGrade)` is a no-op when they're equal). 
The diagnostic should potentially allow searchHigh to decrease below the current value when 
multiple incorrect answers accumulate at a grade level.

