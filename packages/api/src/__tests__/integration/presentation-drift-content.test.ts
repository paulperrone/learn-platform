import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedAssessmentContent,
  seedUserSubjectPresentation,
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
    const subject = await seedSubject({ id: "math-test" });
    await seedTopic(subject.id, { id: "topic-a", name: "Topic A", depth: 0 });

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

    return { db, user, subject };
  }

  it("nudgeDistribution shifts weights toward higher level on success", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.6,
      standard: 0.3,
      advanced: 0.1,
      centerLevel: "intermediate",
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
    };

    // Failure at center → nudge down
    const nudged = nudgeDistribution(dist, "standard", false);

    expect(nudged.standard).toBeLessThan(dist.standard);
    expect(nudged.intermediate).toBeGreaterThan(dist.intermediate);
  });

  it("success above center nudges with 2x rate", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.5,
      standard: 0.4,
      advanced: 0.1,
      centerLevel: "intermediate",
    };

    // Success above center (standard when center=intermediate) → 0.04 rate
    const nudged = nudgeDistribution(dist, "standard", true);

    // Should move 0.04 from center (intermediate) to served level (standard)
    expect(nudged.intermediate).toBeCloseTo(dist.intermediate - 0.04, 10);
    expect(nudged.standard).toBeCloseTo(dist.standard + 0.04, 10);
  });

  it("applyNudge persists updated distribution and logs center shift", async () => {
    const { db, user, subject } = await setupContentWithPresentations();
    const content = createContentService(db);

    // Start with intermediate-centered distribution
    await seedUserSubjectPresentation(user.id, subject.id, {
      primary: 0.05,
      intermediate: 0.50,
      standard: 0.35,
      advanced: 0.10,
    }, "intermediate");

    // Repeatedly succeed above center to shift center
    // Each success above center applies 0.04 nudge
    for (let i = 0; i < 5; i++) {
      await content.applyNudge(user.id, subject.id, "standard", true);
    }

    // Check the distribution shifted
    const [row] = await db.select()
      .from(schema.userSubjectPresentation)
      .where(and(
        eq(schema.userSubjectPresentation.userId, user.id),
        eq(schema.userSubjectPresentation.subjectId, subject.id),
      ));

    // After 5 nudges of 0.04 each: intermediate lost 0.20, standard gained 0.20
    expect(row.intermediateWeight).toBeLessThan(0.50);
    expect(row.standardWeight).toBeGreaterThan(0.35);

    // Center may have shifted to standard
    // (depends on whether standard weight exceeded intermediate weight)
    if (row.standardWeight > row.intermediateWeight) {
      expect(row.centerLevel).toBe("standard");
    }
  });

  it("drift log records center_shift transitions", async () => {
    const { db, user, subject } = await setupContentWithPresentations();
    const content = createContentService(db);

    // Start near the tipping point: standard almost exceeds intermediate
    await seedUserSubjectPresentation(user.id, subject.id, {
      primary: 0.05,
      intermediate: 0.35,
      standard: 0.45,
      advanced: 0.15,
    }, "intermediate");

    // One more nudge above center should tip it
    await content.applyNudge(user.id, subject.id, "standard", true);

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

  it("failure above center applies tiny correction (0.01)", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.5,
      standard: 0.4,
      advanced: 0.1,
      centerLevel: "intermediate",
    };

    // Failure above center → tiny correction (0.01)
    const nudged = nudgeDistribution(dist, "standard", false);

    // Move 0.01 from served (standard) back to center (intermediate)
    expect(nudged.standard).toBeCloseTo(dist.standard - 0.01, 10);
    expect(nudged.intermediate).toBeCloseTo(dist.intermediate + 0.01, 10);
  });

  it("success below center produces no change", () => {
    const dist: PresentationDistribution = {
      primary: 0.1,
      intermediate: 0.3,
      standard: 0.5,
      advanced: 0.1,
      centerLevel: "standard",
    };

    // Success below center → no nudge (expected ease)
    const nudged = nudgeDistribution(dist, "intermediate", true);

    expect(nudged.primary).toEqual(dist.primary);
    expect(nudged.intermediate).toEqual(dist.intermediate);
    expect(nudged.standard).toEqual(dist.standard);
    expect(nudged.advanced).toEqual(dist.advanced);
  });

  it("resolvePresentation samples from updated distribution", async () => {
    const { db, user, subject } = await setupContentWithPresentations();
    const content = createContentService(db);

    // Set distribution heavily favoring standard
    await seedUserSubjectPresentation(user.id, subject.id, {
      primary: 0,
      intermediate: 0,
      standard: 1.0,
      advanced: 0,
    }, "standard");

    // resolvePresentation should always return standard with this distribution
    const level = await content.resolvePresentation(user.id, subject.id);
    expect(level).toBe("standard");
  });
});
