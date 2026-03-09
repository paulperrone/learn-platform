# Healing System

> Full documentation to be expanded in Plan 017.7 Phase 5. This section covers the `/heal` skill added in Phase 4.

## The `/heal` Skill

The `/heal` command runs one or more healing iterations on the adaptive engine. It reads evaluation output, traces root causes in service code, makes targeted fixes, verifies with mini-simulations, and checkpoints progress.

### Quick Start

```bash
# Check current system health
/heal --evaluate-only

# Fix up to 3 failing systems automatically
/heal

# Target a specific system
/heal --system fire_compression

# Verify a manual fix you made
/heal --verify mastery_convergence

# Fix more systems in one session
/heal --max 5
```

### How It Works

1. **Evaluate** — Runs `just evaluate` (or `just heal-epoch` if no recent data) to assess all 10 adaptive systems against learning-science targets
2. **Prioritize** — Sorts failures by priority (P0 > P1 > P2), then by severity
3. **Diagnose** — Reads the evaluation's `investigationArea` for each failing system, traces through service code to identify root cause
4. **Fix** — Makes a targeted code change, runs `just test` to verify no breakage
5. **Verify** — Runs `just heal-verify <system>` mini-simulation to confirm the metric improved
6. **Checkpoint** — After fixing N systems (default 3), creates a healing checkpoint with `just heal-checkpoint`

### Interpreting Output

After each iteration, `/heal` reports:
- **Fixed** systems with before/after metric values
- **Remaining failures** with status and brief description
- **Regressions** if any fix caused another system to degrade
- **Next steps** — whether to continue healing or investigate manually

### When It Escalates

The skill stops and asks for human input when:
- Two consecutive fix attempts on the same system fail
- A fix regresses another system from PASS to FAIL
- The fix requires an architectural decision
- The target itself appears to be miscalibrated
- Two systems are in direct conflict (improving one degrades the other)

### System Playbooks

The skill includes diagnosis playbooks for all 10 adaptive systems:

| System | Priority | Key Files |
|--------|----------|-----------|
| mastery_convergence | P0 | srs.ts, session.ts |
| mastery_preservation | P0 | srs.ts |
| remediation_routing | P0 | session.ts |
| difficulty_targeting | P1 | session.ts, content |
| review_new_balance | P1 | session.ts |
| interleaving | P1 | session.ts |
| fire_compression | P1 | srs.ts, diagnostic.ts |
| presentation_drift | P2 | content.ts |
| diagnostic_placement | P2 | diagnostic.ts |
| cognitive_demand_entropy | P2 | session.ts, content |

Each playbook includes: what the metric measures, where to look in the code, common root causes, and diagnostic traces to run.

### Related Commands

```bash
just evaluate              # Run evaluation only
just heal-epoch            # Full simulate + evaluate cycle
just heal-verify <system>  # Verify a specific fix
just heal-status           # View healing history
just heal-checkpoint       # Force a checkpoint
```
