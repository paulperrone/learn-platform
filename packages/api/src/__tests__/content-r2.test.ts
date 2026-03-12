import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
} from "./helpers.js";
import { createContentService } from "../services/content.js";
import type { BundledProblem, BundledExample } from "../services/content-r2.js";

/**
 * In-memory R2 bucket mock for testing content service with R2 path.
 * Implements the subset of R2Bucket used by content-r2.ts (get only).
 */
function createMockR2Bucket(
  objects: Record<string, string>,
): R2Bucket {
  return {
    get(key: string) {
      const data = objects[key];
      if (!data) return Promise.resolve(null);
      return Promise.resolve({
        text: () => Promise.resolve(data),
        json: () => Promise.resolve(JSON.parse(data)),
        body: null,
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
      } as unknown as R2ObjectBody);
    },
    // Stub remaining methods (not used by content service)
    put: () => Promise.resolve(null as any),
    delete: () => Promise.resolve(),
    list: () => Promise.resolve({ objects: [], truncated: false, delimitedPrefixes: [] } as any),
    head: () => Promise.resolve(null),
    createMultipartUpload: () => Promise.resolve(null as any),
    resumeMultipartUpload: () => Promise.resolve(null as any),
  } as unknown as R2Bucket;
}

// ── Test data ──

const PROBLEMS: BundledProblem[] = [
  {
    id: "r2-p1",
    topicId: "r2-topic",
    difficulty: "easy",
    question: "What is 1+1?",
    answer: "2",
    hints: ["Think about counting"],
    solution: "1+1=2",
    flavor: "classic",
    locale: "en",
    presentation: "standard",
    contentDepth: "survey",
  },
  {
    id: "r2-p2",
    topicId: "r2-topic",
    difficulty: "medium",
    question: "What is 2+3?",
    answer: "5",
    hints: ["Count on from 2"],
    solution: "2+3=5",
    flavor: "classic",
    locale: "en",
    presentation: "primary",
    contentDepth: "survey",
  },
  {
    id: "r2-p3",
    topicId: "r2-topic",
    difficulty: "hard",
    question: "What is 7+8?",
    answer: "15",
    hints: ["Make a 10 first"],
    solution: "7+8 = 7+3+5 = 15",
    flavor: "classic",
    locale: "en",
    presentation: "advanced",
    contentDepth: "survey",
  },
];

const EXAMPLES: BundledExample[] = [
  {
    id: "r2-ex1",
    topicId: "r2-topic",
    title: "Adding Small Numbers",
    steps: [
      { subgoalLabel: "Set up", instruction: "Start with 1", work: "1", explanation: "First addend" },
      { subgoalLabel: "Add", instruction: "Add 1", work: "1+1=2", explanation: "Count on" },
    ],
    flavor: "classic",
    locale: "en",
    presentation: "standard",
    contentDepth: "survey",
  },
];

