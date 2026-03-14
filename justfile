# NOTE: This justfile avoids `cd <dir> && command` patterns.
# Instead, use:
#   - pnpm --filter <workspace> exec <command>
#   - npx wrangler <command> --cwd <directory>
# This keeps CWD stable and makes commands copy-paste safe.

# Content directory (sibling learn-content repo or CONTENT_DIR env var)
content_dir := env("CONTENT_DIR", justfile_directory() / ".." / "learn-content")

# ── Development ──

# Run both API and web dev servers
dev:
    pnpm dev

# ── Testing (automated, run on code changes) ──
# Validates code correctness: unit tests, integration tests, types, content structure, engine regression.

# Run unit + integration tests (Workers pool + miniflare D1)
# IMPORTANT: Always use this, never `pnpm vitest run` directly — Workers tests need the pool runner
test:
    pnpm test

# TypeScript validation
typecheck:
    pnpm typecheck

# Validate content (graph DAG + problem completeness) for all subjects
validate-content:
    #!/usr/bin/env bash
    set -euo pipefail
    export CONTENT_DIR="{{content_dir}}"
    exit_code=0
    for dir in "$CONTENT_DIR"/*/; do
        subject=$(basename "$dir")
        if [ -f "$dir/graph.json" ]; then
            echo "--- Validating $subject ---"
            npx tsx tools/validate-graph.ts "$subject" || exit_code=1
            npx tsx tools/validate-content.ts "$subject" || exit_code=1
            echo ""
        fi
    done
    # Cross-discipline edge validation (unified DAG, granularity heuristics)
    if [ -f "$CONTENT_DIR/cross-discipline-edges.json" ]; then
        echo "--- Validating cross-discipline edges ---"
        npx tsx tools/validate-cross-discipline.ts || exit_code=1
        echo ""
    fi
    exit $exit_code

# Validate content in strict mode (requires dimension fields on all items)
validate-content-strict:
    #!/usr/bin/env bash
    set -euo pipefail
    export CONTENT_DIR="{{content_dir}}"
    exit_code=0
    for dir in "$CONTENT_DIR"/*/; do
        subject=$(basename "$dir")
        if [ -f "$dir/graph.json" ]; then
            echo "--- Validating $subject (strict) ---"
            npx tsx tools/validate-graph.ts "$subject" || exit_code=1
            npx tsx tools/validate-content.ts "$subject" --strict || exit_code=1
            echo ""
        fi
    done
    if [ -f "$CONTENT_DIR/cross-discipline-edges.json" ]; then
        echo "--- Validating cross-discipline edges ---"
        npx tsx tools/validate-cross-discipline.ts || exit_code=1
        echo ""
    fi
    exit $exit_code

# Fast simulation regression check (~15s, 3 profiles × 5 sessions)
regression *args:
    npx tsx audit/learner-simulations/src/regression.ts {{args}}

# Full pre-commit validation gate (typecheck + tests + content + regression)
validate: typecheck test validate-content regression

# ── Content Pipeline ──

# Generate Drizzle migration
db-generate:
    pnpm db:generate

# Apply migration locally
db-migrate:
    pnpm db:migrate

# Import content into local D1
import-content:
    CONTENT_DIR="{{content_dir}}" npx tsx tools/import-content.ts

# Generate procedural problems (seeded, reproducible)
generate-problems *args:
    npx tsx tools/generate-problems.ts {{args}}

# Generate R2 content bundles from learn-content
generate-bundles *args:
    CONTENT_DIR="{{content_dir}}" npx tsx tools/generate-bundles.ts {{args}}

# Visualize knowledge graph (default: math, or pass subject name)
visualize subject="math":
    python3 tools/visualize-graph.py "{{content_dir}}/{{subject}}/graph.json" --open

# Build web app
build-web:
    pnpm --filter web exec vite build

# ── Auditing (manual, on-demand) ──
# Evaluates system behavior: content quality, simulations, LLM review, system health. Run when needed.

# Content health scoring (per-topic analysis)
content-status *args:
    npx tsx audit/content/status.ts {{args}}

# Content gap detection (ranked by impact)
content-gaps *args:
    npx tsx audit/content/gaps.ts {{args}}

# Content density and coverage report
content-report *args:
    npx tsx audit/content/report.ts {{args}}

