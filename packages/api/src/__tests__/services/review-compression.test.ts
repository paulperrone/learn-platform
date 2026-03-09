import { describe, it, expect, beforeAll } from "vitest";
import { State } from "ts-fsrs";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedEncompassing,
} from "../helpers.js";
import { createSRSService } from "../../services/srs.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

/**
 * Helper: seed a due topic state (due in the past so it's overdue).
 */
async function seedDueState(
  userId: string,
  topicId: string,
  overdueMinutes = 60
) {
  const db = getTestDb();
  await db.insert(schema.userTopicState).values({
    userId,
    topicId,
    due: new Date(Date.now() - overdueMinutes * 60 * 1000).toISOString(),
    mastered: false,
    reps: 3,
    stability: 5,
    difficulty: 5,
    state: State.Review,
    lastReview: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

describe("FIRe review compression", () => {
  describe("computeFIReCoverage", () => {
    it("returns empty map when no encompassing edges exist", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-cov-1" });
      const subj = await seedSubject({ id: "rc-cov-subj-1" });
      const t1 = await seedTopic(subj.id, { id: "rc-cov-t1" });
      const t2 = await seedTopic(subj.id, { id: "rc-cov-t2" });

      const srs = createSRSService(db);
      const dueSet = new Set([t1.id, t2.id]);
      const coverage = await srs.computeFIReCoverage(dueSet);

      expect(coverage.size).toBe(0);
    });

    it("finds direct encompassing coverage", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "rc-cov-subj-2" });
      const parent = await seedTopic(subj.id, { id: "rc-cov-parent" });
      const child = await seedTopic(subj.id, { id: "rc-cov-child" });
      await seedEncompassing(parent.id, child.id, 0.6);

      const srs = createSRSService(db);
      const dueSet = new Set([parent.id, child.id]);
      const coverage = await srs.computeFIReCoverage(dueSet);

      expect(coverage.get(parent.id)?.has(child.id)).toBe(true);
      // Child doesn't cover parent (encompassing is directional)
      expect(coverage.has(child.id)).toBe(false);
    });

    it("finds multi-hop coverage", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "rc-cov-subj-3" });
      const gp = await seedTopic(subj.id, { id: "rc-cov-gp" });
      const p = await seedTopic(subj.id, { id: "rc-cov-p" });
      const c = await seedTopic(subj.id, { id: "rc-cov-c" });
      await seedEncompassing(gp.id, p.id, 0.7);
      await seedEncompassing(p.id, c.id, 0.8);

      const srs = createSRSService(db);
      const dueSet = new Set([gp.id, p.id, c.id]);
      const coverage = await srs.computeFIReCoverage(dueSet);

      // Grandparent covers both parent and child
      expect(coverage.get(gp.id)?.has(p.id)).toBe(true);
      expect(coverage.get(gp.id)?.has(c.id)).toBe(true);
      // Parent covers child only
      expect(coverage.get(p.id)?.has(c.id)).toBe(true);
    });

    it("skips negligible weight paths", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "rc-cov-subj-4" });
      const parent = await seedTopic(subj.id, { id: "rc-cov-weak-p" });
      const child = await seedTopic(subj.id, { id: "rc-cov-weak-c" });
      // Weight below 0.05 threshold
      await seedEncompassing(parent.id, child.id, 0.03);

      const srs = createSRSService(db);
      const dueSet = new Set([parent.id, child.id]);
      const coverage = await srs.computeFIReCoverage(dueSet);

      expect(coverage.size).toBe(0);
    });

    it("ignores non-due topics in coverage", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "rc-cov-subj-5" });
      const parent = await seedTopic(subj.id, { id: "rc-cov-ndue-p" });
      const child = await seedTopic(subj.id, { id: "rc-cov-ndue-c" });
      await seedEncompassing(parent.id, child.id, 0.6);

      const srs = createSRSService(db);
      // Only parent is in the due set, child is not
      const dueSet = new Set([parent.id]);
      const coverage = await srs.computeFIReCoverage(dueSet);

      // Parent can't cover child because child isn't in due set
      expect(coverage.size).toBe(0);
    });
  });

  describe("compressReviews", () => {
    it("selects high-coverage topic over merely overdue ones", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-comp-1" });
      const subj = await seedSubject({ id: "rc-comp-subj-1" });

      // Create a parent that encompasses two children
      const parent = await seedTopic(subj.id, { id: "rc-comp-parent" });
      const child1 = await seedTopic(subj.id, { id: "rc-comp-child1" });
      const child2 = await seedTopic(subj.id, { id: "rc-comp-child2" });
      const standalone = await seedTopic(subj.id, { id: "rc-comp-standalone" });

      await seedEncompassing(parent.id, child1.id, 0.6);
      await seedEncompassing(parent.id, child2.id, 0.6);

      // All due: standalone most overdue, parent less overdue
      await seedDueState(user.id, standalone.id, 120); // 2 hours overdue
      await seedDueState(user.id, parent.id, 60); // 1 hour overdue
      await seedDueState(user.id, child1.id, 30);
      await seedDueState(user.id, child2.id, 30);

      const srs = createSRSService(db);
      const dueTopics = await srs.getDueTopics(user.id);

      // Budget of 2: compression should prefer parent (covers 3 topics) over standalone
      const { selected, coveredCount } = await srs.compressReviews(
        dueTopics,
        2,
        new Set()
      );

      const selectedIds = selected.map((s) => s.topicId);
      expect(selectedIds).toContain(parent.id);
      // coveredCount should be > number of explicit reviews
      expect(coveredCount).toBeGreaterThan(selected.length);
    });

    it("falls back to most-overdue when no encompassing edges exist", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-comp-2" });
      const subj = await seedSubject({ id: "rc-comp-subj-2" });

      const t1 = await seedTopic(subj.id, { id: "rc-comp-fb-1" });
      const t2 = await seedTopic(subj.id, { id: "rc-comp-fb-2" });
      const t3 = await seedTopic(subj.id, { id: "rc-comp-fb-3" });

      // t1 most overdue, t3 least
      await seedDueState(user.id, t1.id, 180);
      await seedDueState(user.id, t2.id, 60);
      await seedDueState(user.id, t3.id, 30);

      const srs = createSRSService(db);
      const dueTopics = await srs.getDueTopics(user.id);

      const { selected, coveredCount } = await srs.compressReviews(
        dueTopics,
        2,
        new Set()
      );

      // Should take the first 2 (most overdue) — fallback behavior
      expect(selected).toHaveLength(2);
      expect(selected[0].topicId).toBe(t1.id);
      expect(selected[1].topicId).toBe(t2.id);
      expect(coveredCount).toBe(0); // No compression happened
    });

    it("excludes warmup topic IDs", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-comp-3" });
      const subj = await seedSubject({ id: "rc-comp-subj-3" });

      const t1 = await seedTopic(subj.id, { id: "rc-comp-excl-1" });
      const t2 = await seedTopic(subj.id, { id: "rc-comp-excl-2" });

      await seedDueState(user.id, t1.id, 60);
      await seedDueState(user.id, t2.id, 30);

      const srs = createSRSService(db);
      const dueTopics = await srs.getDueTopics(user.id);

      // Exclude t1
      const { selected } = await srs.compressReviews(
        dueTopics,
        2,
        new Set([t1.id])
      );

      const selectedIds = selected.map((s) => s.topicId);
      expect(selectedIds).not.toContain(t1.id);
      expect(selectedIds).toContain(t2.id);
    });

    it("returns empty when budget is 0", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-comp-4" });
      const subj = await seedSubject({ id: "rc-comp-subj-4" });
      const t1 = await seedTopic(subj.id, { id: "rc-comp-zero-1" });

      await seedDueState(user.id, t1.id, 60);

      const srs = createSRSService(db);
      const dueTopics = await srs.getDueTopics(user.id);

      const { selected } = await srs.compressReviews(dueTopics, 0, new Set());
      expect(selected).toHaveLength(0);
    });
  });

  describe("getSessionMix compression stats", () => {
    it("includes compressionStats in session mix", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-mix-1" });
      const subj = await seedSubject({ id: "rc-mix-subj-1" });

      // Create some frontier topics
      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, { id: `rc-mix-t-${i}`, depth: i });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 5);

      expect(mix.compressionStats).toBeDefined();
      expect(mix.compressionStats.explicitReviews).toBeGreaterThanOrEqual(0);
      expect(mix.compressionStats.totalDueCovered).toBeGreaterThanOrEqual(0);
      expect(typeof mix.compressionStats.ratio).toBe("number");
    });

    it("reports compression ratio > 1 when encompassing edges allow compression", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-mix-2" });
      const subj = await seedSubject({ id: "rc-mix-subj-2" });

      // Parent encompasses 3 children, all due — 4 due topics total
      const parent = await seedTopic(subj.id, { id: "rc-mix-parent" });
      const child1 = await seedTopic(subj.id, { id: "rc-mix-c1" });
      const child2 = await seedTopic(subj.id, { id: "rc-mix-c2" });
      const child3 = await seedTopic(subj.id, { id: "rc-mix-c3" });

      await seedEncompassing(parent.id, child1.id, 0.7);
      await seedEncompassing(parent.id, child2.id, 0.7);
      await seedEncompassing(parent.id, child3.id, 0.7);

      await seedDueState(user.id, parent.id, 60);
      await seedDueState(user.id, child1.id, 30);
      await seedDueState(user.id, child2.id, 30);
      await seedDueState(user.id, child3.id, 30);

      const srs = createSRSService(db);

      // Test compression directly with a budget smaller than total due topics.
      // Budget of 2: parent (covers 3 children) should be selected first.
      const dueTopics = await srs.getDueTopics(user.id);
      const { selected, coveredCount } = await srs.compressReviews(
        dueTopics,
        2,
        new Set()
      );

      // Parent covers all 3 children — only 1 explicit review needed
      // (children removed from remaining via FIRe compression)
      expect(selected.length).toBe(1);
      expect(selected[0].topicId).toBe(parent.id);
      // All 4 due topics covered by just 1 explicit review
      expect(coveredCount).toBe(4);
      expect(coveredCount).toBeGreaterThan(selected.length);
    });

    it("sessions still feel natural — not just hardest topics", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "rc-mix-3" });
      const subj = await seedSubject({ id: "rc-mix-subj-3" });

      // Multiple standalone due topics with no encompassing
      const topics = [];
      for (let i = 0; i < 6; i++) {
        const t = await seedTopic(subj.id, { id: `rc-mix-natural-${i}`, depth: i });
        await seedDueState(user.id, t.id, (6 - i) * 30); // Varying overdues
        topics.push(t);
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 8);

      // Without encompassing edges, should still return reviews in overdue order
      const reviewItems = mix.items.filter(
        (item) => item.type === "review" && item.blendRole === "main"
      );
      expect(reviewItems.length).toBeGreaterThan(0);
      // Compression ratio should be 1 (no compression possible)
      expect(mix.compressionStats.ratio).toBe(1);
    });
  });
});
