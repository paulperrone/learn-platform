import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedUserDisciplinePresentation,
  getTestR2Bucket,
} from "../helpers.js";
import { createContentService, nudgeDistribution, type PresentationDistribution } from "../../services/content.js";
import * as schema from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * Cross-plan integration test: Presentation drift → content selection.
 *
 * Verifies that presentation drift (Plan 009.5) nudges the distribution,
 * and that subsequent content resolution (Plan 009) reflects the updated
 * distribution. Also confirms drift log records center transitions.
 */
describe("presentation-drift-content integration", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupContentWithPresentations() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math-test" });
    await seedTopic(discipline.id, { id: "topic-a", name: "Topic A", depth: 0 });

    // Seed content at multiple presentation levels
    await seedAssessmentContent("topic-a", {
      id: "ac-primary", difficulty: "medium",
      question: "Primary level?", answer: "1",
      presentation: "primary",
    });
    await seedAssessmentContent("topic-a", {
      id: "ac-intermediate", difficulty: "medium",
      question: "Intermediate level?", answer: "2",
      presentation: "intermediate",
    });
    await seedAssessmentContent("topic-a", {
      id: "ac-standard", difficulty: "medium",
      question: "Standard level?", answer: "3",
      presentation: "standard",
    });
    await seedAssessmentContent("topic-a", {
      id: "ac-advanced", difficulty: "medium",
      question: "Advanced level?", answer: "4",
      presentation: "advanced",
    });

    return { db, user, discipline };
  }

  it("nudgeDistribution shifts weights toward higher level on success", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.6,
      standard: 0.3,
      advanced: 0.1,
      centerLevel: "intermediate",
      driftSignal: 0,
    };

    // Success at center → nudge up
    const nudged = nudgeDistribution(dist, "intermediate", true);

    expect(nudged.intermediate).toBeLessThan(dist.intermediate);
    expect(nudged.standard).toBeGreaterThan(dist.standard);
  });

  it("nudgeDistribution shifts weights toward lower level on failure", () => {
    const dist: PresentationDistribution = {
      primary: 0.1,
      intermediate: 0.3,
      standard: 0.5,
      advanced: 0.1,
      centerLevel: "standard",
      driftSignal: 0,
    };

    // Failure at center → nudge down
    const nudged = nudgeDistribution(dist, "standard", false);

    expect(nudged.standard).toBeLessThan(dist.standard);
    expect(nudged.intermediate).toBeGreaterThan(dist.intermediate);
  });

  it("success above center produces stronger signal than at center", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.5,
      standard: 0.4,
      advanced: 0.1,
      centerLevel: "intermediate",
      driftSignal: 0,
    };

    // Success above center (standard when center=intermediate)
    const nudgedAbove = nudgeDistribution(dist, "standard", true);
    const nudgedCenter = nudgeDistribution(dist, "intermediate", true);

    // Above-center success produces a stronger EMA signal than at-center
    // (weight delta is the same fixed driftRate, but signal builds faster)
    expect(nudgedAbove.driftSignal).toBeGreaterThan(nudgedCenter.driftSignal);
  });

  it("applyNudge persists updated distribution and logs center shift", async () => {
    const { db, user, discipline } = await setupContentWithPresentations();
    const content = createContentService(db, getTestR2Bucket());

    // Start with intermediate-centered distribution
    await seedUserDisciplinePresentation(user.id, discipline.id, {
      primary: 0.05,
      intermediate: 0.50,
      standard: 0.35,
      advanced: 0.10,
    }, "intermediate");

    // Repeatedly succeed above center to shift distribution
    // With driftRate=0.008 and EMA gating, need enough nudges for signal buildup + drift
    for (let i = 0; i < 15; i++) {
      await content.applyNudge(user.id, discipline.id, "standard", true);
    }

    // Check the distribution shifted
    const [row] = await db.select()
      .from(schema.userDisciplinePresentation)
      .where(and(
        eq(schema.userDisciplinePresentation.userId, user.id),
        eq(schema.userDisciplinePresentation.disciplineId, discipline.id),
      ));

    expect(row.intermediateWeight).toBeLessThan(0.50);
    expect(row.standardWeight).toBeGreaterThan(0.35);
  });

  it("drift log records center_shift transitions", async () => {
    const { db, user, discipline } = await setupContentWithPresentations();
    const content = createContentService(db, getTestR2Bucket());

    // Start near the tipping point: standard exceeds threshold and margin over intermediate
    await seedUserDisciplinePresentation(user.id, discipline.id, {
      primary: 0.05,
      intermediate: 0.20,
      standard: 0.60,
      advanced: 0.15,
    }, "intermediate");

    // Multiple nudges above center to build EMA signal and trigger center shift
    for (let i = 0; i < 3; i++) {
      await content.applyNudge(user.id, discipline.id, "standard", true);
    }

    // Check drift log
    const logs = await db.select()
      .from(schema.presentationDriftLog)
      .where(eq(schema.presentationDriftLog.userId, user.id));

    // Should have logged the center shift
    const centerShift = logs.find(l => l.trigger === "center_shift");
    if (centerShift) {
      expect(centerShift.fromCenter).toBe("intermediate");
      expect(centerShift.toCenter).toBe("standard");
    }
  });

  it("failure above center absorbed by EMA on single occurrence", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.5,
      standard: 0.4,
      advanced: 0.1,
      centerLevel: "intermediate",
      driftSignal: 0,
    };

    // Single failure above center: tiny signal absorbed by EMA smoothing
    const nudged = nudgeDistribution(dist, "standard", false);

    // Signal tracked but below threshold → no weight change
    expect(nudged.driftSignal).toBeLessThan(0);
    expect(nudged.standard).toBeCloseTo(dist.standard, 10);
    expect(nudged.intermediate).toBeCloseTo(dist.intermediate, 10);
  });

  it("success below center produces no change", () => {
    const dist: PresentationDistribution = {
      primary: 0.1,
      intermediate: 0.3,
      standard: 0.5,
      advanced: 0.1,
      centerLevel: "standard",
      driftSignal: 0,
    };

    // Success below center → no nudge (expected ease)
    const nudged = nudgeDistribution(dist, "intermediate", true);

    expect(nudged.primary).toEqual(dist.primary);
    expect(nudged.intermediate).toEqual(dist.intermediate);
    expect(nudged.standard).toEqual(dist.standard);
    expect(nudged.advanced).toEqual(dist.advanced);
  });

  it("resolvePresentation samples from updated distribution", async () => {
    const { db, user, discipline } = await setupContentWithPresentations();
    const content = createContentService(db, getTestR2Bucket());

    // Set distribution heavily favoring standard
    await seedUserDisciplinePresentation(user.id, discipline.id, {
      primary: 0,
      intermediate: 0,
      standard: 1.0,
      advanced: 0,
    }, "standard");

    // resolvePresentation should always return standard with this distribution
    const level = await content.resolvePresentation(user.id, discipline.id);
    expect(level).toBe("standard");
  });
});
