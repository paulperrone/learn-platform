import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedUserDisciplinePresentation,
  getTestR2Bucket,
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

/** Apply N nudges with same parameters, returning final distribution */
function nudgeN(
  dist: PresentationDistribution,
  level: Parameters<typeof nudgeDistribution>[1],
  success: boolean,
  n: number
): PresentationDistribution {
  let current = dist;
  for (let i = 0; i < n; i++) {
    current = nudgeDistribution(current, level, success);
  }
  return current;
}

/** Simulate a session of n problems with given accuracy (interleaved pattern) */
function simulateSession(
  dist: PresentationDistribution,
  level: Parameters<typeof nudgeDistribution>[1],
  accuracy: number,
  problems: number
): PresentationDistribution {
  let current = dist;
  // Use interleaved pattern rather than bursts for realistic simulation
  for (let i = 0; i < problems; i++) {
    // Distribute successes evenly: success if (i * accuracy) rounds up
    const success = Math.floor((i + 1) * accuracy) > Math.floor(i * accuracy);
    // Serve at current center level (tracks mid-session center shifts)
    current = nudgeDistribution(current, current.centerLevel, success);
  }
  return current;
}

describe("nudgeDistribution (pure function)", () => {
  it("nudges upward on consistent success at center level", () => {
    // Need multiple successes to build EMA signal above threshold
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeN(dist, "standard", true, 3);
    expect(result.advanced).toBeGreaterThan(dist.advanced);
    expect(result.standard).toBeLessThan(dist.standard);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("nudges downward on consistent failure at center level", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeN(dist, "standard", false, 3);
    expect(result.intermediate).toBeGreaterThan(dist.intermediate);
    expect(result.standard).toBeLessThan(dist.standard);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("success above center builds stronger upward signal than at center", () => {
    const dist = buildDefaultDistribution(2016); // intermediate center
    const aboveResult = nudgeDistribution(dist, "standard", true);
    const centerResult = nudgeDistribution(dist, "intermediate", true);
    // Above-center success has larger raw signal (0.10 vs 0.05)
    expect(aboveResult.driftSignal).toBeGreaterThan(centerResult.driftSignal);
  });

  it("absorbs single failure above center via EMA smoothing", () => {
    const dist = buildDefaultDistribution(2016); // intermediate center
    const result = nudgeDistribution(dist, "standard", false);
    // Single failure above center: rawSignal = -0.06, newSignal = 0.3 * -0.06 = -0.018
    // Above threshold → drift applies, but only driftRate (0.008)
    expect(result.driftSignal).toBeLessThan(0);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("no change on success below center", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeDistribution(dist, "intermediate", true);
    expect(result.primary).toEqual(dist.primary);
    expect(result.intermediate).toEqual(dist.intermediate);
    expect(result.standard).toEqual(dist.standard);
    expect(result.advanced).toEqual(dist.advanced);
    expect(result.centerLevel).toEqual(dist.centerLevel);
  });

  it("nudges down on failure below center", () => {
    const dist = buildDefaultDistribution(2012); // standard center
    const result = nudgeDistribution(dist, "intermediate", false);
    // rawSignal = -0.08, newSignal = -0.024 (above threshold) → drift down
    expect(result.intermediate).toBeGreaterThan(dist.intermediate);
    expect(result.standard).toBeLessThan(dist.standard);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("no change when already at lowest and failing", () => {
    const dist = buildDefaultDistribution(2020); // primary center
    const result = nudgeDistribution(dist, "primary", false);
    // Can't go lower than primary — rawSignal stays 0
    expect(result.primary).toEqual(dist.primary);
    expect(result.centerLevel).toEqual("primary");
  });

  it("no change when already at highest and succeeding", () => {
    const dist = buildDefaultDistribution(2008); // advanced center
    const result = nudgeDistribution(dist, "advanced", true);
    // Can't go higher than advanced — rawSignal stays 0
    expect(result.advanced).toEqual(dist.advanced);
    expect(result.centerLevel).toEqual("advanced");
  });

  it("snaps levels below threshold to 0", () => {
    const dist: PresentationDistribution = {
      primary: 0.04,
      intermediate: 0.10,
      standard: 0.76,
      advanced: 0.10,
      centerLevel: "standard",
      driftSignal: -0.03, // pre-built downward signal to ensure drift applies
    };
    // Failure at center with existing downward signal → drift applies
    const result = nudgeDistribution(dist, "standard", false);
    // Primary was already low (0.04); snap threshold is 0.05
    expect(result.primary === 0 || result.primary >= DRIFT_RATES.snapThreshold).toBe(true);
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("center-level hysteresis prevents oscillation", () => {
    // Standard weight is below hysteresis threshold (0.40)
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.52,
      standard: 0.30,
      advanced: 0.18,
      centerLevel: "intermediate",
      driftSignal: 0,
    };
    // Even after several upward nudges, standard shouldn't reach 0.40
    const result = nudgeN(dist, "standard", true, 5);
    // standard gained 5 * 0.008 = 0.04, now ~0.34 — below hysteresis
    expect(result.centerLevel).toBe("intermediate");
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("center shifts when weight exceeds hysteresis threshold plus margin", () => {
    const dist: PresentationDistribution = {
      primary: 0,
      intermediate: 0.15,
      standard: 0.60,
      advanced: 0.25,
      centerLevel: "intermediate",
      driftSignal: 0.03, // strong upward signal from previous nudges
    };
    // Standard (0.60) exceeds threshold (0.40) and exceeds intermediate (0.15) by > margin (0.05)
    const result = nudgeDistribution(dist, "standard", true);
    expect(result.centerLevel).toBe("standard");
    expect(sumWeights(result)).toBeCloseTo(1.0, 10);
  });

  it("tracks driftSignal across nudges", () => {
    let dist = buildDefaultDistribution(2012); // standard center
    expect(dist.driftSignal).toBe(0);

    // Success pushes signal positive
    dist = nudgeDistribution(dist, "standard", true);
    expect(dist.driftSignal).toBeGreaterThan(0);

    // Failure pushes signal negative (though still may be positive overall)
    const signalBefore = dist.driftSignal;
    dist = nudgeDistribution(dist, "standard", false);
    expect(dist.driftSignal).toBeLessThan(signalBefore);
  });
});

describe("EMA smoothing behavior", () => {
  it("60% accuracy at center produces near-zero drift signal", () => {
    // Simulates struggling-older: 60% correct at center level
    let dist = buildDefaultDistribution(2012); // standard center, age 14
    const initial = { ...dist };

    // 30 problems per session, 60% accuracy (interleaved)
    dist = simulateSession(dist, dist.centerLevel, 0.6, 30);

    // At 60% accuracy with asymmetric signal rates (success=0.05, failure=0.08):
    // Net raw signal ≈ 0.05*0.6 - 0.08*0.4 = -0.002 per problem
    // EMA should hover near zero (below threshold most of the time)
    // Minimal weight change expected
    expect(Math.abs(dist.driftSignal)).toBeLessThan(0.04);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });

  it("90% accuracy at center produces strong upward drift", () => {
    let dist = buildDefaultDistribution(2016); // intermediate center
    const initial = { ...dist };

    // 30 problems, 90% accuracy
    dist = simulateSession(dist, dist.centerLevel, 0.9, 30);

    // Strong upward signal → standard weight should increase
    expect(dist.standard).toBeGreaterThan(initial.standard);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });

  it("EMA prevents direction reversal on single problem outcome", () => {
    let dist = buildDefaultDistribution(2012); // standard center
    // Build up a positive signal with 5 successes
    for (let i = 0; i < 5; i++) {
      dist = nudgeDistribution(dist, "standard", true);
    }
    const signalBeforeFailure = dist.driftSignal;
    expect(signalBeforeFailure).toBeGreaterThan(0);

    // Single failure should reduce signal but not reverse to strongly negative
    dist = nudgeDistribution(dist, "standard", false);
    // Signal should still be positive or only marginally negative
    // (alpha=0.3 means: new = 0.3 * -0.08 + 0.7 * prev)
    expect(dist.driftSignal).toBeGreaterThan(-DRIFT_RATES.failureAtCenter);
  });
});

describe("drift convergence across sessions", () => {
  it("high-ability student drifts UP within 10 sessions", () => {
    // Simulates strong-young: age 6 (primary center), 90% accuracy
    let dist = buildDefaultDistribution(2020); // primary center
    expect(dist.centerLevel).toBe("primary");

    // 10 sessions × 30 problems at 90% accuracy
    for (let session = 0; session < 10; session++) {
      dist = simulateSession(dist, dist.centerLevel, 0.9, 30);
    }

    // Should have drifted upward from primary
    expect(dist.intermediate).toBeGreaterThan(0.3);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });

  it("low-ability student drifts DOWN within 15 sessions", () => {
    // Simulates struggling-older: age 13 (standard center), 40% accuracy
    let dist = buildDefaultDistribution(2013); // standard center
    expect(dist.centerLevel).toBe("standard");

    // 15 sessions × 30 problems at 40% accuracy (genuine struggle)
    for (let session = 0; session < 15; session++) {
      dist = simulateSession(dist, dist.centerLevel, 0.4, 30);
    }

    // Center should have shifted down from standard
    // (at 40% accuracy, student clearly struggles at this level)
    expect(dist.centerLevel).not.toBe("standard");
    expect(["primary", "intermediate"]).toContain(dist.centerLevel);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });

  it("drift rate is fast enough to shift center within 10 sessions at 90% accuracy", () => {
    let dist = buildDefaultDistribution(2016); // intermediate center
    expect(dist.centerLevel).toBe("intermediate");

    for (let session = 0; session < 10; session++) {
      dist = simulateSession(dist, dist.centerLevel, 0.9, 30);
    }

    // Center should have shifted to standard
    expect(["standard", "advanced"]).toContain(dist.centerLevel);
    expect(sumWeights(dist)).toBeCloseTo(1.0, 10);
  });

  it("hysteresis prevents oscillation at extreme accuracy (40% vs 90%)", () => {
    const LEVEL_ORDER = ["primary", "intermediate", "standard", "advanced"];

    // High accuracy: monotonic upward drift
    let highDist = buildDefaultDistribution(2016); // intermediate center
    const highCenters: string[] = [highDist.centerLevel];
    for (let session = 0; session < 10; session++) {
      highDist = simulateSession(highDist, highDist.centerLevel, 0.9, 30);
      highCenters.push(highDist.centerLevel);
    }
    let highReversals = 0;
    let highLastDir = 0;
    for (let i = 1; i < highCenters.length; i++) {
      const diff = LEVEL_ORDER.indexOf(highCenters[i]) - LEVEL_ORDER.indexOf(highCenters[i - 1]);
      if (diff !== 0) {
        if (highLastDir !== 0 && Math.sign(diff) !== Math.sign(highLastDir)) highReversals++;
        highLastDir = diff;
      }
    }
    expect(highReversals).toBe(0); // 90% accuracy: purely monotonic upward

    // Low accuracy: monotonic downward drift
    let lowDist = buildDefaultDistribution(2012); // standard center
    const lowCenters: string[] = [lowDist.centerLevel];
    for (let session = 0; session < 10; session++) {
      lowDist = simulateSession(lowDist, lowDist.centerLevel, 0.4, 30);
      lowCenters.push(lowDist.centerLevel);
    }
    let lowReversals = 0;
    let lowLastDir = 0;
    for (let i = 1; i < lowCenters.length; i++) {
      const diff = LEVEL_ORDER.indexOf(lowCenters[i]) - LEVEL_ORDER.indexOf(lowCenters[i - 1]);
      if (diff !== 0) {
        if (lowLastDir !== 0 && Math.sign(diff) !== Math.sign(lowLastDir)) lowReversals++;
        lowLastDir = diff;
      }
    }
    expect(lowReversals).toBe(0); // 40% accuracy: purely monotonic downward

    expect(sumWeights(highDist)).toBeCloseTo(1.0, 10);
    expect(sumWeights(lowDist)).toBeCloseTo(1.0, 10);
  });
});

describe("applyNudge (integration)", () => {
  const db = getTestDb();
  const content = createContentService(db, getTestR2Bucket());

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  it("nudges stored distribution and persists", async () => {
    const user = await seedUser({ birthYear: 2012 });
    const discipline = await seedDiscipline();
    await seedUserDisciplinePresentation(
      user.id,
      discipline.id,
      { primary: 0.10, intermediate: 0.15, standard: 0.65, advanced: 0.10 },
      "standard"
    );

    // Multiple nudges to build signal above threshold
    for (let i = 0; i < 5; i++) {
      await content.applyNudge(user.id, discipline.id, "standard", true);
    }

    const updated = await content.getDisciplineDistribution(user.id, discipline.id);
    expect(updated).not.toBeNull();
    expect(updated!.advanced).toBeGreaterThan(0.10);
    expect(updated!.standard).toBeLessThan(0.65);
    expect(
      updated!.primary + updated!.intermediate + updated!.standard + updated!.advanced
    ).toBeCloseTo(1.0, 10);
  });

  it("persists driftSignal across nudges", async () => {
    const user = await seedUser({ birthYear: 2012 });
    const discipline = await seedDiscipline();
    await seedUserDisciplinePresentation(
      user.id,
      discipline.id,
      { primary: 0.10, intermediate: 0.15, standard: 0.65, advanced: 0.10 },
      "standard"
    );

    await content.applyNudge(user.id, discipline.id, "standard", true);

    const updated = await content.getDisciplineDistribution(user.id, discipline.id);
    expect(updated).not.toBeNull();
    expect(updated!.driftSignal).toBeGreaterThan(0);
  });

  it("does nothing when no distribution exists", async () => {
    const user = await seedUser({});
    const discipline = await seedDiscipline();

    await content.applyNudge(user.id, discipline.id, "standard", true);

    const dist = await content.getDisciplineDistribution(user.id, discipline.id);
    expect(dist).toBeNull();
  });

  it("logs drift when center shifts", async () => {
    const user = await seedUser({ birthYear: 2016 });
    const discipline = await seedDiscipline();
    // Standard already exceeds hysteresis threshold (0.60 > 0.40) and exceeds intermediate (0.15) by > margin
    await seedUserDisciplinePresentation(
      user.id,
      discipline.id,
      { primary: 0, intermediate: 0.15, standard: 0.60, advanced: 0.25 },
      "intermediate"
    );

    // Build strong upward signal to trigger center shift
    for (let i = 0; i < 5; i++) {
      await content.applyNudge(user.id, discipline.id, "standard", true);
    }

    const updated = await content.getDisciplineDistribution(user.id, discipline.id);
    expect(updated!.centerLevel).toBe("standard");

    // Check drift log was created
    const logs = await db
      .select()
      .from(schema.presentationDriftLog)
      .where(
        and(
          eq(schema.presentationDriftLog.userId, user.id),
          eq(schema.presentationDriftLog.disciplineId, discipline.id),
        )
      );
    expect(logs.length).toBeGreaterThan(0);
    const centerShift = logs.find((l) => l.trigger === "center_shift");
    expect(centerShift).toBeDefined();
    expect(centerShift!.fromCenter).toBe("intermediate");
    expect(centerShift!.toCenter).toBe("standard");
  });
});
