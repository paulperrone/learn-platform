# /atomicity-audit — Topic Atomicity Analysis

Assess whether each topic in the knowledge graph represents one independently testable, teachable, and remediable skill. YOU (Claude Code) are the assessor — read the topic data and apply the heuristics directly.

## Arguments

```
/atomicity-audit                        # Full audit (all topics, skip previously assessed)
/atomicity-audit <discipline>           # Specific discipline (default: math)
/atomicity-audit --strand <name>        # Single strand (e.g., --strand fractions)
/atomicity-audit --topic <id>           # Single topic
/atomicity-audit --force                # Re-assess previously assessed topics
```

## Workflow

### 1. Generate Context

Run the context assembler to gather topic data, MA cross-references, and problem samples:

```bash
# Build context args from user arguments
CONTEXT_ARGS=""
# If --strand was passed, add it
# If --topic was passed, add it
# If previous results exist and --force not passed, add --previous docs/audits/atomicity-latest.json

npx tsx tools/atomicity-context.ts $CONTEXT_ARGS --output docs/audits/context.json
```

### 2. Read the Context

Read `docs/audits/context.json`. It contains:
- Per-topic: name, description, grade, strand, sample problems, prerequisites, dependents, encompassing edges, strand neighbors, MA matches
- Graph stats: density metrics, strand counts
- The 5 heuristics to apply

### 3. Assess Each Topic

For each topic in the context (skip those marked `previouslyAssessed: true` unless `--force`):

Apply the 5 split heuristics:

1. **Testable-in-isolation**: Look at the sample problems. Do they all test ONE atomic skill? Could a student pass this topic but fail an adjacent neighbor topic? If problems span clearly different strategies (e.g., "add fractions with like denominators" AND "add fractions with unlike denominators"), it should split.

2. **Distinct cognitive demand**: Compare against strand neighbors. Does this topic require a meaningfully different strategy? If two adjacent topics are essentially the same operation with different number sizes (and both are already at the right granularity for their grade), they're fine. But if one topic combines conceptual understanding AND procedural fluency that could be tested separately, consider splitting.

3. **Platform-compatible**: Can all problems be answered via screen + text input? Flag any that require drawing, physical manipulatives, verbal responses, or measurement tools.

4. **Grade-boundary natural**: Does this topic sit at one grade level? A topic spanning K-2 complexity might be fine (broad early topics). A topic spanning grades 5-8 complexity probably needs splitting.

5. **Remediation-useful**: If a student fails, does the failure tell us exactly what they don't know? A topic like "add and subtract fractions" is less remediation-useful than separate "add fractions" and "subtract fractions" topics.

For each topic, determine a verdict:
- **atomic**: All heuristics pass. Well-scoped single skill.
- **should-split**: Topic covers 2+ distinct skills. Propose specific sub-topics.
- **should-merge**: Topic is too granular, nearly identical to a neighbor. Name the merge target.
- **review**: Unclear, needs human judgment.

### 4. Process in Batches

Process topics strand-by-strand. For each strand:

1. Read all topics in that strand from the context
2. Assess each topic against the 5 heuristics
3. Build the results array for that strand
4. Move to the next strand

This keeps context focused and prevents assessment drift across unrelated strands.

### 5. Write Results

Write the audit results to `docs/audits/atomicity-{timestamp}.json`:

```json
{
  "metadata": {
    "timestamp": "ISO string",
    "discipline": "math",
    "topicCount": 460,
    "assessedCount": 460,
    "skippedCount": 0
  },
  "summary": {
    "atomic": 400,
    "shouldSplit": 30,
    "shouldMerge": 10,
    "review": 20,
    "heuristicFailRates": {
      "testable_in_isolation": 5.2,
      "distinct_cognitive_demand": 3.1,
      "platform_compatible": 0.4,
      "grade_boundary_natural": 1.0,
      "remediation_useful": 8.5
    },
    "byStrand": {
      "fractions": { "atomic": 55, "shouldSplit": 5, "shouldMerge": 2, "review": 3 }
    }
  },
  "topics": {
    "topic-id": {
      "verdict": "atomic",
      "confidence": 0.9,
      "heuristics": {
        "testable_in_isolation": { "pass": true, "reasoning": "..." },
        "distinct_cognitive_demand": { "pass": true, "reasoning": "..." },
        "platform_compatible": { "pass": true, "reasoning": "..." },
        "grade_boundary_natural": { "pass": true, "reasoning": "..." },
        "remediation_useful": { "pass": true, "reasoning": "..." }
      },
      "splitRecommendation": null,
      "mergeRecommendation": null,
      "notes": ""
    }
  }
}
```

Also copy the JSON to `docs/audits/atomicity-latest.json` so future runs can skip assessed topics.

### 6. Write Markdown Report

Write a human-readable report to `docs/audits/atomicity-{timestamp}.md` with:

- Summary table (verdict counts, heuristic fail rates)
- Split recommendations table (topic, proposed sub-topics, evidence)
- Merge recommendations table (topic, merge target, rationale)
- Per-strand breakdown showing non-atomic topics

### 7. Present Results

After writing files, print a summary:
- How many topics assessed
- Verdict breakdown (atomic / split / merge / review)
- Top split recommendations (if any)
- Top merge recommendations (if any)
- File paths for detailed results

### 8. Clean Up

Remove the temporary context file:
```bash
rm -f docs/audits/context.json
```

## Guidelines

- Be conservative with split recommendations — only recommend splits where the evidence from problems is clear
- Grade K-2 topics can be broader (fewer splits expected)
- Grade 5+ topics should be more atomic (more splits expected)
- Look at MA matches for density calibration — if MA has 3 topics where we have 1, consider whether our topic is too broad
- Merge recommendations should be rare — only when two topics test essentially identical skills
- Confidence should reflect how clear-cut the assessment is (0.9+ for obvious cases, 0.5-0.7 for borderline)
- Keep reasoning concise — 1-2 sentences per heuristic, not paragraphs
