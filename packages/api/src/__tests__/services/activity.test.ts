import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb, applyMigrations, resetDb, seedUser, seedDailyActivity } from "../helpers";
import { createActivityService } from "../../services/activity";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

describe("ActivityService", () => {
  let db: ReturnType<typeof getTestDb>;
  let activity: ReturnType<typeof createActivityService>;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
    db = getTestDb();
    const user = await seedUser();
    userId = user.id;
    activity = createActivityService(db);
  });

  describe("getDailyXpGoal", () => {
    it("returns default goal when no preferences exist", async () => {
      const goal = await activity.getDailyXpGoal(userId);
      expect(goal).toBe(20);
    });

    it("returns configured goal from user preferences", async () => {
      const now = new Date().toISOString();
      await db.insert(schema.userPreferences).values({
        userId,
        dailyXpGoal: 40,
        createdAt: now,
        updatedAt: now,
      });

      const goal = await activity.getDailyXpGoal(userId);
      expect(goal).toBe(40);
    });
  });

  describe("getOrCreateToday", () => {
    it("creates a new activity row for a new date", async () => {
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.userId).toBe(userId);
      expect(row.date).toBe("2026-03-07");
      expect(row.minutesActive).toBe(0);
      expect(row.problemsCompleted).toBe(0);
      expect(row.dailyXp).toBe(0);
    });

    it("returns existing row for same date", async () => {
      await seedDailyActivity(userId, "2026-03-07", { minutesActive: 10 });
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.minutesActive).toBe(10);
    });
  });

  describe("recordProblemCompleted", () => {
    it("increments problem count", async () => {
      await activity.recordProblemCompleted(userId, "2026-03-07");
      await activity.recordProblemCompleted(userId, "2026-03-07");
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.problemsCompleted).toBe(2);
    });
  });

  describe("recordXP", () => {
    it("accumulates XP and triggers goal", async () => {
      const now = new Date().toISOString();
      await db.insert(schema.userPreferences).values({
        userId,
        dailyXpGoal: 10,
        createdAt: now,
        updatedAt: now,
      });

      const r1 = await activity.recordXP(userId, "2026-03-07", 5);
      expect(r1.goalMet).toBe(false);

      const r2 = await activity.recordXP(userId, "2026-03-07", 6);
      expect(r2.goalMet).toBe(true);
      expect(r2.goalJustCompleted).toBe(true);

      // Additional XP — goal already met
      const r3 = await activity.recordXP(userId, "2026-03-07", 3);
      expect(r3.goalMet).toBe(true);
      expect(r3.goalJustCompleted).toBe(false);
    });

    it("uses default goal when no preferences", async () => {
      // Default is 20 XP
      const r1 = await activity.recordXP(userId, "2026-03-07", 19);
      expect(r1.goalMet).toBe(false);

      const r2 = await activity.recordXP(userId, "2026-03-07", 1);
      expect(r2.goalMet).toBe(true);
    });
  });

  describe("recordMinutes", () => {
    it("accumulates minutes", async () => {
      await activity.recordMinutes(userId, "2026-03-07", 5);
      await activity.recordMinutes(userId, "2026-03-07", 10);
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.minutesActive).toBe(15);
    });
  });

  describe("recordTopicMastered", () => {
    it("increments topics mastered count", async () => {
      await activity.recordTopicMastered(userId, "2026-03-07");
      await activity.recordTopicMastered(userId, "2026-03-07");
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.topicsMastered).toBe(2);
    });
  });

  describe("getTodayProgress", () => {
    it("returns XP-based progress", async () => {
      await activity.recordXP(userId, "2026-03-07", 8);
      await activity.recordProblemCompleted(userId, "2026-03-07");

      const progress = await activity.getTodayProgress(userId, "2026-03-07");
      expect(progress.dailyXp).toBe(8);
      expect(progress.problemsCompleted).toBe(1);
      expect(progress.dailyXpGoal).toBe(20);
      expect(progress.current).toBe(8);
      expect(progress.progress).toBeCloseTo(0.4);
    });
  });

  describe("getWeeklySummary", () => {
    it("aggregates a week of activity", async () => {
      await seedDailyActivity(userId, "2026-03-01", { minutesActive: 20, problemsCompleted: 10, dailyXp: 25, goalMet: true });
      await seedDailyActivity(userId, "2026-03-03", { minutesActive: 15, problemsCompleted: 8, dailyXp: 18, topicsMastered: 1 });
      await seedDailyActivity(userId, "2026-03-05", { minutesActive: 25, problemsCompleted: 12, dailyXp: 30, topicsMastered: 2, goalMet: true });

      const summary = await activity.getWeeklySummary(userId, "2026-03-07");
      expect(summary.startDate).toBe("2026-03-01");
      expect(summary.endDate).toBe("2026-03-07");
      expect(summary.activeDays).toBe(3);
      expect(summary.goalMetDays).toBe(2);
      expect(summary.totalMinutes).toBe(60);
      expect(summary.totalProblems).toBe(30);
      expect(summary.totalTopicsMastered).toBe(3);
      expect(summary.totalXp).toBe(73);
      expect(summary.days).toHaveLength(3);
    });

    it("returns empty summary when no activity", async () => {
      const summary = await activity.getWeeklySummary(userId, "2026-03-07");
      expect(summary.activeDays).toBe(0);
      expect(summary.totalMinutes).toBe(0);
      expect(summary.totalXp).toBe(0);
      expect(summary.days).toHaveLength(0);
    });
  });

  describe("getActivityHistory", () => {
    it("returns activity within date range", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      await seedDailyActivity(userId, yesterday, { minutesActive: 20 });
      await seedDailyActivity(userId, today, { minutesActive: 15 });

      const history = await activity.getActivityHistory(userId, 7);
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getStreakInfo", () => {
    it("returns zero streak when no activity", async () => {
      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(0);
      expect(info.longestStreak).toBe(0);
      expect(info.milestoneReached).toBeNull();
    });

    it("counts streak including today", async () => {
      await seedDailyActivity(userId, "2026-03-05", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-06", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(3);
    });

    it("streak breaks on gap", async () => {
      await seedDailyActivity(userId, "2026-03-04", { goalMet: true });
      // gap on 2026-03-05
      await seedDailyActivity(userId, "2026-03-06", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(2);
      expect(info.longestStreak).toBe(2);
    });
  });
});
