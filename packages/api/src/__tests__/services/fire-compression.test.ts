import { describe, it, expect, beforeAll } from "vitest";
import { Rating, State } from "ts-fsrs";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedEncompassing,
  seedUserTopicState,
} from "../helpers.js";
import { createSRSService, FIRE_ENABLED } from "../../services/srs.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

/**
 * Seed a topic state that is due for review (overdue) with meaningful FSRS state.
 * Uses reps=3, stability=5, state=Review so FIRe credit logic engages.
 */
async function seedDueState(
  userId: string,
  topicId: string,
  overdueMinutes = 60
) {
  return seedUserTopicState(userId, topicId, {
    due: new Date(Date.now() - overdueMinutes * 60 * 1000).toISOString(),
    mastered: false,
    reps: 3,
    stability: 5,
    difficulty: 5,
    state: State.Review,
    lastReview: new Date(
      Date.now() - 4 * 24 * 60 * 60 * 1000
    ).toISOString(),
  });
}

/**
 * Seed a topic state that is NOT yet due (due in the future) but fairly forgotten.
 * Low stability + old lastReview → low retrievability → FIRe credit is meaningful.
 * R = (1 + t/(9*s))^-1 ≈ 0.39 with stability=1, lastReview=14d ago → discount factor ~0.61.
 */
