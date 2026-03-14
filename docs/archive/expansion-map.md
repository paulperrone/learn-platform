# Math Topic Expansion Map

> **Plan 021 Phase 1 — MA Cross-Reference Audit**
> **Created:** 2026-03-11
> **Source:** `~/source/mathacademy-graph/export/graph.json` (3688 nodes, 5622 edges)
> **Our graph:** `../learn-content/math/graph.json` (207 topics, 321 prereq edges)

## Split Heuristics

When deciding whether to adopt an MA split or create our own, apply these:

1. **Testable-in-isolation:** Can a student pass topic A and fail topic B? If yes, they should be separate.
2. **Distinct cognitive demand:** Does the topic require a meaningfully different strategy (e.g., estimation vs exact computation)?
3. **Platform-compatible:** Can the skill be assessed with screen + text input? Skip topics requiring physical manipulatives unless adaptable.
4. **Grade-boundary natural:** Does the skill naturally sit at a specific grade level that differs from its parent?
5. **Remediation-useful:** Would splitting help pinpoint where a struggling student is stuck?

When to **skip** an MA topic:
- Model-based variants where the model is the same skill with a visual aid (consolidate into parent)
- Word problem variants that don't add cognitive demand beyond the procedural topic
- Digit-count progressions beyond 3 levels (2-digit, 3-digit, multi-digit is enough; 5-digit and 7-digit collapse)

---

## Wave 1: Foundational Operations

### counting-cardinality (4 → 15 topics, +11)

**Current topics:** count-to-10, count-to-20, count-to-100, compare-numbers-k

**MA reference:** No direct unit — counting is embedded in their Number System. We define our own K-level splits.

**New topics (split heuristic justification):**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `count-objects-to-5` | Count Objects to 5 | K | testable-in-isolation: counting objects vs rote counting | — |
| `count-objects-to-10` | Count Objects to 10 | K | testable-in-isolation | count-to-10 |
| `count-objects-to-20` | Count Objects to 20 | K | grade-boundary | count-to-20 |
| `one-to-one-correspondence` | One-to-One Correspondence | K | distinct-cognitive: matching vs counting | count-objects-to-10 |
| `count-forward-from-number` | Count Forward from a Given Number | K | distinct-cognitive: starting mid-sequence | count-to-20 |
| `count-backward-from-10` | Count Backward from 10 | K | distinct-cognitive: reverse direction | count-to-10 |
| `count-backward-from-20` | Count Backward from 20 | K | grade-boundary | count-to-20, count-backward-from-10 |
| `compare-groups-more-less` | Compare Groups (More/Less/Same) | K | remediation-useful: precursor to number comparison | count-objects-to-10 |
| `order-numbers-to-10` | Order Numbers to 10 | K | testable-in-isolation: ordering vs comparing pairs | compare-numbers-k |
| `order-numbers-to-20` | Order Numbers to 20 | K | grade-boundary | compare-numbers-k, count-to-20 |
| `number-bonds-to-10` | Number Bonds to 10 (Compose/Decompose) | K | distinct-cognitive: part-whole thinking | count-to-10 |

**Encompassing edges:**
- `count-to-100` encompasses `count-to-10`, `count-to-20`
- `compare-numbers-k` encompasses `compare-groups-more-less`

**Strand total: 15 topics, ~20 prereq edges**

---

### operations-addition (8 → 25 topics, +17)

**Current topics:** add-within-5, add-within-10, add-within-20, add-within-100, add-within-100-fluent, add-within-1000, add-subtract-word-problems-1, estimation-addition-subtraction

**MA reference (4th Grade > Addition & Subtraction, 13 topics):**
- Adding Two-Digit Whole Numbers → **adapt** (our add-within-100 covers this)
- Adding Three-Digit and Two-Digit Numbers → **adopt** (digit-count split)
- Adding Three-Digit Numbers → **adopt**
- Adding Numbers Up to Five Digits → **skip** (collapse into multi-digit)
- Adding Numbers Up to Seven Digits → **skip** (collapse into multi-digit)
- Adding Three Multi-Digit Numbers → **adopt** (3+ addend is distinct)
- Estimating Multi-Digit Addition → **adapt** (we have estimation-addition-subtraction)

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `add-doubles` | Addition Doubles (1+1 through 10+10) | K | distinct-cognitive: memorization strategy | add-within-10 |
| `add-near-doubles` | Addition Near-Doubles | 1 | distinct-cognitive: strategy variation | add-doubles, add-within-20 |
| `add-make-ten` | Make Ten Strategy | 1 | distinct-cognitive: decompose-to-ten strategy | add-within-20, number-bonds-to-10 |
| `add-three-numbers` | Add Three Numbers (within 20) | 1 | testable-in-isolation: 3 addends | add-within-20 |
| `add-two-digit-no-regroup` | Add Two-Digit Numbers (No Regrouping) | 1 | remediation-useful: regrouping is distinct skill | add-within-100, place-value-tens-ones |
| `add-two-digit-regroup` | Add Two-Digit Numbers (With Regrouping) | 1 | remediation-useful: regrouping | add-two-digit-no-regroup |
| `add-three-digit` | Add Three-Digit Numbers | 2 | testable-in-isolation: per MA split | add-within-1000, place-value-hundreds |
| `add-multi-digit` | Add Multi-Digit Numbers (4+ digits) | 3 | grade-boundary: consolidates MA's 5-digit and 7-digit | add-three-digit |
| `add-three-addends-multi-digit` | Add Three or More Multi-Digit Numbers | 3 | distinct-cognitive: per MA | add-multi-digit |
| `estimation-addition` | Estimate Sums | 3 | testable-in-isolation: split from combined estimation | place-value-rounding, add-within-1000 |
| `addition-properties` | Properties of Addition (Commutative, Associative, Identity) | 1 | distinct-cognitive: conceptual vs procedural | add-within-20 |
| `add-word-problems-join` | Addition Word Problems: Join/Combine | 1 | remediation-useful: problem-type classification | add-within-20 |
| `add-word-problems-compare` | Addition Word Problems: Compare | 1 | distinct-cognitive: compare language is harder | add-word-problems-join |
| `add-word-problems-multi-step` | Multi-Step Addition Word Problems | 3 | grade-boundary | add-multi-digit, multi-step-word-problems |
| `mental-addition-strategies` | Mental Addition Strategies (Compensation, Splitting) | 2 | distinct-cognitive: mental vs written | add-within-100-fluent |
| `add-on-number-line` | Addition on a Number Line | 1 | distinct-cognitive: visual/spatial representation | add-within-20 |
| `missing-addend` | Missing Addend Problems | 1 | distinct-cognitive: algebraic thinking precursor | add-within-20 |

**Encompassing edges:**
- `add-multi-digit` encompasses `add-three-digit`, `add-two-digit-regroup`
- `estimation-addition` encompasses `add-within-1000` (partial — estimation uses but transcends exact computation)

**Strand total: 25 topics, ~35 prereq edges**

---

### operations-subtraction (5 → 20 topics, +15)

**Current topics:** subtract-within-5, subtract-within-10, subtract-within-20, subtract-within-100-fluent, subtract-within-1000

**MA reference (4th Grade > Addition & Subtraction, subtraction portion):**
- Subtracting Two-Digit Numbers → **adapt** (splits by regrouping)
- Subtracting Two-Digit Numbers From Three-Digit Numbers → **adopt**
- Subtracting Three-Digit Numbers → **adopt**
- Subtracting Numbers Up to Five Digits → **skip** (collapse)
- Subtracting Numbers Up to Seven Digits → **skip** (collapse)
- Estimating Multi-Digit Subtraction → **adopt**

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `subtract-count-back` | Subtract by Counting Back | K | distinct-cognitive: strategy | subtract-within-10 |
| `subtract-related-facts` | Subtraction Related to Addition Facts | 1 | distinct-cognitive: inverse relationship | subtract-within-20, add-within-20 |
| `subtract-two-digit-no-regroup` | Subtract Two-Digit Numbers (No Regrouping) | 1 | remediation-useful | subtract-within-100-fluent, place-value-tens-ones |
| `subtract-two-digit-regroup` | Subtract Two-Digit Numbers (With Regrouping) | 2 | remediation-useful: regrouping is the hard part | subtract-two-digit-no-regroup |
| `subtract-three-digit` | Subtract Three-Digit Numbers | 2 | testable-in-isolation | subtract-within-1000, place-value-hundreds |
| `subtract-across-zeros` | Subtract Across Zeros | 3 | remediation-useful: common error point | subtract-three-digit |
| `subtract-multi-digit` | Subtract Multi-Digit Numbers (4+ digits) | 3 | grade-boundary | subtract-three-digit |
| `estimation-subtraction` | Estimate Differences | 3 | testable-in-isolation: split from combined | place-value-rounding, subtract-within-1000 |
| `subtraction-word-problems-separate` | Subtraction Word Problems: Take-Away/Separate | 1 | remediation-useful: problem types | subtract-within-20 |
| `subtraction-word-problems-compare` | Subtraction Word Problems: Compare | 1 | distinct-cognitive: compare language | subtraction-word-problems-separate |
| `subtraction-word-problems-missing` | Subtraction Word Problems: Missing Part | 2 | distinct-cognitive: algebraic thinking | subtraction-word-problems-separate |
| `mental-subtraction-strategies` | Mental Subtraction Strategies | 2 | distinct-cognitive: mental vs written | subtract-within-100-fluent |
| `subtract-on-number-line` | Subtraction on a Number Line | 1 | distinct-cognitive: visual/spatial | subtract-within-20 |
| `check-subtraction-with-addition` | Check Subtraction Using Addition | 2 | distinct-cognitive: verification skill | subtract-two-digit-regroup, add-two-digit-regroup |
| `subtract-word-problems-multi-step` | Multi-Step Subtraction Word Problems | 3 | grade-boundary | subtract-multi-digit |

**Encompassing edges:**
- `subtract-multi-digit` encompasses `subtract-three-digit`, `subtract-two-digit-regroup`
- `subtract-across-zeros` encompasses `subtract-two-digit-regroup`

**Strand total: 20 topics, ~28 prereq edges**

---

### operations-multiplication (7 → 30 topics, +23)

**Current topics:** intro-arrays, multiply-within-100, multiply-word-problems, properties-of-multiplication, estimation-multiplication-division, multi-digit-multiply, multiply-multi-digit

**MA reference:**
- **4th Grade > Multiplication (20 topics):** Products and Factors, The Factors of a Number, Prime and Composite, Multiples, LCM, GCF, Multiplying by 10/100/1000, Rewriting Numbers Ending in Zeros, Multiplying Whole Numbers Ending in Zeros, Repeated Addition, Repeated Subtraction, Estimating Multi-Digit, 2×1 Area Models, Multi×1 Area Models, 2×1 Place Value, Multi×1 Place Value, 2×2 Area Models, 2×2 Place Value
- **5th Grade > Multiplying & Dividing Whole Numbers (mult portion, ~8):** 2×1, 3-4×1, 5-6×1, 2×2, Multi×2, 3×3, Powers of Ten

Note: MA's Multiplication unit includes factors/multiples/primes which we place in number-base. Focus here on computation skills.

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `equal-groups` | Equal Groups (Introduction to Multiplication) | 2 | distinct-cognitive: conceptual foundation | add-within-20 |
| `multiply-by-2-5-10` | Multiply by 2, 5, and 10 | 2 | remediation-useful: anchor facts | equal-groups, skip-count-2-5-10 |
| `multiply-by-0-1` | Multiply by 0 and 1 (Identity and Zero Properties) | 3 | distinct-cognitive: special cases | multiply-within-100 |
| `multiply-by-3-4` | Multiply by 3 and 4 | 3 | remediation-useful: fact families | multiply-by-2-5-10 |
| `multiply-by-6-7-8-9` | Multiply by 6, 7, 8, and 9 | 3 | remediation-useful: harder facts | multiply-by-3-4 |
| `multiply-fluency-100` | Multiplication Fluency (Within 100) | 3 | testable-in-isolation: speed/accuracy vs understanding | multiply-by-6-7-8-9 |
| `multiply-by-10-100-1000` | Multiply by 10, 100, and 1,000 | 3 | distinct-cognitive: place-value pattern | multiply-within-100, place-value-rounding |
| `multiply-multiples-of-10` | Multiply Multiples of 10 | 3 | distinct-cognitive: extending place-value pattern | multiply-by-10-100-1000 |
| `multiply-2x1-no-regroup` | Multiply 2-Digit by 1-Digit (No Regrouping) | 3 | remediation-useful: regrouping split | multiply-within-100, place-value-tens-ones |
| `multiply-2x1-regroup` | Multiply 2-Digit by 1-Digit (With Regrouping) | 3 | remediation-useful | multiply-2x1-no-regroup |
| `multiply-3x1` | Multiply 3-Digit by 1-Digit | 4 | testable-in-isolation: digit progression | multiply-2x1-regroup, place-value-hundreds |
| `multiply-4x1` | Multiply 4+-Digit by 1-Digit | 4 | grade-boundary | multiply-3x1 |
| `multiply-2x2-area-model` | Multiply 2-Digit by 2-Digit (Area Model) | 4 | distinct-cognitive: visual strategy | multiply-2x1-regroup, intro-arrays |
| `multiply-2x2-standard` | Multiply 2-Digit by 2-Digit (Standard Algorithm) | 4 | distinct-cognitive: procedural | multiply-2x2-area-model |
| `multiply-multi-digit-2` | Multiply Multi-Digit by 2-Digit | 5 | testable-in-isolation | multiply-2x2-standard |
| `multiply-3x3` | Multiply 3-Digit by 3-Digit | 5 | grade-boundary: per MA | multiply-multi-digit-2 |
| `estimation-multiplication` | Estimate Products | 4 | testable-in-isolation: split from combined estimation | place-value-rounding, multiply-2x1-regroup |
| `multiply-word-problems-equal-groups` | Multiplication Word Problems: Equal Groups | 3 | remediation-useful: problem type | multiply-within-100 |
| `multiply-word-problems-comparison` | Multiplication Word Problems: Multiplicative Comparison | 4 | distinct-cognitive: per MA comparison vs equal groups | multiply-word-problems-equal-groups |
| `multiply-word-problems-area` | Multiplication Word Problems: Area | 4 | distinct-cognitive: geometric context | multi-digit-multiply, area-multiply |
| `multiplication-division-relationship` | Relationship Between Multiplication and Division | 3 | distinct-cognitive: inverse relationship (per MA) | multiply-within-100, divide-within-100 |
| `commutative-property-mult` | Commutative Property of Multiplication | 3 | remediation-useful: split from combined properties | multiply-within-100 |
| `associative-distributive-mult` | Associative and Distributive Properties | 3 | distinct-cognitive: distributive is harder | commutative-property-mult |

