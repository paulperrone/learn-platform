# Simulation Targets Reference

> How we derive, use, and maintain the machine-readable target system for the simulation healing loop.
>
> Machine-readable targets: `simulations/targets.json`
> Learning science foundations: `docs/learning-science.md`
> Content system: `docs/content-system.md`
> Last updated: 2026-03-09

---

## 1. Target Derivation Methodology

Every simulation target follows a three-step derivation:

1. **Identify the research claim.** Find the learning science principle that justifies the system behavior (e.g., "85% accuracy is optimal for learning" from Wilson et al. 2019).
2. **Map to an observable simulation metric.** Choose a concrete measurement from simulation outputs — `events.jsonl` (per-event stream), `session-summaries.json` (per-session aggregates), or `state-snapshots.json` (end-of-session state).
3. **Set target value with tolerance band.** Account for stochastic variance across the 10 simulation profiles. Tolerance bands are wider for metrics with high inter-profile variance and narrower for metrics that should hold universally.

### Target Types

| Type | When to use | Example |
|------|-------------|---------|
| **Absolute** | Research specifies a concrete number | 85% accuracy rule (Wilson et al. 2019) |
| **Relative** | Measuring improvement over a baseline | FIRe compression ratio vs. no-FIRe run |
| **Behavioral signature** | Expected outcome is qualitative | "Struggling profiles should show slow but positive growth" |

Absolute targets are preferred — they are self-contained and do not require a baseline run. Use relative targets only when the metric is meaningless without comparison. Behavioral signatures are for guardrails that resist quantification; encode them as multi-condition checks in `evaluate.ts`.

---

## 2. System-Level Targets

### 2.1 Mastery Convergence (P0)

- **Principle:** Bloom's mastery learning — with sufficient time and instruction, most students can achieve mastery. The system must drive genuine proficiency, not just exposure.
- **Citation:** Bloom 1984 (2-sigma problem), Kulik et al. 1990 (~0.5–1.0 SD effect), Math Academy 95% first-attempt pass rate.
- **Metric:** Count of non-struggling profiles (8 of 10) reaching ≥50% mastery by session 30.
- **Target:** ≥4 of 8 (50%).
- **Tolerance:** ±1 profile. Accounts for profile variance (some profiles have low ceilings), review-budget saturation limiting new topic introduction, and stochastic session ordering.
- **How to update:** If new profiles are added, adjust the denominator. If content grows or frontier progression improves (e.g., reduced diagnostic materialization), consider raising back toward 6/8. If FSRS parameters change, mastery thresholds may need recalibration.
- **Red flags:** If fewer than 3 non-struggling profiles reach 50%, check mastery criterion strictness, session mix allocation, and diagnostic materialization scope. The primary bottleneck is frontier stall (new topics stop being introduced after ~session 7).

### 2.2 Mastery Preservation (P0)

- **Principle:** Diagnostic mastery should be retained through the first learning session. Hysteresis prevents careless-error resets.
- **Metric:** Mastery % drop from session 0 to session 1.
- **Target:** ≤10 percentage points lost.
- **Tolerance:** None — this is a hard ceiling. Any drop >10% indicates a structural bug.
- **How to update:** If diagnostic materializes fewer topics, expected mastery baseline decreases and absolute drop may shrink. Target remains at ≤10pp.
- **Red flags:** If mastery drops >10%, check `srs.ts` hysteresis logic — the consecutive correct counter may not be persisting from diagnostic.

### 2.3 Difficulty Targeting (P1)

- **Principle:** Optimal learning occurs at approximately 85% success / 15% error rate.
- **Citation:** Wilson et al. 2019 (Nature Communications).
- **Metric:** Count of profiles converging to [0.80, 0.90] rolling accuracy within 500 problems.
- **Target:** ≥7 of 10 profiles.
- **Tolerance:** ±1 profile. Strong-older may exceed 90% (content ceiling); struggling profiles may take longer to converge.
- **How to update:** If content difficulty distribution changes, convergence speed may shift. If difficulty selection algorithm changes, revalidate the 500-problem window.
- **Red flags:** If <6 profiles converge, check difficulty selection logic and problem pool depth at each difficulty level.

### 2.4 Review/New Balance (P1)

