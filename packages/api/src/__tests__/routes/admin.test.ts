import { describe, it, expect, beforeAll } from "vitest";
import { sql, countDistinct } from "drizzle-orm";
import {
  applyMigrations,
  request,
  json,
  seedUser,
  seedAdminUser,
  seedSubject,
  seedTopic,
  seedLLMUsage,
  seedReviewLog,
  seedOrg,
  seedInstructionalContent,
  seedAssessmentContent,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { gte } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

describe("admin route auth gating", () => {
  it("returns 401 without session", async () => {
    const res = await request("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("returns 401 for system-stats without session", async () => {
    const res = await request("/api/admin/system-stats");
    expect(res.status).toBe(401);
  });
});

describe("admin stats queries (service-level)", () => {
  it("returns expanded stats with content counts and breakdowns", async () => {
    const db = getTestDb();

    // Seed data
    const subj = await seedSubject({ id: "admin-q-subj" });
    const topic = await seedTopic(subj.id, { id: "admin-q-topic" });
    await seedOrg({ id: "admin-q-org" });
    await seedInstructionalContent(topic.id, { id: "admin-q-ic-1", locale: "en", flavor: "classic" });
    await seedInstructionalContent(topic.id, { id: "admin-q-ic-2", locale: "es", flavor: "adventure" });
    await seedAssessmentContent(topic.id, { id: "admin-q-ac-1", locale: "en", flavor: "classic" });
    await seedAssessmentContent(topic.id, { id: "admin-q-ac-2", locale: "en", flavor: "classic" });
    await seedAssessmentContent(topic.id, { id: "admin-q-ac-3", locale: "es", flavor: "adventure" });

    // Verify counts
    const [icCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.instructionalContent);
    expect(icCount.count).toBeGreaterThanOrEqual(2);

    const [acCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.assessmentContent);
    expect(acCount.count).toBeGreaterThanOrEqual(3);

    // Verify locale breakdown via Drizzle groupBy
    const byLocaleIC = await db.select({
      locale: schema.instructionalContent.locale,
      count: sql<number>`count(*)`,
    }).from(schema.instructionalContent).groupBy(schema.instructionalContent.locale);

    const enIC = byLocaleIC.find((r) => r.locale === "en");
    expect(enIC).toBeDefined();
    expect(enIC!.count).toBeGreaterThanOrEqual(1);

    const esIC = byLocaleIC.find((r) => r.locale === "es");
    expect(esIC).toBeDefined();
    expect(esIC!.count).toBeGreaterThanOrEqual(1);

    // Verify flavor breakdown
    const byFlavorAC = await db.select({
      flavor: schema.assessmentContent.flavor,
      count: sql<number>`count(*)`,
    }).from(schema.assessmentContent).groupBy(schema.assessmentContent.flavor);

    expect(byFlavorAC.length).toBeGreaterThanOrEqual(2);
  });
});

describe("system stats queries (service-level)", () => {
  it("counts active users from review data", async () => {
    const db = getTestDb();
    const subj = await seedSubject({ id: "admin-sys-subj" });
    const topic = await seedTopic(subj.id, { id: "admin-sys-topic" });
    const learner = await seedUser({ id: "admin-sys-learner" });
    await seedReviewLog(learner.id, topic.id, { id: "admin-sys-rev-1" });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [active7d] = await db.select({ count: countDistinct(schema.reviewLog.userId) })
      .from(schema.reviewLog)
      .where(gte(schema.reviewLog.createdAt, sevenDaysAgo));

    expect(active7d.count).toBeGreaterThanOrEqual(1);
  });

  it("counts LLM usage summary", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "admin-sys-llm-user" });
    await seedLLMUsage(user.id, { id: "admin-sys-llm-1", costCents: 0.5, inputTokens: 200, outputTokens: 100 });

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [summary] = await db.select({
      totalCalls: sql<number>`count(*)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}), 0)`,
      uniqueModels: countDistinct(schema.llmUsage.model),
    })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart));

    expect(summary.totalCalls).toBeGreaterThanOrEqual(1);
    expect(summary.totalCostCents).toBeGreaterThan(0);
    expect(summary.totalInputTokens).toBeGreaterThan(0);
  });
});