**Encompassing edges:**
- `multiply-3x3` encompasses `multiply-multi-digit-2`, `multiply-2x2-standard`
- `multiply-multi-digit` (existing) encompasses `multiply-4x1`, `multiply-3x1`

**Strand total: 30 topics, ~42 prereq edges**

---

### operations-division (4 → 25 topics, +21)

**Current topics:** divide-within-100, division-word-problems, long-division, divide-multi-digit

**MA reference:**
- **4th Grade > Division (16 topics):** Relationship Between Mult and Div, Understanding Remainders Using Models, Finding Remainders, Dividends/Divisors/Quotients/Remainders, Division With Remainders, Interpreting Remainders in Context, Dividing by 10/100/1000, Dividing by 1-Digit (connect to mult), Place-Value Strategies, Estimating Multi-Digit, 2÷1 Area Models, Multi÷1 Area Models, More Multi÷1 Area Models, 2÷1 Partial Quotients, 2÷1 Remainders Partial Quotients, Multi÷1 Partial Quotients
- **5th Grade > Multiplying & Dividing Whole Numbers (div portion, ~10):** 2÷1, 3÷1, 4÷1, Using Fractions for Division, Rounding, Interpreting Remainder, 2-digit divisor (×2 variants), 3÷2, 4÷2, Multi÷2 Partial Quotients

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `division-concept` | Division as Equal Sharing/Grouping | 2 | distinct-cognitive: conceptual foundation | equal-groups |
| `divide-by-2-5-10` | Divide by 2, 5, and 10 | 3 | remediation-useful: anchor facts | division-concept, multiply-by-2-5-10 |
| `divide-by-3-4` | Divide by 3 and 4 | 3 | remediation-useful: fact progression | divide-by-2-5-10 |
| `divide-by-6-7-8-9` | Divide by 6 through 9 | 3 | remediation-useful | divide-by-3-4 |
| `division-vocabulary` | Dividends, Divisors, Quotients, and Remainders | 3 | distinct-cognitive: terminology (per MA) | divide-within-100 |
| `division-remainders-intro` | Division with Remainders (Introduction) | 3 | testable-in-isolation: remainder concept | divide-within-100 |
| `interpret-remainders` | Interpret Remainders in Context | 4 | distinct-cognitive: per MA — requires judgment | division-remainders-intro |
| `divide-by-10-100-1000` | Divide by 10, 100, and 1,000 | 4 | distinct-cognitive: place-value pattern | divide-within-100, multiply-by-10-100-1000 |
| `estimation-division` | Estimate Quotients | 4 | testable-in-isolation: split from combined | place-value-rounding, divide-within-100 |
| `long-division-1-digit-no-remainder` | Long Division by 1-Digit (No Remainder) | 4 | remediation-useful: remainder split | divide-within-100, place-value-hundreds |
| `long-division-1-digit-remainder` | Long Division by 1-Digit (With Remainder) | 4 | remediation-useful | long-division-1-digit-no-remainder, division-remainders-intro |
| `long-division-2-digit` | Long Division by 2-Digit Divisor | 5 | testable-in-isolation: per MA | long-division-1-digit-remainder |
| `long-division-larger` | Long Division (Larger Numbers) | 5 | grade-boundary | long-division-2-digit |
| `division-with-zeros` | Division with Zeros in Quotient | 4 | remediation-useful: common error | long-division-1-digit-no-remainder |
| `fractions-as-division` | Fractions as Division | 5 | distinct-cognitive: conceptual bridge (per MA) | long-division, intro-fractions |
| `division-word-problems-equal-sharing` | Division Word Problems: Equal Sharing | 3 | remediation-useful: problem type | divide-within-100 |
| `division-word-problems-grouping` | Division Word Problems: How Many Groups | 3 | distinct-cognitive: grouping vs sharing | division-word-problems-equal-sharing |
| `division-word-problems-multi-step` | Multi-Step Division Word Problems | 4 | grade-boundary | long-division, multi-step-word-problems |
| `division-word-problems-interpret` | Division Word Problems: Interpret Remainder | 4 | distinct-cognitive: per MA | interpret-remainders, division-word-problems-grouping |
| `divisibility-rules-2-5-10` | Divisibility Rules for 2, 5, 10 | 4 | distinct-cognitive: pattern recognition | divide-within-100, odd-even |
| `divisibility-rules-3-9` | Divisibility Rules for 3, 6, 9 | 4 | distinct-cognitive: digit-sum strategy | divisibility-rules-2-5-10 |

**Encompassing edges:**
- `divide-multi-digit` encompasses `long-division-2-digit`, `long-division-1-digit-remainder`
- `long-division` (existing, rewired) encompasses `long-division-1-digit-remainder`, `long-division-1-digit-no-remainder`

**Strand total: 25 topics, ~35 prereq edges**

---

### Wave 1 Summary

| Strand | Current | New | Total | MA Comparable |
|--------|---------|-----|-------|---------------|
| counting-cardinality | 4 | 11 | 15 | (no direct MA unit) |
| operations-addition | 8 | 17 | 25 | 13 (4th Grade Add/Sub) |
| operations-subtraction | 5 | 15 | 20 | 13 (4th Grade Add/Sub) |
| operations-multiplication | 7 | 23 | 30 | 20 + 8 = 28 (4th Grade Mult + 5th Grade) |
| operations-division | 4 | 21 | 25 | 16 + 10 = 26 (4th Grade Div + 5th Grade) |
| **Wave 1 Total** | **28** | **87** | **115** | |

---

## Wave 2: K-5 Domain Strands

### number-base (19 → 55 topics, +36)

**Current topics:** teen-numbers, place-value-tens-ones, compare-two-digit, skip-count-2-5-10, odd-even, place-value-hundreds, multi-digit-add-sub, place-value-rounding, compare-decimals, decimals-intro, factors-multiples, greatest-common-factor, least-common-multiple, prime-composite-numbers, decimal-operations, exponents-intro, place-value-decimals, powers-of-ten, round-decimals

**MA reference:**
- **4th Grade > The Number System (15):** Comparing Place Values, Comparing Whole Numbers (×2), Rounding Down, Rounding Up, Rounding Up 9, Place Value to 4 Digits, Place Value to 7 Digits, Writing Numbers in Words (×2), Standard↔Expanded Form (×2), Equivalent Place Value Representations (×3)
- **5th Grade > Decimals (18):** Estimating Decimal Add/Sub, Adding Decimals, Add Unequal Decimals, Subtracting Decimals, Subtract Unequal Decimals, Estimating with Benchmarks (×2), Place Value System with Decimals, Comparing Place Values Decimals, Reading/Writing Decimals, Standard↔Expanded Decimals (×2), Equivalent Decimals, Comparing Decimals, Rounding Down/Up Decimals, Significant Figures (×2)
- **5th Grade > The Number System (9):** Negative Numbers, Comparing Negatives, Absolute Value, Evaluating Expressions (×2), Creating Expressions (×2), Comparisons (×2)

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `count-by-2s` | Count by 2s | 1 | testable-in-isolation: split from combined skip counting | count-to-100 |
| `count-by-5s` | Count by 5s | 1 | testable-in-isolation | count-to-100 |
| `count-by-10s` | Count by 10s | 1 | testable-in-isolation | count-to-100, place-value-tens-ones |
| `place-value-thousands` | Place Value: Thousands | 3 | testable-in-isolation: per MA 4-digit | place-value-hundreds |
| `place-value-millions` | Place Value: Millions (Large Numbers) | 4 | grade-boundary: per MA 7-digit | place-value-thousands |
| `read-write-numbers-words` | Read and Write Numbers in Words | 3 | distinct-cognitive: per MA | place-value-thousands |
| `standard-expanded-form` | Standard Form and Expanded Form | 3 | distinct-cognitive: per MA | place-value-thousands |
| `compare-multi-digit` | Compare Multi-Digit Whole Numbers | 3 | testable-in-isolation: extends compare-two-digit | compare-two-digit, place-value-thousands |
| `round-to-nearest-thousand` | Round to Nearest 1,000 and Beyond | 4 | testable-in-isolation: extends rounding | place-value-rounding, place-value-thousands |
| `equivalent-place-value` | Equivalent Place Value Representations | 3 | distinct-cognitive: per MA (e.g., 24 tens = 240) | place-value-thousands |
| `decimal-place-value-tenths` | Decimal Place Value: Tenths | 4 | remediation-useful: tenths before hundredths | decimals-intro |
| `decimal-place-value-hundredths` | Decimal Place Value: Hundredths | 4 | remediation-useful | decimal-place-value-tenths |
| `decimal-place-value-thousandths` | Decimal Place Value: Thousandths | 5 | grade-boundary | decimal-place-value-hundredths |
| `read-write-decimals` | Read and Write Decimals in Words | 5 | distinct-cognitive: per MA | place-value-decimals |
| `equivalent-decimals` | Equivalent Decimals (e.g., 0.5 = 0.50) | 5 | distinct-cognitive: per MA | place-value-decimals |
| `standard-expanded-form-decimals` | Standard and Expanded Form with Decimals | 5 | distinct-cognitive: per MA | place-value-decimals |
| `add-decimals` | Add Decimals | 5 | testable-in-isolation: split from combined decimal-operations | place-value-decimals |
| `subtract-decimals` | Subtract Decimals | 5 | testable-in-isolation | place-value-decimals |
| `add-decimals-unequal-places` | Add Decimals with Unequal Decimal Places | 5 | remediation-useful: per MA | add-decimals |
| `subtract-decimals-unequal-places` | Subtract Decimals with Unequal Decimal Places | 5 | remediation-useful: per MA | subtract-decimals |
| `multiply-decimals-whole` | Multiply Decimals by Whole Numbers | 5 | testable-in-isolation: split from decimal-operations | place-value-decimals, multiply-multi-digit |
| `multiply-decimals` | Multiply Decimals by Decimals | 5 | testable-in-isolation | multiply-decimals-whole |
| `divide-decimals-whole` | Divide Decimals by Whole Numbers | 5 | testable-in-isolation | place-value-decimals, divide-multi-digit |
| `divide-decimals` | Divide Decimals by Decimals | 5 | testable-in-isolation | divide-decimals-whole |
| `multiply-decimals-powers-of-ten` | Multiply Decimals by Powers of Ten | 5 | distinct-cognitive: per MA pattern-based | place-value-decimals, powers-of-ten |
| `divide-decimals-powers-of-ten` | Divide Decimals by Powers of Ten | 5 | distinct-cognitive: per MA | place-value-decimals, powers-of-ten |
| `estimate-decimal-operations` | Estimate Decimal Sums, Differences, Products | 5 | distinct-cognitive | round-decimals, add-decimals |
| `decimal-division-with-rounding` | Decimal Division with Rounding | 5 | distinct-cognitive: per MA | divide-decimals, round-decimals |
| `factors-and-factor-pairs` | Factor Pairs | 4 | testable-in-isolation: split from factors-multiples | factors-multiples |
| `multiples-of-number` | Multiples of a Number | 4 | testable-in-isolation: per MA | factors-multiples |
| `prime-factorization` | Prime Factorization | 5 | distinct-cognitive: per MA Foundations I | prime-composite-numbers |
| `gcf-using-prime-factorization` | GCF Using Prime Factorization | 5 | distinct-cognitive: per MA | greatest-common-factor, prime-factorization |
| `lcm-using-prime-factorization` | LCM Using Prime Factorization | 5 | distinct-cognitive: per MA | least-common-multiple, prime-factorization |
| `divisibility-rules-full` | Divisibility Rules (All) | 5 | distinct-cognitive: extends Wave 1 divisibility | divisibility-rules-3-9 |
| `negative-numbers-intro` | Introduction to Negative Numbers | 5 | distinct-cognitive: per MA 5th Grade | compare-multi-digit |
| `compare-negative-numbers` | Compare Negative Numbers | 5 | distinct-cognitive: per MA | negative-numbers-intro |

