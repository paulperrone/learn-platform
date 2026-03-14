# Atomicity Audit — Math (705 topics)

**Date:** 2026-03-12  **Topics assessed:** 705

## Summary

| Verdict | Count | % |
|---------|-------|---|
| atomic | 476 | 67.5% |
| should-split | 17 | 2.4% |
| should-merge | 197 | 27.9% |
| review | 15 | 2.1% |

## Heuristic Fail Rates

| Heuristic | Fail Rate |
|-----------|-----------|
| Testable In Isolation | 4.1% |
| Distinct Cognitive Demand | 28.4% |
| Platform Compatible | 0.9% |
| Grade Boundary Natural | 0.3% |
| Remediation Useful | 16.9% |

## Per-Strand Breakdown

| Strand | Total | Atomic | Split | Merge | Review |
|--------|-------|--------|-------|-------|--------|
| algebra-thinking | 26 | 19 | 0 | 7 | 0 |
| counting-cardinality | 15 | 10 | 0 | 3 | 2 |
| exponents-radicals | 35 | 32 | 0 | 3 | 0 |
| expressions-equations | 55 | 25 | 0 | 30 | 0 |
| fractions | 66 | 35 | 0 | 28 | 3 |
| geometry | 51 | 36 | 1 | 13 | 1 |
| geometry-advanced | 55 | 44 | 3 | 7 | 1 |
| linear-functions | 47 | 34 | 1 | 12 | 0 |
| measurement-data | 35 | 30 | 1 | 1 | 3 |
| number-base | 55 | 34 | 3 | 18 | 0 |
| operations-addition | 25 | 22 | 2 | 0 | 1 |
| operations-division | 25 | 23 | 0 | 2 | 0 |
| operations-multiplication | 30 | 24 | 1 | 4 | 1 |
| operations-subtraction | 20 | 19 | 0 | 0 | 1 |
| polynomials-intro | 20 | 19 | 1 | 0 | 0 |
| rational-numbers | 51 | 18 | 3 | 30 | 0 |
| ratios-proportions | 47 | 18 | 0 | 29 | 0 |
| statistics-probability | 47 | 34 | 1 | 10 | 2 |

## Split Recommendations (17)

