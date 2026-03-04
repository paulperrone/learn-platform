# Project Workflow

Provider-agnostic workflow system. Works with Claude Code, OpenCode, Codex, Droid, and other AI coding assistants.

## Workflow Commands

```
/workflow-intake → /workflow-next (repeat)
```

### Primary Commands

| Command | Purpose |
|---------|---------|
| `/workflow-intake` | Add new work — describe what to build, system structures it |
| `/workflow-next` | Execute next available task from epics |
| `/workflow-status` | See progress and what's next |

### How It Works

1. **`/workflow-intake [work description]`** — Analyzes scope, creates spec if needed, creates epic(s) with phases
2. **`/workflow-next`** — Warms session with relevant learnings, auto-discovers available work, executes with verification gates
3. **`/workflow-status`** — Shows progress by epic

### Supporting Commands

| Command | Purpose |
|---------|---------|
| `/spec` | Define product vision |
| `/epic [name]` | Create implementation phases |
| `/distill` | Capture learnings, decisions, and research |

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `plans/` | Specs and epic tracking |
| `plans/completed/` | Finished epics |
| `plans/archived/` | Superseded specs, canceled epics |
| `task/` | Execution state |
| `skills/` | Repo-specific agent skills |
| `commands/` | Repo-specific workflow commands |

## Knowledge Files (Project Root)

| File | Purpose |
|------|---------|
| `AGENTS.md` | Project context (primary, provider-agnostic) |
| `CLAUDE.md` | Symlink to AGENTS.md (Claude Code) |
| `LEARNINGS.md` | Gotchas and insights |
| `DECISIONS.md` | Architectural decisions |
| `RESEARCH.md` | Investigation findings |

## Symlink Strategy

```
Provider-Agnostic (Real)     Claude Code (Symlinks)
────────────────────────     ──────────────────────
.workflow/              ←──  .claude/
AGENTS.md               ←──  CLAUDE.md
```