# Unified system audit (graph + content + simulation + LLM tracking + media + review)
# Pass --check to run relevance guard first (shows which sections may be stale)
audit *args:
    #!/usr/bin/env bash
    set -euo pipefail
    export CONTENT_DIR="{{content_dir}}"
    # If --check is among args, run relevance check first
    for arg in {{args}}; do
        if [ "$arg" = "--check" ]; then
            echo "── Audit Relevance Check ──"
            npx tsx audit/relevance.ts --content-dir "{{content_dir}}"
            echo ""
            echo "── Full Audit Report ──"
            break
        fi
    done
    # Filter out --check before passing to orchestrator.ts
    filtered_args=""
    for arg in {{args}}; do
        if [ "$arg" != "--check" ]; then
            filtered_args="$filtered_args $arg"
        fi
    done
    npx tsx audit/orchestrator.ts $filtered_args

# Comprehensive audit: simulate + evaluate + audit report
audit-all sessions="30" seed="42":
    just simulate-all {{sessions}} {{seed}}
    just evaluate
    just audit

# Check which audit sections are affected by current changes (advisory)
audit-check:
    #!/usr/bin/env bash
    set -euo pipefail
    export CONTENT_DIR="{{content_dir}}"
    npx tsx audit/relevance.ts --content-dir "{{content_dir}}"

# Effectiveness rollup from Analytics Engine
rollup-effectiveness *args:
    #!/usr/bin/env bash
    set -euo pipefail
    npx tsx audit/rollup-effectiveness.ts {{args}}

# Atomicity audit context assembler (deprecated — use /content-review criterion 7)
atomicity-context *args:
    npx tsx audit/content/atomicity-context.ts {{args}}