**Encompassing edges:**
- `place-value-millions` encompasses `place-value-thousands`, `place-value-hundreds`
- `decimal-operations` (existing, becomes capstone) encompasses `add-decimals`, `subtract-decimals`, `multiply-decimals`, `divide-decimals`
- `prime-factorization` encompasses `prime-composite-numbers`, `factors-multiples`

**Strand total: 55 topics, ~75 prereq edges**

---

### fractions (16 → 70 topics, +54)

**Current topics:** intro-fractions, fractions-number-line, equivalent-fractions-3, compare-fractions-3, add-subtract-fractions, add-subtract-mixed-numbers, compare-fractions-4, equivalent-fractions-4, fraction-decimal-equivalence, improper-fractions-mixed-numbers, multiply-fraction-by-whole, add-subtract-fractions-unlike, add-subtract-mixed-numbers-unlike, divide-fractions, multiply-fractions, multiply-mixed-numbers

**MA reference (massive — 4 units, ~124 topics):**
- **4th Grade > Fractions & Decimals (43):** Detailed add/sub with like denominators using models, word problems, decomposing fractions, mixed number operations, comparing methods (unit benchmarks, half benchmarks, common denominators), decimal fractions, plotting decimals, fraction↔decimal conversions, fraction models, writing fractions in words, improper fractions, equivalent fractions using area models, equivalent fractions, LCD, writing fractions in lowest terms, fractions as division, models for mixed numbers, converting improper↔mixed, multiplying fractions by whole numbers (models + procedural + word problems)
- **5th Grade > Adding & Subtracting Fractions (14):** Estimating, unlike denom using models (×2), unlike denom procedural (×2), word problems, adding/subtracting fractions and whole numbers (models + procedural, ×4), mixed numbers unlike (×3), word problems
- **5th Grade > Multiplying & Dividing Fractions (26):** Fraction division using area models, dividing whole numbers by unit fractions (models + procedural), dividing unit fractions by whole numbers (models + procedural), reciprocals, dividing whole numbers by fractions (models + procedural), dividing fractions by whole numbers (models + procedural), dividing fractions (models + procedural), word problems, multiplying fractions (unit fractions models, fractions models, procedural, word problems), swapping denominators, mixed numbers (×whole, ×fractions, ×mixed, word problems), fraction mult and area (×3)
- **Foundations I > Fractions (41):** Largely overlaps 4th/5th but adds LCD emphasis, reciprocals, more procedural depth

This is our largest expansion. MA splits aggressively between model-based and procedural, plus word problems. We'll adopt the most remediable splits and skip model-only variants.

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `unit-fractions` | Unit Fractions | 3 | distinct-cognitive: foundation concept | intro-fractions |
| `fractions-of-set` | Fractions of a Set | 3 | distinct-cognitive: set model vs area model | intro-fractions |
| `write-fractions-words` | Read and Write Fractions in Words | 3 | distinct-cognitive: per MA | intro-fractions |
| `fractions-equal-parts` | Equal Parts and Fractions | 2 | distinct-cognitive: precursor concept | — |
| `equivalent-fractions-models` | Equivalent Fractions Using Models | 3 | remediation-useful: visual before procedural | equivalent-fractions-3 |
| `simplify-fractions` | Simplify Fractions (Lowest Terms) | 4 | testable-in-isolation: per MA | equivalent-fractions-4, greatest-common-factor |
| `least-common-denominator` | Least Common Denominator | 4 | testable-in-isolation: per MA (distinct from LCM application) | least-common-multiple, equivalent-fractions-4 |
| `compare-fractions-benchmarks` | Compare Fractions Using Benchmarks (0, 1/2, 1) | 4 | distinct-cognitive: per MA benchmark strategy | compare-fractions-4 |
| `order-fractions` | Order Fractions on a Number Line | 4 | testable-in-isolation: ordering vs comparing pairs | compare-fractions-4, fractions-number-line |
| `decompose-fractions` | Decompose Fractions into Sums | 4 | distinct-cognitive: per MA | add-subtract-fractions |
| `add-fractions-like-denom` | Add Fractions with Like Denominators | 3 | remediation-useful: split from combined add/sub | intro-fractions, add-within-20 |
| `subtract-fractions-like-denom` | Subtract Fractions with Like Denominators | 3 | remediation-useful | add-fractions-like-denom |
| `add-fractions-like-word-problems` | Add/Subtract Fractions Word Problems (Like Denom) | 4 | distinct-cognitive: application | add-subtract-fractions |
| `add-mixed-numbers-like-denom` | Add Mixed Numbers with Like Denominators | 4 | testable-in-isolation: split from combined | improper-fractions-mixed-numbers, add-subtract-fractions |
| `subtract-mixed-numbers-like-denom` | Subtract Mixed Numbers with Like Denominators | 4 | testable-in-isolation | add-mixed-numbers-like-denom |
| `subtract-mixed-numbers-regroup` | Subtract Mixed Numbers (Regrouping) | 4 | remediation-useful: per MA using improper fractions | subtract-mixed-numbers-like-denom, improper-fractions-mixed-numbers |
| `add-fractions-unlike-denom` | Add Fractions with Unlike Denominators | 5 | testable-in-isolation: split from combined unlike | least-common-denominator, add-subtract-fractions |
| `subtract-fractions-unlike-denom` | Subtract Fractions with Unlike Denominators | 5 | testable-in-isolation | add-fractions-unlike-denom |
| `estimate-fraction-sums` | Estimate Fraction Sums and Differences | 5 | distinct-cognitive: per MA | compare-fractions-benchmarks, add-fractions-unlike-denom |
| `add-fractions-whole-numbers` | Add Fractions and Whole Numbers | 5 | distinct-cognitive: per MA | add-fractions-unlike-denom |
| `subtract-fractions-whole-numbers` | Subtract Fractions from Whole Numbers | 5 | distinct-cognitive: per MA | add-fractions-whole-numbers |
| `add-mixed-numbers-unlike` | Add Mixed Numbers with Unlike Denominators | 5 | testable-in-isolation | add-fractions-unlike-denom, add-mixed-numbers-like-denom |
| `subtract-mixed-numbers-unlike` | Subtract Mixed Numbers with Unlike Denominators | 5 | testable-in-isolation | add-mixed-numbers-unlike, subtract-mixed-numbers-regroup |
| `fraction-add-sub-word-problems-unlike` | Add/Subtract Fractions Word Problems (Unlike Denom) | 5 | distinct-cognitive | add-subtract-fractions-unlike |
| `mixed-number-word-problems` | Mixed Number Word Problems | 5 | distinct-cognitive | add-subtract-mixed-numbers-unlike |
| `multiply-unit-fraction-whole` | Multiply Unit Fraction by Whole Number | 4 | remediation-useful: per MA unit fraction first | unit-fractions, multiply-within-100 |
| `multiply-fraction-whole-word-problems` | Multiply Fractions by Whole Numbers: Word Problems | 4 | distinct-cognitive: per MA | multiply-fraction-by-whole |
| `multiply-fractions-procedural` | Multiply Fractions (Procedural) | 5 | testable-in-isolation: split concept from procedure | multiply-fraction-by-whole |
| `multiply-fractions-word-problems` | Multiply Fractions: Word Problems | 5 | distinct-cognitive: per MA | multiply-fractions |
| `multiply-fractions-area` | Fraction Multiplication and Area | 5 | distinct-cognitive: per MA geometric context | multiply-fractions, area-multiply |
| `multiply-mixed-whole` | Multiply Mixed Numbers by Whole Numbers | 5 | remediation-useful: per MA progression | multiply-fraction-by-whole, improper-fractions-mixed-numbers |
| `multiply-mixed-fractions` | Multiply Mixed Numbers by Fractions | 5 | testable-in-isolation: per MA | multiply-fractions, improper-fractions-mixed-numbers |
| `multiply-mixed-word-problems` | Multiply Mixed Numbers: Word Problems | 5 | distinct-cognitive | multiply-mixed-numbers |
| `reciprocals` | Reciprocals | 5 | distinct-cognitive: per MA — prerequisite for division | multiply-fractions |
| `divide-whole-by-unit-fraction` | Divide Whole Number by Unit Fraction | 5 | remediation-useful: per MA unit fraction first | unit-fractions, divide-within-100 |
| `divide-unit-fraction-by-whole` | Divide Unit Fraction by Whole Number | 5 | remediation-useful: per MA | divide-whole-by-unit-fraction |
| `divide-whole-by-fraction` | Divide Whole Number by Fraction | 5 | testable-in-isolation: per MA | divide-unit-fraction-by-whole, reciprocals |
| `divide-fraction-by-whole` | Divide Fraction by Whole Number | 5 | testable-in-isolation: per MA | divide-whole-by-fraction |
| `divide-fractions-procedural` | Divide Fractions (Procedural) | 5 | testable-in-isolation: invert-and-multiply | divide-fraction-by-whole |
| `divide-fractions-word-problems` | Divide Fractions and Whole Numbers: Word Problems | 5 | distinct-cognitive: per MA | divide-fractions |
| `convert-fraction-to-decimal` | Convert Fractions to Decimals | 4 | testable-in-isolation: split from bidirectional | fraction-decimal-equivalence |
| `convert-decimal-to-fraction` | Convert Decimals to Fractions | 4 | testable-in-isolation | fraction-decimal-equivalence |
| `convert-mixed-to-decimal` | Convert Mixed Numbers to Decimals | 4 | distinct-cognitive: per MA | improper-fractions-mixed-numbers, convert-fraction-to-decimal |
| `fractions-as-division-concept` | Fractions as Division | 5 | distinct-cognitive: per MA conceptual bridge | divide-fractions, fractions-as-division |
| `decimal-fractions` | Decimal Fractions (Tenths, Hundredths as Fractions) | 4 | distinct-cognitive: per MA | decimals-intro, intro-fractions |
| `simplify-before-multiply` | Simplify Before Multiplying Fractions | 5 | distinct-cognitive: per MA efficiency strategy | simplify-fractions, multiply-fractions |
| `cross-multiply-fractions` | Cross-Multiplication for Comparing Fractions | 5 | distinct-cognitive: strategy | compare-fractions-4, multiply-within-100 |
| `mixed-number-conversions` | Convert Between Improper Fractions and Mixed Numbers | 4 | testable-in-isolation: bidirectional fluency | improper-fractions-mixed-numbers |
| `fraction-number-sense` | Fraction Number Sense (Reasonableness) | 5 | distinct-cognitive: per MA | compare-fractions-benchmarks, multiply-fractions |

**Note:** Some existing topics will be rewired. `add-subtract-fractions` becomes a capstone that encompasses the new like-denominator splits. `add-subtract-fractions-unlike` encompasses the new unlike-denominator splits. `divide-fractions` and `multiply-fractions` become capstones.

**Encompassing edges:**
- `add-subtract-fractions` encompasses `add-fractions-like-denom`, `subtract-fractions-like-denom`
- `add-subtract-fractions-unlike` encompasses `add-fractions-unlike-denom`, `subtract-fractions-unlike-denom`
- `multiply-fractions` encompasses `multiply-fractions-procedural`, `multiply-unit-fraction-whole`
- `divide-fractions` encompasses `divide-fractions-procedural`, `divide-whole-by-fraction`
- `multiply-mixed-numbers` encompasses `multiply-mixed-whole`, `multiply-mixed-fractions`

**Strand total: 70 topics (16 existing + 54 new), ~95 prereq edges**

---

### algebra-thinking (6 → 25 topics, +19)

**Current topics:** patterns-arithmetic, multi-step-word-problems, number-patterns-sequences, numerical-expressions-grouping, order-of-operations, variables-expressions

**MA reference:**
- **4th Grade > Operations & Algebraic Thinking (9):** Evaluating Expressions (Add+Mult, Mult+Div), Solving Multistep Word Problems (×2), Interpreting Multiplication Equations as Comparison, Representing Comparison as Equations, Word Problems (Additive + Multiplicative Comparison), Generating Patterns, Identifying Patterns
- **Prealgebra > Algebraic Expressions (17):** Introduction to Algebraic Expressions, Constructing Algebraic Expressions, Evaluating Linear Expressions, Evaluating Rational Expressions, Identifying Terms/Coefficients/Constants, GCF of Linear Expressions, Identifying Like Terms, Collecting Like Terms, Distributive Law (×3), Distributing Negative Sign, Simplifying Linear Expressions (×2), Simplifying with Fractions, Factoring Numerical Expressions, Factoring Linear Expressions

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `input-output-tables` | Input-Output Tables | 3 | distinct-cognitive: function machine thinking | patterns-arithmetic |
| `growing-patterns` | Growing Patterns (Visual and Numeric) | 3 | distinct-cognitive: visual → numeric | patterns-arithmetic |
| `number-rules` | Describe Number Rules | 4 | distinct-cognitive: per MA Generating/Identifying Patterns | number-patterns-sequences |
| `comparison-problems-additive` | Additive Comparison Word Problems | 3 | remediation-useful: per MA comparison types | add-subtract-word-problems-1 |
| `comparison-problems-multiplicative` | Multiplicative Comparison Word Problems | 4 | distinct-cognitive: per MA | comparison-problems-additive, multiply-word-problems |
| `evaluate-expressions-four-ops` | Evaluate Expressions with Four Operations | 4 | testable-in-isolation: per MA | order-of-operations |
| `multi-step-word-problems-4ops` | Multi-Step Word Problems with Four Operations | 4 | testable-in-isolation: per MA | multi-step-word-problems, order-of-operations |
| `write-expressions` | Write Numerical Expressions from Words | 5 | distinct-cognitive: translating | numerical-expressions-grouping |
| `evaluate-expressions-grouping` | Evaluate Expressions with Grouping Symbols | 5 | testable-in-isolation: split from combined | numerical-expressions-grouping, order-of-operations |
| `intro-algebraic-expressions` | Introduction to Algebraic Expressions | 5 | distinct-cognitive: per MA/Prealgebra | variables-expressions |
| `construct-algebraic-expressions` | Construct Algebraic Expressions from Words | 5 | distinct-cognitive: per MA | intro-algebraic-expressions |
| `evaluate-algebraic-expressions` | Evaluate Algebraic Expressions | 5 | testable-in-isolation: per MA | intro-algebraic-expressions |
| `identify-terms-coefficients` | Identify Terms, Coefficients, and Constants | 5 | distinct-cognitive: per MA vocabulary | intro-algebraic-expressions |
| `like-terms` | Identify and Collect Like Terms | 5 | testable-in-isolation: per MA | identify-terms-coefficients |
| `distributive-property-intro` | Distributive Property (Introduction) | 5 | distinct-cognitive: per MA | multiply-within-100, intro-algebraic-expressions |
| `simplify-expressions-distributive` | Simplify Expressions Using Distributive Property | 5 | testable-in-isolation: per MA | distributive-property-intro, like-terms |
| `factor-numerical-expressions` | Factor Numerical Expressions | 5 | distinct-cognitive: per MA | greatest-common-factor, numerical-expressions-grouping |
| `expressions-with-exponents` | Evaluate Expressions with Exponents | 5 | distinct-cognitive: per MA | exponents-intro, order-of-operations |
| `two-step-word-problems` | Two-Step Word Problems | 2 | remediation-useful: bridge to multi-step | add-subtract-word-problems-1 |