- **Principle:** ~60% review, ~40% new content. Prevents review fatigue while maintaining retention.
- **Citation:** Math Academy design recommendation; habit formation and session design research.
- **Metric:** Review ratio across all sessions per profile.
- **Target:** Review ratio in [0.50, 0.70].
- **Tolerance:** Profiles with heavy diagnostic materialization may skew high initially; ratio should stabilize within the band by session 5.
- **How to update:** If diagnostic materializes fewer topics (reducing initial review load), the lower bound may shift down. If FIRe compression improves, the upper bound may tighten.
- **Red flags:** If ratio >70%, review queue is dominating — check diagnostic materialization count and FIRe compression. If ratio <50%, students are seeing too much new content without consolidation.

### 2.5 Interleaving (P1)

- **Principle:** Interleaved practice provides 76% better retention at 1-month delay. Mixing problem types forces discrimination between strategies.
- **Citation:** Rohrer 2012; Taylor & Rohrer 2010 (doubled test scores).
- **Metric:** Same-strand adjacency rate at topic-transition level.
- **Target:** Same-strand adjacency ≤10%.
- **Tolerance:** Two profiles (misconception-fractions, struggling-older) may exceed 10% due to prerequisite-chain remediation within a single strand.
- **How to update:** If strands are reorganized or new strands added, adjacency percentages change mechanically. Revalidate after graph structure changes.
- **Red flags:** If >4 profiles exceed 10%, the session planner is not interleaving effectively. Check topic selection algorithm.

### 2.6 FIRe Review Efficiency (P1)

> See [`fire-implementation-analysis.md`](fire-implementation-analysis.md) for 13 implementation approaches and stack rankings.

- **Principle:** Advanced topics implicitly review prerequisites. Retroactive facilitation restores memory as effectively as direct repetition.
- **Citation:** Math Academy FIRe model (Skycak 2026); Ausubel et al. 1957 (retroactive facilitation).
- **Metric:** Reviews-per-mastered-topic with vs without encompassing edges. Efficiency = `1 - (withRPM / withoutRPM)`.
- **Target:** ≥0% (break even — FIRe should not hurt efficiency).
- **Tolerance:** ±30%. Large tolerance reflects butterfly effects — removing encompassing edges changes both FIRe credit AND review ordering, causing large variance. Metric now scales with evaluation session count (capped at 60). Baseline: -12.6% at L2 (30 sessions), -19.8% at L3 (60 sessions). FIRe gets worse at longer horizons at current density (1.01 edges/topic).
- **Why not total review count?** FIRe doesn't reduce total reviews — it replaces child reviews with new topic introductions. Students progress faster, do more total reviews, but master more topics per review. The old "compression" metric punished FIRe for working correctly.
- **Implementation:** Retrieval-dependent credit (Approach 4). `applyFIReCredit()` applies virtual FSRS reviews on encompassed children. `compressReviews()` uses greedy set-cover but only eliminates children with R > 0.85 (well-retained, safe to skip). Children with R ≤ 0.85 stay in the review queue.
- **How to update:** As encompassing density increases (target 1.5-2.0 edges/topic, currently ~1.01), efficiency should improve. Raise target if baseline consistently exceeds 15%.
- **Red flags:** If efficiency <-30%, the retrieval gate may be too aggressive. Check RETRIEVAL_GATE constant in `srs.ts`. If efficiency >15%, consider lowering the gate threshold to eliminate more redundant reviews.

### 2.7 Remediation Routing (P0)

- **Principle:** Targeted remediation is the fourth pillar of mastery learning. When struggling, trace the prerequisite graph to the specific skill causing difficulty.
- **Metric:** Count of remediation events for misconception profiles across 15 sessions.
- **Target:** ≥5 remediation events.
- **Profiles:** misconception-fractions is the primary test case.
- **How to update:** As content grows, more remediation targets become available. Target count may increase proportionally.
- **Red flags:** If remediation events <3, the system is not detecting misconceptions or not routing to prerequisite topics. Check remediation trigger threshold and prerequisite edge traversal.

### 2.8 Presentation Drift (P2)

