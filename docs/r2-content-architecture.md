# R2 Content Architecture

Content delivery for the learn platform uses three storage tiers: D1 (graph structure + user state), R2 (content bundles), and Analytics Engine (rich event tracking).

## Storage Boundaries

| Tier | Purpose | Examples |
|------|---------|----------|
| **D1** | Structured data, queried/joined | topics, prerequisites, encompassings, user_topic_state, review_log, collections |
| **R2** | Content bundles (read-heavy, cacheable) | problems.json, examples.json, manifest.json, future media |
| **Analytics Engine** | High-volume event telemetry (90-day TTL) | problem attempts, example views, content effectiveness |

## R2 Bundle Format

### Key Structure

```
R2 Bucket: learn-content
├── {discipline}/
│   ├── {topic-id}/
│   │   ├── manifest.json    # Version metadata, hashes, item counts
│   │   ├── problems.json    # Problem[] array
│   │   ├── examples.json    # WorkedExample[] array
│   │   └── media/           # Future: images, diagrams, audio
│   └── ...
└── _meta/
    └── disciplines.json     # Discipline list + topic counts
```

### manifest.json

```json
{
  "version": 1,
  "contentHash": "sha256:...",
  "topicId": "add-within-20",
  "discipline": "math",
  "generatedAt": "2026-03-12T18:30:00Z",
  "items": {
    "problems": { "count": 15, "hash": "sha256:...", "difficulties": {...}, "types": {...}, "demands": {...} },
    "examples": { "count": 2, "hash": "sha256:..." },
    "media": []
  },
  "dimensions": {
    "presentations": ["standard"],
    "depths": ["survey"],
    "locales": ["en"],
    "flavors": ["classic"]
  }
}
```

The `contentHash` is SHA-256 of (problems.json + examples.json) concatenated. Stored in D1 `topic_content_versions` for cache validation.

### Content Hash Computation

```
contentHash = sha256(JSON.stringify(problems) + JSON.stringify(examples))
```

Changes to any problem or example in the bundle produce a new hash, which invalidates the cache.

## D1 Content Version Tracking

```sql
CREATE TABLE topic_content_versions (
  topic_id TEXT PRIMARY KEY REFERENCES topics(id),
  content_hash TEXT NOT NULL,
  bundle_version INTEGER NOT NULL DEFAULT 1,
  problems_count INTEGER NOT NULL DEFAULT 0,
  examples_count INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  uploaded_at TEXT
);
```

Queried on every content fetch to validate cache. Updated during content deploy.

## Cache Strategy

1. **Client requests content** → Content service checks Cache API (keyed by `{discipline}/{topicId}`)
2. **Cache HIT** → Return cached problems/examples array
3. **Cache MISS** → Fetch from R2, cache response with ETag from content hash
4. **Content deploy** → R2 objects overwritten with new content → new content hash → automatic cache miss on next request

No explicit cache purging needed. Overwrite + hash change = automatic invalidation.

## Analytics Engine Events

### Problem Attempt

12 blob dimensions (userId, topicId, problemId, contentVersion, phase, difficulty, cognitiveDemand, presentation, contentDepth, disciplineId, blendRole, difficultyBias) + 6 double measures (correct, responseMs, hintsUsed, confidence, rating, misconception). Indexed by topicId.

### Example View

7 blob dimensions + 5 double measures (stepsViewed, totalSteps, totalTimeMs, fadingLevel, selfExplQuality). Indexed by topicId.

### Querying

```sql
-- Per-problem accuracy
SELECT blob3 AS problemId, SUM(double1)/COUNT(*) AS accuracy
FROM learn_analytics WHERE blob2 = 'add-within-20'
GROUP BY blob3

-- Content version A/B
SELECT blob4 AS contentVersion, SUM(double1)/COUNT(*) AS accuracy
FROM learn_analytics WHERE blob2 = 'add-within-20'
GROUP BY blob4
```

## Content Pipeline

```
learn-content/               (source of truth — JSON files)
  └── {discipline}/problems/{topic}.json, examples/{topic}.json

    ↓  tools/generate-bundles.ts

/tmp/learn-content-bundles/  (staging — bundled per-topic)
  └── {discipline}/{topic}/manifest.json, problems.json, examples.json

    ↓  tools/upload-bundles.ts

R2: learn-content bucket     (production — served to Workers)
D1: topic_content_versions   (version tracking)
```

Content authoring continues to write to learn-content JSON files. Bundles are a deploy artifact.

## Runtime Content Delivery

```
SessionService.buildPhaseItem()
  → ContentService.getTopicProblems(topicId, presentation, depth)
    → Cache API check (HIT → return)
    → R2 GET {discipline}/{topicId}/problems.json
    → Parse Problem[] array
    → Apply 7-tier fallback ranking (in-memory)
    → Return ranked Problem[]
  → selectProblem(problems, difficulty, bias, demand)
  → Return SessionItem
```

## Wrangler Bindings

```toml
[[r2_buckets]]
binding = "CONTENT"
bucket_name = "learn-content"

[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "learn-analytics"
```

Both configured for dev (local), production, and preview environments.

## Migration Timeline

- **Plan 023 Phase 1**: R2 infrastructure, bundle format, generation tool (this doc)
- **Phase 2**: Content service rewrite (D1 queries → R2 fetches)
- **Phase 3**: D1 content table cleanup, import pipeline update
- **Phase 4**: Deploy pipeline (SQL export → R2 upload)
- **Phase 5**: Analytics Engine instrumentation
- **Phase 6**: Simulation compatibility, documentation
