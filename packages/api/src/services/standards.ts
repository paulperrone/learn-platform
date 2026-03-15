import { eq, and, inArray } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import type { StandardClassification, DomainScore, StandardDetail, ProgressReport } from "@learn/shared";

// CCSS Math domain abbreviation → full name
const DOMAIN_NAMES: Record<string, string> = {
  CC: "Counting and Cardinality",
  OA: "Operations and Algebraic Thinking",
  NBT: "Number and Operations in Base Ten",
  NF: "Number and Operations—Fractions",
  MD: "Measurement and Data",
  G: "Geometry",
  RP: "Ratios and Proportional Relationships",
  NS: "The Number System",
  EE: "Expressions and Equations",
  F: "Functions",
  SP: "Statistics and Probability",
};

// CCSS Math format: Grade.Domain.Standard e.g. "K.CC.4", "3.OA.1"
const CCSS_MATH_RE = /^([K0-8])\.([A-Z]{1,3})\.\d/;

type ParsedCode = {
  grade: string;
  domain: string; // e.g. "K.CC"
  domainName: string;
};

function parseStandardCode(code: string): ParsedCode | null {
  const m = CCSS_MATH_RE.exec(code);
  if (!m) return null;
  const grade = m[1];
  const domainAbbr = m[2];
  return {
    grade,
    domain: `${grade}.${domainAbbr}`,
    domainName: DOMAIN_NAMES[domainAbbr] ?? domainAbbr,
  };
}

function classify(score: number): StandardClassification {
  if (score >= 0.8) return "proficient";
  if (score >= 0.5) return "developing";
  return "needs-support";
}

export type StandardEntry = {
  standard: string;
  domain: string;
  domainName: string;
  topicIds: string[];
};

export function createStandardsService(db: DB) {
  /**
   * For a set of topic IDs, return a mapping from standard code → topics that share it.
   * Only topics with a standard code are included.
   */
  async function getStandardsForTopics(topicIds: string[]): Promise<Record<string, StandardEntry>> {
    if (topicIds.length === 0) return {};

    const rows = await db
      .select({ id: schema.topics.id, standardCode: schema.topics.standardCode })
      .from(schema.topics)
      .where(inArray(schema.topics.id, topicIds));

    const result: Record<string, StandardEntry> = {};
    for (const row of rows) {
      if (!row.standardCode) continue;
      const parsed = parseStandardCode(row.standardCode);
      if (!result[row.standardCode]) {
        result[row.standardCode] = {
          standard: row.standardCode,
          domain: parsed?.domain ?? row.standardCode,
          domainName: parsed?.domainName ?? row.standardCode,
          topicIds: [],
        };
      }
      result[row.standardCode].topicIds.push(row.id);
    }
    return result;
  }

  /**
   * Compute per-standard and per-domain mastery for a user in a discipline.
   * Only topics with standard codes are included.
   */
  async function getStandardsMastery(userId: string, disciplineId: string): Promise<{
    domainScores: DomainScore[];
    standardDetails: StandardDetail[];
    overallMastery: number;
  }> {
    const allTopics = await db
      .select({ id: schema.topics.id, name: schema.topics.name, standardCode: schema.topics.standardCode })
      .from(schema.topics)
      .where(eq(schema.topics.disciplineId, disciplineId));

    const topicsWithStd = allTopics.filter((t) => t.standardCode !== null);
    const topicIds = topicsWithStd.map((t) => t.id);

    const masteredSet = new Set<string>();
    if (topicIds.length > 0) {
      const states = await db
        .select({ topicId: schema.userTopicState.topicId })
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            eq(schema.userTopicState.mastered, true),
            inArray(schema.userTopicState.topicId, topicIds),
          ),
        );
      for (const s of states) masteredSet.add(s.topicId);
    }

    // Aggregate per standard
    type StdAgg = { standard: string; domain: string; domainName: string; topicCount: number; masteredCount: number };
    const byStandard = new Map<string, StdAgg>();

    for (const t of topicsWithStd) {
      const code = t.standardCode!;
      const parsed = parseStandardCode(code);
      if (!byStandard.has(code)) {
        byStandard.set(code, {
          standard: code,
          domain: parsed?.domain ?? code,
          domainName: parsed?.domainName ?? code,
          topicCount: 0,
          masteredCount: 0,
        });
      }
      const agg = byStandard.get(code)!;
      agg.topicCount++;
      if (masteredSet.has(t.id)) agg.masteredCount++;
    }

    const standardDetails: StandardDetail[] = Array.from(byStandard.values()).map((s) => {
      const percentage = s.topicCount > 0 ? s.masteredCount / s.topicCount : 0;
      return {
        standard: s.standard,
        domain: s.domain,
        domainName: s.domainName,
        topicCount: s.topicCount,
        masteredCount: s.masteredCount,
        percentage,
        classification: classify(percentage),
      };
    });

    // Aggregate per domain (a domain is "mastered" when its standard is proficient)
    const byDomain = new Map<string, { domainName: string; standardCount: number; proficientCount: number }>();
    for (const s of standardDetails) {
      if (!byDomain.has(s.domain)) {
        byDomain.set(s.domain, { domainName: s.domainName, standardCount: 0, proficientCount: 0 });
      }
      const d = byDomain.get(s.domain)!;
      d.standardCount++;
      if (s.classification === "proficient") d.proficientCount++;
    }

    const domainScores: DomainScore[] = Array.from(byDomain.entries()).map(([domain, d]) => {
      const percentage = d.standardCount > 0 ? d.proficientCount / d.standardCount : 0;
      return {
        domain,
        domainName: d.domainName,
        standardCount: d.standardCount,
        masteredCount: d.proficientCount,
        percentage,
        classification: classify(percentage),
      };
    });

    const overallMastery =
      standardDetails.length > 0
        ? standardDetails.filter((s) => s.classification === "proficient").length / standardDetails.length
        : 0;

    return { domainScores, standardDetails, overallMastery };
  }

  /**
   * Generate a progress report combining standards mastery and topics needing focus.
   */
  async function generateProgressReport(userId: string, disciplineId: string): Promise<ProgressReport> {
    const { domainScores, standardDetails, overallMastery } = await getStandardsMastery(userId, disciplineId);

    // Topics to focus: in-progress topics (not yet mastered) in this discipline
    const inProgressStates = await db
      .select({ topicId: schema.userTopicState.topicId })
      .from(schema.userTopicState)
      .where(
        and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.mastered, false),
        ),
      );

    const inProgressIds = inProgressStates.map((s) => s.topicId);
    let topicsToFocus: { topicId: string; topicName: string; standardCode: string | null }[] = [];

    if (inProgressIds.length > 0) {
      const rows = await db
        .select({ id: schema.topics.id, name: schema.topics.name, standardCode: schema.topics.standardCode })
        .from(schema.topics)
        .where(
          and(
            eq(schema.topics.disciplineId, disciplineId),
            inArray(schema.topics.id, inProgressIds),
          ),
        )
        .limit(5);

      topicsToFocus = rows.map((t) => ({ topicId: t.id, topicName: t.name, standardCode: t.standardCode }));
    }

    return {
      disciplineId,
      userId,
      generatedAt: new Date().toISOString(),
      overallMastery,
      domainScores,
      standardDetails,
      topicsToFocus,
    };
  }

  return { getStandardsForTopics, getStandardsMastery, generateProgressReport };
}