**Encompassing edges:**
- `multi-step-word-problems` encompasses `two-step-word-problems`, `comparison-problems-additive`
- `variables-expressions` encompasses `intro-algebraic-expressions`

**Strand total: 25 topics, ~35 prereq edges**

---

### measurement-data (9 → 35 topics, +26)

**Current topics:** measure-length-nonstandard, tell-time-hour-half, measure-length-standard, money-coins-bills, bar-graphs-picture-graphs, tell-time-minute, line-plots, mean-median-mode, unit-conversion

**MA reference:**
- **4th Grade > Measurement & Data (21):** Points/Lines/Rays/Segments, Angles and Measures, Connecting Angles and Circles, Measuring Angles Using Protractor, Right/Straight/Full/Null Angles, Acute/Obtuse/Reflex, Sums of Angles, Solving Angle Problems, Parallel and Perpendicular Lines, Modeling With Rectangles, Creating/Interpreting Line Plots (×2), Units of Length/Mass/Time/Volume, Converting Metric Units (×3), Converting Customary Units (×2)
- **5th Grade > Measurement & Data (12):** Describing Coordinate Plane, Solving Real World Problems Using Coordinates, Coordinate Planes as Maps, Connecting/Comparing/Graphing Patterns, Converting Units (larger, ×5), Operations on Fractions With Line Plots

Note: MA puts angle work under Measurement & Data. We have angles under geometry. We'll add measurement-specific topics here.

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `measure-length-inches` | Measure Length in Inches | 2 | remediation-useful: unit-specific | measure-length-standard |
| `measure-length-cm` | Measure Length in Centimeters | 2 | remediation-useful | measure-length-standard |
| `measure-length-rulers` | Measure Length Using Rulers (Half/Quarter Inch) | 3 | distinct-cognitive: fractional measurements | measure-length-standard, intro-fractions |
| `weight-mass-intro` | Weight and Mass (Introduction) | 2 | distinct-cognitive: new measurement type | measure-length-standard |
| `capacity-intro` | Capacity and Volume (Liquid Measurement) | 2 | distinct-cognitive: new measurement type | measure-length-standard |
| `tell-time-5-minutes` | Tell Time to 5 Minutes | 2 | remediation-useful: intermediate step | tell-time-hour-half |
| `elapsed-time` | Elapsed Time | 3 | distinct-cognitive: computation with time | tell-time-minute |
| `picture-graphs` | Picture Graphs | 1 | remediation-useful: split from combined | count-to-20 |
| `bar-graphs-read` | Read and Interpret Bar Graphs | 2 | remediation-useful: reading vs creating | bar-graphs-picture-graphs |
| `bar-graphs-create` | Create Bar Graphs | 3 | distinct-cognitive: creation vs interpretation | bar-graphs-read |
| `line-plots-intro` | Line Plots (Introduction) | 3 | remediation-useful: basic before fractions | bar-graphs-read |
| `line-plots-fractions` | Line Plots with Fractions | 5 | testable-in-isolation: extends with fractions | line-plots-intro, add-subtract-fractions-unlike |
| `units-of-length-customary` | Units of Length (Customary: in, ft, yd, mi) | 3 | testable-in-isolation: per MA | measure-length-standard |
| `units-of-length-metric` | Units of Length (Metric: mm, cm, m, km) | 3 | testable-in-isolation: per MA | measure-length-cm |
| `units-of-mass` | Units of Mass (oz, lb, g, kg) | 4 | distinct-cognitive: per MA | weight-mass-intro |
| `units-of-time` | Units of Time (sec, min, hr, day, etc.) | 4 | distinct-cognitive: per MA | tell-time-minute |
| `units-of-volume-liquid` | Units of Volume (cup, pt, qt, gal, mL, L) | 4 | distinct-cognitive: per MA | capacity-intro |
| `convert-length-smaller` | Convert Length to Smaller Units | 4 | testable-in-isolation: per MA direction-specific | unit-conversion, units-of-length-customary |
| `convert-length-larger` | Convert Length to Larger Units | 5 | distinct-cognitive: per MA | convert-length-smaller |
| `convert-mass` | Convert Units of Mass | 4 | testable-in-isolation: per MA | unit-conversion, units-of-mass |
| `convert-time` | Convert Units of Time | 4 | testable-in-isolation: per MA | unit-conversion, units-of-time |
| `convert-volume` | Convert Units of Volume | 4 | testable-in-isolation: per MA | unit-conversion, units-of-volume-liquid |
| `metric-vs-customary` | Compare Metric and Customary Units | 5 | distinct-cognitive: cross-system comparison | units-of-length-metric, units-of-length-customary |
| `money-make-change` | Make Change | 2 | distinct-cognitive: subtraction with money | money-coins-bills, subtract-within-100-fluent |
| `money-word-problems` | Money Word Problems | 3 | distinct-cognitive: application | money-coins-bills, add-within-1000 |
| `data-tables` | Read and Create Data Tables | 3 | distinct-cognitive: tabular representation | bar-graphs-read |

**Encompassing edges:**
- `unit-conversion` (existing, becomes capstone) encompasses `convert-length-smaller`, `convert-mass`, `convert-time`
- `mean-median-mode` encompasses `bar-graphs-read`, `data-tables`

**Strand total: 35 topics, ~48 prereq edges**

---

### geometry (14 → 50 topics, +36)

**Current topics:** shapes-2d-k, shapes-3d-k, area-intro, area-multiply, perimeter, angles-intro, classify-triangles, line-symmetry, parallel-perpendicular-lines, points-lines-rays, area-composite-shapes, classify-2d-shapes, coordinate-plane, volume

**MA reference:**
- **4th Grade > Measurement & Data (angle topics, ~9):** Points/Lines/Rays, Angles and Measures, Measuring Angles Using Protractor, Right/Straight/Full/Null, Acute/Obtuse/Reflex, Sums of Angles, Solving Angle Problems, Parallel/Perpendicular, Modeling with Rectangles
- **5th Grade > Geometry (8):** Polygons, Quadrilaterals, Rectangles/Rhombuses/Squares, Classifying Quadrilaterals, Understanding Volume Using Unit Cubes, Units of Area and Volume, Volumes of Right Rectangular Prisms, Volume Word Problems
- **Foundations I > Geometry Fundamentals (26):** Complementary/Supplementary/Corresponding/Alternate/Consecutive Angles, Angle/Segment Bisectors, Congruent Angles/Segments, Vertical Angles, Solving Angle Problems, Circles (arcs/sectors), Circumference, Area of Circles, Midpoints, Collinear Points, Segment Addition
- **Foundations I > Polygons (21):** Area of Rectangles/Triangles/Trapezoids, Composite Shapes, Polygons, Interior/Exterior Angles, Congruent Polygons, Regular Polygons, Perimeter of Polygon, Classifying Quadrilaterals, Properties of Rectangles/Squares, Interior/Exterior Angles of Triangles, Classifying Triangles, Triangle Inequality, Isosceles Triangle Theorem, Heights of Triangles, Pythagorean Theorem, Special Right Triangles

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `shapes-attributes` | Describe Shape Attributes | K | distinct-cognitive: attributes vs naming | shapes-2d-k |
| `compose-shapes` | Compose and Decompose Shapes | 1 | distinct-cognitive: spatial reasoning | shapes-2d-k |
| `partition-shapes` | Partition Shapes into Equal Parts | 1 | distinct-cognitive: precursor to fractions | shapes-2d-k |
| `sides-vertices` | Count Sides and Vertices | 1 | testable-in-isolation | shapes-2d-k |
| `quadrilaterals-intro` | Quadrilaterals (Introduction) | 3 | testable-in-isolation: per MA 5th Grade | classify-2d-shapes |
| `rectangles-rhombuses-squares` | Rectangles, Rhombuses, and Squares | 3 | distinct-cognitive: per MA property-based classification | quadrilaterals-intro |
| `classify-quadrilaterals` | Classify Quadrilaterals (Hierarchy) | 5 | distinct-cognitive: per MA hierarchical classification | rectangles-rhombuses-squares, parallel-perpendicular-lines |
| `polygons-intro` | Polygons (Introduction) | 5 | distinct-cognitive: per MA Foundations | classify-2d-shapes |
| `regular-polygons` | Regular Polygons | 5 | distinct-cognitive: per MA | polygons-intro |
| `angles-measure` | Measuring Angles with a Protractor | 4 | testable-in-isolation: per MA tool use | angles-intro |
| `angle-types` | Types of Angles (Acute, Obtuse, Right, Straight, Reflex) | 4 | distinct-cognitive: per MA classification | angles-intro |
| `complementary-angles` | Complementary Angles | 4 | testable-in-isolation: per MA | angle-types |
| `supplementary-angles` | Supplementary Angles | 4 | testable-in-isolation: per MA | angle-types |
| `angle-sums` | Sums of Angles | 4 | distinct-cognitive: per MA additive angle problems | angles-measure |
| `solve-angle-problems` | Solve Angle Problems | 4 | testable-in-isolation: per MA | angle-sums, complementary-angles, supplementary-angles |
| `perimeter-regular-shapes` | Perimeter of Regular Shapes | 3 | remediation-useful: easier than general perimeter | perimeter, sides-vertices |
| `perimeter-irregular-shapes` | Perimeter of Irregular Shapes | 3 | distinct-cognitive | perimeter |
| `area-counting-squares` | Area by Counting Unit Squares | 3 | remediation-useful: conceptual before formula | area-intro |
| `area-rectangles` | Area of Rectangles | 3 | testable-in-isolation: formula-based | area-multiply |
| `area-related-to-perimeter` | Relate Area and Perimeter | 3 | distinct-cognitive: comparing measures | area-rectangles, perimeter |
| `congruent-figures` | Congruent Figures | 3 | distinct-cognitive: per MA | shapes-2d-k |
| `volume-unit-cubes` | Volume Using Unit Cubes | 5 | remediation-useful: per MA conceptual | volume |
| `volume-rectangular-prisms` | Volume of Rectangular Prisms (Formula) | 5 | testable-in-isolation: per MA | volume, area-rectangles |
| `volume-word-problems` | Volume Word Problems | 5 | distinct-cognitive: per MA | volume-rectangular-prisms |
| `coordinate-plane-plot-points` | Plot Points on the Coordinate Plane | 5 | remediation-useful: split from combined | coordinate-plane |
| `coordinate-plane-read-points` | Read Points from the Coordinate Plane | 5 | remediation-useful | coordinate-plane |
| `coordinate-plane-real-world` | Real World Problems Using Coordinates | 5 | distinct-cognitive: per MA | coordinate-plane-plot-points |
| `symmetry-rotational` | Rotational Symmetry | 4 | distinct-cognitive: extends line symmetry | line-symmetry |
| `classify-triangles-sides` | Classify Triangles by Sides | 4 | remediation-useful: split from combined | classify-triangles |
| `classify-triangles-angles` | Classify Triangles by Angles | 4 | remediation-useful | classify-triangles, angle-types |
| `draw-geometric-shapes` | Draw Geometric Shapes with Given Attributes | 4 | distinct-cognitive: construction vs identification | angles-measure, parallel-perpendicular-lines |
| `3d-shapes-attributes` | 3D Shape Attributes (Faces, Edges, Vertices) | 1 | distinct-cognitive: per MA Foundations II | shapes-3d-k |
| `3d-shape-nets` | Nets of 3D Shapes | 5 | distinct-cognitive: per MA | 3d-shapes-attributes |
| `units-of-area` | Units of Area | 5 | distinct-cognitive: per MA | area-rectangles, unit-conversion |
| `area-and-perimeter-word-problems` | Area and Perimeter Word Problems | 4 | distinct-cognitive: application | area-rectangles, perimeter |
| `modeling-with-rectangles` | Modeling with Rectangles | 4 | distinct-cognitive: per MA | area-rectangles |

