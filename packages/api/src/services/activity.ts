import { eq, and, sql, desc, gte } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { DrizzleD1Database } from "drizzle-orm/d1";

type DB = DrizzleD1Database<typeof schema>;

export type DailyGoalConfig = {
  type: "minutes" | "problems";
  target: number;
};

const DEFAULT_GOAL: DailyGoalConfig = { type: "minutes", target: 20 };

const STREAK_MILESTONES = [100, 66, 30, 7] as const;

function getMilestone(streak: number): number | null {
  for (const m of STREAK_MILESTONES) {
    if (streak === m) return m;
  }
  return null;
}

function calcLongest(goalMetDates: Set<string>): number {
  if (goalMetDates.size === 0) return 0;
  const sorted = [...goalMetDates].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + "T12:00:00Z");
    prev.setUTCDate(prev.getUTCDate() + 1);
    if (prev.toISOString().slice(0, 10) === sorted[i]) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

export function createActivityService(db: DB) {

  async function getDailyGoal(userId: string): Promise<DailyGoalConfig> {
    const row = await db
      .select({
        type: schema.userPreferences.dailyGoalType,
        target: schema.userPreferences.dailyGoalTarget,
      })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();
    if (!row) return DEFAULT_GOAL;
    return { type: row.type as "minutes" | "problems", target: row.target };
  }

  async function getOrCreateToday(userId: string, date: string) {
    const existing = await db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, userId),
        eq(schema.dailyActivity.date, date),
      ))
      .get();

    if (existing) return existing;

    const [row] = await db
      .insert(schema.dailyActivity)
      .values({
        userId,
        date,
        updatedAt: new Date().toISOString(),
      })
      .returning();
    return row;
  }

  async function recordProblemCompleted(userId: string, date: string): Promise<{ goalMet: boolean; goalJustCompleted: boolean }> {
    const activity = await getOrCreateToday(userId, date);
    const goal = await getDailyGoal(userId);
    const newCount = activity.problemsCompleted + 1;
    const wasGoalMet = activity.goalMet;
    const isGoalMet = wasGoalMet || (goal.type === "problems" && newCount >= goal.target);

    await db
      .update(schema.dailyActivity)
      .set({
        problemsCompleted: newCount,
        goalMet: isGoalMet,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.dailyActivity.id, activity.id));

    return { goalMet: isGoalMet, goalJustCompleted: !wasGoalMet && isGoalMet };
  }

  async function recordTopicMastered(userId: string, date: string): Promise<void> {
    const activity = await getOrCreateToday(userId, date);

    await db
      .update(schema.dailyActivity)
      .set({
        topicsMastered: activity.topicsMastered + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.dailyActivity.id, activity.id));
  }

  async function recordMinutes(userId: string, date: string, minutes: number): Promise<{ goalMet: boolean; goalJustCompleted: boolean }> {
    const activity = await getOrCreateToday(userId, date);
    const goal = await getDailyGoal(userId);
    const newMinutes = activity.minutesActive + minutes;
    const wasGoalMet = activity.goalMet;
    const isGoalMet = wasGoalMet || (goal.type === "minutes" && newMinutes >= goal.target);

    await db
      .update(schema.dailyActivity)
      .set({
        minutesActive: newMinutes,
        goalMet: isGoalMet,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.dailyActivity.id, activity.id));

    return { goalMet: isGoalMet, goalJustCompleted: !wasGoalMet && isGoalMet };
  }

  async function getTodayProgress(userId: string, date: string) {
    const activity = await getOrCreateToday(userId, date);
    const goal = await getDailyGoal(userId);

    const current = goal.type === "minutes" ? activity.minutesActive : activity.problemsCompleted;
    const progress = Math.min(current / goal.target, 1);

    return {
      date: activity.date,
      minutesActive: activity.minutesActive,
      problemsCompleted: activity.problemsCompleted,
      topicsMastered: activity.topicsMastered,
      goalMet: activity.goalMet,
      goal,
      current,
      progress,
    };
  }

  async function getWeeklySummary(userId: string, weekEndDate: string) {
    // Get 7 days ending at weekEndDate
    const end = new Date(weekEndDate + "T23:59:59Z");
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    const startDate = start.toISOString().slice(0, 10);

    const days = await db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, userId),
        gte(schema.dailyActivity.date, startDate),
      ))
      .orderBy(schema.dailyActivity.date);

    // Filter to only include days within the week range
    const weekDays = days.filter(d => d.date <= weekEndDate);

    const totalMinutes = weekDays.reduce((s, d) => s + d.minutesActive, 0);
    const totalProblems = weekDays.reduce((s, d) => s + d.problemsCompleted, 0);
    const totalTopicsMastered = weekDays.reduce((s, d) => s + d.topicsMastered, 0);
    const activeDays = weekDays.filter(d => d.minutesActive > 0 || d.problemsCompleted > 0).length;
    const goalMetDays = weekDays.filter(d => d.goalMet).length;

    return {
      startDate,
      endDate: weekEndDate,
      activeDays,
      goalMetDays,
      totalMinutes,
      totalProblems,
      totalTopicsMastered,
      days: weekDays.map(d => ({
        date: d.date,
        minutesActive: d.minutesActive,
        problemsCompleted: d.problemsCompleted,
        topicsMastered: d.topicsMastered,
        goalMet: d.goalMet,
      })),
    };
  }

  async function getActivityHistory(userId: string, days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const startDate = start.toISOString().slice(0, 10);

    return db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, userId),
        gte(schema.dailyActivity.date, startDate),
      ))
      .orderBy(schema.dailyActivity.date);
  }

  async function getStreakInfo(userId: string, today: string) {
    // Get all days with goalMet, ordered descending from today
    const rows = await db
      .select({ date: schema.dailyActivity.date, goalMet: schema.dailyActivity.goalMet })
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, userId),
        sql`${schema.dailyActivity.date} <= ${today}`,
      ))
      .orderBy(desc(schema.dailyActivity.date));

    // Build set of dates where goal was met
    const goalMetDates = new Set(rows.filter(r => r.goalMet).map(r => r.date));

    // Calculate current streak: consecutive days ending at today (or yesterday if today not yet met)
    let currentStreak = 0;
    const d = new Date(today + "T12:00:00Z");

    // Check if today counts
    if (goalMetDates.has(today)) {
      currentStreak = 1;
      d.setUTCDate(d.getUTCDate() - 1);
    } else {
      // Maybe streak is still alive from yesterday
      d.setUTCDate(d.getUTCDate() - 1);
      if (!goalMetDates.has(d.toISOString().slice(0, 10))) {
        // No streak — neither today nor yesterday met goal
        return { currentStreak: 0, longestStreak: calcLongest(goalMetDates), milestoneReached: null };
      }
      currentStreak = 1;
      d.setUTCDate(d.getUTCDate() - 1);
    }

    // Count backwards
    while (goalMetDates.has(d.toISOString().slice(0, 10))) {
      currentStreak++;
      d.setUTCDate(d.getUTCDate() - 1);
    }

    const longestStreak = calcLongest(goalMetDates);
    const milestoneReached = getMilestone(currentStreak);

    return { currentStreak, longestStreak, milestoneReached };
  }

  return {
    getDailyGoal,
    getOrCreateToday,
    recordProblemCompleted,
    recordTopicMastered,
    recordMinutes,
    getTodayProgress,
    getWeeklySummary,
    getActivityHistory,
    getStreakInfo,
  };
}