describe("content service with R2", () => {
  const db = getTestDb();

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  describe("getTopicProblems via R2", () => {
    it("fetches problems from R2 bucket when discipline is provided", async () => {
      const bucket = createMockR2Bucket({
        "math/r2-topic/problems.json": JSON.stringify(PROBLEMS),
      });
      const content = createContentService(db, bucket);

      const problems = await content.getTopicProblems({
        topicId: "r2-topic",
        discipline: "math",
        contentDepth: "survey",
        presentation: "standard",
      });

      // Should return the standard presentation problem (exact match)
      expect(problems).toHaveLength(1);
      expect(problems[0].id).toBe("r2-p1");
      expect(problems[0].question).toBe("What is 1+1?");
    });

    it("applies presentation fallback on R2 data", async () => {
      const bucket = createMockR2Bucket({
        "math/r2-topic/problems.json": JSON.stringify(PROBLEMS),
      });
      const content = createContentService(db, bucket);

      // intermediate not in test data → falls back to standard
      const problems = await content.getTopicProblems({
        topicId: "r2-topic",
        discipline: "math",
        contentDepth: "survey",
        presentation: "intermediate",
      });

      expect(problems).toHaveLength(1);
      expect(problems[0].id).toBe("r2-p1"); // standard is first fallback for intermediate
    });

    it("strips dimension fields from returned problems", async () => {
      const bucket = createMockR2Bucket({
        "math/r2-topic/problems.json": JSON.stringify(PROBLEMS),
      });
      const content = createContentService(db, bucket);

      const problems = await content.getTopicProblems({
        topicId: "r2-topic",
        discipline: "math",
        contentDepth: "survey",
        presentation: "standard",
      });

      const p = problems[0];
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("question");
      expect(p).not.toHaveProperty("flavor");
      expect(p).not.toHaveProperty("locale");
      expect(p).not.toHaveProperty("contentDepth");
    });

    it("returns empty array for missing bundle", async () => {
      const bucket = createMockR2Bucket({});
      const content = createContentService(db, bucket);

      // No D1 content seeded either — should return empty
      const problems = await content.getTopicProblems({
        topicId: "nonexistent-topic",
        discipline: "math",
        contentDepth: "survey",
        presentation: "standard",
      });

      expect(problems).toHaveLength(0);
    });

    it("returns empty when R2 bucket has no content and no discipline", async () => {
      const bucket = createMockR2Bucket({});
      const content = createContentService(db, bucket);

      // No discipline → returns empty (R2-only, no D1 fallback)
      const problems = await content.getTopicProblems({
        topicId: "no-disc-topic",
        contentDepth: "survey",
        presentation: "standard",
      });

      expect(problems).toHaveLength(0);
    });
  });

  describe("getTopicExamples via R2", () => {
    it("fetches examples from R2 bucket", async () => {
      const bucket = createMockR2Bucket({
        "math/r2-topic/examples.json": JSON.stringify(EXAMPLES),
      });
      const content = createContentService(db, bucket);

      const examples = await content.getTopicExamples({
        topicId: "r2-topic",
        discipline: "math",
        contentDepth: "survey",
        presentation: "standard",
      });

      expect(examples).toHaveLength(1);
      expect(examples[0].title).toBe("Adding Small Numbers");
      expect(examples[0].steps).toHaveLength(2);
    });

    it("strips dimension fields from returned examples", async () => {
      const bucket = createMockR2Bucket({
        "math/r2-topic/examples.json": JSON.stringify(EXAMPLES),
      });
      const content = createContentService(db, bucket);

      const examples = await content.getTopicExamples({
        topicId: "r2-topic",
        discipline: "math",
        contentDepth: "survey",
        presentation: "standard",
      });

      expect(examples[0]).not.toHaveProperty("flavor");
      expect(examples[0]).not.toHaveProperty("locale");
      expect(examples[0]).toHaveProperty("title");
      expect(examples[0]).toHaveProperty("steps");
    });
  });

  describe("content_version in review_log", () => {
    it("records content version when passed to scheduleReview", async () => {
      const disc = await seedDiscipline({ id: "r2-cv-disc" });
      const topic = await seedTopic(disc.id, { id: "r2-cv-topic" });
      const user = await seedUser({});

      const { createSRSService } = await import("../services/srs.js");
      const { Rating } = await import("ts-fsrs");
      const srs = createSRSService(db);

      // scheduleReview creates user_topic_state via getOrCreateState if missing
      await srs.scheduleReview(
        user.id,
        topic.id,
        Rating.Good,
        1500,
        "independent",
        undefined,
        undefined,
        undefined,
        "sha256:abc123",
      );

      // Check review_log for content_version
      const { eq } = await import("drizzle-orm");
      const s = await import("../db/schema.js");
      const reviews = await db
        .select()
        .from(s.reviewLog)
        .where(eq(s.reviewLog.topicId, topic.id));

      expect(reviews).toHaveLength(1);
      expect(reviews[0].contentVersion).toBe("sha256:abc123");
    });

    it("records null content_version when not provided", async () => {
      const disc = await seedDiscipline({ id: "r2-cv-null-disc" });
      const topic = await seedTopic(disc.id, { id: "r2-cv-null-topic" });
      const user = await seedUser({});

      const { createSRSService } = await import("../services/srs.js");
      const { Rating } = await import("ts-fsrs");
      const srs = createSRSService(db);

      await srs.scheduleReview(
        user.id,
        topic.id,
        Rating.Good,
        1500,
        "independent",
      );

      const { eq } = await import("drizzle-orm");
      const s = await import("../db/schema.js");
      const reviews = await db
        .select()
        .from(s.reviewLog)
        .where(eq(s.reviewLog.topicId, topic.id));

      expect(reviews).toHaveLength(1);
      expect(reviews[0].contentVersion).toBeNull();
    });
  });
});