**Encompassing edges:**
- `area-composite-shapes` encompasses `area-rectangles`, `area-counting-squares`
- `classify-2d-shapes` encompasses `quadrilaterals-intro`, `classify-triangles`
- `volume` encompasses `volume-unit-cubes`

**Strand total: 50 topics, ~70 prereq edges**

---

### Wave 2 Summary

| Strand | Current | New | Total | MA Comparable |
|--------|---------|-----|-------|---------------|
| number-base | 19 | 36 | 55 | 15 + 18 + 9 = 42 (4th NS + 5th Decimals + 5th NS) |
| fractions | 16 | 54 | 70 | 43 + 14 + 26 + 41 = 124 (deduped ~90) |
| algebra-thinking | 6 | 19 | 25 | 9 + 17 = 26 (4th OAT + Prealgebra AE) |
| measurement-data | 9 | 26 | 35 | 21 + 12 = 33 (4th + 5th M&D) |
| geometry | 14 | 36 | 50 | 9 + 8 + 26 + 21 = 64 (deduped ~50) |
| **Wave 2 Total** | **64** | **171** | **235** | |

---

## Wave 3: 6-8 Domain Strands

### rational-numbers (18 → 50 topics, +32)

**Current topics:** integers-intro, number-line-opposites, absolute-value, compare-order-integers, compare-order-rationals, rational-numbers-intro, decimal-division-6, divide-multi-digit-6, gcf-lcm-applications, integer-addition, integer-subtraction, integer-multiplication, integer-division, add-subtract-rationals, multiply-divide-rationals, convert-rational-forms, operations-rational-practice, square-roots-intro

**MA reference:**
- **Foundations I > The Number System (28):** Subtracting positive from smaller positive, from negative, positive fraction from smaller, positive decimal from smaller, adding positive to negative, adding negative, subtracting negative, additive inverses, solving problems with add/sub rationals, absolute value, multiplying positive with negative, multiplying negatives, dividing with negatives (×2), equivalent fractions with negatives, reciprocals of rationals, multiplying/dividing with zero, fractions of fractions, solving problems with 4 ops on rationals, divisibility (×2), prime/composite, prime factors, fundamental theorem of arithmetic, GCF/LCM using prime factorization, natural/integer/rational numbers, repeating decimals as fractions

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `negative-numbers-number-line` | Negative Numbers on the Number Line | 6 | remediation-useful: visual before abstract | integers-intro |
| `add-positive-to-negative` | Add a Positive Number to a Negative Number | 7 | remediation-useful: per MA specific case | integer-addition |
| `add-negative-number` | Add a Negative Number | 7 | remediation-useful: per MA | integer-addition |
| `subtract-negative-number` | Subtract a Negative Number | 7 | remediation-useful: per MA — common confusion point | integer-subtraction |
| `subtract-positive-from-smaller` | Subtract a Positive from a Smaller Positive | 7 | remediation-useful: per MA — result is negative | integer-subtraction |
| `multiply-positive-negative` | Multiply Positive and Negative Numbers | 7 | remediation-useful: per MA sign rules | integer-multiplication |
| `multiply-two-negatives` | Multiply Two Negative Numbers | 7 | remediation-useful: per MA | multiply-positive-negative |
| `divide-with-negatives` | Divide with Negative Numbers | 7 | testable-in-isolation: per MA | integer-division, multiply-positive-negative |
| `additive-inverses` | Additive Inverses | 6 | distinct-cognitive: per MA | number-line-opposites |
| `multiply-divide-with-zero` | Multiply and Divide with Zero | 7 | distinct-cognitive: per MA special cases | integer-multiplication, integer-division |
| `negative-fractions` | Operations with Negative Fractions | 7 | testable-in-isolation: per MA | add-subtract-rationals, multiply-divide-rationals |
| `negative-decimals` | Operations with Negative Decimals | 7 | testable-in-isolation: per MA | add-subtract-rationals |
| `equivalent-fractions-negatives` | Equivalent Fractions with Negative Numbers | 7 | distinct-cognitive: per MA | negative-fractions, equivalent-fractions-4 |
| `reciprocals-rationals` | Reciprocals of Rational Numbers | 7 | distinct-cognitive: per MA | reciprocals, multiply-divide-rationals |
| `fractions-of-fractions` | Fractions of Fractions | 7 | distinct-cognitive: per MA | multiply-divide-rationals |
| `add-subtract-rational-word-problems` | Add/Subtract Rational Numbers: Word Problems | 7 | distinct-cognitive | add-subtract-rationals |
| `multiply-divide-rational-word-problems` | Multiply/Divide Rational Numbers: Word Problems | 7 | distinct-cognitive | multiply-divide-rationals |
| `four-ops-rationals-word-problems` | Multi-Step Rational Number Word Problems | 7 | distinct-cognitive: per MA | operations-rational-practice |
| `natural-integer-rational-classification` | Classify Numbers: Natural, Integer, Rational | 6 | distinct-cognitive: per MA | rational-numbers-intro |
| `repeating-decimals-as-fractions` | Write Repeating Decimals as Fractions | 7 | distinct-cognitive: per MA | convert-rational-forms |
| `terminating-vs-repeating` | Terminating vs Repeating Decimals | 7 | distinct-cognitive | convert-rational-forms |
| `compare-rationals-number-line` | Compare Rational Numbers on Number Line | 6 | remediation-useful: visual method | compare-order-rationals, rational-numbers-intro |
| `order-rationals` | Order Rational Numbers | 6 | testable-in-isolation: extends comparing | compare-order-rationals |
| `absolute-value-expressions` | Evaluate Expressions with Absolute Value | 6 | distinct-cognitive: extends basic | absolute-value, evaluate-expressions-6 |
| `absolute-value-distance` | Absolute Value as Distance | 6 | distinct-cognitive: geometric interpretation | absolute-value, negative-numbers-number-line |
| `square-root-perfect-squares` | Square Roots of Perfect Squares | 8 | remediation-useful: split from intro | square-roots-intro |
| `estimate-square-roots` | Estimate Square Roots (Non-Perfect Squares) | 8 | distinct-cognitive | square-root-perfect-squares |
| `cube-roots-intro` | Introduction to Cube Roots | 8 | distinct-cognitive: new root type | square-roots-intro |
| `rational-vs-irrational` | Rational vs Irrational Numbers | 8 | distinct-cognitive: per existing irrational-numbers but as classification | square-roots-intro, repeating-decimals-as-fractions |
| `approximate-irrationals` | Approximate Irrational Numbers | 8 | distinct-cognitive | estimate-square-roots, rational-vs-irrational |
| `decimal-long-division` | Long Division for Decimal Quotients | 6 | distinct-cognitive: per MA | decimal-division-6, long-division |
| `fluent-multi-digit-division` | Fluent Multi-Digit Division | 6 | distinct-cognitive: speed/accuracy | divide-multi-digit-6 |

**Strand total: 50 topics, ~70 prereq edges**

---

### ratios-proportions (17 → 45 topics, +28)

**Current topics:** ratios-intro, equivalent-ratios, ratio-tables, unit-rates, ratio-word-problems, percent-intro, percent-of-a-number, constant-of-proportionality, proportional-relationships, proportions-intro, percent-equations, percent-increase-decrease, percent-error, scale-drawings, simple-interest, tax-tip-markup, unit-rates-complex

**MA reference:**
- **Foundations I > Ratios & Percentages (46):** Applying Percentage Increases/Decreases, Calculating Percentage Change, Finding Original Values from % Increases/Decreases, Understanding Percentages Using Models, Converting %↔Fractions, %↔Decimals, Finding Part/Whole/Percentage (×6), Applying Percentages in Succession, Proportional Relationships (tables/graphs/descriptions), Direct/Inverse Variation (×4), Introduction to Ratios, Equivalent Ratios (×3), Writing Ratios Using Fractions, Ratio Tables, Graphing Ratios, Unit Rates (×3), Speed as Unit Rate, Units (length/mass/time/volume, ×4), Unit Conversions (×8), Degrees of Accuracy

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `ratios-part-to-part` | Part-to-Part Ratios | 6 | testable-in-isolation: vs part-to-whole | ratios-intro |
| `ratios-part-to-whole` | Part-to-Whole Ratios | 6 | testable-in-isolation | ratios-intro |
| `write-ratios-fractions` | Write Ratios Using Fractions | 6 | distinct-cognitive: per MA | ratios-intro |
| `graph-ratios` | Graph Ratios on Coordinate Plane | 6 | distinct-cognitive: per MA | equivalent-ratios, coordinate-plane |
| `reasoning-equivalent-ratios` | Reasoning with Equivalent Ratios | 6 | distinct-cognitive: per MA — extends beyond tables | equivalent-ratios |
| `speed-unit-rate` | Speed as a Unit Rate | 6 | distinct-cognitive: per MA specific application | unit-rates |
| `unit-rate-word-problems` | Unit Rate Word Problems | 6 | distinct-cognitive: extends basic | unit-rates |
| `percent-using-models` | Understanding Percent Using Models | 6 | remediation-useful: per MA visual | percent-intro |
| `convert-percent-fraction` | Convert Between Percents and Fractions | 6 | testable-in-isolation: per MA | percent-intro, fraction-decimal-equivalence |
| `convert-percent-decimal` | Convert Between Percents and Decimals | 6 | testable-in-isolation: per MA | percent-intro |
| `find-percent-of-number` | Find Percent of a Number | 6 | testable-in-isolation: split from existing | percent-of-a-number |
| `find-percent-of-number-word-problems` | Find Percent of a Number: Word Problems | 6 | distinct-cognitive: per MA | find-percent-of-number |
| `find-percent-given-two-numbers` | Find Percent Given Two Numbers | 6 | distinct-cognitive: per MA reverse direction | percent-of-a-number |
| `find-whole-given-part-percent` | Find Whole Given Part and Percent | 6 | distinct-cognitive: per MA reverse | percent-of-a-number |
| `proportional-relationships-tables` | Proportional Relationships Using Tables | 7 | remediation-useful: per MA representation-specific | proportional-relationships |
| `proportional-relationships-graphs` | Proportional Relationships Using Graphs | 7 | distinct-cognitive: per MA | proportional-relationships, graph-ratios |
| `proportional-relationships-descriptions` | Proportional Relationships from Descriptions | 7 | distinct-cognitive: per MA | proportional-relationships |
| `percent-increase` | Percent Increase | 7 | remediation-useful: split from combined | percent-increase-decrease |
| `percent-decrease` | Percent Decrease | 7 | remediation-useful | percent-increase |
| `calculate-percent-change` | Calculate Percent Change | 7 | distinct-cognitive: per MA — generalized | percent-increase, percent-decrease |
| `find-original-from-increase` | Find Original Value from Percent Increase | 7 | distinct-cognitive: per MA reverse | percent-increase |
| `find-original-from-decrease` | Find Original Value from Percent Decrease | 7 | distinct-cognitive: per MA reverse | percent-decrease |
| `successive-percents` | Apply Percentages in Succession | 7 | distinct-cognitive: per MA | percent-increase, percent-decrease |
| `direct-variation` | Direct Variation | 7 | distinct-cognitive: per MA | proportional-relationships, slope-intro |
| `inverse-variation` | Inverse Variation | 7 | distinct-cognitive: per MA | direct-variation |
| `discount-and-sale-price` | Discount and Sale Price | 7 | distinct-cognitive: specific application | percent-decrease |
| `commission` | Commission | 7 | distinct-cognitive: specific application | find-percent-of-number |
| `percent-word-problems-multi-step` | Multi-Step Percent Word Problems | 7 | grade-boundary | percent-equations, tax-tip-markup |

**Strand total: 45 topics, ~62 prereq edges**

---

### expressions-equations (22 → 55 topics, +33)

**Current topics:** algebraic-expressions-6, evaluate-expressions-6, equivalent-expressions-6, distributive-property, dependent-independent-variables, one-step-equations-add-sub, one-step-equations-mult-div, one-step-inequalities, equations-word-problems-6, combine-like-terms, expand-factor-expressions, two-step-equations, two-step-inequalities, equations-word-problems-7, multi-step-equations, equations-no-one-infinite, exponent-rules, negative-exponents, scientific-notation, scientific-notation-operations, irrational-numbers, cube-roots

