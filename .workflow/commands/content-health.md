# /content-health — Content Health Diagnostic

Single command to assess content quality, coverage, and validation status for one or all subjects.

## Arguments

```
/content-health              # All subjects
/content-health <subject>    # Specific subject (e.g., math-foundations, math-middle)
/content-health --all        # Explicit all subjects
/content-health --fix        # Auto-fix common issues after reporting
```

## Workflow

### 1. Validation

Run structural and content validation:

```bash
# Single subject
just validate-content   # Validates all subjects in learn-content repo

# Or target specific subject if provided
npx tsx tools/validate-graph.ts $SUBJECT
npx tsx tools/validate-content.ts $SUBJECT
```

Report: errors (blockers), warnings (should fix), info (nice to know).

### 2. Content Status

Run per-topic health scoring:

```bash
just content-status $SUBJECT
# or for all:
just content-status
```

This reports for each topic:
- Problem count by difficulty (easy/medium/hard)
- Problem count by cognitive demand
- Example count
- Composite health score
- Topics below threshold (highlighted)

### 3. Content Gaps

Run gap detection:

```bash
just content-gaps $SUBJECT
# or for all:
just content-gaps
```

This reports:
- Top gaps ranked by impact
- Missing presentation levels
- Topics with 0 of a required demand type
- Cross-reference with simulation data when available

### 4. Graph Visualization

If structural issues are found, suggest:

```bash
just visualize $SUBJECT
```

Opens an interactive HTML visualization of the knowledge graph.

### 5. Summary Output

Present a consolidated summary:

```
## Content Health: <subject>

### Validation
- Errors: N (list if any)
- Warnings: N (list if any)

### Coverage
- Topics: N total
- Problems: N total (N per topic avg)
- Examples: N total (N per topic avg)
- Topics below 20 problems: [list]
- Topics missing examples: [list]

### Quality
- Difficulty balance: N% easy / N% medium / N% hard (target: 30/40/30)
- Cognitive demand distribution: [breakdown]
- Platform-incompatible issues: N

### Gaps (Top 5)
1. [topic] — [what's missing]
2. ...

### Recommendation
[Actionable next step — e.g., "Run /generate-content <subject> --problems-only to fill 3 gap topics"]
```

### 6. Auto-Fix (--fix flag)

If `--fix` is specified, attempt automatic fixes for common issues:

- **Difficulty relabeling:** Problems flagged as wrong difficulty by simulation data → relabel
- **Missing source field:** Add `"source": "hand-authored"` to legacy problems missing it
- **Platform-incompatible patterns:** Rewrite flagged questions to remove physical/verbal instructions
- **Missing cognitive demand:** Infer and add `cognitiveDemand` based on question type

After fixes, re-run validation to confirm improvements.

## When to Use

- **Before committing content changes** — verify nothing is broken
- **After `/generate-content`** — confirm generation met quality gates
- **During phase planning** — understand where to invest content effort
- **After simulation runs** — cross-reference simulation signals with content health
