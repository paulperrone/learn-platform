# Lesson Format

> JSON schema and authoring rules for lesson content files.
>
> **Last updated:** 2026-03-14

## File Location

```
../learn-content/<discipline>/lessons/<topic-id>.json
```

Each file is a JSON array of `Lesson` objects (typically 1 per topic, but allows multi-presentation variants).

## JSON Structure

```json
[
  {
    "id": "lesson-count-to-10-1",
    "topicId": "count-to-10",
    "title": "Counting to 10",
    "presentation": "primary",
    "contentDepth": "survey",
    "locale": "en",
    "flavor": "classic",
    "sections": [
      {
        "type": "explanation",
        "title": "What is Counting?",
        "content": "Counting means saying numbers in order: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.\n\nEach number tells you **how many** things there are. When you count objects, touch each one and say the next number."
      },
      {
        "type": "worked-example",
        "title": "Counting Apples",
        "content": "Let's count the apples together.",
        "example": {
          "id": "ex-count-to-10-lesson",
          "topicId": "count-to-10",
          "title": "Counting Apples",
          "steps": [
            {
              "subgoalLabel": "Start at 1",
              "instruction": "Point to the first apple and say the number.",
              "work": "🍎 → 1",
              "explanation": "We always start counting at 1."
            },
            {
              "subgoalLabel": "Count each apple",
              "instruction": "Point to each apple and say the next number.",
              "work": "🍎🍎🍎 → 1, 2, 3",
              "explanation": "Each apple gets exactly one number. That's one-to-one correspondence."
            },
            {
              "subgoalLabel": "Say the total",
              "instruction": "The last number you say is how many there are.",
              "work": "There are 3 apples.",
              "explanation": "The last number in your count tells you the total. This is called cardinality."
            }
          ]
        }
      },
      {
        "type": "practice",
        "title": "Your Turn",
        "content": "Now try counting on your own.",
        "problems": [
          {
            "id": "practice-count-to-10-1",
            "topicId": "count-to-10",
            "question": "Count the stars: ⭐⭐⭐⭐⭐. How many stars are there?",
            "answer": "5",
            "hints": ["Point to each star and say a number.", "Start: 1, 2, 3..."],
            "solution": "Count each star: 1, 2, 3, 4, 5. There are 5 stars.",
            "type": "numerical-input"
          }
        ]
      }
    ]
  }
]
```

## Section Types

| Type | Required Fields | Optional Fields | Notes |
|------|----------------|-----------------|-------|
| `explanation` | `content` | `title`, `mediaAlt`, `mediaRef` | Prose text teaching the concept. Markdown supported. |
| `worked-example` | `content`, `example` | `title` | Embeds a `WorkedExample` with step-by-step procedure. `content` provides introduction text. |
| `diagram` | `content`, `mediaAlt` | `title`, `mediaRef` | Placeholder for visual content. `content` is a text description. `mediaRef` is a future asset path. |
| `video` | `content`, `mediaAlt` | `title`, `mediaRef` | Placeholder for video content. `content` is a text description. |
| `practice` | `content`, `problems` | `title` | 2-3 embedded problems for guided practice. Lesson content remains visible as reference. |

## Section Ordering Rules

1. Start with an `explanation` section introducing the concept
2. `worked-example` sections go in the middle, demonstrating procedures
3. `diagram` and `video` sections appear where they support the surrounding explanation
4. End with a `practice` section for immediate retrieval practice
5. Minimum 3 sections per lesson

## Dimension Fields

Same rules as problems and worked examples:

- `presentation` — match the topic's `defaultPresentation` from `graph.json` unless creating multi-presentation content
- `contentDepth` — match the topic's depth range (survey for K-2, contextual for 3-5, etc.)
- `locale` — default `"en"`
- `flavor` — default `"classic"`

These fields enable the 7-tier fallback ranking in the content service.

## Platform-Medium Constraints

All lesson text content must follow the same platform-medium rules as problems:

- No instructions requiring physical materials (manipulatives, paper, scissors)
- No drawing or handwriting instructions
- No speaking/listening requirements (screen + text input only)
- Visual descriptions should be text-based (emoji, ASCII, or `[diagram: ...]` placeholders)

## Discipline-Specific Structure

### Mastery-Gated (math, CS)

```
explanation → worked-example → practice (2-3 problems)
```

Explanation teaches the core concept concisely. Worked example demonstrates the procedure. Practice lets students try with the lesson visible as reference.

### Context-Layered (history, philosophy)

```
explanation (with multi-depth treatment) → embedded primary sources/perspectives → practice
```

Explanation introduces the topic at the declared content depth. Sources or perspectives provide evidence. Practice checks comprehension.

### Flexible (vocabulary, geography)

```
explanation (definition + context) → practice
```

Short explanation with definition and usage context. Practice is recall-based.
