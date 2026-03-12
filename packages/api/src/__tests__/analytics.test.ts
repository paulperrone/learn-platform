import { describe, it, expect, vi } from "vitest";
import { createAnalyticsService } from "../services/analytics.js";
import type { ProblemAttemptEvent, ExampleViewEvent } from "../services/analytics.js";

describe("Analytics Service", () => {
  const baseProblemEvent: ProblemAttemptEvent = {
    userId: "user-1",
    topicId: "add-within-20",
    problemId: "add-within-20-p1",
    contentVersion: "sha256:abc123",
    phase: "independent",
    difficulty: "medium",
    cognitiveDemand: "procedural",
    presentation: "standard",
    contentDepth: "survey",
    disciplineId: "math",
    blendRole: "main",
    difficultyBias: "on-target",
    correct: true,
    responseMs: 5000,
    hintsUsed: 0,
    confidence: 4,
    rating: 3,
    misconception: false,
  };

  const baseExampleEvent: ExampleViewEvent = {
    userId: "user-1",
    topicId: "add-within-20",
    exampleId: "add-within-20-ex1",
    contentVersion: "sha256:abc123",
    presentation: "standard",
    contentDepth: "survey",
    stepsViewed: 3,
    totalSteps: 4,
    totalTimeMs: 30000,
    fadingLevel: 1,
    selfExplanationQuality: 2,
  };

  it("writes problem attempt data point with correct shape", () => {
    const writeDataPoint = vi.fn();
    const ae = { writeDataPoint } as unknown as AnalyticsEngineDataset;
    const analytics = createAnalyticsService(ae);

    analytics.recordProblemAttempt(baseProblemEvent);

    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];

    // 12 blob dimensions
    expect(call.blobs).toHaveLength(12);
    expect(call.blobs[0]).toBe("user-1");
    expect(call.blobs[1]).toBe("add-within-20");
    expect(call.blobs[2]).toBe("add-within-20-p1");
    expect(call.blobs[3]).toBe("sha256:abc123");
    expect(call.blobs[4]).toBe("independent");
    expect(call.blobs[5]).toBe("medium");
    expect(call.blobs[6]).toBe("procedural");
    expect(call.blobs[7]).toBe("standard");
    expect(call.blobs[8]).toBe("survey");
    expect(call.blobs[9]).toBe("math");
    expect(call.blobs[10]).toBe("main");
    expect(call.blobs[11]).toBe("on-target");

    // 6 double measures
    expect(call.doubles).toHaveLength(6);
    expect(call.doubles[0]).toBe(1); // correct
    expect(call.doubles[1]).toBe(5000); // responseMs
    expect(call.doubles[2]).toBe(0); // hintsUsed
    expect(call.doubles[3]).toBe(4); // confidence
    expect(call.doubles[4]).toBe(3); // rating
    expect(call.doubles[5]).toBe(0); // misconception

    // Index on topicId
    expect(call.indexes).toEqual(["add-within-20"]);
  });

  it("writes example view data point with correct shape", () => {
    const writeDataPoint = vi.fn();
    const ae = { writeDataPoint } as unknown as AnalyticsEngineDataset;
    const analytics = createAnalyticsService(ae);

    analytics.recordExampleView(baseExampleEvent);

    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];

    // 7 blob dimensions
    expect(call.blobs).toHaveLength(7);
    expect(call.blobs[0]).toBe("user-1");
    expect(call.blobs[1]).toBe("add-within-20");
    expect(call.blobs[2]).toBe("add-within-20-ex1");
    expect(call.blobs[6]).toBe("example-view"); // event type discriminator

    // 5 double measures
    expect(call.doubles).toHaveLength(5);
    expect(call.doubles[0]).toBe(3); // stepsViewed
    expect(call.doubles[1]).toBe(4); // totalSteps
    expect(call.doubles[2]).toBe(30000); // totalTimeMs
    expect(call.doubles[3]).toBe(1); // fadingLevel
    expect(call.doubles[4]).toBe(2); // selfExplanationQuality

    expect(call.indexes).toEqual(["add-within-20"]);
  });

  it("handles null content version gracefully", () => {
    const writeDataPoint = vi.fn();
    const ae = { writeDataPoint } as unknown as AnalyticsEngineDataset;
    const analytics = createAnalyticsService(ae);

    analytics.recordProblemAttempt({ ...baseProblemEvent, contentVersion: null });

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[3]).toBe(""); // null → empty string
  });

  it("records misconception flag correctly", () => {
    const writeDataPoint = vi.fn();
    const ae = { writeDataPoint } as unknown as AnalyticsEngineDataset;
    const analytics = createAnalyticsService(ae);

    analytics.recordProblemAttempt({
      ...baseProblemEvent,
      correct: false,
      misconception: true,
      rating: 1,
    });

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.doubles[0]).toBe(0); // incorrect
    expect(call.doubles[5]).toBe(1); // misconception
  });

  it("gracefully degrades when AE binding is null", () => {
    const analytics = createAnalyticsService(null);

    // Should not throw
    expect(() => analytics.recordProblemAttempt(baseProblemEvent)).not.toThrow();
    expect(() => analytics.recordExampleView(baseExampleEvent)).not.toThrow();
  });

  it("gracefully degrades when AE binding is undefined", () => {
    const analytics = createAnalyticsService(undefined);

    expect(() => analytics.recordProblemAttempt(baseProblemEvent)).not.toThrow();
    expect(() => analytics.recordExampleView(baseExampleEvent)).not.toThrow();
  });
});
