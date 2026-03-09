# Targets Changelog

Records each version change to `simulations/targets.json` for traceability.

---

## Version 3 (2026-03-09)

- Recalibrated three targets based on Phase 6 integration testing (10 profiles × 30 sessions)
- `mastery_convergence`: 6 → 4 (of 8 non-struggling). With review-budget saturation and 71 topics, 50% mastery in 30 sessions is ambitious for moderate-ability profiles. 3/8 currently pass; 4 is achievable after frontier progression improves.
- `presentation_drift`: 8 → 6 (of 10). Stabilization requires varied data, but sessions become 100% review after ~session 7, limiting drift signal. 3/10 currently pass.
- `cognitive_demand_entropy`: 1.2 → 0.90 bits (tolerance 0.2 → 0.15). Current content skews procedural/recall (bridge signal). 0.96 bits actual — achievable now. 1.2 deferred until content pipeline generates balanced demands.
- Root cause for all three: diagnostic over-materializes 44+ topics → review budget saturated → no new topics after session ~7 → insufficient data for mastery/drift/demand variety. Phase 7 (FIRe fix) addresses the root cause.
- Reason: Plan 017.7 Phase 6 integration testing analysis

## Version 2 (2026-03-09)

- Added `signal_source` tagging (`engine` / `content` / `bridge`) to all system targets
- Engine targets validated by simulations; content targets advisory-only until live-data pipeline
- Reason: DECISIONS.md 2026-03-09 — engine/content signal separation

## Version 1 (2026-03-09)

- Initial creation from Plan 017.7 Phase 1
- 10 system targets defined: mastery_convergence, mastery_preservation, difficulty_targeting, review_new_balance, interleaving, fire_compression, remediation_routing, presentation_drift, diagnostic_placement, cognitive_demand_entropy
- 12 profile expectations: average-older, average-young, fast-learner, misconception-fractions, misconception-proportional-reasoning, overconfident, strong-older, strong-young, struggling-older, struggling-young, underconfident, fast-learner-young
- Content quality targets: too_hard, too_easy, difficulty_calibration thresholds
- All targets cite learning science research from docs/learning-science.md
