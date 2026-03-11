import { describe, it, expect, beforeAll } from "vitest";
import { State } from "ts-fsrs";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedTopic,
  seedDiscipline,
  seedAssessmentContent,
} from "../helpers.js";
import { createSRSService } from "../../services/srs.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("session depth blending", () => {
  describe("getSessionMix warmup", () => {
    it("includes mastered topics as warmup items at start of mix", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-warmup-1" });
      const subj = await seedDiscipline({ id: "blend-warmup-subj" });

      // Create mastered topics
      const mastered1 = await seedTopic(subj.id, { id: "blend-mastered-1", depth: 0 });
      const mastered2 = await seedTopic(subj.id, { id: "blend-mastered-2", depth: 1 });
      for (const t of [mastered1, mastered2]) {
        await db.insert(schema.userTopicState).values({
          userId: user.id,
          topicId: t.id,
          mastered: true,
          stability: 30,
          difficulty: 5,
          due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          state: State.Review,
          reps: 10,
        });
      }

      // Create frontier topics (not started, no prereqs)
      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, { id: `blend-frontier-${i}`, depth: i + 2 });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      // Warmup items should be at the start
      const warmupItems = mix.items.filter((i) => i.blendRole === "warmup");
      expect(warmupItems.length).toBe(2);
      expect(warmupItems.every((w) => w.type === "review")).toBe(true);

      // Warmup topics should be from mastered set
      const warmupTopicIds = warmupItems.map((w) => w.topicId);
      expect(warmupTopicIds).toContain(mastered1.id);
      expect(warmupTopicIds).toContain(mastered2.id);

      // Warmup should be first items in the mix
      for (let i = 0; i < warmupItems.length; i++) {
        expect(mix.items[i].blendRole).toBe("warmup");
      }

      // Main items should follow
      const mainItems = mix.items.filter((i) => i.blendRole === "main");
      expect(mainItems.length).toBeGreaterThan(0);
    });

    it("skips warmup when no mastered topics exist", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-nowarmup-1" });
      const subj = await seedDiscipline({ id: "blend-nowarmup-subj" });

      // Only frontier topics, no mastered
      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, { id: `blend-nw-frontier-${i}`, depth: i });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      const warmupItems = mix.items.filter((i) => i.blendRole === "warmup");
      expect(warmupItems.length).toBe(0);

      // All items should be main
      expect(mix.items.every((i) => i.blendRole === "main")).toBe(true);
    });

    it("caps warmup at 3 items even with many mastered topics", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-cap-1" });
      const subj = await seedDiscipline({ id: "blend-cap-subj" });

      // Create 10 mastered topics
      for (let i = 0; i < 10; i++) {
        const t = await seedTopic(subj.id, { id: `blend-cap-m-${i}`, depth: i });
        await db.insert(schema.userTopicState).values({
          userId: user.id,
          topicId: t.id,
          mastered: true,
          stability: 30,
          difficulty: 5,
          due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          state: State.Review,
          reps: 10,
        });
      }

      // Frontier topics
      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, { id: `blend-cap-f-${i}`, depth: i + 10 });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      const warmupItems = mix.items.filter((i) => i.blendRole === "warmup");
      expect(warmupItems.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getSessionMix stretch", () => {
    it("does not include stretch for mastery-gated disciplines", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-nostretch-1" });
      // math discipline is mastery-gated by default
      const subj = await seedDiscipline({ id: "blend-nostretch-subj" });

      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, { id: `blend-ns-${i}`, depth: i });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      const stretchItems = mix.items.filter((i) => i.blendRole === "stretch");
      expect(stretchItems.length).toBe(0);
    });

    it("includes stretch for context-layered disciplines", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-stretch-1" });
      const disc = await seedDiscipline({
        id: "history-blend",
        name: "History",
        progressionModel: "context-layered",
      });

      // Create frontier topics for context-layered discipline
      for (let i = 0; i < 5; i++) {
        await seedTopic(disc.id, { id: `blend-cl-${i}`, depth: i });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      const stretchItems = mix.items.filter((i) => i.blendRole === "stretch");
      expect(stretchItems.length).toBeGreaterThan(0);
      expect(stretchItems.length).toBeLessThanOrEqual(2);
      expect(stretchItems.every((s) => s.type === "review")).toBe(true);

      // Stretch items should be at the end
      const lastItems = mix.items.slice(-stretchItems.length);
      expect(lastItems.every((i) => i.blendRole === "stretch")).toBe(true);
    });
  });

  describe("blendRole in items", () => {
    it("all mix items have a blendRole", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-role-1" });
      const subj = await seedDiscipline({ id: "blend-role-subj" });

      // Mastered + frontier
      const m = await seedTopic(subj.id, { id: "blend-role-m", depth: 0 });
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: m.id,
        mastered: true,
        stability: 30,
        difficulty: 5,
        due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        state: State.Review,
        reps: 10,
      });
      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, { id: `blend-role-f-${i}`, depth: i + 1 });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      for (const item of mix.items) {
        expect(["warmup", "main", "stretch"]).toContain(item.blendRole);
      }
    });
  });

  describe("graceful degradation", () => {
    it("works with small count (leaves room for main)", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-small-1" });
      const subj = await seedDiscipline({ id: "blend-small-subj" });

      // Mastered topic
      const m = await seedTopic(subj.id, { id: "blend-small-m", depth: 0 });
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: m.id,
        mastered: true,
        stability: 30,
        difficulty: 5,
        due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        state: State.Review,
        reps: 10,
      });

      // Frontier
      for (let i = 0; i < 3; i++) {
        await seedTopic(subj.id, { id: `blend-small-f-${i}`, depth: i + 1 });
      }

      const srs = createSRSService(db);
      // Small count: warmup should not crowd out main items
      const mix = await srs.getSessionMix(user.id, 3);

      // With count=3, maxWarmup = max(0, 3-4) = 0, so no warmup
      const warmupItems = mix.items.filter((i) => i.blendRole === "warmup");
      expect(warmupItems.length).toBe(0);
      expect(mix.items.length).toBeGreaterThan(0);
    });

    it("handles empty session gracefully", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "blend-empty-1" });
      // No subjects, no topics at all
      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      expect(mix.items.length).toBe(0);
    });
  });
});
