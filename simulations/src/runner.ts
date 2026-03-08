/**
 * Simulation runner — drives synthetic learners through the real learning engine.
 */
import type { DB } from "../../packages/api/src/db/index.js";
import { createSessionService } from "../../packages/api/src/services/session.js";
import { createDiagnosticService } from "../../packages/api/src/services/diagnostic.js";
import { createSRSService } from "../../packages/api/src/services/srs.js";
import { createSimulationDb, createSimUser } from "./db-setup.js";
import { resolveAnswer } from "./answer-engine.js";
import { EventLogger } from "./event-logger.js";
import { SeededRNG } from "./prng.js";
import type { SimulationConfig, SimulationResult, SimulationEvent, LearnerProfile, DiagnosticRunResult } from "./types.js";
import { join } from "path";
import { eq } from "drizzle-orm";
import { writeFileSync } from "fs";
import * as schema from "../../packages/api/src/db/schema.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Override Date to simulate time advancement.
 * V8's `new Date()` doesn't call `Date.now()`, so we must replace the constructor.
 */
const RealDate = globalThis.Date;
let simulatedNowMs: number | null = null;

/**
 * Override Math.random to use a seeded PRNG for deterministic simulation.
 * The diagnostic service uses Math.random() for topic selection —
 * without this patch, runs aren't reproducible across invocations.
 */
const OrigMathRandom = Math.random;
let seededRandomFn: (() => number) | null = null;

function setSeededRandom(fn: () => number): void {
  seededRandomFn = fn;
  Math.random = function () {
    return seededRandomFn ? seededRandomFn() : OrigMathRandom();
  };
}

function restoreRealRandom(): void {
  seededRandomFn = null;
  Math.random = OrigMathRandom;
}

function setSimulatedTime(timeMs: number): void {
  simulatedNowMs = timeMs;
}

function restoreRealDate(): void {
  simulatedNowMs = null;
}

// Monkey-patch Date constructor once at module load
const OrigDateNow = RealDate.now;
RealDate.now = function () {
  return simulatedNowMs ?? OrigDateNow.call(RealDate);
};

