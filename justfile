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

# Validate content (graph DAG + problem completeness)
validate-content:
    npx tsx tools/validate-graph.ts
    npx tsx tools/validate-content.ts

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
    npx tsx tools/import-content.ts

# Visualize knowledge graph (default: math-foundations, or pass subject name)
visualize subject="math-foundations":
    python3 tools/visualize-graph.py content/{{subject}}/graph.json --open

# Build web app
build-web:
    pnpm --filter web exec vite build

# Deploy API to preview
deploy-preview-api:
    npx wrangler deploy --env preview

# Deploy web to preview
deploy-preview-web: build-web
    npx wrangler pages deploy packages/web/dist --project-name learn-platform-web-preview --commit-dirty=true

# Deploy all to preview
deploy-preview: deploy-preview-api deploy-preview-web

# Deploy to production
deploy:
    npx wrangler deploy
    pnpm --filter web exec vite build
    npx wrangler pages deploy packages/web/dist --project-name learn-platform-web --commit-dirty=true

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

# Fast simulation regression check (~15s, 3 profiles × 5 sessions)
simulate-regression seed="42":
    npx tsx simulations/src/regression.ts --seed {{seed}}

# Evaluate simulation runs against targets.json (healing loop)
evaluate *args:
    npx tsx simulations/src/evaluate.ts {{args}}

# Evaluate with FIRe comparison (slow — runs paired simulations)
evaluate-fire *args:
    npx tsx simulations/src/evaluate.ts --run-fire {{args}}

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