# Render cached content review report (run /content-review in Claude Code to generate)
review-content *args:
    #!/usr/bin/env bash
    set -euo pipefail
    DISC="${1:-}"
    if [ -z "$DISC" ]; then
        echo "Usage: just review-content <discipline>"
        echo ""
        REVIEW_DIR="audit/reports/content-reviews"
        if [ -d "$REVIEW_DIR" ]; then
            echo "Available disciplines:"
            for d in "$REVIEW_DIR"/*/; do
                [ -d "$d" ] && echo "  - $(basename "$d")"
            done
        else
            echo "No reviews found. Run /content-review in Claude Code to generate."
        fi
        exit 0
    fi
    REPORT="audit/reports/content-reviews/${DISC}-report.md"
    if [ -f "$REPORT" ]; then
        cat "$REPORT"
    else
        echo "No report found for '$DISC'."
        echo "Run /content-review $DISC in Claude Code to generate."
    fi

# ── Simulations (auditing) ──
# Run synthetic learners through the engine to evaluate system behavior.

# Run simulation for a single profile
simulate profile sessions="5" seed="42":
    npx tsx audit/learner-simulations/src/cli.ts {{profile}} --sessions {{sessions}} --seed {{seed}}

# Run simulation for all profiles
simulate-all sessions="5" seed="42":
    npx tsx audit/learner-simulations/src/cli.ts --all --sessions {{sessions}} --seed {{seed}}

# Run diagnostic analysis for all profiles
simulate-diagnostic seed="42":
    npx tsx audit/learner-simulations/src/diagnostic-analysis.ts --seed {{seed}}

# Analyze trajectories from latest simulation runs
simulate-trajectories:
    npx tsx audit/learner-simulations/src/trajectory-analysis.ts --all-latest

# Analyze trajectory from a specific run directory
simulate-trajectory run-dir:
    npx tsx audit/learner-simulations/src/trajectory-analysis.ts {{run-dir}}

# Analyze adaptive systems (Phase 4) from latest simulation runs
simulate-adaptive:
    npx tsx audit/learner-simulations/src/adaptive-analysis.ts --all-latest

# Run FIRe comparison simulations (with vs without encompassing edges)
simulate-fire seed="42":
    npx tsx audit/learner-simulations/src/adaptive-analysis.ts --all-latest --run-fire-comparison --seed {{seed}}

# Analyze simulation runs: summary + charts
simulate-analyze *args:
    npx tsx audit/learner-simulations/src/analyze.ts --all-latest {{args}}

# Compare current simulation metrics against baseline (flags >10% regression)
simulate-compare baseline="audit/learner-simulations/baseline.json":
    npx tsx audit/learner-simulations/src/analyze.ts --all-latest --compare {{baseline}}

# Run all profiles, analyze, and produce combined report + content quality
simulate-report sessions="30" seed="42":
    just simulate-all {{sessions}} {{seed}}
    npx tsx audit/learner-simulations/src/analyze.ts --report --baseline --content-quality

# Maturity level simulations (all profiles at each session count)
simulate-l1 seed="42":
    just simulate-all 5 {{seed}}

simulate-l2 seed="42":
    just simulate-all 30 {{seed}}

simulate-l3 seed="42":
    just simulate-all 90 {{seed}}

# L4: 7 key profiles × 180 sessions (semester simulation)
simulate-l4 seed="42":
    npx tsx audit/learner-simulations/src/cli.ts average-older fast-learner-older struggling-older returning-after-gap misconception-fractions strong-highschool multi-math-strong --sessions 180 --seed {{seed}}

# L5: 7 key profiles × 360 sessions (full-year simulation)
simulate-l5 seed="42":
    npx tsx audit/learner-simulations/src/cli.ts average-older fast-learner-older struggling-older returning-after-gap misconception-fractions strong-highschool multi-math-strong --sessions 360 --seed {{seed}}

# Standalone simulation regression check (also available as `just regression`)
simulate-regression seed="42":
    npx tsx audit/learner-simulations/src/regression.ts --seed {{seed}}

# Clean up old simulation runs (keep latest per profile by default)
simulate-clean *args:
    npx tsx audit/learner-simulations/src/clean.ts {{args}}

# Show simulation runs disk usage
simulate-size:
    npx tsx audit/learner-simulations/src/clean.ts --dry-run --keep 999999

# Evaluate simulation runs against targets.json (includes FIRe compression by default)
evaluate *args:
    npx tsx audit/learner-simulations/src/evaluate.ts {{args}}

# Evaluate at a specific maturity level (runs simulation + evaluation + saves baseline)
evaluate-l1 seed="42":
    just simulate-l1 {{seed}}
    just evaluate --level l1

evaluate-l2 seed="42":
    just simulate-l2 {{seed}}
    just evaluate --level l2

evaluate-l3 seed="42":
    just simulate-l3 {{seed}}
    just evaluate --level l3

evaluate-l4 seed="42":
    just simulate-l4 {{seed}}
    just evaluate --level l4

evaluate-l5 seed="42":
    just simulate-l5 {{seed}}
    just evaluate --level l5

# Compare metrics across maturity levels (requires baselines)
evaluate-compare-levels:
    npx tsx audit/learner-simulations/src/evaluate.ts --compare-levels

# Run single healing epoch (simulate all → evaluate → report)
heal-epoch sessions="30" seed="42":
    npx tsx audit/learner-simulations/src/heal-loop.ts --epoch --sessions {{sessions}} --seed {{seed}}

# Verify a fix against a specific system target
heal-verify system profiles="all" sessions="10" seed="42":
    npx tsx audit/learner-simulations/src/heal-loop.ts --verify-fix --system {{system}} --profiles {{profiles}} --sessions {{sessions}} --seed {{seed}}

# Show healing loop status and history
heal-status:
    npx tsx audit/learner-simulations/src/heal-loop.ts --status

# Force a healing checkpoint
heal-checkpoint:
    npx tsx audit/learner-simulations/src/heal-loop.ts --checkpoint

# ── Deployment ──

# Deploy content to R2 + D1 (production)
deploy-content:
    CONTENT_DIR="{{content_dir}}" npx tsx tools/deploy-content.ts --env production

# Deploy content to R2 + D1 (preview)
deploy-content-preview:
    CONTENT_DIR="{{content_dir}}" npx tsx tools/deploy-content.ts --env preview

# Deploy API to preview
deploy-preview-api:
    npx wrangler deploy --env preview

# Deploy web to preview
deploy-preview-web: build-web
    npx wrangler pages deploy packages/web/dist --project-name learn-platform-web-preview --commit-dirty=true

# Deploy all to preview (code + content)
deploy-preview: deploy-preview-api deploy-preview-web deploy-content-preview

# Deploy to production (code + content)
deploy:
    npx wrangler deploy
    pnpm --filter web exec vite build
    npx wrangler pages deploy packages/web/dist --project-name learn-platform-web --commit-dirty=true
    just deploy-content

# ── Maintenance ──

# Clean up task execution state
task-cleanup:
    #!/usr/bin/env bash
    set -euo pipefail
    ARCHIVE_DIR=".workflow/task/archive/cleanup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$ARCHIVE_DIR"
    mv .workflow/task/task-packet.md "$ARCHIVE_DIR/" 2>/dev/null || true
    mv .workflow/task/task-state.json "$ARCHIVE_DIR/" 2>/dev/null || true
    rm -f .workflow/agent-done.local
    echo "Task cleanup complete"