// Replace Date globally with a proxy that intercepts no-arg construction
const OrigDate = globalThis.Date;
globalThis.Date = new Proxy(OrigDate, {
  construct(target, args) {
    if (args.length === 0 && simulatedNowMs != null) {
      return new target(simulatedNowMs);
    }
    return new target(...args);
  },
  apply(target, thisArg, args) {
    // Date() called as function (rare)
    if (args.length === 0 && simulatedNowMs != null) {
      return new target(simulatedNowMs).toString();
    }
    return (target as any)(...args);
  },
  get(target, prop, receiver) {
    if (prop === "now") {
      return function () {
        return simulatedNowMs ?? OrigDateNow.call(target);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as any;

export class SimulationRunner {
  private config: SimulationConfig;
  private rng: SeededRNG;
  private db!: DB;
  private userId!: string;
  private logger!: EventLogger;
  private simulatedTimeMs!: number;
  private topicGradeLevels = new Map<string, number>();

  constructor(config: SimulationConfig) {
    this.config = config;
    this.rng = new SeededRNG(config.seed);
  }

  async run(): Promise<SimulationResult> {
    const runsDir = join(process.cwd(), "simulations", "runs");
    this.logger = new EventLogger(this.config.profile.id, runsDir);

    // Patch Math.random with a separate seeded PRNG for deterministic
    // diagnostic topic selection (doesn't share state with answer engine's PRNG)
    const mathRandomRng = new SeededRNG(this.config.seed + 1000000);
    setSeededRandom(() => mathRandomRng.next());

    console.log(`[sim] Setting up DB for ${this.config.subject}...`);
    this.db = createSimulationDb(this.config.subject);

    // Create simulated user
    this.userId = `sim-${this.config.profile.id}-${this.config.seed}`;
    createSimUser(this.db, this.userId, this.config.profile.name, this.config.profile.age);

    // Cache topic grade levels for the answer engine
    const topics = await this.db.select().from(schema.topics);
    for (const t of topics) {
      this.topicGradeLevels.set(t.id, t.gradeLevel);
    }

    // Start simulated time at a fixed point
    this.simulatedTimeMs = new Date("2026-01-15T08:00:00Z").getTime();

    console.log(`[sim] Running diagnostic for ${this.config.profile.id}...`);
    const diagnosticQuestions = await this.runDiagnostic();
    console.log(`[sim] Diagnostic complete: ${diagnosticQuestions} questions asked`);

    // Fix diagnostic materialization: mastered topics get state=Review but stability=0,
    // which causes FSRS to produce NaN on next scheduling. Set reasonable defaults.
    await this.sanitizePostDiagnosticState();

    let sessionsCompleted = 0;
    for (let i = 0; i < this.config.sessionCount; i++) {
      // Advance time between sessions
      this.simulatedTimeMs += this.config.sessionIntervalMs ?? ONE_DAY_MS;

      console.log(`[sim] Session ${i + 1}/${this.config.sessionCount} for ${this.config.profile.id}...`);
      try {
        await this.runLearningSession(i + 1);
        sessionsCompleted++;
      } catch (err) {
        console.error(`[sim] Session ${i + 1} error:`, (err as Error).message);
        console.error((err as Error).stack?.split("\n").slice(0, 8).join("\n"));
        // Log error event and continue
        this.logger.log({
          sessionNumber: i + 1,
          phase: "error",
          topicId: null,
          problemId: null,
          difficulty: null,
          cognitiveDemand: null,
          presentation: null,
          contentDepth: null,
          correct: null,
          confidence: null,
          hintsUsed: null,
          rating: null,
          stabilityBefore: null,
          stabilityAfter: null,
          difficultyBefore: null,
          difficultyAfter: null,
          masteredBefore: null,
          masteredAfter: null,
          frontierBefore: null,
          frontierAfter: null,
          rollingAccuracy: null,
          presentationWeights: null,
          remediationTarget: null,
          fireCreditApplied: null,
          fadingLevel: null,
          interleaveStrand: null,
        });
      }
    }

    // Restore real Date and Math.random
    restoreRealDate();
    restoreRealRandom();

    // Write summary
    this.logger.writeSummary({
      profileId: this.config.profile.id,
      subject: this.config.subject,
      seed: this.config.seed,
      sessionsCompleted,
      diagnosticQuestionsAsked: diagnosticQuestions,
      totalEvents: this.logger.getTick(),
    });

    const result: SimulationResult = {
      profileId: this.config.profile.id,
      subject: this.config.subject,
      sessionsCompleted,
      diagnosticQuestionsAsked: diagnosticQuestions,
      totalEvents: this.logger.getTick(),
      runDir: this.logger.getRunDir(),
    };

    console.log(`[sim] Complete: ${sessionsCompleted} sessions, ${this.logger.getTick()} events`);
    console.log(`[sim] Output: ${this.logger.getRunDir()}`);

    return result;
  }

  private diagnosticResult: DiagnosticRunResult | null = null;

  /** Access the diagnostic result after run() completes */
  getDiagnosticResult(): DiagnosticRunResult | null {
    return this.diagnosticResult;
  }

  private async runDiagnostic(): Promise<number> {
    setSimulatedTime(this.simulatedTimeMs);

    const diagnostic = createDiagnosticService(this.db);
    const startResult = await diagnostic.startDiagnostic({
      userId: this.userId,
      subjectId: this.getSubjectId(),
    });

    if ("error" in startResult) {
      console.error(`[sim] Diagnostic start error: ${startResult.error}`);
      return 0;
    }

    let sessionId = startResult.sessionId;
    let currentQuestion = startResult.question;
    let questionsAsked = 0;
    let questionsCorrect = 0;
    const questionTrace: DiagnosticRunResult["questionTrace"] = [];

    while (currentQuestion) {
      questionsAsked++;
      const topicId = currentQuestion.topicId;
      const problem = currentQuestion.problem;
      const gradeLevel = this.topicGradeLevels.get(topicId) ?? 0;

      // Resolve simulated answer
      const answer = resolveAnswer(
        this.rng,
        this.config.profile,
        { id: topicId, gradeLevel },
        problem.difficulty ?? "medium",
        (problem as any).cognitiveDemand ?? null,
        "diagnostic",
        0
      );

      if (answer.correct) questionsCorrect++;

      // Respond with the correct answer text if we decided to be correct,
      // otherwise respond with a wrong answer
      const answerText = answer.correct ? problem.answer : "__wrong__";

      // Log diagnostic event
      this.logger.log({
        sessionNumber: 0,
        phase: "diagnostic",
        topicId,
        problemId: problem.id,
        difficulty: problem.difficulty ?? null,
        cognitiveDemand: (problem as any).cognitiveDemand ?? null,
        presentation: null,
        contentDepth: null,
        correct: answer.correct,
        confidence: answer.confidence,
        hintsUsed: 0,
        rating: null,
        stabilityBefore: null,
        stabilityAfter: null,
        difficultyBefore: null,
        difficultyAfter: null,
        masteredBefore: null,
        masteredAfter: null,
        frontierBefore: null,
        frontierAfter: null,
        rollingAccuracy: null,
        presentationWeights: null,
        remediationTarget: null,
        fireCreditApplied: null,
        fadingLevel: null,
        interleaveStrand: null,
      });

      const response = await diagnostic.respond(sessionId, answerText);

      // Read diagnostic state from DB to capture search bounds after each question
      const diagRow = await this.db.query.diagnosticSessions.findFirst({
        where: eq(schema.diagnosticSessions.id, sessionId),
      });
      if (diagRow?.stateJson) {
        const state = JSON.parse(diagRow.stateJson);
        questionTrace.push({
          questionNumber: questionsAsked,
          topicId,
          gradeLevel,
          correct: answer.correct,
          searchLowAfter: state.searchLow,
          searchHighAfter: state.searchHigh,
          phaseAfter: state.phase,
        });
      }

      if ("error" in response) {
        console.error(`[sim] Diagnostic respond error: ${response.error}`);
        break;
      }

      if (response.done) {
        break;
      }

      currentQuestion = response.question;
    }

    // Extract final diagnostic state and save diagnostic-result.json
    await this.saveDiagnosticResult(sessionId, questionsAsked, questionsCorrect, questionTrace);

    return questionsAsked;
  }

  /** Extract and save diagnostic result data from the completed diagnostic session */
  private async saveDiagnosticResult(
    sessionId: string,
    questionsAsked: number,
    questionsCorrect: number,
    questionTrace: DiagnosticRunResult["questionTrace"]
  ): Promise<void> {
    const diagRow = await this.db.query.diagnosticSessions.findFirst({
      where: eq(schema.diagnosticSessions.id, sessionId),
    });
    if (!diagRow?.stateJson) return;

    const state = JSON.parse(diagRow.stateJson);
    const estimates: Record<string, number> = state.topicEstimates ?? {};
    const frontier: string[] = diagRow.estimatedFrontierJson
      ? JSON.parse(diagRow.estimatedFrontierJson)
      : [];

    // Get mastered topic IDs from materialized state
    const allState = await this.db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, this.userId));
    const masteredTopicIds = allState
      .filter((r) => r.mastered)
      .map((r) => r.topicId);

    // Get presentation distribution
    const presRows = await this.db
      .select()
      .from(schema.userSubjectPresentation)
      .where(eq(schema.userSubjectPresentation.userId, this.userId));
    const presRow = presRows[0] ?? null;

    const presentationDistribution = presRow
      ? {
          centerLevel: presRow.centerLevel,
          primary: presRow.primaryWeight,
          intermediate: presRow.intermediateWeight,
          standard: presRow.standardWeight,
          advanced: presRow.advancedWeight,
        }
      : null;

    this.diagnosticResult = {
      profileId: this.config.profile.id,
      questionsAsked,
      questionsCorrect,
      searchLow: state.searchLow,
      searchHigh: state.searchHigh,
      phase: state.phase,
      topicEstimates: estimates,
      estimatedFrontier: frontier,
      masteredTopicIds,
      presentationDistribution,
      questionTrace,
    };

    // Write to file alongside events.jsonl
    writeFileSync(
      join(this.logger.getRunDir(), "diagnostic-result.json"),
      JSON.stringify(this.diagnosticResult, null, 2) + "\n"
    );
  }

  private async runLearningSession(sessionNumber: number): Promise<void> {
    setSimulatedTime(this.simulatedTimeMs);

    const sessionSvc = createSessionService(this.db);

    const { sessionId, firstItem } = await sessionSvc.startSession(this.userId);

    if (firstItem.type === "complete") {
      console.log(`[sim]   Session ${sessionNumber}: ${firstItem.message}`);
      this.logger.log({
        sessionNumber,
        phase: "complete",
        topicId: null,
        problemId: null,
        difficulty: null,
        cognitiveDemand: null,
        presentation: null,
        contentDepth: null,
        correct: null,
        confidence: null,
        hintsUsed: null,
        rating: null,
        stabilityBefore: null,
        stabilityAfter: null,
        difficultyBefore: null,
        difficultyAfter: null,
        masteredBefore: null,
        masteredAfter: null,
        frontierBefore: null,
        frontierAfter: null,
        rollingAccuracy: null,
        presentationWeights: null,
        remediationTarget: null,
        fireCreditApplied: null,
        fadingLevel: null,
        interleaveStrand: null,
      });
      return;
    }

    let currentItem = firstItem;
    let interactions = 0;
    const MAX_INTERACTIONS = 100; // Safety limit

    while (currentItem.type !== "complete" && currentItem.type !== "error" && interactions < MAX_INTERACTIONS) {
      interactions++;

      if (currentItem.type === "instruction") {
        // Worked example — just acknowledge it, no answer needed
        this.logger.log({
          sessionNumber,
          phase: currentItem.phase,
          topicId: currentItem.topicId,
          problemId: null,
          difficulty: null,
          cognitiveDemand: null,
          presentation: currentItem.presentationLevel ?? null,
          contentDepth: null,
          correct: null,
          confidence: null,
          hintsUsed: null,
          rating: null,
          stabilityBefore: null,
          stabilityAfter: null,
          difficultyBefore: null,
          difficultyAfter: null,
          masteredBefore: null,
          masteredAfter: null,
          frontierBefore: null,
          frontierAfter: null,
          rollingAccuracy: null,
          presentationWeights: null,
          remediationTarget: null,
          fireCreditApplied: null,
          fadingLevel: (currentItem as any).fadingLevel ?? null,
          interleaveStrand: null,
        });

        // Respond to instruction phase — pass through with acknowledgment
        currentItem = await sessionSvc.respond(sessionId, {
          correct: true,
          responseMs: 5000,
          selfExplanation: "I understand the worked example.",
        });
        continue;
      }

      // Problem or remediation — resolve answer
      const problem = (currentItem as any).problem;
      if (!problem) {
        // Unexpected item type, try to advance
        currentItem = await sessionSvc.respond(sessionId, {
          correct: true,
          responseMs: 3000,
        });
        continue;
      }

      const topicId = (currentItem as any).topicId;
      const gradeLevel = this.topicGradeLevels.get(topicId) ?? 0;

      // Get pre-response state for logging
      const preState = await this.getTopicState(topicId);

      const answerResult = resolveAnswer(
        this.rng,
        this.config.profile,
        { id: topicId, gradeLevel },
        problem.difficulty ?? "medium",
        problem.cognitiveDemand ?? (currentItem as any).cognitiveDemand ?? null,
        (currentItem as any).phase ?? "independent",
        sessionNumber
      );

      // Submit answer
      const answerText = answerResult.correct ? problem.answer : "__wrong__";
      currentItem = await sessionSvc.respond(sessionId, {
        answer: answerText,
        correct: answerResult.correct,
        confidence: answerResult.confidence,
        responseMs: answerResult.responseMs,
        hintsUsed: answerResult.hintsToRequest,
      });

      // Get post-response state for logging
      const postState = await this.getTopicState(topicId);

      this.logger.log({
        sessionNumber,
        phase: (currentItem as any).phase ?? "unknown",
        topicId,
        problemId: problem.id,
        difficulty: problem.difficulty ?? null,
        cognitiveDemand: problem.cognitiveDemand ?? null,
        presentation: (currentItem as any).presentationLevel ?? null,
        contentDepth: null,
        correct: answerResult.correct,
        confidence: answerResult.confidence,
        hintsUsed: answerResult.hintsToRequest,
        rating: null,
        stabilityBefore: preState?.stability ?? null,
        stabilityAfter: postState?.stability ?? null,
        difficultyBefore: preState?.difficulty ?? null,
        difficultyAfter: postState?.difficulty ?? null,
        masteredBefore: preState?.mastered ? true : false,
        masteredAfter: postState?.mastered ? true : false,
        frontierBefore: preState?.frontier ? true : false,
        frontierAfter: postState?.frontier ? true : false,
        rollingAccuracy: null,
        presentationWeights: null,
        remediationTarget: (currentItem as any).remediationTargetTopicId ?? null,
        fireCreditApplied: null,
        fadingLevel: (currentItem as any).fadingLevel ?? null,
        interleaveStrand: null,
      });
    }
  }

  /**
   * Fix diagnostic materialization artifacts: mastered topics get state=Review
   * but stability=0 and difficulty=0, which makes FSRS produce NaN.
   * Set reasonable FSRS defaults for these topics.
   */
  private async sanitizePostDiagnosticState(): Promise<void> {
    const allState = await this.db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, this.userId));

    let fixed = 0;
    for (const row of allState) {
      // state=2 (Review) with stability=0 is invalid for FSRS
      if (row.state === 2 && row.stability === 0) {
        await this.db
          .update(schema.userTopicState)
          .set({
            stability: 15, // ~15 days = reasonable initial mastery
            difficulty: 5,  // middle difficulty (FSRS scale 1-10)
          })
          .where(eq(schema.userTopicState.id, row.id));
        fixed++;
      }
      // state=0 (New) or state=1 (Learning) with stability=0 is fine — FSRS handles it
    }
    if (fixed > 0) {
      console.log(`[sim] Sanitized ${fixed} mastered topics with zero stability`);
    }
  }

  private async getTopicState(topicId: string) {
    const rows = await this.db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, this.userId));
    return rows.find((r) => r.topicId === topicId) ?? null;
  }

  private getSubjectId(): string {
    // Map subject name to ID
    const subjectMap: Record<string, string> = {
      "math-foundations": "math-foundations",
    };
    return subjectMap[this.config.subject] ?? this.config.subject;
  }
}