**MA reference:**
- **Foundations I > Equations & Inequalities (50):** Intro to Algebraic Expressions, Constructing, Evaluating (linear + rational), Identifying Terms/Coefficients/Constants, GCF of Linear Expressions, Interpreting Linear Expressions, Modeling with Linear Equations, Solving Equations (square root, nth root), Identifying/Collecting Like Terms, Distributive Law (×5), Simplifying (×3), Factoring Linear Expressions, Inequalities, Compound Inequalities, Verifying Solutions, Solving Inequalities (1-step, 2-step, further), Representing on Number Lines, Compound Inequalities (AND/OR), Interval Notation, Unions/Intersections of Intervals, Solving Equations (2-step, fractional, decimal, variables both sides, cross-multiplication, clearing rational expressions), Two-Variable Equations, Infinitely Many/No Solutions, Unknown Coefficients (×2), Many-Variable Equations, Trial and Error
- **Prealgebra > Equations & Inequalities (29):** Cartesian Coordinate System, Distances Between Points, Two-Variable Equations, Graphing Linear Equations, Horizontal/Vertical Lines, Slopes, Slope-Intercept Form, Properties of Lines, Inequalities, Compound Inequalities, Solving Inequalities (×4), Representing on Number Lines, Solving Equations (×6), Two-Variable Equations, Infinitely Many/No Solutions

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `write-algebraic-expressions-6` | Write Algebraic Expressions (Grade 6) | 6 | testable-in-isolation: per MA constructing | algebraic-expressions-6 |
| `evaluate-rational-expressions` | Evaluate Expressions with Rational Numbers | 6 | distinct-cognitive: per MA | evaluate-expressions-6, add-subtract-rationals |
| `identify-terms-coefficients-6` | Identify Terms, Coefficients, Constants | 6 | remediation-useful: per MA vocabulary | algebraic-expressions-6 |
| `interpret-expressions` | Interpret Algebraic Expressions in Context | 6 | distinct-cognitive: per MA | algebraic-expressions-6 |
| `gcf-linear-expressions` | GCF of Two Linear Expressions | 6 | distinct-cognitive: per MA | equivalent-expressions-6, greatest-common-factor |
| `model-with-equations` | Model Real-World Situations with Equations | 6 | distinct-cognitive: per MA | equations-word-problems-6 |
| `verify-solutions` | Verify Solutions by Substitution | 6 | distinct-cognitive: per MA checking skill | one-step-equations-add-sub |
| `one-step-equations-word-problems` | One-Step Equation Word Problems | 6 | testable-in-isolation | one-step-equations-add-sub, one-step-equations-mult-div |
| `inequalities-on-number-line` | Represent Inequalities on Number Lines | 6 | distinct-cognitive: per MA visual | one-step-inequalities |
| `distributive-property-negative` | Distribute the Negative Sign | 7 | remediation-useful: per MA — common error | distributive-property |
| `simplify-expressions-fractions` | Simplify Linear Expressions with Fractions | 7 | distinct-cognitive: per MA | combine-like-terms, add-subtract-rationals |
| `factor-linear-expressions` | Factor Linear Expressions | 7 | distinct-cognitive: per MA | expand-factor-expressions |
| `equations-fractional-coefficients` | Solve Equations with Fractional Coefficients | 7 | distinct-cognitive: per MA | two-step-equations, multiply-divide-rationals |
| `equations-decimal-coefficients` | Solve Equations with Decimal Coefficients | 7 | distinct-cognitive: per MA | two-step-equations |
| `equations-variables-both-sides` | Solve Equations with Variables on Both Sides | 7 | distinct-cognitive: per MA | two-step-equations, combine-like-terms |
| `compound-inequalities` | Compound Inequalities (AND/OR) | 7 | distinct-cognitive: per MA | two-step-inequalities |
| `multi-step-inequalities` | Multi-Step Inequalities | 7 | distinct-cognitive: extends two-step | two-step-inequalities, distributive-property |
| `equations-cross-multiplication` | Solve Equations Using Cross-Multiplication | 7 | distinct-cognitive: per MA | proportions-intro, two-step-equations |
| `multi-step-equations-distributive` | Multi-Step Equations with Distributive Property | 8 | remediation-useful: per MA sub-skill | multi-step-equations, distributive-property |
| `multi-step-equations-combining` | Multi-Step Equations: Combining Like Terms | 8 | remediation-useful | multi-step-equations, combine-like-terms |
| `equations-word-problems-8` | Multi-Step Equation Word Problems (Grade 8) | 8 | grade-boundary | multi-step-equations |
| `product-rule-exponents` | Product Rule for Exponents | 8 | remediation-useful: per MA rule-by-rule split | exponent-rules |
| `quotient-rule-exponents` | Quotient Rule for Exponents | 8 | remediation-useful: per MA | exponent-rules |
| `power-rule-exponents` | Power Rule for Exponents | 8 | remediation-useful: per MA | exponent-rules |
| `power-of-product-rule` | Power of a Product Rule | 8 | distinct-cognitive: per MA | power-rule-exponents |
| `power-of-quotient-rule` | Power of a Quotient Rule | 8 | distinct-cognitive: per MA | power-rule-exponents |
| `combining-exponent-rules` | Combining Exponent Rules | 8 | testable-in-isolation: per MA synthesis | product-rule-exponents, quotient-rule-exponents, power-rule-exponents |
| `scientific-notation-read-write` | Read and Write Scientific Notation | 8 | remediation-useful: split from operations | scientific-notation |
| `scientific-notation-compare` | Compare Numbers in Scientific Notation | 8 | testable-in-isolation | scientific-notation |
| `scientific-notation-add-sub` | Add/Subtract in Scientific Notation | 8 | remediation-useful: split operations by type | scientific-notation-operations |
| `scientific-notation-mult-div` | Multiply/Divide in Scientific Notation | 8 | remediation-useful | scientific-notation-operations, product-rule-exponents |
| `estimate-with-scientific-notation` | Estimate Using Scientific Notation | 8 | distinct-cognitive | scientific-notation-compare |
| `square-root-equations` | Solve Equations Using Square Roots | 8 | distinct-cognitive: per MA | square-roots-intro, multi-step-equations |

**Encompassing edges:**
- `exponent-rules` (existing, becomes capstone) encompasses `product-rule-exponents`, `quotient-rule-exponents`, `power-rule-exponents`
- `scientific-notation-operations` encompasses `scientific-notation-add-sub`, `scientific-notation-mult-div`
- `multi-step-equations` encompasses `equations-variables-both-sides`, `equations-fractional-coefficients`

**Strand total: 55 topics, ~75 prereq edges**

---

### linear-functions (17 → 45 topics, +28)

**Current topics:** coordinate-plane-four-quadrants, graph-proportional-relationships, functions-intro, function-tables-rules, compare-linear-functions, linear-vs-nonlinear, qualitative-graphs, slope-intro, slope-types, y-intercept, slope-intercept-form, graph-linear-equations, write-linear-equations, systems-of-equations-intro, systems-substitution, systems-elimination, systems-word-problems

**MA reference:**
- **Foundations I > Two-Variable Equations (29):** Cartesian Coordinate System, Distances Between Points, Two-Variable Linear Equations and Solutions, Graphing Linear Equations, Horizontal/Vertical Lines, Calculating Slopes, Equations in Slope-Intercept/Point-Slope/Standard Form (×3), Properties of Lines (slope-intercept/standard, ×2), Parallel Lines in Coordinate Plane, Modeling with Linear Equations (×3), Analyzing/Interpreting Graphs, Distance-Time/Speed-Time Graphs (×3), Systems (intro, substitution, elimination ×3, fractional/decimal coefficients ×2, nonlinear using graphs, no/infinite solutions, consistency/dependency, intersection)
- **Foundations I > Functions (13):** Introduction to Functions, Visual Representations, Graphs of Functions, Domain, Range (×2), Global Extrema, End Behavior, Roots, Increasing/Decreasing, Piecewise, Modeling with Linear Functions, Constructing Linear Functions

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `four-quadrant-plotting` | Plot Points in Four Quadrants | 6 | remediation-useful: split from combined | coordinate-plane-four-quadrants |
| `distances-coordinate-plane` | Distances Between Points | 6 | distinct-cognitive: per MA | coordinate-plane-four-quadrants |
| `reflections-coordinate-plane` | Reflections in the Coordinate Plane | 6 | distinct-cognitive | coordinate-plane-four-quadrants |
| `proportional-relationships-graph` | Graph Proportional Relationships (y = kx) | 7 | testable-in-isolation | graph-proportional-relationships |
| `constant-rate-of-change` | Constant Rate of Change | 7 | distinct-cognitive: precursor to slope | graph-proportional-relationships |
| `functions-as-rules` | Functions as Rules (Input → Output) | 8 | distinct-cognitive: per MA | functions-intro |
| `function-notation` | Function Notation f(x) | 8 | distinct-cognitive: per MA | functions-intro |
| `domain-of-function` | Domain of a Function | 8 | distinct-cognitive: per MA | functions-intro |
| `range-of-function` | Range of a Function | 8 | distinct-cognitive: per MA | domain-of-function |
| `graphs-of-functions` | Graphs of Functions | 8 | distinct-cognitive: per MA | function-notation, graph-linear-equations |
| `increasing-decreasing-functions` | Increasing and Decreasing Functions | 8 | distinct-cognitive: per MA | graphs-of-functions |
| `calculate-slope` | Calculate Slope from Two Points | 8 | testable-in-isolation: formula-based | slope-intro |
| `slope-from-graph` | Determine Slope from a Graph | 8 | testable-in-isolation: visual | slope-intro |
| `slope-from-table` | Determine Slope from a Table | 8 | distinct-cognitive: tabular | slope-intro |
| `horizontal-vertical-lines` | Horizontal and Vertical Lines | 8 | distinct-cognitive: per MA | slope-types, graph-linear-equations |
| `point-slope-form` | Point-Slope Form | 8 | distinct-cognitive: per MA alternate form | slope-intercept-form |
| `standard-form-linear` | Standard Form of Linear Equations | 8 | distinct-cognitive: per MA | slope-intercept-form |
| `convert-between-forms` | Convert Between Forms of Linear Equations | 8 | testable-in-isolation | slope-intercept-form, point-slope-form, standard-form-linear |
| `parallel-lines-coordinate` | Parallel Lines in the Coordinate Plane | 8 | distinct-cognitive: per MA | calculate-slope, graph-linear-equations |
| `perpendicular-lines-coordinate` | Perpendicular Lines in the Coordinate Plane | 8 | distinct-cognitive: per MA | parallel-lines-coordinate |
| `write-equation-from-graph` | Write Equation from Graph | 8 | testable-in-isolation: reverse direction | graph-linear-equations, slope-intercept-form |
| `write-equation-from-points` | Write Equation from Two Points | 8 | testable-in-isolation | calculate-slope, point-slope-form |
| `model-with-linear-equations` | Model with Linear Equations | 8 | distinct-cognitive: per MA | write-linear-equations |
| `interpret-linear-graphs` | Analyze and Interpret Linear Graphs | 8 | distinct-cognitive: per MA | graph-linear-equations |
| `distance-time-graphs` | Distance-Time Graphs | 8 | distinct-cognitive: per MA | interpret-linear-graphs |
| `systems-by-graphing` | Solve Systems by Graphing | 8 | remediation-useful: visual method first | systems-of-equations-intro, graph-linear-equations |
| `systems-no-one-infinite` | Systems with No/One/Infinite Solutions | 8 | distinct-cognitive: per MA | systems-of-equations-intro |
| `systems-applications` | Systems of Equations: Applications | 8 | distinct-cognitive: per MA | systems-word-problems |

**Strand total: 45 topics, ~62 prereq edges**

---

### geometry-advanced (20 → 55 topics, +35)

**Current topics:** area-polygons, area-quadrilaterals, area-triangles, surface-area-prisms, volume-prisms, angle-relationships, area-circles, circumference, cross-sections, triangle-angle-sum, congruence-similarity, dilations, exterior-angles, parallel-lines-transversal, pythagorean-theorem, pythagorean-applications, pythagorean-converse, transformations-intro, volume-cones-spheres, volume-cylinders