async function seedFutureState(
  userId: string,
  topicId: string,
  dueInDays = 3
) {
  return seedUserTopicState(userId, topicId, {
    due: new Date(
      Date.now() + dueInDays * 24 * 60 * 60 * 1000
    ).toISOString(),
    mastered: false,
    reps: 3,
    stability: 1,
    difficulty: 5,
    state: State.Review,
    lastReview: new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Test 1: Enriched encompassings improve compression ratio
// ---------------------------------------------------------------------------
describe.skipIf(!FIRE_ENABLED)("FIRe compression with enriched graph", () => {
  it("enriched graph (133 edges) compresses better than sparse graph (42 edges)", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "fire-enrich-1" });
    const disc = await seedDiscipline({ id: "fire-enrich-subj" });

    // Simulate a realistic strand: addition progression (within-strand)
    // plus cross-strand word-problem links
    const topics = {
      addW5: await seedTopic(disc.id, { id: "fe-add-5" }),
      addW10: await seedTopic(disc.id, { id: "fe-add-10" }),
      addW20: await seedTopic(disc.id, { id: "fe-add-20" }),
      addW100: await seedTopic(disc.id, { id: "fe-add-100" }),
      addFluent: await seedTopic(disc.id, { id: "fe-add-fluent" }),
      subW10: await seedTopic(disc.id, { id: "fe-sub-10" }),
      subW20: await seedTopic(disc.id, { id: "fe-sub-20" }),
      subW100: await seedTopic(disc.id, { id: "fe-sub-100" }),
      subFluent: await seedTopic(disc.id, { id: "fe-sub-fluent" }),
      mulW100: await seedTopic(disc.id, { id: "fe-mul-100" }),
      divW100: await seedTopic(disc.id, { id: "fe-div-100" }),
      orderOps: await seedTopic(disc.id, { id: "fe-order-ops" }),
      wordAdd: await seedTopic(disc.id, { id: "fe-word-add" }),
      wordSub: await seedTopic(disc.id, { id: "fe-word-sub" }),
      wordMulti: await seedTopic(disc.id, { id: "fe-word-multi" }),
      multiStep: await seedTopic(disc.id, { id: "fe-multi-step" }),
      skipCount: await seedTopic(disc.id, { id: "fe-skip-count" }),
      placeVal: await seedTopic(disc.id, { id: "fe-place-val" }),
      placeHun: await seedTopic(disc.id, { id: "fe-place-hun" }),
      fractions: await seedTopic(disc.id, { id: "fe-fractions" }),
    };

    // All 20 topics are due for review
    for (const t of Object.values(topics)) {
      await seedDueState(user.id, t.id, 60);
    }

    // --- Sparse graph: only direct within-strand edges (mimics original 42) ---
    // Addition chain
    await seedEncompassing(topics.addW10.id, topics.addW5.id, 0.8);
    await seedEncompassing(topics.addW20.id, topics.addW10.id, 0.8);
    await seedEncompassing(topics.addW100.id, topics.addW20.id, 0.7);
    // Subtraction chain
    await seedEncompassing(topics.subW20.id, topics.subW10.id, 0.8);
    await seedEncompassing(topics.subW100.id, topics.subW20.id, 0.7);
    // Multiplication → skip counting
    await seedEncompassing(topics.mulW100.id, topics.skipCount.id, 0.5);

    const srs = createSRSService(db);
    const dueTopics = await srs.getDueTopics(user.id);
    const sparseResult = await srs.compressReviews(dueTopics, 8, new Set());

    const sparseSelectedIds = new Set(
      sparseResult.selected.map((s) => s.topicId)
    );
    const sparseCovered = sparseResult.coveredCount;

    // --- Now add enriched edges (cross-strand, transitive chains) ---
    // Within-strand transitive: addFluent encompasses full chain
    await seedEncompassing(topics.addFluent.id, topics.addW100.id, 0.8);
    await seedEncompassing(topics.subFluent.id, topics.subW100.id, 0.8);
    // Order-of-operations encompasses all four basic ops
    await seedEncompassing(topics.orderOps.id, topics.addFluent.id, 0.4);
    await seedEncompassing(topics.orderOps.id, topics.subFluent.id, 0.4);
    await seedEncompassing(topics.orderOps.id, topics.mulW100.id, 0.4);
    await seedEncompassing(topics.orderOps.id, topics.divW100.id, 0.4);
    // Word problems → computation (cross-strand)
    await seedEncompassing(topics.wordAdd.id, topics.addFluent.id, 0.5);
    await seedEncompassing(topics.wordSub.id, topics.subFluent.id, 0.5);
    await seedEncompassing(topics.wordMulti.id, topics.mulW100.id, 0.5);
    // Multi-step word problems → multiple strands
    await seedEncompassing(topics.multiStep.id, topics.addFluent.id, 0.3);
    await seedEncompassing(topics.multiStep.id, topics.subFluent.id, 0.3);
    await seedEncompassing(topics.multiStep.id, topics.mulW100.id, 0.3);
    await seedEncompassing(topics.multiStep.id, topics.divW100.id, 0.3);
    // Place value → counting
    await seedEncompassing(topics.placeHun.id, topics.placeVal.id, 0.7);
    // Fractions → multiplication
    await seedEncompassing(topics.fractions.id, topics.mulW100.id, 0.4);

    const enrichedResult = await srs.compressReviews(dueTopics, 8, new Set());
    const enrichedCovered = enrichedResult.coveredCount;

    // Enriched graph should cover MORE topics with the same budget of 8
    expect(enrichedCovered).toBeGreaterThan(sparseCovered);
    // With dense encompassings, 8 reviews should cover most of 20 topics
    expect(enrichedCovered).toBeGreaterThanOrEqual(14);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Multi-hop credit flow with diminishing weights
// ---------------------------------------------------------------------------
describe.skipIf(!FIRE_ENABLED)("FIRe multi-hop credit flow", () => {
  it("credit flows 3 hops deep with diminishing weight", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "fire-hop-1" });
    const disc = await seedDiscipline({ id: "fire-hop-subj" });

    // Chain: orderOps → mulDigit → mul100 → skipCount (3 hops)
    const orderOps = await seedTopic(disc.id, { id: "fh-order-ops" });
    const mulDigit = await seedTopic(disc.id, { id: "fh-mul-digit" });
    const mul100 = await seedTopic(disc.id, { id: "fh-mul-100" });
    const skipCount = await seedTopic(disc.id, { id: "fh-skip-count" });

    await seedEncompassing(orderOps.id, mulDigit.id, 0.4);
    await seedEncompassing(mulDigit.id, mul100.id, 0.6);
    await seedEncompassing(mul100.id, skipCount.id, 0.4);

    // All children have future due dates (so credit can pull them earlier)
    await seedFutureState(user.id, mulDigit.id, 5);
    await seedFutureState(user.id, mul100.id, 5);
    await seedFutureState(user.id, skipCount.id, 5);

    // Record original due dates
    const statesBefore = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));
    const dueBefore = new Map(statesBefore.map((s) => [s.topicId, s.due]));

    const srs = createSRSService(db);
    const credits = await srs.applyFIReCredit(
      user.id,
      orderOps.id,
      Rating.Good
    );

    // Should credit all 3 hops
    const creditMap = new Map(credits.map((c) => [c.topicId, c.weight]));
    expect(creditMap.has(mulDigit.id)).toBe(true);
    expect(creditMap.has(mul100.id)).toBe(true);
    expect(creditMap.has(skipCount.id)).toBe(true);

    // Verify stability increased for all three (virtual FSRS review model)
    const statesAfter = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));
    for (const state of statesAfter) {
      if (state.topicId !== orderOps.id) {
        // Virtual review should increase stability from baseline of 1
        expect(state.stability).toBeGreaterThan(1);
        // lastReview should NOT be updated — FIRe preserves original scheduling anchor
        expect(new Date(state.lastReview!).getTime()).toBeLessThan(
          Date.now() - 13 * 24 * 60 * 60 * 1000 // still the original 14-days-ago value
        );
      }
    }
  });

  it("cumulative weight diminishes through hops (0.4 → 0.24 → 0.096)", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "fire-hop-2" });
    const disc = await seedDiscipline({ id: "fire-hop-subj-2" });

    // Chain with known weights: A → B (0.4) → C (0.6) → D (0.4)
    const topicA = await seedTopic(disc.id, { id: "fh2-a" });
    const topicB = await seedTopic(disc.id, { id: "fh2-b" });
    const topicC = await seedTopic(disc.id, { id: "fh2-c" });
    const topicD = await seedTopic(disc.id, { id: "fh2-d" });

    await seedEncompassing(topicA.id, topicB.id, 0.4);
    await seedEncompassing(topicB.id, topicC.id, 0.6);
    await seedEncompassing(topicC.id, topicD.id, 0.4);

    // All due far in the future with low retrievability so discount is minimal
    await seedFutureState(user.id, topicB.id, 30);
    await seedFutureState(user.id, topicC.id, 30);
    await seedFutureState(user.id, topicD.id, 30);

    const srs = createSRSService(db);

    // computeFIReCoverage shows raw reachability — use it to verify the
    // multi-hop graph is traversable
    const dueSet = new Set([topicA.id, topicB.id, topicC.id, topicD.id]);
    const coverage = await srs.computeFIReCoverage(dueSet);

    // A should reach B (hop 1), C (hop 2), D (hop 3)
    const aCoverage = coverage.get(topicA.id);
    expect(aCoverage).toBeDefined();
    expect(aCoverage!.has(topicB.id)).toBe(true);
    expect(aCoverage!.has(topicC.id)).toBe(true);
    // D: cumulative weight = 0.4 * 0.6 * 0.4 = 0.096 > 0.05 threshold
    expect(aCoverage!.has(topicD.id)).toBe(true);

    // B should reach C (hop 1), D (hop 2)
    const bCoverage = coverage.get(topicB.id);
    expect(bCoverage).toBeDefined();
    expect(bCoverage!.has(topicC.id)).toBe(true);
    expect(bCoverage!.has(topicD.id)).toBe(true);
  });

  it("prunes paths below 0.05 threshold at hop 3", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "fire-hop-subj-3" });

    // Chain with low weights: A → B (0.3) → C (0.3) → D (0.3)
    // Cumulative to D = 0.3 * 0.3 * 0.3 = 0.027 < 0.05 → should be pruned
    const topicA = await seedTopic(disc.id, { id: "fh3-a" });
    const topicB = await seedTopic(disc.id, { id: "fh3-b" });
    const topicC = await seedTopic(disc.id, { id: "fh3-c" });
    const topicD = await seedTopic(disc.id, { id: "fh3-d" });

    await seedEncompassing(topicA.id, topicB.id, 0.3);
    await seedEncompassing(topicB.id, topicC.id, 0.3);
    await seedEncompassing(topicC.id, topicD.id, 0.3);

    const srs = createSRSService(db);
    const dueSet = new Set([topicA.id, topicB.id, topicC.id, topicD.id]);
    const coverage = await srs.computeFIReCoverage(dueSet);

    const aCoverage = coverage.get(topicA.id);
    // A → B (0.3 > 0.05) ✓
    expect(aCoverage?.has(topicB.id)).toBe(true);
    // A → B → C (0.09 > 0.05) ✓
    expect(aCoverage?.has(topicC.id)).toBe(true);
    // A → B → C → D (0.027 < 0.05) ✗ — pruned
    expect(aCoverage?.has(topicD.id) ?? false).toBe(false);
  });

  it("upward penalty flows from failed child to parents", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "fire-hop-penalty" });
    const disc = await seedDiscipline({ id: "fire-hop-subj-p" });

    // addW10 is encompassed by addW20 (w=0.8) and addW100 (w=0.5 via addW20)
    const addW10 = await seedTopic(disc.id, { id: "fhp-add10" });
    const addW20 = await seedTopic(disc.id, { id: "fhp-add20" });

    // addW20 encompasses addW10
    await seedEncompassing(addW20.id, addW10.id, 0.8);

    // addW20 has a future due date
    await seedFutureState(user.id, addW20.id, 5);

    const dueBefore = (
      await db
        .select()
        .from(schema.userTopicState)
        .where(eq(schema.userTopicState.topicId, addW20.id))
    )[0].due;

    const srs = createSRSService(db);
    // Fail addW10 → penalty should flow UP to addW20
    const penalties = await srs.applyUpwardPenalty(
      user.id,
      addW10.id,
      Rating.Again
    );

    expect(penalties.length).toBe(1);
    expect(penalties[0].topicId).toBe(addW20.id);
    // Penalty weight = 0.8 * 0.5 (penaltyFactor) = 0.4
    expect(penalties[0].weight).toBeCloseTo(0.4, 1);

    // Due date should have moved closer to now
    const dueAfter = (
      await db
        .select()
        .from(schema.userTopicState)
        .where(eq(schema.userTopicState.topicId, addW20.id))
    )[0].due;

    expect(new Date(dueAfter).getTime()).toBeLessThan(
      new Date(dueBefore).getTime()
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: Cross-strand coverage
// ---------------------------------------------------------------------------
describe.skipIf(!FIRE_ENABLED)("FIRe cross-strand coverage", () => {
  it("multi-step word problems cover four computation skills", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "fire-cross-1" });
    const disc = await seedDiscipline({ id: "fire-cross-subj" });

    // Computation topics
    const addFluent = await seedTopic(disc.id, { id: "fc-add-fluent" });
    const subFluent = await seedTopic(disc.id, { id: "fc-sub-fluent" });
    const mul100 = await seedTopic(disc.id, { id: "fc-mul-100" });
    const div100 = await seedTopic(disc.id, { id: "fc-div-100" });

    // Word problem topic encompassing all four
    const multiStep = await seedTopic(disc.id, { id: "fc-multi-step" });

    await seedEncompassing(multiStep.id, addFluent.id, 0.3);
    await seedEncompassing(multiStep.id, subFluent.id, 0.3);
    await seedEncompassing(multiStep.id, mul100.id, 0.3);
    await seedEncompassing(multiStep.id, div100.id, 0.3);

    // All 5 topics due
    await seedDueState(user.id, multiStep.id, 60);
    await seedDueState(user.id, addFluent.id, 30);
    await seedDueState(user.id, subFluent.id, 30);
    await seedDueState(user.id, mul100.id, 30);
    await seedDueState(user.id, div100.id, 30);

    const srs = createSRSService(db);

    // Verify coverage map
    const dueSet = new Set([
      multiStep.id,
      addFluent.id,
      subFluent.id,
      mul100.id,
      div100.id,
    ]);
    const coverage = await srs.computeFIReCoverage(dueSet);
    const msCoverage = coverage.get(multiStep.id);

    expect(msCoverage).toBeDefined();
    expect(msCoverage!.size).toBe(4);
    expect(msCoverage!.has(addFluent.id)).toBe(true);
    expect(msCoverage!.has(subFluent.id)).toBe(true);
    expect(msCoverage!.has(mul100.id)).toBe(true);
    expect(msCoverage!.has(div100.id)).toBe(true);

    // Compression: budget=1 should select multiStep first (score=5: self + 4)
    const dueTopics = await srs.getDueTopics(user.id);
    const { selected, coveredCount } = await srs.compressReviews(
      dueTopics,
      1,
      new Set()
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].topicId).toBe(multiStep.id);
    // One review covers all 5 due topics
    expect(coveredCount).toBe(5);
  });

  it("word-problem reviews cascade through within-strand chains", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "fire-cross-2" });
    const disc = await seedDiscipline({ id: "fire-cross-subj-2" });

    // Within-strand chain: addFluent → add100 → add20 → add10
    const addFluent = await seedTopic(disc.id, { id: "fc2-add-fluent" });
    const add100 = await seedTopic(disc.id, { id: "fc2-add-100" });
    const add20 = await seedTopic(disc.id, { id: "fc2-add-20" });
    const add10 = await seedTopic(disc.id, { id: "fc2-add-10" });

    await seedEncompassing(addFluent.id, add100.id, 0.8);
    await seedEncompassing(add100.id, add20.id, 0.7);
    await seedEncompassing(add20.id, add10.id, 0.8);

    // Cross-strand: wordAdd → addFluent
    const wordAdd = await seedTopic(disc.id, { id: "fc2-word-add" });
    await seedEncompassing(wordAdd.id, addFluent.id, 0.5);

    // All topics due
    const allTopics = [wordAdd, addFluent, add100, add20, add10];
    for (const t of allTopics) {
      await seedDueState(user.id, t.id, 60);
    }

    const srs = createSRSService(db);
    const dueSet = new Set(allTopics.map((t) => t.id));
    const coverage = await srs.computeFIReCoverage(dueSet);

    // wordAdd should reach: addFluent (hop 1), add100 (hop 2), add20 (hop 3)
    // add10 is hop 4 — beyond maxHops=3
    const wordCoverage = coverage.get(wordAdd.id);
    expect(wordCoverage).toBeDefined();
    expect(wordCoverage!.has(addFluent.id)).toBe(true);
    expect(wordCoverage!.has(add100.id)).toBe(true);
    // hop 3: 0.5 * 0.8 * 0.7 = 0.28 > 0.05 ✓
    expect(wordCoverage!.has(add20.id)).toBe(true);

    // addFluent should reach add100, add20, add10
    const fluentCoverage = coverage.get(addFluent.id);
    expect(fluentCoverage).toBeDefined();
    expect(fluentCoverage!.has(add100.id)).toBe(true);
    expect(fluentCoverage!.has(add20.id)).toBe(true);
    // hop 3: 0.8 * 0.7 * 0.8 = 0.448 > 0.05 ✓
    expect(fluentCoverage!.has(add10.id)).toBe(true);

    // Compression: budget=1 with wordAdd should cover up to hop 3
    const dueTopics = await srs.getDueTopics(user.id);
    const { selected, coveredCount } = await srs.compressReviews(
      dueTopics,
      1,
      new Set()
    );

    // wordAdd or addFluent should be picked (highest coverage)
    expect(coveredCount).toBeGreaterThanOrEqual(4);
  });
});
