/**
 * Simulation runner — drives synthetic learners through the real learning engine.
 */
import type { DB } from "../../../packages/api/src/db/index.js";
import { createSessionService } from "../../../packages/api/src/services/session.js";
import { createDiagnosticService, IMPLICIT_MASTERY_THRESHOLD } from "../../../packages/api/src/services/diagnostic.js";
import { createAssessmentService } from "../../../packages/api/src/services/assessment.js";
import { createSRSService } from "../../../packages/api/src/services/srs.js";
import { createFileContentBucket } from "../../../packages/api/src/services/content-r2.js";
import { createSimulationDb, createSimulationDbMulti, createSimUser, resolveContentDir } from "./db-setup.js";
import { resolveAnswer } from "./answer-engine.js";
import { EventLogger } from "./event-logger.js";
import { SeededRNG } from "./prng.js";
import type { SimulationConfig, SimulationResult, SimulationEvent, LearnerProfile, DiagnosticRunResult, SessionSummary, StateSnapshot, TopicStateSnapshot, PresentationSnapshot, TimeSchedule } from "./types.js";
import type { AssessmentItem, AssessmentResult } from "../../../packages/shared/src/types.js";
import { join } from "path";
import { eq, and, desc, sql } from "drizzle-orm";
import { writeFileSync, readFileSync } from "fs";
import * as schema from "../../../packages/api/src/db/schema.js";

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
  private contentBucket = createFileContentBucket(resolveContentDir());
  private userId!: string;
  private logger!: EventLogger;
  private simulatedTimeMs!: number;
  private simulationStartMs!: number;
  private topicGradeLevels = new Map<string, number>();
  private topicDisciplines = new Map<string, string>();
  private totalTopicCount = 0;
  private sessionSummaries: SessionSummary[] = [];
  private stateSnapshots: StateSnapshot[] = [];
  private firePrereqCumulativeCount = 0; // Running total of fire-prereq events for session delta computation

  constructor(config: SimulationConfig) {
    this.config = config;
    this.rng = new SeededRNG(config.seed);
  }

  async run(): Promise<SimulationResult> {
    const runsDir = join(process.cwd(), "audit", "learner-simulations", "runs");
    this.logger = new EventLogger(this.config.profile.id, runsDir);

    // Patch Math.random with a separate seeded PRNG for deterministic
    // diagnostic topic selection (doesn't share state with answer engine's PRNG)
    const mathRandomRng = new SeededRNG(this.config.seed + 1000000);
    setSeededRandom(() => mathRandomRng.next());

    const disciplines = this.config.disciplines ?? [this.config.discipline];
    console.log(`[sim] Setting up DB for ${disciplines.join(", ")}...`);
    this.db = disciplines.length > 1
      ? createSimulationDbMulti(disciplines)
      : createSimulationDb(this.config.discipline);

    // Create simulated user
    this.userId = `sim-${this.config.profile.id}-${this.config.seed}`;
    createSimUser(this.db, this.userId, this.config.profile.name, this.config.profile.age);

    // Cache topic grade levels and discipline assignments for the answer engine
    const topics = await this.db.select().from(schema.topics);
    for (const t of topics) {
      this.topicGradeLevels.set(t.id, t.gradeLevel);
      this.topicDisciplines.set(t.id, t.disciplineId);
    }
    this.totalTopicCount = topics.length;

    // Start simulated time at a fixed point
    this.simulatedTimeMs = new Date("2026-01-15T08:00:00Z").getTime();
    this.simulationStartMs = this.simulatedTimeMs;

    // Run diagnostic for each discipline
    let diagnosticQuestions = 0;
    for (const disc of disciplines) {
      console.log(`[sim] Running diagnostic for ${this.config.profile.id} (${disc})...`);
      const qs = await this.runDiagnostic(disc);
      diagnosticQuestions += qs;
      console.log(`[sim] Diagnostic for ${disc}: ${qs} questions asked`);
    }

    // Fix diagnostic materialization: mastered topics get state=Review but stability=0,
    // which causes FSRS to produce NaN on next scheduling. Set reasonable defaults.
    await this.sanitizePostDiagnosticState();

    // Take initial state snapshot (post-diagnostic)
    await this.takeStateSnapshot(0);

    let sessionsCompleted = 0;
    for (let i = 0; i < this.config.sessionCount; i++) {
      // Advance time between sessions using the configured schedule
      this.simulatedTimeMs += this.getSessionInterval(i);

      console.log(`[sim] Session ${i + 1}/${this.config.sessionCount} for ${this.config.profile.id} (day ${this.getSimulatedDay()})...`);
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

      // Snapshot state and compute session summary after each session
      await this.takeStateSnapshot(i + 1);
      await this.computeSessionSummary(i + 1);
    }

    // Assessment verification pass (--mode assessment)
    if (this.config.mode === "assessment") {
      await this.runAssessmentVerification();
    }

    // Restore real Date and Math.random
    restoreRealDate();
    restoreRealRandom();

    // Write summary
    this.logger.writeSummary({
      profileId: this.config.profile.id,
      discipline: this.config.discipline,
      seed: this.config.seed,
      sessionsCompleted,
      diagnosticQuestionsAsked: diagnosticQuestions,
      totalEvents: this.logger.getTick(),
      sessionSummaries: this.sessionSummaries,
    });

    // Write state snapshots to separate file
    writeFileSync(
      join(this.logger.getRunDir(), "state-snapshots.json"),
      JSON.stringify(this.stateSnapshots, null, 2) + "\n"
    );

    // Write session summaries to separate file
    writeFileSync(
      join(this.logger.getRunDir(), "session-summaries.json"),
      JSON.stringify(this.sessionSummaries, null, 2) + "\n"
    );

    const result: SimulationResult = {
      profileId: this.config.profile.id,
      discipline: this.config.discipline,
      sessionsCompleted,
      diagnosticQuestionsAsked: diagnosticQuestions,
      totalEvents: this.logger.getTick(),
      runDir: this.logger.getRunDir(),
      sessionSummaries: this.sessionSummaries,
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

  private async runDiagnostic(disciplineId?: string): Promise<number> {
    setSimulatedTime(this.simulatedTimeMs);

    const diagnostic = createDiagnosticService(this.db, this.contentBucket);
    const startResult = await diagnostic.startDiagnostic({
      userId: this.userId,
      disciplineId: disciplineId ?? this.getDisciplineId(),
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
        { id: topicId, gradeLevel, disciplineId: this.topicDisciplines.get(topicId) },
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

    // Include implicitly mastered topics from diagnostic estimates
    const materializedIds = new Set(allState.map((r) => r.topicId));
    for (const [topicId, prob] of Object.entries(estimates)) {
      if (prob >= IMPLICIT_MASTERY_THRESHOLD && !materializedIds.has(topicId) && !masteredTopicIds.includes(topicId)) {
        masteredTopicIds.push(topicId);
      }
    }

    // Get presentation distribution
    const presRows = await this.db
      .select()
      .from(schema.userDisciplinePresentation)
      .where(eq(schema.userDisciplinePresentation.userId, this.userId));
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

    const fireMode = this.config.fireMode ?? "both";
    const fireDiagnostic = {
      disableCredit: fireMode === "ordering-only" || fireMode === "neither",
      disableOrdering: fireMode === "credit-only" || fireMode === "neither",
    };
    const sessionSvc = createSessionService(this.db, fireDiagnostic, this.contentBucket);

    // Pull-based loop: each startSession() returns one atomic unit (one topic).
    // Repeat until nothing more to learn or MAX_INTERACTIONS reached.
    let totalInteractions = 0;
    const MAX_INTERACTIONS = 100; // Safety limit for entire simulated session

    while (totalInteractions < MAX_INTERACTIONS) {
      const { sessionId, firstItem } = await sessionSvc.startSession(this.userId);

      if (firstItem.type === "complete") {
        console.log(`[sim]   Session ${sessionNumber}: all caught up`);
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
        break;
      }

      let currentItem = firstItem;
      const interactions = 0;

      while (currentItem.type !== "complete" && currentItem.type !== "error" && totalInteractions < MAX_INTERACTIONS) {
        totalInteractions++;

      if (currentItem.type === "lesson") {
        // Lesson item — simulate viewing the lesson then completing practice problems
        this.logger.log({
          sessionNumber,
          phase: "lesson",
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
          fadingLevel: null,
          interleaveStrand: null,
        });

        // Respond to lesson phase — pass through to advance to next topic
        currentItem = await sessionSvc.respond(sessionId, {
          correct: true,
          responseMs: 15000, // Simulate reading time
        });
        continue;
      }

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
        { id: topicId, gradeLevel, disciplineId: this.topicDisciplines.get(topicId) },
        problem.difficulty ?? "medium",
        problem.cognitiveDemand ?? (currentItem as any).cognitiveDemand ?? null,
        (currentItem as any).phase ?? "independent",
        sessionNumber
      );

      // Submit answer — include problemId so server grades against the correct problem
      const answerText = answerResult.correct ? problem.answer : "__wrong__";
      currentItem = await sessionSvc.respond(sessionId, {
        answer: answerText,
        correct: answerResult.correct,
        confidence: answerResult.confidence,
        responseMs: answerResult.responseMs,
        hintsUsed: answerResult.hintsToRequest,
        problemId: problem.id,
      } as any);

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
      } // end inner while (current unit interactions)
    } // end outer while (pull-based topic loop)
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

  private getDisciplineId(): string {
    return this.config.discipline;
  }

  /** Get the time interval before session i (0-indexed) */
  private getSessionInterval(sessionIndex: number): number {
    // 1. Existing timeSchedule config takes priority
    const schedule = this.config.timeSchedule;
    if (schedule) {
      const base = schedule.baseIntervalMs ?? ONE_DAY_MS;

      if (schedule.type === "fixed") {
        return base;
      }

      if (schedule.type === "variable" && schedule.intervals) {
        return schedule.intervals[sessionIndex] ?? base;
      }

      if (schedule.type === "weekdays") {
        const currentDate = new Date(this.simulatedTimeMs);
        const dayOfWeek = currentDate.getUTCDay(); // 0=Sun, 6=Sat
        if (dayOfWeek === 5) return base * 3; // Friday → Monday (skip Sat+Sun)
        if (dayOfWeek === 6) return base * 2; // Saturday → Monday (skip Sun)
        return base;
      }

      return base;
    }

    // 2. Profile scheduling presets
    const preset = this.config.profile.scheduling;
    if (preset) {
      const p = preset.params ?? {};
      switch (preset.type) {
        case "daily":
          return ONE_DAY_MS;

        case "irregular": {
          const minDays = p.min_days ?? 1;
          const maxDays = p.max_days ?? 5;
          return this.rng.intRange(minDays, maxDays) * ONE_DAY_MS;
        }

        case "weekday": {
          const currentDate = new Date(this.simulatedTimeMs);
          const dow = currentDate.getUTCDay(); // 0=Sun, 6=Sat
          if (dow === 5) return ONE_DAY_MS * 3; // Friday → Monday
          if (dow === 6) return ONE_DAY_MS * 2; // Saturday → Monday
          return ONE_DAY_MS;
        }

        case "gap-and-return": {
          const sessionsBefore = p.sessions_before ?? 15;
          const gapDays = p.gap_days ?? 14;
          if (sessionIndex < sessionsBefore) return ONE_DAY_MS;
          if (sessionIndex === sessionsBefore) return gapDays * ONE_DAY_MS;
          return ONE_DAY_MS;
        }

        case "burst": {
          const burstSize = p.burst_size ?? 3;
          const burstIntervalHours = p.burst_interval_hours ?? 5;
          const gapDaysMin = p.gap_days_min ?? 2;
          const gapDaysMax = p.gap_days_max ?? 3;
          const posInCycle = sessionIndex % burstSize;
          if (posInCycle === 0 && sessionIndex > 0) {
            return this.rng.intRange(gapDaysMin, gapDaysMax) * ONE_DAY_MS;
          }
          return burstIntervalHours * 3600000;
        }

        case "weekend-only": {
          const currentDate = new Date(this.simulatedTimeMs);
          const dow = currentDate.getUTCDay(); // 0=Sun, 6=Sat
          if (dow === 6) return ONE_DAY_MS; // Saturday → Sunday
          if (dow === 0) return ONE_DAY_MS * 6; // Sunday → Saturday
          // First session or mid-week: skip to next Saturday
          return ((6 - dow + 7) % 7 || 7) * ONE_DAY_MS;
        }

        case "decay": {
          const initialDays = p.initial_days ?? 1;
          const decayRate = p.decay_rate ?? 0.15;
          const maxDays = p.max_days ?? 7;
          return Math.round(Math.min(initialDays + decayRate * sessionIndex, maxDays)) * ONE_DAY_MS;
        }

        case "completion-break": {
          const breakDaysMin = p.break_days_min ?? 3;
          const breakDaysMax = p.break_days_max ?? 7;
          const masteryTriggerCount = p.mastery_trigger_count ?? 2;
          const snapshots = this.stateSnapshots;
          if (snapshots.length >= 2) {
            const curr = snapshots[snapshots.length - 1];
            const prev = snapshots[snapshots.length - 2];
            const masteryGain = curr.materializedMasteryCount - prev.materializedMasteryCount;
            if (masteryGain >= masteryTriggerCount) {
              return this.rng.intRange(breakDaysMin, breakDaysMax) * ONE_DAY_MS;
            }
          }
          return ONE_DAY_MS;
        }
      }
    }

    // 3. Fallback
    return this.config.sessionIntervalMs ?? ONE_DAY_MS;
  }

  /** Get current simulated day number (0-indexed from start) */
  private getSimulatedDay(): number {
    return Math.round((this.simulatedTimeMs - this.simulationStartMs) / ONE_DAY_MS);
  }

  /** Snapshot full user state after a session */
  private async takeStateSnapshot(sessionNumber: number): Promise<void> {
    const allState = await this.db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, this.userId));

    const topicStates: TopicStateSnapshot[] = allState.map((row) => ({
      topicId: row.topicId,
      stability: row.stability,
      difficulty: row.difficulty,
      due: row.due,
      state: row.state,
      reps: row.reps,
      lapses: row.lapses,
      mastered: row.mastered,
      frontier: row.frontier,
      consecutiveCorrectReviews: row.consecutiveCorrectReviews,
      consecutiveIncorrectReviews: row.consecutiveIncorrectReviews,
    }));

    const presRows = await this.db
      .select()
      .from(schema.userDisciplinePresentation)
      .where(eq(schema.userDisciplinePresentation.userId, this.userId));
    const presRow = presRows[0] ?? null;

    const presentation: PresentationSnapshot | null = presRow
      ? {
          centerLevel: presRow.centerLevel,
          primaryWeight: presRow.primaryWeight,
          intermediateWeight: presRow.intermediateWeight,
          standardWeight: presRow.standardWeight,
          advancedWeight: presRow.advancedWeight,
        }
      : null;

    // Count materialized mastery
    const materializedMastered = topicStates.filter((t) => t.mastered).length;

    // Include implicit mastery from diagnostic estimates (reduced materialization)
    const diagnosticSession = await this.db.query.diagnosticSessions.findFirst({
      where: and(
        eq(schema.diagnosticSessions.userId, this.userId),
        eq(schema.diagnosticSessions.status, "completed")
      ),
      orderBy: desc(schema.diagnosticSessions.completedAt),
    });

    let implicitMastered = 0;
    if (diagnosticSession?.topicEstimatesJson) {
      const estimates: Record<string, number> = JSON.parse(diagnosticSession.topicEstimatesJson);
      const materializedIds = new Set(topicStates.map((t) => t.topicId));
      for (const [topicId, prob] of Object.entries(estimates)) {
        if (prob >= IMPLICIT_MASTERY_THRESHOLD && !materializedIds.has(topicId)) {
          implicitMastered++;
        }
      }
    }

    const masteryCount = materializedMastered + implicitMastered;

    this.stateSnapshots.push({
      sessionNumber,
      day: this.getSimulatedDay(),
      simulatedTime: new Date(this.simulatedTimeMs).toISOString(),
      masteryCount,
      masteryPercent: this.totalTopicCount > 0 ? masteryCount / this.totalTopicCount : 0,
      materializedMasteryCount: materializedMastered,
      totalTopics: this.totalTopicCount,
      topicStates,
      presentation,
    });
  }

  /** Compute session summary from events logged during the session */
  private async computeSessionSummary(sessionNumber: number): Promise<void> {
    // Read events from the JSONL file for this session
    const eventsPath = join(this.logger.getRunDir(), "events.jsonl");
    const allLines = readFileSync(eventsPath, "utf-8").trim().split("\n").filter(Boolean);
    const sessionEvents: SimulationEvent[] = allLines
      .map((line) => JSON.parse(line))
      .filter((e: SimulationEvent) => e.sessionNumber === sessionNumber);

    const topicsAttempted = new Set<string>();
    const topicsMastered = new Set<string>();
    let reviewsCompleted = 0;
    let newTopicsIntroduced = 0;
    let remediationsTriggered = 0;
    let correctCount = 0;
    let totalProblems = 0;
    let fireReviewsSkipped = 0;
    const fadingLevels: Record<string, number> = {};
    const demandDist: Record<string, number> = {};
    let errors = 0;

    for (const event of sessionEvents) {
      if (event.phase === "error") {
        errors++;
        continue;
      }

      if (event.topicId) {
        topicsAttempted.add(event.topicId);
      }

      // Track mastery transitions
      if (event.masteredBefore === false && event.masteredAfter === true && event.topicId) {
        topicsMastered.add(event.topicId);
      }

      // Track reviews vs new
      // "review" = FSRS-scheduled review; "lesson" = new topic introduction (simplified loop)
      if (event.phase === "review") {
        reviewsCompleted++;
      }
      if (event.phase === "lesson" || event.phase === "pretest") {
        newTopicsIntroduced++;
      }

      // Track remediation
      if (event.remediationTarget) {
        remediationsTriggered++;
      }

      // Track accuracy (only for problems, not instructions)
      if (event.correct !== null) {
        totalProblems++;
        if (event.correct) correctCount++;
      }

      // Track FIRe
      if (event.fireCreditApplied) {
        fireReviewsSkipped++;
      }

      // Track fading levels
      if (event.fadingLevel !== null && event.topicId) {
        fadingLevels[event.topicId] = event.fadingLevel;
      }

      // Track cognitive demand distribution
      if (event.cognitiveDemand) {
        demandDist[event.cognitiveDemand] = (demandDist[event.cognitiveDemand] ?? 0) + 1;
      }
    }

    // Get presentation center from latest snapshot
    const latestSnapshot = this.stateSnapshots[this.stateSnapshots.length - 1];
    const presentationCenter = latestSnapshot?.presentation?.centerLevel ?? null;

    // Count FIRe prereq credit events logged to DB this session
    // (review_log rows with phase="fire-prereq" and implicit=1)
    const firePrereqRows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.reviewLog)
      .where(
        and(
          eq(schema.reviewLog.userId, this.userId),
          eq(schema.reviewLog.phase, "fire-prereq"),
          eq(schema.reviewLog.implicit, 1),
        )
      );
    // Subtract previously counted events (this session's events only)
    const prevSummary = this.sessionSummaries[this.sessionSummaries.length - 1];
    const totalFirePrereqSoFar = firePrereqRows[0]?.count ?? 0;
    const prevFirePrereq = prevSummary ? (this.firePrereqCumulativeCount ?? 0) : 0;
    const firePrereqCreditEvents = totalFirePrereqSoFar - prevFirePrereq;
    this.firePrereqCumulativeCount = totalFirePrereqSoFar;

    const summary: SessionSummary = {
      sessionNumber,
      day: this.getSimulatedDay(),
      topicsAttempted: [...topicsAttempted],
      topicsMastered: [...topicsMastered],
      reviewsCompleted,
      newTopicsIntroduced,
      remediationsTriggered,
      averageAccuracy: totalProblems > 0 ? correctCount / totalProblems : 0,
      presentationCenter,
      fireReviewsSkipped,
      firePrereqCreditEvents,
      fadingLevels,
      cognitiveDemandDistribution: demandDist,
      errors,
    };

    this.sessionSummaries.push(summary);
  }

  /**
   * Run an assessment verification pass after learning sessions.
   * Starts a comprehensive 10-question assessment, answers using profile accuracy,
   * and logs score + strand coverage to verify the assessment service is working.
   */
  private async runAssessmentVerification(): Promise<void> {
    setSimulatedTime(this.simulatedTimeMs);

    const assessmentSvc = createAssessmentService(this.db, this.contentBucket);

    let totalQuestions = 0;
    let sessionId: string;
    let firstItem: AssessmentItem | null;

    try {
      const startResult = await assessmentSvc.startAssessment(this.userId, {
        scope: { type: "comprehensive" },
        questionCount: 10,
      });
      sessionId = startResult.sessionId;
      firstItem = startResult.firstItem;
      totalQuestions = startResult.totalQuestions;
    } catch (err: unknown) {
      console.log(`[sim] Assessment verification skipped: ${(err as Error).message}`);
      return;
    }

    if (!firstItem) {
      console.log("[sim] Assessment verification: no mastered topics available");
      return;
    }

    console.log(`[sim] Assessment verification: ${totalQuestions} questions`);

    let currentItem: AssessmentItem | undefined = firstItem;
    let result: AssessmentResult | undefined;

    while (currentItem) {
      const topicId = currentItem.topicId;
      const gradeLevel = this.topicGradeLevels.get(topicId) ?? 0;
      const problem = currentItem.problem;

      const answerResult = resolveAnswer(
        this.rng,
        this.config.profile,
        { id: topicId, gradeLevel, disciplineId: this.topicDisciplines.get(topicId) },
        "medium",
        (problem as any).cognitiveDemand ?? null,
        "independent",
        0,
      );

      const answerText = answerResult.correct ? problem.answer : "__wrong__";
      const resp = await assessmentSvc.respondToAssessment(sessionId, {
        answer: answerText,
        responseMs: answerResult.responseMs,
      });

      if (resp.result) {
        result = resp.result;
        break;
      }
      currentItem = resp.nextItem;
    }

    if (!result) {
      result = await assessmentSvc.getAssessmentResult(sessionId);
    }

    const strandCount = Object.keys(result.strandScores).length;
    console.log(
      `[sim] Assessment: ${result.totalCorrect}/${result.totalQuestions} (${(result.rawScore * 100).toFixed(1)}%), ${strandCount} strand(s) covered`,
    );

    // Correlation check: score vs mastery
    const finalSnapshot = this.stateSnapshots[this.stateSnapshots.length - 1];
    if (finalSnapshot && this.totalTopicCount > 0) {
      const masteryPct = finalSnapshot.masteryCount / this.totalTopicCount;
      console.log(
        `[sim] Score vs mastery: score=${(result.rawScore * 100).toFixed(1)}%, mastered=${(masteryPct * 100).toFixed(1)}%`,
      );
    }

    if (totalQuestions >= 10 && strandCount < 2) {
      console.warn(`[sim] WARNING: only ${strandCount} strand(s) covered in ${totalQuestions}-question assessment (expected ≥2)`);
    }
  }
}
