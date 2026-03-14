# /atomicity-audit — DEPRECATED

This command has been absorbed into `/content-review` as criterion 7 (Topic Atomicity).

Use `/content-review` instead:

```
/content-review <discipline>                 # Full review including atomicity
/content-review <discipline> --topic <id>    # Single topic review
/content-review <discipline> --strand <name> # Strand review
```

The atomicity criterion evaluates topic scope using description, prerequisite count, encompassing edges, and problem diversity — the same heuristics previously in `/atomicity-audit`, now integrated alongside 6 other quality criteria.

See `audit/content/review-rubric.md` criterion 7 for the full rubric.
