# Targets Changelog

Records each version change to `simulations/targets.json` for traceability.

---

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