| Topic | Recommendation |
|-------|----------------|
| `decimal-operations` | Already partially addressed: add-decimals, subtract-decimals, multiply-decimals-whole, multiply-decimals, divide-decimal |
| `volume-cones-spheres` | Split into: (1) Volume of Cones (V = 1/3*pi*r^2*h), (2) Volume of Spheres (V = 4/3*pi*r^3). Different formulas, differen |
| `congruence-similarity` | Split into: (1) Congruence (same shape and size), (2) Similarity (same shape, proportional size). Different criteria (SS |
| `factors-multiples` | Already partially addressed: prime-composite-numbers exists as a separate dependent topic. However, factors-multiples it |
| `add-subtract-word-problems-1` | This topic overlaps with 'Addition Word Problems: Join/Combine', 'Addition Word Problems: Compare', 'Subtraction Word Pr |
| `estimation-addition-subtraction` | This topic is redundant with the existing 'Estimate Sums' (estimation-addition) and 'Estimate Differences' (estimation-s |
| `multi-digit-add-sub` | However, this topic has prerequisites Add Within 1000 and Subtract Within 1000 which already separate the operations. Th |
| `tell-time-minute` | However, the elapsed-time topic already exists separately. The description says 'Solve elapsed time problems' but the se |
| `estimation-multiplication-division` | However, separate estimate-products (estimation-multiplication) and estimate-quotients (estimation-division) topics alre |
| `coordinate-plane-four-quadrants` | Split into: (1) Plotting/identifying points in four quadrants, (2) Reflections across axes, (3) Distances between points |
| `monomials` | Split into: (1) Identifying and classifying monomials, (2) Multiplying and dividing monomials. Identification is concept |
| `classify-triangles` | Already addressed: classify-triangles-sides and classify-triangles-angles exist as separate sub-topics. This parent topi |
| `add-subtract-rationals` | Add Rational Numbers (fractions and decimals with negatives) / Subtract Rational Numbers (fractions and decimals with ne |
| `multiply-divide-rationals` | Multiply Rational Numbers (fractions and decimals) / Divide Rational Numbers (fractions and decimals) |
| `transformations-intro` | Already has sub-topics translations, reflections, rotations; this parent covers all three with distinct procedures. |
| `dot-plots-histograms` | Already has sub-topics dot-plots and histograms; this parent could be removed if sub-topics are sufficient. |
| `decimal-division-6` | Add/Subtract Multi-Digit Decimals / Multiply Multi-Digit Decimals / Divide Multi-Digit Decimals |

## Merge Recommendations (197 total)

### Key Merge Patterns

1. **Fractions operation sub-splits** (~40 topics): add-only/subtract-only sub-cases already covered by combined parent topics (add-subtract-fractions-like-denom etc.)
2. **Skip-counting sub-topics** (3 topics): count-by-2s, count-by-5s, count-by-10s should consolidate into skip-counting-intro
3. **Fluency variants** (2 topics): add/subtract-within-100-fluent — fluency is a performance criterion, not a distinct skill
4. **Decimal place value** (2 topics): decimal-place-value-tenths/hundredths overlap with decimals-intro
5. **Linear-functions slope sub-topics** (12 topics): calculate-slope, slope-from-graph, slope-from-table duplicate parent slope topic
6. **Statistics individual measures** (3 topics): mean, median, mode as separate topics duplicate measures-of-center
7. **Algebra duplicates** (5 topics): multi-step-word-problems-4ops duplicates multi-step-word-problems; intro-algebraic-expressions subsumed by variables-expressions

### High-Confidence Merge Candidates (confidence ≥ 0.8)

| Topic | Merge Target |
|-------|--------------|
| `additive-inverses` | Merge into number-line-opposites (Opposites and Additive Inverse) |
| `fluent-multi-digit-division` | Merge into divide-multi-digit-6 (appears to be a duplicate) |
| `find-percent-of-number` | Merge into percent-of-a-number |
| `calculate-percent-change` | Merge into percent-increase-decrease |
| `write-algebraic-expressions-6` | Merge into algebraic-expressions-6 |
| `multi-step-word-problems-4ops` | Merge with multi-step-word-problems — these are duplicate topics. |
| `multiply-fractions-procedural` | Merge with multiply-fractions — this IS the procedure for multiplying fractions. |
| `divide-fractions-procedural` | Merge with divide-fractions — this IS the procedure for dividing fractions. |
| `mixed-number-conversions` | Merge with improper-fractions-mixed-numbers — identical topic scope. |
| `add-positive-to-negative` | Merge into integer-addition |
| `add-negative-number` | Merge into integer-addition |
| `subtract-negative-number` | Merge into integer-subtraction |
| `subtract-positive-from-smaller` | Merge into integer-subtraction |
| `multiply-positive-negative` | Merge into integer-multiplication |
| `divide-with-negatives` | Merge into integer-division |
| `compare-rationals-number-line` | Merge into compare-order-rationals |
| `order-rationals` | Merge into compare-order-rationals |
| `square-root-perfect-squares` | Merge into square-roots-intro |
| `ratios-part-to-part` | Merge into ratios-intro |
| `ratios-part-to-whole` | Merge into ratios-intro |
| `write-ratios-fractions` | Merge into ratios-intro |
| `speed-unit-rate` | Merge into unit-rates |
| `convert-percent-fraction` | Merge into percent-intro |
| `convert-percent-decimal` | Merge into percent-intro |
| `percent-increase` | Merge into percent-increase-decrease |
| `percent-decrease` | Merge into percent-increase-decrease |
| `discount-and-sale-price` | Merge into tax-tip-markup |
| `model-with-equations` | Merge into equations-word-problems-6 |
| `inequalities-on-number-line` | Merge into one-step-inequalities |
| `factor-linear-expressions` | Merge into expand-factor-expressions |

## Review Cases (15)

| Topic | Issue |
|-------|-------|
| `count-to-10` | The hard problem is off-topic (subtraction/missing addend, not counting). Should be replaced with a  |
| `count-to-100` | Being conservative — K-level topics can be broader. The skip-counting by 10s overlap with the dedica |
| `add-within-100-fluent` | The distinction between 'add within 100' and 'fluently add within 100' is a standards-alignment arti |
| `subtract-within-100-fluent` | There is no separate 'subtract-within-100' topic — this is the only two-digit subtraction topic at t |
| `draw-geometric-shapes` | Needs review: the 'draw' component cannot be assessed on screen+text. The workaround problems test c |
| `measure-length-standard` | The separate measure-length-inches and measure-length-cm topics already exist as children, so this t |
| `bar-graphs-picture-graphs` | Separate picture-graphs (G1) and bar-graphs-read (G2) topics already exist. This G3 topic is the sca |
| `unit-conversion` | This topic has many specific children (convert-length-smaller, convert-mass, convert-time, convert-v |
| `properties-of-multiplication` | The commutative-property-mult and associative-distributive-mult topics already exist as more granula |
| `improper-fractions-mixed-numbers` | mixed-number-conversions is a separate topic that says 'fluently convert between improper fractions  |
| `subtract-mixed-numbers-regroup` | This could be merged into add-subtract-mixed-numbers since regrouping is already mentioned in that t |
| `fraction-number-sense` | Could overlap with estimate-fraction-sums and compare-fractions-benchmarks. All test fraction number |
| `cross-sections-3d` | Relationship to cross-sections topic unclear; may be a duplicate or elaboration. |
| `compound-probability` | Broad topic covering independent and dependent events. Sub-topics exist (probability-of-compound-eve |
| `mean-absolute-deviation` | MAD calculation is procedurally complex enough to warrant its own topic, but only appears as one mea |

## Action Priorities

**High priority — act now:**
- Merge orphan count-objects-to-5 into count-objects-to-10 (orphan node, 0 edges)
- Consolidate fractions operation sub-splits (~25 merge candidates in fractions strand)
- Merge count-by-2s/5s/10s into single skip-counting topic

**Medium priority — review before acting:**
- Linear-functions slope sub-topics (12 merge candidates)
- Algebra duplicate topics (5 merges)
- Statistics individual measure topics (3 merges)

**Defer to future plan:**
- Splits (17 topics) — graph well-decomposed at current scale
- Remaining low-confidence merges