**MA reference:**
- **Foundations I > Geometry Fundamentals (26):** Complementary, Supplementary, Corresponding, Alternate, Consecutive Angles, Angle/Segment Bisectors, Vertical Angles, Congruent Angles/Segments, Midpoints, Collinear Points, Segment Addition, Circles (arcs/sectors/segments), Circumference, Area of Circles
- **Foundations I > Polygons (21):** Area of Rectangles/Triangles/Trapezoids, Composite Shapes, Interior/Exterior Angles of Polygons, Congruent/Regular Polygons, Perimeter of Polygon, Classifying Quadrilaterals, Properties of Rectangles/Squares, Triangle Inequality, Isosceles Triangle Theorem, Heights of Triangles, Pythagorean Theorem, Special Right Triangles
- **Foundations II > Geometry (35):** Finding Equations of Parallel/Perpendicular Lines, Midpoints in Coordinate Plane, Distance Formula (2D + 3D), Translations, Rotations, Reflections (×2), Dilations (×2), Stretches (×2), Combining Transformations, Rigid Motions and Congruence, Similarity and Similar Polygons, Similarity Transformations, Reflective/Rotational Symmetry, 3D Shapes/Faces/Edges/Vertices, Nets, Surface Areas Using Nets, Volumes (Cubes, Rectangular Solids, Spheres, Cylinders), Surface Areas (Cubes, Spheres, Cylinders), Euler's Formula, Platonic Solids

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `area-trapezoids` | Area of Trapezoids | 6 | testable-in-isolation: per MA specific formula | area-quadrilaterals |
| `area-composite-advanced` | Area of Composite Shapes (Grade 6+) | 6 | distinct-cognitive: extends K-5 composite | area-polygons |
| `corresponding-angles` | Corresponding Angles | 7 | remediation-useful: per MA angle-type split | parallel-lines-transversal |
| `alternate-angles` | Alternate Interior/Exterior Angles | 7 | remediation-useful: per MA | parallel-lines-transversal |
| `consecutive-angles` | Consecutive (Co-Interior) Angles | 7 | distinct-cognitive: per MA | parallel-lines-transversal |
| `vertical-angles` | Vertical Angles | 7 | testable-in-isolation: per MA | angle-relationships |
| `angle-bisectors` | Angle Bisectors | 7 | distinct-cognitive: per MA | angle-relationships |
| `interior-angles-polygons` | Interior Angles of Polygons | 7 | distinct-cognitive: per MA generalized | triangle-angle-sum |
| `exterior-angles-polygons` | Exterior Angles of Polygons | 7 | distinct-cognitive: per MA | interior-angles-polygons |
| `regular-polygons-advanced` | Properties of Regular Polygons | 7 | distinct-cognitive: per MA | interior-angles-polygons |
| `congruent-polygons` | Congruent Polygons | 7 | distinct-cognitive: per MA | congruence-similarity |
| `triangle-inequality` | Triangle Inequality Theorem | 7 | distinct-cognitive: per MA | classify-triangles |
| `isosceles-triangle-theorem` | Isosceles Triangle Theorem | 7 | distinct-cognitive: per MA | classify-triangles-sides, triangle-angle-sum |
| `heights-of-triangles` | Heights of Triangles | 7 | distinct-cognitive: per MA | area-triangles |
| `arc-length` | Arc Length | 7 | distinct-cognitive: per MA | circumference |
| `sector-area` | Area of Sectors | 7 | distinct-cognitive: per MA | area-circles |
| `translations` | Translations | 8 | remediation-useful: split from combined transformations | transformations-intro |
| `reflections` | Reflections | 8 | remediation-useful | transformations-intro |
| `rotations` | Rotations | 8 | remediation-useful | transformations-intro |
| `combining-transformations` | Combining Transformations | 8 | testable-in-isolation: per MA | translations, reflections, rotations |
| `rigid-motions-congruence` | Rigid Motions and Congruence | 8 | distinct-cognitive: per MA formal definition | combining-transformations, congruence-similarity |
| `similarity-transformations` | Similarity Transformations | 8 | distinct-cognitive: per MA | dilations, rigid-motions-congruence |
| `similar-polygons` | Similar Polygons | 8 | distinct-cognitive: per MA | congruence-similarity, dilations |
| `dilation-scale-factor` | Dilation with Scale Factor | 8 | testable-in-isolation: per MA | dilations |
| `dilations-coordinate-plane` | Dilations in the Coordinate Plane | 8 | distinct-cognitive: per MA | dilation-scale-factor, coordinate-plane-four-quadrants |
| `pythagorean-proof` | Understand Pythagorean Theorem Proof | 8 | distinct-cognitive: conceptual understanding | pythagorean-theorem |
| `pythagorean-3d` | Pythagorean Theorem in 3D | 8 | distinct-cognitive | pythagorean-applications |
| `distance-formula` | The Distance Formula | 8 | distinct-cognitive: per MA | pythagorean-theorem, coordinate-plane-four-quadrants |
| `midpoint-formula` | Midpoint Formula | 8 | distinct-cognitive: per MA | distance-formula |
| `surface-area-cylinders` | Surface Area of Cylinders | 8 | testable-in-isolation: per MA | volume-cylinders, circumference |
| `surface-area-pyramids` | Surface Area of Pyramids | 8 | distinct-cognitive | area-triangles, surface-area-prisms |
| `volume-pyramids` | Volume of Pyramids | 8 | distinct-cognitive | volume-prisms |
| `surface-area-cones` | Surface Area of Cones | 8 | distinct-cognitive | volume-cones-spheres, circumference |
| `surface-area-spheres` | Surface Area of Spheres | 8 | distinct-cognitive: per MA | volume-cones-spheres |
| `cross-sections-3d` | Cross-Sections of 3D Figures (Detailed) | 8 | distinct-cognitive: per MA | cross-sections |

**Encompassing edges:**
- `pythagorean-applications` encompasses `pythagorean-theorem`, `distance-formula`
- `transformations-intro` (existing, becomes capstone) encompasses `translations`, `reflections`, `rotations`
- `congruence-similarity` encompasses `rigid-motions-congruence`, `similar-polygons`

**Strand total: 55 topics, ~78 prereq edges**

---

### statistics-probability (14 → 45 topics, +31)

**Current topics:** statistical-questions, dot-plots-histograms, measures-of-center, measures-of-variability, box-plots, summarize-data, probability-intro, experimental-probability, compound-probability, compare-populations, sampling-inference, scatter-plots, line-of-best-fit, two-way-tables

**MA reference:**
- **Foundations II > Statistics (14):** Mean, Variance and Standard Deviation, Estimating Means for Grouped Data, Covariance, Sums of Squares, Z-Score, Scatter Plots, Trend Lines (×2), Linear Correlation (×2), Linear Regression, Residuals and Residual Plots, Selecting Regression Model
- **Foundations II > Probability & Combinatorics (18):** Rules of Sum and Product, Factorials (×2), Ordering Objects, Permutations, Combinations, Computing Probabilities Using Combinatorics, Union/Intersection of Sets (×2), Compound Events from Experimental Data, Venn Diagrams in Probability (×3), Sets, Probability from Experimental Data, Sample Spaces and Events, Single Events, Complement of an Event
- **Prealgebra > Statistics (22):** (overlaps with above, adds more at 6-8 level)

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `collect-organize-data` | Collect and Organize Data | 6 | remediation-useful: precursor to analysis | statistical-questions |
| `frequency-tables` | Frequency Tables | 6 | distinct-cognitive: tabular representation | collect-organize-data |
| `dot-plots` | Dot Plots | 6 | remediation-useful: split from combined | dot-plots-histograms |
| `histograms` | Histograms | 6 | remediation-useful | dot-plots-histograms |
| `mean` | Mean (Average) | 6 | remediation-useful: split from combined | measures-of-center |
| `median` | Median | 6 | remediation-useful | measures-of-center |
| `mode` | Mode | 6 | remediation-useful | measures-of-center |
| `mean-from-frequency-table` | Mean from Frequency Table | 6 | distinct-cognitive: per MA grouped data | mean, frequency-tables |
| `range` | Range of a Data Set | 6 | testable-in-isolation: split from variability | measures-of-variability |
| `interquartile-range` | Interquartile Range (IQR) | 6 | testable-in-isolation | measures-of-variability, median |
| `mean-absolute-deviation` | Mean Absolute Deviation (MAD) | 6 | distinct-cognitive | mean, measures-of-variability |
| `create-box-plots` | Create Box Plots | 6 | testable-in-isolation: creation vs reading | box-plots |
| `interpret-box-plots` | Interpret Box Plots | 6 | testable-in-isolation | box-plots |
| `choose-appropriate-measure` | Choose Appropriate Measure of Center | 6 | distinct-cognitive: judgment skill | mean, median, mode |
| `describe-data-distribution` | Describe Data Distributions (Shape, Center, Spread) | 6 | distinct-cognitive: synthesis | summarize-data |
| `outliers` | Identify and Explain Outliers | 6 | distinct-cognitive | mean, interquartile-range |
| `sample-space` | Sample Space | 7 | distinct-cognitive: per MA foundational concept | probability-intro |
| `theoretical-probability` | Theoretical Probability | 7 | testable-in-isolation: vs experimental | probability-intro |
| `complement-of-event` | Complement of an Event | 7 | distinct-cognitive: per MA | theoretical-probability |
| `probability-of-compound-events` | Probability of Compound Events (Independent) | 7 | remediation-useful: independent vs dependent | compound-probability |
| `probability-dependent-events` | Probability of Dependent Events | 7 | distinct-cognitive | probability-of-compound-events |
| `probability-simulations` | Probability Simulations | 7 | distinct-cognitive | experimental-probability |
| `tree-diagrams` | Tree Diagrams | 7 | distinct-cognitive: counting tool | compound-probability |
| `fundamental-counting-principle` | Fundamental Counting Principle | 7 | distinct-cognitive: per MA Rules of Sum and Product | tree-diagrams |
| `random-sampling` | Random Sampling Methods | 7 | remediation-useful: split from inference | sampling-inference |
| `make-inferences` | Make Inferences from Samples | 7 | testable-in-isolation: per MA | random-sampling, mean |
| `compare-populations-measures` | Compare Populations Using Measures | 7 | distinct-cognitive: extends basic comparison | compare-populations, mean, interquartile-range |
| `scatter-plots-association` | Scatter Plots: Positive, Negative, No Association | 8 | remediation-useful: split from combined | scatter-plots |
| `trend-lines` | Trend Lines and Predictions | 8 | testable-in-isolation: per MA | line-of-best-fit |
| `interpret-slope-intercept-scatter` | Interpret Slope and Intercept in Context | 8 | distinct-cognitive | line-of-best-fit, slope-intercept-form |
| `two-way-relative-frequency` | Two-Way Relative Frequency Tables | 8 | distinct-cognitive | two-way-tables, percent-of-a-number |

**Encompassing edges:**
- `measures-of-center` encompasses `mean`, `median`, `mode`
- `measures-of-variability` encompasses `range`, `interquartile-range`
- `compound-probability` encompasses `probability-of-compound-events`, `probability-dependent-events`

**Strand total: 45 topics, ~62 prereq edges**

---

### polynomials-intro (7 → 20 topics, +13)

**Current topics:** monomials, polynomials-classify, add-subtract-polynomials, multiply-polynomials-monomial, multiply-binomials, factor-gcf-polynomials, special-products

**MA reference:**
- **Foundations I > Polynomials (20):** GCF of Two Monomials, Factoring Using GCFs, Factoring Perfect Square Trinomials (×2), Factoring Differences of Squares, Factoring Trinomials (×4), Intro to Polynomials, Degree, Simplifying, Distributive Law for Polynomials, Adding/Subtracting, Monomials/Binomials/Trinomials, Multiplying Binomials/Polynomials, Squaring Binomials, Expanding Using Pascal's Triangle, Difference of Squares Formula

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `degree-of-polynomial` | Degree of a Polynomial | 8 | distinct-cognitive: per MA | polynomials-classify |
| `simplify-polynomials` | Simplify Polynomials | 8 | testable-in-isolation: per MA | add-subtract-polynomials, combine-like-terms |
| `distributive-law-polynomials` | Distributive Law for Polynomials | 8 | distinct-cognitive: per MA | multiply-polynomials-monomial |
| `multiply-polynomials` | Multiply Polynomials (General) | 8 | distinct-cognitive: per MA beyond monomial × poly | multiply-binomials |
| `square-binomials` | Square Binomials | 8 | distinct-cognitive: per MA | multiply-binomials |
| `difference-of-squares-formula` | Difference of Squares Formula | 8 | distinct-cognitive: per MA pattern recognition | multiply-binomials |
| `factor-difference-of-squares` | Factor Difference of Squares | 8 | distinct-cognitive: per MA | difference-of-squares-formula, factor-gcf-polynomials |
| `factor-perfect-square-trinomials` | Factor Perfect Square Trinomials | 8 | distinct-cognitive: per MA | square-binomials, factor-gcf-polynomials |
| `factor-trinomials-a-equals-1` | Factor Trinomials (a = 1) | 8 | remediation-useful: per MA leading coefficient split | factor-gcf-polynomials, multiply-binomials |
| `factor-trinomials-a-not-1` | Factor Trinomials (a ≠ 1) | 8 | distinct-cognitive: per MA | factor-trinomials-a-equals-1 |
| `gcf-of-monomials` | GCF of Two Monomials | 8 | distinct-cognitive: per MA | monomials, greatest-common-factor |
| `factor-by-grouping` | Factor by Grouping | 8 | distinct-cognitive: per MA | factor-gcf-polynomials |
| `closure-properties-polynomials` | Closure Properties of Polynomials | 8 | distinct-cognitive: per MA conceptual | add-subtract-polynomials, multiply-polynomials |

**Encompassing edges:**
- `multiply-polynomials` encompasses `multiply-binomials`, `multiply-polynomials-monomial`
- `special-products` encompasses `square-binomials`, `difference-of-squares-formula`

**Strand total: 20 topics, ~28 prereq edges**

---

### exponents-radicals (NEW strand, 0 → 35 topics, +35)

**Current:** No dedicated strand. Some exponent topics exist in expressions-equations (exponent-rules, negative-exponents) and number-base (exponents-intro, powers-of-ten).

**MA reference:**
- **5th Grade > Exponents (10):** Powers of Ten, Multiplying by Powers of Ten (×2), Introduction to Exponents, Evaluating Exponents, Evaluating Larger Exponents, Evaluating with Fractional/Decimal Bases, Comparing Exponents, Evaluating Expressions with Exponents
- **Foundations I > Exponents & Radicals (32):** All of the above plus: Squaring/Cubing Rationals, Exponents with Rational Bases, Zeroth Power, Powers of Negative One, Negative Exponents, Evaluating Expressions with Integer Exponents, Square Roots of Perfect Squares, Squaring a Square Root, Cube Roots of Perfect Cubes, Surds, Simplifying Surds, Evaluating with Radicals, Adding/Subtracting Radicals, Rationalizing Denominators, Product/Quotient/Power Rules (×5), Combining Rules, Radicals as Fractional Exponents, Product/Quotient Rules for Radicals

Note: We already have some exponent content scattered across strands. This new strand provides a dedicated home for the progression. The existing topics in expressions-equations and number-base will gain cross-strand prerequisite edges to this strand.

**New topics:**

