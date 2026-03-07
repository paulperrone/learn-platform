import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedUserSubjectPresentation,
  request,
  json,
} from "./helpers.js";
import { describePresentationDistribution } from "../services/content.js";

describe("GET /api/progress/:userId/presentation", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  it("returns stored distribution for user with presentation data", async () => {
    const user = await seedUser({ birthYear: 2016 });
    const subject = await seedSubject({ id: "math-foundations", name: "Math Foundations" });
    await seedUserSubjectPresentation(user.id, subject.id, {
      primary: 0.1,
      intermediate: 0.75,
      standard: 0.15,
      advanced: 0,
    }, "intermediate");

    const res = await request(`/api/progress/${user.id}/presentation`);
    expect(res.status).toBe(200);
    const body = await json<any>(res);

    const mathDist = body.distributions.find((d: any) => d.subjectId === "math-foundations");
    expect(mathDist).toBeDefined();
    expect(mathDist.centerLevel).toBe("intermediate");
    expect(mathDist.weights.primary).toBe(0.1);
    expect(mathDist.weights.intermediate).toBe(0.75);
    expect(mathDist.weights.standard).toBe(0.15);
    expect(mathDist.weights.advanced).toBe(0);
    expect(mathDist.label).toBeTruthy();
    expect(mathDist.lastAdjustedAt).toBeTruthy();
  });

  it("returns age-default distribution for user without stored data", async () => {
    const user = await seedUser({ birthYear: 2020 }); // age ~6 → primary
    await seedSubject({ id: "test-subject", name: "Test Subject" });

    const res = await request(`/api/progress/${user.id}/presentation`);
    expect(res.status).toBe(200);
    const body = await json<any>(res);

    const dist = body.distributions.find((d: any) => d.subjectId === "test-subject");
    expect(dist).toBeDefined();
    expect(dist.centerLevel).toBe("primary");
    expect(dist.weights.primary).toBeGreaterThan(0.5);
    expect(dist.lastAdjustedAt).toBeNull();
  });

  it("returns 404 for unknown user", async () => {
    const res = await request("/api/progress/nonexistent/presentation");
    expect(res.status).toBe(404);
  });
});

describe("describePresentationDistribution", () => {
  it("describes a single-level distribution", () => {
    const label = describePresentationDistribution("standard", {
      primary: 0, intermediate: 0.04, standard: 0.96, advanced: 0,
    });
    expect(label).toBe("Mostly standard");
  });

  it("describes stretching upward", () => {
    const label = describePresentationDistribution("intermediate", {
      primary: 0.1, intermediate: 0.7, standard: 0.2, advanced: 0,
    });
    expect(label).toBe("Mostly intermediate, stretching into standard");
  });

  it("describes reinforcing downward", () => {
    const label = describePresentationDistribution("standard", {
      primary: 0, intermediate: 0.2, standard: 0.7, advanced: 0.1,
    });
    expect(label).toBe("Mostly standard, reinforcing intermediate");
  });
});
