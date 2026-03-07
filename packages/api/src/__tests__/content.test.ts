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
} from "./helpers.js";
import { createContentService } from "../services/content.js";
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

    it("returns 'survey' for context-layered discipline (default before Phase 2)", async () => {
      const disc = await seedDiscipline({ id: "history-test", progressionModel: "context-layered" });
      const user = await seedUser({});
      const result = await content.resolveContentDepth(user.id, "some-topic", disc.id);
      expect(result).toBe("survey");
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
});
