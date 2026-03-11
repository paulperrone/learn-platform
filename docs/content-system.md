# Content System Reference

> Comprehensive guide to the platform's content taxonomy, dimensions, and creation strategies. For learning science principles, see `learning-science.md`. For architectural decisions, see `DECISIONS.md`.
>
> **Last updated:** 2026-03-08

---

## Table of Contents

1. [Content Hierarchy](#1-content-hierarchy)
2. [Content Dimensions](#2-content-dimensions)
3. [Disciplines & Progression Models](#3-disciplines--progression-models)
4. [Encompassing Relationships](#4-encompassing-relationships)
5. [Content Depth](#5-content-depth)
6. [Presentation Levels](#6-presentation-levels)
7. [Content Selection Algorithm](#7-content-selection-algorithm)
8. [Building Mastery-Gated Subjects](#8-building-mastery-gated-subjects)
9. [Building Context-Layered Subjects](#9-building-context-layered-subjects)
10. [Building Hybrid Subjects](#10-building-hybrid-subjects)
11. [Building Flexible Subjects](#11-building-flexible-subjects)
12. [Cross-Discipline Prerequisites](#12-cross-discipline-prerequisites)
13. [Graph Design Guidelines](#13-graph-design-guidelines)
14. [Graph Design Checklist](#14-graph-design-checklist)
15. [Content Creation Workflow](#15-content-creation-workflow)
16. [Cognitive Demand](#16-cognitive-demand)
17. [Content Iteration Protocol](#17-content-iteration-protocol)

---

## 1. Content Hierarchy

The platform organizes knowledge in a discipline-owned graph with optional packaging views:

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

### Collections
User-facing packaging views over one or more discipline graphs. Collections do **not** own topics; they group existing topics into intelligible units for browsing, onboarding, remediation, and reporting.

Examples:
- Grade-band collections: "Grade 3 Math", "Grade 7 Math"
- Focused tracks: "Fractions Mastery", "Ratios & Proportions"
- Exam packaging: "SAT Math Prep"
- Chronological/thematic paths: "Colonial America", "Age of Revolutions"
- Interdisciplinary paths: "Econometrics", "Data Science Foundations"

A topic may appear in multiple collections. The graph remains single-source; collections are views. A collection may have a **primary discipline** for navigation and display, but it may include topics from other disciplines when the learner-facing path is genuinely interdisciplinary.

### Topics
Atomic learning nodes in the knowledge graph. Each topic has:
- A discipline it belongs to
- A graph depth (computed from prerequisites)
- A grade level (approximate educational stage)
- Prerequisite edges (with types: required, recommended, enriching)
- Encompassing relationships (parent topics that implicitly review child topics)
- Optional memberships in one or more collections

Canonical ownership stays singular even when packaging is interdisciplinary. For example, econometrics topics may belong to `economics`, statistics topics may belong to `math`, and an "Econometrics" collection may include both.

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
| **Presentation** | `presentation` | `primary`, `intermediate`, `standard`, `advanced` | Audience adaptation: reading level, vocabulary complexity, visual density. |
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

## 4. Encompassing Relationships

> See also: [`fire-implementation-analysis.md`](fire-implementation-analysis.md) for a comprehensive analysis of FIRe implementation approaches and empirical findings.

Encompassing edges are distinct from prerequisites. **Prerequisites** control sequencing — "you must learn A before B." **Encompassings** define implicit practice — "practicing B implicitly exercises A."

When a student practices topic B and B encompasses A, the platform gives A a **virtual FSRS review** — updating its spaced-repetition state (stability, due date, last review) as if it were actually reviewed, scaled by the encompassing weight. This is FIRe (Fractional Implicit Repetition) credit. With sufficient encompassing density, most topics can be maintained through implicit repetition alone — Math Academy reports roughly one explicit review per topic on average.

### How to Identify Encompassing Edges

Encompassing edges fall into three categories:

**1. Within-strand chains** — Same operation at increasing complexity. Every higher-level topic in a strand encompasses its predecessors.

Examples:
- `add-within-100` encompasses `add-within-20` (which encompasses `add-within-10`)
- `subtract-within-100-fluent` encompasses `subtract-within-100` (which encompasses `subtract-within-20`)
- `equivalent-fractions` encompasses `fractions-of-whole`

Within-strand chains are the most natural encompassings — if you can add within 100, you're implicitly practicing adding within 20.

**2. Cross-strand** — A topic in one strand exercises skills from another strand.

Examples:
- Word problems encompass computation: `addition-word-problems` encompasses `add-within-100-fluent`
- Multi-step problems encompass component operations: `multi-step-word-problems` encompasses add, subtract, multiply, divide fluency
- Measurement encompasses arithmetic: `perimeter-area` encompasses `add-within-100-fluent` and `multiply-within-100`
- Fractions encompass whole-number operations: `equivalent-fractions` encompasses `multiply-within-100`

Cross-strand edges provide the most compression value — one word-problem review can implicitly refresh multiple computation skills.

**3. Application → foundation** — Any topic that uses a simpler skill as a tool (not as the primary focus).

Examples:
- Long division encompasses multiplication (checking quotients)
- Order of operations encompasses all four basic operations
- Coordinate geometry encompasses number lines and basic arithmetic

### Weight Assignment Rubric

Encompassing weights represent how much practicing the parent topic exercises the child skill. Weights range from 0.3 to 1.0:

| Weight Range | Meaning | Examples |
|---|---|---|
| **0.8-1.0** | Advanced topic exercises the simpler skill nearly identically | `count-to-20` → `count-to-10` (0.8), `add-within-20` → `add-within-5` (0.9) |
| **0.5-0.7** | Simpler skill is a core component exercised every time | `place-value-hundreds` → `place-value-tens-ones` (0.7), `factors-multiples` → `multiply-within-100` (0.5) |
| **0.3-0.4** | Simpler skill is exercised incidentally | `order-of-operations` → `add-within-100-fluent` (0.3), `money-coins-bills` → `skip-count-2-5-10` (0.4) |

**Heuristics:**
- Within-strand edges: 0.6-0.8 (direct skill progression)
- Cross-strand edges: 0.3-0.5 (incidental exercise)
- Word-problem edges: 0.4-0.6 (computation is exercised but not the focus)
- Never create edges below 0.3 — the FIRe credit is negligible and adds graph complexity

### Target Density by Discipline

| Discipline type | Target edges/topic | Rationale |
|---|---|---|
| **Mastery-gated** (math, CS) | 1.0-2.0 | Dense within-strand chains + cross-strand links. Skills compound heavily. |
| **Context-layered** (history, philosophy) | 0.5-1.0 | "Causes of Civil War" encompasses "Slavery in America" (~0.4). Less direct skill transfer. |
| **Flexible** (vocabulary, geography) | 0.3-0.5 | Root words encompass derived words (~0.3). Topics are mostly independent. |

Math-foundations achieved 1.9 edges/topic (133 edges across 71 topics) with measurable FIRe compression improvement.

### Multi-Hop Credit

FIRe credit flows through encompassing chains up to 3 hops deep, with cumulative weight diminishing at each hop:

```
order-of-operations
  → multiply-within-100  (hop 1, weight 0.4)
    → skip-count-2-5-10  (hop 2, cumulative 0.4 × 0.4 = 0.16)
      → count-to-20      (hop 3, cumulative 0.16 × 0.3 = 0.048 → pruned, below 0.05)
```

Paths with cumulative weight below 0.05 are pruned as negligible.

### Validation Checklist

Run after adding encompassing edges to any subject:

1. `just validate-content` passes (DAG integrity, all topic IDs valid)
2. Every leaf topic (no children in the prerequisite graph) is encompassed by at least one parent
3. Multi-hop chains exist for deep graph regions (3+ hops)
4. Weight distribution is reasonable (mostly 0.3-0.6 with some 0.7-0.9 within-strand)
5. `just visualize <subject>` shows clear hierarchical structure
6. FIRe compression test passes (`fire-compression.test.ts` can be parameterized for new subjects)

### Anti-Patterns

- **Too indirect:** Don't add encompassings where the exercise is tangential. Reading a word problem doesn't encompass phonics.
- **Inflated weights:** Don't inflate weights to game compression. Inaccurate weights mean students skip reviews they actually need.
- **Below threshold:** Don't create edges below 0.3. The FIRe credit is negligible and adds graph complexity.
- **Missing cross-strand:** Don't skip cross-strand edges. They provide the most compression value — one review covering multiple skill areas.

---

## 5. Content Depth

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

## 6. Presentation Levels

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

## 7. Content Selection Algorithm

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

## 8. Building Mastery-Gated Subjects

For math, CS, grammar, music technique, etc.

### Graph Structure
- Prerequisites are mostly `required` (hard gates)
- Linear chains with some parallelism (addition and subtraction can be learned somewhat independently)
- Depth levels in the graph represent skill progression
- Cross-collection or prior-grade dependencies inside the same discipline graph when they are genuinely required

### Content Strategy
- **Content depth is always `survey`** — mastery-gated disciplines encode analytical progression in the topic graph itself. "Adding fractions" IS deeper than "adding whole numbers." The survey/contextual/analytical/synthesis depth layers are for context-layered disciplines only. Never create non-survey depth content for mastery-gated discipline graphs.
- **Presentation matters a lot** — the same skill taught to a 6-year-old vs. a 14-year-old needs different examples, vocabulary, and scaffolding
- **Assessment is binary** — right or wrong (with partial credit for multi-step)
- **Build all presentation levels for each topic** — a late-starting teenager needs age-appropriate instruction on basic skills

### Priority Order
1. Survey depth, standard presentation (covers most learners)
2. Survey depth, primary presentation (K-2 audience)
3. Survey depth, intermediate presentation (3-5 audience)
4. Additional flavors for engagement

---

## 9. Building Context-Layered Subjects

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

## 10. Building Hybrid Subjects

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

## 11. Building Flexible Subjects

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

## 12. Cross-Discipline Prerequisites

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
- Cross-discipline edges create natural bridges that guide learners between discipline graphs

### Interdisciplinary Collections

Cross-discipline edges handle the **knowledge dependency**. Interdisciplinary collections handle the **learner-facing packaging**.

Use an interdisciplinary collection when:
- Learners experience the path as one coherent offering
- The path depends on multiple canonical disciplines
- You want one browseable/remediable package without duplicating topics

Example: `econometrics`
- Canonical ownership:
  - probability, sampling, estimation, hypothesis testing, regression foundations -> `math`
  - economic modeling and domain-specific interpretation topics -> `economics`
- Packaging:
  - one `econometrics` collection with a primary discipline of `economics`
- Dependencies:
  - econometrics application topics use `required` cross-discipline edges to the relevant statistics topics

Rule of thumb:
- Put each topic in the discipline that best matches its core learning objective
- Use cross-discipline prerequisite edges for genuine dependencies
- Use interdisciplinary collections when the user should see one coherent path
- Do **not** duplicate prerequisite topics into multiple disciplines just to make packaging easier

### Validation
- Target model: validate a full discipline graph at once, not arbitrary same-discipline subgraphs
- Full-graph validation must still catch cross-discipline cycles
- During migration, some tooling/endpoints may still expose legacy subject-scoped validation

---

## 13. Graph Design Guidelines

When designing a knowledge graph for a new discipline or expanding an existing discipline graph, follow these guidelines for topic granularity, graph shape, prerequisite density, and encompassing density based on the discipline's progression model.

### Topic Granularity

| Progression Model | Typical Density | Granularity | Rationale |
|---|---|---|---|
| **Mastery-gated** | High | One independently placeable, teachable, and remediable skill per topic | This is the finest-grained model. A topic should be small enough that a learner can clearly know one part and fail another. In math, use Math Academy-style density as the benchmark and expect skill graphs to be roughly 4-6x finer than standards-level decomposition. |
| **Context-layered** | Medium | One coherent historical/conceptual question, theme, or analytical lens per topic | Broader than math, but still much narrower than textbook chapters or whole units. Topics are revisited across depth levels; density comes from layers plus multiple perspectives, not from tiny procedural skills. |
| **Flexible** | Medium-high | Independent recall unit or a very tight natural cluster | Topics are mostly standalone, but they still need to stay small enough for targeted assessment and quick retrieval practice. Group only when the cluster is genuinely learned together. |

**Do not use fixed per-subject topic counts as the primary design target.** Collections are packaging views and may vary widely in size. The real target is whether the graph has enough atomic topics for accurate placement, targeted remediation, and meaningful FIRe relationships.

#### Topic Split Heuristics

Split a topic when any of these are true:
- A learner could reasonably pass one part and fail another
- Remediation would naturally point to an intermediate step that is currently hidden
- The topic contains an internal prerequisite chain
- A capstone topic would meaningfully encompass the hidden sub-skills

Keep a topic combined only when it is genuinely atomic for placement, instruction, and review.

#### Content Density Guardrails

| Progression Model | Problems per Topic | Prereq Density | Encompassing Density | Structural Guardrail |
|---|---|---|---|---|
| **Mastery-gated** | Minimum 15, target 20-30+ | 1.5-3.0 edges/topic | 1.0-2.0 edges/topic | Each mature strand should have explicit capstones that encompass component skills; remediation should be able to step down one skill at a time. |
| **Context-layered** | Minimum 6, target 8-15 | 0.5-1.0 edges/topic | 0.5-1.0 edges/topic | Each major era/theme should include integrative topics and methodological foundations, but avoid over-gating. |
| **Flexible** | Minimum 5, target 8-12 | 0.0-0.5 edges/topic | 0.0-0.5 edges/topic | Prefer many small, independent retrieval units; clusters must still support targeted recall. |

For mastery-gated disciplines, benchmark density against the strongest known external exemplars when available. For mathematics, Math Academy is the reference point. For ELA, CS, music technique, and similar domains, use the same skill-level principle even when no external ratio is available: the learner should be able to fail narrowly and be remediated narrowly.

### Recommended Graph Shape

| Progression Model | Shape | Prereq Edges/Topic | Max Depth | Width Profile |
|---|---|---|---|---|
| **Mastery-gated** | Deep chains with parallelism | 1.5-2.5 | 10-15 | Narrow at roots (5-8), widens at mid-depth (6-10 per level), narrows at leaves (1-3) |
| **Context-layered** | Wide, shallow layers | 0.5-1.0 | 3-5 | Wide at every level (8-15 per level), few deep chains |
| **Flexible** | Sparse, mostly disconnected | 0.2-0.5 | 1-2 | Nearly flat — most topics at depth 0-1 |

**Reference shape:** A healthy mastery-gated math graph has multiple parallel strands, deep enough chains for skill progression, and late capstones that integrate earlier skills. The exact topic count depends on how broadly the discipline is packaged into collections, not on a fixed "topics per subject" target.

#### Mastery-Gated Shape Details

The graph should have **parallel strands** that share common foundations:

```
Strand structure (math example):
  count → add → add-fluent → multiply → multiply-fluent
  count → subtract → subtract-fluent → divide → divide-fluent
                                          ↘               ↘
                                     fractions → equivalent-fractions → ...
```

- **Early depths (0-3):** Foundational skills. 5-8 topics. Multiple independent entry points.
- **Mid depths (4-8):** Strands develop in parallel. Widest part of the graph. Cross-strand prerequisites emerge (fractions need multiplication).
- **Late depths (9+):** Strands converge into integrative topics (word problems, multi-step reasoning). Graph narrows.

#### Context-Layered Shape Details

The graph should be **wide and shallow** with thematic clusters:

```
Cluster structure (history example):
  [foundations] → [era-1-topics] → [era-2-topics] → [era-3-topics]
                        ↕                 ↕                ↕
              (enriching cross-era connections)
```

- **Depth 0:** Methodological foundations ("What is a primary source?", "Reading a timeline"). 2-4 topics. These are the only `required` prerequisites.
- **Depth 1-2:** Thematic/chronological clusters. 8-15 topics each. Connected by `recommended` edges within an era, `enriching` edges across eras.
- **Depth 3+:** Integrative/comparative topics that require multiple era clusters. Rare — most topics sit at depth 1-2.

#### Flexible Shape Details

Nearly flat. Most topics at depth 0 with optional `enriching` edges:

```
  root-words ···(enriching)··· derived-words
  continent-A ···(enriching)··· continent-B
```

### Prerequisite Edge Type Distribution

| Progression Model | `required` | `recommended` | `enriching` |
|---|---|---|---|
| **Mastery-gated** | 90-100% | 0-10% | 0-5% |
| **Context-layered** | 5-10% | 60-75% | 20-30% |
| **Flexible** | 0% | 5-15% | 85-95% |

### Encompassing Design Patterns by Model

Encompassing edges are documented in detail in §4. This section covers **density targets and design strategies** per progression model.

#### Mastery-Gated (target: 1.0-2.0 edges/topic)

Dense encompassings are the primary mechanism for reducing explicit review load. Three patterns dominate:

1. **Within-strand chains** (weight 0.6-0.8): Every topic encompasses its direct predecessors in the same skill strand. `multiply-within-100` encompasses `multiply-within-20` which encompasses `skip-count-2-5-10`.
2. **Cross-strand bridges** (weight 0.3-0.5): Application topics encompass component skills from other strands. `addition-word-problems` encompasses `add-within-100-fluent`.
3. **Integration sinks** (weight 0.3-0.5): Late-graph integrative topics encompass many earlier skills. `order-of-operations` encompasses all four basic operations. `multi-step-word-problems` encompasses add, subtract, multiply, divide fluency.

**Strategy:** Start with within-strand chains (mechanical — every successor encompasses its predecessors). Then add cross-strand bridges by asking "what skills does this topic exercise incidentally?" Finally, check integration sinks for broad encompassing.

#### Context-Layered (target: 0.5-1.0 edges/topic)

Encompassings are sparser because topics exercise each other less directly. Patterns:

1. **Thematic deepening** (weight 0.4-0.6): A contextual-depth treatment of a topic encompasses the survey-depth treatment. Analyzing causes of WWI implicitly reviews WWI facts.
2. **Cross-era connections** (weight 0.3-0.4): Comparative topics encompass the individual topics being compared. "Age of Revolutions" encompasses American, French, and Haitian revolutions.
3. **Methodological application** (weight 0.3-0.4): Topics that apply a methodology encompass the methodology topic. "Analyze this primary source" encompasses "What is a primary source?"

**Strategy:** Focus on thematic deepening first — these are the most natural and highest-weight. Add cross-era connections for topics that explicitly draw comparisons. Methodological encompassings apply only to the small set of foundational method topics.

#### Flexible (target: 0.3-0.5 edges/topic)

Minimal encompassings. Topics are mostly independent.

1. **Root → derived** (weight 0.3-0.4): Knowing a Latin root encompasses derived vocabulary. `root-port` encompasses `transport`, `export`, `import`.
2. **Category → member** (weight 0.3): Studying a geographic region encompasses individual country facts within it.

**Strategy:** Only add encompassings where practicing one topic genuinely exercises another. Most flexible-model topics will have 0 encompassing edges, and that's correct.

---

## 14. Graph Design Checklist

Run through this checklist before generating content for any new discipline graph or major discipline expansion. Every item must pass.

### Structural Validity

- [ ] **DAG valid** — `just validate-content` passes with no cycles
- [ ] **Connected graph** — Every topic is reachable from at least one root (no orphaned topics)
- [ ] **Root topics exist** — At least 2 root topics (no prerequisites) to provide multiple entry points
- [ ] **No bottleneck topics** — No single topic is the sole prerequisite for more than 8 downstream topics (creates a single point of failure for learner progression)

### Progression Model Compliance

- [ ] **Edge types match model** — Mastery-gated uses mostly `required`, context-layered uses mostly `recommended`, flexible uses mostly `enriching` (see §13 distribution table)
- [ ] **Granularity appropriate** — Topic size fits the model: mastery-gated topics are independently remediable skills; context-layered topics are coherent themes/questions/lenses; flexible topics are retrieval units or tight clusters
- [ ] **No standards-level blobs** — If a topic hides multiple skills or an internal progression, split it
- [ ] **Depth appropriate** — Max graph depth falls within target range (10-15 mastery-gated, 3-5 context-layered, 1-2 flexible)
- [ ] **Prerequisite density in range** — Prereq edges/topic matches target (1.5-2.5 mastery-gated, 0.5-1.0 context-layered, 0.2-0.5 flexible)

### Encompassing Completeness

- [ ] **Density target met** — Encompassing edges/topic within target range (1.0-2.0 mastery-gated, 0.5-1.0 context-layered, 0.3-0.5 flexible)
- [ ] **Leaf coverage** — Every leaf topic (no children in prereq graph) is encompassed by at least one parent
- [ ] **Within-strand chains complete** — For mastery-gated discipline graphs: every topic in a skill strand encompasses its direct predecessor
- [ ] **Weight distribution reasonable** — Mostly 0.3-0.6 with some 0.7-0.9 within-strand; nothing below 0.3
- [ ] **Multi-hop chains exist** — For deep graphs (depth 8+): encompassing chains reach 3+ hops in dense graph regions

### Frontier Computation

- [ ] **Frontier is reasonable** — For a brand-new user, the frontier computation returns 3-8 root or near-root topics (not the entire graph, not just one topic)
- [ ] **Progression is smooth** — Mastering a frontier topic unlocks 1-3 new topics (not 0, not 10+)
- [ ] **Dead ends avoided** — No topic exists where mastering it unlocks nothing and it isn't a natural terminus of the discipline graph or collection path

### Visualization

- [ ] **`just visualize <graph>`** shows clear hierarchical structure with identifiable strands/clusters
- [ ] **No visual clutter** — Graph is readable; if it's a tangled mess, the structure probably needs simplification
- [ ] **Collections are intelligible** — Grade bands, tracks, or thematic paths make sense to an end user without becoming ownership boundaries
- [ ] **Interdisciplinary packaging is honest** — When a collection spans disciplines, canonical ownership is still clear and prerequisite gaps are visible to the learner

---

## 15. Content Creation Workflow

### Priority Matrix

When building content for a new discipline graph or collection-packaged expansion, follow this priority order:

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

The `graph.json` for each discipline graph includes:
- `disciplineId` — links to the parent discipline
- Topics with `gradeLevel` for approximate educational stage
- Prerequisites with `type` (required/recommended/enriching)
- Content files reference depth and presentation in their metadata

---

## 16. Cognitive Demand

Assessment problems are tagged with a **cognitive demand** type that describes what kind of thinking the problem exercises. The session service mixes demands based on the learner's presentation level, preventing sessions from feeling repetitive ("one-note") even when the topic stays the same.

### Demand Types

| Demand | What it tests | Definition |
|---|---|---|
| `procedural` | Can you execute the procedure? | Direct computation or skill application with no context or reasoning required. |
| `application` | Can you apply it in context? | Word problems, scenarios, or real-world framing that requires selecting and applying the right procedure. |
| `conceptual` | Do you understand the underlying property? | Questions about *why* something works, mathematical properties, equivalences, or alternative representations. |
| `reasoning` | Can you reason about it without computing? | Estimation, comparison, logical deduction, or pattern recognition — no computation needed. |
| `error_analysis` | Can you diagnose mistakes? | Given incorrect work, identify what went wrong and explain the misconception. |

### Examples by Grade Level

**G0-1 (Add Within 20):**

| Demand | Example |
|---|---|
| `procedural` | "Compute 7 + 8" |
| `application` | "Sara has 7 stickers and gets 8 more. How many does she have now?" |

**G2-3 (Fractions of a Whole):**

| Demand | Example |
|---|---|
| `procedural` | "What is 1/4 of 12?" |
| `application` | "A pizza is cut into 8 equal slices. You eat 3. What fraction did you eat?" |
| `conceptual` | "Show two different ways to represent 3/4 using words or numbers." |

**G4-5 (Order of Operations):**

| Demand | Example |
|---|---|
| `procedural` | "Evaluate: 3 + 4 × 2" |
| `application` | "You buy 3 notebooks at $4 each and a pen for $2. Write an expression and find the total." |
| `conceptual` | "Why does 3 + 4 × 2 equal 11, not 14? Explain the rule." |
| `reasoning` | "Without computing: is (5 + 3) × 2 greater or less than 5 + 3 × 2? Explain." |
| `error_analysis` | "Alex wrote 3 + 4 × 2 = 14. What mistake did Alex make?" |

### Generation Targets by Grade Level

When creating content for a topic, the cognitive demands to include depend on the topic's grade level:

| Grade Level | Demands to Generate | Distribution |
|---|---|---|
| **G0-1** | `procedural` + `application` only | 60% procedural, 40% application |
| **G2-3** | `procedural` + `application` + `conceptual` | 40% procedural, 30% application, 30% conceptual |
| **G4-5** | All five types | 30% proc, 20% app, 20% concept, 20% reasoning, 10% error_analysis |

- **G0-1:** Conceptual, reasoning, and error analysis are developmentally inappropriate. Stick to "do it" and "use it."
- **G2-3:** Conceptual questions at this level are concrete: "Show two different ways to make 15" or "Is 3 + 4 the same as 4 + 3? Why?" — not abstract properties.
- **G4-5:** Reasoning and error analysis become meaningful. Students can compare without computing, identify mistakes, and explain rules.
- **Not every topic needs all demands.** Some topics are inherently procedural (basic counting). The system handles this gracefully — don't force unnatural demands.

### Relationship to Presentation Level

Content is generated with demands appropriate to the **topic's grade level**. The session service then selects from available demands based on the **learner's presentation level**.

The `DEMAND_PROFILES` in `packages/shared/src/types.ts` define what the session service draws from:

| Presentation Level | Available Demands | Weighting |
|---|---|---|
| `primary` (K-2) | procedural, application | 60/40 |
| `intermediate` (3-5) | + conceptual | 45/30/25 |
| `standard` (6-8) | + reasoning | 35/25/25/15 |
| `advanced` (9+) | + error_analysis | 25/20/20/20/15 |

**Key insight:** These are independent dimensions. A precocious 8-year-old at `standard` presentation on a G2 topic will get conceptual questions (because they exist for G2) but not reasoning (because G2 content doesn't have reasoning problems). The session service can only select from demands that exist in the content — it handles missing demand types gracefully by falling back to whatever is available.

### Phase-Specific Demand Selection

The session service applies different demand strategies per learning phase:

| Phase | Demand Strategy | Rationale |
|---|---|---|
| **Pretest** | procedural + application only (60/40) | Quick diagnostic check — not the place for "explain why" |
| **Instruction** | N/A (worked examples) | No assessment in this phase |
| **Guided** | Favor conceptual | "Why does this work?" pairs with self-explanation scaffolding |
| **Independent** | Full profile mixing | Primary mixing phase — uses the learner's full demand distribution |
| **Review** | Favor procedural + application (55/45) | Retrieval practice is about recall, not deep reasoning |
| **Remediation** | Always procedural | Student is struggling — reduce cognitive load |

### Demand Tracking

The session state tracks `servedDemands: CognitiveDemand[]` — a running list of demands served this session. The `selectTargetDemand` function compares the actual distribution of served demands against the target profile weights and picks the most underrepresented demand type. This ensures variety over the course of a session without strict ordering.

---

## 17. Content Iteration Protocol

A detect → diagnose → fix → deploy → measure workflow for improving content based on usage data. Content is never "done" — usage data reveals problems that aren't visible during authoring.

### Detection: Surfacing Poor-Performing Content

Query `review_log` and `user_topic_state` to identify topics that need attention. The following signals indicate problems:

#### Red Flags (investigate immediately)

| Signal | Query basis | Threshold | What it suggests |
|---|---|---|---|
| **Very low accuracy** | `review_log.correct` grouped by `topicId` | < 50% across 20+ attempts | Content is too hard, ambiguous, or has wrong answers |
| **Very high accuracy** | `review_log.correct` grouped by `topicId` | > 95% across 20+ attempts | Content is too easy — not testing the intended skill |
| **High hint usage** | `review_log.hintsUsed` grouped by `topicId` | > 60% of attempts use hints | Instruction is insufficient or problems are unclear without hints |
| **High lapse rate** | `user_topic_state.lapses` grouped by `topicId` | Average > 3 lapses per user | Topic isn't sticking — possible prerequisite gap or poor instruction |

#### Yellow Flags (review when time permits)

| Signal | Query basis | Threshold | What it suggests |
|---|---|---|---|
| **Moderate low accuracy** | `review_log.correct` by `topicId` | 50-70% across 20+ attempts | May be appropriate difficulty, or may indicate a minor issue |
| **Confidence miscalibration: overconfident-wrong** | `review_log.confidence` vs `review_log.correct` | High confidence (4-5) + incorrect > 25% of attempts | Students think they know it but don't — misleading instruction or ambiguous problems |
| **Confidence miscalibration: underconfident-right** | `review_log.confidence` vs `review_log.correct` | Low confidence (1-2) + correct > 40% of attempts | Students know it but don't feel confident — instruction may not build understanding |
| **Slow response times** | `review_log.responseMs` by `topicId` | Median > 2x the subject average | Problems may be confusingly worded or require too many steps |
| **Cognitive demand imbalance** | `review_log` joined with `assessment_content` | A topic has > 80% of one demand type | Missing variety — sessions feel repetitive on this topic |

#### Minimum Sample Size

Don't act on signals with fewer than **20 attempts across 5+ unique users**. Small samples produce unreliable statistics. For confidence miscalibration, require **30+ attempts** (confidence is noisier than correctness).

### Diagnosis: Root Cause Decision Tree

When a signal fires, walk this decision tree to identify the root cause:

```
Topic flagged
├── Accuracy too low (< 50%)?
│   ├── Check specific problems: is one problem dragging down the average?
│   │   ├── Yes → Content quality issue (that specific problem)
│   │   └── No → All problems are hard
│   │       ├── Check prerequisites: do most failing students have weak prereq mastery?
│   │       │   ├── Yes → Prerequisite gap (topic placed too early in graph, or missing prereq edge)
│   │       │   └── No → Students have prereqs but still fail
│   │       │       ├── Check worked examples: do they cover the exact skill being tested?
│   │       │       │   ├── No → Instruction gap (examples don't match problems)
│   │       │       │   └── Yes → Difficulty miscalibration (problems harder than intended)
│   │       │       └── Check difficulty tags: are "easy" problems actually hard?
│   │           └── Yes → Difficulty miscalibration
│   │
├── Accuracy too high (> 95%)?
│   ├── Check difficulty distribution: does the topic have hard problems?
│   │   ├── No → Missing difficulty levels (only easy problems exist)
│   │   └── Yes → Hard problems exist but aren't being served
│   │       └── Check session service logs: is content selection skipping hard problems?
│   │
├── High hint usage (> 60%)?
│   ├── Check if hints are too revealing (giving away the answer)
│   │   ├── Yes → Hint quality issue (hints should scaffold, not solve)
│   │   └── No → Problems need hints to be solvable
│   │       └── Check worked examples: do they prepare students for the problem style?
│   │           ├── No → Instruction gap
│   │           └── Yes → Problem wording may be unclear without hints
│   │
├── High lapse rate (avg > 3)?
│   ├── Check if lapses cluster after long intervals (expected FSRS behavior)
│   │   ├── Yes → Normal forgetting — FSRS will adjust intervals automatically
│   │   └── No → Lapses happen even at short intervals
│   │       └── Prerequisite gap: the skill was never truly mastered, just pattern-matched
│   │
├── Confidence miscalibration?
│   ├── Overconfident-wrong: students think they know it
│   │   └── Common cause: problems test a slightly different skill than instruction covers
│   │       (e.g., instruction shows simple cases, problems include edge cases)
│   └── Underconfident-right: students don't trust their knowledge
│       └── Common cause: instruction is abstract/unclear, students rely on intuition
│           and don't realize they've learned the pattern
│
└── Cognitive demand imbalance?
    └── Add problems in the missing demand types (see §16 for targets by grade level)
```

### Root Cause Categories

| Root Cause | Fix | Scope |
|---|---|---|
| **Content quality issue** | Edit the specific problem/example in `content/<subject>/problems/<topic>.json` or `examples/<topic>.json`. Fix wording, correct answer, add missing hints. | Single content item |
| **Instruction gap** | Add or revise worked examples to cover the exact skill pattern tested by problems. | `examples/<topic>.json` |
| **Prerequisite gap** | Add a missing prerequisite edge in `graph.json`, or move the topic deeper in the graph. | `graph.json` |
| **Difficulty miscalibration** | Adjust `difficulty` tags on problems (1-3 scale). Ensure the topic has problems at all 3 levels. | `problems/<topic>.json` |
| **Hint quality issue** | Rewrite hints to scaffold thinking without revealing answers. Hints should ask a guiding question or point to the relevant concept, not state the next step. | `problems/<topic>.json` |
| **Missing difficulty levels** | Generate additional problems at the missing difficulty level(s). | `problems/<topic>.json` |
| **Missing cognitive demands** | Generate problems in the underrepresented demand type(s). Follow §16 targets. | `problems/<topic>.json` |

### Fix → Validate → Import → Verify Cycle

Once the root cause is identified and the content JSON is edited:

```
1. Edit content files
   └── content/<subject>/problems/<topic>.json   (problem fixes)
   └── content/<subject>/examples/<topic>.json   (instruction fixes)
   └── content/<subject>/graph.json              (prerequisite fixes)

2. Validate
   └── just validate-content
   └── Confirms: DAG integrity, topic coverage, platform-medium constraints,
       no physical/verbal instructions, all topic IDs valid

3. Import to local D1
   └── just import-content
   └── Rebuilds the D1 read model from content files

4. Verify locally
   └── just dev
   └── Navigate to the affected topic, confirm the fix looks correct
   └── Run a learning session on the topic if possible

5. Commit and deploy
   └── git add content/<subject>/...
   └── git commit -m "fix(content): <description of what was fixed and why>"
   └── git push origin main
   └── Cloudflare Pages deploys automatically

6. Measure
   └── After deployment, wait for 20+ new attempts on the topic
   └── Re-check the original signal — it should improve
   └── If not improved, re-diagnose (the root cause may have been wrong)
```

### Rollback Procedure

If a content fix makes things worse:

```bash
# Identify the bad commit
git log --oneline content/

# Revert it
git revert <commit-hash>

# Reimport to restore previous content
just import-content

# Push the revert
git push origin main
```

D1 is a disposable read model — `just import-content` always rebuilds from the content files in git. Reverting the git commit and reimporting is a clean rollback with no residual state.

### Worked Example: Fixing a Low-Accuracy Topic

**Signal:** `subtract-within-100` has 42% accuracy across 35 attempts from 8 users.

**Diagnosis:**
1. Check individual problems — problem #3 ("What is 83 - 47?") has 15% accuracy while others average 55%. Single problem dragging down the average.
2. Check problem #3's hints — the hint says "Try borrowing from the tens place" but doesn't explain the borrowing procedure.
3. Check worked examples — the examples cover borrowing for 2-digit minus 1-digit but not 2-digit minus 2-digit with borrowing from tens.

**Root causes:** Content quality issue (problem hint too vague) + Instruction gap (examples don't cover borrowing across tens).

**Fix:**
1. Edit `content/math-foundations/problems/subtract-within-100.json` — rewrite problem #3 hint: "83 has 8 tens and 3 ones. You can't take 7 ones from 3 ones. What if you broke one of the tens into 10 ones?"
2. Edit `content/math-foundations/examples/subtract-within-100.json` — add a worked example showing 2-digit minus 2-digit borrowing (e.g., 72 - 38).
3. Run `just validate-content` — passes.
4. Run `just import-content` — content updated.
5. Commit: `fix(content): improve subtract-within-100 borrowing hint and add 2-digit borrowing example`
6. After 30 new attempts, accuracy rises to 68% — within acceptable range.
