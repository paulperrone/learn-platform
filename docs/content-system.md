# Content System Reference

> Comprehensive guide to the platform's content taxonomy, dimensions, and creation strategies. For learning science principles, see `learning-science.md`. For architectural decisions, see `DECISIONS.md`.
>
> **Last updated:** 2026-03-06

---

## Table of Contents

1. [Content Hierarchy](#1-content-hierarchy)
2. [Content Dimensions](#2-content-dimensions)
3. [Disciplines & Progression Models](#3-disciplines--progression-models)
4. [Content Depth](#4-content-depth)
5. [Presentation Levels](#5-presentation-levels)
6. [Content Selection Algorithm](#6-content-selection-algorithm)
7. [Building Mastery-Gated Subjects](#7-building-mastery-gated-subjects)
8. [Building Context-Layered Subjects](#8-building-context-layered-subjects)
9. [Building Hybrid Subjects](#9-building-hybrid-subjects)
10. [Building Flexible Subjects](#10-building-flexible-subjects)
11. [Cross-Discipline Prerequisites](#11-cross-discipline-prerequisites)
12. [Content Creation Workflow](#12-content-creation-workflow)

---

## 1. Content Hierarchy

The platform organizes knowledge in a four-level hierarchy:

### Disciplines
Broad knowledge domains. Each discipline has a **progression model** that defines how its prerequisite graph is traversed.

| ID | Name | Progression Model | Description |
|----|------|------------------|-------------|
| `math` | Mathematics | `mastery-gated` | Quantitative reasoning. Skills compound strictly. |
| `ela` | English Language Arts | `mastery-gated` | Reading, writing, grammar. Phonics/grammar compound; comprehension layers. |
| `science` | Science | `mastery-gated` | Physical, life, earth sciences. Math prereqs + conceptual layering. |
| `history` | History & Social Studies | `context-layered` | Deepens through context layers: surveys → causes → analysis → synthesis. |
| `languages` | World Languages | `mastery-gated` | Grammar compounds; vocabulary and culture are more flexible. |
| `philosophy` | Philosophy & Ethics | `context-layered` | Thinkers respond to predecessors; context enriches but rarely gates. |
| `arts` | Arts & Music | `mastery-gated` | Technique compounds; appreciation is context-layered. |
| `cs` | Computer Science | `mastery-gated` | Strongly compounding — can't write algorithms without control flow. |

### Subjects
A bounded curriculum within a discipline. Has a knowledge graph, grade range, and topic set.

Examples: "Foundational Mathematics" (math, levels 0-5), "Pre-Algebra" (math, levels 5-7), "US History" (history, levels 0-12), "Introduction to Philosophy" (philosophy, levels 0-8).

Subjects within the same discipline can have cross-subject prerequisite edges (e.g., Foundational Math → Pre-Algebra).

### Topics
Atomic learning nodes in the knowledge graph. Each topic has:
- A subject it belongs to
- A graph depth (computed from prerequisites)
- A grade level (approximate educational stage)
- Prerequisite edges (with types: required, recommended, enriching)
- Encompassing relationships (parent topics that implicitly review child topics)

### Content
The actual instructional and assessment material, attached to topics via foreign keys. Two tables:
- **Instructional content** — Worked examples, lessons, strategy demonstrations
- **Assessment content** — Problems, quizzes, comprehension questions

Content is dimensioned — the same topic can have multiple content items varying by flavor, locale, presentation, content depth, and version.

---

## 2. Content Dimensions

Every content item (instructional or assessment) has these dimension columns:

| Dimension | Column | Values | Purpose |
|-----------|--------|--------|---------|
| **Flavor** | `flavor` | `classic`, `adventure`, `space`, ... | Thematic engagement wrapper. Same knowledge, different narrative context. |
| **Locale** | `locale` | `en`, `es`, `ja`, `ar`, ... | Language. Not a literal translation — culturally adapted. |
| **Presentation** | `presentation` | `primary`, `intermediate`, `standard`, `advanced` (or legacy `individual`) | Audience adaptation: reading level, vocabulary complexity, visual density. |
| **Content Depth** | `content_depth` | `survey`, `contextual`, `analytical`, `synthesis` | Analytical sophistication. How deeply the content treats the topic. |
| **Version** | `version` | Integer (1, 2, 3...) | Content iteration for A/B testing and improvement. |

### Dimension Independence

Dimensions are independent and compose multiplicatively. A single topic could have:
- `(classic, en, primary, survey, v1)` — English, simple, overview
- `(classic, en, standard, contextual, v1)` — English, grade-appropriate, deeper
- `(adventure, es, intermediate, survey, v1)` — Spanish, adventure-themed, overview

Not every combination needs to exist. Build the most impactful combinations first (see §12).

---

## 3. Disciplines & Progression Models

### Progression Models

**`mastery-gated`** — Must demonstrate mastery of prerequisites before unlocking the next topic.
- `required` edges: BLOCK until mastered
- `recommended` edges: BLOCK until mastered
- `enriching` edges: Suggest, don't block
- Traversal: Linear/sequential through the graph
- Example: You cannot learn multiplication without addition

**`context-layered`** — Prerequisites provide context, not hard gates. Learners progress breadth-first at each depth, then spiral deeper.
- `required` edges: BLOCK (rare — only truly foundational prereqs)
- `recommended` edges: Suggest, don't block
- `enriching` edges: Suggest, don't block
- Traversal: Breadth-first spiral — cover many topics at survey depth, then revisit at contextual depth, etc.
- Example: You CAN learn about WWII without knowing about WWI, but the context enriches understanding

**`flexible`** — All topics available. Prerequisites are ordering suggestions.
- All edge types: Suggest, never block
- Traversal: Learner-directed or difficulty-ordered
- Example: Vocabulary words can be learned in any order

### Prerequisite Edge Types

| Type | Meaning | When to use |
|------|---------|-------------|
| `required` | Cannot meaningfully engage without this knowledge | Skill dependencies (add → multiply), foundational concepts ("what is a primary source" → "analyze this primary source") |
| `recommended` | Important context that enriches understanding | Historical context (WWI → WWII), intellectual lineage (Hume → Kant) |
| `enriching` | Tangentially related, nice to have | Thematic connections (Roman Republic → American founding), cross-period parallels |

---

## 4. Content Depth

Content depth is the most important dimension for context-layered disciplines. It controls the analytical sophistication of how a topic is treated.

### Depth Levels

#### `survey` — "What?"
The foundational layer. Establishes basic facts, timelines, definitions, and narrative.

| In mastery-gated | In context-layered |
|-------------------|-------------------|
| Foundational skills: counting, basic operations, phonics | Timelines, key events, notable figures. Simple cause-and-effect narratives. |
| "3 + 4 = 7" | "The American Revolution happened in 1776. The colonists wanted independence from Britain." |

#### `contextual` — "Why and How?"
Adds causation, connections, and multiple perspectives.

| In mastery-gated | In context-layered |
|-------------------|-------------------|
| Intermediate skills: fractions, multi-step problems | Causes and effects. Connections between events. Multiple perspectives introduced. |
| "Find 3/4 of 12 by multiplying" | "Taxation without representation, Enlightenment ideas, and colonial identity drove the revolution. Not everyone was a patriot — Loyalists had their reasons too." |

#### `analytical` — "How Do We Know?"
Primary sources, formal methods, competing interpretations.

| In mastery-gated | In context-layered |
|-------------------|-------------------|
| Advanced skills: proofs, derivations, formal reasoning | Primary source analysis. Competing historical interpretations. Methodology and evidence evaluation. |
| "Prove that the sum of angles in a triangle is 180°" | "Read this excerpt from Thomas Paine's 'Common Sense.' What argument is he making? How does it differ from Edmund Burke's response?" |

#### `synthesis` — "What Does It Mean?"
Original analysis, cross-domain connections, argument construction.

| In mastery-gated | In context-layered |
|-------------------|-------------------|
| Abstract reasoning: theorem application to novel domains | Thematic analysis across periods. Comparative frameworks. Constructing original arguments from evidence. |
| "Apply calculus to model population growth" | "How does the American Revolution fit into the broader Age of Revolutions? What structural conditions enable revolutionary movements?" |

### Depth vs. Topic Depth

**Topic depth** (the `depth` column on `topics`) is the graph structural depth — how many prerequisites away a topic is from root nodes. This is computed automatically from the DAG.

**Content depth** (the `content_depth` column on content tables) is the analytical treatment level. These are independent:
- A depth-0 root topic ("Introduction to History") still has content at survey, contextual, analytical, and synthesis levels
- A depth-10 advanced topic ("The Historiography of the French Revolution") might only have analytical and synthesis content

---

## 5. Presentation Levels

Presentation adapts the same knowledge for different audiences. This is NOT about depth (that's `content_depth`) — it's about **how the content is packaged**.

| Level | Column value | Target audience | Characteristics |
|-------|-------------|----------------|-----------------|
| **Primary** | `primary` | Ages 5-7 (K-2) | Short sentences. Common words only. Heavy visual support. Emoji/icon counting aids. Story framing. |
| **Intermediate** | `intermediate` | Ages 8-10 (3-5) | Paragraph-length explanations. Grade-appropriate vocabulary. Some visual aids. Clear structure. |
| **Standard** | `standard` | Ages 11-14 (6-8) | Multi-paragraph text. Academic vocabulary introduced with definitions. Efficient, direct prose. |
| **Advanced** | `advanced` | Ages 15+ (9-12, undergraduate) | Dense text. Assumes vocabulary. Citations and references. Formal academic register. |

### Presentation ≠ Simplification

A `primary` presentation of a topic is NOT a dumbed-down version of the `standard` presentation. It is a **purpose-built treatment** for young learners:

- Different cognitive models (concrete → abstract)
- Different engagement patterns (shorter, more interactive)
- Different vocabulary (common words, defined terms)
- Different examples (relatable to young learners' world)

Example — "American Revolution" at survey depth:

**Primary presentation:** "A long time ago, America was ruled by a king who lived far away in England. The people in America thought this wasn't fair. They decided to make their own country where they could make their own rules. This was called the American Revolution."

**Standard presentation:** "In 1776, thirteen British colonies in North America declared independence from Great Britain. The colonists objected to being taxed by a Parliament in which they had no representation. After a war lasting from 1775 to 1783, the colonies won their independence and formed the United States of America."

Same facts, same depth level, completely different packaging.

### The "Late Starter" Problem

A 14-year-old starting US History from scratch should NOT receive `primary` presentation content. They need `standard` presentation at `survey` depth. The survey efficiently catches them up on foundational context without being patronizing, then they progress to contextual and analytical depth at their reading level.

The system determines presentation from the learner's age/profile, not from where they are in the curriculum.

---

## 6. Content Selection Algorithm

Implemented in `packages/api/src/services/content.ts` via `createContentService(db)`.

When the session service needs content for a learner on a given topic:

```
1. Determine content_depth (resolveContentDepth):
   - For mastery-gated: always returns 'survey' (depth is in the topic graph, not content)
   - For flexible: always returns 'survey' (topics are independent)
   - For context-layered: reads user_topic_depth table, returns first uncompleted
     depth in order: survey → contextual → analytical → synthesis

2. Determine presentation (resolvePresentation):
   - Check userPreferences.presentationOverride first (explicit user setting)
   - Otherwise derive from user.birthYear:
     ages ≤8 → primary, ≤11 → intermediate, ≤14 → standard, 14+ → advanced
   - Default: 'standard' (when no birthYear set)

3. Select content matching (topicId, content_depth, presentation, flavor, locale):
   - Query assessmentContent / instructionalContent with all dimension filters
   - flavor defaults to 'classic', locale defaults to 'en'

4. Fallback chain if no exact match (getTopicProblems / getTopicExamples):
   a. Try adjacent presentation levels in order:
      primary → [intermediate, standard, advanced]
      intermediate → [standard, primary, advanced]
      standard → [intermediate, advanced, primary]
      advanced → [standard, intermediate, primary]
   b. Try 'classic' flavor if requested flavor unavailable
   c. Try 'en' locale if requested locale unavailable
   d. Try 'survey' depth if requested depth unavailable
   e. Last resort: any content for the topic (ignores all dimension filters)
```

---

## 7. Building Mastery-Gated Subjects

For math, CS, grammar, music technique, etc.

### Graph Structure
- Prerequisites are mostly `required` (hard gates)
- Linear chains with some parallelism (addition and subtraction can be learned somewhat independently)
- Depth levels in the graph represent skill progression
- Cross-subject edges to prior subjects in the discipline (Foundational Math → Pre-Algebra)

### Content Strategy
- **Content depth is usually `survey`** — mastery-gated content doesn't typically need multiple analytical layers because the depth IS the topic progression itself. "Adding fractions" is inherently deeper than "adding whole numbers."
- **Presentation matters a lot** — the same skill taught to a 6-year-old vs. a 14-year-old needs different examples, vocabulary, and scaffolding
- **Assessment is binary** — right or wrong (with partial credit for multi-step)
- **Build all presentation levels for each topic** — a late-starting teenager needs age-appropriate instruction on basic skills

### Priority Order
1. Survey depth, standard presentation (covers most learners)
2. Survey depth, primary presentation (K-2 audience)
3. Survey depth, intermediate presentation (3-5 audience)
4. Additional flavors for engagement

---

## 8. Building Context-Layered Subjects

For history, philosophy, literature, political science, etc.

### Graph Structure
- Most edges are `recommended` (context, not gates)
- Sparse `required` edges for truly foundational concepts
- `enriching` edges connect related topics across time/theme
- Graph is wide and shallow — many topics at similar depth

### The Spiral Curriculum

Content-layered subjects use a **spiral progression**:

```
Pass 1 (survey):     Topic A → Topic B → Topic C → Topic D → ...
Pass 2 (contextual): Topic A → Topic B → Topic C → Topic D → ...
Pass 3 (analytical): Topic A → Topic B → Topic C → Topic D → ...
Pass 4 (synthesis):  Topic A → Topic B → Topic C → Topic D → ...
```

Each pass covers the SAME topics at increasing analytical depth. The system tracks which content_depth the learner has completed per topic.

### The Survey as Universal Entry Point

EVERY learner starts with the survey layer, regardless of age. But the presentation differs:

| Learner | Content selected |
|---------|-----------------|
| 6-year-old, first time | depth=survey, presentation=primary |
| 10-year-old, first time | depth=survey, presentation=intermediate |
| 14-year-old, first time | depth=survey, presentation=standard |
| 14-year-old, going deeper | depth=contextual, presentation=standard |
| 17-year-old AP student | depth=analytical, presentation=advanced |

The 14-year-old's survey is NOT baby content. It's a crisp, age-appropriate summary that efficiently conveys foundational context. Think textbook chapter introduction, not children's picture book.

### Mapping Depth to Educational Stages

| Content Depth | Typical grade range | What learners do |
|--------------|--------------------|--------------------|
| `survey` | K-5 (or any entry point) | Learn facts, timelines, key figures. Answer "who, what, when, where" questions. |
| `contextual` | 6-8 | Explain causes and effects. Compare perspectives. Connect events to each other. |
| `analytical` | 9-12 | Read primary sources. Evaluate competing interpretations. Identify bias and methodology. |
| `synthesis` | AP / undergraduate | Construct original arguments. Apply theoretical frameworks. Compare across domains. |

These are NOT rigid grade assignments — a gifted 10-year-old might work at analytical depth, and an adult learner starts at survey. The depth tracks analytical capability, not age.

### Content Creation Order for Context-Layered Subjects

1. **Survey layer for ALL topics, ALL presentation levels** — This is the skeleton. Every learner needs it. Build this first.
2. **Contextual layer for anchor topics, standard + intermediate presentation** — Focus on the most important topics that everything else connects to.
3. **Analytical layer for anchor topics, standard + advanced presentation** — For high school and AP-level learners.
4. **Fill out remaining topics** at contextual and analytical depth.
5. **Synthesis layer** is premium content, built last and only for advanced learners.

### Assessment by Depth

| Depth | Assessment style | Grading |
|-------|-----------------|---------|
| survey | Recall: "When was the American Revolution?" "Who wrote the Declaration of Independence?" | Binary — right/wrong |
| contextual | Explanation: "Name two causes of the American Revolution" | Rubric — partial credit for multiple valid points |
| analytical | Analysis: "Compare these two primary sources. How do they differ on the causes of revolution?" | Rubric — multi-dimensional scoring (evidence use, argument quality, source evaluation) |
| synthesis | Argument: "To what extent was the American Revolution inevitable? Support your argument with evidence." | Rubric — holistic scoring with dimension breakdown |

---

## 9. Building Hybrid Subjects

Economics, some sciences, and advanced language courses have both compounding skills and contextual knowledge.

### Strategy

Set the discipline's progression model based on the **dominant** pattern:
- Economics → `mastery-gated` (can't do elasticity without supply/demand)
- Environmental Science → `mastery-gated` (needs bio + chem foundations)

Then use prerequisite edge types to encode the nuance:
- **Skill prerequisites** → `required` (supply/demand → elasticity)
- **Contextual prerequisites** → `recommended` (Great Depression → Keynesian economics)
- **Thematic connections** → `enriching` (Roman trade → mercantilism)

Use `content_depth` for the contextual knowledge component:
- Survey: "What is inflation? It means prices go up over time."
- Contextual: "Inflation can be caused by demand-pull, cost-push, or monetary expansion."
- Analytical: "Compare monetarist and Keynesian explanations of the 1970s stagflation."

The mastery-gated progression model ensures skill prerequisites are enforced while content_depth allows the contextual component to deepen over time.

---

## 10. Building Flexible Subjects

Vocabulary, geography, anatomy, etc.

### Graph Structure
- Most edges are `enriching` (suggestions)
- Topics are largely independent
- Order based on frequency/utility, not prerequisite chains

### Content Strategy
- **Content depth is mostly `survey`** — vocabulary words don't need analytical layers
- **Presentation matters** — age-appropriate definitions and example sentences
- **Assessment is recall-based** — definitions, identification, matching
- **Spaced repetition is the primary learning mechanism** — FSRS handles the scheduling

---

## 11. Cross-Discipline Prerequisites

Prerequisites can cross discipline boundaries:

| From | To | Type | Rationale |
|------|----|------|-----------|
| Basic reading (ELA) | Math word problems (Math) | `required` | Can't parse word problems without reading |
| Algebra (Math) | Physics equations (Science) | `required` | Can't manipulate physics formulas without algebra |
| Statistics (Math) | Research methods (Science) | `recommended` | Enhances understanding but not strictly required for conceptual grasp |
| Ancient Greece (History) | Greek Philosophy (Philosophy) | `recommended` | Historical context enriches philosophical understanding |

### Rules for Cross-Discipline Edges
- Almost always `required` — if the dependency is soft enough to be `recommended`, question whether it's truly a cross-discipline prerequisite
- The diagnostic should eventually place students across the full connected graph
- Cross-discipline edges create natural bridges that guide learners between subjects

### Validation
- `graph.validateDAG(subjectId)` validates within a single subject (ignores cross-subject edges)
- `graph.validateDAG()` (no argument) validates the full graph across all subjects, detecting cross-subject cycles
- API: `GET /api/subjects/:id/validate` for single-subject, `GET /api/graph/validate` for full graph

---

## 12. Content Creation Workflow

### Priority Matrix

When building content for a new subject, follow this priority order:

| Priority | What | Why |
|----------|------|-----|
| 1 | Survey depth x standard presentation x all topics | Covers the largest audience (6-8 and adult learners) |
| 2 | Survey depth x intermediate presentation x all topics | Opens the 3-5 audience |
| 3 | Survey depth x primary presentation x entry topics | Opens the K-2 audience (not all topics need primary) |
| 4 | Contextual depth x standard presentation x anchor topics | Deepens the most important topics |
| 5 | Assessment pool expansion (20+ per topic) | Prevents repetition, enables diverse retrieval practice |
| 6 | Additional content depths and presentation levels | Fill the matrix based on demand data |

### Quality Gates

All generated content must pass:
1. **Platform-medium constraints** — Screen-only delivery. No physical objects, drawing, speaking aloud.
2. **Presentation-level appropriateness** — Vocabulary and sentence complexity match the target audience.
3. **Depth-level accuracy** — Survey content doesn't sneak in analytical concepts. Analytical content doesn't oversimplify.
4. **Factual accuracy** — Especially critical for context-layered subjects where content is knowledge-based, not skill-based.
5. **Bias review** — History and social studies content must present multiple perspectives fairly.

### Content Pack Format

The `graph.json` for each subject includes:
- `disciplineId` — links to the parent discipline
- Topics with `gradeLevel` for approximate educational stage
- Prerequisites with `type` (required/recommended/enriching)
- Content files reference depth and presentation in their metadata
