# NOTE: This justfile avoids `cd <dir> && command` patterns.
# Instead, use:
#   - pnpm --filter <workspace> exec <command>
#   - npx wrangler <command> --cwd <directory>
# This keeps CWD stable and makes commands copy-paste safe.

# Development (run both API and web)
dev:
    pnpm dev

# Run all tests (Workers pool + miniflare D1 + simulation regression)
# IMPORTANT: Always use this, never `pnpm vitest run` directly — Workers tests need the pool runner
test:
    pnpm test
    npx tsx simulations/src/regression.ts

# TypeScript validation
typecheck:
    pnpm typecheck

# Content directory (sibling learn-content repo or CONTENT_DIR env var)
content_dir := env("CONTENT_DIR", justfile_directory() / ".." / "learn-content")

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

# Full validation
validate: typecheck validate-content

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

# Content health scoring (per-topic analysis)
content-status *args:
    npx tsx tools/content-status.ts {{args}}

# Content gap detection (ranked by impact)
content-gaps *args:
    npx tsx tools/content-gaps.ts {{args}}

# Content density and coverage report
content-report *args:
    npx tsx tools/content-report.ts {{args}}

# Unified system audit (graph + content + simulation + LLM tracking + media)
audit *args:
    #!/usr/bin/env bash
    set -euo pipefail
    export CONTENT_DIR="{{content_dir}}"
    npx tsx tools/audit.ts {{args}}

rollup-effectiveness *args:
    #!/usr/bin/env bash
    set -euo pipefail
    npx tsx tools/rollup-effectiveness.ts {{args}}

# Atomicity audit context assembler (use /atomicity-audit command for full audit)
atomicity-context *args:
    npx tsx tools/atomicity-context.ts {{args}}

# Visualize knowledge graph (default: math-foundations, or pass subject name)
visualize subject="math":
    python3 tools/visualize-graph.py "{{content_dir}}/{{subject}}/graph.json" --open

# Build web app
build-web:
    pnpm --filter web exec vite build

# Generate R2 content bundles from learn-content
generate-bundles *args:
    CONTENT_DIR="{{content_dir}}" npx tsx tools/generate-bundles.ts {{args}}

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

# Run simulation for a single profile
simulate profile sessions="5" seed="42":
    npx tsx simulations/src/cli.ts {{profile}} --sessions {{sessions}} --seed {{seed}}

# Run simulation for all profiles
simulate-all sessions="5" seed="42":
    npx tsx simulations/src/cli.ts --all --sessions {{sessions}} --seed {{seed}}

# Run diagnostic analysis for all profiles
simulate-diagnostic seed="42":
    npx tsx simulations/src/diagnostic-analysis.ts --seed {{seed}}

# Analyze trajectories from latest simulation runs
simulate-trajectories:
    npx tsx simulations/src/trajectory-analysis.ts --all-latest

# Analyze trajectory from a specific run directory
simulate-trajectory run-dir:
    npx tsx simulations/src/trajectory-analysis.ts {{run-dir}}

# Analyze adaptive systems (Phase 4) from latest simulation runs
simulate-adaptive:
    npx tsx simulations/src/adaptive-analysis.ts --all-latest

# Run FIRe comparison simulations (with vs without encompassing edges)
simulate-fire seed="42":
    npx tsx simulations/src/adaptive-analysis.ts --all-latest --run-fire-comparison --seed {{seed}}

# Analyze simulation runs: summary + charts
simulate-analyze *args:
    npx tsx simulations/src/analyze.ts --all-latest {{args}}

# Compare current simulation metrics against baseline (flags >10% regression)
simulate-compare baseline="simulations/baseline.json":
    npx tsx simulations/src/analyze.ts --all-latest --compare {{baseline}}

# Run all profiles, analyze, and produce combined report + content quality
simulate-report sessions="30" seed="42":
    just simulate-all {{sessions}} {{seed}}
    npx tsx simulations/src/analyze.ts --report --baseline --content-quality

# Maturity level simulations (all profiles at each session count)
simulate-l1 seed="42":
    just simulate-all 5 {{seed}}

simulate-l2 seed="42":
    just simulate-all 30 {{seed}}

simulate-l3 seed="42":
    just simulate-all 90 {{seed}}

# L4: 7 key profiles × 180 sessions (semester simulation)
simulate-l4 seed="42":
    npx tsx simulations/src/cli.ts average-older fast-learner-older struggling-older returning-after-gap misconception-fractions strong-highschool multi-math-strong --sessions 180 --seed {{seed}}

# L5: 7 key profiles × 360 sessions (full-year simulation)
simulate-l5 seed="42":
    npx tsx simulations/src/cli.ts average-older fast-learner-older struggling-older returning-after-gap misconception-fractions strong-highschool multi-math-strong --sessions 360 --seed {{seed}}

# Fast simulation regression check (~15s, 3 profiles × 5 sessions)
simulate-regression seed="42":
    npx tsx simulations/src/regression.ts --seed {{seed}}

# Clean up old simulation runs (keep latest per profile by default)
simulate-clean *args:
    npx tsx simulations/src/clean.ts {{args}}

# Show simulation runs disk usage
simulate-size:
    npx tsx simulations/src/clean.ts --dry-run --keep 999999

# Evaluate simulation runs against targets.json (includes FIRe compression by default)
evaluate *args:
    npx tsx simulations/src/evaluate.ts {{args}}

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
    npx tsx simulations/src/evaluate.ts --compare-levels

# Run single healing epoch (simulate all → evaluate → report)
heal-epoch sessions="30" seed="42":
    npx tsx simulations/src/heal-loop.ts --epoch --sessions {{sessions}} --seed {{seed}}

# Verify a fix against a specific system target
heal-verify system profiles="all" sessions="10" seed="42":
    npx tsx simulations/src/heal-loop.ts --verify-fix --system {{system}} --profiles {{profiles}} --sessions {{sessions}} --seed {{seed}}

# Show healing loop status and history
heal-status:
    npx tsx simulations/src/heal-loop.ts --status

# Force a healing checkpoint
heal-checkpoint:
    npx tsx simulations/src/heal-loop.ts --checkpoint

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
