import { eq, and, inArray, sql, desc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema.js";

type DB = DrizzleD1Database<typeof schema>;

export function createGraphService(db: DB) {
  return {
    /**
     * Topics where all prerequisites are mastered and topic is not yet started.
     */
    async computeFrontier(userId: string) {
      // Get all mastered topic IDs for this user
      const masteredRows = await db
        .select({ topicId: schema.userTopicState.topicId })
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            eq(schema.userTopicState.mastered, true)
          )
        );
      const masteredIds = new Set(masteredRows.map((r) => r.topicId));

      // Infer implicit mastery from diagnostic estimates.
      // After reduced materialization (frontier ±1 only), topics far below
      // the placement grade aren't in user_topic_state but are still mastered.
      // Query the latest completed diagnostic to restore these for prereq checks.
      const diagnosticSession = await db.query.diagnosticSessions.findFirst({
        where: and(
          eq(schema.diagnosticSessions.userId, userId),
          eq(schema.diagnosticSessions.status, "completed")
        ),
        orderBy: desc(schema.diagnosticSessions.completedAt),
      });
      if (diagnosticSession?.topicEstimatesJson) {
        const estimates: Record<string, number> = JSON.parse(diagnosticSession.topicEstimatesJson);
        for (const [topicId, prob] of Object.entries(estimates)) {
          if (prob >= 0.6) {
            masteredIds.add(topicId);
          }
        }
      }

      // Get all topic IDs this user has started (has any state)
      const startedRows = await db
        .select({
          topicId: schema.userTopicState.topicId,
          frontier: schema.userTopicState.frontier,
          reps: schema.userTopicState.reps,
          mastered: schema.userTopicState.mastered,
        })
        .from(schema.userTopicState)
        .where(eq(schema.userTopicState.userId, userId));
      const startedIds = new Set(startedRows.map((r) => r.topicId));
      // Diagnostic frontier topics: materialized but never studied (reps=0, not mastered)
      // These should still appear in the frontier for new topic introduction.
      const diagnosticFrontierIds = new Set(
        startedRows
          .filter((r) => r.frontier && !r.mastered && r.reps === 0)
          .map((r) => r.topicId)
      );

      // Get all topics
      const allTopics = await db.select().from(schema.topics);

      // Get all prerequisites
      const allPrereqs = await db.select().from(schema.prerequisites);

      // Get discipline progression models for subjects
      const subjectRows = await db.select({ id: schema.subjects.id, disciplineId: schema.subjects.disciplineId }).from(schema.subjects);
      const discRows = await db.select({ id: schema.disciplines.id, progressionModel: schema.disciplines.progressionModel }).from(schema.disciplines);
      const discModelMap = new Map(discRows.map((d) => [d.id, d.progressionModel]));
      const subjectDiscMap = new Map(subjectRows.map((s) => [s.id, s.disciplineId]));

      // Build prereq map: topicId → list of { fromTopicId, type }
      const prereqMap = new Map<string, { fromTopicId: string; type: string }[]>();
      for (const p of allPrereqs) {
        const list = prereqMap.get(p.toTopicId) ?? [];
        list.push({ fromTopicId: p.fromTopicId, type: p.type });
        prereqMap.set(p.toTopicId, list);
      }

      // Build topic → subject map
      const topicSubjectMap = new Map(allTopics.map((t) => [t.id, t.subjectId]));

      // For context-layered spiral: load depth completion data
      const depthRows = await db
        .select()
        .from(schema.userTopicDepth)
        .where(
          and(
            eq(schema.userTopicDepth.userId, userId),
            eq(schema.userTopicDepth.completed, true)
          )
        );
      // Map topicId → set of completed depths
      const depthMap = new Map<string, Set<string>>();
      for (const row of depthRows) {
        const set = depthMap.get(row.topicId) ?? new Set();
        set.add(row.contentDepth);
        depthMap.set(row.topicId, set);
      }

      const ALL_DEPTHS = ["survey", "contextual", "analytical", "synthesis"];

      // Frontier: gating depends on discipline progression model
      const frontier = allTopics.filter((topic) => {
        const disciplineId = subjectDiscMap.get(topic.subjectId);
        const model = disciplineId ? discModelMap.get(disciplineId) : "mastery-gated";

        if (model === "context-layered") {
          // Context-layered spiral: topic is in frontier if:
          // 1. Not started yet AND required prereqs met, OR
          // 2. Started/mastered but has uncompleted depth levels
          const prereqs = prereqMap.get(topic.id) ?? [];
          const requiredMet = prereqs
            .filter((p) => p.type === "required")
            .every((p) => masteredIds.has(p.fromTopicId));

          if (!startedIds.has(topic.id)) {
            // Not started: include if no prereqs or required prereqs met
            return prereqs.length === 0 || requiredMet;
          }

          // Already started/mastered: include if there are uncompleted depths
          const completedDepths = depthMap.get(topic.id) ?? new Set();
          return ALL_DEPTHS.some((d) => !completedDepths.has(d));
        }

        // Non-context-layered: exclude started topics, but include
        // diagnostic frontier topics (materialized but never studied)
        if (startedIds.has(topic.id) && !diagnosticFrontierIds.has(topic.id)) return false;
        const prereqs = prereqMap.get(topic.id) ?? [];
        if (prereqs.length === 0) return true;

        if (model === "flexible") {
          return true;
        }
        // mastery-gated (default): all 'required' and 'recommended' prereqs must be mastered
        return prereqs
          .filter((p) => p.type !== "enriching")
          .every((p) => masteredIds.has(p.fromTopicId));
      });

      return {
        topics: frontier,
        totalMastered: masteredIds.size,
        totalTopics: allTopics.length,
      };
    },

    /**
     * Trace back the prerequisite chain for remediation.
     */
    async getPrerequisiteChain(topicId: string): Promise<string[]> {
      const allPrereqs = await db.select().from(schema.prerequisites);
      const prereqMap = new Map<string, string[]>();
      for (const p of allPrereqs) {
        const list = prereqMap.get(p.toTopicId) ?? [];
        list.push(p.fromTopicId);
        prereqMap.set(p.toTopicId, list);
      }

      const chain: string[] = [];
      const visited = new Set<string>();
      const queue = [topicId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        if (current !== topicId) chain.push(current);
        const prereqs = prereqMap.get(current) ?? [];
        queue.push(...prereqs);
      }

      return chain;
    },

    /**
     * Get direct prerequisites for a topic (not transitive).
     */
    async getDirectPrerequisites(topicId: string) {
      return db
        .select()
        .from(schema.prerequisites)
        .where(eq(schema.prerequisites.toTopicId, topicId));
    },

    /**
     * Get topics that encompass the given topic (for FIRe credit).
     */
    async getEncompassingTopics(topicId: string) {
      return db
        .select()
        .from(schema.encompassings)
        .where(eq(schema.encompassings.childTopicId, topicId));
    },

    /**
     * Get child topics encompassed by the given topic.
     */
    async getEncompassedTopics(topicId: string) {
      return db
        .select()
        .from(schema.encompassings)
        .where(eq(schema.encompassings.parentTopicId, topicId));
    },

    /**
     * Given a just-mastered topic, find topics that are now newly unlocked
     * (all their required/recommended prerequisites are met).
     */
    async getNewlyUnlockedTopics(userId: string, justMasteredTopicId: string) {
      // Get all mastered topic IDs (including the just-mastered one)
      const masteredRows = await db
        .select({ topicId: schema.userTopicState.topicId })
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            eq(schema.userTopicState.mastered, true)
          )
        );
      const masteredIds = new Set(masteredRows.map((r) => r.topicId));

      // Include implicit mastery from diagnostic estimates (reduced materialization)
      const diagSession = await db.query.diagnosticSessions.findFirst({
        where: and(
          eq(schema.diagnosticSessions.userId, userId),
          eq(schema.diagnosticSessions.status, "completed")
        ),
        orderBy: desc(schema.diagnosticSessions.completedAt),
      });
      if (diagSession?.topicEstimatesJson) {
        const estimates: Record<string, number> = JSON.parse(diagSession.topicEstimatesJson);
        for (const [topicId, prob] of Object.entries(estimates)) {
          if (prob >= 0.6) masteredIds.add(topicId);
        }
      }

      // Find topics that have justMasteredTopicId as a prerequisite
      const dependents = await db
        .select({ toTopicId: schema.prerequisites.toTopicId })
        .from(schema.prerequisites)
        .where(eq(schema.prerequisites.fromTopicId, justMasteredTopicId));

      if (dependents.length === 0) return [];

      const dependentIds = dependents.map((d) => d.toTopicId);

      // Get all prereqs for those dependent topics
      const allPrereqs = await db
        .select()
        .from(schema.prerequisites)
        .where(inArray(schema.prerequisites.toTopicId, dependentIds));

      // Build prereq map: topicId → prereqs
      const prereqMap = new Map<string, { fromTopicId: string; type: string }[]>();
      for (const p of allPrereqs) {
        const list = prereqMap.get(p.toTopicId) ?? [];
        list.push({ fromTopicId: p.fromTopicId, type: p.type });
        prereqMap.set(p.toTopicId, list);
      }

      // Check which dependent topics already have state (already started)
      const startedRows = await db
        .select({ topicId: schema.userTopicState.topicId })
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            inArray(schema.userTopicState.topicId, dependentIds)
          )
        );
      const startedIds = new Set(startedRows.map((r) => r.topicId));

      // Filter to topics not yet started where all required/recommended prereqs are mastered
      const unlockedIds = dependentIds.filter((topicId) => {
        if (startedIds.has(topicId)) return false;
        const prereqs = prereqMap.get(topicId) ?? [];
        return prereqs
          .filter((p) => p.type !== "enriching")
          .every((p) => masteredIds.has(p.fromTopicId));
      });

      if (unlockedIds.length === 0) return [];

      // Get topic names
      const topics = await db
        .select({ id: schema.topics.id, name: schema.topics.name })
        .from(schema.topics)
        .where(inArray(schema.topics.id, unlockedIds));

      return topics;
    },

    /**
     * Validate that the prerequisite graph is a DAG (no cycles).
     * When subjectId is provided, validates only within that subject (ignoring cross-subject edges).
     * When subjectId is omitted, validates the full graph across all subjects,
     * including cross-subject prerequisite edges.
     * Returns { valid: true } or { valid: false, cycle: string[] }.
     */
    async validateDAG(subjectId?: string) {
      const subjectTopics = subjectId
        ? await db
            .select({ id: schema.topics.id })
            .from(schema.topics)
            .where(eq(schema.topics.subjectId, subjectId))
        : await db.select({ id: schema.topics.id }).from(schema.topics);
      const topicIds = new Set(subjectTopics.map((t) => t.id));

      const allPrereqs = await db.select().from(schema.prerequisites);
      const adjacency = new Map<string, string[]>();
      for (const p of allPrereqs) {
        if (!topicIds.has(p.fromTopicId) || !topicIds.has(p.toTopicId)) continue;
        const list = adjacency.get(p.fromTopicId) ?? [];
        list.push(p.toTopicId);
        adjacency.set(p.fromTopicId, list);
      }

      // Kahn's algorithm for cycle detection
      const inDegree = new Map<string, number>();
      for (const id of topicIds) inDegree.set(id, 0);
      for (const [, tos] of adjacency) {
        for (const to of tos) {
          inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
        }
      }

      const queue: string[] = [];
      for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
      }

      let processed = 0;
      while (queue.length > 0) {
        const node = queue.shift()!;
        processed++;
        for (const neighbor of adjacency.get(node) ?? []) {
          const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDeg);
          if (newDeg === 0) queue.push(neighbor);
        }
      }

      if (processed === topicIds.size) {
        return { valid: true as const };
      }

      // Find a cycle for error reporting
      const remaining = [...inDegree.entries()]
        .filter(([, deg]) => deg > 0)
        .map(([id]) => id);
      return { valid: false as const, cycle: remaining };
    },

    /**
     * Compute depth for each topic via topological sort.
     * Depth = longest path from any root (no prereqs) to this topic.
     */
    async computeDepths(subjectId: string) {
      const subjectTopics = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.subjectId, subjectId));
      const topicIds = new Set(subjectTopics.map((t) => t.id));

      const allPrereqs = await db.select().from(schema.prerequisites);

      // prereqMap: topicId → prereqs (incoming edges)
      const prereqMap = new Map<string, string[]>();
      // childMap: topicId → topics that depend on it (outgoing edges)
      const childMap = new Map<string, string[]>();

      for (const p of allPrereqs) {
        if (!topicIds.has(p.fromTopicId) || !topicIds.has(p.toTopicId)) continue;
        const pList = prereqMap.get(p.toTopicId) ?? [];
        pList.push(p.fromTopicId);
        prereqMap.set(p.toTopicId, pList);

        const cList = childMap.get(p.fromTopicId) ?? [];
        cList.push(p.toTopicId);
        childMap.set(p.fromTopicId, cList);
      }

      // Compute depths via BFS from roots
      const depths = new Map<string, number>();
      const inDegree = new Map<string, number>();

      for (const id of topicIds) {
        inDegree.set(id, (prereqMap.get(id) ?? []).length);
        depths.set(id, 0);
      }

      const queue: string[] = [];
      for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
      }

      while (queue.length > 0) {
        const node = queue.shift()!;
        const nodeDepth = depths.get(node) ?? 0;
        for (const child of childMap.get(node) ?? []) {
          depths.set(child, Math.max(depths.get(child) ?? 0, nodeDepth + 1));
          const newDeg = (inDegree.get(child) ?? 1) - 1;
          inDegree.set(child, newDeg);
          if (newDeg === 0) queue.push(child);
        }
      }

      // Update depths in database
      for (const topic of subjectTopics) {
        const depth = depths.get(topic.id) ?? 0;
        if (depth !== topic.depth) {
          await db
            .update(schema.topics)
            .set({ depth })
            .where(eq(schema.topics.id, topic.id));
        }
      }

      return Object.fromEntries(depths);
    },

    /**
     * Get a topic by ID with its problems and examples.
     */
    async getTopic(topicId: string) {
      const [topic] = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.id, topicId));
      return topic ?? null;
    },

    /**
     * Get all topics for a subject, ordered by depth.
     */
    async getSubjectTopics(subjectId: string) {
      return db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.subjectId, subjectId))
        .orderBy(schema.topics.depth);
    },

    /**
     * Get all subjects with discipline info.
     */
    async getSubjects() {
      return db
        .select({
          id: schema.subjects.id,
          name: schema.subjects.name,
          description: schema.subjects.description,
          gradeRange: schema.subjects.gradeRange,
          topicCount: schema.subjects.topicCount,
          disciplineId: schema.subjects.disciplineId,
          createdAt: schema.subjects.createdAt,
        })
        .from(schema.subjects);
    },

    /**
     * Get all disciplines.
     */
    async getDisciplines() {
      return db.select().from(schema.disciplines);
    },

    /**
     * Compute strand IDs for topics. Topics in the same "strand" are
     * conceptually similar (share a direct prerequisite or are siblings
     * under the same parent). Strand = root ancestor in the prerequisite
     * chain. Topics that share any root prerequisite are in the same strand.
     */
    async getTopicStrands(topicIds: string[]): Promise<Map<string, string>> {
      if (topicIds.length === 0) return new Map();

      const allPrereqs = await db.select().from(schema.prerequisites);

      // Build parent map: topicId → list of prerequisite topic IDs
      const parentMap = new Map<string, string[]>();
      for (const p of allPrereqs) {
        const list = parentMap.get(p.toTopicId) ?? [];
        list.push(p.fromTopicId);
        parentMap.set(p.toTopicId, list);
      }

      // For each topic, walk up to the root(s) and use the first root as strand ID
      const strandMap = new Map<string, string>();
      const rootCache = new Map<string, string>();

      function findRoot(topicId: string): string {
        if (rootCache.has(topicId)) return rootCache.get(topicId)!;

        const visited = new Set<string>();
        let current = topicId;

        while (true) {
          if (visited.has(current)) break; // cycle guard
          visited.add(current);
          const parents = parentMap.get(current);
          if (!parents || parents.length === 0) break;
          current = parents[0]; // follow first parent to root
        }

        // Cache for all visited nodes
        for (const v of visited) {
          rootCache.set(v, current);
        }
        return current;
      }

      for (const topicId of topicIds) {
        strandMap.set(topicId, findRoot(topicId));
      }

      return strandMap;
    },
  };
}