- **Principle:** Expertise reversal effect — scaffolding that helps novices actively hinders experts. Presentation level must adapt as the student progresses.
- **Citation:** Sweller et al. 2003.
- **Metric:** Count of profiles drifting in expected direction and stabilizing.
- **Target:** ≥6 of 10 profiles.
- **Known issues:** Stabilization requires sufficient varied data points. With review-dominated sessions after ~session 7, many profiles lack enough new-topic encounters to generate meaningful drift signal. strong-young drifts wrong (remediation noise); average-older drifts wrong (actual performance exceeds expected).
- **How to update:** If frontier progression improves (reduced materialization), consider raising back toward 8/10. If presentation level algorithm changes, revalidate drift directions for all profiles. If new profiles are added, update expected drift directions in `targets.json`.
- **Red flags:** If <4 profiles drift correctly, the presentation adaptation is broken. Check presentation update logic and confidence weighting.

### 2.9 Diagnostic Placement (P2)

- **Principle:** Adaptive testing places students accurately so they start at the right difficulty. Students are 3–4x more likely to master frontier topics than topics far above or below their level.
- **Citation:** Zou et al. 2019.
- **Metric:** Count of profiles placed within ±1 grade of expected.
- **Target:** 10 of 10 profiles.
- **Tolerance:** None — all profiles should be placed accurately with the current content set.
- **How to update:** If new profiles are added with unusual ability curves (e.g., spiky profiles with gaps), placement accuracy may decrease. Adjust diagnostic binary search bounds.
- **Red flags:** If placement is off by ≥2 grades for any profile, check diagnostic binary search bounds logic and anti-lock-in heuristics.

### 2.10 Cognitive Demand Entropy (P2)

- **Principle:** Varied practice promotes transfer. Problems should exercise recall, procedural, conceptual, and analytical demands across sessions.
- **Citation:** Bjork & Bjork 2011 (desirable difficulties).
- **Metric:** Shannon entropy of cognitive demand distribution across all problem events.
- **Target:** Shannon entropy ≥0.90 bits.
- **Tolerance:** ±0.15 bits. With 4 demand types, max entropy is 2.0 bits. 0.90 bits is achievable with current content, which skews toward procedural/recall demands. This is partially a content signal (bridge) — simulations approximate demand distribution, but live data confirms actual variety.
- **How to update:** If content pipeline generates more balanced demand distribution, raise toward 1.2 bits. If new cognitive demand types are added, max entropy increases and target should be raised proportionally.
- **Red flags:** If entropy <0.75, problems are heavily clustering on one demand type. Check problem tagging in content files and session planner demand mixing.

---

## 3. Profile-Level Expectations

### Profile Archetypes

| Archetype | Purpose | Example profiles |
|-----------|---------|------------------|
| **Strong** | Test ceiling effects, efficiency, fast progression | strong-young, strong-older |
| **Average** | Test the typical learning path, difficulty targeting | average-young, average-older |
| **Struggling** | Test remediation, floor effects, system persistence | struggling-young, struggling-older |
| **Special** | Test specific features | overconfident (confidence detection), misconception-fractions (remediation routing), fast-learner (learning gain adaptation) |

### Ability Curves and Expected Behavior

Each profile defines a per-grade accuracy curve that determines simulated performance:

- **Frontier grade** = highest grade where simulated accuracy ≥60%.
- **Expected mastery** = function of ability curve breadth and learning gain. Broader curves with higher learning gain reach mastery faster.
- **Presentation center** = function of age: primary (≤7), intermediate (8–10), standard (11–14), advanced (15+).

Strong profiles should progress quickly through content and hit ceiling effects. Average profiles should track the difficulty targeting band closely. Struggling profiles should show slow but positive growth, with remediation routing activating when they hit prerequisite gaps.

### When to Create a New Profile

Create a new profile when:

- A new content area has a different difficulty distribution than existing content.
- A student archetype is not covered (e.g., gifted with ADHD, ELL learner).
- A new system feature needs specific testing (e.g., collaborative learning, timed practice).

### Profile Creation Checklist

1. Define ability curve (per-grade accuracy).
2. Set misconceptions (if any) — specific topic patterns with accuracy overrides.
3. Set confidence tendency (underconfident, calibrated, overconfident).
4. Set learning gain (if applicable — rate of improvement over sessions).
5. Compute expected behavioral signature (frontier grade, mastery trajectory, presentation drift direction).
6. Run baseline simulation to validate expectations match actual behavior.
7. Add to `targets.json` `profile_expectations` section.

---

## 4. Content Quality Targets

### Difficulty Calibration Thresholds

| Flag | Condition | Interpretation |
|------|-----------|----------------|
| **too_hard** | Strong profiles (90%+ base ability) score <70% on a topic | Content is likely too hard or poorly scaffolded |
| **too_easy** | ALL profiles (including struggling) score >95% on a topic | Content provides no learning challenge |

