import { eq, and, inArray, sql } from "drizzle-orm";
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

      // Get all topic IDs this user has started (has any state)
      const startedRows = await db
        .select({ topicId: schema.userTopicState.topicId })
        .from(schema.userTopicState)
        .where(eq(schema.userTopicState.userId, userId));
      const startedIds = new Set(startedRows.map((r) => r.topicId));

      // Get all topics
      const allTopics = await db.select().from(schema.topics);

      // Get all prerequisites
      const allPrereqs = await db.select().from(schema.prerequisites);

      // Build prereq map: topicId → list of required topicIds
      const prereqMap = new Map<string, string[]>();
      for (const p of allPrereqs) {
        const list = prereqMap.get(p.toTopicId) ?? [];
        list.push(p.fromTopicId);
        prereqMap.set(p.toTopicId, list);
      }

      // Frontier: all prereqs mastered AND topic not yet started
      const frontier = allTopics.filter((topic) => {
        if (startedIds.has(topic.id)) return false;
        const prereqs = prereqMap.get(topic.id) ?? [];
        return prereqs.every((pid) => masteredIds.has(pid));
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
     * Validate that the prerequisite graph is a DAG (no cycles).
     * Returns { valid: true } or { valid: false, cycle: string[] }.
     */
    async validateDAG(subjectId: string) {
      const subjectTopics = await db
        .select({ id: schema.topics.id })
        .from(schema.topics)
        .where(eq(schema.topics.subjectId, subjectId));
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
      for (const [from, tos] of adjacency) {
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
     * Get all subjects.
     */
    async getSubjects() {
      return db.select().from(schema.subjects);
    },
  };
}
