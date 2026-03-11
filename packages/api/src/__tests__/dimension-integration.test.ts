import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedTopic,
  seedDiscipline,
  seedAssessmentContent,
  seedInstructionalContent,
  seedPrerequisite,
  seedUserTopicDepth,
} from "./helpers.js";
import { createContentService } from "../services/content.js";
import { createGraphService } from "../services/graph.js";
import * as schema from "../db/schema.js";

describe("dimension system integration", () => {
  const db = getTestDb();
  const content = createContentService(db);
  const graph = createGraphService(db);

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  describe("multi-presentation content selection", () => {
    // 3 topics with content at primary, intermediate, and standard presentation levels
    const topicIds = ["integ-count", "integ-add", "integ-subtract"];
    let youngUser: { id: string };  // age 6 → primary
    let teenUser: { id: string };   // age 14 → standard

    beforeAll(async () => {
      const disc = await seedDiscipline({ id: "integ-math", progressionModel: "mastery-gated" });

      for (const topicId of topicIds) {
        await seedTopic(disc.id, { id: topicId });

        // Primary presentation (for young learners)
        await seedAssessmentContent(topicId, {
          id: `${topicId}-ac-primary`,
          presentation: "primary",
          contentDepth: "survey",
          difficulty: "easy",
          question: `${topicId}: simple version`,
          answer: "1",
        });
        await seedInstructionalContent(topicId, {
          id: `${topicId}-ic-primary`,
          presentation: "primary",
          contentDepth: "survey",
          title: `${topicId}: Counting for Little Ones`,
        });

        // Intermediate presentation
        await seedAssessmentContent(topicId, {
          id: `${topicId}-ac-intermediate`,
          presentation: "intermediate",
          contentDepth: "survey",
          difficulty: "medium",
          question: `${topicId}: intermediate version`,
          answer: "2",
        });
        await seedInstructionalContent(topicId, {
          id: `${topicId}-ic-intermediate`,
          presentation: "intermediate",
          contentDepth: "survey",
          title: `${topicId}: Learning to Count`,
        });

        // Standard presentation
        await seedAssessmentContent(topicId, {
          id: `${topicId}-ac-standard`,
          presentation: "standard",
          contentDepth: "survey",
          difficulty: "medium",
          question: `${topicId}: standard version`,
          answer: "3",
        });
        await seedInstructionalContent(topicId, {
          id: `${topicId}-ic-standard`,
          presentation: "standard",
          contentDepth: "survey",
          title: `${topicId}: Introduction to Counting`,
        });
      }

      youngUser = await seedUser({ id: "integ-young", birthYear: 2020 }); // age ~6 → primary
      teenUser = await seedUser({ id: "integ-teen", birthYear: 2012 });    // age ~14 → standard
    });

    it("young user (age 6) receives primary presentation content", async () => {
      const pres = await content.resolvePresentation(youngUser.id);
      expect(pres).toBe("primary");

      for (const topicId of topicIds) {
        const problems = await content.getTopicProblems({
          topicId,
          contentDepth: "survey",
          presentation: pres,
        });
        expect(problems).toHaveLength(1);
        expect(problems[0].id).toBe(`${topicId}-ac-primary`);
        expect(problems[0].question).toContain("simple version");

        const examples = await content.getTopicExamples({
          topicId,
          contentDepth: "survey",
          presentation: pres,
        });
        expect(examples).toHaveLength(1);
        expect(examples[0].title).toContain("Little Ones");
      }
    });

    it("teen user (age 14) receives standard presentation content", async () => {
      const pres = await content.resolvePresentation(teenUser.id);
      expect(pres).toBe("standard");

      for (const topicId of topicIds) {
        const problems = await content.getTopicProblems({
          topicId,
          contentDepth: "survey",
          presentation: pres,
        });
        expect(problems).toHaveLength(1);
        expect(problems[0].id).toBe(`${topicId}-ac-standard`);
        expect(problems[0].question).toContain("standard version");

        const examples = await content.getTopicExamples({
          topicId,
          contentDepth: "survey",
          presentation: pres,
        });
        expect(examples).toHaveLength(1);
        expect(examples[0].title).toContain("Introduction");
      }
    });

    it("both users studying the same topic receive different content", async () => {
      const topicId = topicIds[0];

      const youngPres = await content.resolvePresentation(youngUser.id);
      const teenPres = await content.resolvePresentation(teenUser.id);

      const youngProblems = await content.getTopicProblems({
        topicId,
        contentDepth: "survey",
        presentation: youngPres,
      });
      const teenProblems = await content.getTopicProblems({
        topicId,
        contentDepth: "survey",
        presentation: teenPres,
      });

      expect(youngProblems[0].id).not.toBe(teenProblems[0].id);
      expect(youngProblems[0].question).toContain("simple");
      expect(teenProblems[0].question).toContain("standard");
    });
  });

  describe("fallback chain prevents blank screens", () => {
    let topicId: string;

    beforeAll(async () => {
      const disc = await seedDiscipline({ id: "integ-fallback-disc" });
      const topic = await seedTopic(disc.id, { id: "integ-fallback-topic" });
      topicId = topic.id;

      // Only seed standard/survey content — no primary, no contextual
      await seedAssessmentContent(topicId, {
        id: "integ-fb-ac",
        presentation: "standard",
        contentDepth: "survey",
        question: "Fallback question",
        answer: "42",
      });
      await seedInstructionalContent(topicId, {
        id: "integ-fb-ic",
        presentation: "standard",
        contentDepth: "survey",
        title: "Fallback example",
      });
    });

    it("falls back to standard when primary not available", async () => {
      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: "survey",
        presentation: "primary",
      });
      // primary → intermediate (not found) → standard (found)
      expect(problems).toHaveLength(1);
      expect(problems[0].question).toBe("Fallback question");
    });

    it("falls back to survey depth when contextual not available", async () => {
      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: "contextual",
        presentation: "standard",
      });
      // contextual depth not found, falls back through chain to survey
      expect(problems).toHaveLength(1);
      expect(problems[0].question).toBe("Fallback question");
    });

    it("falls back when locale and flavor mismatch", async () => {
      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: "survey",
        presentation: "standard",
        locale: "ja",
        flavor: "adventure",
      });
      expect(problems).toHaveLength(1);
      expect(problems[0].question).toBe("Fallback question");
    });
  });

  describe("context-layered depth progression (spiral)", () => {
    let topicId: string;
    let userId: string;
    let discId: string;

    beforeAll(async () => {
      const disc = await seedDiscipline({ id: "integ-history", progressionModel: "context-layered" });
      discId = disc.id;
      const topic = await seedTopic(disc.id, { id: "integ-spiral-topic" });
      topicId = topic.id;
      const user = await seedUser({ id: "integ-spiral-user" });
      userId = user.id;

      // Seed content at survey and contextual depths
      await seedAssessmentContent(topicId, {
        id: "integ-spiral-survey",
        presentation: "standard",
        contentDepth: "survey",
        question: "What happened in 1776?",
        answer: "American Revolution",
      });
      await seedAssessmentContent(topicId, {
        id: "integ-spiral-contextual",
        presentation: "standard",
        contentDepth: "contextual",
        question: "What caused the American Revolution?",
        answer: "Taxation without representation",
      });
      await seedInstructionalContent(topicId, {
        id: "integ-spiral-ic-survey",
        presentation: "standard",
        contentDepth: "survey",
        title: "The American Revolution: What Happened",
      });
      await seedInstructionalContent(topicId, {
        id: "integ-spiral-ic-contextual",
        presentation: "standard",
        contentDepth: "contextual",
        title: "The American Revolution: Why It Happened",
      });
    });

    it("starts at survey depth for new learner", async () => {
      const depth = await content.resolveContentDepth(userId, topicId, discId);
      expect(depth).toBe("survey");

      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: depth,
        presentation: "standard",
      });
      expect(problems[0].question).toContain("What happened");
    });

    it("progresses to contextual after survey completed", async () => {
      await content.markDepthCompleted(userId, topicId, "survey");

      const depth = await content.resolveContentDepth(userId, topicId, discId);
      expect(depth).toBe("contextual");

      const problems = await content.getTopicProblems({
        topicId,
        contentDepth: depth,
        presentation: "standard",
      });
      expect(problems[0].question).toContain("What caused");
    });

    it("spiral frontier includes mastered topics with uncompleted depths", async () => {
      // Topic has survey completed but contextual not yet completed
      const frontier = await graph.computeFrontier(userId);
      expect(frontier.topics.map((t) => t.id)).toContain(topicId);
    });

    it("topic leaves frontier once all depths completed", async () => {
      // Use a separate user to avoid shared state from previous tests
      const allDoneUser = await seedUser({ id: "integ-spiral-alldone" });
      const allDoneUserId = allDoneUser.id;

      // Complete all 4 depths
      await seedUserTopicDepth(allDoneUserId, topicId, "survey", true);
      await seedUserTopicDepth(allDoneUserId, topicId, "contextual", true);
      await seedUserTopicDepth(allDoneUserId, topicId, "analytical", true);
      await seedUserTopicDepth(allDoneUserId, topicId, "synthesis", true);

      // Mark topic as started in userTopicState (frontier checks startedIds)
      await db.insert(schema.userTopicState).values({
        userId: allDoneUserId,
        topicId,
        mastered: true,
        due: new Date().toISOString(),
        stability: 30,
        difficulty: 5,
      });

      const frontier = await graph.computeFrontier(allDoneUserId);
      // All depths completed → topic should no longer be in frontier
      expect(frontier.topics.map((t) => t.id)).not.toContain(topicId);
    });
  });

  describe("cross-subject DAG validation", () => {
    it("validates full graph across multiple subjects without false cycles", async () => {
      const mathDisc = await seedDiscipline({ id: "integ-math-dag", progressionModel: "mastery-gated" });
      const elaDisc = await seedDiscipline({ id: "integ-ela-dag", progressionModel: "mastery-gated" });

      // ELA topics
      const reading = await seedTopic(elaDisc.id, { id: "integ-reading-comp" });

      // Math topics
      const basicMath = await seedTopic(mathDisc.id, { id: "integ-basic-math" });
      const wordProblems = await seedTopic(mathDisc.id, { id: "integ-word-problems" });

      // Intra-subject prereq
      await seedPrerequisite(basicMath.id, wordProblems.id);

      // Cross-subject prereq: reading comprehension → word problems
      await seedPrerequisite(reading.id, wordProblems.id);

      // Single-subject validation should still work (ignores cross-subject edges)
      const mathResult = await graph.validateDAG(mathDisc.id);
      expect(mathResult.valid).toBe(true);

      const elaResult = await graph.validateDAG(elaDisc.id);
      expect(elaResult.valid).toBe(true);

      // Full graph validation includes cross-subject edges
      const fullResult = await graph.validateDAG();
      expect(fullResult.valid).toBe(true);
    });

    it("detects cycles in full graph validation", async () => {
      const disc1 = await seedDiscipline({ id: "integ-cycle-d1", progressionModel: "mastery-gated" });
      const disc2 = await seedDiscipline({ id: "integ-cycle-d2", progressionModel: "mastery-gated" });

      const t1 = await seedTopic(disc1.id, { id: "integ-cycle-t1" });
      const t2 = await seedTopic(disc2.id, { id: "integ-cycle-t2" });

      // Create a cross-subject cycle: t1 → t2 → t1
      await seedPrerequisite(t1.id, t2.id);
      await seedPrerequisite(t2.id, t1.id);

      // Single-subject validation won't see the cycle (edges are cross-subject)
      const s1Result = await graph.validateDAG(disc1.id);
      expect(s1Result.valid).toBe(true);

      // Full graph validation detects the cross-subject cycle
      const fullResult = await graph.validateDAG();
      expect(fullResult.valid).toBe(false);
      expect(fullResult.cycle).toContain(t1.id);
      expect(fullResult.cycle).toContain(t2.id);
    });

    it("handles recommended and enriching cross-subject edges", async () => {
      const histDisc = await seedDiscipline({ id: "integ-hist-dag", progressionModel: "context-layered" });
      const philDisc = await seedDiscipline({ id: "integ-phil-dag", progressionModel: "context-layered" });

      const greece = await seedTopic(histDisc.id, { id: "integ-ancient-greece" });
      const philosophy = await seedTopic(philDisc.id, { id: "integ-greek-philosophy" });

      // Cross-discipline recommended edge
      await seedPrerequisite(greece.id, philosophy.id, 0.8, "recommended");

      const result = await graph.validateDAG();
      expect(result.valid).toBe(true);
    });
  });
});
