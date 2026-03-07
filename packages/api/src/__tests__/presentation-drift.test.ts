import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedDiscipline,
  seedUserSubjectPresentation,
} from "./helpers.js";
import {
  nudgeDistribution,
  buildDefaultDistribution,
  DRIFT_RATES,
  type PresentationDistribution,
} from "../services/content.js";
import { createContentService } from "../services/content.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";

function sumWeights(d: PresentationDistribution): number {
  return d.primary + d.intermediate + d.standard + d.advanced;
}

describe("nudgeDistribution (pure function)", () => {
  it("nudges upward on success at center level", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeDistribution(dist, "standard", true);
    expect(result.advanced).toBeGreaterThan(dist.advanced);
    expect(result.standard).toBeLessThan(dist.standard);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("nudges downward on failure at center level", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeDistribution(dist, "standard", false);
    expect(result.intermediate).toBeGreaterThan(dist.intermediate);
    expect(result.standard).toBeLessThan(dist.standard);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("nudges upward more on success above center", () => {
    const dist = buildDefaultDistribution(2016); // intermediate center
    const result = nudgeDistribution(dist, "standard", true);
    // Should apply larger delta than success at center
    const atCenter = nudgeDistribution(dist, "intermediate", true);
    const aboveDelta = result.standard - dist.standard;
    const centerDelta = atCenter.standard - dist.standard;
    expect(aboveDelta).toBeGreaterThan(centerDelta);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("applies tiny correction on failure above center", () => {
    const dist = buildDefaultDistribution(2016); // intermediate center
    const result = nudgeDistribution(dist, "standard", false);
    // Should nudge back to center, small delta
    expect(result.intermediate).toBeGreaterThan(dist.intermediate);
    expect(result.standard).toBeLessThan(dist.standard);
    const delta = result.intermediate - dist.intermediate;
    expect(delta).toBeCloseTo(DRIFT_RATES.failureAboveCenter, 10);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("no change on success below center", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeDistribution(dist, "intermediate", true);
    expect(result).toEqual(dist);
  });

  it("nudges down on failure below center", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeDistribution(dist, "intermediate", false);
    expect(result.intermediate).toBeGreaterThan(dist.intermediate);
    expect(result.standard).toBeLessThan(dist.standard);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("no change when already at lowest and failing", () => {
    const dist = buildDefaultDistribution(2020); // primary center
    const result = nudgeDistribution(dist, "primary", false);
    // Can't go lower than primary
    expect(result).toEqual(dist);
  });

  it("no change when already at highest and succeeding", () => {
    const dist = buildDefaultDistribution(2008); // advanced center
    const result = nudgeDistribution(dist, "advanced", true);
    // Can't go higher than advanced
    expect(result).toEqual(dist);
  });

  it("snaps levels below threshold to 0", () => {
    // Create a distribution with a level just above 0
    const dist: PresentationDistribution = {
      primary: 0.04,
      intermediate: 0.10,
      standard: 0.76,
      advanced: 0.10,
      centerLevel: "standard",
    };
    // Nudge in a way that would reduce primary further
    const result = nudgeDistribution(dist, "intermediate", false);
    // Primary was already low; after redistribution from standard → intermediate,
    // primary should snap to 0 if it falls below threshold
    expect(result.primary === 0 || result.primary >= DRIFT_RATES.snapThreshold).toBe(true);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("updates centerLevel when highest weight shifts", () => {
    // Create a dist nearly at the tipping point
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.40,
      standard: 0.38,
      advanced: 0.22,
      centerLevel: "intermediate",
    };
    // Repeated success above center should eventually shift center
    let current = dist;
    for (let i = 0; i < 3; i++) {
      current = nudgeDistribution(current, "standard", true);
    }
    // After 3 iterations of +0.04 to standard from intermediate:
    // standard should surpass intermediate
    expect(current.centerLevel).toBe("standard");
    expect(sumWeights(current)).toBeCloseTo(1.0, 10);
  });

  it("simulated: 20 successes at center measurably shifts upward", () => {
    let dist = buildDefaultDistribution(2016); // intermediate center
    const initial = { ...dist };
    for (let i = 0; i < 20; i++) {
      dist = nudgeDistribution(dist, dist.centerLevel, true);
    }
    expect(dist.standard).toBeGreaterThan(initial.standard);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });

  it("simulated: 10 failures at center shifts downward", () => {
    let dist = buildDefaultDistribution(2012); // standard center
    const initial = { ...dist };
    for (let i = 0; i < 10; i++) {
      dist = nudgeDistribution(dist, dist.centerLevel, false);
    }
    expect(dist.intermediate).toBeGreaterThan(initial.intermediate);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });
});

describe("applyNudge (integration)", () => {
  const db = getTestDb();
  const content = createContentService(db);

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  it("nudges stored distribution and persists", async () => {
    const user = await seedUser({ birthYear: 2012 });
    const subject = await seedSubject();
    await seedUserSubjectPresentation(
      user.id,
      subject.id,
      { primary: 0.10, intermediate: 0.15, standard: 0.65, advanced: 0.10 },
      "standard"
    );

    await content.applyNudge(user.id, subject.id, "standard", true);

    const updated = await content.getSubjectDistribution(user.id, subject.id);
    expect(updated).not.toBeNull();
    expect(updated!.advanced).toBeGreaterThan(0.10);
    expect(updated!.standard).toBeLessThan(0.65);
    expect(
      updated!.primary + updated!.intermediate + updated!.standard + updated!.advanced
    ).toBeCloseTo(1.0, 10);
  });

  it("does nothing when no distribution exists", async () => {
    const user = await seedUser({});
    const subject = await seedSubject();

    // Should not throw
    await content.applyNudge(user.id, subject.id, "standard", true);

    const dist = await content.getSubjectDistribution(user.id, subject.id);
    expect(dist).toBeNull();
  });

  it("logs drift when center shifts", async () => {
    const user = await seedUser({ birthYear: 2016 });
    const subject = await seedSubject();
    // Near tipping point: intermediate barely leads over standard
    await seedUserSubjectPresentation(
      user.id,
      subject.id,
      { primary: 0, intermediate: 0.42, standard: 0.40, advanced: 0.18 },
      "intermediate"
    );

    // A single success above center should shift center from intermediate → standard
    await content.applyNudge(user.id, subject.id, "standard", true);

    const updated = await content.getSubjectDistribution(user.id, subject.id);
    expect(updated!.centerLevel).toBe("standard");

    // Check drift log was created
    const logs = await db
      .select()
      .from(schema.presentationDriftLog)
      .where(
        and(
          eq(schema.presentationDriftLog.userId, user.id),
          eq(schema.presentationDriftLog.subjectId, subject.id),
        )
      );
    expect(logs.length).toBeGreaterThan(0);
    const centerShift = logs.find((l) => l.trigger === "center_shift");
    expect(centerShift).toBeDefined();
    expect(centerShift!.fromCenter).toBe("intermediate");
    expect(centerShift!.toCenter).toBe("standard");
  });
});
