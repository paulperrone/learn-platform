import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  request,
  json,
  seedSubject,
  seedTopic,
  seedPrerequisite,
  seedEncompassing,
  seedAssessmentContent,
  seedInstructionalContent,
} from "../helpers.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("Public API - /api/public", () => {
  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  describe("GET /api/public/subjects", () => {
    it("returns empty list when no subjects exist", async () => {
      const res = await request("/api/public/subjects");
      expect(res.status).toBe(200);
      const body = await json<{ subjects: unknown[] }>(res);
      expect(body.subjects).toEqual([]);
    });

    it("returns subjects without auth", async () => {
      await seedSubject({ id: "math-foundations", name: "Foundational Mathematics", description: "Elementary math", gradeRange: "K-5", topicCount: 3 });
      const res = await request("/api/public/subjects");
      expect(res.status).toBe(200);
      const body = await json<{ subjects: Array<{ id: string; name: string; topicCount: number }> }>(res);
      expect(body.subjects).toHaveLength(1);
      expect(body.subjects[0].id).toBe("math-foundations");
      expect(body.subjects[0].name).toBe("Foundational Mathematics");
      expect(body.subjects[0].topicCount).toBe(3);
    });
  });

  describe("GET /api/public/subjects/:id/topics", () => {
    it("returns 404 for unknown subject", async () => {
      const res = await request("/api/public/subjects/nonexistent/topics");
      expect(res.status).toBe(404);
    });

    it("returns topics ordered by depth", async () => {
      const subject = await seedSubject({ id: "math-foundations" });
      await seedTopic(subject.id, { id: "count-10", name: "Count to 10", depth: 0, gradeLevel: 0, standardCode: "K.CC.4" });
      await seedTopic(subject.id, { id: "add-10", name: "Add Within 10", depth: 1, gradeLevel: 1 });

      const res = await request("/api/public/subjects/math-foundations/topics");
      expect(res.status).toBe(200);
      const body = await json<{ subjectId: string; topics: Array<{ id: string; depth: number }> }>(res);
      expect(body.subjectId).toBe("math-foundations");
      expect(body.topics).toHaveLength(2);
      expect(body.topics[0].id).toBe("count-10");
      expect(body.topics[1].id).toBe("add-10");
      // Should not include content in list view
      expect((body.topics[0] as Record<string, unknown>).problems).toBeUndefined();
    });
  });

  describe("GET /api/public/topics/:id", () => {
    it("returns 404 for unknown topic", async () => {
      const res = await request("/api/public/topics/nonexistent");
      expect(res.status).toBe(404);
    });

    it("returns topic with problems and examples from content tables", async () => {
      const subject = await seedSubject({ id: "math-foundations" });
      await seedTopic(subject.id, {
        id: "add-10",
        name: "Add Within 10",
        gradeLevel: 1,
      });
      await seedAssessmentContent("add-10", {
        id: "p1",
        question: "1+1=?",
        answer: "2",
        difficulty: "easy",
        hintsJson: "[]",
        solution: "1+1=2",
      });
      await seedInstructionalContent("add-10", {
        id: "e1",
        title: "Adding",
        stepsJson: JSON.stringify([{ subgoalLabel: "Step 1", instruction: "Add", work: "1+1", explanation: "equals 2" }]),
      });

      const res = await request("/api/public/topics/add-10");
      expect(res.status).toBe(200);
      const body = await json<{ topic: { id: string; problems: unknown[]; examples: unknown[] } }>(res);
      expect(body.topic.id).toBe("add-10");
      expect(body.topic.problems).toHaveLength(1);
      expect(body.topic.examples).toHaveLength(1);
    });

    it("returns empty arrays when no problems/examples", async () => {
      const subject = await seedSubject({ id: "math-foundations" });
      await seedTopic(subject.id, { id: "empty-topic", gradeLevel: 0 });

      const res = await request("/api/public/topics/empty-topic");
      expect(res.status).toBe(200);
      const body = await json<{ topic: { problems: unknown[]; examples: unknown[] } }>(res);
      expect(body.topic.problems).toEqual([]);
      expect(body.topic.examples).toEqual([]);
    });
  });

  describe("GET /api/public/graph/:subjectId", () => {
    it("returns 404 for unknown subject", async () => {
      const res = await request("/api/public/graph/nonexistent");
      expect(res.status).toBe(404);
    });

    it("returns full graph with topics, prerequisites, and encompassings", async () => {
      const subject = await seedSubject({ id: "math-foundations", name: "Foundational Mathematics" });
      const t1 = await seedTopic(subject.id, { id: "count-10", depth: 0, gradeLevel: 0 });
      const t2 = await seedTopic(subject.id, { id: "add-10", depth: 1, gradeLevel: 1 });
      const t3 = await seedTopic(subject.id, { id: "add-20", depth: 2, gradeLevel: 1 });
      await seedPrerequisite(t1.id, t2.id, 1.0);
      await seedPrerequisite(t2.id, t3.id, 1.0);
      await seedEncompassing(t3.id, t2.id, 0.5);

      const res = await request("/api/public/graph/math-foundations");
      expect(res.status).toBe(200);
      const body = await json<{
        subject: { id: string };
        topics: Array<{ id: string }>;
        prerequisites: Array<{ from: string; to: string }>;
        encompassings: Array<{ parent: string; child: string }>;
      }>(res);
      expect(body.subject.id).toBe("math-foundations");
      expect(body.topics).toHaveLength(3);
      expect(body.prerequisites).toHaveLength(2);
      expect(body.prerequisites[0]).toEqual({ from: "count-10", to: "add-10", strength: 1.0 });
      expect(body.encompassings).toHaveLength(1);
      expect(body.encompassings[0]).toEqual({ parent: "add-20", child: "add-10", weight: 0.5 });
    });
  });

  describe("GET /api/public/schema", () => {
    it("returns API documentation", async () => {
      const res = await request("/api/public/schema");
      expect(res.status).toBe(200);
      const body = await json<{ name: string; endpoints: Array<{ method: string; path: string }> }>(res);
      expect(body.name).toBe("Learn Platform Public API");
      expect(body.endpoints.length).toBeGreaterThanOrEqual(5);
      const paths = body.endpoints.map((e) => e.path);
      expect(paths).toContain("/api/public/subjects");
      expect(paths).toContain("/api/public/topics/:id");
      expect(paths).toContain("/api/public/graph/:subjectId");
      expect(paths).toContain("/api/public/schema");
    });
  });

  describe("CORS", () => {
    it("includes Access-Control-Allow-Origin: * on responses", async () => {
      const res = await request("/api/public/subjects");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("handles CORS preflight", async () => {
      const res = await request("/api/public/subjects", {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
        },
      });
      // Preflight returns 204
      expect(res.status).toBe(204);
      // Allow-Methods header is set
      expect(res.headers.get("access-control-allow-methods")).toBeTruthy();
    });
  });

  describe("Rate Limiting", () => {
    it("includes rate limit headers", async () => {
      const res = await request("/api/public/subjects");
      expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
      expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
      expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();
    });
  });

  describe("Bot Detection", () => {
    it("blocks known LLM scraper bots", async () => {
      const blockedUAs = [
        "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
        "CCBot/2.0 (https://commoncrawl.org/faq/)",
        "ClaudeBot/1.0",
        "anthropic-ai",
        "Bytespider",
      ];

      for (const ua of blockedUAs) {
        const res = await request("/api/public/subjects", {
          headers: { "User-Agent": ua },
        });
        expect(res.status).toBe(403);
        const body = await json<{ error: string }>(res);
        expect(body.error).toContain("Bot access");
      }
    });

    it("allows legitimate browsers and search engines", async () => {
      await seedSubject({ id: "math-foundations" });

      const allowedUAs = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Googlebot/2.1 (+http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; Bingbot/2.0)",
      ];

      for (const ua of allowedUAs) {
        const res = await request("/api/public/subjects", {
          headers: { "User-Agent": ua },
        });
        expect(res.status).toBe(200);
      }
    });
  });
});

describe("robots.txt", () => {
  it("serves robots.txt with crawl directives", async () => {
    const res = await request("/robots.txt");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("User-agent: *");
    expect(text).toContain("Crawl-delay: 2");
    expect(text).toContain("GPTBot");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Sitemap:");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});
