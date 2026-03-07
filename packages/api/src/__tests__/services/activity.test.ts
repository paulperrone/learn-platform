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

  describe("getDailyGoal", () => {
    it("returns default goal when no preferences exist", async () => {
      const goal = await activity.getDailyGoal(userId);
      expect(goal).toEqual({ type: "minutes", target: 20 });
    });

    it("returns configured goal from user preferences", async () => {
      const now = new Date().toISOString();
      await db.insert(schema.userPreferences).values({
        userId,
        dailyGoalType: "problems",
        dailyGoalTarget: 15,
        createdAt: now,
        updatedAt: now,
      });

      const goal = await activity.getDailyGoal(userId);
      expect(goal).toEqual({ type: "problems", target: 15 });
    });
  });

  describe("getOrCreateToday", () => {
    it("creates a new activity row for a new date", async () => {
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.userId).toBe(userId);
      expect(row.date).toBe("2026-03-07");
      expect(row.minutesActive).toBe(0);
      expect(row.problemsCompleted).toBe(0);
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

    it("triggers goalMet when problems goal reached", async () => {
      const now = new Date().toISOString();
      await db.insert(schema.userPreferences).values({
        userId,
        dailyGoalType: "problems",
        dailyGoalTarget: 2,
        createdAt: now,
        updatedAt: now,
      });

      const r1 = await activity.recordProblemCompleted(userId, "2026-03-07");
      expect(r1.goalMet).toBe(false);

      const r2 = await activity.recordProblemCompleted(userId, "2026-03-07");
      expect(r2.goalMet).toBe(true);
      expect(r2.goalJustCompleted).toBe(true);

      // Third problem — goal already met
      const r3 = await activity.recordProblemCompleted(userId, "2026-03-07");
      expect(r3.goalMet).toBe(true);
      expect(r3.goalJustCompleted).toBe(false);
    });

    it("does not trigger goalMet when goal type is minutes", async () => {
      // Default is minutes goal
      const r1 = await activity.recordProblemCompleted(userId, "2026-03-07");
      expect(r1.goalMet).toBe(false);
    });
  });

  describe("recordMinutes", () => {
    it("accumulates minutes", async () => {
      await activity.recordMinutes(userId, "2026-03-07", 5);
      await activity.recordMinutes(userId, "2026-03-07", 10);
      const row = await activity.getOrCreateToday(userId, "2026-03-07");
      expect(row.minutesActive).toBe(15);
    });

    it("triggers goalMet when minutes goal reached", async () => {
      const now = new Date().toISOString();
      await db.insert(schema.userPreferences).values({
        userId,
        dailyGoalType: "minutes",
        dailyGoalTarget: 10,
        createdAt: now,
        updatedAt: now,
      });

      const r1 = await activity.recordMinutes(userId, "2026-03-07", 5);
      expect(r1.goalMet).toBe(false);

      const r2 = await activity.recordMinutes(userId, "2026-03-07", 6);
      expect(r2.goalMet).toBe(true);
      expect(r2.goalJustCompleted).toBe(true);
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
    it("returns progress with goal context", async () => {
      await activity.recordMinutes(userId, "2026-03-07", 8);
      await activity.recordProblemCompleted(userId, "2026-03-07");

      const progress = await activity.getTodayProgress(userId, "2026-03-07");
      expect(progress.minutesActive).toBe(8);
      expect(progress.problemsCompleted).toBe(1);
      expect(progress.goal).toEqual({ type: "minutes", target: 20 });
      expect(progress.current).toBe(8); // minutes mode
      expect(progress.progress).toBeCloseTo(0.4);
    });
  });

  describe("getWeeklySummary", () => {
    it("aggregates a week of activity", async () => {
      await seedDailyActivity(userId, "2026-03-01", { minutesActive: 20, problemsCompleted: 10, goalMet: true });
      await seedDailyActivity(userId, "2026-03-03", { minutesActive: 15, problemsCompleted: 8, topicsMastered: 1 });
      await seedDailyActivity(userId, "2026-03-05", { minutesActive: 25, problemsCompleted: 12, topicsMastered: 2, goalMet: true });

      const summary = await activity.getWeeklySummary(userId, "2026-03-07");
      expect(summary.startDate).toBe("2026-03-01");
      expect(summary.endDate).toBe("2026-03-07");
      expect(summary.activeDays).toBe(3);
      expect(summary.goalMetDays).toBe(2);
      expect(summary.totalMinutes).toBe(60);
      expect(summary.totalProblems).toBe(30);
      expect(summary.totalTopicsMastered).toBe(3);
      expect(summary.days).toHaveLength(3);
    });

    it("returns empty summary when no activity", async () => {
      const summary = await activity.getWeeklySummary(userId, "2026-03-07");
      expect(summary.activeDays).toBe(0);
      expect(summary.totalMinutes).toBe(0);
      expect(summary.days).toHaveLength(0);
    });
  });

  describe("getActivityHistory", () => {
    it("returns activity within date range", async () => {
      await seedDailyActivity(userId, "2026-03-01", { minutesActive: 20 });
      await seedDailyActivity(userId, "2026-03-05", { minutesActive: 15 });

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

    it("counts streak from yesterday when today not yet met", async () => {
      await seedDailyActivity(userId, "2026-03-05", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-06", { goalMet: true });
      // today (2026-03-07) no activity yet

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(2);
    });

    it("returns zero when gap exists before yesterday", async () => {
      await seedDailyActivity(userId, "2026-03-04", { goalMet: true });
      // gap on 03-05 and 03-06
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(1);
    });

    it("calculates longest streak correctly", async () => {
      // Old streak of 4
      await seedDailyActivity(userId, "2026-02-20", { goalMet: true });
      await seedDailyActivity(userId, "2026-02-21", { goalMet: true });
      await seedDailyActivity(userId, "2026-02-22", { goalMet: true });
      await seedDailyActivity(userId, "2026-02-23", { goalMet: true });
      // Gap, then current streak of 2
      await seedDailyActivity(userId, "2026-03-06", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(2);
      expect(info.longestStreak).toBe(4);
    });

    it("returns milestone for 7-day streak", async () => {
      for (let i = 6; i >= 0; i--) {
        const d = new Date("2026-03-07T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - i);
        await seedDailyActivity(userId, d.toISOString().slice(0, 10), { goalMet: true });
      }

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(7);
      expect(info.milestoneReached).toBe(7);
    });

    it("returns null milestone for non-milestone streaks", async () => {
      await seedDailyActivity(userId, "2026-03-06", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(2);
      expect(info.milestoneReached).toBeNull();
    });

    it("ignores days where goal was not met", async () => {
      await seedDailyActivity(userId, "2026-03-05", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-06", { goalMet: false, minutesActive: 5 }); // active but didn't meet goal
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const info = await activity.getStreakInfo(userId, "2026-03-07");
      expect(info.currentStreak).toBe(1); // streak broken by non-goal day
    });
  });
});