### Expected Accuracy by Difficulty Level

Derived from Wilson et al. 2019 (85% optimal) with variance bands for difficulty tiers:

| Difficulty | Expected accuracy range |
|------------|----------------------|
| Easy | 70–100% |
| Medium | 50–90% |
| Hard | 30–80% |

### When to Adjust

- **New question types** (e.g., free response vs. multiple choice) have different baseline accuracy expectations. Free response is typically 10–15% lower than multiple choice.
- **Content volume increases** reduce variance — tighter bands become appropriate with larger sample sizes.
- **Cross-topic calibration** — if one topic's problems are systematically harder than peers at the same difficulty tag, flag for review.

---

## 5. Adding Targets for New Systems

1. **Identify the learning science principle** the new system implements.
2. **Define the metric:** what observable simulation output demonstrates the system is working?
3. **Set a target value:** use research numbers where available, otherwise establish through baseline simulation.
4. **Choose tolerance:** wider for high-variance metrics, narrow for critical thresholds.
5. **Classify priority:** P0 (core learning broken without it), P1 (degrades quality), P2 (polish).
6. **Add to `targets.json`** with the full schema (template below).
7. **Implement metric computation** in `evaluate.ts`.
8. **Add evaluation logic:** how to compute PASS/WARN/FAIL from the metric value.
9. **Run validation:** ensure known-good state shows PASS, intentionally-broken state shows FAIL.
10. **Document in this file** — add a subsection to Section 2.

### Template Entry for `targets.json`

```json
{
  "name": "Human-readable name",
  "description": "What this system does",
  "priority": "P0|P1|P2",
  "metric": "metric_key_from_evaluate_ts",
  "target": 0.85,
  "tolerance": 0.05,
  "unit": "percent|count|ratio|bits|grade_levels",
  "direction": "higher_better|lower_better|in_range",
  "science_ref": "Author Year: key finding",
  "rationale": "Why this specific target value",
  "source_files": ["packages/api/src/services/example.ts"],
  "evaluation_profiles": ["all"]
}
```

Field notes:
- `direction: "in_range"` requires both `target` (center) and `tolerance` (half-width) to define the band.
- `evaluation_profiles` can be `["all"]` or a list of specific profile IDs for targets that only apply to certain archetypes.
- `source_files` lists the implementation files that affect this metric — useful for tracing regressions.

---

## 6. Cross-Discipline Target Adaptation

The base targets in Section 2 are calibrated for mastery-gated disciplines (math, CS). Other discipline types require adjustments.

### Mastery-Gated (math, CS)

All targets apply as defined. Hard mastery gates, binary correctness, deep prerequisite chains.

- FIRe compression is most effective here due to deep encompassing hierarchies.
- Remediation routing follows `required` prerequisite edges.

### Context-Layered (history, philosophy)

| Target | Adaptation |
|--------|-----------|
| mastery_convergence | Lower threshold: ≥40% instead of ≥50% — mastery is softer, rubric-based |
| difficulty_targeting | Wider band: [0.70, 0.90] — rubric-based scoring has more variance |
| remediation_routing | Follow `recommended` edges, not hard gates |
| cognitive_demand_entropy | Raise target — more emphasis on analysis/synthesis demands |

**Add:** `depth_progression` target — students should advance through survey, contextual, analytical, synthesis depth layers over time.

### Flexible (vocabulary, geography)

| Target | Adaptation |
|--------|-----------|
| mastery_convergence | Remove or lower significantly — topics are independent |
| interleaving | Less important — topics don't interfere with each other |
| FIRe_compression | Minimal — few encompassing relationships exist |

**Replace with:** recall-specific targets (response time, retention rate at 7/30/90 day intervals).

### Target Overlays

Subject-specific additions extend the base target set without modifying it:

| Subject | Overlay target | Description |
|---------|---------------|-------------|
| US History | `depth_progression` | Students advance through depth layers (survey → contextual → analytical → synthesis) |
| Vocabulary | `recall_rate` | Pure retention measurement at spaced intervals |
| Physics | `cross_discipline_prerequisite` | Math prerequisites enforced before physics content unlocks |

Overlays are defined in `targets.json` under a `subject_overrides` key and merged with base targets at evaluation time.
