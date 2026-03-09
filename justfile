# NOTE: This justfile avoids `cd <dir> && command` patterns.
# Instead, use:
#   - pnpm --filter <workspace> exec <command>
#   - npx wrangler <command> --cwd <directory>
# This keeps CWD stable and makes commands copy-paste safe.

# Development (run both API and web)
dev:
    pnpm dev

# Run all tests (Workers pool + miniflare D1)
# IMPORTANT: Always use this, never `pnpm vitest run` directly — Workers tests need the pool runner
test:
    pnpm test

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
