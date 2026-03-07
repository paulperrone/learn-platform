import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedDiscipline,
  seedAssessmentContent,
  seedInstructionalContent,
  seedUserTopicDepth,
  seedUserSubjectPresentation,
} from "./helpers.js";
import { createContentService } from "../services/content.js";
import { buildDefaultDistribution, sampleFromDistribution } from "../services/content.js";
import * as schema from "../db/schema.js";

describe("content service", () => {
  const db = getTestDb();
  const content = createContentService(db);

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  describe("resolvePresentation", () => {
    it("returns 'primary' for user born in 2020 (age ~6)", async () => {
      const user = await seedUser({ birthYear: 2020 });
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("primary");
    });

    it("returns 'intermediate' for user born in 2016 (age ~10)", async () => {
      const user = await seedUser({ birthYear: 2016 });
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("intermediate");
    });

    it("returns 'standard' for user born in 2012 (age ~14)", async () => {
      const user = await seedUser({ birthYear: 2012 });
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("standard");
    });

    it("returns 'advanced' for user born in 2008 (age ~18)", async () => {
      const user = await seedUser({ birthYear: 2008 });
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("advanced");
    });

    it("returns 'standard' when no birthYear is set", async () => {
      const user = await seedUser({});
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("standard");
    });

    it("uses presentationOverride from preferences when set", async () => {
      const user = await seedUser({ birthYear: 2020 }); // Would be 'primary' by age
      await db.insert(schema.userPreferences).values({
        userId: user.id,
        presentationOverride: "advanced",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("advanced");
    });
  });

  describe("resolveContentDepth", () => {
    it("returns 'survey' for mastery-gated discipline", async () => {
      const disc = await seedDiscipline({ id: "math-test", progressionModel: "mastery-gated" });
      const user = await seedUser({});
      const result = await content.resolveContentDepth(user.id, "some-topic", disc.id);
      expect(result).toBe("survey");
    });

    it("returns 'survey' for flexible discipline", async () => {
      const disc = await seedDiscipline({ id: "vocab-test", progressionModel: "flexible" });
      const user = await seedUser({});
      const result = await content.resolveContentDepth(user.id, "some-topic", disc.id);
      expect(result).toBe("survey");
    });

    it("returns 'survey' for context-layered discipline with no depth history", async () => {
      const disc = await seedDiscipline({ id: "history-test", progressionModel: "context-layered" });
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-hist-depth", disciplineId: disc.id });
      const topic = await seedTopic(subj.id, { id: "topic-hist-depth" });
      const result = await content.resolveContentDepth(user.id, topic.id, disc.id);
      expect(result).toBe("survey");
    });

    it("returns 'contextual' after survey is completed for context-layered", async () => {
      const disc = await seedDiscipline({ id: "history-depth-2", progressionModel: "context-layered" });
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-hist-d2", disciplineId: disc.id });
      const topic = await seedTopic(subj.id, { id: "topic-hist-d2" });
      await seedUserTopicDepth(user.id, topic.id, "survey", true);
      const result = await content.resolveContentDepth(user.id, topic.id, disc.id);
      expect(result).toBe("contextual");
    });

    it("returns 'analytical' after survey+contextual completed", async () => {
      const disc = await seedDiscipline({ id: "history-depth-3", progressionModel: "context-layered" });
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-hist-d3", disciplineId: disc.id });
      const topic = await seedTopic(subj.id, { id: "topic-hist-d3" });
      await seedUserTopicDepth(user.id, topic.id, "survey", true);
      await seedUserTopicDepth(user.id, topic.id, "contextual", true);
      const result = await content.resolveContentDepth(user.id, topic.id, disc.id);
      expect(result).toBe("analytical");
    });

    it("returns 'synthesis' when all lower depths completed", async () => {
      const disc = await seedDiscipline({ id: "history-depth-4", progressionModel: "context-layered" });
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-hist-d4", disciplineId: disc.id });
      const topic = await seedTopic(subj.id, { id: "topic-hist-d4" });
      await seedUserTopicDepth(user.id, topic.id, "survey", true);
      await seedUserTopicDepth(user.id, topic.id, "contextual", true);
      await seedUserTopicDepth(user.id, topic.id, "analytical", true);
      const result = await content.resolveContentDepth(user.id, topic.id, disc.id);
      expect(result).toBe("synthesis");
    });
  });

  describe("markDepthCompleted", () => {
    it("creates depth completion record", async () => {
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-mark-depth" });
      const topic = await seedTopic(subj.id, { id: "topic-mark-depth" });
      await content.markDepthCompleted(user.id, topic.id, "survey");
      const depths = await content.getCompletedDepths(user.id, topic.id);
      expect(depths).toContain("survey");
    });

    it("is idempotent — marking same depth twice does not error", async () => {
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-mark-idem" });
      const topic = await seedTopic(subj.id, { id: "topic-mark-idem" });
      await content.markDepthCompleted(user.id, topic.id, "survey");
      await content.markDepthCompleted(user.id, topic.id, "survey");
      const depths = await content.getCompletedDepths(user.id, topic.id);
      expect(depths.filter((d) => d === "survey")).toHaveLength(1);
    });

    it("tracks multiple depths independently", async () => {
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-multi-depth" });
      const topic = await seedTopic(subj.id, { id: "topic-multi-depth" });
      await content.markDepthCompleted(user.id, topic.id, "survey");
      await content.markDepthCompleted(user.id, topic.id, "contextual");
      const depths = await content.getCompletedDepths(user.id, topic.id);
      expect(depths).toContain("survey");
      expect(depths).toContain("contextual");
      expect(depths).not.toContain("analytical");
    });
  });

  describe("getTopicProblems with dimension filtering", () => {
    let topicId: string;

    beforeAll(async () => {
      const subj = await seedSubject({ id: "subj-content-test" });
      const topic = await seedTopic(subj.id, { id: "topic-dim-test" });
      topicId = topic.id;

      // Seed content at different presentation levels
      await seedAssessmentContent(topicId, {
        id: "ac-primary",
        presentation: "primary",
        contentDepth: "survey",
        question: "Count to 3",
        answer: "3",
      });
      await seedAssessmentContent(topicId, {
        id: "ac-standard",
        presentation: "standard",
        contentDepth: "survey",
        question: "What is 2 + 2?",
        answer: "4",
      });
      await seedAssessmentContent(topicId, {
        id: "ac-advanced",
        presentation: "advanced",
        contentDepth: "survey",
        question: "Prove that addition is commutative for natural numbers",
        answer: "By induction",
      });
    });

    it("returns exact presentation match", async () => {
      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: "survey",
        presentation: "primary",
      });
      expect(problems).toHaveLength(1);
      expect(problems[0].id).toBe("ac-primary");
    });

    it("falls back to adjacent presentation when exact match missing", async () => {
      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: "survey",
        presentation: "intermediate", // Not seeded — should fall back to standard
      });
      expect(problems).toHaveLength(1);
      expect(problems[0].id).toBe("ac-standard");
    });

    it("falls back to any content when no dimension matches", async () => {
      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: "analytical", // Not seeded
        presentation: "primary",
        locale: "ja", // Not seeded
        flavor: "adventure", // Not seeded
      });
      // Should eventually fall back to any content for this topic
      expect(problems.length).toBeGreaterThan(0);
    });
  });

  describe("getTopicExamples with dimension filtering", () => {
    let topicId: string;

    beforeAll(async () => {
      const subj = await seedSubject({ id: "subj-ex-test" });
      const topic = await seedTopic(subj.id, { id: "topic-ex-dim" });
      topicId = topic.id;

      await seedInstructionalContent(topicId, {
        id: "ic-primary",
        presentation: "primary",
        contentDepth: "survey",
        title: "Counting for Little Ones",
      });
      await seedInstructionalContent(topicId, {
        id: "ic-standard",
        presentation: "standard",
        contentDepth: "survey",
        title: "Introduction to Counting",
      });
    });

    it("returns exact presentation match", async () => {
      const examples = await content.getTopicExamples({
        topicId,
        contentDepth: "survey",
        presentation: "primary",
      });
      expect(examples).toHaveLength(1);
      expect(examples[0].title).toBe("Counting for Little Ones");
    });

    it("falls back to adjacent presentation", async () => {
      const examples = await content.getTopicExamples({
        topicId,
        contentDepth: "survey",
        presentation: "intermediate", // Not seeded
      });
      expect(examples).toHaveLength(1);
      expect(examples[0].title).toBe("Introduction to Counting");
    });
  });

  describe("buildDefaultDistribution", () => {
    it("centers on primary for young children (age ~6)", () => {
      const dist = buildDefaultDistribution(2020);
      expect(dist.centerLevel).toBe("primary");
      expect(dist.primary).toBe(0.90);
      expect(dist.intermediate).toBe(0.10);
      expect(dist.standard).toBe(0);
      expect(dist.advanced).toBe(0);
    });

    it("centers on intermediate for age ~10", () => {
      const dist = buildDefaultDistribution(2016);
      expect(dist.centerLevel).toBe("intermediate");
      expect(dist.primary).toBe(0.15);
      expect(dist.intermediate).toBe(0.75);
      expect(dist.standard).toBe(0.10);
      expect(dist.advanced).toBe(0);
    });

    it("centers on standard for age ~14", () => {
      const dist = buildDefaultDistribution(2012);
      expect(dist.centerLevel).toBe("standard");
      expect(dist.intermediate).toBe(0.15);
      expect(dist.standard).toBe(0.75);
      expect(dist.advanced).toBe(0.10);
    });

    it("centers on advanced for age 18+", () => {
      const dist = buildDefaultDistribution(2008);
      expect(dist.centerLevel).toBe("advanced");
      expect(dist.standard).toBe(0.15);
      expect(dist.advanced).toBe(0.85);
    });

    it("centers on standard when no birthYear", () => {
      const dist = buildDefaultDistribution(null);
      expect(dist.centerLevel).toBe("standard");
      expect(dist.standard).toBe(0.75);
    });

    it("weights always sum to 1.0", () => {
      for (const by of [null, 2020, 2016, 2012, 2008]) {
        const dist = buildDefaultDistribution(by);
        const sum = dist.primary + dist.intermediate + dist.standard + dist.advanced;
        expect(sum).toBeCloseTo(1.0, 10);
      }
    });
  });

  describe("sampleFromDistribution", () => {
    it("respects weights over many samples", () => {
      const dist = buildDefaultDistribution(2016); // intermediate-centered
      const counts: Record<string, number> = { primary: 0, intermediate: 0, standard: 0, advanced: 0 };
      const N = 1000;
      for (let i = 0; i < N; i++) {
        counts[sampleFromDistribution(dist)]++;
      }
      // Center should get majority
      expect(counts.intermediate).toBeGreaterThan(N * 0.6);
      // Adjacent should get some
      expect(counts.primary).toBeGreaterThan(N * 0.05);
      expect(counts.standard).toBeGreaterThan(N * 0.02);
      // Far level should get zero or near-zero
      expect(counts.advanced).toBeLessThan(N * 0.02);
    });
  });

  describe("resolvePresentation with subjectId", () => {
    it("uses stored distribution when subjectId provided", async () => {
      const user = await seedUser({ birthYear: 2020 }); // Would be 'primary' by age
      const subj = await seedSubject({ id: "subj-pres-dist" });
      // Store a distribution centered on advanced
      await seedUserSubjectPresentation(
        user.id,
        subj.id,
        { primary: 0, intermediate: 0, standard: 0, advanced: 1.0 },
        "advanced"
      );
      // With subjectId, should always return advanced (weight=1.0)
      const result = await content.resolvePresentation(user.id, subj.id);
      expect(result).toBe("advanced");
    });

    it("falls back to age-default when no distribution stored", async () => {
      const user = await seedUser({ birthYear: 2020 }); // primary by age
      // No distribution stored — should sample from age-default (90% primary)
      const subj = await seedSubject({ id: "subj-pres-no-dist" });
      const counts: Record<string, number> = { primary: 0, intermediate: 0, standard: 0, advanced: 0 };
      for (let i = 0; i < 100; i++) {
        counts[await content.resolvePresentation(user.id, subj.id)]++;
      }
      expect(counts.primary).toBeGreaterThan(70);
    });

    it("returns deterministic age-based level without subjectId (backwards compatible)", async () => {
      const user = await seedUser({ birthYear: 2020 });
      const result = await content.resolvePresentation(user.id);
      expect(result).toBe("primary");
    });

    it("presentationOverride takes priority over distribution", async () => {
      const user = await seedUser({ birthYear: 2020 });
      await db.insert(schema.userPreferences).values({
        userId: user.id,
        presentationOverride: "standard",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const subj = await seedSubject({ id: "subj-pres-override" });
      await seedUserSubjectPresentation(
        user.id,
        subj.id,
        { primary: 1.0, intermediate: 0, standard: 0, advanced: 0 },
        "primary"
      );
      const result = await content.resolvePresentation(user.id, subj.id);
      expect(result).toBe("standard"); // Override wins
    });
  });

  describe("upsertSubjectDistribution", () => {
    it("creates new distribution", async () => {
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-upsert-new" });
      await content.upsertSubjectDistribution(user.id, subj.id, {
        primary: 0.1,
        intermediate: 0.7,
        standard: 0.15,
        advanced: 0.05,
        centerLevel: "intermediate",
      });
      const dist = await content.getSubjectDistribution(user.id, subj.id);
      expect(dist).not.toBeNull();
      expect(dist!.centerLevel).toBe("intermediate");
      expect(dist!.intermediate).toBeCloseTo(0.7);
    });

    it("updates existing distribution", async () => {
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-upsert-update" });
      await content.upsertSubjectDistribution(user.id, subj.id, {
        primary: 0.1,
        intermediate: 0.7,
        standard: 0.15,
        advanced: 0.05,
        centerLevel: "intermediate",
      });
      await content.upsertSubjectDistribution(user.id, subj.id, {
        primary: 0,
        intermediate: 0.2,
        standard: 0.7,
        advanced: 0.1,
        centerLevel: "standard",
      });
      const dist = await content.getSubjectDistribution(user.id, subj.id);
      expect(dist!.centerLevel).toBe("standard");
      expect(dist!.standard).toBeCloseTo(0.7);
    });

    it("distribution weights sum to 1.0", async () => {
      const user = await seedUser({});
      const subj = await seedSubject({ id: "subj-upsert-sum" });
      const d = { primary: 0.1, intermediate: 0.7, standard: 0.15, advanced: 0.05, centerLevel: "intermediate" as const };
      await content.upsertSubjectDistribution(user.id, subj.id, d);
      const dist = await content.getSubjectDistribution(user.id, subj.id);
      const sum = dist!.primary + dist!.intermediate + dist!.standard + dist!.advanced;
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });
});