| ID | Name | Grade | Heuristic | Prereqs |
|----|------|-------|-----------|---------|
| `evaluating-exponents` | Evaluate Exponents (Whole Number Bases) | 5 | testable-in-isolation: per MA split from intro | exponents-intro |
| `evaluating-larger-exponents` | Evaluate Larger Exponents | 5 | distinct-cognitive: per MA | evaluating-exponents |
| `exponents-fractional-bases` | Exponents with Fractional Bases | 5 | distinct-cognitive: per MA | evaluating-exponents, multiply-fractions |
| `exponents-decimal-bases` | Exponents with Decimal Bases | 5 | distinct-cognitive: per MA | evaluating-exponents, multiply-decimals |
| `compare-exponents` | Compare Exponent Expressions | 5 | distinct-cognitive: per MA | evaluating-exponents |
| `expressions-with-exponents-5` | Evaluate Expressions with Exponents (Grade 5) | 5 | testable-in-isolation: per MA | evaluating-exponents, order-of-operations |
| `squaring-rationals` | Squaring Rational Numbers | 6 | distinct-cognitive: per MA | evaluating-exponents, multiply-divide-rationals |
| `cubing-rationals` | Cubing Rational Numbers | 6 | distinct-cognitive: per MA | squaring-rationals |
| `exponents-rational-bases` | Exponents with Rational Bases | 7 | distinct-cognitive: per MA | cubing-rationals |
| `zeroth-power` | The Zeroth Power | 7 | distinct-cognitive: per MA special case | evaluating-exponents |
| `powers-of-negative-one` | Powers of Negative One | 7 | distinct-cognitive: per MA | exponents-rational-bases |
| `negative-exponents-intro` | Introduction to Negative Exponents | 7 | distinct-cognitive: per MA (precursor to expressions-equations negative-exponents) | zeroth-power |
| `evaluate-integer-exponents` | Evaluate Expressions with Integer Exponents | 7 | testable-in-isolation: per MA | negative-exponents-intro |
| `evaluate-positive-integer-exponents` | Evaluate Expressions with Positive Integer Exponents | 6 | testable-in-isolation: per MA | evaluating-exponents |
| `square-root-perfect-square` | Square Root of a Perfect Square | 8 | testable-in-isolation: per MA | squaring-rationals |
| `squaring-a-square-root` | Squaring a Square Root | 8 | distinct-cognitive: per MA inverse | square-root-perfect-square |
| `cube-root-perfect-cube` | Cube Root of a Perfect Cube | 8 | distinct-cognitive: per MA | cubing-rationals |
| `simplify-radicals` | Simplify Radicals (Surds) | 8 | distinct-cognitive: per MA | square-root-perfect-square |
| `add-subtract-radicals` | Add and Subtract Radicals | 8 | distinct-cognitive: per MA | simplify-radicals |
| `multiply-radicals` | Multiply Radicals | 8 | distinct-cognitive | simplify-radicals |
| `divide-radicals` | Divide Radicals | 8 | distinct-cognitive | multiply-radicals |
| `rationalize-denominators` | Rationalize Denominators | 8 | distinct-cognitive: per MA | divide-radicals |
| `evaluate-radical-expressions` | Evaluate Expressions with Radicals | 8 | testable-in-isolation: per MA | simplify-radicals |
| `product-rule-exponents-er` | Product Rule for Exponents | 7 | remediation-useful: per MA rule-by-rule | evaluating-exponents |
| `quotient-rule-exponents-er` | Quotient Rule for Exponents | 7 | remediation-useful | product-rule-exponents-er |
| `power-rule-exponents-er` | Power Rule for Exponents | 7 | remediation-useful | product-rule-exponents-er |
| `power-of-product-rule-er` | Power of a Product Rule | 7 | distinct-cognitive: per MA | power-rule-exponents-er |
| `power-of-quotient-rule-er` | Power of a Quotient Rule | 7 | distinct-cognitive | power-rule-exponents-er |
| `combining-exponent-rules-er` | Combining Exponent Rules | 8 | testable-in-isolation | product-rule-exponents-er, quotient-rule-exponents-er, power-rule-exponents-er |
| `radicals-as-fractional-exponents` | Radicals as Fractional Exponents | 8 | distinct-cognitive: per MA | simplify-radicals, negative-exponents-intro |
| `product-rule-radicals` | Product Rule for Radicals | 8 | distinct-cognitive: per MA | multiply-radicals |
| `quotient-rule-radicals` | Quotient Rule for Radicals | 8 | distinct-cognitive: per MA | divide-radicals |
| `scientific-notation-exponents` | Scientific Notation and Exponents | 8 | distinct-cognitive: bridge topic | evaluate-integer-exponents, scientific-notation |
| `exponential-growth-decay-intro` | Introduction to Exponential Growth/Decay | 8 | distinct-cognitive: application | evaluating-exponents, graph-linear-equations |
| `compare-linear-exponential` | Compare Linear and Exponential Growth | 8 | distinct-cognitive | exponential-growth-decay-intro, linear-vs-nonlinear |

**Note on duplicates:** The exponent rules topics here (product-rule-exponents-er, etc.) overlap with expressions-equations exponent topics. Resolution: the exponents-radicals strand owns the rule-learning topics; expressions-equations topics (product-rule-exponents, etc.) become applications that require the exponents-radicals versions as prerequisites. This avoids duplicate content — the exponents-radicals version teaches the rule, the expressions-equations version applies it in equation contexts.

**Cross-strand prerequisite edges:**
- expressions-equations `exponent-rules` → requires exponents-radicals `combining-exponent-rules-er`
- expressions-equations `negative-exponents` → requires exponents-radicals `negative-exponents-intro`
- rational-numbers `square-roots-intro` → requires exponents-radicals `square-root-perfect-square`
- rational-numbers `cube-roots` → requires exponents-radicals `cube-root-perfect-cube`

**Strand total: 35 topics, ~50 prereq edges**

---

### Wave 3 Summary

| Strand | Current | New | Total | MA Comparable |
|--------|---------|-----|-------|---------------|
| rational-numbers | 18 | 32 | 50 | 28 (Foundations I NS) |
| ratios-proportions | 17 | 28 | 45 | 46 (Foundations I R&P) |
| expressions-equations | 22 | 33 | 55 | 50 + 29 = 79 (deduped ~55) |
| linear-functions | 17 | 28 | 45 | 29 + 13 = 42 (Foundations I TV + F) |
| geometry-advanced | 20 | 35 | 55 | 26 + 21 + 35 = 82 (deduped ~55) |
| statistics-probability | 14 | 31 | 45 | 14 + 18 + 22 = 54 (deduped ~40) |
| polynomials-intro | 7 | 13 | 20 | 20 (Foundations I Polynomials) |
| exponents-radicals (NEW) | 0 | 35 | 35 | 10 + 32 = 42 (5th Exp + Found I E&R) |
| **Wave 3 Total** | **115** | **235** | **350** | |

---

## Grand Total

| Wave | Current | New | Total |
|------|---------|-----|-------|
| Wave 1: Foundational Operations | 28 | 87 | 115 |
| Wave 2: K-5 Domain Strands | 64 | 171 | 235 |
| Wave 3: 6-8 Domain Strands | 115 | 235 | 350 |
| **Grand Total** | **207** | **493** | **700** |

**Expected final with cross-strand gap-fill (Phase 5): ~750-850 topics**

### Comparison with MA

| Metric | MA K-8 (deduped) | Our Target | Ratio |
|--------|-------------------|------------|-------|
| Total topics | ~1277 | ~750-850 | 0.59-0.67x |
| Topics per strand (avg) | ~75 | ~44 | 0.59x |
| Prereq edge density | 1.85/topic | 1.5-2.5/topic | comparable |

**Why we're smaller than MA:**
1. MA includes significant high school content in "Foundations" (trig, conic sections, calculus intro) — we exclude these
2. MA splits model-based and procedural variants more aggressively — we consolidate where the model is not independently testable
3. MA has separate word problem topics for nearly every procedural topic — we include word problems selectively where the language/context adds genuine cognitive demand
4. Our counting-cardinality and early K-2 coverage is lighter than MA's 4th Grade starting point

**Where we exceed MA's density:**
- counting-cardinality (MA doesn't cover K-2 explicitly)
- K-2 operations (MA starts at 4th Grade)
- Statistics-probability (we aim for fuller 6-8 coverage than MA's Prealgebra)

### Quality Gates for Phase 2-4 Implementation

When implementing each wave, verify:
1. Every new topic has a unique testable skill (can a student pass A and fail B?)
2. No topic is trivially easy for its grade level (would a student at grade level already know this?)
3. Prerequisite chains respect grade boundaries (no backward edges)
4. Every strand has at least 1 capstone with encompassing children
5. Prereq density stays in 1.5-2.5 range per topic
6. All topic IDs follow kebab-case convention, unique across entire graph

---

## Plan 029 Phase 0 Expansion (705 → 772 topics)

> **Date:** 2026-03-14
> **Method:** MathAcademy K-8 comparison (courses 75, 30, 99, 113, 111; ~955 unique topics)
> **Script:** `tools/expand-graph.py`

### Compound Topic Splits (+7 net topics)

Compound topics violating the testable-in-isolation heuristic were split:

| Old Topic | New Topics | Heuristic |
|-----------|------------|-----------|
| `add-subtract-rationals` | `add-rationals`, `subtract-rationals` | testable-in-isolation: addition vs subtraction are distinct skills |
| `multiply-divide-rationals` | `multiply-rationals`, `divide-rationals` | testable-in-isolation: sign rules for mult vs reciprocal for div |
| `compare-order-integers` | `compare-integers`, `order-integers` | testable-in-isolation: pairwise comparison vs sequence ordering |
| `compare-order-rationals` | `compare-rationals`, `order-rationals-6` | testable-in-isolation: same as integers but with fractions/decimals |
| `add-subtract-polynomials` | `add-polynomials`, `subtract-polynomials` | testable-in-isolation: distributing negative sign is a distinct skill |
| `add-subtract-radicals` | `add-radicals`, `subtract-radicals` | testable-in-isolation |
| `gcf-lcm-applications` | `gcf-applications`, `lcm-applications` | remediation-useful: GCF (grouping) vs LCM (scheduling) are distinct contexts |

### New Topics Added (+60 topics)

| Strand | Count | Key Additions |
|--------|-------|---------------|
| statistics-probability | +6 | quartiles-iqr, compare-data-center, compare-data-spread, symmetry-skew-data, dot-plot-measures, variance-std-dev |
| geometry-advanced | +11 | segment-bisectors, congruent-segments, congruent-angles, midpoints, midpoints-coordinate, triangle-inequality-theorem, exterior-angles-triangles, collinear-points, segment-addition-postulate, nets-polyhedrons, faces-vertices-edges |
| operations-division | +5 | interpreting-remainders, division-area-model, division-partial-quotients, divide-by-two-digit, divide-larger-numbers |
| measurement-data | +8 | units-of-length, units-of-volume-capacity, convert-customary-length, convert-metric-length, convert-units-mass, convert-units-volume, convert-units-time, convert-units-area |
| operations-multiplication | +3 | multiply-place-value, multiply-ending-zeros, multiply-repeated-addition |
| ratios-proportions | +4 | equivalent-ratios-advanced, graphing-ratios, find-original-from-percent-increase, find-original-from-percent-decrease |
| expressions-equations | +4 | equations-unknown-coefficients, equations-clearing-fractions, interval-notation, equations-trial-error |
| linear-functions | +3 | modeling-linear-equations, consistency-dependency-systems, two-variable-equations-solutions |
| counting-cardinality | +3 | count-forward-from, count-by-twos, count-by-fives |
| algebra-thinking | +3 | represent-comparisons-equations, generating-patterns, graphing-patterns |
| rational-numbers | +3 | natural-integers-rationals, reciprocals-intro, divisibility-rules-3-6-9 |
| exponents-radicals | +2 | larger-exponents, exponents-whole-expressions |
| statistics-probability | +4 | sample-spaces-events, experimental-probability-data, complement-events, venn-diagrams-probability |
| polynomials-intro | +1 | polynomial-expressions |

### Post-Expansion Stats

| Metric | Before | After |
|--------|--------|-------|
| Total topics | 705 | 772 |
| Prerequisite edges | 1,001 | 1,130 |
| Encompassing edges | 711 | 738 |
| Prereq density | 1.42/topic | 1.46/topic |
| Encompassing density | 1.01/topic | 0.96/topic |

### Compound Topics Retained as Consolidation

The following compound topics were NOT split because they already have separate child topics as dependents/encompassed, serving as consolidation practice nodes:
- `add-subtract-fractions` (has `add-fractions-like-denom` + `subtract-fractions-like-denom`)
- `add-subtract-mixed-numbers` (has `add-mixed-numbers-like-denom` + `subtract-mixed-numbers-like-denom`)
- `add-subtract-fractions-unlike` (has `add-fractions-unlike-denom` + `subtract-fractions-unlike-denom`)
- `dot-plots-histograms` (has `dot-plots` + `histograms`)
- `decimal-operations` (has individual decimal op topics)
- `factors-multiples` (has `greatest-common-factor` + `least-common-multiple`)

### MA Topics Intentionally Excluded

- Trigonometry (52 MA topics) — beyond grade 8
- Calculus intro (30 topics) — beyond grade 8
- Complex numbers, logarithms, sequences — beyond grade 8
- Model-based variants (e.g., "Using Models" for every operation) — model is the same skill with a visual aid
- Per-digit-count progressions beyond 3 levels (2-digit, 3-digit, multi-digit is sufficient)
